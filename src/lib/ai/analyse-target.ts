import { z } from 'zod';
import { requireLlmProvider } from './index';
import { formatGbp, type Signal } from '@/lib/signals';
import type { ScoreResult } from '@/lib/scoring';
import type { AcquisitionThesis, CompanyDossier } from '@/lib/types';

export const OVERALL_ASSESSMENTS = [
  'strong_candidate',
  'worth_investigating',
  'marginal',
  'not_a_fit',
  'insufficient_information',
] as const;

const analysisSchema = z.object({
  overall_assessment: z.enum(OVERALL_ASSESSMENTS),
  summary: z.string(),
  why_interesting: z.array(z.string()),
  financial_analysis: z.string(),
  ownership_analysis: z.string(),
  succession_analysis: z.string(),
  risks: z.array(z.string()),
  unknowns: z.array(z.string()),
  questions_to_investigate: z.array(z.string()),
  recommended_next_step: z.string(),
  outreach_angle: z.string(),
});

export type TargetAnalysis = z.infer<typeof analysisSchema>;

const JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'overall_assessment',
    'summary',
    'why_interesting',
    'financial_analysis',
    'ownership_analysis',
    'succession_analysis',
    'risks',
    'unknowns',
    'questions_to_investigate',
    'recommended_next_step',
    'outreach_angle',
  ],
  properties: {
    overall_assessment: { type: 'string', enum: [...OVERALL_ASSESSMENTS] },
    summary: { type: 'string', description: 'Two or three sentences on what this business is and why it is or is not interesting.' },
    why_interesting: { type: 'array', items: { type: 'string' } },
    financial_analysis: { type: 'string' },
    ownership_analysis: { type: 'string' },
    succession_analysis: { type: 'string', description: 'Structural succession signals only — never a claim about anyone wanting to retire.' },
    risks: { type: 'array', items: { type: 'string' } },
    unknowns: { type: 'array', items: { type: 'string' }, description: 'What the filings do not tell us.' },
    questions_to_investigate: { type: 'array', items: { type: 'string' } },
    recommended_next_step: { type: 'string' },
    outreach_angle: { type: 'string', description: 'A specific, factual reason to make contact. No flattery, no invented detail.' },
  },
} as const;

const SYSTEM_PROMPT = `You assess UK companies as potential off-market acquisition targets for a single acquirer.

You are given data extracted from Companies House filings, a computed financial history, detected signals and a deterministic acquisition score. Your job is to interpret that evidence — not to replace it.

Rules you must follow exactly:
1. Never invent a figure. If turnover, profit, headcount or valuation is not in the data provided, treat it as unknown and say so.
2. Distinguish clearly between (a) verified facts from filings, (b) your reasonable interpretation, and (c) what is unknown. Use hedged language for interpretation ("this pattern is consistent with…").
3. Never claim to know an owner's intentions. You may describe structural succession signals — long tenure, concentrated ownership, company age. You may not say or imply that someone wants to sell or retire.
4. Missing financial information is not bad performance. If financial visibility is LOW, say the accounts do not disclose enough to judge, and set overall_assessment to "insufficient_information" only when the gap genuinely prevents an assessment.
5. Do not invent business characteristics, customers, contracts or market position that are not in the supplied data.
6. Keep the outreach angle specific and factual — something an owner would recognise as true about their own business.
7. Populate "unknowns" honestly; an empty unknowns list is almost never correct.`;

export interface AnalyseTargetInput {
  dossier: CompanyDossier;
  signals: Signal[];
  score: ScoreResult;
  thesis: AcquisitionThesis | null;
}

export interface AnalyseTargetResult {
  analysis: TargetAnalysis;
  model: string;
}

/** Expensive: only run this for shortlisted companies. */
export async function analyseTarget(input: AnalyseTargetInput): Promise<AnalyseTargetResult> {
  const provider = requireLlmProvider();

  const { data, model } = await provider.completeJson({
    system: SYSTEM_PROMPT,
    input: buildBriefing(input),
    schema: JSON_SCHEMA as unknown as Record<string, unknown>,
    validator: analysisSchema,
    effort: 'high',
  });

  return { analysis: data, model };
}

