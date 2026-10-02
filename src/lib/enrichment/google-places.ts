import { env } from '@/lib/env';
import { log } from '@/lib/logger';

export interface PlaceResult {
  placeId: string;
  name: string;
  website: string | null;
  phone: string | null;
  rating: number | null;
  reviewCount: number | null;
  address: string | null;
}

const PLACES_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

/**
 * Looks the company up as a business listing. Optional: when no API key is
 * configured this returns null and enrichment carries on without it.
 */
export async function findPlace(
  companyName: string,
  locationHint?: string | null,
): Promise<PlaceResult | null> {
  const apiKey = env.googleMapsApiKey;
  if (!apiKey) return null;

  const query = [companyName, locationHint].filter(Boolean).join(', ');

  try {
    const response = await fetch(PLACES_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'places.id,places.displayName,places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount,places.formattedAddress',
      },
      body: JSON.stringify({ textQuery: query, maxResultCount: 1, regionCode: 'GB' }),
    });

    if (!response.ok) {
      await log({
        level: 'warn',
        scope: 'enrichment',
        message: `Google Places lookup failed (${response.status})`,
        context: { query },
      });
      return null;
    }

    const payload = (await response.json()) as {
      places?: Array<{
        id?: string;
        displayName?: { text?: string };
        websiteUri?: string;
        nationalPhoneNumber?: string;
        rating?: number;
        userRatingCount?: number;
        formattedAddress?: string;
      }>;
    };

    const place = payload.places?.[0];
    if (!place?.id) return null;

    return {
      placeId: place.id,
      name: place.displayName?.text ?? companyName,
      website: place.websiteUri ?? null,
      phone: place.nationalPhoneNumber ?? null,
      rating: place.rating ?? null,
      reviewCount: place.userRatingCount ?? null,
      address: place.formattedAddress ?? null,
    };
  } catch (error) {
    await log({
      level: 'warn',
      scope: 'enrichment',
      message: 'Google Places lookup errored',
      context: { query, error: String(error) },
    });
    return null;
  }
}
