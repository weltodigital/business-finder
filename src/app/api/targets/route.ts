import { z } from 'zod';
import { apiError, json, withUser } from '@/lib/api';
import { getServerClient } from '@/lib/supabase/server';
import { normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { PIPELINE_STATUSES } from '@/lib/types';

export const dynamic = 'force-dynamic';

const createTarget = z.object({
  companyNumber: z.string().min(4).max(20),
  thesisId: z.string().uuid().nullish(),
  status: z.enum(PIPELINE_STATUSES).default('DISCOVERED'),
});

export const GET = withUser(async ({ user }) => {
  const { data, error } = await getServerClient()
    .from('targets')
    .select('*, companies(company_number, name, region, postcode, incorporation_date, website)')
    .eq('user_id', user.id)
    .order('algorithm_score', { ascending: false, nullsFirst: false });

  if (error) return apiError(error.message, 500);
  return json({ targets: data ?? [] });
});

export const POST = withUser(async ({ request, user }) => {
  const parsed = createTarget.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError('Invalid target.', 422, parsed.error.issues);

  const companyNumber = normaliseCompanyNumber(parsed.data.companyNumber);
  const db = getServerClient();

  const { data: company } = await db
    .from('companies')
    .select('id')
    .eq('company_number', companyNumber)
    .maybeSingle();

  if (!company) return apiError('Import the company before saving it as a target.', 404);

  // Carry across the latest algorithmic score so the pipeline can rank targets
  // without recomputing, while the algorithmic score itself stays immutable.
  const { data: score } = await db
    .from('company_scores')
    .select('total_score')
    .eq('company_id', company.id)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await db
    .from('targets')
    .upsert(
      {
        user_id: user.id,
        company_id: company.id,
        thesis_id: parsed.data.thesisId ?? null,
        status: parsed.data.status,
        algorithm_score: score?.total_score ?? null,
      },
      { onConflict: 'user_id,company_id' },
    )
    .select('*')
    .single();

  if (error) return apiError(error.message, 500);
  return json({ target: data }, 201);
});
