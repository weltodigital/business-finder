import { z } from 'zod';
import { apiError, json, withUser } from '@/lib/api';
import { getServerClient } from '@/lib/supabase/server';
import { FEEDBACK_VERDICTS } from '@/lib/types';

export const dynamic = 'force-dynamic';

const feedbackInput = z.object({
  verdict: z.enum(FEEDBACK_VERDICTS),
  reason: z.string().max(500).nullish(),
});

/** Human verdicts are the training signal for a better scoring model later. */
export const POST = withUser<{ id: string }>(async ({ request, params, user }) => {
  const parsed = feedbackInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid feedback.', 422, parsed.error.issues);

  const { data, error } = await getServerClient()
    .from('target_feedback')
    .insert({
      target_id: params.id,
      user_id: user.id,
      verdict: parsed.data.verdict,
      reason: parsed.data.reason ?? null,
    })
    .select('*')
    .single();

  if (error) return apiError(error.message, 500);
  return json({ feedback: data }, 201);
});
