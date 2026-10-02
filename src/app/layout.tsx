import type { Metadata } from 'next';
import './globals.css';
import { Nav } from '@/components/nav';
import { SetupRequired } from '@/components/setup-required';
import { env } from '@/lib/env';
import { getCurrentUser } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Off-Market Acquisition Finder',
  description: 'Find UK businesses worth buying before they are listed for sale.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const configured = env.isSupabaseConfigured;
  const user = configured ? await safeUser() : null;

  return (
    <html lang="en-GB">
      <body>
        {!configured && <SetupRequired status={environmentStatus()} />}
        {configured && (
          <>
        {user ? (
          <div className="flex min-h-screen">
            <Nav email={user.email ?? ''} />
            <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
          </div>
        ) : (
          <main className="min-h-screen">{children}</main>
        )}
          </>
        )}
      </body>
    </html>
  );
}

function environmentStatus() {
  return [
    { label: 'Companies House API key', key: 'COMPANIES_HOUSE_API_KEY', set: env.has('COMPANIES_HOUSE_API_KEY'), required: true },
    { label: 'Supabase project URL', key: 'NEXT_PUBLIC_SUPABASE_URL', set: env.has('NEXT_PUBLIC_SUPABASE_URL'), required: true },
    { label: 'Supabase anon key', key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', set: env.has('NEXT_PUBLIC_SUPABASE_ANON_KEY'), required: true },
    { label: 'Supabase service role key', key: 'SUPABASE_SERVICE_ROLE_KEY', set: env.has('SUPABASE_SERVICE_ROLE_KEY'), required: true },
    { label: 'Anthropic API key', key: 'ANTHROPIC_API_KEY', set: env.has('ANTHROPIC_API_KEY'), required: false },
    { label: 'Google Places API key', key: 'GOOGLE_MAPS_API_KEY', set: env.has('GOOGLE_MAPS_API_KEY'), required: false },
  ];
}

/** Guards against a misconfigured Supabase project throwing during render. */
async function safeUser() {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
