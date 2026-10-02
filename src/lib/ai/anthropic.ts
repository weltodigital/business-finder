import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { env } from '@/lib/env';
import { log } from '@/lib/logger';
import type { JsonCompletionRequest, JsonCompletionResult, LlmProvider } from './provider';

export const DEFAULT_MODEL = 'claude-opus-5';

export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  private client: Anthropic;

  constructor(readonly model: string = DEFAULT_MODEL) {
    this.client = new Anthropic({ apiKey: env.anthropicApiKey });
  }

  async completeJson<T>(request: JsonCompletionRequest<T>): Promise<JsonCompletionResult<T>> {
    const response = await this.client.messages.parse({
      model: this.model,
      max_tokens: request.maxTokens ?? 16000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: request.effort ?? 'high',
        // The helper is typed against a literal schema; ours is built at runtime.
        format: jsonSchemaOutputFormat(request.schema as never),
      },
      // The system prompt is identical across companies, so caching it makes
      // batch analysis materially cheaper.
      system: request.cacheSystem === false
        ? request.system
        : [{ type: 'text', text: request.system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: request.input }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error(
        `Model declined the request (${response.stop_details?.category ?? 'unknown'}).`,
      );
    }

    const raw = response.parsed_output ?? extractJson(response);
    if (raw === null) throw new Error('Model returned no parseable JSON output.');

    const parsed = request.validator.safeParse(raw);
    if (!parsed.success) {
      await log({
        level: 'error',
        scope: 'ai',
        message: 'Model output failed schema validation',
        context: { issues: parsed.error.issues.slice(0, 10) },
      });
      throw new Error(`Model output did not match the expected schema: ${parsed.error.message}`);
    }

    return {
      data: parsed.data,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    };
  }
}

/** Fallback for the rare case where structured output parsing returns null. */
export function extractJson(response: {
  content: ReadonlyArray<{ type: string; text?: string }>;
}): unknown {
  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text ?? '')
    .join('\n')
    .trim();
  if (!text) return null;

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}
