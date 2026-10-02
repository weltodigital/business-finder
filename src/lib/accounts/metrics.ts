export const FINANCIAL_METRICS = [
  'revenue',
  'cost_of_sales',
  'gross_profit',
  'operating_profit',
  'profit_before_tax',
  'tax',
  'net_profit',
  'dividends',
  'cash',
  'cash_and_equivalents',
  'trade_receivables',
  'trade_payables',
  'current_assets',
  'current_liabilities',
  'fixed_assets',
  'intangible_assets',
  'total_assets',
  'total_liabilities',
  'net_assets',
  'short_term_debt',
  'long_term_debt',
  'employee_count',
  'directors_remuneration',
] as const;

export type FinancialMetric = (typeof FINANCIAL_METRICS)[number];

/** Metrics measured at a point in time rather than over a period. */
export const INSTANT_METRICS = new Set<FinancialMetric>([
  'cash',
  'cash_and_equivalents',
  'trade_receivables',
  'trade_payables',
  'current_assets',
  'current_liabilities',
  'fixed_assets',
  'intangible_assets',
  'total_assets',
  'total_liabilities',
  'net_assets',
  'short_term_debt',
  'long_term_debt',
]);

export interface ExtractedFact {
  metric: FinancialMetric;
  value: number;
  currency?: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  isInstant: boolean;
  unit?: string;
  scale?: number;
  sourceLocation?: string;
  sourcePage?: string;
  extractionMethod: 'ixbrl' | 'xbrl' | 'pdf_text' | 'llm' | 'fixture';
  confidence: number;
  isReported: boolean;
  isEstimated: boolean;
}
