import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS } from '../src/config/logger.js';
import { LlmError, type GenerateJsonRequest } from '../src/gemini/index.js';
import { COMPACT_LINES } from '../src/modules/proposal-explanation/proposal-explanation.service.js';
import { createFakeLlm } from './helpers/fake-llm.js';
import { buildTestApp, TEST_INTERNAL_KEY } from './helpers/test-app.js';

/**
 * The shape the backend sends in production: 35 orders, 87 lines, scores with
 * 2 decimals, decimal quantities and the totals block (captured from the
 * backend's own engine over the demo seed).
 */
interface Fixture {
  totals?: Record<string, number>;
  lines: { orderCode: string; score: number }[];
}
const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'scripts/fixtures/proposal-explanation-large.json'), 'utf8'),
) as Fixture;

/** The same input with one order scored 94.17, as in the production report. */
function productionInput(overrides: Partial<Fixture> = {}): Fixture {
  const first = fixture.lines[0]?.orderCode;
  return {
    ...fixture,
    lines: fixture.lines.map((line) =>
      line.orderCode === first ? { ...line, score: 94.17 } : line,
    ),
    ...overrides,
  };
}

async function explain(llm: ReturnType<typeof createFakeLlm>, payload: unknown) {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(JSON.parse(chunk.toString()) as Record<string, unknown>);
      callback();
    },
  });
  const app = await buildTestApp({
    llm,
    logger: { level: 'info', stream, redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/v1/proposal-explanation',
    headers: { 'x-internal-key': TEST_INTERNAL_KEY },
    payload: payload as Record<string, unknown>,
  });
  await app.close();
  return { res, log: lines.find((line) => String(line.msg).startsWith('AI call'))?.ai };
}

describe('proposal explanation with the production-sized input', () => {
  it('keeps counts from totals, rounded scores and dates, and still drops invented quantities', async () => {
    expect(fixture.lines).toHaveLength(87);
    expect(new Set(fixture.lines.map((line) => line.orderCode)).size).toBe(35);
    const first = fixture.lines[0]?.orderCode ?? '';
    const llm = createFakeLlm(() => ({
      summary: `La propuesta atiende 35 pedidos en 87 líneas; el ${first} suma 94 puntos.`,
      highlights: [
        'Revisa primero el lote que vence el 29 de octubre.',
        'Entrega 120 kg de arroz al pedido de la escuela.',
      ],
    }));

    const { res, log } = await explain(llm, productionInput());

    expect(res.statusCode).toBe(200);
    const body = res.json<{
      summary: string;
      highlights: string[];
      meta: { discardedItems: number };
    }>();
    expect(body.summary).toContain('35 pedidos en 87 líneas');
    expect(body.summary).toContain('94 puntos');
    expect(body.highlights).toEqual(['Revisa primero el lote que vence el 29 de octubre.']);
    expect(body.meta.discardedItems).toBe(1);
    expect(log).toMatchObject({ discards: { number: 1 } });
  });

  it('only accepts a count when the backend declared it in totals', async () => {
    const llm = createFakeLlm(() => ({
      summary: 'Hay 87 líneas en la propuesta.',
      highlights: ['Atiende primero los pedidos urgentes.'],
    }));
    // Three lines only: with 87 lines almost any small number shows up by chance.
    const few = productionInput({ lines: fixture.lines.slice(0, 3) });
    const { totals: _omitted, ...withoutTotals } = few;

    const withTotals = (await explain(llm, few)).res.json<{ summary: string }>();
    const without = (await explain(llm, withoutTotals)).res.json<{ summary: string }>();

    expect(withTotals.summary).toBe('Hay 87 líneas en la propuesta.');
    // Without totals 87 is not in the input: the summary falls back to a grounded highlight.
    expect(without.summary).toBe('Atiende primero los pedidos urgentes.');
  });

  it('answers 502 only when nothing grounded is left', async () => {
    const llm = createFakeLlm(() => ({
      summary: 'Se despachan 120 kg.',
      highlights: ['Faltan 999 cajas.', 'Sobran 4321 litros.'],
    }));

    const { res, log } = await explain(llm, productionInput());

    expect(res.statusCode).toBe(502);
    expect(res.json()).toMatchObject({ error: { category: 'UPSTREAM_ERROR' } });
    expect(log).toMatchObject({ errorCategory: 'UPSTREAM_ERROR', discards: { number: 3 } });
  });

  it('after an answer cut by MAX_TOKENS, sends the top 30 lines with totals and asks for less', async () => {
    const requests: GenerateJsonRequest<unknown>[] = [];
    const llm = createFakeLlm((request) => {
      requests.push(request);
      const data = request.userData as { lines: unknown[] };
      if (data.lines.length > COMPACT_LINES) {
        const cut = new LlmError('UPSTREAM_ERROR');
        cut.trace = [
          { finishReason: 'MAX_TOKENS', outputTokens: 2048, json: 'invalid', schema: 'skipped' },
        ];
        throw cut;
      }
      return {
        summary: 'Se atienden primero los pedidos urgentes.',
        highlights: ['Uno.', 'Dos.', 'Tres.', 'Cuatro.'],
      };
    });

    const { res, log } = await explain(llm, productionInput());

    expect(res.statusCode).toBe(200);
    const compact = requests[1];
    const data = compact?.userData as { lines: { score: number }[]; totals: unknown };
    expect(data.lines).toHaveLength(COMPACT_LINES);
    expect(data.totals).toEqual(fixture.totals);
    // The highest scores, never the order of arrival.
    const lowestKept = Math.min(...data.lines.map((line) => line.score));
    expect(fixture.lines.filter((line) => line.score > lowestKept).length).toBeLessThanOrEqual(
      COMPACT_LINES,
    );
    expect(compact?.systemPrompt).toContain('como máximo 3');
    // At most 3 highlights in compact mode.
    expect(res.json<{ highlights: string[] }>().highlights).toHaveLength(3);
    expect(log).toMatchObject({ compacted: true });
  });
});
