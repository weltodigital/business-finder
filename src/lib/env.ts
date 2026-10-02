/**
 * Environment access. Server-only secrets are read lazily so that missing
 * optional keys degrade a single feature rather than crashing the app.
 */

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim().length > 0 ? v.trim() : undefined;
}

function required(name: string): string {
  const v = optional(name);
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  get companiesHouseApiKey() {
    return required('COMPANIES_HOUSE_API_KEY');
  },
  get anthropicApiKey() {
    return optional('ANTHROPIC_API_KEY');
  },
  get googleMapsApiKey() {
    return optional('GOOGLE_MAPS_API_KEY');
  },
  get firecrawlApiKey() {
    return optional('FIRECRAWL_API_KEY');
  },
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get supabaseServiceRoleKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get useFixtures() {
    return optional('USE_FIXTURES') === 'true';
  },
  has(name: string) {
    return optional(name) !== undefined;
  },
  /** Supabase backs both auth and storage: without it no page can render data. */
  get isSupabaseConfigured() {
    return (
      optional('NEXT_PUBLIC_SUPABASE_URL') !== undefined &&
      optional('NEXT_PUBLIC_SUPABASE_ANON_KEY') !== undefined &&
      optional('SUPABASE_SERVICE_ROLE_KEY') !== undefined
    );
  },
};
