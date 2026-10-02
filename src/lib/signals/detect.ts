import type { CompanyDossier, DirectorRecord } from '@/lib/types';
import type { Signal, SignalSeverity, SignalType } from './types';

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

/**
 * Derives every acquisition signal for a company. Signals are shared: the
 * scoring engine consumes them, the UI displays them, and the AI analysis is
 * given them as evidence.
 */
export function detectSignals(dossier: CompanyDossier): Signal[] {
  const asOf = dossier.asOf ? new Date(dossier.asOf) : new Date();
  const signals: Signal[] = [];

  const add = (
    signalType: SignalType,
    severity: SignalSeverity,
    title: string,
    description: string,
    source: Signal['source'],
    evidence?: Record<string, unknown>,
  ) => {
    signals.push({
      signalType,
      severity,
      title,
      description,
      source,
      evidence,
      detectedAt: asOf.toISOString(),
    });
  };

  const activeDirectors = dossier.directors.filter((d) => !d.resignedOn);
  const companyAge = yearsSince(dossier.company.incorporationDate, asOf);
  const longestTenure = maxTenure(activeDirectors, asOf);

  // --- Ownership & succession -------------------------------------------------

  const activePscs = dossier.pscs.filter((p) => !p.ceasedOn);
  const individualPscs = activePscs.filter((p) => (p.kind ?? '').startsWith('individual'));
  const corporatePscs = activePscs.filter((p) => (p.kind ?? '').startsWith('corporate') || (p.kind ?? '').startsWith('legal'));
  const majorityPsc = activePscs.find((p) => p.controlPercentFloor >= 50);

  if (majorityPsc && individualPscs.includes(majorityPsc)) {
    add(
      'OWNER_CONTROLLED',
      'positive',
      'Owner controlled',
      `${majorityPsc.name ?? 'An individual'} holds at least ${majorityPsc.controlPercentFloor}% of the shares or voting rights.`,
      'companies_house',
      { pscName: majorityPsc.name, controlPercentFloor: majorityPsc.controlPercentFloor },
    );
  }

  if (activePscs.length > 0 && activePscs.length <= 2) {
    add(
      'CONCENTRATED_OWNERSHIP',
      'positive',
      'Concentrated ownership',
      `Control sits with ${activePscs.length} registered ${activePscs.length === 1 ? 'person' : 'people'}, which simplifies a transaction.`,
      'companies_house',
      { pscCount: activePscs.length },
    );
  }

  if (corporatePscs.length > 0) {
    add(
      'INSTITUTIONAL_OWNERSHIP',
      'caution',
      'Corporate or institutional shareholder',
      `${corporatePscs.map((p) => p.name).filter(Boolean).join(', ') || 'A corporate entity'} is registered as a person with significant control.`,
      'companies_house',
      { corporatePscCount: corporatePscs.length },
    );
  }

  if (longestTenure !== null && longestTenure >= 15) {
    const director = longestDirector(activeDirectors, asOf);
    add(
      'LONG_STANDING_OWNER',
      'positive',
      'Long-standing owner',
      `${director?.name ?? 'The principal director'} has been associated with the company for ${Math.floor(longestTenure)} years.`,
      'companies_house',
      { years: Math.floor(longestTenure), director: director?.name },
    );
  }

  if (activeDirectors.length === 1) {
    add(
      'SOLE_DIRECTOR',
      'neutral',
      'Sole director',
      'The company has a single active director, which concentrates both control and key-person risk.',
      'companies_house',
    );
  }

  if (companyAge !== null && companyAge >= 20) {
    add(
      'LONG_ESTABLISHED',
      'positive',
      'Long established',
      `Incorporated ${Math.floor(companyAge)} years ago.`,
      'companies_house',
      { years: Math.floor(companyAge) },
    );
  }

  const relatedCompanies = activeDirectors.reduce((sum, d) => sum + Math.max((d.otherAppointments ?? 1) - 1, 0), 0);
  if (relatedCompanies >= 2) {
    add(
      'MULTIPLE_RELATED_COMPANIES',
      'neutral',
      'Directors hold other appointments',
      `Active directors hold ${relatedCompanies} other current or past appointments, which may indicate a wider group.`,
      'companies_house',
      { relatedCompanies },
    );
  }

  // --- Directors & filings ----------------------------------------------------

  const recentAppointments = activeDirectors.filter(
    (d) => d.appointedOn && yearsSince(d.appointedOn, asOf)! <= 1,
  );
  if (recentAppointments.length > 0) {
    add(
      'RECENT_DIRECTOR_CHANGE',
      'neutral',
      'Recent director appointment',
      `${recentAppointments.length} director${recentAppointments.length === 1 ? '' : 's'} appointed in the last 12 months.`,
      'companies_house',
      { names: recentAppointments.map((d) => d.name) },
    );
  }

  const recentResignations = dossier.directors.filter(
    (d) => d.resignedOn && yearsSince(d.resignedOn, asOf)! <= 2,
  );
  if (recentResignations.length >= 2) {
    add(
      'DIRECTOR_TURNOVER',
      'caution',
      'Elevated director turnover',
      `${recentResignations.length} directors have resigned in the last two years.`,
      'companies_house',
      { count: recentResignations.length },
    );
  }

  if (isAccountsOverdue(dossier)) {
    add(
      'LATE_FILING',
      'negative',
      'Accounts overdue',
      'Companies House records the latest accounts or confirmation statement as overdue.',
      'companies_house',
    );
  }

  // --- Charges & insolvency ---------------------------------------------------

  const unsatisfied = dossier.charges.filter((c) => !c.satisfiedOn && c.status !== 'satisfied' && c.status !== 'fully-satisfied');
  if (unsatisfied.length > 0) {
    add(
      'UNSATISFIED_CHARGES',
      'caution',
      'Outstanding charges',
      `${unsatisfied.length} outstanding charge${unsatisfied.length === 1 ? '' : 's'} registered against the company.`,
      'companies_house',
      { count: unsatisfied.length, holders: unsatisfied.flatMap((c) => c.personsEntitled).slice(0, 5) },
    );
  }

  const newCharges = unsatisfied.filter((c) => c.createdOn && yearsSince(c.createdOn, asOf)! <= 1);
  if (newCharges.length > 0) {
    add(
      'NEW_CHARGE',
      'caution',
      'New charge registered',
      `A charge was registered in the last 12 months in favour of ${newCharges[0].personsEntitled[0] ?? 'a lender'}.`,
      'companies_house',
      { createdOn: newCharges[0].createdOn },
    );
  }

  if (dossier.company.hasInsolvencyHistory || dossier.insolvencyCaseCount > 0) {
    add(
      'INSOLVENCY',
      'negative',
      'Insolvency history',
      'Companies House records insolvency proceedings against this company.',
      'companies_house',
      { cases: dossier.insolvencyCaseCount },
    );
  }

  // --- Financials -------------------------------------------------------------

  const fin = dossier.financials;

  if (fin.financialVisibility === 'LOW') {
    add(
      dossier.periods.length === 0 ? 'NO_ACCOUNTS_AVAILABLE' : 'LIMITED_FINANCIAL_VISIBILITY',
      'neutral',
      dossier.periods.length === 0 ? 'No extractable accounts' : 'Limited financial visibility',
      dossier.periods.length === 0
        ? 'No accounts figures could be extracted. This says nothing about performance — the figures simply are not published in an extractable form.'
        : 'Turnover is not disclosed in the available accounts, so profitability cannot be assessed from filings alone.',
      'financials',
      { periods: dossier.periods.length },
    );
  } else if (fin.financialVisibility === 'MEDIUM') {
    add(
      'LIMITED_FINANCIAL_VISIBILITY',
      'neutral',
      'Partial financial visibility',
      'Some financial information is available, but turnover is not fully disclosed.',
      'financials',
    );
  }

  if (fin.revenueCagr !== null && fin.revenueCagr >= 0.08) {
    add(
      'STRONG_REVENUE_GROWTH',
      'positive',
      'Strong revenue growth',
      `Revenue grew at a ${(fin.revenueCagr * 100).toFixed(1)}% CAGR over the available period.`,
      'financials',
      { revenueCagr: fin.revenueCagr },
    );
  }

  if (fin.revenueCagr !== null && fin.revenueCagr < -0.03) {
    add(
      'DECLINING_REVENUE',
      'negative',
      'Declining revenue',
      `Revenue fell at a ${(Math.abs(fin.revenueCagr) * 100).toFixed(1)}% annual rate over the available period.`,
      'financials',
      { revenueCagr: fin.revenueCagr },
    );
  }

  if (fin.operatingProfitCagr !== null && fin.operatingProfitCagr >= 0.08) {
    add(
      'STRONG_PROFIT_GROWTH',
      'positive',
      'Strong profit growth',
      `Operating profit grew at a ${(fin.operatingProfitCagr * 100).toFixed(1)}% CAGR.`,
      'financials',
      { operatingProfitCagr: fin.operatingProfitCagr },
    );
  }

  if (fin.profitConsistency !== null && fin.profitConsistency === 1 && dossier.periods.length >= 3) {
    add(
      'CONSISTENTLY_PROFITABLE',
      'positive',
      'Consistently profitable',
      `Profitable in every one of the ${dossier.periods.length} periods on record.`,
      'financials',
    );
  }

  if (fin.latestOperatingProfit !== null && fin.latestOperatingProfit < 0) {
    add(
      'LOSS_MAKING',
      'negative',
      'Loss making',
      'The most recent accounts show an operating loss.',
      'financials',
      { latestOperatingProfit: fin.latestOperatingProfit },
    );
  }

  if (fin.latestNetAssets !== null && fin.latestNetAssets < 0) {
    add(
      'NEGATIVE_NET_ASSETS',
      'negative',
      'Negative net assets',
      'Liabilities exceed assets on the most recent balance sheet.',
      'financials',
      { latestNetAssets: fin.latestNetAssets },
    );
  }

  const marginTrend = operatingMarginTrend(dossier);
  if (marginTrend !== null && marginTrend >= 0.01) {
    add(
      'MARGIN_IMPROVEMENT',
      'positive',
      'Improving margins',
      `Operating margin improved by ${(marginTrend * 100).toFixed(1)} percentage points over the available period.`,
      'financials',
      { marginTrend },
    );
  }

  if (
    fin.latestCash !== null &&
    fin.latestRevenue !== null &&
    fin.latestRevenue > 0 &&
    fin.latestCash / fin.latestRevenue >= 0.1
  ) {
    add(
      'STRONG_CASH_POSITION',
      'positive',
      'Strong cash position',
      `Cash of ${formatGbp(fin.latestCash)} represents ${((fin.latestCash / fin.latestRevenue) * 100).toFixed(0)}% of revenue.`,
      'financials',
      { cash: fin.latestCash },
    );
  }

  // --- Enrichment -------------------------------------------------------------

  if (dossier.enrichment?.website && (dossier.enrichment.businessDescription || dossier.enrichment.services.length > 0)) {
    add(
      'STRONG_WEB_PRESENCE',
      'positive',
      'Established web presence',
      'The company has a website describing its services.',
      'website',
      { website: dossier.enrichment.website },
    );
  } else if (dossier.enrichment && dossier.enrichment.websiteStatus === 'not_found') {
    add(
      'NO_WEBSITE_FOUND',
      'neutral',
      'No website found',
      'No company website was identified. This is common for trade businesses that work on referral.',
      'website',
    );
  }

  return signals;
}

