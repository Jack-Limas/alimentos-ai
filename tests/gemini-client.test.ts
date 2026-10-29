import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  createJsonLlmClient,
  LlmError,
  mapUpstreamError,
  parseRetryAfter,
  type LlmTransport,
  type TransportRequest,
} from '../src/gemini/index.js';

const FAKE_KEY_ECHO = 'AIzaSyFAKE-key-fragment-0000';
const schema = z.object({ summary: z.string() });
const request = {
  schema,
  jsonSchema: { type: 'object' },
  systemPrompt: 'rules',
  userData: { a: 1 },
};

/** Google-like error: an Error with an HTTP status and a message that echoes request details. */
function googleError(status: number, extra = '') {
  return Object.assign(new Error(`got status: ${status}. key=${FAKE_KEY_ECHO} ${extra}`), {
    status,
  });
}

/** Transport that plays the given steps in order; each is a JSON text or an error to throw. */
function scripted(steps: (string | Error)[]) {
  const calls: TransportRequest[] = [];
  const transport: LlmTransport = (req) => {
    calls.push(req);
    const step = steps[calls.length - 1];
    if (step === undefined) throw new Error('no more steps');
    if (step instanceof Error) return Promise.reject(step);
    return Promise.resolve({ text: step, inputTokens: 120, outputTokens: 40 });
  };
  return { calls, transport };
}

function client(
  transport: LlmTransport,
  options: { timeoutMs?: number; key?: boolean; model?: string | null } = {},
) {
  return createJsonLlmClient({
    transport,
    model: options.model === undefined ? 'gemini-test-flash' : options.model,
    apiKeyConfigured: options.key ?? true,
    timeoutMs: options.timeoutMs ?? 1000,
  });
}

async function categoryOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(LlmError);
    expect((error as Error).message).not.toContain(FAKE_KEY_ECHO);
    return (error as LlmError).category;
  }
  throw new Error('expected a failure');
}

describe('JSON LLM client', () => {
  it('returns validated data with model, tokens and one attempt', async () => {
    const { calls, transport } = scripted(['{"summary":"ok"}']);

    const result = await client(transport).generateJson(request);

    expect(result).toMatchObject({
      data: { summary: 'ok' },
      model: 'gemini-test-flash',
      inputTokens: 120,
      outputTokens: 40,
      attempts: 1,
    });
    expect(calls[0]).toMatchObject({ temperature: 0.2, systemInstruction: 'rules' });
    expect(calls[0]?.userText).toBe('DATA (JSON):\n{"a":1}');
  });

  it('retries once after invalid JSON and succeeds', async () => {
    const { calls, transport } = scripted(['not json {', '{"summary":"second"}']);
    const result = await client(transport).generateJson(request);
    expect(result.attempts).toBe(2);
    expect(calls).toHaveLength(2);
  });

  it('retries once after JSON that does not match the schema', async () => {
    const { transport } = scripted(['{"other":1}', '{"summary":"fixed"}']);
    expect((await client(transport).generateJson(request)).data.summary).toBe('fixed');
  });

  it('gives UPSTREAM_ERROR after two invalid answers', async () => {
    const { calls, transport } = scripted(['nope', '{"summary": 3}']);
    expect(await categoryOf(client(transport).generateJson(request))).toBe('UPSTREAM_ERROR');
    expect(calls).toHaveLength(2);
  });

  it('retries a 5xx once', async () => {
    const { transport } = scripted([googleError(503), '{"summary":"ok"}']);
    expect((await client(transport).generateJson(request)).attempts).toBe(2);
  });

  it('gives UPSTREAM_ERROR after two network failures', async () => {
    const { calls, transport } = scripted([
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
    ]);
    expect(await categoryOf(client(transport).generateJson(request))).toBe('UPSTREAM_ERROR');
    expect(calls).toHaveLength(2);
  });

  it.each([
    [googleError(404, 'models/gemini-x is not found'), 'MODEL_NOT_FOUND'],
    [googleError(429, 'RESOURCE_EXHAUSTED'), 'QUOTA_EXCEEDED'],
    [
      googleError(400, 'API key not valid. Please pass a valid API key. API_KEY_INVALID'),
      'INVALID_API_KEY',
    ],
    [googleError(403, 'PERMISSION_DENIED'), 'INVALID_API_KEY'],
  ])('does not retry %s and maps it to %s', async (error, category) => {
    const { calls, transport } = scripted([error, '{"summary":"never"}']);
    expect(await categoryOf(client(transport).generateJson(request))).toBe(category);
    expect(calls).toHaveLength(1);
  });

  it('passes the quota retry delay through', async () => {
    const { transport } = scripted([googleError(429, '"retryDelay": "23s" RESOURCE_EXHAUSTED')]);
    const error = await client(transport)
      .generateJson(request)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ category: 'QUOTA_EXCEEDED', retryAfterSec: 23 });
  });

  it('times out with TIMEOUT when the model does not answer in time, without retrying', async () => {
    const calls: TransportRequest[] = [];
    const hanging: LlmTransport = (req) => {
      calls.push(req);
      return new Promise((_resolve, reject) => {
        req.signal.addEventListener('abort', () => {
          reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
        });
      });
    };
    const started = Date.now();
    expect(await categoryOf(client(hanging, { timeoutMs: 50 }).generateJson(request))).toBe(
      'TIMEOUT',
    );
    expect(Date.now() - started).toBeLessThan(1000);
    expect(calls).toHaveLength(1);
  });

  it('answers INVALID_API_KEY "not configured" without a key, and never calls Google', async () => {
    const { calls, transport } = scripted(['{"summary":"x"}']);
    const error = await client(transport, { key: false })
      .generateJson(request)
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      category: 'INVALID_API_KEY',
      message: expect.stringContaining('not configured') as unknown,
    });
    expect(calls).toHaveLength(0);
  });

  it('answers MODEL_NOT_FOUND "not configured" without a model', async () => {
    const { transport } = scripted([]);
    expect(await categoryOf(client(transport, { model: null }).generateJson(request))).toBe(
      'MODEL_NOT_FOUND',
    );
  });
});

