import { z } from 'zod';
import { getLlmProvider } from '@/lib/ai';
import { log } from '@/lib/logger';
import { FINANCIAL_METRICS, INSTANT_METRICS, type ExtractedFact, type FinancialMetric } from './metrics';

const MAX_INPUT_CHARS = 120_000;

const factSchema = z.object({
  metric: z.enum(FINANCIAL_METRICS),
  value: z.number(),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  source_excerpt: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

const responseSchema = z.object({
  currency: z.string().nullable(),
  units: z.enum(['pounds', 'thousands', 'millions', 'unknown']),
  facts: z.array(factSchema),
  notes: z.string().nullable(),
});

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['currency', 'units', 'facts', 'notes'],
  properties: {
    currency: { type: ['string', 'null'], description: 'ISO currency code of the figures, e.g. GBP.' },
    units: { type: 'string', enum: ['pounds', 'thousands', 'millions', 'unknown'] },
    notes: { type: ['string', 'null'], description: 'Anything the reader should know about the extraction.' },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['metric', 'value', 'period_start', 'period_end', 'source_excerpt', 'confidence'],
        properties: {
          metric: { type: 'string', enum: [...FINANCIAL_METRICS] },
          value: { type: 'number', description: 'The figure exactly as reported, before unit scaling.' },
          period_start: { type: ['string', 'null'], description: 'YYYY-MM-DD, or null for balance sheet items.' },
          period_end: { type: ['string', 'null'], description: 'YYYY-MM-DD.' },
          source_excerpt: { type: ['string', 'null'], description: 'The line of the accounts this came from.' },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
        },
      },
    },
  },
} as const;

const SYSTEM_PROMPT = `You extract financial figures from UK company accounts filed at Companies House.

Rules you must follow exactly:
- Only report figures that appear in the document. Never estimate, infer or calculate a figure that is not printed.
- If a figure is not disclosed (common in filleted, abridged and micro-entity accounts), simply omit that metric. Do not guess.
- Small UK companies frequently do not disclose turnover. Omitting revenue is the correct answer in that case.
- Report each figure once per accounting period. Include the comparative (prior year) column as separate facts with that period's dates.
- Report values exactly as printed, and state the presentation units separately in the "units" field. Do not rescale figures yourself.
- Bracketed figures are negative.
- Balance sheet items (cash, assets, liabilities, net assets) have a period_end (the balance sheet date) and a null period_start.
- Profit and loss items have both period_start and period_end.
- Set confidence below 0.7 when the label is ambiguous or the column headings are unclear.`;

export interface LlmExtractionResult {
  facts: ExtractedFact[];
  notes: string | null;
  model: string;
  truncated: boolean;
}

/**
 * Last-resort extraction for documents with no tagged data. Only called when
 * XBRL and text heuristics have both failed — LLM calls are the expensive step.
 */
export async function extractFactsWithLlm(
  documentText: string,
  context: { companyName?: string; periodEnd?: string | null },
): Promise<LlmExtractionResult | null> {
  const provider = getLlmProvider();
  if (!provider) return null;

  const truncated = documentText.length > MAX_INPUT_CHARS;
  const text = truncated ? documentText.slice(0, MAX_INPUT_CHARS) : documentText;

  if (truncated) {
    await log({
      level: 'warn',
      scope: 'accounts-extraction',
      message: 'Accounts document exceeded the LLM input limit and was clipped',
      context: { companyName: context.companyName, length: documentText.length },
    });
  }

  const input = [
    context.companyName ? `Company: ${context.companyName}` : null,
    context.periodEnd ? `Expected latest period end: ${context.periodEnd}` : null,
    '',
    'Accounts document text:',
    text,
  ]
    .filter(Boolean)
    .join('\n');

  const { data, model } = await provider.completeJson({
    system: SYSTEM_PROMPT,
    input,
    schema: JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: responseSchema,
    effort: 'medium',
  });

  const scale = data.units === 'thousands' ? 1_000 : data.units === 'millions' ? 1_000_000 : 1;

  const facts: ExtractedFact[] = data.facts.map((fact) => {
    const metric = fact.metric as FinancialMetric;
    const isCount = metric === 'employee_count';
    return {
      metric,
      value: isCount ? fact.value : fact.value * scale,
      currency: isCount ? undefined : (data.currency ?? 'GBP'),
      periodStart: fact.period_start,
      periodEnd: fact.period_end,
      isInstant: INSTANT_METRICS.has(metric),
      scale: scale === 1 ? 0 : Math.log10(scale),
      sourceLocation: fact.source_excerpt ?? undefined,
      extractionMethod: 'llm',
      // Capped below XBRL and text extraction: this is interpretation, not tagging.
      confidence: Math.min(fact.confidence, 0.85),
      isReported: true,
      isEstimated: false,
    };
  });

  return { facts, notes: data.notes, model, truncated };
}
