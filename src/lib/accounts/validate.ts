import type { ExtractedFact } from './metrics';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  severity: ValidationSeverity;
  message: string;
  metrics: string[];
  periodEnd?: string | null;
}

export interface ValidationResult {
  status: 'ok' | 'needs_review';
  issues: ValidationIssue[];
}

interface PeriodValues {
  periodEnd: string | null;
  values: Partial<Record<string, number>>;
}

const RELATIVE_TOLERANCE = 0.02; // accounts are rounded; 2% avoids false alarms
const ABSOLUTE_TOLERANCE = 1_000;

/**
 * Accounting sanity checks. Anything that fails here marks the document
 * `needs_review` rather than being silently accepted into the financial model.
 */
export function validateFacts(facts: ExtractedFact[]): ValidationResult {
  const issues: ValidationIssue[] = [];

  issues.push(...detectConflicts(facts));

  for (const period of groupByPeriod(facts)) {
    issues.push(...validatePeriod(period));
  }

  const status = issues.some((i) => i.severity === 'error') ? 'needs_review' : 'ok';
  return { status, issues };
}

function groupByPeriod(facts: ExtractedFact[]): PeriodValues[] {
  const groups = new Map<string, PeriodValues>();
  for (const fact of facts) {
    const key = fact.periodEnd ?? 'unknown';
    let group = groups.get(key);
    if (!group) {
      group = { periodEnd: fact.periodEnd ?? null, values: {} };
      groups.set(key, group);
    }
    // First value wins; conflicts are reported separately.
    if (group.values[fact.metric] === undefined) group.values[fact.metric] = fact.value;
  }
  return Array.from(groups.values());
}

function validatePeriod({ periodEnd, values }: PeriodValues): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const v = values;

  const push = (
    code: string,
    severity: ValidationSeverity,
    message: string,
    metrics: string[],
  ) => issues.push({ code, severity, message, metrics, periodEnd });

  if (v.revenue !== undefined && v.revenue < 0) {
    push('negative_revenue', 'error', 'Revenue is negative.', ['revenue']);
  }
  if (v.employee_count !== undefined && (v.employee_count < 0 || v.employee_count > 1_000_000)) {
    push('impossible_employee_count', 'error', 'Employee count is outside a plausible range.', ['employee_count']);
  }

  if (v.revenue !== undefined && v.gross_profit !== undefined && greaterThan(v.gross_profit, v.revenue)) {
    push('gross_profit_exceeds_revenue', 'error', 'Gross profit exceeds revenue.', ['gross_profit', 'revenue']);
  }

  if (
    v.gross_profit !== undefined &&
    v.operating_profit !== undefined &&
    greaterThan(v.operating_profit, v.gross_profit)
  ) {
    push('operating_profit_exceeds_gross_profit', 'error', 'Operating profit exceeds gross profit.', [
      'operating_profit',
      'gross_profit',
    ]);
  }

  if (
    v.revenue !== undefined &&
    v.cost_of_sales !== undefined &&
    v.gross_profit !== undefined &&
    !approximatelyEqual(v.revenue - Math.abs(v.cost_of_sales), v.gross_profit)
  ) {
    push('gross_profit_does_not_reconcile', 'warning', 'Revenue less cost of sales does not equal gross profit.', [
      'revenue',
      'cost_of_sales',
      'gross_profit',
    ]);
  }

  if (
    v.total_assets !== undefined &&
    v.total_liabilities !== undefined &&
    v.net_assets !== undefined &&
    !approximatelyEqual(v.total_assets - v.total_liabilities, v.net_assets)
  ) {
    push('balance_sheet_does_not_balance', 'error', 'Total assets less total liabilities does not equal net assets.', [
      'total_assets',
      'total_liabilities',
      'net_assets',
    ]);
  }

  if (
    v.current_assets !== undefined &&
    v.total_assets !== undefined &&
    greaterThan(v.current_assets, v.total_assets)
  ) {
    push('current_assets_exceed_total_assets', 'error', 'Current assets exceed total assets.', [
      'current_assets',
      'total_assets',
    ]);
  }

  // Thousands-vs-pounds errors: a real trading company with staff cannot have
  // four-figure turnover.
  if (
    v.revenue !== undefined &&
    v.revenue > 0 &&
    v.revenue < 10_000 &&
    (v.employee_count ?? 0) >= 5
  ) {
    push('suspected_scale_error', 'error', 'Revenue looks reported in thousands rather than pounds.', ['revenue']);
  }

  if (
    v.revenue !== undefined &&
    v.operating_profit !== undefined &&
    v.revenue > 0 &&
    v.operating_profit / v.revenue > 0.9
  ) {
    push('implausible_margin', 'warning', 'Operating margin above 90% — check the extracted figures.', [
      'operating_profit',
      'revenue',
    ]);
  }

  return issues;
}

function detectConflicts(facts: ExtractedFact[]): ValidationIssue[] {
  const byKey = new Map<string, ExtractedFact[]>();
  for (const fact of facts) {
    const key = `${fact.metric}|${fact.periodEnd ?? ''}`;
    byKey.set(key, [...(byKey.get(key) ?? []), fact]);
  }

  const issues: ValidationIssue[] = [];
  for (const [key, group] of byKey) {
    if (group.length < 2) continue;
    const [metric, periodEnd] = key.split('|');
    const distinct = new Set(group.map((f) => f.value));
    if (distinct.size > 1 && !allApproximatelyEqual(Array.from(distinct))) {
      issues.push({
        code: 'conflicting_values',
        severity: 'error',
        message: `Conflicting values extracted for ${metric}: ${Array.from(distinct).join(', ')}.`,
        metrics: [metric],
        periodEnd: periodEnd || null,
      });
    }
  }
  return issues;
}

function allApproximatelyEqual(values: number[]): boolean {
  return values.every((v) => approximatelyEqual(v, values[0]));
}

export function approximatelyEqual(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  if (diff <= ABSOLUTE_TOLERANCE) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  return scale > 0 && diff / scale <= RELATIVE_TOLERANCE;
}

function greaterThan(a: number, b: number): boolean {
  return a > b && !approximatelyEqual(a, b);
}
