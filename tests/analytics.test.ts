import { describe, expect, it } from 'vitest';
import { buildFinancialPeriods, monthsBetween } from '@/lib/accounts/normalise';
import { cagr, consistency, determineVisibility, growth, summariseFinancials } from '@/lib/financials/analytics';
import { fixtureDossier } from '@/lib/fixtures/dossier';
import type { ExtractedFact, FinancialMetric } from '@/lib/accounts/metrics';

function fact(metric: FinancialMetric, value: number, periodEnd: string, periodStart: string | null): ExtractedFact {
  return {
    metric,
    value,
    periodEnd,
    periodStart,
    isInstant: periodStart === null,
    extractionMethod: 'ixbrl',
    confidence: 0.98,
    isReported: true,
    isEstimated: false,
  };
}

describe('cagr', () => {
  it('computes compound annual growth', () => {
    expect(cagr(100, 121, 2)).toBeCloseTo(0.1, 6);
  });

  it('returns null when the starting value is not positive', () => {
    expect(cagr(0, 100, 3)).toBeNull();
    expect(cagr(-50, 100, 3)).toBeNull();
  });

  it('returns null over a zero-length period', () => {
    expect(cagr(100, 200, 0)).toBeNull();
  });
});

describe('growth', () => {
  it('computes year-on-year growth', () => {
    expect(growth(200, 250)).toBeCloseTo(0.25, 6);
  });

  it('refuses to compute growth from a negative base', () => {
    expect(growth(-100, 50)).toBeNull();
  });
});

describe('consistency', () => {
  it('scores a rising series at 1', () => {
    expect(consistency([1, 2, 3, 4])).toBe(1);
  });

  it('scores a falling series at 0', () => {
    expect(consistency([4, 3, 2])).toBe(0);
  });

  it('needs at least two observations', () => {
    expect(consistency([5])).toBeNull();
  });
});

describe('monthsBetween', () => {
  it('treats a 1 April to 31 March year as 12 months', () => {
    expect(monthsBetween('2024-04-01', '2025-03-31')).toBe(12);
  });
});

describe('buildFinancialPeriods', () => {
  it('derives gross profit and net assets from reported components', () => {
    const [period] = buildFinancialPeriods([
      fact('revenue', 1_000_000, '2025-03-31', '2024-04-01'),
      fact('cost_of_sales', 600_000, '2025-03-31', '2024-04-01'),
      fact('total_assets', 800_000, '2025-03-31', null),
      fact('total_liabilities', 300_000, '2025-03-31', null),
    ]);

    expect(period.grossProfit).toBe(400_000);
    expect(period.netAssets).toBe(500_000);
    expect(period.hasEstimates).toBe(true);
    expect(period.grossMargin).toBeCloseTo(0.4, 6);
  });

  it('prefers the higher-confidence extraction when facts conflict', () => {
    const [period] = buildFinancialPeriods([
      { ...fact('revenue', 1_000_000, '2025-03-31', '2024-04-01'), confidence: 0.6, extractionMethod: 'pdf_text' },
      { ...fact('revenue', 1_100_000, '2025-03-31', '2024-04-01'), confidence: 0.98 },
    ]);
    expect(period.revenue).toBe(1_100_000);
  });

  it('attaches balance sheet instants to the matching year', () => {
    const periods = buildFinancialPeriods([
      fact('revenue', 1_000_000, '2025-03-31', '2024-04-01'),
      fact('cash', 250_000, '2025-03-31', null),
      fact('revenue', 900_000, '2024-03-31', '2023-04-01'),
    ]);
    expect(periods).toHaveLength(2);
    expect(periods[1].cash).toBe(250_000);
    expect(periods[0].cash).toBeNull();
  });
});

describe('determineVisibility', () => {
  it('is HIGH when revenue and profit are disclosed across years', () => {
    const dossier = fixtureDossier('01000001')!;
    expect(dossier.financials.financialVisibility).toBe('HIGH');
  });

  it('is MEDIUM when only a balance sheet is filed', () => {
    const dossier = fixtureDossier('01000005')!;
    expect(dossier.financials.financialVisibility).toBe('MEDIUM');
    expect(dossier.financials.latestRevenue).toBeNull();
  });

  it('is LOW when no accounts could be extracted', () => {
    expect(determineVisibility([])).toBe('LOW');
    expect(fixtureDossier('01000004')!.financials.financialVisibility).toBe('LOW');
  });
});

describe('summariseFinancials', () => {
  it('computes growth, margins and consistency for a full history', () => {
    const dossier = fixtureDossier('01000001')!;
    const summary = summariseFinancials(dossier.periods);

    expect(summary.periodsAvailable).toBe(4);
    expect(summary.latestRevenue).toBe(3_100_000);
    expect(summary.revenueCagr).toBeCloseTo(0.139, 2);
    expect(summary.latestOperatingMargin).toBeCloseTo(0.1387, 3);
    expect(summary.profitConsistency).toBe(1);
    expect(summary.revenueConsistency).toBe(1);
    expect(summary.revenuePerEmployee).toBeCloseTo(100_000, 0);
  });

  it('reports declining revenue and losses for a distressed company', () => {
    const summary = fixtureDossier('01000003')!.financials;
    expect(summary.revenueCagr).toBeLessThan(0);
    expect(summary.latestOperatingProfit).toBeLessThan(0);
    expect(summary.latestNetAssets).toBeLessThan(0);
    expect(summary.profitConsistency).toBe(0);
  });
});
