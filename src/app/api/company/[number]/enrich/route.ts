import { json, readJson, withUser } from '@/lib/api';
import { normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { enrichCompany } from '@/lib/enrichment';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const POST = withUser<{ number: string }>(async ({ request, params }) => {
  const body = await readJson<{ website?: string }>(request);
  const result = await enrichCompany(normaliseCompanyNumber(params.number), {
    websiteOverride: body.website ?? null,
  });
  return json(result);
});
