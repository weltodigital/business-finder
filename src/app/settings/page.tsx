import { Card, PageHeader } from '@/components/primitives';
import { requireUser } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_SCORING_CONFIG } from '@/lib/scoring/config';
import { loadActiveScoringConfig } from '@/lib/pipeline/score-company';
import { shortDate, titleCase } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Settings' };

const INTEGRATIONS = [
  { key: 'COMPANIES_HOUSE_API_KEY', label: 'Companies House API', required: true, note: 'Company search, profiles, officers, PSCs, filings, charges and accounts documents.' },
  { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API', required: false, note: 'AI target analysis and the accounts extraction fallback. Without it, extraction still works via XBRL and text.' },
  { key: 'GOOGLE_MAPS_API_KEY', label: 'Google Places API', required: false, note: 'Business listing, rating and review count during enrichment.' },
  { key: 'FIRECRAWL_API_KEY', label: 'Firecrawl', required: false, note: 'Not used yet; the built-in crawler handles website enrichment.' },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const { version, config } = await loadActiveScoringConfig();
  const logs = await recentErrors();

  return (
    <>
      <PageHeader title="Settings" subtitle={user.email ?? undefined} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Integrations">
          <ul className="divide-y divide-line">
            {INTEGRATIONS.map((integration) => {
              const configured = Boolean(process.env[integration.key]);
              return (
                <li key={integration.key} className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ${configured ? 'bg-good' : integration.required ? 'bg-bad' : 'bg-ink-faint'}`}
                      aria-hidden
                    />
                    <span className="text-sm font-medium">{integration.label}</span>
                    <span className="ml-auto text-xs text-ink-muted">
                      {configured ? 'Configured' : integration.required ? 'Missing — required' : 'Not configured'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">{integration.note}</p>
                </li>
              );
            })}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
            Keys are read server-side only and are never sent to the browser.
          </p>
        </Card>

        <Card title={`Scoring model (${version})`}>
          <ul className="divide-y divide-line text-sm">
            {Object.entries(config.components).map(([key, component]) => (
              <li key={key} className="flex px-4 py-2">
                <span className="flex-1">{titleCase(key)}</span>
                <span className="tabular text-ink-muted">
                  {'max' in component ? `${component.max} points` : `${(component as { min: number }).min} points`}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
            Weights live in the <code>scoring_configs</code> table, so the model can be retuned without re-extracting
            any company data. The bundled default is v{DEFAULT_SCORING_CONFIG.max_score === 100 ? '1' : '1'}.
          </p>
        </Card>

        <Card title="Recent errors" className="lg:col-span-2">
          {logs.length === 0 ? (
            <p className="px-4 py-4 text-sm text-ink-muted">No errors logged.</p>
          ) : (
            <ul className="divide-y divide-line">
              {logs.map((entry) => (
                <li key={entry.id} className="px-4 py-2">
                  <div className="flex gap-2 text-sm">
                    <span className="text-bad">{entry.scope}</span>
                    <span className="text-ink-muted">{entry.message}</span>
                    <span className="ml-auto text-xs text-ink-faint">{shortDate(entry.created_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}

interface LogRow {
  id: string;
  scope: string;
  message: string;
  created_at: string;
}

async function recentErrors(): Promise<LogRow[]> {
  try {
    const { data } = await getAdminClient()
      .from('app_logs')
      .select('id, scope, message, created_at')
      .in('level', ['error', 'warn'])
      .order('created_at', { ascending: false })
      .limit(20);
    return (data ?? []) as LogRow[];
  } catch {
    return [];
  }
}
