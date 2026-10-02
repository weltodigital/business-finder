import type { ExtractedFact, FinancialMetric } from './metrics';
import { validateFacts, type ValidationIssue } from './validate';

export interface FinancialPeriod {
  periodStart: string | null;
  periodEnd: string;
  months: number | null;

  revenue: number | null;
  costOfSales: number | null;
  grossProfit: number | null;
  operatingProfit: number | null;
  profitBeforeTax: number | null;
  tax: number | null;
  netProfit: number | null;
  dividends: number | null;

  cash: number | null;
  tradeReceivables: number | null;
  tradePayables: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  fixedAssets: number | null;
  intangibleAssets: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  netAssets: number | null;
  shortTermDebt: number | null;
  longTermDebt: number | null;

  employeeCount: number | null;
  directorsRemuneration: number | null;

  grossMargin: number | null;
  operatingMargin: number | null;
  netMargin: number | null;
  currentRatio: number | null;

  hasEstimates: boolean;
  validationStatus: 'ok' | 'needs_review';
  validationIssues: ValidationIssue[];
  sourceDocumentIds: string[];
}

type FactWithSource = ExtractedFact & { documentId?: string };

/**
 * Collapses individual facts (which may come from several filings, each
 * carrying a current and a comparative year) into one row per accounting year.
 * Where the same metric and period appears twice, the higher-confidence
 * extraction wins.
 */
export function buildFinancialPeriods(facts: FactWithSource[]): FinancialPeriod[] {
  const byPeriod = new Map<string, { facts: FactWithSource[]; start: string | null }>();

  for (const fact of facts) {
    if (!fact.periodEnd) continue;
    const key = fact.periodEnd;
    const group = byPeriod.get(key) ?? { facts: [], start: null };
    group.facts.push(fact);
    // Flow facts carry the period start; instants do not.
    if (!group.start && fact.periodStart) group.start = fact.periodStart;
    byPeriod.set(key, group);
  }

  const periods = Array.from(byPeriod.entries()).map(([periodEnd, group]) =>
    buildPeriod(periodEnd, group.start, group.facts),
  );

  return periods.sort((a, b) => a.periodEnd.localeCompare(b.periodEnd));
}

function buildPeriod(
  periodEnd: string,
  periodStart: string | null,
  facts: FactWithSource[],
): FinancialPeriod {
  const best = new Map<FinancialMetric, FactWithSource>();
  for (const fact of facts) {
    const existing = best.get(fact.metric);
    if (!existing || fact.confidence > existing.confidence) best.set(fact.metric, fact);
  }

  const get = (metric: FinancialMetric): number | null => best.get(metric)?.value ?? null;

  let hasEstimates = false;
  /** Records a figure we computed from reported components rather than read. */
  const derive = (value: number | null): number | null => {
    if (value !== null) hasEstimates = true;
    return value;
  };

  const revenue = get('revenue');
  const costOfSales = get('cost_of_sales');
  let grossProfit = get('gross_profit');
  if (grossProfit === null && revenue !== null && costOfSales !== null) {
    grossProfit = derive(revenue - Math.abs(costOfSales));
  }

  let cash = get('cash');
  if (cash === null) cash = get('cash_and_equivalents');

  const totalAssets = get('total_assets');
  let totalLiabilities = get('total_liabilities');
  let netAssets = get('net_assets');

  if (netAssets === null && totalAssets !== null && totalLiabilities !== null) {
    netAssets = derive(totalAssets - totalLiabilities);
  } else if (totalLiabilities === null && totalAssets !== null && netAssets !== null) {
    totalLiabilities = derive(totalAssets - netAssets);
  }

  const currentAssets = get('current_assets');
  const currentLiabilities = get('current_liabilities');
  const operatingProfit = get('operating_profit');
  const netProfit = get('net_profit');

  const validation = validateFacts(facts);

  return {
    periodStart,
    periodEnd,
    months: monthsBetween(periodStart, periodEnd),

    revenue,
    costOfSales,
    grossProfit,
    operatingProfit,
    profitBeforeTax: get('profit_before_tax'),
    tax: get('tax'),
    netProfit,
    dividends: get('dividends'),

    cash,
    tradeReceivables: get('trade_receivables'),
    tradePayables: get('trade_payables'),
    currentAssets,
    currentLiabilities,
    fixedAssets: get('fixed_assets'),
    intangibleAssets: get('intangible_assets'),
    totalAssets,
    totalLiabilities,
    netAssets,
    shortTermDebt: get('short_term_debt'),
    longTermDebt: get('long_term_debt'),

    employeeCount: get('employee_count'),
    directorsRemuneration: get('directors_remuneration'),

    grossMargin: ratio(grossProfit, revenue),
    operatingMargin: ratio(operatingProfit, revenue),
    netMargin: ratio(netProfit, revenue),
    currentRatio: ratio(currentAssets, currentLiabilities),

    hasEstimates,
    validationStatus: validation.status,
    validationIssues: validation.issues,
    sourceDocumentIds: Array.from(
      new Set(facts.map((f) => f.documentId).filter((id): id is string => Boolean(id))),
    ),
  };
}

export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function monthsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  // A 1 Apr – 31 Mar year is 11 whole months plus the remaining days.
  return to.getDate() >= from.getDate() - 1 ? months + 1 : months;
}
