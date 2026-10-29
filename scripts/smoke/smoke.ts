/**
 * Production smoke test of the deployed AI service (`npm run smoke:prod`).
 * Pure apart from `fetch` and the fixtures, so tests run it against the app
 * in memory. Never prints the internal key, the prompts or the answers: only
 * statuses, latency and token counts.
 */

export type Outcome = 'PASS' | 'WARN' | 'FAIL';

export interface CheckResult {
  name: string;
  outcome: Outcome;
  ms: number;
  /** Model latency and tokens reported in `meta` (the 3 endpoints). */
  tokens: string;
  detail: string;
}

export const ENDPOINTS = ['proposal-explanation', 'rescue-plan', 'briefing'] as const;
export type Endpoint = (typeof ENDPOINTS)[number];

export interface SmokeConfig {
  /** Origin of the AI service, e.g. https://alimentos-ai.onrender.com */
  baseUrl: string;
  internalKey: string;
  fixtures: Readonly<Record<Endpoint, unknown>>;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

interface Meta {
  model?: string;
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  attempts?: number;
}

interface ErrorBody {
  error?: { code?: string; category?: string; retryAfterSec?: number };
}

export async function runSmoke(config: SmokeConfig): Promise<CheckResult[]> {
  const doFetch = config.fetch ?? fetch;
  const now = config.now ?? (() => performance.now());
  // Below the backend's 15 s per attempt; Gemini may need a retry inside.
  const timeoutMs = config.timeoutMs ?? 45_000;
  const results: CheckResult[] = [];

  async function check(
    name: string,
    run: () => Promise<{ outcome?: Outcome; detail: string; tokens?: string }>,
  ) {
    const started = now();
    try {
      const { outcome = 'PASS', detail, tokens = '' } = await run();
      results.push({ name, outcome, ms: Math.round(now() - started), tokens, detail });
    } catch (error) {
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      results.push({ name, outcome: 'FAIL', ms: Math.round(now() - started), tokens: '', detail });
    }
  }

  const post = (path: string, body: unknown, key?: string) =>
    doFetch(`${config.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(key === undefined ? {} : { 'x-internal-key': key }),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

  await check('GET /health', async () => {
    const res = await doFetch(`${config.baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status !== 200) throw new Error(`HTTP ${String(res.status)}`);
    const body = (await res.json()) as { model?: string | null; geminiConfigured?: boolean };
    return body.geminiConfigured === false
      ? { outcome: 'WARN', detail: 'HTTP 200, but GEMINI_API_KEY is not configured' }
      : { detail: `HTTP 200, model ${body.model ?? '(default)'}` };
  });

  await check('POST /v1/briefing without the key is 401', async () => {
    const res = await post('/v1/briefing', config.fixtures.briefing);
    if (res.status !== 401) throw new Error(`HTTP ${String(res.status)} (expected 401)`);
    return { detail: 'HTTP 401 UNAUTHORIZED' };
  });

  for (const endpoint of ENDPOINTS) {
    await check(`POST /v1/${endpoint}`, async () => {
      const res = await post(`/v1/${endpoint}`, config.fixtures[endpoint], config.internalKey);
      const body = (await res.json()) as { meta?: Meta } & ErrorBody;
      if (res.status === 200) {
        const meta = body.meta ?? {};
        return {
          detail: `HTTP 200, ${meta.model ?? 'model ?'}, ${String(meta.attempts ?? 1)} attempt(s)`,
          tokens: `${String(meta.latencyMs ?? '?')} ms · ${String(meta.inputTokens ?? '?')} in / ${String(meta.outputTokens ?? '?')} out`,
        };
      }
      const category = body.error?.category ?? body.error?.code ?? 'unknown';
      if (category === 'QUOTA_EXCEEDED') {
        const wait = body.error?.retryAfterSec;
        return {
          outcome: 'WARN',
          detail: `HTTP ${String(res.status)} QUOTA_EXCEEDED${wait ? `, retry in ${String(wait)} s` : ''} (the backend degrades)`,
        };
      }
      throw new Error(`HTTP ${String(res.status)} ${category}`);
    });
  }

  return results;
}

/** Plain-text table: | # | check | result | ms | model latency · tokens | detail |. */
export function renderResults(results: readonly CheckResult[]): string {
  const rows = results.map((r, i) => [
    String(i + 1),
    r.name,
    r.outcome,
    String(r.ms),
    r.tokens,
    r.detail,
  ]);
  const header = ['#', 'Check', 'Result', 'ms', 'Model latency · tokens', 'Detail'];
  const widths = header.map((title, col) =>
    Math.max(title.length, ...rows.map((row) => (row[col] ?? '').length)),
  );
  const line = (cells: string[]) =>
    `| ${cells.map((cell, col) => cell.padEnd(widths[col] ?? 0)).join(' | ')} |`;
  const count = (outcome: Outcome) => results.filter((r) => r.outcome === outcome).length;
  return [
    line(header),
    `|${widths.map((w) => '-'.repeat(w + 2)).join('|')}|`,
    ...rows.map(line),
    '',
    `PASS ${String(count('PASS'))} · WARN ${String(count('WARN'))} · FAIL ${String(count('FAIL'))}`,
  ].join('\n');
}

/** Non-zero when any check failed; QUOTA_EXCEEDED is only a warning. */
export function exitCodeOf(results: readonly CheckResult[]): number {
  return results.some((r) => r.outcome === 'FAIL') ? 1 : 0;
}
