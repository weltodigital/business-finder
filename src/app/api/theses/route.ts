import { z } from 'zod';
import { apiError, json, withUser } from '@/lib/api';
import { getServerClient } from '@/lib/supabase/server';
import { rowToThesis, thesisToRow } from '@/lib/repository/theses';

export const dynamic = 'force-dynamic';

const thesisInput = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullish(),
  industries: z.array(z.string().max(80)).max(20).default([]),
  sicCodes: z.array(z.string().regex(/^\d{4,5}$/)).max(50).default([]),
  geography: z
    .object({
      locations: z.array(z.string().max(80)).max(20).default([]),
      postcodePrefixes: z.array(z.string().max(6)).max(50).default([]),
      radiusMiles: z.number().int().min(0).max(500).optional(),
    })
    .default({ locations: [], postcodePrefixes: [] }),
  revenueMin: z.number().min(0).nullable().default(null),
  revenueMax: z.number().min(0).nullable().default(null),
  employeeMin: z.number().int().min(0).nullable().default(null),
  employeeMax: z.number().int().min(0).nullable().default(null),
  companyAgeMin: z.number().int().min(0).max(300).nullable().default(null),
  companyAgeMax: z.number().int().min(0).max(300).nullable().default(null),
  ownerManaged: z.boolean().default(true),
  excludeInsolvency: z.boolean().default(true),
  keywordsInclude: z.array(z.string().max(80)).max(30).default([]),
  keywordsExclude: z.array(z.string().max(80)).max(30).default([]),
});

export const GET = withUser(async ({ user }) => {
  const { data, error } = await getServerClient()
    .from('acquisition_theses')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return apiError(error.message, 500);
  return json({ theses: ((data ?? []) as Record<string, unknown>[]).map(rowToThesis) });
});

export const POST = withUser(async ({ request, user }) => {
  const body = await request.json().catch(() => null);
  const parsed = thesisInput.safeParse(body);
  if (!parsed.success) return apiError('Invalid thesis.', 422, parsed.error.issues);

  const { data, error } = await getServerClient()
    .from('acquisition_theses')
    .insert(thesisToRow({ ...parsed.data, description: parsed.data.description ?? null }, user.id))
    .select('*')
    .single();

  if (error) return apiError(error.message, 500);
  return json({ thesis: rowToThesis(data as Record<string, unknown>) }, 201);
});
