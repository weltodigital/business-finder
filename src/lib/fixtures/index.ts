import type { AdvancedSearchParams } from '@/lib/companies-house/search';
import type {
  CHCharge,
  CHCompanyProfile,
  CHFilingHistoryItem,
  CHOfficer,
  CHPsc,
} from '@/lib/companies-house/types';
import { FIXTURES, fixtureSearchItems } from './companies';

export { FIXTURES, fixtureSearchItems };
export type { CompanyFixture, FixtureFinancialYear } from './companies';

export function fixtureProfile(companyNumber: string): CHCompanyProfile | null {
  return FIXTURES[companyNumber]?.profile ?? null;
}

export function fixtureOfficers(companyNumber: string): CHOfficer[] {
  return FIXTURES[companyNumber]?.officers ?? [];
}

export function fixturePscs(companyNumber: string): CHPsc[] {
  return FIXTURES[companyNumber]?.pscs ?? [];
}

export function fixtureFilings(companyNumber: string): CHFilingHistoryItem[] {
  return FIXTURES[companyNumber]?.filings ?? [];
}

export function fixtureCharges(companyNumber: string): CHCharge[] {
  return FIXTURES[companyNumber]?.charges ?? [];
}

export function fixtureSearch(params: AdvancedSearchParams) {
  let items = fixtureSearchItems();

  if (params.companyStatus?.length) {
    items = items.filter((i) => params.companyStatus!.includes(i.company_status ?? ''));
  }
  if (params.sicCodes?.length) {
    items = items.filter((i) => (i.sic_codes ?? []).some((s) => params.sicCodes!.includes(s)));
  }
  if (params.incorporatedTo) {
    items = items.filter((i) => (i.date_of_creation ?? '') <= params.incorporatedTo!);
  }
  if (params.incorporatedFrom) {
    items = items.filter((i) => (i.date_of_creation ?? '') >= params.incorporatedFrom!);
  }
  if (params.location) {
    const needle = params.location.toLowerCase();
    items = items.filter((i) => {
      const address = i.registered_office_address ?? {};
      return [address.locality, address.region, address.postal_code]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(needle));
    });
  }

  const start = params.startIndex ?? 0;
  const size = params.size ?? 100;
  return { items: items.slice(start, start + size), hits: items.length, startIndex: start };
}
