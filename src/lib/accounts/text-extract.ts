import type { ExtractedFact, FinancialMetric } from './metrics';
import { INSTANT_METRICS } from './metrics';

interface LabelRule {
  metric: FinancialMetric;
  pattern: RegExp;
}

/**
 * Line-label heuristics for untagged (PDF) accounts. Deliberately conservative:
 * anything ambiguous is left for the LLM fallback rather than guessed at.
 */
const LABEL_RULES: LabelRule[] = [
  { metric: 'revenue', pattern: /^(turnover|revenue|sales)\b/i },
  { metric: 'cost_of_sales', pattern: /^cost of sales\b/i },
  { metric: 'gross_profit', pattern: /^gross (profit|loss)\b/i },
  { metric: 'operating_profit', pattern: /^operating (profit|loss)\b/i },
  { metric: 'profit_before_tax', pattern: /^(profit|loss)[^\n]{0,40}before tax(ation)?\b/i },
  { metric: 'tax', pattern: /^tax(ation)? on (profit|loss)\b/i },
  { metric: 'net_profit', pattern: /^(profit|loss) for the (financial )?(year|period)\b/i },
  { metric: 'dividends', pattern: /^dividends?\b/i },
  { metric: 'cash', pattern: /^cash (at bank and )?in hand\b/i },
  { metric: 'cash_and_equivalents', pattern: /^cash and cash equivalents\b/i },
  { metric: 'trade_receivables', pattern: /^trade (debtors|receivables)\b/i },
  { metric: 'trade_payables', pattern: /^trade (creditors|payables)\b/i },
  { metric: 'current_assets', pattern: /^(total )?current assets\b/i },
  { metric: 'current_liabilities', pattern: /^creditors[^\n]{0,40}within one year\b/i },
  { metric: 'fixed_assets', pattern: /^(total )?fixed assets\b/i },
  { metric: 'intangible_assets', pattern: /^intangible assets\b/i },
  { metric: 'total_assets', pattern: /^total assets\b/i },
  { metric: 'long_term_debt', pattern: /^creditors[^\n]{0,40}after more than one year\b/i },
  { metric: 'net_assets', pattern: /^(net assets|total equity|shareholders'? funds)\b/i },
  { metric: 'employee_count', pattern: /^average number of employees\b/i },
  { metric: 'directors_remuneration', pattern: /^directors'? (remuneration|emoluments)\b/i },
];

export interface TextExtractOptions {
  periodEnd?: string | null;
  periodStart?: string | null;
  comparativePeriodEnd?: string | null;
}

export interface TextExtractResult {
  facts: ExtractedFact[];
  /** 1 for pounds, 1000 where the statement is presented in £'000. */
  detectedScale: number;
}

export function extractFactsFromText(
  text: string,
  options: TextExtractOptions = {},
): TextExtractResult {
  const detectedScale = detectScale(text);
  const lines = text.split(/\r?\n/);
  const facts: ExtractedFact[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const rule = LABEL_RULES.find((r) => r.pattern.test(trimmed));
    if (!rule) return;

    const numbers = dropNoteReferences(extractNumbers(trimmed));
    if (numbers.length === 0) return;

    // Statements print the current year first, then the comparative.
    const columns: Array<{ value: number; periodEnd: string | null | undefined }> = [
      { value: numbers[0].value, periodEnd: options.periodEnd },
    ];
    if (numbers.length > 1 && options.comparativePeriodEnd) {
      columns.push({ value: numbers[1].value, periodEnd: options.comparativePeriodEnd });
    }

    for (const column of columns) {
      const isCount = rule.metric === 'employee_count';
      const value = isCount ? column.value : column.value * detectedScale;
      const key = `${rule.metric}|${column.periodEnd ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      facts.push({
        metric: rule.metric,
        value,
        currency: isCount ? undefined : 'GBP',
        periodEnd: column.periodEnd ?? null,
        periodStart: column.periodEnd === options.periodEnd ? (options.periodStart ?? null) : null,
        isInstant: INSTANT_METRICS.has(rule.metric),
        scale: detectedScale === 1000 ? 3 : 0,
        sourceLocation: trimmed.slice(0, 120),
        sourcePage: `line:${index + 1}`,
        extractionMethod: 'pdf_text',
        // Lower than XBRL: label matching can pick up the wrong column.
        confidence: 0.6,
        isReported: true,
        isEstimated: false,
      });
    }
  });

  return { facts, detectedScale };
}

/** Detects "£'000" style presentation so figures are stored in pounds. */
export function detectScale(text: string): number {
  const sample = text.slice(0, 20000);
  if (/£\s?m(illion)?\b|in millions|£'?m\b/i.test(sample)) return 1_000_000;
  if (/£\s?'?000|in thousands|£'?000s?\b/i.test(sample)) return 1_000;
  return 1;
}

interface ParsedNumber {
  value: number;
  raw: string;
}

function extractNumbers(line: string): ParsedNumber[] {
  const matches = line.match(/\(?-?[£$€]?\s?\d[\d,]*(?:\.\d+)?\)?/g) ?? [];
  const values: ParsedNumber[] = [];

  for (const match of matches) {
    const negative = match.startsWith('(') || match.trimStart().startsWith('-');
    const cleaned = match.replace(/[()£$€,\s-]/g, '');
    if (!cleaned) continue;
    const value = Number(cleaned);
    if (!Number.isFinite(value)) continue;
    values.push({ value: negative ? -value : value, raw: match.trim() });
  }

  return values;
}

/**
 * Statement lines usually carry a note reference before the figures
 * ("Turnover    2    1,890    1,805"). A leading bare small integer followed by
 * a far larger figure is a note number, not a column. The size test keeps
 * genuine small figures — an employee count of 15 next to a comparative 15 —
 * from being discarded.
 */
function dropNoteReferences(numbers: ParsedNumber[]): ParsedNumber[] {
  const result = [...numbers];
  while (
    result.length > 1 &&
    isNoteReference(result[0]) &&
    Math.abs(result[1].value) >= Math.abs(result[0].value) * 20
  ) {
    result.shift();
  }
  return result;
}

function isNoteReference({ value, raw }: ParsedNumber): boolean {
  if (/[,.()]/.test(raw)) return false;
  return Number.isInteger(value) && value > 0 && value < 100;
}
