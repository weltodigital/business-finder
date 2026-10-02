import type { Signal, SignalType } from '@/lib/signals';
import { yearsSince } from '@/lib/signals';
import type { AcquisitionThesis, CompanyDossier } from '@/lib/types';
import { DEFAULT_SCORING_CONFIG, SCORING_VERSION, scoreBand, type ScoringConfig } from './config';

export interface ScoreReason {
  label: string;
  points: number;
  detail: string;
}

export interface ScoreComponent {
  key:
    | 'financial_quality'
    | 'acquisition_fit'
    | 'ownership'
    | 'succession_signal'
    | 'company_quality'
    | 'risk_adjustment';
  label: string;
  score: number;
  max: number;
  reasons: ScoreReason[];
}

export interface ScoreResult {
  total: number;
  version: string;
  financialVisibility: 'HIGH' | 'MEDIUM' | 'LOW';
  components: ScoreComponent[];
}

export interface ScoreOptions {
  thesis?: AcquisitionThesis | null;
  config?: ScoringConfig;
  asOf?: string;
}

/**
 * The primary acquisition score. Deterministic and fully explainable — no LLM
 * is involved. Every point awarded carries the reason it was awarded.
 */
export function scoreCompany(
  dossier: CompanyDossier,
  signals: Signal[],
  options: ScoreOptions = {},
): ScoreResult {
  const config = options.config ?? DEFAULT_SCORING_CONFIG;
  const asOf = new Date(options.asOf ?? dossier.asOf ?? new Date().toISOString());
  const has = signalIndex(signals);

  const components: ScoreComponent[] = [
    financialQuality(dossier, config),
    acquisitionFit(dossier, options.thesis ?? null, config, asOf),
    ownership(dossier, has, config),
    successionSignal(dossier, config, asOf),
    companyQuality(dossier, has, config, asOf),
    riskAdjustment(dossier, has, config),
  ];

  const total = clamp(
    components.reduce((sum, c) => sum + c.score, 0),
    0,
    config.max_score,
  );

  return {
    total: round(total),
    version: SCORING_VERSION,
    financialVisibility: dossier.financials.financialVisibility,
    components,
  };
}

// ---------------------------------------------------------------------------

