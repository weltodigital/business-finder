import { describe, expect, it } from 'vitest';
import { fixtureDossier } from '@/lib/fixtures/dossier';
import { detectSignals } from '@/lib/signals';
import { scoreCompany } from '@/lib/scoring';
import { DEFAULT_SCORING_CONFIG } from '@/lib/scoring/config';
import type { AcquisitionThesis } from '@/lib/types';

const THESIS: AcquisitionThesis = {
  name: 'Engineering — South East',
  industries: ['engineering', 'manufacturing'],
  sicCodes: ['25620', '25110', '28990', '43210', '25730'],
  geography: { locations: ['Hampshire', 'Surrey', 'West Sussex'] },
  revenueMin: 1_000_000,
  revenueMax: 5_000_000,
  employeeMin: 10,
  employeeMax: 100,
  companyAgeMin: 15,
  companyAgeMax: null,
  ownerManaged: true,
  excludeInsolvency: true,
  keywordsInclude: ['precision engineering', 'CNC', 'fabrication'],
  keywordsExclude: [],
};

const ASOF = '2026-01-01';

function score(companyNumber: string) {
  const dossier = fixtureDossier(companyNumber, ASOF)!;
  const signals = detectSignals(dossier);
  return scoreCompany(dossier, signals, { thesis: THESIS, asOf: ASOF });
}

describe('scoreCompany', () => {
  it('ranks an excellent target materially above a distressed one', () => {
    const excellent = score('01000001');
    const distressed = score('01000003');
    expect(excellent.total).toBeGreaterThan(distressed.total + 30);
  });

  it('is deterministic', () => {
    expect(score('01000001').total).toBe(score('01000001').total);
  });

  it('never exceeds the configured maximum', () => {
    for (const number of ['01000001', '01000002', '01000003', '01000004', '01000005', '01000006', '01000007']) {
      const result = score(number);
      expect(result.total).toBeLessThanOrEqual(DEFAULT_SCORING_CONFIG.max_score);
      expect(result.total).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps each component within its own bounds', () => {
    const result = score('01000001');
    for (const component of result.components) {
      if (component.key === 'risk_adjustment') {
        expect(component.score).toBeLessThanOrEqual(0);
        expect(component.score).toBeGreaterThanOrEqual(DEFAULT_SCORING_CONFIG.components.risk_adjustment.min);
      } else {
        expect(component.score).toBeLessThanOrEqual(component.max);
        expect(component.score).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('explains every component it scores', () => {
    const result = score('01000001');
    expect(result.components).toHaveLength(6);
    for (const component of result.components) {
      expect(component.reasons.length).toBeGreaterThan(0);
      for (const reason of component.reasons) {
        expect(reason.detail.length).toBeGreaterThan(0);
      }
    }
  });

  it('sums the components to the reported total', () => {
    const result = score('01000001');
    const sum = result.components.reduce((acc, c) => acc + c.score, 0);
    expect(result.total).toBeCloseTo(sum, 1);
  });

  it('does not penalise a company for missing accounts', () => {
    const missingAccounts = score('01000004');
    const financial = missingAccounts.components.find((c) => c.key === 'financial_quality')!;

    expect(missingAccounts.financialVisibility).toBe('LOW');
    expect(financial.score).toBe(DEFAULT_SCORING_CONFIG.components.financial_quality.unknown_score);
    expect(financial.reasons[0].detail).toMatch(/not a judgement on performance/i);
  });

  it('does not score a partially disclosed company below one that disclosed nothing', () => {
    const dossier = fixtureDossier('01000001', ASOF)!;
    // Micro-entity style accounts: a balance sheet but no profit and loss.
    dossier.financials = {
      ...dossier.financials,
      financialVisibility: 'MEDIUM',
      revenueCagr: null,
      latestOperatingMargin: null,
      profitConsistency: null,
      latestRevenue: null,
      latestCash: null,
      latestCurrentRatio: null,
      latestNetAssets: null,
    };
    const result = scoreCompany(dossier, detectSignals(dossier), { thesis: THESIS, asOf: ASOF });
    const financial = result.components.find((c) => c.key === 'financial_quality')!;

    expect(financial.score).toBe(DEFAULT_SCORING_CONFIG.components.financial_quality.unknown_score);
  });

  it('separates insufficient information from poor performance', () => {
    const missingAccounts = score('01000004');
    const distressed = score('01000003');
    const financialOf = (r: ReturnType<typeof score>) =>
      r.components.find((c) => c.key === 'financial_quality')!.score;

    expect(financialOf(missingAccounts)).toBeGreaterThan(financialOf(distressed));
  });

  it('scores owner-controlled companies above dispersed ownership', () => {
    const ownerControlled = score('01000007').components.find((c) => c.key === 'ownership')!;
    const dispersed = score('01000006').components.find((c) => c.key === 'ownership')!;
    expect(ownerControlled.score).toBeGreaterThan(dispersed.score);
  });

  it('gives a long-standing sole owner the strongest succession signal', () => {
    const succession = (n: string) => score(n).components.find((c) => c.key === 'succession_signal')!.score;
    expect(succession('01000007')).toBeGreaterThan(succession('01000006'));
    expect(succession('01000007')).toBeGreaterThan(succession('01000005'));
  });

  it('applies risk deductions for insolvency and losses', () => {
    const risk = score('01000003').components.find((c) => c.key === 'risk_adjustment')!;
    expect(risk.score).toBeLessThanOrEqual(-10 + 1);
    expect(risk.reasons.map((r) => r.label)).toContain('Insolvency');
  });

  it('scores a neutral fit when no thesis is supplied', () => {
    const dossier = fixtureDossier('01000001', ASOF)!;
    const result = scoreCompany(dossier, detectSignals(dossier), { asOf: ASOF });
    const fit = result.components.find((c) => c.key === 'acquisition_fit')!;
    expect(fit.score).toBe(fit.max / 2);
  });

  it('rewards a company that matches the thesis over one that does not', () => {
    const inArea = score('01000001').components.find((c) => c.key === 'acquisition_fit')!.score;
    const outOfArea = score('01000006').components.find((c) => c.key === 'acquisition_fit')!.score;
    expect(inArea).toBeGreaterThan(outOfArea);
  });
});
