import { z } from 'zod';
import { apiError, json, withUser } from '@/lib/api';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const noteInput = z.object({ body: z.string().min(1).max(10_000) });

export const POST = withUser<{ id: string }>(async ({ request, params, user }) => {
  const parsed = noteInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('A note body is required.', 422);

  const { data, error } = await getServerClient()
    .from('target_notes')
    .insert({ target_id: params.id, user_id: user.id, body: parsed.data.body })
    .select('*')
    .single();

  if (error) return apiError(error.message, 500);
  return json({ note: data }, 201);
});
