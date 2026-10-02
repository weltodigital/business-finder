import { apiError, json, readJson, withUser } from '@/lib/api';
import { getServerClient } from '@/lib/supabase/server';
import { enqueueJob } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

interface Body {
  limits?: { universe?: number; candidates?: number; deepResearch?: number };
}

/**
 * Starts a search run. The work itself happens in a background job so the
 * request returns immediately and the UI can poll for progress.
 */
export const POST = withUser<{ id: string }>(async ({ request, params, user }) => {
  const db = getServerClient();

  const { data: thesis } = await db
    .from('acquisition_theses')
    .select('id')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!thesis) return apiError('Thesis not found.', 404);

  const body = await readJson<Body>(request);

  const { data: run, error } = await db
    .from('thesis_runs')
    .insert({ thesis_id: params.id, user_id: user.id, status: 'PENDING', stage: 'queued' })
    .select('id')
    .single();

  if (error || !run) return apiError(error?.message ?? 'Could not start the run.', 500);

  const jobId = await enqueueJob('thesis_run', {
    runId: run.id as string,
    userId: user.id,
    payload: { limits: body.limits ?? {} },
    priority: 10,
  });

  return json({ runId: run.id, jobId }, 202);
});
