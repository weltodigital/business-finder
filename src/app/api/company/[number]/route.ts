import { apiError, json, withUser } from '@/lib/api';
import { normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { loadDossier } from '@/lib/repository/dossier';
import { detectSignals } from '@/lib/signals';
import { scoreCompany } from '@/lib/scoring';
import { loadActiveScoringConfig } from '@/lib/pipeline/score-company';

export const dynamic = 'force-dynamic';

/** Reads what is already stored — never triggers Companies House calls. */
export const GET = withUser<{ number: string }>(async ({ params }) => {
  const companyNumber = normaliseCompanyNumber(params.number);
  const dossier = await loadDossier(companyNumber);
  if (!dossier) {
    return apiError('This company has not been imported yet.', 404);
  }

  const signals = detectSignals(dossier);
  const { config } = await loadActiveScoringConfig();
  const score = scoreCompany(dossier, signals, { config });

  return json({ dossier, signals, score });
});
