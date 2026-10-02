import { env } from '@/lib/env';
import { log } from '@/lib/logger';
import { getAdminClient } from '@/lib/supabase/admin';
import { fetchDocument, getDocumentMetadata } from '@/lib/companies-house/documents';
import { documentIdFromFiling, getFilingHistory, selectAccountsFilings } from '@/lib/companies-house/filings';
import type { CHFilingHistoryItem } from '@/lib/companies-house/types';
import { buildFinancialPeriods } from './normalise';
import { summariseFinancials } from '@/lib/financials/analytics';
import {
  loadFactsForCompany,
  replaceFactsForDocument,
  replaceFinancialPeriods,
  saveFinancialSummary,
} from '@/lib/repository/financials';
import { FIXTURES } from '@/lib/fixtures';
import { dossierFromFixture } from '@/lib/fixtures/dossier';
import type { ExtractedFact } from './metrics';
import { parseXbrl } from './ixbrl';
import { extractPdfText } from './pdf';
import { extractFactsFromText } from './text-extract';
import { extractFactsWithLlm } from './llm';
import { validateFacts } from './validate';

export interface DocumentExtractionOutcome {
  documentId: string;
  periodEnd: string | null;
  status: 'complete' | 'needs_review' | 'failed' | 'not_available';
  method: string | null;
  factCount: number;
  error?: string;
}

export interface AccountsPipelineResult {
  companyNumber: string;
  documentsConsidered: number;
  documents: DocumentExtractionOutcome[];
  periodsBuilt: number;
  financialVisibility: string;
}

const DEFAULT_MAX_DOCUMENTS = 5;
/** Below this, text heuristics have clearly failed and the LLM is worth its cost. */
const MIN_USEFUL_FACTS = 4;

/**
 * Retrieves accounts filings, extracts financial facts using the cheapest
 * reliable method available, validates them, and rebuilds the company's
 * financial history.
 *
 * Order of preference: XBRL/iXBRL tagged data → PDF text heuristics → LLM.
 */
export async function runAccountsPipeline(
  companyNumber: string,
  companyId: string,
  options: { maxDocuments?: number; forceRefresh?: boolean; allowLlm?: boolean } = {},
): Promise<AccountsPipelineResult> {
  if (env.useFixtures) return runFixtureAccounts(companyNumber, companyId);

  const maxDocuments = options.maxDocuments ?? DEFAULT_MAX_DOCUMENTS;
  const filings = await getFilingHistory(companyNumber, { forceRefresh: options.forceRefresh });
  const accountsFilings = selectAccountsFilings(filings).slice(0, maxDocuments);

  const outcomes: DocumentExtractionOutcome[] = [];
  for (const filing of accountsFilings) {
    outcomes.push(
      await extractFilingDocument(companyNumber, companyId, filing, options.allowLlm !== false),
    );
  }

  const facts = await loadFactsForCompany(companyId);
  const periods = buildFinancialPeriods(facts);
  const summary = summariseFinancials(periods);

  await replaceFinancialPeriods(companyId, periods);
  await saveFinancialSummary(companyId, summary);

  return {
    companyNumber,
    documentsConsidered: accountsFilings.length,
    documents: outcomes,
    periodsBuilt: periods.length,
    financialVisibility: summary.financialVisibility,
  };
}

