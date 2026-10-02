import { getAdminClient } from '@/lib/supabase/admin';
import { log } from '@/lib/logger';
import type { JobRecord, JobStatus, JobType } from './types';

const MAX_ATTEMPTS = 3;

export interface EnqueueOptions {
  companyId?: string | null;
  runId?: string | null;
  userId?: string | null;
  payload?: Record<string, unknown>;
  priority?: number;
}

export async function enqueueJob(jobType: JobType, options: EnqueueOptions = {}): Promise<string> {
  const { data, error } = await getAdminClient()
    .from('jobs')
    .insert({
      job_type: jobType,
      status: 'PENDING',
      company_id: options.companyId ?? null,
      run_id: options.runId ?? null,
      user_id: options.userId ?? null,
      payload: options.payload ?? {},
      priority: options.priority ?? 100,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Could not enqueue ${jobType}: ${error.message}`);
  return data.id as string;
}

export type JobHandler = (job: JobRecord) => Promise<Record<string, unknown> | void>;

/**
 * Claims and runs pending jobs one at a time. Deliberately simple: a single
 * process draining a table is enough for one user, and it keeps the pipeline
 * restartable without extra infrastructure.
 */
export async function runPendingJobs(
  handlers: Record<string, JobHandler>,
  limit = 5,
): Promise<{ processed: number; failed: number }> {
  const db = getAdminClient();
  let processed = 0;
  let failed = 0;

  for (let i = 0; i < limit; i++) {
    const { data: pending } = await db
      .from('jobs')
      .select('*')
      .eq('status', 'PENDING')
      .lte('scheduled_for', new Date().toISOString())
      .order('priority', { ascending: true })
      .order('scheduled_for', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!pending) break;

    const job = pending as unknown as JobRecord;
    const claimed = await claimJob(job.id);
    if (!claimed) continue;

    const handler = handlers[job.job_type];
    if (!handler) {
      await finishJob(job.id, 'FAILED', null, `No handler registered for ${job.job_type}`);
      failed++;
      continue;
    }

    try {
      const result = (await handler(job)) ?? {};
      await finishJob(job.id, 'COMPLETE', result as Record<string, unknown>, null);
      processed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const attempts = job.attempts + 1;
      const status: JobStatus = attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING';

      await db
        .from('jobs')
        .update({
          status,
          error: message,
          attempts,
          // Back off before retrying so a transient API failure does not spin.
          scheduled_for: new Date(Date.now() + attempts * 30_000).toISOString(),
          finished_at: status === 'FAILED' ? new Date().toISOString() : null,
        })
        .eq('id', job.id);

      await log({
        level: 'error',
        scope: 'jobs',
        message: `Job ${job.job_type} failed`,
        context: { jobId: job.id, attempts, error: message },
      });
      failed++;
    }
  }

  return { processed, failed };
}

/** Optimistic claim: only succeeds if the job is still PENDING. */
async function claimJob(jobId: string): Promise<boolean> {
  const { data } = await getAdminClient()
    .from('jobs')
    .update({ status: 'PROCESSING', started_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();
  return Boolean(data);
}

async function finishJob(
  jobId: string,
  status: JobStatus,
  result: Record<string, unknown> | null,
  error: string | null,
): Promise<void> {
  await getAdminClient()
    .from('jobs')
    .update({ status, result, error, finished_at: new Date().toISOString() })
    .eq('id', jobId);
}
