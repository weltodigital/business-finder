import { getAdminClient } from '@/lib/supabase/admin';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level?: LogLevel;
  scope: string;
  message: string;
  companyNumber?: string;
  context?: Record<string, unknown>;
}

const SECRET_KEY_PATTERN = /(api[-_]?key|authorization|token|secret|password|bearer)/i;

/** Strips anything that looks like a credential before persisting/printing. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? '[redacted]' : redact(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 2000)}…`;
  return value;
}

export async function log(entry: LogEntry): Promise<void> {
  const level = entry.level ?? 'info';
  const context = entry.context ? (redact(entry.context) as Record<string, unknown>) : null;

  const line = `[${level}] ${entry.scope}: ${entry.message}`;
  if (level === 'error') console.error(line, context ?? '');
  else if (level === 'warn') console.warn(line, context ?? '');
  else console.log(line, context ?? '');

  try {
    const db = getAdminClient();
    await db.from('app_logs').insert({
      level,
      scope: entry.scope,
      message: entry.message,
      company_number: entry.companyNumber ?? null,
      context,
    });
  } catch {
    // Logging must never break the caller (e.g. Supabase not configured yet).
  }
}
