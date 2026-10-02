import { z } from 'zod';
import { apiError, json, withUser } from '@/lib/api';
import { getServerClient } from '@/lib/supabase/server';
import { PIPELINE_STATUSES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const patchTarget = z.object({
  status: z.enum(PIPELINE_STATUSES).optional(),
  manualScore: z.number().min(0).max(100).nullable().optional(),
  manualScoreReason: z.string().max(2000).nullable().optional(),
});

/** The algorithmic score is never overwritten — the manual score sits beside it. */
export const PATCH = withUser<{ id: string }>(async ({ request, params, user }) => {
  const parsed = patchTarget.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid update.', 422, parsed.error.issues);

  const update: Record<string, unknown> = {};
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.manualScore !== undefined) update.manual_score = parsed.data.manualScore;
  if (parsed.data.manualScoreReason !== undefined) update.manual_score_reason = parsed.data.manualScoreReason;

  if (Object.keys(update).length === 0) return apiError('Nothing to update.', 400);

  const { data, error } = await getServerClient()
    .from('targets')
    .update(update)
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError('Target not found.', 404);
  return json({ target: data });
});

export const DELETE = withUser<{ id: string }>(async ({ params, user }) => {
  const { error } = await getServerClient()
    .from('targets')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id);

  if (error) return apiError(error.message, 500);
  return json({ deleted: true });
});
