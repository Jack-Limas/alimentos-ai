// Smoke test of the deployed AI service: `npm run smoke:prod`.
// Reads AI_SMOKE_URL and AI_INTERNAL_KEY from the environment (never prints them),
// sends the fixtures in scripts/fixtures to the three /v1 endpoints and prints a
// PASS/WARN/FAIL table with latency and tokens. Exit code 1 if anything failed;
// QUOTA_EXCEEDED is a warning (the backend degrades to its rules result).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import dotenv from 'dotenv';
import { ENDPOINTS, exitCodeOf, renderResults, runSmoke, type Endpoint } from './smoke/smoke.js';

const out = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<number> {
  dotenv.config({ quiet: true });
  const baseUrl = process.env.AI_SMOKE_URL?.trim().replace(/\/+$/, '');
  const internalKey = process.env.AI_INTERNAL_KEY?.trim();
  const missing = [
    ['AI_SMOKE_URL', baseUrl],
    ['AI_INTERNAL_KEY', internalKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (!baseUrl || !internalKey) {
    out(`smoke:prod: missing ${missing.join(', ')}`);
    return 1;
  }

  const fixtures = Object.fromEntries(
    ENDPOINTS.map((endpoint) => [
      endpoint,
      JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${endpoint}.json`), 'utf8')),
    ]),
  ) as Record<Endpoint, unknown>;

  out(`smoke:prod against ${baseUrl}`);
  const results = await runSmoke({ baseUrl, internalKey, fixtures });
  out(renderResults(results));
  return exitCodeOf(results);
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    out(`smoke:prod failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
