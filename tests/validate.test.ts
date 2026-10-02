import { describe, expect, it } from 'vitest';
import type { ExtractedFact, FinancialMetric } from '@/lib/accounts/metrics';
import { validateFacts } from '@/lib/accounts/validate';

function fact(metric: FinancialMetric, value: number, periodEnd = '2025-03-31'): ExtractedFact {
  return {
    metric,
    value,
    periodEnd,
    periodStart: '2024-04-01',
    isInstant: false,
    extractionMethod: 'ixbrl',
    confidence: 0.98,
    isReported: true,
    isEstimated: false,
  };
}

describe('validateFacts', () => {
  it('accepts internally consistent accounts', () => {
    const result = validateFacts([
      fact('revenue', 3_100_000),
      fact('cost_of_sales', 1_767_000),
      fact('gross_profit', 1_333_000),
      fact('operating_profit', 430_000),
      fact('total_assets', 2_210_000),
      fact('total_liabilities', 620_000),
      fact('net_assets', 1_590_000),
    ]);
    expect(result.status).toBe('ok');
    expect(result.issues).toHaveLength(0);
  });

  it('flags gross profit above revenue', () => {
    const result = validateFacts([fact('revenue', 100_000), fact('gross_profit', 150_000)]);
    expect(result.status).toBe('needs_review');
    expect(result.issues.map((i) => i.code)).toContain('gross_profit_exceeds_revenue');
  });

  it('flags operating profit above gross profit', () => {
    const result = validateFacts([fact('gross_profit', 100_000), fact('operating_profit', 180_000)]);
    expect(result.issues.map((i) => i.code)).toContain('operating_profit_exceeds_gross_profit');
  });

  it('flags a balance sheet that does not balance', () => {
    const result = validateFacts([
      fact('total_assets', 1_000_000),
      fact('total_liabilities', 400_000),
      fact('net_assets', 900_000),
    ]);
    expect(result.status).toBe('needs_review');
    expect(result.issues.map((i) => i.code)).toContain('balance_sheet_does_not_balance');
  });

  it('flags a suspected thousands-versus-pounds error', () => {
    const result = validateFacts([fact('revenue', 3_100), fact('employee_count', 31)]);
    expect(result.issues.map((i) => i.code)).toContain('suspected_scale_error');
  });

  it('flags conflicting values for the same metric and period', () => {
    const result = validateFacts([fact('revenue', 3_100_000), fact('revenue', 2_400_000)]);
    expect(result.issues.map((i) => i.code)).toContain('conflicting_values');
  });

  it('tolerates rounding differences', () => {
    const result = validateFacts([
      fact('revenue', 3_100_000),
      fact('cost_of_sales', 1_767_000),
      fact('gross_profit', 1_333_400),
    ]);
    expect(result.status).toBe('ok');
  });
});
