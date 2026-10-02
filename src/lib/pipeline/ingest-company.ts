import { log } from '@/lib/logger';
import { getAdminClient } from '@/lib/supabase/admin';
import { getCompanyProfile, normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { getOfficers, getOfficerAppointments, officerIdFromLink } from '@/lib/companies-house/officers';
import { getPscs } from '@/lib/companies-house/psc';
import { getFilingHistory } from '@/lib/companies-house/filings';
import { getCharges } from '@/lib/companies-house/charges';
import { getInsolvency } from '@/lib/companies-house/insolvency';
import { runAccountsPipeline } from '@/lib/accounts/pipeline';
import {
  replaceCharges,
  replaceFilings,
  replaceInsolvency,
  replaceOfficers,
  replacePscs,
  upsertCompanyProfile,
} from '@/lib/repository/companies';

export interface IngestOptions {
  forceRefresh?: boolean;
  /** Retrieve and extract accounts. Expensive — reserve for candidates. */
  includeAccounts?: boolean;
  /** Retrieve directors' other appointments, for the corporate network. */
  includeAppointments?: boolean;
  maxDocuments?: number;
  allowLlm?: boolean;
}

export interface IngestResult {
  companyId: string;
  companyNumber: string;
  name: string | null;
  officers: number;
  pscs: number;
  filings: number;
  charges: number;
  insolvencyCases: number;
  accounts?: Awaited<ReturnType<typeof runAccountsPipeline>>;
}

/**
 * Pulls a company's Companies House record into the database. Cheap stages
 * (profile, officers, PSC, filings, charges) always run; accounts extraction
 * and officer appointments are opt-in because they cost time and API calls.
 */
export async function ingestCompany(
  rawCompanyNumber: string,
  options: IngestOptions = {},
): Promise<IngestResult | null> {
  const companyNumber = normaliseCompanyNumber(rawCompanyNumber);

  const profile = await getCompanyProfile(companyNumber, { forceRefresh: options.forceRefresh });
  if (!profile) return null;

  const stored = await upsertCompanyProfile(profile);

  const [officers, pscs, filings, charges, insolvency] = await Promise.all([
    getOfficers(companyNumber, { forceRefresh: options.forceRefresh }),
    getPscs(companyNumber, { forceRefresh: options.forceRefresh }),
    getFilingHistory(companyNumber, { forceRefresh: options.forceRefresh }),
    profile.has_charges ? getCharges(companyNumber, { forceRefresh: options.forceRefresh }) : Promise.resolve([]),
    profile.has_insolvency_history
      ? getInsolvency(companyNumber, { forceRefresh: options.forceRefresh })
      : Promise.resolve([]),
  ]);

  await replaceOfficers(stored.id, officers);
  await replacePscs(stored.id, pscs);
  await replaceFilings(stored.id, filings);
  await replaceCharges(stored.id, charges);
  await replaceInsolvency(stored.id, insolvency);

  if (options.includeAppointments) {
    await ingestOfficerAppointments(officers);
  }

  const result: IngestResult = {
    companyId: stored.id,
    companyNumber,
    name: profile.company_name ?? null,
    officers: officers.length,
    pscs: pscs.length,
    filings: filings.length,
    charges: charges.length,
    insolvencyCases: insolvency.length,
  };

  if (options.includeAccounts) {
    result.accounts = await runAccountsPipeline(companyNumber, stored.id, {
      forceRefresh: options.forceRefresh,
      maxDocuments: options.maxDocuments,
      allowLlm: options.allowLlm,
    });
  }

  await log({
    scope: 'ingest',
    message: `Ingested ${profile.company_name ?? companyNumber}`,
    companyNumber,
    context: { officers: officers.length, filings: filings.length, accounts: Boolean(options.includeAccounts) },
  });

  return result;
}

/** Builds the corporate network for shortlisted companies only. */
async function ingestOfficerAppointments(officers: Awaited<ReturnType<typeof getOfficers>>): Promise<void> {
  const db = getAdminClient();

  for (const officer of officers) {
    if (officer.resigned_on) continue;
    const officerId = officerIdFromLink(officer);
    if (!officerId) continue;

    const { data: director } = await db
      .from('directors')
      .select('id')
      .eq('officer_id', officerId)
      .maybeSingle();
    if (!director) continue;

    const appointments = await getOfficerAppointments(officerId);
    if (appointments.length === 0) continue;

    await db.from('officer_appointments').upsert(
      appointments.map((appointment) => ({
        director_id: director.id,
        company_number: appointment.appointed_to?.company_number ?? '',
        company_name: appointment.appointed_to?.company_name ?? null,
        company_status: appointment.appointed_to?.company_status ?? null,
        role: appointment.officer_role ?? null,
        appointed_on: appointment.appointed_on ?? null,
        resigned_on: appointment.resigned_on ?? null,
        raw_data: appointment,
      })).filter((row) => row.company_number),
      { onConflict: 'director_id,company_number,appointed_on' },
    );
  }
}
