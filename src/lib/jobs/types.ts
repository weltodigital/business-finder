export const JOB_TYPES = [
  'company_import',
  'company_enrichment',
  'accounts_retrieval',
  'accounts_extraction',
  'financial_validation',
  'website_enrichment',
  'ai_analysis',
  'thesis_run',
] as const;

export type JobType = (typeof JOB_TYPES)[number];

export const JOB_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETE', 'FAILED', 'NEEDS_REVIEW'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export interface JobRecord {
  id: string;
  job_type: JobType;
  status: JobStatus;
  company_id: string | null;
  run_id: string | null;
  user_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}
