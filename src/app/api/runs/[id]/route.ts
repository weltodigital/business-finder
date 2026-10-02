import { apiError, json, withUser } from '@/lib/api';
import { getServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export const GET = withUser<{ id: string }>(async ({ params, user }) => {
  const { data, error } = await getServerClient()
    .from('thesis_runs')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError('Run not found.', 404);
  return json({ run: data });
});
