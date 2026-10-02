import { env } from '@/lib/env';
import { AnthropicProvider, DEFAULT_MODEL } from './anthropic';
import { LlmUnavailableError, type LlmProvider } from './provider';

let cached: LlmProvider | null = null;

/** Returns the configured provider, or null when no LLM is available. */
export function getLlmProvider(): LlmProvider | null {
  if (!env.anthropicApiKey) return null;
  if (!cached) cached = new AnthropicProvider(DEFAULT_MODEL);
  return cached;
}

export function requireLlmProvider(): LlmProvider {
  const provider = getLlmProvider();
  if (!provider) throw new LlmUnavailableError();
  return provider;
}

export { LlmUnavailableError, DEFAULT_MODEL };
export type { LlmProvider, JsonCompletionRequest, JsonCompletionResult } from './provider';
