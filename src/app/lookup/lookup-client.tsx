'use client';

import { useState } from 'react';
import type { CompanyDossier } from '@/lib/types';
import type { Signal } from '@/lib/signals';
import type { ScoreResult } from '@/lib/scoring';
import type { AccountsPipelineResult } from '@/lib/accounts/pipeline';
import { Card, ErrorNotice, Missing, ScoreBadge, VisibilityBadge } from '@/components/primitives';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { FinancialHistory, FinancialTrend } from '@/components/financials';
import { SignalList } from '@/components/signals';
import { shortDate, titleCase, yearsOld } from '@/lib/utils';

interface CompanyResponse {
  dossier: CompanyDossier;
  signals: Signal[];
  score: ScoreResult;
}

export function LookupClient() {
  const [companyNumber, setCompanyNumber] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompanyResponse | null>(null);
  const [accounts, setAccounts] = useState<AccountsPipelineResult | null>(null);

  async function call(path: string, init?: RequestInit) {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
    return payload;
  }

  async function refresh(number: string) {
    const response = await fetch(`/api/company/${number}`);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? 'Could not load the stored company data.');
    setData(payload as CompanyResponse);
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const number = companyNumber.trim();

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void run('import', async () => {
              await call(`/api/company/${number}/ingest`, {
                body: JSON.stringify({ includeAccounts: true, includeAppointments: true }),
              });
              await refresh(number);
              setAccounts(null);
            });
          }}
        >
          <div className="w-56">
            <label className="label" htmlFor="company-number">
              Company number
            </label>
            <input
              id="company-number"
              className="input mt-1 font-mono"
              placeholder="01234567"
              value={companyNumber}
              onChange={(e) => setCompanyNumber(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-primary" disabled={!number || busy !== null}>
            {busy === 'import' ? 'Importing…' : 'Import from Companies House'}
          </button>

          <button
            type="button"
            className="btn-secondary"
            disabled={!number || busy !== null}
            onClick={() => void run('load', () => refresh(number))}
          >
            Load stored data
          </button>
        </form>

        <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
          Import retrieves the profile, officers, PSCs, filing history, charges and insolvency status, then runs the
          accounts extraction pipeline. Cached Companies House responses are reused where they are still fresh.
        </p>
      </Card>

      {error && <ErrorNotice title="Something went wrong" detail={error} />}

      {data && (
        <>
          <CompanyHeader data={data} />

          <div className="flex flex-wrap gap-2">
            <ActionButton
              label="Re-run financial extraction"
              busy={busy === 'accounts'}
              disabled={busy !== null}
              onClick={() =>
                void run('accounts', async () => {
                  const result = (await call(`/api/company/${number}/accounts`, {
                    body: JSON.stringify({ forceRefresh: true }),
                  })) as AccountsPipelineResult;
                  setAccounts(result);
                  await refresh(number);
                })
              }
            />
            <ActionButton
              label="Enrich from website"
              busy={busy === 'enrich'}
              disabled={busy !== null}
              onClick={() =>
                void run('enrich', async () => {
                  await call(`/api/company/${number}/enrich`);
                  await refresh(number);
                })
              }
            />
            <ActionButton
              label="Recalculate score"
              busy={busy === 'score'}
              disabled={busy !== null}
              onClick={() =>
                void run('score', async () => {
                  await call(`/api/company/${number}/score`);
                  await refresh(number);
                })
              }
            />
            <ActionButton
              label="Save as target"
              busy={busy === 'target'}
              disabled={busy !== null}
              onClick={() =>
                void run('target', async () => {
                  await call('/api/targets', { body: JSON.stringify({ companyNumber: number }) });
                })
              }
            />
          </div>

          {accounts && <ExtractionReport result={accounts} />}

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <Card title="Financial history">
                <FinancialHistory periods={data.dossier.periods} />
              </Card>
              <Card title="Ownership and directors">
                <Ownership dossier={data.dossier} />
              </Card>
              <Card title="Filing history">
                <Filings dossier={data.dossier} />
              </Card>
            </div>

            <div className="space-y-4">
              <Card title="Acquisition score">
                <ScoreBreakdown score={data.score} />
              </Card>
              <Card title="Financial trend">
                <FinancialTrend summary={data.dossier.financials} />
              </Card>
              <Card title="Signals">
                <SignalList signals={data.signals} />
              </Card>
              <Card title="Charges">
                <Charges dossier={data.dossier} />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ActionButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button className="btn-secondary" disabled={disabled} onClick={onClick}>
      {busy ? 'Working…' : label}
    </button>
  );
}

function CompanyHeader({ data }: { data: CompanyResponse }) {
  const c = data.dossier.company;
  const age = yearsOld(c.incorporationDate);

  return (
    <Card>
      <div className="flex flex-wrap items-start gap-4 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{c.name ?? c.companyNumber}</h2>
            <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
              {titleCase(c.status)}
            </span>
            <VisibilityBadge level={data.dossier.financials.financialVisibility} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            <span className="font-mono">{c.companyNumber}</span>
            {' · '}
            {c.region ?? c.postcode ?? 'location unknown'}
            {' · '}
            {age === null ? 'age unknown' : `${age} years old`}
            {' · '}
            SIC {c.sicCodes.join(', ') || 'none'}
          </p>
          {c.website && (
            <a href={c.website} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-sm text-accent underline">
              {c.website}
            </a>
          )}
        </div>
        <div className="text-right">
          <ScoreBadge score={data.score.total} size="lg" />
          <div className="mt-1 text-[11px] text-ink-faint">acquisition score</div>
        </div>
      </div>
    </Card>
  );
}

function ExtractionReport({ result }: { result: AccountsPipelineResult }) {
  return (
    <Card title="Accounts extraction">
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Document</th>
              <th>Period end</th>
              <th>Status</th>
              <th>Method</th>
              <th className="text-right">Facts</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {result.documents.length === 0 && (
              <tr>
                <td colSpan={6} className="text-ink-muted">
                  No accounts documents were available for extraction.
                </td>
              </tr>
            )}
            {result.documents.map((doc) => (
              <tr key={doc.documentId || doc.periodEnd}>
                <td className="font-mono text-xs">{doc.documentId || '—'}</td>
                <td>{shortDate(doc.periodEnd)}</td>
                <td className={doc.status === 'complete' ? 'text-good' : doc.status === 'needs_review' ? 'text-warn' : 'text-bad'}>
                  {titleCase(doc.status)}
                </td>
                <td>{doc.method ?? '—'}</td>
                <td className="num">{doc.factCount}</td>
                <td className="text-xs text-ink-muted">{doc.error ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-3 py-2 text-xs text-ink-muted">
        {result.periodsBuilt} accounting {result.periodsBuilt === 1 ? 'period' : 'periods'} built · financial
        visibility {result.financialVisibility}
      </p>
    </Card>
  );
}

function Ownership({ dossier }: { dossier: CompanyDossier }) {
  return (
    <div className="grid gap-0 md:grid-cols-2">
      <div className="border-line md:border-r">
        <h3 className="border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Directors
        </h3>
        <ul className="divide-y divide-line">
          {dossier.directors.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-muted">No officers recorded.</li>
          )}
          {dossier.directors.map((director, index) => (
            <li key={`${director.name}-${index}`} className="px-4 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{director.name}</span>
                {director.resignedOn && (
                  <span className="text-[10px] uppercase tracking-wide text-ink-faint">resigned</span>
                )}
              </div>
              <div className="text-xs text-ink-muted">
                {titleCase(director.role)} · appointed {shortDate(director.appointedOn)}
                {director.resignedOn ? ` · resigned ${shortDate(director.resignedOn)}` : ''}
                {director.occupation ? ` · ${director.occupation}` : ''}
              </div>
              {director.otherAppointments ? (
                <div className="text-xs text-ink-faint">
                  {director.otherAppointments} appointment{director.otherAppointments === 1 ? '' : 's'} on record
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
          Persons with significant control
        </h3>
        <ul className="divide-y divide-line">
          {dossier.pscs.length === 0 && (
            <li className="px-4 py-3 text-sm text-ink-muted">No PSCs recorded.</li>
          )}
          {dossier.pscs.map((psc, index) => (
            <li key={`${psc.name}-${index}`} className="px-4 py-2">
              <div className="text-sm font-medium">{psc.name ?? 'Unnamed'}</div>
              <div className="text-xs text-ink-muted">
                {psc.controlPercentFloor > 0 ? `${psc.controlPercentFloor}%+ control` : 'control band not stated'} ·{' '}
                notified {shortDate(psc.notifiedOn)}
                {psc.ceasedOn ? ` · ceased ${shortDate(psc.ceasedOn)}` : ''}
              </div>
              <div className="text-xs text-ink-faint">{psc.natureOfControl.join(', ').replace(/-/g, ' ')}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Filings({ dossier }: { dossier: CompanyDossier }) {
  if (dossier.filings.length === 0) {
    return <p className="px-4 py-4 text-sm text-ink-muted">No filing history stored.</p>;
  }

  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="table">
        <thead className="sticky top-0 bg-surface">
          <tr>
            <th className="w-28">Date</th>
            <th className="w-32">Category</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>
          {dossier.filings.slice(0, 40).map((filing) => (
            <tr key={filing.transactionId}>
              <td>{shortDate(filing.filingDate)}</td>
              <td className="text-ink-muted">{titleCase(filing.category)}</td>
              <td className="text-ink-muted">{filing.description ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Charges({ dossier }: { dossier: CompanyDossier }) {
  if (dossier.charges.length === 0) {
    return <p className="px-4 py-4 text-sm text-ink-muted">No charges registered.</p>;
  }

  return (
    <ul className="divide-y divide-line">
      {dossier.charges.map((charge) => (
        <li key={charge.chargeId} className="px-4 py-2">
          <div className="text-sm">
            {charge.personsEntitled.join(', ') || <Missing reason="holder not stated" />}
          </div>
          <div className="text-xs text-ink-muted">
            {titleCase(charge.status)} · created {shortDate(charge.createdOn)}
            {charge.satisfiedOn ? ` · satisfied ${shortDate(charge.satisfiedOn)}` : ''}
          </div>
        </li>
      ))}
    </ul>
  );
}
