import Link from 'next/link';
import { Card, EmptyState, PageHeader, ScoreBadge } from '@/components/primitives';
import { getServerClient, requireUser } from '@/lib/supabase/server';
import { PIPELINE_STATUSES, type PipelineStatus } from '@/lib/types';
import { titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Pipeline' };

const ACTIVE_STATUSES = PIPELINE_STATUSES.filter((status) => status !== 'REJECTED');

export default async function PipelinePage() {
  const user = await requireUser();

  const { data } = await getServerClient()
    .from('targets')
    .select('id, status, algorithm_score, manual_score, companies(company_number, name, region)')
    .eq('user_id', user.id);

  const rows = (data ?? []) as unknown as PipelineRow[];
  const byStatus = new Map<PipelineStatus, PipelineRow[]>();
  for (const status of PIPELINE_STATUSES) byStatus.set(status, []);
  for (const row of rows) byStatus.get(row.status as PipelineStatus)?.push(row);

  const rejected = byStatus.get('REJECTED') ?? [];

  return (
    <>
      <PageHeader title="Pipeline" subtitle={`${rows.length - rejected.length} active, ${rejected.length} rejected`} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Nothing in the pipeline yet"
            detail="Save a target and change its status to move it through the pipeline."
            action={
              <Link href="/search" className="btn-primary">
                Run a search
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {ACTIVE_STATUSES.map((status) => {
            const column = byStatus.get(status) ?? [];
            return (
              <div key={status} className="w-60 shrink-0">
                <div className="card">
                  <div className="card-header">
                    <h2 className="card-title">{titleCase(status)}</h2>
                    <span className="text-xs text-ink-faint tabular">{column.length}</span>
                  </div>
                  <ul className="divide-y divide-line">
                    {column.length === 0 && <li className="px-3 py-3 text-xs text-ink-faint">Empty</li>}
                    {column
                      .sort((a, b) => (b.manual_score ?? b.algorithm_score ?? 0) - (a.manual_score ?? a.algorithm_score ?? 0))
                      .map((target) => (
                        <li key={target.id} className="flex items-center gap-2 px-3 py-2">
                          <ScoreBadge score={target.manual_score ?? target.algorithm_score} size="sm" />
                          <Link
                            href={`/targets/${target.companies?.company_number}`}
                            className="min-w-0 flex-1 truncate text-sm text-accent hover:underline"
                            title={target.companies?.name ?? undefined}
                          >
                            {target.companies?.name ?? target.companies?.company_number}
                          </Link>
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejected.length > 0 && (
        <Card title={`Rejected (${rejected.length})`} className="mt-4">
          <ul className="divide-y divide-line">
            {rejected.map((target) => (
              <li key={target.id} className="px-4 py-2">
                <Link href={`/targets/${target.companies?.company_number}`} className="text-sm text-ink-muted hover:underline">
                  {target.companies?.name ?? target.companies?.company_number}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

interface PipelineRow {
  id: string;
  status: string;
  algorithm_score: number | null;
  manual_score: number | null;
  companies: { company_number: string; name: string | null; region: string | null } | null;
}
