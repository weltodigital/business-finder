import { env } from '@/lib/env';
import { chRequest } from './client';
import { fixtureSearch } from '@/lib/fixtures';
import type { CHAdvancedSearchItem } from './types';

export interface AdvancedSearchParams {
  companyNameIncludes?: string;
  companyNameExcludes?: string;
  companyStatus?: string[];
  companyType?: string[];
  sicCodes?: string[];
  location?: string;
  incorporatedFrom?: string; // YYYY-MM-DD
  incorporatedTo?: string;
  size?: number;
  startIndex?: number;
}

export interface AdvancedSearchResult {
  items: CHAdvancedSearchItem[];
  hits: number;
  startIndex: number;
}

/**
 * /advanced-search/companies — used to build the candidate universe.
 * Deliberately paginated: we never pull the whole result set eagerly.
 */
export async function advancedSearch(params: AdvancedSearchParams): Promise<AdvancedSearchResult> {
  if (env.useFixtures) return fixtureSearch(params);

  const size = Math.min(params.size ?? 100, 5000);
  const payload = await chRequest<{
    items?: CHAdvancedSearchItem[];
    hits?: number;
  }>('/advanced-search/companies', {
    resource: 'advanced-search',
    cacheTtlSeconds: 60 * 60 * 6,
    query: {
      company_name_includes: params.companyNameIncludes,
      company_name_excludes: params.companyNameExcludes,
      company_status: params.companyStatus,
      company_type: params.companyType,
      sic_codes: params.sicCodes,
      location: params.location,
      incorporated_from: params.incorporatedFrom,
      incorporated_to: params.incorporatedTo,
      size,
      start_index: params.startIndex ?? 0,
    },
  });

  return {
    items: payload.items ?? [],
    hits: payload.hits ?? payload.items?.length ?? 0,
    startIndex: params.startIndex ?? 0,
  };
}

/** Pages through advanced search up to `maxItems`, deduplicating by company number. */
export async function advancedSearchAll(
  params: AdvancedSearchParams,
  maxItems = 1000,
): Promise<{ items: CHAdvancedSearchItem[]; hits: number }> {
  const pageSize = Math.min(params.size ?? 100, 500);
  const seen = new Set<string>();
  const items: CHAdvancedSearchItem[] = [];
  let hits = 0;
  let startIndex = 0;

  while (items.length < maxItems) {
    const page = await advancedSearch({ ...params, size: pageSize, startIndex });
    hits = page.hits;
    if (page.items.length === 0) break;

    for (const item of page.items) {
      if (seen.has(item.company_number)) continue;
      seen.add(item.company_number);
      items.push(item);
    }

    startIndex += page.items.length;
    if (startIndex >= hits) break;
  }

  return { items: items.slice(0, maxItems), hits };
}
