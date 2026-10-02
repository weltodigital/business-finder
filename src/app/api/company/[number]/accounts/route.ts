import { apiError, json, readJson, withUser } from '@/lib/api';
import { normaliseCompanyNumber } from '@/lib/companies-house/companies';
import { findCompanyByNumber } from '@/lib/repository/companies';
import { runAccountsPipeline } from '@/lib/accounts/pipeline';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export const POST = withUser<{ number: string }>(async ({ request, params }) => {
  const companyNumber = normaliseCompanyNumber(params.number);
  const company = await findCompanyByNumber(companyNumber);
  if (!company) return apiError('Import the company before extracting its accounts.', 404);

  const body = await readJson<{ forceRefresh?: boolean; maxDocuments?: number; allowLlm?: boolean }>(request);

  const result = await runAccountsPipeline(companyNumber, company.id, {
    forceRefresh: body.forceRefresh ?? false,
    maxDocuments: body.maxDocuments,
    allowLlm: body.allowLlm ?? true,
  });

  return json(result);
});
