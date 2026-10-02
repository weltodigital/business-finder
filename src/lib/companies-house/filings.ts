import { env } from '@/lib/env';
import { chPaginate, CompaniesHouseError } from './client';
import { fixtureFilings } from '@/lib/fixtures';
import type { CHFilingHistoryItem } from './types';

export async function getFilingHistory(
  companyNumber: string,
  opts: { forceRefresh?: boolean; category?: string; maxItems?: number } = {},
): Promise<CHFilingHistoryItem[]> {
  if (env.useFixtures) return fixtureFilings(companyNumber);
  try {
    return await chPaginate<CHFilingHistoryItem>(
      `/company/${companyNumber}/filing-history`,
      'items',
      {
        resource: 'filing-history',
        forceRefresh: opts.forceRefresh,
        cacheTtlSeconds: 60 * 60 * 24 * 2,
        maxItems: opts.maxItems ?? 300,
        query: { category: opts.category },
      },
    );
  } catch (err) {
    if (err instanceof CompaniesHouseError && err.isNotFound) return [];
    throw err;
  }
}

/** Accounts filings, newest first. These are the documents worth extracting. */
export function selectAccountsFilings(filings: CHFilingHistoryItem[]): CHFilingHistoryItem[] {
  return filings
    .filter((f) => f.category === 'accounts' && Boolean(f.links?.document_metadata))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

export function documentIdFromFiling(filing: CHFilingHistoryItem): string | null {
  const link = filing.links?.document_metadata;
  if (!link) return null;
  const match = link.match(/\/document\/([^/?]+)/);
  return match ? match[1] : null;
}
