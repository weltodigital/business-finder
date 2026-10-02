import { getAdminClient } from '@/lib/supabase/admin';
import { controlPercentFloor } from '@/lib/companies-house/psc';
import { summariseFinancials } from '@/lib/financials/analytics';
import type { CompanyDossier, EnrichmentRecord } from '@/lib/types';
import { loadFinancialPeriods } from './financials';

/** Assembles the full dossier for a company from stored, normalised data. */
export async function loadDossier(companyNumber: string): Promise<CompanyDossier | null> {
  const db = getAdminClient();

  const { data: company } = await db
    .from('companies')
    .select('*')
    .eq('company_number', companyNumber)
    .maybeSingle();

  if (!company) return null;
  const companyId = company.id as string;

  const [directors, pscs, filings, charges, insolvency, enrichment, periods] = await Promise.all([
    db
      .from('company_directors')
      .select('role, appointed_on, resigned_on, officer_id, directors(name, nationality, occupation, country_of_residence, date_of_birth)')
      .eq('company_id', companyId),
    db.from('pscs').select('*').eq('company_id', companyId),
    db.from('filings').select('*').eq('company_id', companyId).order('filing_date', { ascending: false }).limit(100),
    db.from('charges').select('*').eq('company_id', companyId),
    db.from('company_insolvency').select('id').eq('company_id', companyId),
    db.from('company_enrichment').select('*').eq('company_id', companyId).maybeSingle(),
    loadFinancialPeriods(companyId),
  ]);

  const appointmentCounts = await countAppointments(
    ((directors.data ?? []) as Record<string, unknown>[])
      .map((row) => row.officer_id as string | null)
      .filter((id): id is string => Boolean(id)),
  );

  return {
    company: {
      id: companyId,
      companyNumber: company.company_number,
      name: company.name,
      status: company.status,
      companyType: company.company_type,
      incorporationDate: company.incorporation_date,
      dissolutionDate: company.dissolution_date,
      sicCodes: company.sic_codes ?? [],
      registeredAddress: company.registered_address ?? null,
      postcode: company.postcode,
      region: company.region,
      country: company.country,
      hasInsolvencyHistory: Boolean(company.has_insolvency_history),
      hasCharges: Boolean(company.has_charges),
      accountsMeta: company.accounts_meta,
      confirmationStatementMeta: company.confirmation_statement_meta,
      website: company.website,
    },
    directors: ((directors.data ?? []) as Record<string, unknown>[]).map((row) => {
      const person = (row.directors ?? {}) as Record<string, unknown>;
      const officerId = (row.officer_id as string) ?? null;
      return {
        name: (person.name as string) ?? 'Unknown',
        officerId,
        role: (row.role as string) ?? null,
        appointedOn: (row.appointed_on as string) ?? null,
        resignedOn: (row.resigned_on as string) ?? null,
        nationality: (person.nationality as string) ?? null,
        occupation: (person.occupation as string) ?? null,
        countryOfResidence: (person.country_of_residence as string) ?? null,
        dateOfBirth: (person.date_of_birth as { month?: number; year?: number }) ?? null,
        otherAppointments: officerId ? appointmentCounts.get(officerId) : undefined,
      };
    }),
    pscs: ((pscs.data ?? []) as Record<string, unknown>[]).map((row) => ({
      name: (row.name as string) ?? null,
      pscType: (row.psc_type as string) ?? null,
      kind: (row.kind as string) ?? null,
      natureOfControl: (row.nature_of_control as string[]) ?? [],
      notifiedOn: (row.notified_on as string) ?? null,
      ceasedOn: (row.ceased_on as string) ?? null,
      dateOfBirth: (row.date_of_birth as { month?: number; year?: number }) ?? null,
      controlPercentFloor: controlPercentFloor((row.nature_of_control as string[]) ?? []),
    })),
    filings: ((filings.data ?? []) as Record<string, unknown>[]).map((row) => ({
      transactionId: row.transaction_id as string,
      category: (row.category as string) ?? null,
      filingType: (row.filing_type as string) ?? null,
      description: (row.description as string) ?? null,
      filingDate: (row.filing_date as string) ?? null,
      documentId: (row.document_id as string) ?? null,
    })),
    charges: ((charges.data ?? []) as Record<string, unknown>[]).map((row) => ({
      chargeId: row.charge_id as string,
      createdOn: (row.created_on as string) ?? null,
      deliveredOn: (row.delivered_on as string) ?? null,
      satisfiedOn: (row.satisfied_on as string) ?? null,
      status: (row.status as string) ?? null,
      personsEntitled: ((row.persons_entitled as { name?: string }[]) ?? [])
        .map((p) => p.name ?? '')
        .filter(Boolean),
    })),
    insolvencyCaseCount: (insolvency.data ?? []).length,
    periods,
    financials: summariseFinancials(periods),
    enrichment: enrichment.data ? toEnrichment(enrichment.data as Record<string, unknown>) : null,
  };
}

async function countAppointments(officerIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (officerIds.length === 0) return counts;

  const db = getAdminClient();
  const { data: directors } = await db
    .from('directors')
    .select('id, officer_id')
    .in('officer_id', officerIds);

  const byId = new Map(
    ((directors ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row.officer_id as string]),
  );
  if (byId.size === 0) return counts;

  const { data: appointments } = await db
    .from('officer_appointments')
    .select('director_id')
    .in('director_id', Array.from(byId.keys()));

  for (const row of (appointments ?? []) as Record<string, unknown>[]) {
    const officerId = byId.get(row.director_id as string);
    if (!officerId) continue;
    counts.set(officerId, (counts.get(officerId) ?? 0) + 1);
  }

  return counts;
}

function toEnrichment(row: Record<string, unknown>): EnrichmentRecord {
  return {
    website: (row.website as string) ?? null,
    websiteStatus: (row.website_status as string) ?? null,
    businessDescription: (row.business_description as string) ?? null,
    services: (row.services as string[]) ?? [],
    industries: (row.industries as string[]) ?? [],
    locations: (row.locations as string[]) ?? [],
    ownerReferences: (row.owner_references as string[]) ?? [],
    contactEmail: (row.contact_email as string) ?? null,
    contactPhone: (row.contact_phone as string) ?? null,
    socialLinks: (row.social_links as string[]) ?? [],
    googleRating: row.google_rating === null || row.google_rating === undefined ? null : Number(row.google_rating),
    googleReviewCount:
      row.google_review_count === null || row.google_review_count === undefined
        ? null
        : Number(row.google_review_count),
  };
}
