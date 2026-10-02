import { getAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';
import { advancedSearchAll } from '@/lib/companies-house/search';
import type { CHAdvancedSearchItem } from '@/lib/companies-house/types';
import { regionFromAddress } from '@/lib/repository/companies';
import { loadThesis } from '@/lib/repository/theses';
import { ingestCompany } from './ingest-company';
import { scoreAndPersist } from './score-company';
import type { AcquisitionThesis } from '@/lib/types';

export interface ThesisRunLimits {
  /** Companies pulled from advanced search. */
  universe?: number;
  /** Companies kept after the cheap filter. */
  candidates?: number;
  /** Companies given full Companies House ingestion and accounts extraction. */
  deepResearch?: number;
}

export interface ThesisRunSummary {
  runId: string;
  companiesFound: number;
  candidates: number;
  researched: number;
  scored: number;
}

const DEFAULT_LIMITS: Required<ThesisRunLimits> = {
  universe: 500,
  candidates: 200,
  deepResearch: 40,
};

/**
 * How long one research batch may run. Serverless functions are killed at
 * five minutes, so a batch stops well short of that and hands the rest of the
 * shortlist to a follow-up job.
 */
const RESEARCH_BUDGET_MS = 180_000;

export interface ThesisSearchResult extends ThesisRunSummary {
  /** Shortlisted company numbers, best first, still to be researched. */
  shortlist: string[];
}

/**
 * Stages 1 and 2 of the funnel from the product spec: a wide, cheap search
 * narrowed to a shortlist. The expensive research on that shortlist happens
 * in {@link researchShortlist}, in batches.
 */
export async function searchThesis(runId: string, limits: ThesisRunLimits = {}): Promise<ThesisSearchResult> {
  const db = getAdminClient();
  const caps = { ...DEFAULT_LIMITS, ...limits };

  const { data: run } = await db.from('thesis_runs').select('*').eq('id', runId).maybeSingle();
  if (!run) throw new Error(`Thesis run ${runId} not found.`);

  const thesis = await loadThesis(run.thesis_id as string);
  if (!thesis) throw new Error(`Thesis ${run.thesis_id} not found.`);

  await db.from('thesis_runs').update({ status: 'PROCESSING', stage: 'search' }).eq('id', runId);

  try {
    // Stage 1 — cheap universe from advanced search.
    const universe = await searchUniverse(thesis, caps.universe);
    const companyIds = await recordUniverse(runId, universe);

    await db
      .from('thesis_runs')
      .update({ stage: 'filtering', companies_found: universe.length })
      .eq('id', runId);

    // Stage 2 — filter on data we already have, at no API cost.
    const candidates = universe
      .map((item) => ({ item, prescore: prescore(item, thesis) }))
      .filter(({ prescore: score }) => score !== null)
      .sort((a, b) => (b.prescore ?? 0) - (a.prescore ?? 0))
      .slice(0, caps.candidates);

    await markStage(runId, candidates.map(({ item }) => companyIds.get(item.company_number)), 'candidate', 'universe');
    await db
      .from('thesis_runs')
      .update({ stage: 'research', candidates: candidates.length, enriched: 0, scored: 0 })
      .eq('id', runId);

    const shortlist = candidates.slice(0, caps.deepResearch).map(({ item }) => item.company_number);
    if (shortlist.length === 0) await completeRun(runId);

    return {
      runId,
      companiesFound: universe.length,
      candidates: candidates.length,
      researched: 0,
      scored: 0,
      shortlist,
    };
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

/**
 * Stage 3 — expensive work on the shortlist only. Researches companies in
 * order until the time budget runs out and returns the ones still to do; the
 * caller queues those as the next batch. The run completes with the last one.
 */
export async function researchShortlist(
  runId: string,
  shortlist: string[],
  budgetMs = RESEARCH_BUDGET_MS,
): Promise<{ researched: number; scored: number; remaining: string[] }> {
  const db = getAdminClient();
  const startedAt = Date.now();

  const { data: run } = await db.from('thesis_runs').select('*').eq('id', runId).maybeSingle();
  if (!run) throw new Error(`Thesis run ${runId} not found.`);

  const thesis = await loadThesis(run.thesis_id as string);
  if (!thesis) throw new Error(`Thesis ${run.thesis_id} not found.`);

  let researched = Number(run.enriched ?? 0);
  let scored = Number(run.scored ?? 0);
  const remaining = [...shortlist];

  try {
    while (remaining.length > 0 && Date.now() - startedAt < budgetMs) {
      const companyNumber = remaining.shift()!;
      try {
        await ingestCompany(companyNumber, { includeAccounts: true, maxDocuments: 4 });
        researched++;

        const result = await scoreAndPersist(companyNumber, thesis);
        if (result) {
          scored++;
          await markStage(runId, [result.dossier.company.id ?? undefined], 'scored');
        }

        await db
          .from('thesis_runs')
          .update({ enriched: researched, scored })
          .eq('id', runId);
      } catch (error) {
        await log({
          level: 'warn',
          scope: 'thesis-run',
          message: 'Company research failed; continuing with the rest of the shortlist',
          companyNumber,
          context: { error: String(error) },
        });
      }
    }

    if (remaining.length === 0) await completeRun(runId);
    return { researched, scored, remaining };
  } catch (error) {
    await failRun(runId, error);
    throw error;
  }
}

async function completeRun(runId: string): Promise<void> {
  await getAdminClient()
    .from('thesis_runs')
    .update({ status: 'COMPLETE', stage: 'complete', finished_at: new Date().toISOString() })
    .eq('id', runId);
}

async function failRun(runId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await getAdminClient()
    .from('thesis_runs')
    .update({ status: 'FAILED', error: message, finished_at: new Date().toISOString() })
    .eq('id', runId);
}

async function searchUniverse(thesis: AcquisitionThesis, limit: number): Promise<CHAdvancedSearchItem[]> {
  const now = new Date();
  const incorporatedTo = thesis.companyAgeMin
    ? isoDate(new Date(now.getFullYear() - thesis.companyAgeMin, now.getMonth(), now.getDate()))
    : undefined;
  const incorporatedFrom = thesis.companyAgeMax
    ? isoDate(new Date(now.getFullYear() - thesis.companyAgeMax, now.getMonth(), now.getDate()))
    : undefined;

  const locations = thesis.geography.locations?.length ? thesis.geography.locations : [undefined];
  const perLocation = Math.max(Math.ceil(limit / locations.length), 50);

  const seen = new Map<string, CHAdvancedSearchItem>();
  for (const location of locations) {
    const { items } = await advancedSearchAll(
      {
        companyStatus: ['active'],
        sicCodes: thesis.sicCodes.length ? thesis.sicCodes : undefined,
        location,
        incorporatedFrom,
        incorporatedTo,
        size: 100,
      },
      perLocation,
    );
    for (const item of items) {
      if (!seen.has(item.company_number)) seen.set(item.company_number, item);
    }
    if (seen.size >= limit) break;
  }

  return Array.from(seen.values()).slice(0, limit);
}

/**
 * Stores the search results as minimal company rows so the run can reference
 * them. No extra Companies House calls are made at this stage.
 */
async function recordUniverse(
  runId: string,
  items: CHAdvancedSearchItem[],
): Promise<Map<string, string>> {
  const db = getAdminClient();
  const ids = new Map<string, string>();
  if (items.length === 0) return ids;

  const chunkSize = 200;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);

    const { data } = await db
      .from('companies')
      .upsert(
        chunk.map((item) => ({
          company_number: item.company_number,
          name: item.company_name ?? null,
          status: item.company_status ?? null,
          company_type: item.company_type ?? null,
          incorporation_date: item.date_of_creation ?? null,
          dissolution_date: item.date_of_cessation ?? null,
          sic_codes: item.sic_codes ?? [],
          registered_address: item.registered_office_address ?? null,
          postcode: item.registered_office_address?.postal_code ?? null,
          region: regionFromAddress(item.registered_office_address ?? null),
          country: item.registered_office_address?.country ?? null,
        })),
        { onConflict: 'company_number', ignoreDuplicates: false },
      )
      .select('id, company_number');

    for (const row of (data ?? []) as { id: string; company_number: string }[]) {
      ids.set(row.company_number, row.id);
    }
  }

  const rows = Array.from(ids.values()).map((companyId) => ({
    run_id: runId,
    company_id: companyId,
    stage_reached: 'universe',
  }));

  for (let i = 0; i < rows.length; i += 500) {
    // ignoreDuplicates: a retried search must not reset companies already scored.
    await db
      .from('thesis_run_companies')
      .upsert(rows.slice(i, i + 500), { onConflict: 'run_id,company_id', ignoreDuplicates: true });
  }

  return ids;
}

async function markStage(
  runId: string,
  companyIds: Array<string | undefined>,
  stage: string,
  onlyFrom?: string,
): Promise<void> {
  const ids = companyIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  const db = getAdminClient();
  for (let i = 0; i < ids.length; i += 200) {
    let query = db
      .from('thesis_run_companies')
      .update({ stage_reached: stage })
      .eq('run_id', runId)
      .in('company_id', ids.slice(i, i + 200));
    if (onlyFrom) query = query.eq('stage_reached', onlyFrom);
    await query;
  }
}

/**
 * Cheap ranking using only the search payload — no extra API calls. Returns
 * null for companies the thesis rules out entirely.
 */
export function prescore(item: CHAdvancedSearchItem, thesis: AcquisitionThesis): number | null {
  if ((item.company_status ?? 'active') !== 'active') return null;

  const name = (item.company_name ?? '').toLowerCase();
  if (thesis.keywordsExclude.some((k) => k && name.includes(k.toLowerCase()))) return null;

  let score = 0;

  if (thesis.sicCodes.length) {
    const matches = (item.sic_codes ?? []).filter((s) => thesis.sicCodes.includes(s)).length;
    if (matches === 0) return null;
    score += matches * 10;
  }

  const age = item.date_of_creation ? yearsSinceIso(item.date_of_creation) : null;
  if (age !== null) {
    if (thesis.companyAgeMin !== null && age < thesis.companyAgeMin) return null;
    if (thesis.companyAgeMax !== null && age > thesis.companyAgeMax) return null;
    score += Math.min(age, 40) / 4;
  }

  if (thesis.keywordsInclude.some((k) => k && name.includes(k.toLowerCase()))) score += 8;

  const address = item.registered_office_address;
  const haystack = [address?.region, address?.locality, address?.postal_code]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if ((thesis.geography.locations ?? []).some((l) => haystack.includes(l.toLowerCase()))) score += 6;

  return score;
}

function yearsSinceIso(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