describe('mapUpstreamError', () => {
  it('keeps only the category and a safe message', () => {
    const mapped = mapUpstreamError(googleError(500, 'internal'));
    expect(mapped).toMatchObject({ category: 'UPSTREAM_ERROR', retryable: true });
    expect(mapped.message).not.toContain(FAKE_KEY_ECHO);
  });

  it('treats a 4xx without a known cause as a final upstream error', () => {
    expect(mapUpstreamError(googleError(400, 'bad request'))).toMatchObject({
      category: 'UPSTREAM_ERROR',
      retryable: false,
    });
  });

  it.each([
    ['"retryDelay": "23s"', 23],
    ['Please retry in 4.2s.', 5],
    ['quota exceeded', undefined],
  ])('reads the retry delay from %j', (message, seconds) => {
    expect(parseRetryAfter(message)).toBe(seconds);
  });
});

describe('attempt trace (diagnostics without content)', () => {
  it('records finishReason, tokens, JSON and schema per attempt, also when it fails', async () => {
    let calls = 0;
    const transport: LlmTransport = () => {
      calls += 1;
      return Promise.resolve(
        calls === 1
          ? { text: '{"summary":"cortad', finishReason: 'MAX_TOKENS', outputTokens: 2048 }
          : { text: '{"other":1}', finishReason: 'STOP', outputTokens: 9 },
      );
    };

    const error = await client(transport)
      .generateJson(request)
      .then(
        () => null,
        (e: unknown) => e,
      );

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).trace).toEqual([
      { finishReason: 'MAX_TOKENS', outputTokens: 2048, json: 'invalid', schema: 'skipped' },
      { finishReason: 'STOP', outputTokens: 9, json: 'ok', schema: 'invalid' },
    ]);
  });

  it('returns the trace with a good answer', async () => {
    const transport: LlmTransport = () =>
      Promise.resolve({ text: '{"summary":"ok"}', finishReason: 'STOP', outputTokens: 5 });
    const result = await client(transport).generateJson(request);
    expect(result.trace).toEqual([
      { finishReason: 'STOP', outputTokens: 5, json: 'ok', schema: 'ok' },
    ]);
  });
});
