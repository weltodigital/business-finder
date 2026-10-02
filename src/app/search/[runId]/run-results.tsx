'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { SearchResultRow } from '@/app/api/runs/[id]/results/route';
import { Card, EmptyState, ErrorNotice, PageHeader, ScoreBadge, VisibilityBadge } from '@/components/primitives';
import { cn, count, money, yearsOld } from '@/lib/utils';

interface RunState {
  id: string;
  status: string;
  stage: string | null;
  companies_found: number;
  candidates: number;
  enriched: number;
  scored: number;
  error: string | null;
}

type SortKey = 'score' | 'revenue' | 'profit' | 'age' | 'ownerAge' | 'growth' | 'incorporated';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Acquisition score' },
  { key: 'revenue', label: 'Revenue' },
  { key: 'profit', label: 'Operating profit' },
  { key: 'age', label: 'Company age' },
  { key: 'ownerAge', label: 'Oldest owner age' },
  { key: 'incorporated', label: 'Incorporation date' },
];

export function RunResults({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunState | null>(null);
  const [results, setResults] = useState<SearchResultRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('score');
  const [savingNumber, setSavingNumber] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [runResponse, resultsResponse] = await Promise.all([
      fetch(`/api/runs/${runId}`),
      fetch(`/api/runs/${runId}/results`),
    ]);

    const runPayload = await runResponse.json().catch(() => ({}));
    if (!runResponse.ok) throw new Error(runPayload.error ?? 'Could not load the run.');
    setRun(runPayload.run as RunState);

    const resultsPayload = await resultsResponse.json().catch(() => ({}));
    if (resultsResponse.ok) setResults((resultsPayload.results ?? []) as SearchResultRow[]);

    return runPayload.run as RunState;
  }, [runId]);

  // The job queue has no external scheduler in the MVP: while a run is
  // outstanding this page drives it and polls for progress.
  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const current = await load();
        if (cancelled) return;

        if (current.status === 'PENDING' || current.status === 'PROCESSING') {
          await fetch('/api/jobs/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 1 }),
          }).catch(() => undefined);
          if (!cancelled) setTimeout(tick, 4000);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    void tick();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const sorted = useMemo(() => sortResults(results, sort), [results, sort]);
  const highPriority = results.filter((r) => (r.score ?? 0) >= 70).length;

  async function saveTarget(companyNumber: string) {
    setSavingNumber(companyNumber);
    try {
      await fetch('/api/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyNumber, status: 'SHORTLISTED' }),
      });
      setResults((current) =>
        current.map((row) => (row.companyNumber === companyNumber ? { ...row, saved: true } : row)),
      );
    } finally {
      setSavingNumber(null);
    }
  }

  return (
    <>
      <PageHeader
        title={
          run && run.status === 'COMPLETE'
            ? `${run.companies_found.toLocaleString('en-GB')} companies found`
            : 'Search running'
        }
        subtitle={
          run
            ? `${run.candidates} candidates · ${run.scored} researched and scored · ${highPriority} high-priority`
            : undefined
        }
        action={
          <Link href="/search" className="btn-secondary">
            New search
          </Link>
        }
      />

      {error && <ErrorNotice title="Could not load the search" detail={error} />}
      {run?.error && <ErrorNotice title="The search failed" detail={run.error} />}

      {run && (run.status === 'PENDING' || run.status === 'PROCESSING') && (
        <Card className="mb-4">
          <div className="flex items-center gap-3 px-4 py-3">
            <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />
            <div className="text-sm">
              <span className="font-medium">{stageLabel(run.stage)}</span>
              <span className="text-ink-muted">
                {' '}
                · {run.companies_found} found · {run.candidates} candidates · {run.scored} scored
              </span>
            </div>
            <p className="ml-auto text-xs text-ink-muted">
              Keep this tab open — research runs while the page is in front of you.
            </p>
          </div>
        </Card>
      )}

      <Card
        title={`Results (${results.length})`}
        action={
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            Sort by
            <select className="input w-44 py-1" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {sorted.length === 0 ? (
          <EmptyState
            title={run?.status === 'COMPLETE' ? 'No companies matched this thesis' : 'Researching companies…'}
            detail={
              run?.status === 'COMPLETE'
                ? 'Try widening the location, the SIC groups or the minimum company age.'
                : 'Results appear here as each company is researched and scored.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Industry</th>
                  <th className="text-right">Revenue</th>
                  <th className="text-right">Op. profit</th>
                  <th className="text-right">Age</th>
                  <th>Ownership</th>
                  <th className="text-right" title="Oldest active director or owner">Oldest owner</th>
                  <th className="text-right">Succession</th>
                  <th className="text-right">Financial</th>
                  <th className="text-right">Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.companyNumber} className="hover:bg-surface-sunken">
                    <td>
                      <Link href={`/targets/${row.companyNumber}`} className="font-medium text-accent hover:underline">
                        {row.name ?? row.companyNumber}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {row.signals.map((signal) => (
                          <span
                            key={signal.type}
                            className={cn(
                              'rounded px-1 py-0.5 text-[10px]',
                              signal.severity === 'positive' ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad',
                            )}
                          >
                            {signal.title}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-ink-muted">{row.region ?? row.postcode ?? '—'}</td>
                    <td className="text-ink-muted" title={row.sicCodes.length ? `SIC ${row.sicCodes.join(', ')}` : undefined}>
                      {row.industry ?? '—'}
                    </td>
                    <td className="num">{row.revenue === null ? <NotDisclosed /> : money(row.revenue)}</td>
                    <td className="num">
                      {row.operatingProfit === null ? <NotDisclosed /> : money(row.operatingProfit)}
                    </td>
                    <td className="num">{yearsOld(row.incorporationDate) ?? '—'}</td>
                    <td className="text-xs">
                      {row.ownerControlled ? (
                        <span className="text-good">Owner controlled</span>
                      ) : (
                        <span className="text-ink-faint">Not owner controlled</span>
                      )}
                    </td>
                    <td className="num">{row.oldestOwnerAge ?? '—'}</td>
                    <td className="num">{row.successionSignal === null ? '—' : `${row.successionSignal}/15`}</td>
                    <td className="num">
                      <div>{row.financialQuality === null ? '—' : `${row.financialQuality}/30`}</div>
                      {row.financialVisibility && (
                        <div className="mt-0.5">
                          <VisibilityBadge level={row.financialVisibility as 'HIGH' | 'MEDIUM' | 'LOW'} />
                        </div>
                      )}
                    </td>
                    <td className="num">
                      <ScoreBadge score={row.score} size="sm" />
                    </td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`/targets/${row.companyNumber}`} className="text-xs text-accent hover:underline">
                        View target
                      </Link>
                      {!row.saved && (
                        <button
                          className="ml-2 text-xs text-ink-muted hover:text-ink hover:underline"
                          disabled={savingNumber === row.companyNumber}
                          onClick={() => void saveTarget(row.companyNumber)}
                        >
                          {savingNumber === row.companyNumber ? 'Saving…' : 'Save'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="mt-3 text-xs text-ink-muted">
        Employees are shown where the accounts disclose them. {count(results.filter((r) => r.employees !== null).length)}{' '}
        of {count(results.length)} companies disclosed an employee count.
      </p>
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

function stageLabel(stage: string | null): string {
  switch (stage) {
    case 'queued':
      return 'Queued';
    case 'search':
      return 'Searching Companies House';
    case 'filtering':
      return 'Filtering candidates';
    case 'research':
      return 'Researching and scoring shortlist';
    case 'complete':
      return 'Complete';
    default:
      return 'Working';
  }
}

function sortResults(rows: SearchResultRow[], key: SortKey): SearchResultRow[] {
  const sorted = [...rows];
  const nullsLast = (value: number | null) => (value === null ? Number.NEGATIVE_INFINITY : value);

  switch (key) {
    case 'revenue':
      return sorted.sort((a, b) => nullsLast(b.revenue) - nullsLast(a.revenue));
    case 'profit':
      return sorted.sort((a, b) => nullsLast(b.operatingProfit) - nullsLast(a.operatingProfit));
    case 'ownerAge':
      return sorted.sort((a, b) => (b.oldestOwnerAge ?? -1) - (a.oldestOwnerAge ?? -1));
    case 'age':
      return sorted.sort((a, b) => (yearsOld(b.incorporationDate) ?? -1) - (yearsOld(a.incorporationDate) ?? -1));
    case 'incorporated':
      return sorted.sort((a, b) => (b.incorporationDate ?? '').localeCompare(a.incorporationDate ?? ''));
    case 'growth':
    case 'score':
    default:
      return sorted.sort((a, b) => nullsLast(b.score) - nullsLast(a.score));
  }
}
