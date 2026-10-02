import { describe, expect, it } from 'vitest';
import { fixtureDossier } from '@/lib/fixtures/dossier';
import { detectSignals } from '@/lib/signals';

const ASOF = '2026-01-01';

function types(companyNumber: string): string[] {
  return detectSignals(fixtureDossier(companyNumber, ASOF)!).map((s) => s.signalType);
}

describe('detectSignals', () => {
  it('detects ownership and succession signals for a long-standing owner', () => {
    const detected = types('01000007');
    expect(detected).toContain('OWNER_CONTROLLED');
    expect(detected).toContain('LONG_STANDING_OWNER');
    expect(detected).toContain('CONCENTRATED_OWNERSHIP');
    expect(detected).toContain('SOLE_DIRECTOR');
    expect(detected).toContain('LONG_ESTABLISHED');
  });

  it('detects financial strength signals', () => {
    const detected = types('01000001');
    expect(detected).toContain('STRONG_REVENUE_GROWTH');
    expect(detected).toContain('STRONG_PROFIT_GROWTH');
    expect(detected).toContain('CONSISTENTLY_PROFITABLE');
    expect(detected).toContain('STRONG_CASH_POSITION');
  });

  it('detects distress signals', () => {
    const detected = types('01000003');
    expect(detected).toContain('INSOLVENCY');
    expect(detected).toContain('DECLINING_REVENUE');
    expect(detected).toContain('LOSS_MAKING');
    expect(detected).toContain('NEGATIVE_NET_ASSETS');
    expect(detected).toContain('UNSATISFIED_CHARGES');
  });

  it('flags a corporate shareholder as an ownership caution', () => {
    expect(types('01000006')).toContain('INSTITUTIONAL_OWNERSHIP');
  });

  it('reports missing accounts without implying poor performance', () => {
    const signals = detectSignals(fixtureDossier('01000004', ASOF)!);
    const signal = signals.find((s) => s.signalType === 'NO_ACCOUNTS_AVAILABLE')!;
    expect(signal.severity).toBe('neutral');
    expect(signal.description).toMatch(/says nothing about performance/i);
  });

  it('names the signal succession, never retirement', () => {
    const all = detectSignals(fixtureDossier('01000007', ASOF)!);
    const text = JSON.stringify(all).toLowerCase();
    expect(text).not.toMatch(/retire|retirement/);
  });

  it('gives every signal a title, description and source', () => {
    for (const signal of detectSignals(fixtureDossier('01000001', ASOF)!)) {
      expect(signal.title).toBeTruthy();
      expect(signal.description).toBeTruthy();
      expect(signal.source).toBeTruthy();
    }
  });
});
