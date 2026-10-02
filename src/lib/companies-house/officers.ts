import { env } from '@/lib/env';
import { chPaginate, chRequest, CompaniesHouseError } from './client';
import { fixtureOfficers } from '@/lib/fixtures';
import type { CHAppointment, CHOfficer } from './types';

export async function getOfficers(
  companyNumber: string,
  opts: { forceRefresh?: boolean; includeResigned?: boolean } = {},
): Promise<CHOfficer[]> {
  if (env.useFixtures) return fixtureOfficers(companyNumber);
  try {
    return await chPaginate<CHOfficer>(`/company/${companyNumber}/officers`, 'items', {
      resource: 'officers',
      forceRefresh: opts.forceRefresh,
      cacheTtlSeconds: 60 * 60 * 24 * 3,
      maxItems: 200,
      query: { register_type: undefined },
    });
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.isNotFound) return [];
    throw err;
  }
}

/** Extracts the officer id from the appointments link on an officer record. */
export function officerIdFromLink(officer: CHOfficer): string | null {
  const link = officer.links?.officer?.appointments;
  if (!link) return null;
  const match = link.match(/\/officers\/([^/]+)\/appointments/);
  return match ? match[1] : null;
}

/** Only called for shortlisted companies — this is how the corporate network is built. */
export async function getOfficerAppointments(officerId: string): Promise<CHAppointment[]> {
  if (env.useFixtures) return [];
  try {
    return await chPaginate<CHAppointment>(`/officers/${officerId}/appointments`, 'items', {
      resource: 'officer-appointments',
      cacheTtlSeconds: 60 * 60 * 24 * 7,
      maxItems: 200,
    });
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.isNotFound) return [];
    throw err;
  }
}

export async function getOfficerAppointmentCount(officerId: string): Promise<number> {
  const payload = await chRequest<{ total_results?: number }>(`/officers/${officerId}/appointments`, {
    resource: 'officer-appointments',
    query: { items_per_page: 1 },
    cacheTtlSeconds: 60 * 60 * 24 * 7,
  });
  return payload.total_results ?? 0;
}
