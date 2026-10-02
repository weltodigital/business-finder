'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, ErrorNotice } from '@/components/primitives';
import { SIC_GROUPS, SIC_SECTORS, codesForLabels, keywordsForLabels } from '@/lib/sic';
import { SIC_CODE_LIST, sicDescription } from '@/lib/sic-descriptions';

export function SearchForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [industries, setIndustries] = useState<string[]>([]);
  const [extraCodes, setExtraCodes] = useState<string[]>([]);
  const [codeQuery, setCodeQuery] = useState('');
  const [locations, setLocations] = useState('');
  const [radius, setRadius] = useState('');
  const [revenueMin, setRevenueMin] = useState('1000000');
  const [revenueMax, setRevenueMax] = useState('5000000');
  const [employeeMin, setEmployeeMin] = useState('');
  const [employeeMax, setEmployeeMax] = useState('');
  const [ageMin, setAgeMin] = useState('15');
  const [ownerManaged, setOwnerManaged] = useState(true);
  const [include, setInclude] = useState('');
  const [exclude, setExclude] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleIndustry(label: string) {
    setIndustries((current) =>
      current.includes(label) ? current.filter((l) => l !== label) : [...current, label],
    );
  }

  const codeMatches = useMemo(() => {
    const query = codeQuery.trim().toLowerCase();
    if (query.length < 2) return [];
    return SIC_CODE_LIST.filter(
      ({ code, description }) =>
        !extraCodes.includes(code) && (code.startsWith(query) || description.toLowerCase().includes(query)),
    ).slice(0, 8);
  }, [codeQuery, extraCodes]);

  function addCode(code: string) {
    setExtraCodes((current) => (current.includes(code) ? current : [...current, code]));
    setCodeQuery('');
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const locationList = splitList(locations);

      const thesisResponse = await fetch('/api/theses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:
            name.trim() ||
            `${industries[0] ?? (extraCodes[0] ? sicDescription(extraCodes[0]) : null) ?? 'Search'} — ${locationList[0] ?? 'UK'}`,
          industries,
          sicCodes: Array.from(new Set([...codesForLabels(industries), ...extraCodes])),
          geography: {
            locations: locationList,
            postcodePrefixes: [],
            ...(radius ? { radiusMiles: Number(radius) } : {}),
          },
          revenueMin: numberOrNull(revenueMin),
          revenueMax: numberOrNull(revenueMax),
          employeeMin: numberOrNull(employeeMin),
          employeeMax: numberOrNull(employeeMax),
          companyAgeMin: numberOrNull(ageMin),
          companyAgeMax: null,
          ownerManaged,
          excludeInsolvency: true,
          keywordsInclude: [...splitList(include), ...keywordsForLabels(industries)],
          keywordsExclude: splitList(exclude),
        }),
      });

      const thesisPayload = await thesisResponse.json();
      if (!thesisResponse.ok) throw new Error(thesisPayload.error ?? 'Could not save the search.');

      const runResponse = await fetch(`/api/theses/${thesisPayload.thesis.id}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const runPayload = await runResponse.json();
      if (!runResponse.ok) throw new Error(runPayload.error ?? 'Could not start the search.');

      router.push(`/search/${runPayload.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="divide-y divide-line">
        <Section title="What type of business are you looking for?">
          <div className="space-y-3">
            {SIC_SECTORS.map((sector) => (
              <div key={sector}>
                <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">{sector}</h3>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {SIC_GROUPS.filter((group) => group.sector === sector).map((group) => (
                    <label
                      key={group.label}
                      className="flex cursor-pointer items-start gap-2 rounded border border-line px-2.5 py-2 text-sm hover:bg-surface-sunken"
                      title={group.codes.map((code) => `${code} ${sicDescription(code) ?? ''}`).join('\n')}
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={industries.includes(group.label)}
                        onChange={() => toggleIndustry(group.label)}
                      />
                      <span>
                        <span className="block">{group.label}</span>
                        <span className="block text-[11px] text-ink-faint">SIC {group.codes.join(', ')}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                Any other business type
              </h3>
              <div className="relative">
                <input
                  className="input"
                  placeholder="Search all SIC codes, e.g. bakery, kennels, 43290"
                  value={codeQuery}
                  onChange={(e) => setCodeQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (codeMatches[0]) addCode(codeMatches[0].code);
                    }
                  }}
                />
                {codeMatches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded border border-line bg-surface shadow-sm">
                    {codeMatches.map(({ code, description }) => (
                      <li key={code}>
                        <button
                          type="button"
                          className="flex w-full gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-surface-sunken"
                          onClick={() => addCode(code)}
                        >
                          <span className="tabular-nums text-ink-faint">{code}</span>
                          <span>{description}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {extraCodes.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {extraCodes.map((code) => (
                    <button
                      key={code}
                      type="button"
                      className="rounded border border-line px-2 py-0.5 text-xs hover:bg-surface-sunken"
                      onClick={() => setExtraCodes((current) => current.filter((c) => c !== code))}
                      title="Remove"
                    >
                      {code} {sicDescription(code)} ×
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Section>

        <Section title="Where?">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Locations (comma separated)" className="sm:col-span-2">
              <input
                className="input"
                placeholder="Hampshire, Surrey, West Sussex"
                value={locations}
                onChange={(e) => setLocations(e.target.value)}
              />
            </Field>
            <Field label="Radius (miles)">
              <input
                className="input"
                type="number"
                min={0}
                max={500}
                placeholder="75"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </Field>
          </div>
          <p className="mt-1.5 text-xs text-ink-muted">
            Companies House searches by registered office location. Radius is recorded on the thesis for later use
            and does not yet filter results.
          </p>
        </Section>

        <Section title="What size?">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Revenue minimum (£)">
              <input className="input" type="number" min={0} step={50000} value={revenueMin} onChange={(e) => setRevenueMin(e.target.value)} />
            </Field>
            <Field label="Revenue maximum (£)">
              <input className="input" type="number" min={0} step={50000} value={revenueMax} onChange={(e) => setRevenueMax(e.target.value)} />
            </Field>
            <Field label="Employees minimum">
              <input className="input" type="number" min={0} value={employeeMin} onChange={(e) => setEmployeeMin(e.target.value)} />
            </Field>
            <Field label="Employees maximum">
              <input className="input" type="number" min={0} value={employeeMax} onChange={(e) => setEmployeeMax(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="What age and ownership?">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Minimum company age (years)">
              <input className="input" type="number" min={0} max={200} value={ageMin} onChange={(e) => setAgeMin(e.target.value)} />
            </Field>
            <div className="sm:col-span-2 flex items-end">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" checked={ownerManaged} onChange={(e) => setOwnerManaged(e.target.checked)} />
                Prefer owner-managed businesses
              </label>
            </div>
          </div>
        </Section>

        <Section title="Keywords">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Include">
              <input className="input" placeholder="precision engineering, CNC" value={include} onChange={(e) => setInclude(e.target.value)} />
            </Field>
            <Field label="Exclude">
              <input className="input" placeholder="recruitment, holdings" value={exclude} onChange={(e) => setExclude(e.target.value)} />
            </Field>
          </div>
        </Section>

        <Section title="Name this search">
          <input className="input" placeholder="Engineering — South East" value={name} onChange={(e) => setName(e.target.value)} />
        </Section>

        {error && (
          <div className="p-4">
            <ErrorNotice title="Could not start the search" detail={error} />
          </div>
        )}

        <div className="flex items-center gap-3 p-4">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Starting…' : 'Find Targets'}
          </button>
          <span className="text-xs text-ink-muted">
            Saved automatically so you can re-run it later from Saved Searches.
          </span>
        </div>
      </form>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="p-4">
      <legend className="mb-2 text-sm font-semibold">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
