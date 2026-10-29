/**
 * Manual smoke test against the real Gemini API (never in CI):
 *   npm run smoke:gemini
 * Builds the app with the .env configuration and calls the three /v1
 * endpoints through the full stack (internal key, validation, sanitizing)
 * with realistic AlimentaIQ fixtures. Prints a short summary per endpoint;
 * never the keys or the prompts.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { buildApp } from '../src/app.js';
import { parseEnv } from '../src/config/env.js';

dotenv.config({ quiet: true });
const env = parseEnv(process.env);
const app = await buildApp({ env, logger: false });
const fixture = (name: string) =>
  JSON.parse(
    readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8'),
  ) as unknown;

const out = (line: string) =>
  process.stdout.write(`${line}
`);

const short = (text: unknown, max = 110) => {
  const value = typeof text === 'string' ? text : JSON.stringify(text);
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
};

interface Meta {
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  attempts: number;
  discardedItems: number;
}

out(
  `model: ${env.GEMINI_MODEL ?? '(not set)'} · key configured: ${String(Boolean(env.GEMINI_API_KEY))}`,
);

// [fixture, endpoint]: the large one has the production shape (35 orders, 87 lines, totals).
const cases: [string, string][] = [
  ['proposal-explanation', 'proposal-explanation'],
  ['proposal-explanation-large', 'proposal-explanation'],
  ['rescue-plan', 'rescue-plan'],
  ['briefing', 'briefing'],
];
for (const [name, endpoint] of cases) {
  const res = await app.inject({
    method: 'POST',
    url: `/v1/${endpoint}`,
    headers: { 'x-internal-key': env.AI_INTERNAL_KEY },
    payload: fixture(name) as Record<string, unknown>,
  });
  const body = res.json<
    Record<string, unknown> & { meta?: Meta; error?: Record<string, unknown> }
  >();
  out(`\n== ${name} → HTTP ${String(res.statusCode)}`);
  if (body.error) {
    out(
      `   error: ${String(body.error.category ?? body.error.code)} (${String(body.error.message)})`,
    );
    continue;
  }
  const meta = body.meta;
  if (meta) {
    out(
      `   ${meta.model} · ${String(meta.latencyMs)} ms · tokens ${String(meta.inputTokens ?? '?')}/${String(meta.outputTokens ?? '?')} · attempts ${String(meta.attempts)} · discarded ${String(meta.discardedItems)}`,
    );
  }
  for (const [key, value] of Object.entries(body)) {
    if (key === 'meta') continue;
    if (Array.isArray(value))
      value.forEach((item, i) => {
        out(`   ${key}[${String(i)}]: ${short(item)}`);
      });
    else out(`   ${key}: ${short(value)}`);
  }
}

await app.close();