function financialQuality(dossier: CompanyDossier, config: ScoringConfig): ScoreComponent {
  const rules = config.components.financial_quality;
  const fin = dossier.financials;
  const reasons: ScoreReason[] = [];

  // Insufficient information is not bad performance. A company with no
  // extractable accounts gets a neutral score plus a LOW visibility flag,
  // rather than being pushed to the bottom of the list.
  if (fin.financialVisibility === 'LOW') {
    return {
      key: 'financial_quality',
      label: 'Financial quality',
      score: rules.unknown_score,
      max: rules.max,
      reasons: [
        {
          label: 'Insufficient financial information',
          points: rules.unknown_score,
          detail:
            'Not enough was disclosed to assess financial quality, so a neutral score is applied. Financial visibility is LOW — this is not a judgement on performance.',
        },
      ],
    };
  }

  // Every measure that cannot be assessed earns a neutral half-score, so a
  // partially disclosed company lands around the same midpoint as a LOW
  // visibility one and only moves away from it on what is actually disclosed.
  let score = 0;

  if (fin.revenueCagr !== null) {
    const points = scoreBand(fin.revenueCagr, rules.rules.revenue_cagr.bands);
    score += points;
    reasons.push({
      label: 'Revenue growth',
      points,
      detail: `Revenue CAGR of ${pct(fin.revenueCagr)} across ${fin.periodsAvailable} periods.`,
    });
  } else {
    const points = rules.rules.revenue_cagr.max / 2;
    score += points;
    reasons.push({
      label: 'Revenue growth',
      points,
      detail: 'Turnover is not disclosed, so growth cannot be measured. A neutral half-score is applied.',
    });
  }

  if (fin.latestOperatingMargin !== null) {
    const points = scoreBand(fin.latestOperatingMargin, rules.rules.operating_margin.bands);
    score += points;
    reasons.push({
      label: 'Operating margin',
      points,
      detail: `Latest operating margin of ${pct(fin.latestOperatingMargin)}.`,
    });
  } else {
    const points = rules.rules.operating_margin.max / 2;
    score += points;
    reasons.push({
      label: 'Operating margin',
      points,
      detail: 'Margin cannot be calculated without disclosed turnover. A neutral half-score is applied.',
    });
  }

  if (fin.profitConsistency !== null) {
    const points = scoreBand(fin.profitConsistency, rules.rules.profit_consistency.bands);
    score += points;
    reasons.push({
      label: 'Profit consistency',
      points,
      detail: `Profitable in ${Math.round(fin.profitConsistency * 100)}% of the periods on record.`,
    });
  } else {
    const points = rules.rules.profit_consistency.max / 2;
    score += points;
    reasons.push({
      label: 'Profit consistency',
      points,
      detail: 'Profit is not disclosed, so consistency cannot be measured. A neutral half-score is applied.',
    });
  }

  const cashRatio =
    fin.latestCash !== null && fin.latestRevenue && fin.latestRevenue > 0
      ? fin.latestCash / fin.latestRevenue
      : null;
  if (cashRatio !== null) {
    const points = scoreBand(cashRatio, rules.rules.cash_position.bands);
    score += points;
    reasons.push({
      label: 'Cash position',
      points,
      detail: `Cash equal to ${pct(cashRatio)} of revenue.`,
    });
  } else if (fin.latestCash !== null && fin.latestCash > 0) {
    const points = rules.rules.cash_position.max / 2;
    score += points;
    reasons.push({
      label: 'Cash position',
      points,
      detail: 'Cash is disclosed but cannot be sized against revenue. A neutral half-score is applied.',
    });
  } else if (fin.latestCash === null) {
    const points = rules.rules.cash_position.max / 2;
    score += points;
    reasons.push({
      label: 'Cash position',
      points,
      detail: 'Cash is not disclosed. A neutral half-score is applied.',
    });
  }

  if (fin.latestCurrentRatio !== null) {
    const points = scoreBand(fin.latestCurrentRatio, rules.rules.balance_sheet.bands);
    score += points;
    reasons.push({
      label: 'Balance sheet',
      points,
      detail: `Current ratio of ${fin.latestCurrentRatio.toFixed(2)}.`,
    });
  } else if (fin.latestNetAssets !== null) {
    const points = fin.latestNetAssets > 0 ? rules.rules.balance_sheet.max / 2 : 0;
    score += points;
    reasons.push({
      label: 'Balance sheet',
      points,
      detail: `Net assets of ${money(fin.latestNetAssets)}; no current ratio available.`,
    });
  } else {
    const points = rules.rules.balance_sheet.max / 2;
    score += points;
    reasons.push({
      label: 'Balance sheet',
      points,
      detail: 'No balance sheet figures are disclosed. A neutral half-score is applied.',
    });
  }

  return {
    key: 'financial_quality',
    label: 'Financial quality',
    score: round(clamp(score, 0, rules.max)),
    max: rules.max,
    reasons,
  };
}