/** Renders the dossier as a compact, unambiguous briefing for the model. */
export function buildBriefing({ dossier, signals, score, thesis }: AnalyseTargetInput): string {
  const c = dossier.company;
  const fin = dossier.financials;
  const lines: string[] = [];

  if (thesis) {
    lines.push('## Acquisition thesis');
    lines.push(`Name: ${thesis.name}`);
    if (thesis.industries.length) lines.push(`Industries: ${thesis.industries.join(', ')}`);
    if (thesis.geography.locations?.length) lines.push(`Geography: ${thesis.geography.locations.join(', ')}`);
    lines.push(
      `Revenue range: ${thesis.revenueMin ? formatGbp(thesis.revenueMin) : 'any'} to ${thesis.revenueMax ? formatGbp(thesis.revenueMax) : 'any'}`,
    );
    if (thesis.companyAgeMin) lines.push(`Minimum company age: ${thesis.companyAgeMin} years`);
    lines.push(`Owner-managed preferred: ${thesis.ownerManaged ? 'yes' : 'no'}`);
    lines.push('');
  }

  lines.push('## Company (Companies House)');
  lines.push(`Name: ${c.name ?? 'Unknown'}`);
  lines.push(`Company number: ${c.companyNumber}`);
  lines.push(`Status: ${c.status ?? 'unknown'}`);
  lines.push(`Type: ${c.companyType ?? 'unknown'}`);
  lines.push(`Incorporated: ${c.incorporationDate ?? 'unknown'}`);
  lines.push(`SIC codes: ${c.sicCodes.join(', ') || 'none recorded'}`);
  lines.push(`Registered office: ${[c.postcode, c.region].filter(Boolean).join(', ') || 'unknown'}`);
  lines.push(`Insolvency history: ${c.hasInsolvencyHistory ? 'yes' : 'no'}`);
  lines.push('');

  lines.push('## Financial history');
  lines.push(`Financial visibility: ${fin.financialVisibility}`);
  if (dossier.periods.length === 0) {
    lines.push('No financial figures could be extracted from the filed accounts.');
  } else {
    lines.push('Period end | Revenue | Operating profit | Net profit | Cash | Net assets | Employees');
    for (const period of dossier.periods) {
      lines.push(
        [
          period.periodEnd,
          fmt(period.revenue),
          fmt(period.operatingProfit),
          fmt(period.netProfit),
          fmt(period.cash),
          fmt(period.netAssets),
          period.employeeCount ?? 'not disclosed',
        ].join(' | '),
      );
    }
    lines.push('');
    lines.push(`Revenue CAGR: ${pct(fin.revenueCagr)}`);
    lines.push(`Operating profit CAGR: ${pct(fin.operatingProfitCagr)}`);
    lines.push(`Latest operating margin: ${pct(fin.latestOperatingMargin)}`);
    lines.push(`Profitable periods: ${fin.profitConsistency === null ? 'unknown' : `${Math.round(fin.profitConsistency * 100)}%`}`);
  }
  lines.push('');

  lines.push('## Directors');
  for (const director of dossier.directors.filter((d) => !d.resignedOn)) {
    lines.push(
      `- ${director.name} (${director.role ?? 'director'}), appointed ${director.appointedOn ?? 'unknown'}${director.occupation ? `, occupation: ${director.occupation}` : ''}`,
    );
  }
  const resigned = dossier.directors.filter((d) => d.resignedOn);
  if (resigned.length) {
    lines.push(`Resigned directors: ${resigned.map((d) => `${d.name} (${d.resignedOn})`).join('; ')}`);
  }
  lines.push('');

  lines.push('## Persons with significant control');
  if (dossier.pscs.length === 0) lines.push('None recorded.');
  for (const psc of dossier.pscs) {
    lines.push(
      `- ${psc.name ?? 'Unnamed'} (${psc.kind ?? 'unknown kind'}), control from ${psc.controlPercentFloor}%, notified ${psc.notifiedOn ?? 'unknown'}${psc.ceasedOn ? `, ceased ${psc.ceasedOn}` : ''}`,
    );
  }
  lines.push('');

  if (dossier.charges.length) {
    lines.push('## Charges');
    for (const charge of dossier.charges) {
      lines.push(
        `- ${charge.status ?? 'unknown status'}, created ${charge.createdOn ?? 'unknown'}, in favour of ${charge.personsEntitled.join(', ') || 'unknown'}`,
      );
    }
    lines.push('');
  }

  lines.push('## Recent filings');
  for (const filing of dossier.filings.slice(0, 10)) {
    lines.push(`- ${filing.filingDate ?? 'unknown'} ${filing.category ?? ''} ${filing.description ?? ''}`.trim());
  }
  lines.push('');

  lines.push('## Detected signals');
  for (const signal of signals) {
    lines.push(`- [${signal.severity}] ${signal.title}: ${signal.description}`);
  }
  lines.push('');

  if (dossier.enrichment?.website) {
    lines.push('## Website (unverified, scraped)');
    lines.push(`URL: ${dossier.enrichment.website}`);
    if (dossier.enrichment.businessDescription) lines.push(`Description: ${dossier.enrichment.businessDescription}`);
    if (dossier.enrichment.services.length) lines.push(`Services listed: ${dossier.enrichment.services.slice(0, 15).join('; ')}`);
    if (dossier.enrichment.googleRating !== null) {
      lines.push(`Google rating: ${dossier.enrichment.googleRating} from ${dossier.enrichment.googleReviewCount ?? 0} reviews`);
    }
    lines.push('');
  }

  lines.push('## Deterministic acquisition score');
  lines.push(`Total: ${score.total}/100 (financial visibility ${score.financialVisibility})`);
  for (const component of score.components) {
    lines.push(`- ${component.label}: ${component.score}/${component.max}`);
    for (const reason of component.reasons) {
      lines.push(`    · ${reason.label} (${reason.points > 0 ? '+' : ''}${reason.points}): ${reason.detail}`);
    }
  }

  return lines.join('\n');
}

function fmt(value: number | null): string {
  return value === null ? 'not disclosed' : formatGbp(value);
}

function pct(value: number | null): string {
  return value === null ? 'not available' : `${(value * 100).toFixed(1)}%`;
}
