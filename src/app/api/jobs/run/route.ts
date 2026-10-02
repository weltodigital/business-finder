import { json, readJson, withUser } from '@/lib/api';
import { jobHandlers, runPendingJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Drains the job queue. The UI calls this while polling a run, which keeps the
 * MVP free of any external scheduler.
 */
export const POST = withUser(async ({ request }) => {
  const body = await readJson<{ limit?: number }>(request);
  const limit = Math.min(Math.max(body.limit ?? 1, 1), 10);
  const result = await runPendingJobs(jobHandlers, limit);
  return json(result);
});