function acquisitionFit(
  dossier: CompanyDossier,
  thesis: AcquisitionThesis | null,
  config: ScoringConfig,
  asOf: Date,
): ScoreComponent {
  const rules = config.components.acquisition_fit.rules;
  const max = config.components.acquisition_fit.max;
  const reasons: ScoreReason[] = [];
  let score = 0;

  if (!thesis) {
    // Without a thesis there is nothing to fit against; award the neutral
    // midpoint so companies are still comparable on everything else.
    return {
      key: 'acquisition_fit',
      label: 'Acquisition fit',
      score: round(max / 2),
      max,
      reasons: [
        { label: 'No thesis applied', points: round(max / 2), detail: 'Scored without an acquisition thesis, so fit is neutral.' },
      ],
    };
  }

  // Industry
  const sicMatch = thesis.sicCodes.length > 0 && dossier.company.sicCodes.some((s) => thesis.sicCodes.includes(s));
  const keywordMatch = matchesIndustryKeywords(dossier, thesis);
  if (sicMatch) {
    score += rules.industry;
    reasons.push({ label: 'Industry', points: rules.industry, detail: 'SIC code matches the thesis exactly.' });
  } else if (keywordMatch) {
    const points = rules.industry * 0.6;
    score += points;
    reasons.push({ label: 'Industry', points: round(points), detail: 'Business description or name matches the thesis industries or keywords.' });
  } else {
    reasons.push({ label: 'Industry', points: 0, detail: 'No SIC code or keyword match against the thesis.' });
  }

  // Geography
  const geoMatch = matchesGeography(dossier, thesis);
  if (geoMatch) {
    score += rules.geography;
    reasons.push({ label: 'Geography', points: rules.geography, detail: `Registered in ${dossier.company.region ?? dossier.company.postcode ?? 'the target area'}.` });
  } else {
    reasons.push({ label: 'Geography', points: 0, detail: 'Registered office falls outside the thesis area.' });
  }

  // Size
  const revenue = dossier.financials.latestRevenue;
  const employees = dossier.financials.latestEmployeeCount;
  const sizeFit = evaluateSize(revenue, employees, thesis);
  score += rules.size * sizeFit.fraction;
  reasons.push({ label: 'Size', points: round(rules.size * sizeFit.fraction), detail: sizeFit.detail });

  // Age
  const age = yearsSince(dossier.company.incorporationDate, asOf);
  if (age === null) {
    reasons.push({ label: 'Company age', points: 0, detail: 'Incorporation date unavailable.' });
  } else if (thesis.companyAgeMin !== null && age < thesis.companyAgeMin) {
    reasons.push({ label: 'Company age', points: 0, detail: `${Math.floor(age)} years old, below the ${thesis.companyAgeMin}-year minimum.` });
  } else if (thesis.companyAgeMax !== null && age > thesis.companyAgeMax) {
    const points = rules.age / 2;
    score += points;
    reasons.push({ label: 'Company age', points: round(points), detail: `${Math.floor(age)} years old, above the ${thesis.companyAgeMax}-year maximum.` });
  } else {
    score += rules.age;
    reasons.push({ label: 'Company age', points: rules.age, detail: `${Math.floor(age)} years old, within the thesis range.` });
  }

  return {
    key: 'acquisition_fit',
    label: 'Acquisition fit',
    score: round(clamp(score, 0, max)),
    max,
    reasons,
  };
}

function ownership(
  dossier: CompanyDossier,
  has: (type: SignalType) => boolean,
  config: ScoringConfig,
): ScoreComponent {
  const rules = config.components.ownership.rules;
  const max = config.components.ownership.max;
  const reasons: ScoreReason[] = [];
  let score = 0;

  if (has('OWNER_CONTROLLED')) {
    score += rules.owner_controlled;
    reasons.push({ label: 'Owner controlled', points: rules.owner_controlled, detail: 'An individual holds majority control.' });
  } else {
    reasons.push({ label: 'Owner controlled', points: 0, detail: 'No individual holds registered majority control.' });
  }

  if (has('CONCENTRATED_OWNERSHIP')) {
    score += rules.concentrated_ownership;
    reasons.push({ label: 'Concentrated ownership', points: rules.concentrated_ownership, detail: 'Control sits with one or two people.' });
  }

  if (has('LONG_STANDING_OWNER')) {
    score += rules.founder_or_long_standing_director;
    reasons.push({ label: 'Long-standing director', points: rules.founder_or_long_standing_director, detail: 'A director has been in place for 15 years or more.' });
  }

  if (!has('INSTITUTIONAL_OWNERSHIP')) {
    score += rules.no_institutional_owner;
    reasons.push({ label: 'No institutional owner', points: rules.no_institutional_owner, detail: 'No corporate or institutional PSC is registered.' });
  } else {
    reasons.push({ label: 'No institutional owner', points: 0, detail: 'A corporate entity is registered as a person with significant control.' });
  }

  return { key: 'ownership', label: 'Ownership', score: round(clamp(score, 0, max)), max, reasons };
}

