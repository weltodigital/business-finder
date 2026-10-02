import { env } from '@/lib/env';
import { chRequest, CompaniesHouseError } from './client';
import type { CHInsolvencyCase } from './types';

export async function getInsolvency(
  companyNumber: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<CHInsolvencyCase[]> {
  if (env.useFixtures) return [];
  try {
    const payload = await chRequest<{ cases?: CHInsolvencyCase[] }>(
      `/company/${companyNumber}/insolvency`,
      {
        resource: 'insolvency',
        forceRefresh: opts.forceRefresh,
        cacheTtlSeconds: 60 * 60 * 24 * 3,
      },
    );
    return payload.cases ?? [];
  } catch (err) {
    // 404 here simply means "no insolvency history", which is the common case.
    if (err instanceof CompaniesHouseError && err.isNotFound) return [];
    throw err;
  }
}
