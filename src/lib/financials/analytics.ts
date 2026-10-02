import type { FinancialPeriod } from '@/lib/accounts/normalise';

export type FinancialVisibility = 'HIGH' | 'MEDIUM' | 'LOW';

export interface FinancialSummary {
  financialVisibility: FinancialVisibility;
  periodsAvailable: number;
  firstPeriodEnd: string | null;
  latestPeriodEnd: string | null;

  latestRevenue: number | null;
  latestOperatingProfit: number | null;
  latestNetProfit: number | null;
  latestCash: number | null;
  latestNetAssets: number | null;
  latestTotalDebt: number | null;
  latestEmployeeCount: number | null;

  revenueCagr: number | null;
  operatingProfitCagr: number | null;
  revenueGrowthYoY: number | null;
  operatingProfitGrowthYoY: number | null;
  cashGrowthYoY: number | null;

  avgOperatingMargin: number | null;
  latestOperatingMargin: number | null;
  latestGrossMargin: number | null;
  latestNetMargin: number | null;
  latestCurrentRatio: number | null;

  revenueConsistency: number | null;
  profitConsistency: number | null;
  revenuePerEmployee: number | null;
  profitPerEmployee: number | null;
  debtToOperatingProfit: number | null;
}

/**
 * Compound annual growth rate between the first and last observation.
 * Undefined where the starting value is not positive — a company that went
 * from a loss to a profit has no meaningful CAGR.
 */
export function cagr(first: number, last: number, years: number): number | null {
  if (years <= 0) return null;
  if (first <= 0 || last <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

export function yearsBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return (end - start) / (365.25 * 24 * 60 * 60 * 1000);
}

export function growth(previous: number | null, latest: number | null): number | null {
  if (previous === null || latest === null) return null;
  if (previous === 0) return null;
  // Growth off a negative base is not interpretable as a percentage.
  if (previous < 0) return null;
  return (latest - previous) / previous;
}

/**
 * 0..1 measure of how steady a series is: 1 means every year matched or beat
 * the previous one, 0 means every year fell.
 */
export function consistency(values: number[]): number | null {
  if (values.length < 2) return null;
  let improved = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] >= values[i - 1]) improved++;
  }
  return improved / (values.length - 1);
}

export function summariseFinancials(periods: FinancialPeriod[]): FinancialSummary {
  const sorted = [...periods].sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
  const latest = sorted[sorted.length - 1] ?? null;
  const previous = sorted[sorted.length - 2] ?? null;

  const revenueSeries = sorted.filter((p) => p.revenue !== null);
  const operatingSeries = sorted.filter((p) => p.operatingProfit !== null);

  const totalDebt = latest
    ? sumIfAny([latest.shortTermDebt, latest.longTermDebt])
    : null;

  const marginValues = sorted
    .map((p) => p.operatingMargin)
    .filter((m): m is number => m !== null);

  return {
    financialVisibility: determineVisibility(sorted),
    periodsAvailable: sorted.length,
    firstPeriodEnd: sorted[0]?.periodEnd ?? null,
    latestPeriodEnd: latest?.periodEnd ?? null,

    latestRevenue: latest?.revenue ?? null,
    latestOperatingProfit: latest?.operatingProfit ?? null,
    latestNetProfit: latest?.netProfit ?? null,
    latestCash: latest?.cash ?? null,
    latestNetAssets: latest?.netAssets ?? null,
    latestTotalDebt: totalDebt,
    latestEmployeeCount: latest?.employeeCount ?? null,

    revenueCagr: seriesCagr(revenueSeries, (p) => p.revenue),
    operatingProfitCagr: seriesCagr(operatingSeries, (p) => p.operatingProfit),
    revenueGrowthYoY: growth(previous?.revenue ?? null, latest?.revenue ?? null),
    operatingProfitGrowthYoY: growth(previous?.operatingProfit ?? null, latest?.operatingProfit ?? null),
    cashGrowthYoY: growth(previous?.cash ?? null, latest?.cash ?? null),

    avgOperatingMargin: marginValues.length
      ? marginValues.reduce((a, b) => a + b, 0) / marginValues.length
      : null,
    latestOperatingMargin: latest?.operatingMargin ?? null,
    latestGrossMargin: latest?.grossMargin ?? null,
    latestNetMargin: latest?.netMargin ?? null,
    latestCurrentRatio: latest?.currentRatio ?? null,

    revenueConsistency: consistency(revenueSeries.map((p) => p.revenue as number)),
    profitConsistency: profitConsistency(sorted),
    revenuePerEmployee: perEmployee(latest?.revenue ?? null, latest?.employeeCount ?? null),
    profitPerEmployee: perEmployee(latest?.operatingProfit ?? null, latest?.employeeCount ?? null),
    debtToOperatingProfit:
      totalDebt !== null && latest?.operatingProfit && latest.operatingProfit > 0
        ? totalDebt / latest.operatingProfit
        : null,
  };
}

/**
 * Visibility describes how much we know, never how well the company is doing.
 * A company with no disclosed turnover is LOW visibility, not a bad business.
 */
export function determineVisibility(periods: FinancialPeriod[]): FinancialVisibility {
  if (periods.length === 0) return 'LOW';

  const withRevenue = periods.filter((p) => p.revenue !== null);
  const withProfit = periods.filter((p) => p.operatingProfit !== null || p.netProfit !== null);
  const withBalanceSheet = periods.filter((p) => p.netAssets !== null || p.totalAssets !== null);

  if (withRevenue.length >= 2 && withProfit.length >= 2) return 'HIGH';
  if (withRevenue.length >= 1 && withProfit.length >= 1 && periods.length >= 2) return 'HIGH';
  if (withProfit.length >= 1 || withBalanceSheet.length >= 2) return 'MEDIUM';
  return 'LOW';
}

function seriesCagr(
  periods: FinancialPeriod[],
  pick: (p: FinancialPeriod) => number | null,
): number | null {
  if (periods.length < 2) return null;
  const first = periods[0];
  const last = periods[periods.length - 1];
  const firstValue = pick(first);
  const lastValue = pick(last);
  if (firstValue === null || lastValue === null) return null;
  return cagr(firstValue, lastValue, yearsBetween(first.periodEnd, last.periodEnd));
}

function profitConsistency(periods: FinancialPeriod[]): number | null {
  const values = periods
    .map((p) => p.operatingProfit ?? p.netProfit)
    .filter((v): v is number => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return values.filter((v) => v > 0).length / values.length;
}

function perEmployee(value: number | null, employees: number | null): number | null {
  if (value === null || !employees || employees <= 0) return null;
  return value / employees;
}

function sumIfAny(values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((a, b) => a + b, 0);
}
