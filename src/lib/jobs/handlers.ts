import { getAdminClient } from '@/lib/supabase/admin';
import { runAccountsPipeline } from '@/lib/accounts/pipeline';
import { enrichCompany } from '@/lib/enrichment';
import { analyseTarget } from '@/lib/ai/analyse-target';
import { ingestCompany } from '@/lib/pipeline/ingest-company';
import { scoreAndPersist } from '@/lib/pipeline/score-company';
import { researchShortlist, searchThesis } from '@/lib/pipeline/run-thesis';
import { enqueueJob } from './queue';
import { loadThesis } from '@/lib/repository/theses';
import type { JobHandler } from './queue';

function requireCompanyNumber(payload: Record<string, unknown>): string {
  const companyNumber = payload.companyNumber;
  if (typeof companyNumber !== 'string' || !companyNumber) {
    throw new Error('Job payload is missing companyNumber.');
  }
  return companyNumber;
}

export const jobHandlers: Record<string, JobHandler> = {
  company_import: async (job) => {
    const companyNumber = requireCompanyNumber(job.payload);
    const result = await ingestCompany(companyNumber, {
      forceRefresh: Boolean(job.payload.forceRefresh),
      includeAccounts: job.payload.includeAccounts !== false,
      includeAppointments: Boolean(job.payload.includeAppointments),
    });
    if (!result) throw new Error(`Company ${companyNumber} not found at Companies House.`);
    return { companyId: result.companyId, filings: result.filings };
  },

  accounts_retrieval: async (job) => runAccountsExtraction(job.payload),
  accounts_extraction: async (job) => runAccountsExtraction(job.payload),

  financial_validation: async (job) => {
    const companyNumber = requireCompanyNumber(job.payload);
    const { data } = await getAdminClient()
      .from('financial_periods')
      .select('period_end, validation_status, validation_issues')
      .eq('company_id', await companyIdFor(companyNumber));
    const needsReview = (data ?? []).filter(
      (row) => (row as { validation_status?: string }).validation_status === 'needs_review',
    );
    return { periods: (data ?? []).length, needsReview: needsReview.length };
  },

  company_enrichment: async (job) => ({ ...(await enrichCompany(requireCompanyNumber(job.payload))) }),
  website_enrichment: async (job) => ({ ...(await enrichCompany(requireCompanyNumber(job.payload))) }),

  ai_analysis: async (job) => {
    const companyNumber = requireCompanyNumber(job.payload);
    const thesisId = job.payload.thesisId as string | undefined;
    const thesis = thesisId ? await loadThesis(thesisId) : null;

    const scored = await scoreAndPersist(companyNumber, thesis);
    if (!scored) throw new Error(`No stored data for ${companyNumber}; import it first.`);

    const { analysis, model } = await analyseTarget({ ...scored, thesis });

    const db = getAdminClient();
    await db
      .from('targets')
      .update({ ai_analysis: analysis, ai_analysed_at: new Date().toISOString(), ai_model: model })
      .eq('company_id', scored.dossier.company.id!)
      .eq('user_id', job.user_id ?? '');

    return { assessment: analysis.overall_assessment, model };
  },

  // A run is a chain of jobs: the first searches and shortlists, each later
  // one researches a time-boxed batch and queues the next with what is left.
  thesis_run: async (job) => {
    if (!job.run_id) throw new Error('Thesis run job is missing run_id.');

    let shortlist = job.payload.shortlist as string[] | undefined;
    if (!Array.isArray(shortlist)) {
      const search = await searchThesis(job.run_id, (job.payload.limits as Record<string, number>) ?? {});
      shortlist = search.shortlist;
      if (shortlist.length === 0) return { ...search };
    }

    const batch = await researchShortlist(job.run_id, shortlist);
    if (batch.remaining.length > 0) {
      await enqueueJob('thesis_run', {
        runId: job.run_id,
        userId: job.user_id,
        payload: { shortlist: batch.remaining },
        priority: 10,
      });
    }
    return { researched: batch.researched, scored: batch.scored, remaining: batch.remaining.length };
  },
};

async function runAccountsExtraction(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const companyNumber = requireCompanyNumber(payload);
  const companyId = await companyIdFor(companyNumber);
  const result = await runAccountsPipeline(companyNumber, companyId, {
    forceRefresh: Boolean(payload.forceRefresh),
    maxDocuments: typeof payload.maxDocuments === 'number' ? payload.maxDocuments : undefined,
    allowLlm: payload.allowLlm !== false,
  });
  return { ...result };
}

async function companyIdFor(companyNumber: string): Promise<string> {
  const { data } = await getAdminClient()
    .from('companies')
    .select('id')
    .eq('company_number', companyNumber)
    .maybeSingle();
  if (!data) throw new Error(`Company ${companyNumber} has not been imported yet.`);
  return data.id as string;
}
