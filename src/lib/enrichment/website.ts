import * as cheerio from 'cheerio';

export interface WebsiteExtraction {
  url: string;
  pagesCrawled: string[];
  businessDescription: string | null;
  services: string[];
  industries: string[];
  locations: string[];
  ownerReferences: string[];
  contactEmail: string | null;
  contactPhone: string | null;
  socialLinks: string[];
  rawText: string;
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGE_BYTES = 2_000_000;
const USER_AGENT = 'OffMarketAcquisitionFinder/0.1 (company research; contact via registered user)';

const ABOUT_PATTERNS = /about|who-we-are|our-story|company/i;
const CONTACT_PATTERNS = /contact|get-in-touch|enquir/i;
const SERVICE_PATTERNS = /service|what-we-do|capabilit|solutions|products/i;

const OWNER_PATTERNS =
  /\b(founder|founded by|owner|managing director|proprietor|established (?:in )?\d{4}|family[- ]run|family[- ]owned)\b/gi;

/**
 * Crawls a small, fixed set of pages (home, about, contact, services) and
 * extracts readable text. Nothing scraped is executed or trusted as fact —
 * it is stored as descriptive context only.
 */
export async function crawlWebsite(rawUrl: string): Promise<WebsiteExtraction | null> {
  const homepage = normaliseUrl(rawUrl);
  if (!homepage) return null;

  const home = await fetchPage(homepage);
  if (!home) return null;

  const $ = cheerio.load(home.html);
  const links = collectInternalLinks($, homepage);

  const targets = [
    pickLink(links, ABOUT_PATTERNS),
    pickLink(links, CONTACT_PATTERNS),
    pickLink(links, SERVICE_PATTERNS),
  ].filter((href): href is string => Boolean(href));

  const pages = [{ url: homepage, html: home.html }];
  for (const target of targets.slice(0, 3)) {
    const page = await fetchPage(target);
    if (page) pages.push({ url: target, html: page.html });
  }

  const combinedText = pages.map((p) => readableText(p.html)).join('\n\n');

  return {
    url: homepage,
    pagesCrawled: pages.map((p) => p.url),
    businessDescription: describeBusiness($, combinedText),
    services: extractServices(pages.map((p) => p.html)),
    industries: [],
    locations: extractLocations(combinedText),
    ownerReferences: extractMatches(combinedText, OWNER_PATTERNS),
    contactEmail: extractEmail(combinedText),
    contactPhone: extractPhone(combinedText),
    socialLinks: collectSocialLinks(pages.map((p) => p.html)),
    rawText: combinedText.slice(0, 60_000),
  };
}

export function normaliseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!/^https?:$/.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function fetchPage(url: string): Promise<{ html: string } | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) return null;
    if (!(response.headers.get('content-type') ?? '').includes('text/html')) return null;

    const text = await response.text();
    return { html: text.slice(0, MAX_PAGE_BYTES) };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function collectInternalLinks($: cheerio.CheerioAPI, base: string): { href: string; text: string }[] {
  const origin = new URL(base).origin;
  const links: { href: string; text: string }[] = [];

  $('a[href]').each((_i, el) => {
    const raw = $(el).attr('href');
    if (!raw) return;
    try {
      const url = new URL(raw, base);
      if (url.origin !== origin) return;
      links.push({ href: url.toString(), text: $(el).text().trim().slice(0, 80) });
    } catch {
      // Ignore malformed hrefs.
    }
  });

  return links;
}

function pickLink(links: { href: string; text: string }[], pattern: RegExp): string | null {
  const match = links.find((l) => pattern.test(l.href) || pattern.test(l.text));
  return match?.href ?? null;
}

/** Strips scripts, styles and markup — only human-readable text is retained. */
export function readableText(html: string): string {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, iframe, nav, footer').remove();
  return $('body')
    .text()
    .replace(/\s+/g, ' ')
    .replace(/\s([.,;:!?])/g, '$1')
    .trim();
}

function describeBusiness($: cheerio.CheerioAPI, text: string): string | null {
  const metaDescription = $('meta[name="description"]').attr('content')?.trim();
  if (metaDescription && metaDescription.length > 40) return metaDescription.slice(0, 600);

  const heading = $('h1').first().text().trim();
  const paragraph = $('p')
    .toArray()
    .map((el) => $(el).text().trim())
    .find((t) => t.length > 80);

  const candidate = [heading, paragraph].filter(Boolean).join('. ');
  if (candidate.length > 40) return candidate.slice(0, 600);
  return text.slice(0, 300) || null;
}

function extractServices(htmlPages: string[]): string[] {
  const services = new Set<string>();

  for (const html of htmlPages) {
    const $ = cheerio.load(html);
    $('h2, h3, li').each((_i, el) => {
      const text = $(el).text().trim().replace(/\s+/g, ' ');
      if (text.length < 3 || text.length > 60) return;
      if (/^(home|about|contact|privacy|cookie|terms|blog|news)$/i.test(text)) return;
      if (!/[a-z]/i.test(text)) return;
      services.add(text);
    });
  }

  return Array.from(services).slice(0, 25);
}

function extractLocations(text: string): string[] {
  const postcodes = text.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b/g) ?? [];
  return Array.from(new Set(postcodes)).slice(0, 10);
}

function extractEmail(text: string): string | null {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return match ? match[0].toLowerCase() : null;
}

function extractPhone(text: string): string | null {
  const match = text.match(/(?:\+44\s?|0)(?:\d\s?){9,10}\d/);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

function collectSocialLinks(htmlPages: string[]): string[] {
  const socials = new Set<string>();
  const pattern = /(linkedin|facebook|twitter|x\.com|instagram|youtube)\.com/i;

  for (const html of htmlPages) {
    const $ = cheerio.load(html);
    $('a[href]').each((_i, el) => {
      const href = $(el).attr('href') ?? '';
      if (pattern.test(href)) socials.add(href.split('?')[0]);
    });
  }

  return Array.from(socials).slice(0, 10);
}

function extractMatches(text: string, pattern: RegExp): string[] {
  const matches = text.match(pattern) ?? [];
  return Array.from(new Set(matches.map((m) => m.trim()))).slice(0, 10);
}
