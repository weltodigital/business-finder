import { apiError, json, withUser } from '@/lib/api';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient } from '@/lib/supabase/server';
import { sicDescription } from '@/lib/sic-descriptions';

export const dynamic = 'force-dynamic';

export interface SearchResultRow {
  companyNumber: string;
  name: string | null;
  region: string | null;
  postcode: string | null;
  incorporationDate: string | null;
  sicCodes: string[];
  /** Description of the primary SIC code, for display. */
  industry: string | null;
  status: string | null;
  score: number | null;
  successionSignal: number | null;
  financialQuality: number | null;
  financialVisibility: string | null;
  revenue: number | null;
  operatingProfit: number | null;
  employees: number | null;
  ownerControlled: boolean;
  signals: { type: string; title: string; severity: string }[];
  saved: boolean;
}

/** Powers the results table: score first, with the evidence behind it. */
export const GET = withUser<{ id: string }>(async ({ params, user }) => {
  const owned = await getServerClient()
    .from('thesis_runs')
    .select('id, thesis_id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (owned.error) return apiError(owned.error.message, 500);
  if (!owned.data) return apiError('Run not found.', 404);

  const db = getAdminClient();

  const { data: members } = await db
    .from('thesis_run_companies')
    .select('company_id, stage_reached')
    .eq('run_id', params.id)
    .in('stage_reached', ['candidate', 'scored']);

  const companyIds = ((members ?? []) as { company_id: string }[]).map((m) => m.company_id);
  if (companyIds.length === 0) return json({ results: [] as SearchResultRow[] });

  const [companies, scores, summaries, signals, targets] = await Promise.all([
    db.from('companies').select('id, company_number, name, region, postcode, incorporation_date, sic_codes, status').in('id', companyIds),
    db.from('company_scores').select('*').in('company_id', companyIds),
    db.from('company_financials_summary').select('*').in('company_id', companyIds),
    db.from('signals').select('company_id, signal_type, title, severity').in('company_id', companyIds),
    getServerClient().from('targets').select('company_id').eq('user_id', user.id).in('company_id', companyIds),
  ]);

  const scoreByCompany = new Map<string, Record<string, unknown>>();
  for (const row of (scores.data ?? []) as Record<string, unknown>[]) {
    const key = row.company_id as string;
    const existing = scoreByCompany.get(key);
    // Prefer the score computed for this run's thesis, else the most recent.
    if (
      !existing ||
      row.thesis_id === owned.data.thesis_id ||
      String(row.computed_at) > String(existing.computed_at)
    ) {
      scoreByCompany.set(key, row);
    }
  }

  const summaryByCompany = new Map(
    ((summaries.data ?? []) as Record<string, unknown>[]).map((row) => [row.company_id as string, row]),
  );

  const signalsByCompany = new Map<string, SearchResultRow['signals']>();
  for (const row of (signals.data ?? []) as Record<string, unknown>[]) {
    const key = row.company_id as string;
    const list = signalsByCompany.get(key) ?? [];
    list.push({
      type: row.signal_type as string,
      title: row.title as string,
      severity: row.severity as string,
    });
    signalsByCompany.set(key, list);
  }

  const savedIds = new Set(((targets.data ?? []) as { company_id: string }[]).map((t) => t.company_id));

  const results: SearchResultRow[] = ((companies.data ?? []) as Record<string, unknown>[]).map((company) => {
    const id = company.id as string;
    const score = scoreByCompany.get(id);
    const summary = summaryByCompany.get(id);
    const companySignals = signalsByCompany.get(id) ?? [];
    const primarySic = ((company.sic_codes as string[]) ?? [])[0] ?? null;

    return {
      companyNumber: company.company_number as string,
      name: (company.name as string) ?? null,
      region: (company.region as string) ?? null,
      postcode: (company.postcode as string) ?? null,
      incorporationDate: (company.incorporation_date as string) ?? null,
      sicCodes: (company.sic_codes as string[]) ?? [],
      industry: primarySic ? sicDescription(primarySic) ?? primarySic : null,
      status: (company.status as string) ?? null,
      score: score ? Number(score.total_score) : null,
      successionSignal: score ? Number(score.succession_signal) : null,
      financialQuality: score ? Number(score.financial_quality) : null,
      financialVisibility: (summary?.financial_visibility as string) ?? (score?.financial_visibility as string) ?? null,
      revenue: summary?.latest_revenue === undefined || summary?.latest_revenue === null ? null : Number(summary.latest_revenue),
      operatingProfit:
        summary?.latest_operating_profit === undefined || summary?.latest_operating_profit === null
          ? null
          : Number(summary.latest_operating_profit),
      employees:
        summary?.latest_employee_count === undefined || summary?.latest_employee_count === null
          ? null
          : Number(summary.latest_employee_count),
      ownerControlled: companySignals.some((s) => s.type === 'OWNER_CONTROLLED'),
      signals: companySignals.filter((s) => s.severity === 'positive' || s.severity === 'negative').slice(0, 4),
      saved: savedIds.has(id),
    };
  });

  results.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));
  return json({ results });
});
