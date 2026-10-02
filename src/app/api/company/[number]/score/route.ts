import { apiError, json, readJson, withUser } from '@/lib/api';
import { normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { scoreAndPersist } from '@/lib/pipeline/score-company';
import { loadThesis } from '@/lib/repository/theses';

export const dynamic = 'force-dynamic';

export const POST = withUser<{ number: string }>(async ({ request, params }) => {
  const body = await readJson<{ thesisId?: string }>(request);
  const thesis = body.thesisId ? await loadThesis(body.thesisId) : null;

  const result = await scoreAndPersist(normaliseCompanyNumber(params.number), thesis);
  if (!result) return apiError('This company has not been imported yet.', 404);

  return json({ score: result.score, signals: result.signals });
});
