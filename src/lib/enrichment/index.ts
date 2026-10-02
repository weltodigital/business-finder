import { getAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';
import { crawlWebsite, normaliseUrl } from './website';
import { findPlace } from './google-places';

export interface EnrichmentResult {
  companyNumber: string;
  website: string | null;
  websiteStatus: 'found' | 'not_found' | 'error' | 'skipped';
  googleListingFound: boolean;
}

export { crawlWebsite, normaliseUrl, findPlace };

/**
 * Staged enrichment for shortlisted companies only: find a website (via the
 * stored value or a Google business listing), then crawl it for description,
 * services and contact details.
 */
export async function enrichCompany(
  companyNumber: string,
  options: { websiteOverride?: string | null } = {},
): Promise<EnrichmentResult> {
  const db = getAdminClient();

  const { data: company } = await db
    .from('companies')
    .select('id, name, website, postcode, region')
    .eq('company_number', companyNumber)
    .maybeSingle();

  if (!company) {
    return { companyNumber, website: null, websiteStatus: 'skipped', googleListingFound: false };
  }

  const locationHint = company.region ?? company.postcode ?? null;
  const place = await findPlace(company.name ?? companyNumber, locationHint);

  const websiteCandidate =
    options.websiteOverride ?? company.website ?? place?.website ?? null;
  const website = websiteCandidate ? normaliseUrl(websiteCandidate) : null;

  let extraction = null;
  let status: EnrichmentResult['websiteStatus'] = website ? 'found' : 'not_found';

  if (website) {
    try {
      extraction = await crawlWebsite(website);
      if (!extraction) status = 'error';
    } catch (error) {
      status = 'error';
      await log({
        level: 'warn',
        scope: 'enrichment',
        message: 'Website crawl failed',
        companyNumber,
        context: { website, error: String(error) },
      });
    }
  }

  await db.from('company_enrichment').upsert(
    {
      company_id: company.id,
      website,
      website_status: status,
      business_description: extraction?.businessDescription ?? null,
      services: extraction?.services ?? [],
      industries: extraction?.industries ?? [],
      locations: extraction?.locations ?? [],
      owner_references: extraction?.ownerReferences ?? [],
      contact_email: extraction?.contactEmail ?? null,
      contact_phone: extraction?.contactPhone ?? place?.phone ?? null,
      social_links: extraction?.socialLinks ?? [],
      google_place_id: place?.placeId ?? null,
      google_rating: place?.rating ?? null,
      google_review_count: place?.reviewCount ?? null,
      raw_website_text: extraction?.rawText ?? null,
      pages_crawled: extraction?.pagesCrawled ?? [],
      enriched_at: new Date().toISOString(),
    },
    { onConflict: 'company_id' },
  );

  if (website && !company.website) {
    await db.from('companies').update({ website }).eq('id', company.id);
  }

  return { companyNumber, website, websiteStatus: status, googleListingFound: Boolean(place) };
}
