import type { ZodType } from 'zod';

/** JSON Schema sent to Gemini as `responseJsonSchema` (a plain object). */
export type JsonSchema = Record<string, unknown>;

export interface GenerateJsonRequest<T> {
  /** Validates the parsed JSON; an invalid answer is retried once. */
  schema: ZodType<T>;
  /** Structure Gemini must follow (responseMimeType "application/json"). */
  jsonSchema: JsonSchema;
  systemPrompt: string;
  /** Sent as a JSON block; it is data, never instructions. */
  userData: unknown;
  /** Aborts the call (e.g. the backend closed the request). */
  signal?: AbortSignal;
}

/** What one attempt looked like, without any content (for the logs). */
export interface AttemptTrace {
  /** Gemini's finishReason (STOP, MAX_TOKENS, SAFETY…), when it sent one. */
  finishReason?: string;
  outputTokens?: number;
  /** Whether the text was JSON at all. */
  json: 'ok' | 'empty' | 'invalid';
  /** Whether that JSON matched the output schema (skipped when it was not JSON). */
  schema: 'ok' | 'invalid' | 'skipped';
}

export interface GenerateJsonResult<T> {
  data: T;
  /** One entry per attempt, in order. */
  trace: AttemptTrace[];
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  /** 1, or 2 when the first answer was retried. */
  attempts: number;
}

/** What the services depend on; tests inject a fake. */
export interface LlmClient {
  readonly model: string | null;
  generateJson<T>(request: GenerateJsonRequest<T>): Promise<GenerateJsonResult<T>>;
}

/** One raw call to the model, below retries and validation. */
export interface TransportRequest {
  model: string;
  systemInstruction: string;
  userText: string;
  jsonSchema: JsonSchema;
  temperature: number;
  signal: AbortSignal;
}

export interface TransportResponse {
  text: string | undefined;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export type LlmTransport = (request: TransportRequest) => Promise<TransportResponse>;
