import type {
  GenerateJsonRequest,
  GenerateJsonResult,
  LlmClient,
  LlmTransport,
} from './llm-client.js';
import { LlmError } from './llm-error.js';
import { isAbortError, mapUpstreamError } from './map-upstream-error.js';

/** Low temperature: the answers explain fixed data, they should not be creative. */
export const TEMPERATURE = 0.2;
/** First attempt plus one internal retry. */
export const MAX_ATTEMPTS = 2;

export interface JsonLlmClientOptions {
  transport: LlmTransport;
  /** null when GEMINI_MODEL is not set. */
  model: string | null;
  /** null when GEMINI_API_KEY is not set. */
  apiKeyConfigured: boolean;
  /** Budget for the whole call, retries included (AI_UPSTREAM_TIMEOUT_MS). */
  timeoutMs: number;
  now?: () => number;
}

/** The data block of the user message. Keeping it fenced marks it as data, not instructions. */
export function renderUserData(userData: unknown): string {
  return `DATA (JSON):\n${JSON.stringify(userData)}`;
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined || text.trim() === '') throw new LlmError('UPSTREAM_ERROR', true);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new LlmError('UPSTREAM_ERROR', true);
  }
}

/**
 * LlmClient over a raw transport: JSON output, schema validation, one retry
 * for 5xx / network / invalid JSON, and a single timeout for the whole call.
 */
export function createJsonLlmClient({
  transport,
  model,
  apiKeyConfigured,
  timeoutMs,
  now = () => performance.now(),
}: JsonLlmClientOptions): LlmClient {
  return {
    model,

    async generateJson<T>(request: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>> {
      if (!apiKeyConfigured) {
        throw new LlmError('INVALID_API_KEY', false, undefined, 'GEMINI_API_KEY is not configured');
      }
      if (model === null) {
        throw new LlmError('MODEL_NOT_FOUND', false, undefined, 'GEMINI_MODEL is not configured');
      }

      const timeout = new AbortController();
      const timer = setTimeout(() => {
        timeout.abort();
      }, timeoutMs);
      const signal = request.signal
        ? AbortSignal.any([timeout.signal, request.signal])
        : timeout.signal;
      const started = now();
      const userText = renderUserData(request.userData);

      try {
        for (let attempt = 1; ; attempt += 1) {
          try {
            const response = await transport({
              model,
              systemInstruction: request.systemPrompt,
              userText,
              jsonSchema: request.jsonSchema,
              temperature: TEMPERATURE,
              signal,
            });
            const parsed = request.schema.safeParse(parseJson(response.text));
            if (!parsed.success) throw new LlmError('UPSTREAM_ERROR', true);
            return {
              data: parsed.data,
              model,
              latencyMs: Math.round(now() - started),
              ...(response.inputTokens === undefined ? {} : { inputTokens: response.inputTokens }),
              ...(response.outputTokens === undefined
                ? {}
                : { outputTokens: response.outputTokens }),
              attempts: attempt,
            };
          } catch (error) {
            // A timeout is final: the budget covers every attempt.
            const mapped =
              signal.aborted || isAbortError(error)
                ? new LlmError('TIMEOUT')
                : mapUpstreamError(error);
            if (!mapped.retryable || attempt >= MAX_ATTEMPTS) throw mapped;
          }
        }
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
