import type { GenerateJsonRequest, LlmClient } from '../../src/gemini/index.js';

/** A canned answer that satisfies the output schema of every endpoint (extra keys are stripped). */
export const CANNED_ANSWER = {
  summary: 'Resumen de prueba.',
  highlights: ['Revisa los pedidos parciales.'],
  topActions: ['Revisa el stock bajo.'],
  actions: [],
};

export interface FakeLlm extends LlmClient {
  calls: GenerateJsonRequest<unknown>[];
}

/**
 * LlmClient that never calls Google. `answer` returns the raw model JSON for a
 * request, or throws (e.g. an LlmError) to simulate a failure.
 */
export function createFakeLlm(
  answer: (request: GenerateJsonRequest<unknown>) => unknown = () => CANNED_ANSWER,
  model = 'gemini-test-flash',
): FakeLlm {
  const calls: GenerateJsonRequest<unknown>[] = [];
  return {
    model,
    calls,
    generateJson<T>(request: GenerateJsonRequest<T>) {
      calls.push(request);
      try {
        const data = request.schema.parse(answer(request));
        return Promise.resolve({
          data,
          trace: [{ finishReason: 'STOP', outputTokens: 54, json: 'ok', schema: 'ok' }],
          model,
          latencyMs: 7,
          inputTokens: 321,
          outputTokens: 54,
          attempts: 1,
        });
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
  };
}
