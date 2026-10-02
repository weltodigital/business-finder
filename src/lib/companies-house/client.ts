import { env } from '@/lib/env';
import { log } from '@/lib/logger';
import { getAdminClient } from '@/lib/supabase/admin';
import { companiesHouseLimiter, sleep } from './rate-limiter';

export const CH_API_BASE = 'https://api.company-information.service.gov.uk';
export const CH_DOCUMENT_BASE = 'https://document-api.company-information.service.gov.uk';

export class CompaniesHouseError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly path: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = 'CompaniesHouseError';
  }

  get isNotFound() {
    return this.status === 404;
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | string[] | undefined>;
  /** Seconds to reuse a stored response for. 0 disables caching. */
  cacheTtlSeconds?: number;
  /** Bypass the cache and refresh from the API. */
  forceRefresh?: boolean;
  base?: string;
  accept?: string;
  resource?: string;
  maxRetries?: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // company data changes slowly

function authHeader(): string {
  return `Basic ${Buffer.from(`${env.companiesHouseApiKey}:`).toString('base64')}`;
}

function buildUrl(base: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === '') continue;
      if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
      else url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const db = getAdminClient();
    const { data } = await db
      .from('companies_house_cache')
      .select('payload, expires_at')
      .eq('cache_key', key)
      .maybeSingle();
    if (!data) return null;
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
    return data.payload as T;
  } catch {
    return null;
  }
}

async function writeCache(key: string, resource: string, payload: unknown, ttlSeconds: number) {
  try {
    const db = getAdminClient();
    await db.from('companies_house_cache').upsert(
      {
        cache_key: key,
        resource,
        payload: payload as never,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      },
      { onConflict: 'cache_key' },
    );
  } catch {
    // Cache writes are best-effort.
  }
}

/**
 * Single entry point for every Companies House request: authentication,
 * throttling, retries, caching and error logging all live here.
 */
export async function chRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = options.base ?? CH_API_BASE;
  const url = buildUrl(base, path, options.query);
  const resource = options.resource ?? path.split('/').filter(Boolean)[0] ?? 'unknown';
  const ttl = options.cacheTtlSeconds ?? DEFAULT_TTL_SECONDS;
  const cacheKey = `GET ${url}`;

  if (ttl > 0 && !options.forceRefresh) {
    const cached = await readCache<T>(cacheKey);
    if (cached !== null) return cached;
  }

  const maxRetries = options.maxRetries ?? 4;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await companiesHouseLimiter.acquire();

    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          Authorization: authHeader(),
          Accept: options.accept ?? 'application/json',
        },
        cache: 'no-store',
      });
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries) break;
      await sleep(backoffMs(attempt));
      continue;
    }

    if (response.ok) {
      const payload = (await response.json()) as T;
      if (ttl > 0) await writeCache(cacheKey, resource, payload, ttl);
      return payload;
    }

    const body = await response.text().catch(() => '');

    if (response.status === 429 || response.status >= 500) {
      lastError = new CompaniesHouseError(
        `Companies House ${response.status}`,
        response.status,
        path,
        body,
      );
      if (attempt === maxRetries) break;
      const retryAfter = Number(response.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoffMs(attempt));
      continue;
    }

    const error = new CompaniesHouseError(
      `Companies House request failed (${response.status}) for ${path}`,
      response.status,
      path,
      body.slice(0, 500),
    );
    if (response.status !== 404) {
      await log({ level: 'error', scope: 'companies-house', message: error.message, context: { path, status: response.status } });
    }
    throw error;
  }

  await log({
    level: 'error',
    scope: 'companies-house',
    message: `Companies House request exhausted retries for ${path}`,
    context: { path, error: String(lastError) },
  });
  throw lastError instanceof Error
    ? lastError
    : new CompaniesHouseError('Companies House request failed', 0, path);
}

/** Same pipeline, but returns the raw response (used for account documents). */
export async function chRequestRaw(
  path: string,
  options: RequestOptions = {},
): Promise<Response> {
  const base = options.base ?? CH_DOCUMENT_BASE;
  const url = buildUrl(base, path, options.query);
  const maxRetries = options.maxRetries ?? 3;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await companiesHouseLimiter.acquire();
    try {
      const response = await fetch(url, {
        headers: { Authorization: authHeader(), Accept: options.accept ?? '*/*' },
        redirect: 'follow',
        cache: 'no-store',
      });
      if (response.ok) return response;
      if (response.status === 429 || response.status >= 500) {
        lastError = new CompaniesHouseError(`Companies House ${response.status}`, response.status, path);
        if (attempt === maxRetries) break;
        await sleep(backoffMs(attempt));
        continue;
      }
      throw new CompaniesHouseError(
        `Document request failed (${response.status}) for ${path}`,
        response.status,
        path,
      );
    } catch (err) {
      if (err instanceof CompaniesHouseError && err.status !== 429 && err.status < 500) throw err;
      lastError = err;
      if (attempt === maxRetries) break;
      await sleep(backoffMs(attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new CompaniesHouseError('Document request failed', 0, path);
}

function backoffMs(attempt: number): number {
  const base = Math.min(500 * 2 ** attempt, 8000);
  return base + Math.random() * 250; // jitter avoids retry convoys
}

/** Walks a paginated Companies House collection. */
export async function chPaginate<TItem>(
  path: string,
  itemsKey: string,
  options: RequestOptions & { pageSize?: number; maxItems?: number } = {},
): Promise<TItem[]> {
  const pageSize = options.pageSize ?? 100;
  const maxItems = options.maxItems ?? 500;
  const collected: TItem[] = [];
  let startIndex = 0;

  for (;;) {
    const page = await chRequest<Record<string, unknown>>(path, {
      ...options,
      query: { ...options.query, items_per_page: pageSize, start_index: startIndex },
    });
    const items = (page[itemsKey] as TItem[] | undefined) ?? [];
    collected.push(...items);

    const total = Number(page.total_results ?? page.total_count ?? collected.length);
    startIndex += items.length;
    if (items.length === 0 || collected.length >= Math.min(total, maxItems)) break;
  }

  return collected.slice(0, maxItems);
}
