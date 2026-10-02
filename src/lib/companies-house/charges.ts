import { env } from '@/lib/env';
import { chPaginate, CompaniesHouseError } from './client';
import { fixtureCharges } from '@/lib/fixtures';
import type { CHCharge } from './types';

export async function getCharges(
  companyNumber: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<CHCharge[]> {
  if (env.useFixtures) return fixtureCharges(companyNumber);
  try {
    return await chPaginate<CHCharge>(`/company/${companyNumber}/charges`, 'items', {
      resource: 'charges',
      forceRefresh: opts.forceRefresh,
      cacheTtlSeconds: 60 * 60 * 24 * 3,
      maxItems: 200,
    });
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.isNotFound) return [];
    throw err;
  }
}

export function outstandingCharges(charges: CHCharge[]): CHCharge[] {
  return charges.filter((c) => c.status !== 'satisfied' && c.status !== 'fully-satisfied' && !c.satisfied_on);
}
