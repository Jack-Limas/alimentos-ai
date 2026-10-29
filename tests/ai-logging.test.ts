import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS } from '../src/config/logger.js';
import { LlmError } from '../src/gemini/index.js';
import { createFakeLlm } from './helpers/fake-llm.js';
import { buildTestApp, TEST_INTERNAL_KEY } from './helpers/test-app.js';

const FAKE_GEMINI_KEY = 'AIzaSyFAKE0000000000000000000000000000';
const body = {
  locale: 'es',
  role: 'OPERATOR',
  alerts: [],
  pendingOrders: [],
  kpis: { lowStock: 11 },
};

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  return {
    lines,
    logger: { level: 'info', stream, redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } },
  };
}

async function call(llm: ReturnType<typeof createFakeLlm>) {
  const { lines, logger } = capture();
  const app = await buildTestApp({ llm, logger, env: { GEMINI_API_KEY: FAKE_GEMINI_KEY } });
  await app.inject({
    method: 'POST',
    url: '/v1/briefing',
    headers: { 'x-internal-key': TEST_INTERNAL_KEY },
    payload: body,
  });
  await app.close();
  return lines;
}

describe('AI call logging', () => {
  it('logs endpoint, model, latency and tokens, never the prompt or the keys', async () => {
    const lines = await call(createFakeLlm());
    const entry = lines.find((line) => line.msg === 'AI call succeeded');

    expect(entry?.ai).toMatchObject({
      endpoint: 'briefing',
      model: 'gemini-test-flash',
      latencyMs: 7,
      inputTokens: 321,
      outputTokens: 54,
      discardedItems: 0,
    });
    const all = JSON.stringify(lines);
    expect(all).not.toContain('Reglas obligatorias');
    expect(all).not.toContain(FAKE_GEMINI_KEY);
    expect(all).not.toContain(TEST_INTERNAL_KEY);
  });

  it('logs the error category of a failed call', async () => {
    const lines = await call(
      createFakeLlm(() => {
        throw new LlmError('TIMEOUT');
      }),
    );
    expect(lines.find((line) => line.msg === 'AI call failed')?.ai).toMatchObject({
      endpoint: 'briefing',
      errorCategory: 'TIMEOUT',
    });
  });

  it('logs the attempt trace and the drops per rule, without the text', async () => {
    const lines = await call(
      createFakeLlm(() => ({
        summary: 'Hay 999 pedidos atrasados.',
        topActions: ['Revisa 777 lotes.', 'Revisa el stock bajo.', 'Revisa el stock bajo.'],
      })),
    );
    const entry = lines.find((line) => line.msg === 'AI call succeeded');

    expect(entry?.ai).toMatchObject({
      trace: [{ finishReason: 'STOP', json: 'ok', schema: 'ok' }],
      discards: { number: 2, duplicate: 1, format: 0, limit: 0, code: 0 },
    });
    expect(JSON.stringify(lines)).not.toContain('999 pedidos');
  });

  it('logs why nothing was usable when every sentence was dropped', async () => {
    const lines = await call(
      createFakeLlm(() => ({ summary: 'Hay 999 pedidos.', topActions: [] })),
    );
    expect(lines.find((line) => line.msg === 'AI call failed')?.ai).toMatchObject({
      errorCategory: 'UPSTREAM_ERROR',
      discards: { number: 1 },
      trace: [{ json: 'ok', schema: 'ok' }],
    });
  });
});
