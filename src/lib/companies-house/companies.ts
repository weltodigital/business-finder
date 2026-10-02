import { env } from '@/lib/env';
import { chRequest, CompaniesHouseError } from './client';
import { fixtureProfile } from '@/lib/fixtures';
import type { CHCompanyProfile } from './types';

export async function getCompanyProfile(
  companyNumber: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<CHCompanyProfile | null> {
  const number = normaliseCompanyNumber(companyNumber);
  if (env.useFixtures) return fixtureProfile(number);
  try {
    return await chRequest<CHCompanyProfile>(`/company/${number}`, {
      resource: 'company-profile',
      forceRefresh: opts.forceRefresh,
      cacheTtlSeconds: 60 * 60 * 24 * 3,
    });
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.isNotFound) return null;
    throw err;
  }
}

/**
 * Companies House company numbers are 8 characters, zero-padded for
 * purely-numeric English/Welsh numbers (e.g. "1234567" -> "01234567").
 */
export function normaliseCompanyNumber(input: string): string {
  const trimmed = input.trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d+$/.test(trimmed)) return trimmed.padStart(8, '0');
  return trimmed;
}
