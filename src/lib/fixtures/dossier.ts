import { buildFinancialPeriods } from '@/lib/accounts/normalise';
import type { ExtractedFact, FinancialMetric } from '@/lib/accounts/metrics';
import { INSTANT_METRICS } from '@/lib/accounts/metrics';
import { controlPercentFloor } from '@/lib/companies-house/psc';
import { summariseFinancials } from '@/lib/financials/analytics';
import type { CompanyDossier } from '@/lib/types';
import { FIXTURES, type CompanyFixture, type FixtureFinancialYear } from './companies';

const FLOW_FIELDS: FinancialMetric[] = [
  'revenue',
  'cost_of_sales',
  'gross_profit',
  'operating_profit',
  'profit_before_tax',
  'net_profit',
  'employee_count',
];

/** Builds a full dossier from a fixture, for tests, seeding and offline UI work. */
export function fixtureDossier(companyNumber: string, asOf = '2026-01-01'): CompanyDossier | null {
  const fixture = FIXTURES[companyNumber];
  if (!fixture) return null;
  return dossierFromFixture(fixture, asOf);
}

export function dossierFromFixture(fixture: CompanyFixture, asOf = '2026-01-01'): CompanyDossier {
  const facts = fixture.financials.flatMap(factsForYear);
  const periods = buildFinancialPeriods(facts);
  const address = fixture.profile.registered_office_address ?? {};

  return {
    company: {
      companyNumber: fixture.profile.company_number,
      name: fixture.profile.company_name ?? null,
      status: fixture.profile.company_status ?? null,
      companyType: fixture.profile.type ?? null,
      incorporationDate: fixture.profile.date_of_creation ?? null,
      sicCodes: fixture.profile.sic_codes ?? [],
      registeredAddress: { ...address },
      postcode: address.postal_code ?? null,
      region: address.region ?? null,
      country: address.country ?? null,
      hasInsolvencyHistory: Boolean(fixture.profile.has_insolvency_history),
      hasCharges: Boolean(fixture.profile.has_charges),
      accountsMeta: fixture.profile.accounts ?? null,
      confirmationStatementMeta: fixture.profile.confirmation_statement ?? null,
    },
    directors: fixture.officers.map((officer) => ({
      name: officer.name ?? 'Unknown',
      officerId: null,
      role: officer.officer_role ?? null,
      appointedOn: officer.appointed_on ?? null,
      resignedOn: officer.resigned_on ?? null,
      nationality: officer.nationality ?? null,
      occupation: officer.occupation ?? null,
      countryOfResidence: officer.country_of_residence ?? null,
      dateOfBirth: officer.date_of_birth ?? null,
    })),
    pscs: fixture.pscs.map((psc) => ({
      name: psc.name ?? null,
      pscType: psc.kind ?? null,
      kind: psc.kind ?? null,
      natureOfControl: psc.natures_of_control ?? [],
      notifiedOn: psc.notified_on ?? null,
      ceasedOn: psc.ceased_on ?? null,
      controlPercentFloor: controlPercentFloor(psc.natures_of_control ?? []),
    })),
    filings: fixture.filings.map((filing) => ({
      transactionId: filing.transaction_id,
      category: filing.category ?? null,
      filingType: filing.type ?? null,
      description: filing.description ?? null,
      filingDate: filing.date ?? null,
      documentId: null,
    })),
    charges: fixture.charges.map((charge) => ({
      chargeId: charge.id ?? '',
      createdOn: charge.created_on ?? null,
      deliveredOn: charge.delivered_on ?? null,
      satisfiedOn: charge.satisfied_on ?? null,
      status: charge.status ?? null,
      personsEntitled: (charge.persons_entitled ?? []).map((p) => p.name ?? '').filter(Boolean),
    })),
    insolvencyCaseCount: fixture.profile.has_insolvency_history ? 1 : 0,
    periods,
    financials: summariseFinancials(periods),
    enrichment: null,
    asOf,
  };
}

function factsForYear(year: FixtureFinancialYear): ExtractedFact[] {
  const facts: ExtractedFact[] = [];

  for (const [key, value] of Object.entries(year)) {
    if (key === 'period_start' || key === 'period_end') continue;
    if (typeof value !== 'number') continue;

    const metric = key as FinancialMetric;
    const isFlow = FLOW_FIELDS.includes(metric);

    facts.push({
      metric,
      value,
      currency: metric === 'employee_count' ? undefined : 'GBP',
      periodStart: isFlow ? year.period_start : null,
      periodEnd: year.period_end,
      isInstant: INSTANT_METRICS.has(metric),
      extractionMethod: 'fixture',
      confidence: 1,
      isReported: true,
      isEstimated: false,
    });
  }

  return facts;
}
