import Link from 'next/link';
import { Card, EmptyState, PageHeader } from '@/components/primitives';
import { getServerClient, requireUser } from '@/lib/supabase/server';
import { rowToThesis } from '@/lib/repository/theses';
import { money, shortDate } from '@/lib/utils';
import { RerunButton } from './rerun-button';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Saved Searches' };

export default async function SavedSearchesPage() {
  const user = await requireUser();
  const db = getServerClient();

  const [theses, runs] = await Promise.all([
    db.from('acquisition_theses').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
    db.from('thesis_runs').select('id, thesis_id, status, started_at, companies_found, scored').eq('user_id', user.id),
  ]);

  const runsByThesis = new Map<string, RunRow[]>();
  for (const run of (runs.data ?? []) as RunRow[]) {
    const list = runsByThesis.get(run.thesis_id) ?? [];
    list.push(run);
    runsByThesis.set(run.thesis_id, list);
  }

  const rows = ((theses.data ?? []) as Record<string, unknown>[]).map(rowToThesis);

  return (
    <>
      <PageHeader
        title="Saved Searches"
        subtitle="Each saved search stores the full acquisition thesis and can be re-run at any time."
        action={
          <Link href="/search" className="btn-primary">
            New search
          </Link>
        }
      />

      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No saved searches" detail="Every search you run is saved here automatically." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {rows.map((thesis) => {
            const thesisRuns = (runsByThesis.get(thesis.id!) ?? []).sort((a, b) =>
              (b.started_at ?? '').localeCompare(a.started_at ?? ''),
            );
            const latest = thesisRuns[0];

            return (
              <Card key={thesis.id} title={thesis.name} action={<RerunButton thesisId={thesis.id!} />}>
                <dl className="divide-y divide-line text-sm">
                  <Row label="Industries" value={thesis.industries.join(', ') || '—'} />
                  <Row label="SIC codes" value={thesis.sicCodes.join(', ') || 'any'} />
                  <Row label="Locations" value={(thesis.geography.locations ?? []).join(', ') || 'anywhere in the UK'} />
                  <Row
                    label="Revenue"
                    value={`${thesis.revenueMin ? money(thesis.revenueMin) : 'any'} – ${thesis.revenueMax ? money(thesis.revenueMax) : 'any'}`}
                  />
                  <Row
                    label="Employees"
                    value={
                      thesis.employeeMin || thesis.employeeMax
                        ? `${thesis.employeeMin ?? 'any'} – ${thesis.employeeMax ?? 'any'}`
                        : 'any'
                    }
                  />
                  <Row label="Minimum age" value={thesis.companyAgeMin ? `${thesis.companyAgeMin} years` : 'any'} />
                  <Row label="Owner-managed" value={thesis.ownerManaged ? 'preferred' : 'not required'} />
                  <Row label="Keywords" value={thesis.keywordsInclude.join(', ') || '—'} />
                  <Row label="Excluded" value={thesis.keywordsExclude.join(', ') || '—'} />
                </dl>

                <div className="border-t border-line px-4 py-2 text-xs text-ink-muted">
                  {latest ? (
                    <Link href={`/search/${latest.id}`} className="text-accent hover:underline">
                      Last run {shortDate(latest.started_at)} · {latest.companies_found} found · {latest.scored} scored
                    </Link>
                  ) : (
                    'Never run'
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 px-4 py-1.5">
      <dt className="w-32 shrink-0 text-ink-muted">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  );
}

interface RunRow {
  id: string;
  thesis_id: string;
  status: string;
  started_at: string;
  companies_found: number;
  scored: number;
}
