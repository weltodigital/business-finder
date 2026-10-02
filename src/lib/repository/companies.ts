import { getAdminClient } from '@/lib/supabase/admin';
import { controlPercentFloor } from '@/lib/companies-house/psc';
import { documentIdFromFiling } from '@/lib/companies-house/filings';
import { officerIdFromLink } from '@/lib/companies-house/officers';
import type {
  CHCharge,
  CHCompanyProfile,
  CHFilingHistoryItem,
  CHInsolvencyCase,
  CHOfficer,
  CHPsc,
} from '@/lib/companies-house/types';

export interface StoredCompany {
  id: string;
  company_number: string;
}

/** Normalises an officer name so people can be matched without an officer id. */
export function nameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '');
}

export function regionFromAddress(
  address: CHCompanyProfile['registered_office_address'] | null,
): string | null {
  if (!address) return null;
  return address.region ?? address.locality ?? null;
}

export async function upsertCompanyProfile(profile: CHCompanyProfile): Promise<StoredCompany> {
  const db = getAdminClient();
  const address = profile.registered_office_address ?? null;

  const { data, error } = await db
    .from('companies')
    .upsert(
      {
        company_number: profile.company_number,
        name: profile.company_name ?? null,
        status: profile.company_status ?? null,
        company_type: profile.type ?? null,
        incorporation_date: profile.date_of_creation ?? null,
        dissolution_date: profile.date_of_cessation ?? null,
        sic_codes: profile.sic_codes ?? [],
        registered_address: address,
        postcode: address?.postal_code ?? null,
        region: regionFromAddress(address),
        country: address?.country ?? null,
        previous_names: profile.previous_company_names ?? [],
        accounts_meta: profile.accounts ?? null,
        confirmation_statement_meta: profile.confirmation_statement ?? null,
        has_insolvency_history: Boolean(profile.has_insolvency_history),
        has_charges: Boolean(profile.has_charges),
        last_companies_house_update: new Date().toISOString(),
        raw_profile: profile,
      },
      { onConflict: 'company_number' },
    )
    .select('id, company_number')
    .single();

  if (error) throw new Error(`Failed to store company ${profile.company_number}: ${error.message}`);
  return data as StoredCompany;
}

export async function replaceOfficers(companyId: string, officers: CHOfficer[]): Promise<void> {
  const db = getAdminClient();
  await db.from('company_directors').delete().eq('company_id', companyId);

  for (const officer of officers) {
    if (!officer.name) continue;
    const officerId = officerIdFromLink(officer);

    // Directors are shared across companies, so upsert the person first.
    const { data: director, error: directorError } = await db
      .from('directors')
      .upsert(
        {
          officer_id: officerId ?? `name:${nameKey(officer.name)}`,
          name: officer.name,
          name_key: nameKey(officer.name),
          date_of_birth: officer.date_of_birth ?? null,
          nationality: officer.nationality ?? null,
          occupation: officer.occupation ?? null,
          country_of_residence: officer.country_of_residence ?? null,
        },
        { onConflict: 'officer_id' },
      )
      .select('id')
      .single();

    if (directorError || !director) continue;

    await db.from('company_directors').upsert(
      {
        company_id: companyId,
        director_id: director.id,
        officer_id: officerId,
        role: officer.officer_role ?? null,
        appointed_on: officer.appointed_on ?? null,
        resigned_on: officer.resigned_on ?? null,
        raw_data: officer,
      },
      { onConflict: 'company_id,director_id,role,appointed_on' },
    );
  }
}

export async function replacePscs(companyId: string, pscs: CHPsc[]): Promise<void> {
  const db = getAdminClient();
  await db.from('pscs').delete().eq('company_id', companyId);
  if (pscs.length === 0) return;

  await db.from('pscs').insert(
    pscs.map((psc, index) => ({
      company_id: companyId,
      psc_id: psc.links?.self ?? `psc-${index}`,
      name: psc.name ?? null,
      psc_type: psc.kind ?? null,
      kind: psc.kind ?? null,
      nature_of_control: psc.natures_of_control ?? [],
      notified_on: psc.notified_on ?? null,
      ceased_on: psc.ceased_on ?? null,
      date_of_birth: psc.date_of_birth ?? null,
      nationality: psc.nationality ?? null,
      country_of_residence: psc.country_of_residence ?? null,
      raw_data: psc,
    })),
  );
}

export async function replaceFilings(companyId: string, filings: CHFilingHistoryItem[]): Promise<void> {
  if (filings.length === 0) return;
  const db = getAdminClient();

  await db.from('filings').upsert(
    filings.map((filing) => ({
      company_id: companyId,
      transaction_id: filing.transaction_id,
      filing_type: filing.type ?? null,
      category: filing.category ?? null,
      subcategory: Array.isArray(filing.subcategory) ? filing.subcategory.join(',') : (filing.subcategory ?? null),
      description: filing.description ?? null,
      description_values: filing.description_values ?? null,
      filing_date: filing.date ?? null,
      action_date: filing.action_date ?? null,
      paper_filed: filing.paper_filed ?? null,
      document_id: documentIdFromFiling(filing),
      document_url: filing.links?.document_metadata ?? null,
      raw_data: filing,
    })),
    { onConflict: 'company_id,transaction_id' },
  );
}

export async function replaceCharges(companyId: string, charges: CHCharge[]): Promise<void> {
  if (charges.length === 0) return;
  const db = getAdminClient();

  await db.from('charges').upsert(
    charges.map((charge, index) => ({
      company_id: companyId,
      charge_id: charge.id ?? charge.charge_code ?? `charge-${index}`,
      charge_code: charge.charge_code ?? null,
      classification: charge.classification ?? null,
      created_on: charge.created_on ?? null,
      delivered_on: charge.delivered_on ?? null,
      status: charge.status ?? null,
      persons_entitled: charge.persons_entitled ?? [],
      secured_details: charge.secured_details ?? null,
      particulars: charge.particulars ?? null,
      satisfied_on: charge.satisfied_on ?? null,
      raw_data: charge,
    })),
    { onConflict: 'company_id,charge_id' },
  );
}

export async function replaceInsolvency(companyId: string, cases: CHInsolvencyCase[]): Promise<void> {
  const db = getAdminClient();
  await db.from('company_insolvency').delete().eq('company_id', companyId);
  if (cases.length === 0) return;

  await db.from('company_insolvency').insert(
    cases.map((insolvencyCase, index) => ({
      company_id: companyId,
      case_number: insolvencyCase.number ?? `case-${index}`,
      case_type: insolvencyCase.type ?? null,
      dates: insolvencyCase.dates ?? null,
      practitioners: insolvencyCase.practitioners ?? null,
      raw_data: insolvencyCase,
    })),
  );
}

export async function findCompanyByNumber(companyNumber: string): Promise<StoredCompany | null> {
  const db = getAdminClient();
  const { data } = await db
    .from('companies')
    .select('id, company_number')
    .eq('company_number', companyNumber)
    .maybeSingle();
  return (data as StoredCompany) ?? null;
}

export { controlPercentFloor };
