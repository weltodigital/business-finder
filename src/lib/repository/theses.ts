import { getAdminClient } from '@/lib/supabase/admin';
import type { AcquisitionThesis } from '@/lib/types';

export function rowToThesis(row: Record<string, unknown>): AcquisitionThesis {
  return {
    id: row.id as string,
    name: row.name as string,
    description: (row.description as string) ?? null,
    industries: (row.industries as string[]) ?? [],
    sicCodes: (row.sic_codes as string[]) ?? [],
    geography: (row.geography as AcquisitionThesis['geography']) ?? {},
    revenueMin: numOrNull(row.revenue_min),
    revenueMax: numOrNull(row.revenue_max),
    employeeMin: numOrNull(row.employee_min),
    employeeMax: numOrNull(row.employee_max),
    companyAgeMin: numOrNull(row.company_age_min),
    companyAgeMax: numOrNull(row.company_age_max),
    ownerManaged: Boolean(row.owner_managed),
    excludeInsolvency: Boolean(row.exclude_insolvency),
    keywordsInclude: (row.keywords_include as string[]) ?? [],
    keywordsExclude: (row.keywords_exclude as string[]) ?? [],
  };
}

export function thesisToRow(thesis: AcquisitionThesis, userId: string): Record<string, unknown> {
  return {
    user_id: userId,
    name: thesis.name,
    description: thesis.description ?? null,
    industries: thesis.industries,
    sic_codes: thesis.sicCodes,
    geography: thesis.geography,
    revenue_min: thesis.revenueMin,
    revenue_max: thesis.revenueMax,
    employee_min: thesis.employeeMin,
    employee_max: thesis.employeeMax,
    company_age_min: thesis.companyAgeMin,
    company_age_max: thesis.companyAgeMax,
    owner_managed: thesis.ownerManaged,
    exclude_insolvency: thesis.excludeInsolvency,
    keywords_include: thesis.keywordsInclude,
    keywords_exclude: thesis.keywordsExclude,
  };
}

export async function loadThesis(thesisId: string): Promise<AcquisitionThesis | null> {
  const { data } = await getAdminClient()
    .from('acquisition_theses')
    .select('*')
    .eq('id', thesisId)
    .maybeSingle();
  return data ? rowToThesis(data as Record<string, unknown>) : null;
}

function numOrNull(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}
