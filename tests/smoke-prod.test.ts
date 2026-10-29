import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import {
  ENDPOINTS,
  exitCodeOf,
  renderResults,
  runSmoke,
  type Endpoint,
} from '../scripts/smoke/smoke.js';
import { LlmError } from '../src/gemini/index.js';
import { createFakeLlm } from './helpers/fake-llm.js';
import { buildTestApp, TEST_INTERNAL_KEY } from './helpers/test-app.js';

const BASE = 'https://ai.example.test';
const fixtures = Object.fromEntries(
  ENDPOINTS.map((endpoint) => [
    endpoint,
    JSON.parse(
      readFileSync(join(process.cwd(), 'scripts/fixtures', `${endpoint}.json`), 'utf8'),
    ) as unknown,
  ]),
) as Record<Endpoint, unknown>;

const urlOf = (input: string | URL | Request) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

/** fetch over app.inject: the smoke script talks to the real app in memory. */
function injectFetch(app: FastifyInstance): typeof fetch {
  return async (input, init) => {
    const url = new URL(urlOf(input));
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET',
      url: url.pathname,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      ...(typeof init?.body === 'string' ? { payload: init.body } : {}),
    });
    const headers = new Headers();
    for (const [name, value] of Object.entries(res.headers)) {
      if (value !== undefined) headers.set(name, String(value));
    }
    return new Response(res.rawPayload, { status: res.statusCode, headers });
  };
}

async function smoke(app: FastifyInstance) {
  const results = await runSmoke({
    baseUrl: BASE,
    internalKey: TEST_INTERNAL_KEY,
    fixtures,
    fetch: injectFetch(app),
  });
  await app.close();
  return results;
}

describe('smoke:prod (alimentos-ai)', () => {
  it('passes health, the 401 without key and the 3 endpoints with their fixtures', async () => {
    const results = await smoke(
      await buildTestApp({ env: { GEMINI_API_KEY: 'configured-in-test', GEMINI_MODEL: 'm' } }),
    );

    expect(results.map((r) => [r.name, r.outcome])).toEqual([
      ['GET /health', 'PASS'],
      ['POST /v1/briefing without the key is 401', 'PASS'],
      ['POST /v1/proposal-explanation', 'PASS'],
      ['POST /v1/rescue-plan', 'PASS'],
      ['POST /v1/briefing', 'PASS'],
    ]);
    // Latency and tokens come from `meta` (the fake reports 7 ms, 321 in, 54 out).
    expect(results[2]?.tokens).toBe('7 ms · 321 in / 54 out');
    expect(exitCodeOf(results)).toBe(0);
  });

  it('turns QUOTA_EXCEEDED into a warning, not a failure', async () => {
    const llm = createFakeLlm(() => {
      throw new LlmError('QUOTA_EXCEEDED', false, 42);
    });
    const results = await smoke(await buildTestApp({ llm }));

    const briefing = results.find((r) => r.name === 'POST /v1/briefing');
    expect(briefing).toMatchObject({ outcome: 'WARN' });
    expect(briefing?.detail).toContain('QUOTA_EXCEEDED, retry in 42 s');
    expect(exitCodeOf(results)).toBe(0);
  });

  it('fails (exit 1) on any other AI error and on a wrong key', async () => {
    const llm = createFakeLlm(() => {
      throw new LlmError('INVALID_API_KEY');
    });
    const results = await smoke(await buildTestApp({ llm }));
    expect(results.find((r) => r.name === 'POST /v1/rescue-plan')).toMatchObject({
      outcome: 'FAIL',
      detail: 'Error: HTTP 500 INVALID_API_KEY',
    });
    expect(exitCodeOf(results)).toBe(1);

    const app = await buildTestApp();
    const wrongKey = await runSmoke({
      baseUrl: BASE,
      internalKey: 'not-the-key',
      fixtures,
      fetch: injectFetch(app),
    });
    await app.close();
    expect(wrongKey.filter((r) => r.outcome === 'FAIL')).toHaveLength(3);
  });

  it('never prints the internal key', async () => {
    const table = renderResults(await smoke(await buildTestApp()));

    expect(table).not.toContain(TEST_INTERNAL_KEY);
    expect(table).toMatch(/PASS \d+ · WARN \d+ · FAIL 0/);
    expect(table).toContain('Model latency · tokens');
  });
});