export function yearsSince(iso: string | null | undefined, asOf: Date): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return (asOf.getTime() - then) / YEAR_MS;
}

function maxTenure(directors: DirectorRecord[], asOf: Date): number | null {
  const tenures = directors
    .map((d) => yearsSince(d.appointedOn, asOf))
    .filter((t): t is number => t !== null);
  return tenures.length ? Math.max(...tenures) : null;
}

function longestDirector(directors: DirectorRecord[], asOf: Date): DirectorRecord | null {
  let best: DirectorRecord | null = null;
  let bestTenure = -1;
  for (const director of directors) {
    const tenure = yearsSince(director.appointedOn, asOf);
    if (tenure !== null && tenure > bestTenure) {
      best = director;
      bestTenure = tenure;
    }
  }
  return best;
}

function operatingMarginTrend(dossier: CompanyDossier): number | null {
  const margins = dossier.periods
    .map((p) => p.operatingMargin)
    .filter((m): m is number => m !== null);
  if (margins.length < 2) return null;
  return margins[margins.length - 1] - margins[0];
}

function isAccountsOverdue(dossier: CompanyDossier): boolean {
  const accounts = dossier.company.accountsMeta as { overdue?: boolean; next_accounts?: { overdue?: boolean } } | null;
  const confirmation = dossier.company.confirmationStatementMeta as { overdue?: boolean } | null;
  return Boolean(accounts?.overdue || accounts?.next_accounts?.overdue || confirmation?.overdue);
}

function formatGbp(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(1)}m`;
  if (Math.abs(value) >= 1_000) return `£${Math.round(value / 1_000)}k`;
  return `£${Math.round(value)}`;
}

export { formatGbp };
