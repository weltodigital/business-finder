import { apiError, json, readJson, withUser } from '@/lib/api';
import { normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { scoreAndPersist } from '@/lib/pipeline/score-company';
import { loadThesis } from '@/lib/repository/theses';
import { analyseTarget } from '@/lib/ai/analyse-target';
import { getAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Expensive: only run for companies the user has shortlisted. */
export const POST = withUser<{ number: string }>(async ({ request, params, user }) => {
  const companyNumber = normaliseCompanyNumber(params.number);
  const body = await readJson<{ thesisId?: string }>(request);
  const thesis = body.thesisId ? await loadThesis(body.thesisId) : null;

  const scored = await scoreAndPersist(companyNumber, thesis);
  if (!scored) return apiError('This company has not been imported yet.', 404);

  const { analysis, model } = await analyseTarget({ ...scored, thesis });

  const db = getAdminClient();
  await db
    .from('targets')
    .update({ ai_analysis: analysis, ai_analysed_at: new Date().toISOString(), ai_model: model })
    .eq('company_id', scored.dossier.company.id!)
    .eq('user_id', user.id);

  return json({ analysis, model });
});
