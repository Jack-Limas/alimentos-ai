import type { FastifyBaseLogger } from 'fastify';
import { LlmError, type GenerateJsonRequest, type LlmClient } from '../../gemini/index.js';

/** Sent with every AI answer, so the backend can show and trace it. */
export interface AiMeta {
  model: string;
  promptVersion: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  attempts: number;
  /** Items or sentences dropped by post-validation (unknown codes, invented figures…). */
  discardedItems: number;
}

export interface RunLlmOptions<Raw, Out> {
  llm: LlmClient;
  log: FastifyBaseLogger;
  endpoint: string;
  promptVersion: string;
  request: GenerateJsonRequest<Raw>;
  /** Post-validation: keeps only what is grounded in the input. */
  sanitize: (raw: Raw) => { result: Out; discarded: number };
}

/**
 * One AI call: generate, sanitize, log one line (never the prompt or a key)
 * and turn LLM failures into the contract's AppError categories.
 */
export async function runLlm<Raw, Out>({
  llm,
  log,
  endpoint,
  promptVersion,
  request,
  sanitize,
}: RunLlmOptions<Raw, Out>): Promise<Out & { meta: AiMeta }> {
  try {
    const answer = await llm.generateJson(request);
    const { result, discarded } = sanitize(answer.data);
    const meta: AiMeta = {
      model: answer.model,
      promptVersion,
      latencyMs: answer.latencyMs,
      ...(answer.inputTokens === undefined ? {} : { inputTokens: answer.inputTokens }),
      ...(answer.outputTokens === undefined ? {} : { outputTokens: answer.outputTokens }),
      attempts: answer.attempts,
      discardedItems: discarded,
    };
    log.info({ ai: { endpoint, ...meta } }, 'AI call succeeded');
    return { ...result, meta };
  } catch (error) {
    if (error instanceof LlmError) {
      log.warn(
        { ai: { endpoint, model: llm.model, promptVersion, errorCategory: error.category } },
        'AI call failed',
      );
      throw error.toAppError();
    }
    throw error;
  }
}
