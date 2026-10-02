import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getCurrentUser } from '@/lib/supabase/server';
import { log } from '@/lib/logger';
import { CompaniesHouseError } from '@/lib/companies-house/client';
import { LlmUnavailableError } from '@/lib/ai';

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function apiError(message: string, status = 400, detail?: unknown) {
  return NextResponse.json({ error: message, detail }, { status });
}

type Handler<T> = (context: { user: User; request: Request; params: T }) => Promise<Response>;

/**
 * Wraps a route handler with authentication and consistent error mapping, so
 * the UI can always show a specific reason rather than a blank failure.
 */
export function withUser<T>(handler: Handler<T>) {
  return async (request: Request, context: { params: T }): Promise<Response> => {
    let user: User | null = null;
    try {
      user = await getCurrentUser();
    } catch (error) {
      return apiError('Supabase is not configured. Check the environment variables.', 500, String(error));
    }

    if (!user) return apiError('Not signed in.', 401);

    try {
      return await handler({ user, request, params: context.params });
    } catch (error) {
      if (error instanceof CompaniesHouseError) {
        const status = error.status === 404 ? 404 : error.status === 429 ? 429 : 502;
        return apiError(
          error.status === 404
            ? 'Not found at Companies House.'
            : 'Companies House API unavailable. Try again shortly.',
          status,
          error.message,
        );
      }

      if (error instanceof LlmUnavailableError) {
        return apiError('AI analysis is unavailable: ANTHROPIC_API_KEY is not configured.', 503);
      }

      const message = error instanceof Error ? error.message : String(error);
      await log({ level: 'error', scope: 'api', message: 'Unhandled API error', context: { error: message } });
      return apiError(message, 500);
    }
  };
}

export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}
