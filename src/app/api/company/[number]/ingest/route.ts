import { apiError, json, readJson, withUser } from '@/lib/api';
import { ingestCompany } from '@/lib/pipeline/ingest-company';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

interface Body {
  includeAccounts?: boolean;
  includeAppointments?: boolean;
  forceRefresh?: boolean;
}

export const POST = withUser<{ number: string }>(async ({ request, params }) => {
  const body = await readJson<Body>(request);

  const result = await ingestCompany(params.number, {
    includeAccounts: body.includeAccounts ?? false,
    includeAppointments: body.includeAppointments ?? false,
    forceRefresh: body.forceRefresh ?? false,
  });

  if (!result) return apiError('No company with that number exists at Companies House.', 404);
  return json(result);
});
