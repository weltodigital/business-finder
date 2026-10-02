import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { loadDossier } from '@/lib/repository/dossier';
import { loadActiveScoringConfig } from '@/lib/pipeline/score-company';
import { detectSignals } from '@/lib/signals';
import { scoreCompany } from '@/lib/scoring';
import { getAdminClient } from '@/lib/supabase/admin';
import { getServerClient, requireUser } from '@/lib/supabase/server';
import { Card, EmptyState, PageHeader, ScoreBadge, VisibilityBadge } from '@/components/primitives';
import { ScoreBreakdown } from '@/components/score-breakdown';
import { FinancialChart, FinancialHistory, FinancialTrend } from '@/components/financials';
import { SignalList } from '@/components/signals';
import { sicDescription } from '@/lib/sic-descriptions';
import { shortDate, titleCase, yearsOld } from '@/lib/utils';
import { TargetActions } from './target-actions';
import { AiAssessment } from './ai-assessment';
import type { TargetAnalysis } from '@/lib/ai/analyse-target';

export const dynamic = 'force-dynamic';

export default async function TargetPage({ params }: { params: { companyNumber: string } }) {
  const user = await requireUser();
  const companyNumber = normaliseCompanyNumber(params.companyNumber);

  const dossier = await loadDossier(companyNumber);
  if (!dossier) notFound();

  const signals = detectSignals(dossier);
  const { config } = await loadActiveScoringConfig();
  const score = scoreCompany(dossier, signals, { config });

  const db = getServerClient();
  const { data: target } = await db
    .from('targets')
    .select('*')
    .eq('user_id', user.id)
    .eq('company_id', dossier.company.id!)
    .maybeSingle();

  const { data: notes } = target
    ? await db.from('target_notes').select('*').eq('target_id', target.id).order('created_at', { ascending: false })
    : { data: [] };

  const network = await loadCorporateNetwork(dossier.company.id!, companyNumber);
  const analysis = (target?.ai_analysis ?? null) as TargetAnalysis | null;
  const c = dossier.company;
  const age = yearsOld(c.incorporationDate);

  return (
    <>
      <PageHeader
        title={c.name ?? companyNumber}
        subtitle={[
          c.companyNumber,
          titleCase(c.status),
          c.region ?? c.postcode ?? 'location unknown',
          age === null ? 'age unknown' : `${age} years old`,
          c.sicCodes.length ? c.sicCodes.map((code) => sicDescription(code) ?? `SIC ${code}`).join(', ') : 'SIC none',
        ].join(' · ')}
        action={
          <div className="flex items-center gap-3">
            {c.website && (
              <a href={c.website} target="_blank" rel="noreferrer noopener" className="btn-secondary">
                Open website
              </a>
            )}
            <div className="text-right">
              <ScoreBadge score={target?.manual_score ?? score.total} size="lg" />
              <div className="mt-1 text-[11px] text-ink-faint">
                {target?.manual_score !== null && target?.manual_score !== undefined
                  ? `your score (algorithm ${Math.round(score.total)})`
                  : 'acquisition score'}
              </div>
            </div>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <VisibilityBadge level={dossier.financials.financialVisibility} />
        {dossier.enrichment?.googleRating !== null && dossier.enrichment?.googleRating !== undefined && (
          <span className="rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted">
            Google {dossier.enrichment.googleRating.toFixed(1)} ({dossier.enrichment.googleReviewCount ?? 0})
          </span>
        )}
      </div>

      <TargetActions
        companyNumber={companyNumber}
        target={target ? { id: target.id, status: target.status, manualScore: target.manual_score, manualScoreReason: target.manual_score_reason } : null}
        algorithmScore={score.total}
        notes={(notes ?? []) as { id: string; body: string; created_at: string }[]}
      />

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card title="Why this target?">
            {analysis ? (
              <div className="px-4 py-3">
                <p className="text-sm">{analysis.summary}</p>
                {analysis.why_interesting.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-ink-muted">
                    {analysis.why_interesting.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="px-4 py-3">
                <p className="text-sm text-ink-muted">
                  No AI assessment yet. The deterministic score below already explains why this company ranks where
                  it does.
                </p>
              </div>
            )}
          </Card>

          <Card title="Financials">
            <FinancialHistory periods={dossier.periods} />
            <div className="grid gap-0 border-t border-line sm:grid-cols-3 sm:divide-x sm:divide-line">
              <FinancialChart periods={dossier.periods} metric="revenue" label="Revenue" />
              <FinancialChart periods={dossier.periods} metric="operatingProfit" label="Operating profit" />
              <FinancialChart periods={dossier.periods} metric="cash" label="Cash" />
            </div>
          </Card>

          <Card title="Ownership">
            <div className="grid gap-0 md:grid-cols-2">
              <div className="border-line md:border-r">
                <h3 className="border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Directors
                </h3>
                <ul className="divide-y divide-line">
                  {dossier.directors.map((director, index) => (
                    <li key={`${director.name}-${index}`} className="px-4 py-2">
                      <div className="text-sm font-medium">
                        {director.name}
                        {director.resignedOn && <span className="ml-2 text-[10px] uppercase text-ink-faint">resigned</span>}
                      </div>
                      <div className="text-xs text-ink-muted">
                        {titleCase(director.role)} · appointed {shortDate(director.appointedOn)}
                        {director.occupation ? ` · ${director.occupation}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="border-b border-line px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                  Persons with significant control
                </h3>
                <ul className="divide-y divide-line">
                  {dossier.pscs.length === 0 && <li className="px-4 py-3 text-sm text-ink-muted">None recorded.</li>}
                  {dossier.pscs.map((psc, index) => (
                    <li key={`${psc.name}-${index}`} className="px-4 py-2">
                      <div className="text-sm font-medium">{psc.name ?? 'Unnamed'}</div>
                      <div className="text-xs text-ink-muted">
                        {psc.controlPercentFloor > 0 ? `${psc.controlPercentFloor}%+ control` : 'band not stated'} ·
                        notified {shortDate(psc.notifiedOn)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>

          <Card title="Corporate network">
            {network.length === 0 ? (
              <EmptyState
                title="No related companies on record"
                detail="Directors' other appointments are retrieved during deep research. Re-import with appointments to populate this."
              />
            ) : (
              <ul className="divide-y divide-line">
                {network.map((entry) => (
                  <li key={`${entry.companyNumber}-${entry.director}`} className="flex items-baseline gap-3 px-4 py-2">
                    <Link href={`/targets/${entry.companyNumber}`} className="text-sm text-accent hover:underline">
                      {entry.companyName ?? entry.companyNumber}
                    </Link>
                    <span className="text-xs text-ink-muted">
                      {entry.director} · {titleCase(entry.role)} · {titleCase(entry.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <AiAssessment companyNumber={companyNumber} analysis={analysis} model={target?.ai_model ?? null} />
        </div>

        <div className="space-y-4">
          <Card title="Acquisition score">
            <ScoreBreakdown score={score} />
          </Card>

          <Card title="Financial trend">
            <FinancialTrend summary={dossier.financials} />
          </Card>

          <Card title="Acquisition signals">
            <SignalList signals={signals} only={['positive', 'neutral']} />
          </Card>

          <Card title="Risks">
            <SignalList signals={signals} only={['caution', 'negative']} />
          </Card>
        </div>
      </div>
    </>
  );
}

interface NetworkEntry {
  companyNumber: string;
  companyName: string | null;
  status: string | null;
  role: string | null;
  director: string;
}

async function loadCorporateNetwork(companyId: string, companyNumber: string): Promise<NetworkEntry[]> {
  const db = getAdminClient();

  const { data: links } = await db
    .from('company_directors')
    .select('director_id, directors(name)')
    .eq('company_id', companyId);

  const directorIds = ((links ?? []) as Record<string, unknown>[]).map((row) => row.director_id as string);
  if (directorIds.length === 0) return [];

  const nameById = new Map(
    ((links ?? []) as Record<string, unknown>[]).map((row) => [
      row.director_id as string,
      ((row.directors as { name?: string } | null)?.name ?? 'Unknown') as string,
    ]),
  );

  const { data: appointments } = await db
    .from('officer_appointments')
    .select('director_id, company_number, company_name, company_status, role')
    .in('director_id', directorIds)
    .neq('company_number', companyNumber)
    .limit(50);

  return ((appointments ?? []) as Record<string, unknown>[]).map((row) => ({
    companyNumber: row.company_number as string,
    companyName: (row.company_name as string) ?? null,
    status: (row.company_status as string) ?? null,
    role: (row.role as string) ?? null,
    director: nameById.get(row.director_id as string) ?? 'Unknown',
  }));
}
