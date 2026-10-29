import type { FastifyBaseLogger } from 'fastify';
import { LlmError, type GenerateJsonRequest, type LlmClient } from '../../gemini/index.js';
import { emptyDiscardStats, type DiscardStats } from '../../shared/text/discard-stats.js';

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
  /**
   * Sent once instead of `request` when its answer was cut by the token limit
   * (finishReason MAX_TOKENS): less data and a shorter answer, never the same
   * request again and never more tokens.
   */
  compactRequest?: GenerateJsonRequest<Raw>;
  /** Post-validation: keeps only what is grounded in the input; counts drops in `stats`. */
  sanitize: (
    raw: Raw,
    stats: DiscardStats,
    context: { compacted: boolean },
  ) => { result: Out; discarded: number };
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
  compactRequest,
  sanitize,
}: RunLlmOptions<Raw, Out>): Promise<Out & { meta: AiMeta }> {
  const discards = emptyDiscardStats();
  let compacted = false;

  async function generate() {
    try {
      return await llm.generateJson(request);
    } catch (error) {
      const cut = error instanceof LlmError && error.trace?.at(-1)?.finishReason === 'MAX_TOKENS';
      if (!cut || !compactRequest) throw error;
      compacted = true;
      const earlier = error.trace ?? [];
      try {
        const answer = await llm.generateJson(compactRequest);
        return {
          ...answer,
          trace: [...earlier, ...answer.trace],
          attempts: earlier.length + answer.attempts,
        };
      } catch (second) {
        if (second instanceof LlmError) second.trace = [...earlier, ...(second.trace ?? [])];
        throw second;
      }
    }
  }

  try {
    const answer = await generate();
    let sanitized: { result: Out; discarded: number };
    try {
      sanitized = sanitize(answer.data, discards, { compacted });
    } catch (error) {
      if (error instanceof LlmError) {
        error.trace = answer.trace;
        error.discards = discards;
      }
      throw error;
    }
    const { result, discarded } = sanitized;
    const meta: AiMeta = {
      model: answer.model,
      promptVersion,
      latencyMs: answer.latencyMs,
      ...(answer.inputTokens === undefined ? {} : { inputTokens: answer.inputTokens }),
      ...(answer.outputTokens === undefined ? {} : { outputTokens: answer.outputTokens }),
      attempts: answer.attempts,
      discardedItems: discarded,
    };
    // Diagnostics without content: finishReason, tokens, JSON/schema per attempt, drops per rule.
    log.info(
      { ai: { endpoint, ...meta, compacted, trace: answer.trace, discards } },
      'AI call succeeded',
    );
    return { ...result, meta };
  } catch (error) {
    if (error instanceof LlmError) {
      log.warn(
        {
          ai: {
            endpoint,
            model: llm.model,
            promptVersion,
            errorCategory: error.category,
            compacted,
            ...(error.trace ? { trace: error.trace } : {}),
            ...(error.discards ? { discards: error.discards } : {}),
          },
        },
        'AI call failed',
      );
      throw error.toAppError();
    }
    throw error;
  }
}