function successionSignal(dossier: CompanyDossier, config: ScoringConfig, asOf: Date): ScoreComponent {
  const rules = config.components.succession_signal.rules;
  const max = config.components.succession_signal.max;
  const reasons: ScoreReason[] = [];
  let score = 0;

  const activeDirectors = dossier.directors.filter((d) => !d.resignedOn);
  const tenures = activeDirectors
    .map((d) => yearsSince(d.appointedOn, asOf))
    .filter((t): t is number => t !== null);
  const longestTenure = tenures.length ? Math.max(...tenures) : null;

  if (longestTenure !== null) {
    const points = scoreBand(longestTenure, rules.long_standing_director_years.bands);
    score += points;
    reasons.push({
      label: 'Director tenure',
      points,
      detail: `Longest-serving active director has ${Math.floor(longestTenure)} years of tenure.`,
    });
  }

  const age = yearsSince(dossier.company.incorporationDate, asOf);
  if (age !== null) {
    const points = scoreBand(age, rules.company_age_years.bands);
    score += points;
    reasons.push({ label: 'Business longevity', points, detail: `Trading history of ${Math.floor(age)} years.` });
  }

  if (activeDirectors.length > 0 && activeDirectors.length <= 2) {
    score += rules.few_directors.max;
    reasons.push({
      label: 'Small board',
      points: rules.few_directors.max,
      detail: `${activeDirectors.length} active director${activeDirectors.length === 1 ? '' : 's'} — a transaction would involve few parties.`,
    });
  }

  const activePscs = dossier.pscs.filter((p) => !p.ceasedOn);
  if (activePscs.some((p) => p.controlPercentFloor >= 75)) {
    score += rules.concentrated_control.max;
    reasons.push({
      label: 'Concentrated control',
      points: rules.concentrated_control.max,
      detail: 'A single person holds 75% or more of the shares or voting rights.',
    });
  }

  return {
    key: 'succession_signal',
    label: 'Succession signal',
    score: round(clamp(score, 0, max)),
    max,
    reasons,
  };
}

function companyQuality(
  dossier: CompanyDossier,
  has: (type: SignalType) => boolean,
  config: ScoringConfig,
  asOf: Date,
): ScoreComponent {
  const rules = config.components.company_quality.rules;
  const max = config.components.company_quality.max;
  const reasons: ScoreReason[] = [];
  let score = 0;

  const age = yearsSince(dossier.company.incorporationDate, asOf);
  if (age !== null && age >= 10) {
    const points = age >= 20 ? rules.longevity : rules.longevity * 0.6;
    score += points;
    reasons.push({ label: 'Longevity', points: round(points), detail: `${Math.floor(age)} years of trading history.` });
  }

  if (dossier.enrichment?.website) {
    const points = dossier.enrichment.businessDescription ? rules.web_presence : rules.web_presence / 2;
    score += points;
    reasons.push({ label: 'Web presence', points: round(points), detail: `Website identified at ${dossier.enrichment.website}.` });
  }

  const rating = dossier.enrichment?.googleRating ?? null;
  const reviews = dossier.enrichment?.googleReviewCount ?? 0;
  if (rating !== null && reviews >= 5) {
    const points = rating >= 4.5 ? rules.reputation : rating >= 4.0 ? rules.reputation * 0.6 : 0;
    score += points;
    reasons.push({ label: 'Reputation', points: round(points), detail: `${rating.toFixed(1)} from ${reviews} Google reviews.` });
  }

  const employees = dossier.financials.latestEmployeeCount;
  if (employees !== null && employees >= 5) {
    const points = employees >= 15 ? rules.employees : rules.employees * 0.5;
    score += points;
    reasons.push({ label: 'Employees', points: round(points), detail: `${Math.round(employees)} employees reported in the accounts.` });
  }

  if (!has('LATE_FILING')) {
    score += rules.filing_discipline;
    reasons.push({ label: 'Filing discipline', points: rules.filing_discipline, detail: 'Filings are up to date.' });
  }

  return { key: 'company_quality', label: 'Company quality', score: round(clamp(score, 0, max)), max, reasons };
}

function riskAdjustment(
  dossier: CompanyDossier,
  has: (type: SignalType) => boolean,
  config: ScoringConfig,
): ScoreComponent {
  const rules = config.components.risk_adjustment.rules;
  const min = config.components.risk_adjustment.min;
  const reasons: ScoreReason[] = [];
  let score = 0;

  const apply = (key: string, condition: boolean, detail: string) => {
    if (!condition) return;
    const points = rules[key] ?? 0;
    score += points;
    reasons.push({ label: humanise(key), points, detail });
  };

  apply('insolvency', has('INSOLVENCY'), 'Companies House records insolvency proceedings.');
  apply(
    'dissolved_or_inactive',
    (dossier.company.status ?? 'active') !== 'active',
    `Company status is "${dossier.company.status}".`,
  );
  apply('repeated_late_filings', has('LATE_FILING'), 'Accounts or confirmation statement are overdue.');
  apply('recent_unsatisfied_charge', has('NEW_CHARGE'), 'A charge was registered in the last 12 months and remains outstanding.');
  apply('high_director_turnover', has('DIRECTOR_TURNOVER'), 'Several directors have resigned recently.');
  apply('declining_revenue', has('DECLINING_REVENUE'), 'Revenue has declined over the available period.');
  apply('loss_making_latest', has('LOSS_MAKING'), 'The most recent accounts show an operating loss.');
  apply('negative_net_assets', has('NEGATIVE_NET_ASSETS'), 'Liabilities exceed assets.');

  if (reasons.length === 0) {
    reasons.push({ label: 'No material risks detected', points: 0, detail: 'No insolvency, late filings, charges or negative trends were found.' });
  }

  return {
    key: 'risk_adjustment',
    label: 'Risk adjustment',
    score: round(clamp(score, min, 0)),
    max: 0,
    reasons,
  };
}