async function extractFilingDocument(
  companyNumber: string,
  companyId: string,
  filing: CHFilingHistoryItem,
  allowLlm: boolean,
): Promise<DocumentExtractionOutcome> {
  const db = getAdminClient();
  const documentId = documentIdFromFiling(filing);
  const madeUpTo = filing.description_values?.made_up_date ?? null;

  if (!documentId) {
    return { documentId: '', periodEnd: madeUpTo, status: 'not_available', method: null, factCount: 0 };
  }

  const { data: existing } = await db
    .from('financial_documents')
    .select('id, extraction_status')
    .eq('company_id', companyId)
    .eq('document_id', documentId)
    .maybeSingle();

  // Already extracted successfully — this is the main defence against
  // re-downloading and re-parsing the same accounts on every run.
  if (existing && existing.extraction_status === 'complete') {
    const { count } = await db
      .from('financial_facts')
      .select('id', { count: 'exact', head: true })
      .eq('financial_document_id', existing.id);
    return {
      documentId,
      periodEnd: madeUpTo,
      status: 'complete',
      method: 'cached',
      factCount: count ?? 0,
    };
  }

  const { data: documentRow, error: upsertError } = await db
    .from('financial_documents')
    .upsert(
      {
        company_id: companyId,
        document_id: documentId,
        document_type: filing.type ?? null,
        accounting_period_end: madeUpTo,
        source_url: filing.links?.document_metadata ?? null,
        extraction_status: 'processing',
        raw_metadata: filing,
      },
      { onConflict: 'company_id,document_id' },
    )
    .select('id')
    .single();

  if (upsertError || !documentRow) {
    return {
      documentId,
      periodEnd: madeUpTo,
      status: 'failed',
      method: null,
      factCount: 0,
      error: upsertError?.message ?? 'Could not record the document.',
    };
  }

  const financialDocumentId = documentRow.id as string;

  try {
    const metadata = await getDocumentMetadata(documentId);
    const document = await fetchDocument(documentId, metadata);

    if (!document) {
      await markDocument(financialDocumentId, 'not_available', null, 'Document content unavailable.');
      return { documentId, periodEnd: madeUpTo, status: 'not_available', method: null, factCount: 0 };
    }

    const { facts, method, notes } = await extractFacts(document, {
      companyName: filing.description ?? undefined,
      periodEnd: madeUpTo,
      allowLlm,
    });

    const validation = validateFacts(facts);
    const status = facts.length === 0 ? 'not_available' : validation.status === 'ok' ? 'complete' : 'needs_review';

    await replaceFactsForDocument(companyId, financialDocumentId, facts);
    await db
      .from('financial_documents')
      .update({
        file_type: document.format,
        content_length: document.bytes.length,
        retrieved_at: new Date().toISOString(),
        extraction_status: status,
        extraction_method: method,
        extraction_error: validation.issues.length
          ? validation.issues.map((i) => i.message).join(' ')
          : (notes ?? null),
        source_url: document.sourceUrl,
      })
      .eq('id', financialDocumentId);

    if (status === 'needs_review') {
      await log({
        level: 'warn',
        scope: 'accounts-extraction',
        message: 'Extracted accounts failed validation and need review',
        companyNumber,
        context: { documentId, issues: validation.issues },
      });
    }

    return { documentId, periodEnd: madeUpTo, status, method, factCount: facts.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markDocument(financialDocumentId, 'failed', null, message);
    await log({
      level: 'error',
      scope: 'accounts-extraction',
      message: 'Accounts extraction failed',
      companyNumber,
      context: { documentId, error: message },
    });
    return { documentId, periodEnd: madeUpTo, status: 'failed', method: null, factCount: 0, error: message };
  }
}

interface ExtractionContext {
  companyName?: string;
  periodEnd: string | null;
  allowLlm: boolean;
}

async function extractFacts(
  document: { format: string; text?: string; bytes: Buffer },
  context: ExtractionContext,
): Promise<{ facts: ExtractedFact[]; method: string; notes: string | null }> {
  // 1. Tagged data, where it exists, is exact and free.
  if (document.text && (document.format === 'xhtml' || document.format === 'xml')) {
    const parsed = parseXbrl(document.text);
    if (parsed.facts.length > 0) {
      return { facts: parsed.facts, method: parsed.method, notes: null };
    }
  }

  // 2. Fall back to reading the statements as text.
  const text =
    document.format === 'pdf' ? (await extractPdfText(document.bytes)).text : (document.text ?? '');

  if (text.trim().length > 0) {
    const { facts } = extractFactsFromText(text, { periodEnd: context.periodEnd });
    if (facts.length >= MIN_USEFUL_FACTS) {
      return { facts, method: 'pdf_text', notes: null };
    }

    // 3. Only now is the LLM worth its cost.
    if (context.allowLlm) {
      const llm = await extractFactsWithLlm(text, {
        companyName: context.companyName,
        periodEnd: context.periodEnd,
      });
      if (llm && llm.facts.length > 0) {
        return { facts: llm.facts, method: 'llm', notes: llm.notes };
      }
    }

    return { facts, method: 'pdf_text', notes: null };
  }

  return { facts: [], method: 'none', notes: 'No readable content in the document.' };
}

async function markDocument(
  id: string,
  status: string,
  method: string | null,
  error: string | null,
): Promise<void> {
  await getAdminClient()
    .from('financial_documents')
    .update({ extraction_status: status, extraction_method: method, extraction_error: error })
    .eq('id', id);
}

/** Development mode: build the financial history straight from fixture data. */
async function runFixtureAccounts(
  companyNumber: string,
  companyId: string,
): Promise<AccountsPipelineResult> {
  const fixture = FIXTURES[companyNumber];
  const periods = fixture ? dossierFromFixture(fixture).periods : [];
  const summary = summariseFinancials(periods);

  await replaceFinancialPeriods(companyId, periods);
  await saveFinancialSummary(companyId, summary);

  return {
    companyNumber,
    documentsConsidered: fixture?.filings.filter((f) => f.category === 'accounts').length ?? 0,
    documents: [],
    periodsBuilt: periods.length,
    financialVisibility: summary.financialVisibility,
  };
}
