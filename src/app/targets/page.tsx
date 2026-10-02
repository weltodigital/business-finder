import Link from 'next/link';
import { Card, EmptyState, PageHeader, ScoreBadge, VisibilityBadge } from '@/components/primitives';
import { getServerClient, requireUser } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { money, shortDate, titleCase, yearsOld } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Targets' };

export default async function TargetsPage() {
  const user = await requireUser();

  const { data } = await getServerClient()
    .from('targets')
    .select('id, status, algorithm_score, manual_score, created_at, company_id, companies(company_number, name, region, postcode, incorporation_date)')
    .eq('user_id', user.id);

  const rows = (data ?? []) as unknown as TargetRow[];
  const summaries = await loadSummaries(rows.map((r) => r.company_id));

  const sorted = [...rows].sort(
    (a, b) => (b.manual_score ?? b.algorithm_score ?? -1) - (a.manual_score ?? a.algorithm_score ?? -1),
  );

  return (
    <>
      <PageHeader
        title="Targets"
        subtitle={`${rows.length} saved ${rows.length === 1 ? 'company' : 'companies'}`}
        action={
          <Link href="/search" className="btn-primary">
            New search
          </Link>
        }
      />

      <Card>
        {sorted.length === 0 ? (
          <EmptyState
            title="No targets saved yet"
            detail="Save companies from a search or from the company lookup page."
            action={
              <Link href="/search" className="btn-primary">
                Run a search
              </Link>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Location</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Op. profit</th>
                  <th className="text-right">Age</th>
                  <th>Financial</th>
                  <th>Status</th>
                  <th className="text-right">Score</th>
                  <th className="text-right">Saved</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((target) => {
                  const summary = summaries.get(target.company_id);
                  return (
                    <tr key={target.id} className="hover:bg-surface-sunken">
                      <td>
                        <Link href={`/targets/${target.companies?.company_number}`} className="font-medium text-accent hover:underline">
                          {target.companies?.name ?? target.companies?.company_number}
                        </Link>
                      </td>
                      <td className="text-ink-muted">{target.companies?.region ?? target.companies?.postcode ?? '—'}</td>
                      <td className="num">{summary?.revenue === null || summary === undefined ? <NotDisclosed /> : money(summary.revenue)}</td>
                      <td className="num">
                        {summary?.operatingProfit === null || summary === undefined ? <NotDisclosed /> : money(summary.operatingProfit)}
                      </td>
                      <td className="num">{yearsOld(target.companies?.incorporation_date) ?? '—'}</td>
                      <td>
                        {summary?.visibility ? <VisibilityBadge level={summary.visibility} /> : <span className="text-ink-faint">—</span>}
                      </td>
                      <td className="text-xs">{titleCase(target.status)}</td>
                      <td className="num">
                        <ScoreBadge score={target.manual_score ?? target.algorithm_score} size="sm" />
                        {target.manual_score !== null && (
                          <div className="text-[10px] text-ink-faint">your score</div>
                        )}
                      </td>
                      <td className="num text-xs text-ink-muted">{shortDate(target.created_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function NotDisclosed() {
  return (
    <span className="text-ink-faint" title="Not disclosed in the filed accounts">
      not disclosed
    </span>
  );
}

interface TargetRow {
  id: string;
  status: string;
  algorithm_score: number | null;
  manual_score: number | null;
  created_at: string;
  company_id: string;
  companies: {
    company_number: string;
    name: string | null;
    region: string | null;
    postcode: string | null;
    incorporation_date: string | null;
  } | null;
}

interface SummaryRow {
  revenue: number | null;
  operatingProfit: number | null;
  visibility: 'HIGH' | 'MEDIUM' | 'LOW' | null;
}

async function loadSummaries(companyIds: string[]): Promise<Map<string, SummaryRow>> {
  const map = new Map<string, SummaryRow>();
  if (companyIds.length === 0) return map;

  const { data } = await getAdminClient()
    .from('company_financials_summary')
    .select('company_id, latest_revenue, latest_operating_profit, financial_visibility')
    .in('company_id', companyIds);

  for (const row of (data ?? []) as Record<string, unknown>[]) {
    map.set(row.company_id as string, {
      revenue: row.latest_revenue === null || row.latest_revenue === undefined ? null : Number(row.latest_revenue),
      operatingProfit:
        row.latest_operating_profit === null || row.latest_operating_profit === undefined
          ? null
          : Number(row.latest_operating_profit),
      visibility: (row.financial_visibility as SummaryRow['visibility']) ?? null,
    });
  }

  return map;
}
