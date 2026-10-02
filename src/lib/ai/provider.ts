import type { z } from 'zod';

export interface JsonCompletionRequest<T> {
  /** Stable, cacheable instructions. Put volatile content in `input`. */
  system: string;
  input: string;
  /** JSON Schema describing the expected response object. */
  schema: Record<string, unknown>;
  /** Runtime validation of the model's response. */
  validator: z.ZodType<T>;
  maxTokens?: number;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  /** Cache the system prompt across calls that share it. */
  cacheSystem?: boolean;
}

export interface JsonCompletionResult<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens: number };
}

/**
 * Model-agnostic surface used by the rest of the application. Adding a second
 * provider means implementing this interface — no call sites change.
 */
export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  completeJson<T>(request: JsonCompletionRequest<T>): Promise<JsonCompletionResult<T>>;
}

export class LlmUnavailableError extends Error {
  constructor(message = 'No LLM provider is configured (set ANTHROPIC_API_KEY).') {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}
