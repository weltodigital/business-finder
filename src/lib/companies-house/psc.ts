import { env } from '@/lib/env';
import { chPaginate, CompaniesHouseError } from './client';
import { fixturePscs } from '@/lib/fixtures';
import type { CHPsc } from './types';

export async function getPscs(
  companyNumber: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<CHPsc[]> {
  if (env.useFixtures) return fixturePscs(companyNumber);
  try {
    return await chPaginate<CHPsc>(
      `/company/${companyNumber}/persons-with-significant-control`,
      'items',
      {
        resource: 'psc',
        forceRefresh: opts.forceRefresh,
        cacheTtlSeconds: 60 * 60 * 24 * 3,
        maxItems: 100,
      },
    );
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.isNotFound) return [];
    throw err;
  }
}

/** Companies House expresses ownership in bands; take the lower bound. */
export function controlPercentFloor(naturesOfControl: string[] = []): number {
  let max = 0;
  for (const nature of naturesOfControl) {
    if (/75-to-100-percent/.test(nature)) max = Math.max(max, 75);
    else if (/50-to-75-percent/.test(nature)) max = Math.max(max, 50);
    else if (/25-to-50-percent/.test(nature)) max = Math.max(max, 25);
  }
  return max;
}