// ---------------------------------------------------------------------------

function signalIndex(signals: Signal[]): (type: SignalType) => boolean {
  const set = new Set(signals.map((s) => s.signalType));
  return (type) => set.has(type);
}

function matchesIndustryKeywords(dossier: CompanyDossier, thesis: AcquisitionThesis): boolean {
  const haystack = [
    dossier.company.name,
    dossier.enrichment?.businessDescription,
    ...(dossier.enrichment?.services ?? []),
    ...(dossier.enrichment?.industries ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (!haystack) return false;

  const needles = [...thesis.industries, ...thesis.keywordsInclude].map((k) => k.toLowerCase()).filter(Boolean);
  if (needles.length === 0) return false;
  return needles.some((needle) => haystack.includes(needle));
}

function matchesGeography(dossier: CompanyDossier, thesis: AcquisitionThesis): boolean {
  const locations = (thesis.geography.locations ?? []).map((l) => l.toLowerCase()).filter(Boolean);
  const prefixes = (thesis.geography.postcodePrefixes ?? []).map((p) => p.toUpperCase()).filter(Boolean);
  if (locations.length === 0 && prefixes.length === 0) return true;

  const postcode = (dossier.company.postcode ?? '').toUpperCase().replace(/\s+/g, '');
  if (prefixes.some((prefix) => postcode.startsWith(prefix.replace(/\s+/g, '')))) return true;

  const address = [
    dossier.company.region,
    dossier.company.postcode,
    ...Object.values(dossier.company.registeredAddress ?? {}),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return locations.some((location) => address.includes(location));
}

function evaluateSize(
  revenue: number | null,
  employees: number | null,
  thesis: AcquisitionThesis,
): { fraction: number; detail: string } {
  if (revenue !== null) {
    const belowMin = thesis.revenueMin !== null && revenue < thesis.revenueMin;
    const aboveMax = thesis.revenueMax !== null && revenue > thesis.revenueMax;
    if (!belowMin && !aboveMax) {
      return { fraction: 1, detail: `Revenue of ${money(revenue)} is within the thesis range.` };
    }
    // Just outside the band still deserves partial credit — the range is a
    // preference, not a hard filter, once a company is being scored.
    const bound = belowMin ? thesis.revenueMin! : thesis.revenueMax!;
    const distance = Math.abs(revenue - bound) / bound;
    const fraction = distance <= 0.25 ? 0.5 : 0;
    return {
      fraction,
      detail: `Revenue of ${money(revenue)} is ${belowMin ? 'below' : 'above'} the thesis range.`,
    };
  }

  if (employees !== null && (thesis.employeeMin !== null || thesis.employeeMax !== null)) {
    const belowMin = thesis.employeeMin !== null && employees < thesis.employeeMin;
    const aboveMax = thesis.employeeMax !== null && employees > thesis.employeeMax;
    if (!belowMin && !aboveMax) {
      return { fraction: 0.75, detail: `${Math.round(employees)} employees, within the thesis range (revenue not disclosed).` };
    }
    return { fraction: 0, detail: `${Math.round(employees)} employees, outside the thesis range.` };
  }

  return { fraction: 0.5, detail: 'Size cannot be assessed — neither turnover nor employee numbers are disclosed.' };
}

function humanise(key: string): string {
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function money(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}m`;
  if (Math.abs(value) >= 1_000) return `£${Math.round(value / 1_000)}k`;
  return `£${Math.round(value)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
