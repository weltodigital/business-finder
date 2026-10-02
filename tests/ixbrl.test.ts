import { describe, expect, it } from 'vitest';
import { parseNumeric, parseXbrl } from '@/lib/accounts/ixbrl';

const IXBRL_ACCOUNTS = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:core="http://xbrl.frc.org.uk/fr/2021-01-01/core">
  <head>
    <ix:header>
      <ix:resources>
        <xbrli:context id="FY2025">
          <xbrli:period>
            <xbrli:startDate>2024-04-01</xbrli:startDate>
            <xbrli:endDate>2025-03-31</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>
        <xbrli:context id="FY2024">
          <xbrli:period>
            <xbrli:startDate>2023-04-01</xbrli:startDate>
            <xbrli:endDate>2024-03-31</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>
        <xbrli:context id="BS2025">
          <xbrli:period><xbrli:instant>2025-03-31</xbrli:instant></xbrli:period>
        </xbrli:context>
        <xbrli:context id="SEGMENT2025">
          <xbrli:entity>
            <xbrli:segment>
              <xbrldi:explicitMember xmlns:xbrldi="http://xbrl.org/2006/xbrldi"
                dimension="core:ProductsServicesDimension">core:Widgets</xbrldi:explicitMember>
            </xbrli:segment>
          </xbrli:entity>
          <xbrli:period>
            <xbrli:startDate>2024-04-01</xbrli:startDate>
            <xbrli:endDate>2025-03-31</xbrli:endDate>
          </xbrli:period>
        </xbrli:context>
        <xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
      </ix:resources>
    </ix:header>
  </head>
  <body>
    <p>Turnover
      <ix:nonFraction name="core:TurnoverRevenue" contextRef="FY2025" unitRef="GBP" scale="3" decimals="0">3,100</ix:nonFraction>
      <ix:nonFraction name="core:TurnoverRevenue" contextRef="FY2024" unitRef="GBP" scale="3" decimals="0">2,800</ix:nonFraction>
    </p>
    <p>Operating profit
      <ix:nonFraction name="core:OperatingProfitLoss" contextRef="FY2025" unitRef="GBP" scale="3">430</ix:nonFraction>
    </p>
    <p>Segmental turnover (should be ignored)
      <ix:nonFraction name="core:TurnoverRevenue" contextRef="SEGMENT2025" unitRef="GBP" scale="3">1,200</ix:nonFraction>
    </p>
    <p>Cash at bank
      <ix:nonFraction name="core:CashBankOnHand" contextRef="BS2025" unitRef="GBP" scale="3">620</ix:nonFraction>
    </p>
    <p>Loss on disposal
      <ix:nonFraction name="core:ProfitLoss" contextRef="FY2025" unitRef="GBP" scale="3" sign="-">347</ix:nonFraction>
    </p>
  </body>
</html>`;

const PLAIN_XBRL = `<?xml version="1.0"?>
<xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance"
            xmlns:core="http://xbrl.frc.org.uk/fr/2021-01-01/core">
  <xbrli:context id="d1">
    <xbrli:period>
      <xbrli:startDate>2023-01-01</xbrli:startDate>
      <xbrli:endDate>2023-12-31</xbrli:endDate>
    </xbrli:period>
  </xbrli:context>
  <xbrli:unit id="GBP"><xbrli:measure>iso4217:GBP</xbrli:measure></xbrli:unit>
  <core:Turnover contextRef="d1" unitRef="GBP">1490000</core:Turnover>
  <core:OperatingProfitLoss contextRef="d1" unitRef="GBP">55000</core:OperatingProfitLoss>
</xbrli:xbrl>`;

describe('parseXbrl', () => {
  it('extracts tagged facts with their reporting periods', () => {
    const { facts, method } = parseXbrl(IXBRL_ACCOUNTS);
    expect(method).toBe('ixbrl');

    const revenue2025 = facts.find((f) => f.metric === 'revenue' && f.periodEnd === '2025-03-31');
    expect(revenue2025?.value).toBe(3_100_000);
    expect(revenue2025?.periodStart).toBe('2024-04-01');
    expect(revenue2025?.currency).toBe('GBP');
  });

  it('keeps the comparative year as a separate fact', () => {
    const { facts } = parseXbrl(IXBRL_ACCOUNTS);
    const revenue2024 = facts.find((f) => f.metric === 'revenue' && f.periodEnd === '2024-03-31');
    expect(revenue2024?.value).toBe(2_800_000);
  });

  it('ignores dimensioned (segmental) contexts', () => {
    const { facts } = parseXbrl(IXBRL_ACCOUNTS);
    const revenues = facts.filter((f) => f.metric === 'revenue').map((f) => f.value);
    expect(revenues).not.toContain(1_200_000);
    expect(revenues).toHaveLength(2);
  });

  it('applies the sign attribute', () => {
    const { facts } = parseXbrl(IXBRL_ACCOUNTS);
    expect(facts.find((f) => f.metric === 'net_profit')?.value).toBe(-347_000);
  });

  it('derives liabilities when TotalLiabilities is really the balance sheet total', () => {
    const doc = `<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance">
      <xbrli:context id="BS"><xbrli:period><xbrli:instant>2024-05-31</xbrli:instant></xbrli:period></xbrli:context>
      <ix:nonFraction name="core:TotalAssets" contextRef="BS" unitRef="GBP">139,374</ix:nonFraction>
      <ix:nonFraction name="core:TotalLiabilities" contextRef="BS" unitRef="GBP">139,374</ix:nonFraction>
      <ix:nonFraction name="core:Equity" contextRef="BS" unitRef="GBP">65,022</ix:nonFraction>
    </html>`;
    const { facts } = parseXbrl(doc);
    const liabilities = facts.find((f) => f.metric === 'total_liabilities');
    expect(liabilities?.value).toBe(74_352);
    expect(liabilities?.isReported).toBe(false);
  });

  it('treats instant contexts as balance sheet dates', () => {
    const { facts } = parseXbrl(IXBRL_ACCOUNTS);
    const cash = facts.find((f) => f.metric === 'cash');
    expect(cash?.value).toBe(620_000);
    expect(cash?.isInstant).toBe(true);
    expect(cash?.periodStart).toBeNull();
  });

  it('parses plain XBRL instance documents', () => {
    const { facts, method } = parseXbrl(PLAIN_XBRL);
    expect(method).toBe('xbrl');
    expect(facts.find((f) => f.metric === 'revenue')?.value).toBe(1_490_000);
    expect(facts.find((f) => f.metric === 'operating_profit')?.value).toBe(55_000);
  });
});

describe('parseNumeric', () => {
  it('handles thousands separators and scale', () => {
    expect(parseNumeric('3,100', { scale: '3' })?.value).toBe(3_100_000);
  });

  it('treats bracketed figures as negative', () => {
    expect(parseNumeric('(1,250)')?.value).toBe(-1250);
  });

  it('rejects non-numeric content', () => {
    expect(parseNumeric('not disclosed')).toBeNull();
  });

  it('reads a dash as zero', () => {
    expect(parseNumeric('-')?.value).toBe(0);
  });
});
