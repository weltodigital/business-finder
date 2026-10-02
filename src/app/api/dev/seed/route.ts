import { env } from '@/lib/env';
import { apiError, json, withUser } from '@/lib/api';
import { FIXTURES } from '@/lib/fixtures';
import { runAccountsPipeline } from '@/lib/accounts/pipeline';
import { scoreAndPersist } from '@/lib/pipeline/score-company';
import {
  replaceCharges,
  replaceFilings,
  replaceOfficers,
  replacePscs,
  upsertCompanyProfile,
} from '@/lib/repository/companies';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Loads the development fixtures into the database so the UI and scoring model
 * can be worked on without touching the live Companies House API.
 *
 * Guarded twice: it requires a signed-in user and USE_FIXTURES=true, so it can
 * never run against a production dataset.
 */
export const POST = withUser(async () => {
  if (!env.useFixtures) {
    return apiError('Seeding is only available when USE_FIXTURES=true.', 403);
  }

  const seeded: { companyNumber: string; label: string; score: number | null }[] = [];

  for (const fixture of Object.values(FIXTURES)) {
    const stored = await upsertCompanyProfile(fixture.profile);
    await replaceOfficers(stored.id, fixture.officers);
    await replacePscs(stored.id, fixture.pscs);
    await replaceFilings(stored.id, fixture.filings);
    await replaceCharges(stored.id, fixture.charges);

    await runAccountsPipeline(fixture.profile.company_number, stored.id);
    const scored = await scoreAndPersist(fixture.profile.company_number);

    seeded.push({
      companyNumber: fixture.profile.company_number,
      label: fixture.label,
      score: scored?.score.total ?? null,
    });
  }

  return json({ seeded });
});
