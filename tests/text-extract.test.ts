import { describe, expect, it } from 'vitest';
import { detectScale, extractFactsFromText } from '@/lib/accounts/text-extract';
import { extractJson } from '@/lib/ai/anthropic';

const PDF_TEXT = `DOWNLAND ELECTRICAL CONTRACTORS LIMITED
PROFIT AND LOSS ACCOUNT
For the year ended 28 February 2025

                                        Note        2025        2024
                                                   £'000       £'000
Turnover                                   2       1,890       1,805
Cost of sales                                     (1,298)     (1,246)
Gross profit                                         592         559
Administrative expenses                             (381)       (363)
Operating profit                                     211         196
Profit before taxation                               210         195
Profit for the financial year                        170         157

BALANCE SHEET
Cash at bank and in hand                             488         421
Current assets                                       870         806
Creditors: amounts falling due within one year      (305)       (300)
Net assets                                           845         770
Average number of employees                           15          15`;

describe('detectScale', () => {
  it("recognises £'000 presentation", () => {
    expect(detectScale(PDF_TEXT)).toBe(1000);
  });

  it('defaults to pounds', () => {
    expect(detectScale('Turnover 1,890,000')).toBe(1);
  });
});

describe('extractFactsFromText', () => {
  const { facts } = extractFactsFromText(PDF_TEXT, {
    periodEnd: '2025-02-28',
    periodStart: '2024-03-01',
    comparativePeriodEnd: '2024-02-29',
  });

  const value = (metric: string, periodEnd: string) =>
    facts.find((f) => f.metric === metric && f.periodEnd === periodEnd)?.value;

  it('scales figures presented in thousands back to pounds', () => {
    expect(value('revenue', '2025-02-28')).toBe(1_890_000);
    expect(value('operating_profit', '2025-02-28')).toBe(211_000);
  });

  it('reads the comparative column as the prior year', () => {
    expect(value('revenue', '2024-02-29')).toBe(1_805_000);
  });

  it('treats bracketed figures as negative', () => {
    expect(value('cost_of_sales', '2025-02-28')).toBe(-1_298_000);
  });

  it('does not scale the employee count', () => {
    expect(value('employee_count', '2025-02-28')).toBe(15);
  });

  it('marks text extraction as lower confidence than tagged data', () => {
    expect(facts.every((f) => f.confidence <= 0.7)).toBe(true);
    expect(facts.every((f) => f.extractionMethod === 'pdf_text')).toBe(true);
  });
});

describe('extractJson', () => {
  it('parses a bare JSON object', () => {
    const parsed = extractJson({ content: [{ type: 'text', text: '{"overall_assessment":"strong_candidate"}' }] });
    expect(parsed).toEqual({ overall_assessment: 'strong_candidate' });
  });

  it('parses JSON wrapped in prose or a code fence', () => {
    const parsed = extractJson({
      content: [{ type: 'text', text: 'Here is the result:\n```json\n{"risks":["key person"]}\n```\n' }],
    });
    expect(parsed).toEqual({ risks: ['key person'] });
  });

  it('returns null when there is no JSON', () => {
    expect(extractJson({ content: [{ type: 'text', text: 'I cannot answer that.' }] })).toBeNull();
  });

  it('returns null on malformed JSON rather than throwing', () => {
    expect(extractJson({ content: [{ type: 'text', text: '{"a": }' }] })).toBeNull();
  });
});
