import Link from 'next/link';
import { Card, EmptyState, PageHeader, ScoreBadge, Stat } from '@/components/primitives';
import { getServerClient, requireUser } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { shortDate, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await requireUser();
  const db = getServerClient();

  const [theses, targets, runs] = await Promise.all([
    db.from('acquisition_theses').select('id, name, created_at').eq('user_id', user.id).order('created_at', { ascending: false }),
    db
      .from('targets')
      .select('id, status, algorithm_score, manual_score, created_at, companies(company_number, name, region)')
      .eq('user_id', user.id),
    db
      .from('thesis_runs')
      .select('id, thesis_id, companies_found, candidates, scored, status, started_at, acquisition_theses(name)')
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(5),
  ]);

  // Supabase types embedded to-one relations as arrays; at runtime they are objects.
  const targetRows = (targets.data ?? []) as unknown as TargetRow[];
  const highPriority = targetRows.filter((t) => (t.manual_score ?? t.algorithm_score ?? 0) >= 70);
  const inPipeline = targetRows.filter((t) => !['DISCOVERED', 'REJECTED'].includes(t.status));
  const companiesDiscovered = await countCompanies();

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Find UK businesses worth buying before they are listed for sale."
        action={
          <Link href="/search" className="btn-primary">
            New acquisition search
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 divide-x divide-line rounded border border-line bg-surface lg:grid-cols-4">
        <Stat label="Companies in database" value={companiesDiscovered.toLocaleString('en-GB')} />
        <Stat label="Saved targets" value={targetRows.length} />
        <Stat label="High-priority targets" value={highPriority.length} hint="Score 70 or above" />
        <Stat label="In pipeline" value={inPipeline.length} hint="Past discovery, not rejected" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Active acquisition theses" action={<Link href="/saved-searches" className="text-xs text-accent hover:underline">All searches</Link>}>
          {(theses.data ?? []).length === 0 ? (
            <EmptyState
              title="No acquisition theses yet"
              detail="Describe the kind of business you want to buy and the search will build a candidate list."
              action={
                <Link href="/search" className="btn-primary">
                  Create your first search
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {((theses.data ?? []) as { id: string; name: string; created_at: string }[]).map((thesis) => {
                const run = ((runs.data ?? []) as unknown as RunRow[]).find((r) => r.thesis_id === thesis.id);
                return (
                  <li key={thesis.id} className="px-4 py-2.5">
                    <div className="text-sm font-medium">{thesis.name}</div>
                    <div className="text-xs text-ink-muted">
                      {run
                        ? `${run.companies_found.toLocaleString('en-GB')} companies found · ${run.candidates} candidates · ${run.scored} scored`
                        : 'Not run yet'}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Highest scoring targets" action={<Link href="/targets" className="text-xs text-accent hover:underline">All targets</Link>}>
          {highPriority.length === 0 ? (
            <EmptyState title="No high-priority targets yet" detail="Targets scoring 70 or above appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {highPriority
                .sort((a, b) => (b.manual_score ?? b.algorithm_score ?? 0) - (a.manual_score ?? a.algorithm_score ?? 0))
                .slice(0, 8)
                .map((target) => (
                  <li key={target.id} className="flex items-center gap-3 px-4 py-2">
                    <ScoreBadge score={target.manual_score ?? target.algorithm_score} size="sm" />
                    <Link
                      href={`/targets/${target.companies?.company_number}`}
                      className="min-w-0 flex-1 truncate text-sm text-accent hover:underline"
                    >
                      {target.companies?.name ?? target.companies?.company_number}
                    </Link>
                    <span className="text-xs text-ink-muted">{target.companies?.region ?? '—'}</span>
                    <span className="text-[10px] uppercase tracking-wide text-ink-faint">
                      {titleCase(target.status)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card title="Recently added targets">
          {targetRows.length === 0 ? (
            <EmptyState title="No targets saved yet" />
          ) : (
            <ul className="divide-y divide-line">
              {targetRows
                .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
                .slice(0, 8)
                .map((target) => (
                  <li key={target.id} className="flex items-center gap-3 px-4 py-2">
                    <Link
                      href={`/targets/${target.companies?.company_number}`}
                      className="min-w-0 flex-1 truncate text-sm text-accent hover:underline"
                    >
                      {target.companies?.name ?? target.companies?.company_number}
                    </Link>
                    <span className="text-xs text-ink-muted">{shortDate(target.created_at)}</span>
                  </li>
                ))}
            </ul>
          )}
        </Card>

        <Card title="Recent searches">
          {(runs.data ?? []).length === 0 ? (
            <EmptyState title="No searches run yet" />
          ) : (
            <ul className="divide-y divide-line">
              {((runs.data ?? []) as unknown as RunRow[]).map((run) => (
                <li key={run.id} className="px-4 py-2">
                  <Link href={`/search/${run.id}`} className="text-sm text-accent hover:underline">
                    {run.acquisition_theses?.name ?? 'Untitled thesis'}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {shortDate(run.started_at)} · {titleCase(run.status)} · {run.companies_found} found ·{' '}
                    {run.candidates} candidates · {run.scored} scored
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

interface TargetRow {
  id: string;
  status: string;
  algorithm_score: number | null;
  manual_score: number | null;
  created_at: string;
  companies: { company_number: string; name: string | null; region: string | null } | null;
}

interface RunRow {
  id: string;
  thesis_id: string;
  companies_found: number;
  candidates: number;
  scored: number;
  status: string;
  started_at: string;
  acquisition_theses: { name?: string } | null;
}

async function countCompanies(): Promise<number> {
  try {
    const { count } = await getAdminClient().from('companies').select('id', { count: 'exact', head: true });
    return count ?? 0;
  } catch {
    return 0;
  }
}
