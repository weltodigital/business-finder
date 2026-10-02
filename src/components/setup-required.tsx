const STEPS = [
  {
    title: 'Create a Supabase project',
    detail: 'supabase.com → New project. The free tier is enough for this MVP.',
  },
  {
    title: 'Run the three migrations',
    detail:
      'Paste supabase/migrations/0001_init.sql, 0002_rls.sql and 0003_seed_scoring.sql into the Supabase SQL editor, in that order.',
  },
  {
    title: 'Copy the keys into .env.local',
    detail: 'Supabase → Project Settings → API. You need the Project URL, the anon key and the service_role key.',
  },
  {
    title: 'Restart the dev server',
    detail: 'Next.js reads .env.local at startup, so the server has to be restarted after you edit it.',
  },
];

/**
 * Rendered in place of the application when Supabase is not configured.
 * The spec requires the UI to always say why something is unavailable rather
 * than failing blankly — this is that rule applied to first-run setup.
 */
export function SetupRequired({ status }: { status: { label: string; key: string; set: boolean; required: boolean }[] }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-xl font-semibold tracking-tight">Off-Market Acquisition Finder</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Supabase is not configured yet, so there is nowhere to sign in or store company data.
      </p>

      <section className="card mt-6">
        <header className="card-header">
          <h2 className="card-title">Environment</h2>
          <span className="text-xs text-ink-faint">.env.local</span>
        </header>
        <ul className="divide-y divide-line">
          {status.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-4 py-2">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  item.set ? 'bg-good' : item.required ? 'bg-bad' : 'bg-ink-faint'
                }`}
                aria-hidden
              />
              <span className="text-sm">{item.label}</span>
              <code className="text-[11px] text-ink-faint">{item.key}</code>
              <span className="ml-auto text-xs text-ink-muted">
                {item.set ? 'Set' : item.required ? 'Missing — required' : 'Optional'}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card mt-4">
        <header className="card-header">
          <h2 className="card-title">What to do</h2>
        </header>
        <ol className="divide-y divide-line">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3 px-4 py-3">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">
                {index + 1}
              </span>
              <div>
                <p className="text-sm font-medium">{step.title}</p>
                <p className="mt-0.5 text-sm text-ink-muted">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="mt-4 text-xs text-ink-muted">
        This page disappears as soon as the three Supabase variables are set. Full setup notes are in README.md.
      </p>
    </div>
  );
}
