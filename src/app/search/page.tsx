import Link from 'next/link';
import { PageHeader, Card } from '@/components/primitives';
import { getServerClient } from '@/lib/supabase/server';
import { SearchForm } from './search-form';
import { shortDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Search' };

export default async function SearchPage() {
  const db = getServerClient();
  const { data: runs } = await db
    .from('thesis_runs')
    .select('id, status, stage, companies_found, candidates, scored, started_at, acquisition_theses(name)')
    .order('started_at', { ascending: false })
    .limit(8);

  return (
    <>
      <PageHeader
        title="New Acquisition Search"
        subtitle="Describe the business you want to buy. The search builds a candidate universe, then researches and scores the strongest matches."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <SearchForm />
        </div>

        <Card title="Recent runs">
          <ul className="divide-y divide-line">
            {(runs ?? []).length === 0 && (
              <li className="px-4 py-4 text-sm text-ink-muted">No searches have been run yet.</li>
            )}
            {((runs ?? []) as Record<string, unknown>[]).map((run) => {
              const thesis = run.acquisition_theses as { name?: string } | null;
              return (
                <li key={run.id as string} className="px-4 py-2">
                  <Link href={`/search/${run.id}`} className="text-sm font-medium text-accent hover:underline">
                    {thesis?.name ?? 'Untitled thesis'}
                  </Link>
                  <div className="text-xs text-ink-muted">
                    {shortDate(run.started_at as string)} · {String(run.status).toLowerCase()} ·{' '}
                    {String(run.companies_found ?? 0)} found · {String(run.scored ?? 0)} scored
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </>
  );
}
