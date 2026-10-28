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

export interface GenerateJsonResult<T> {
  data: T;
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
  inputTokens?: number;
  outputTokens?: number;
}

export type LlmTransport = (request: TransportRequest) => Promise<TransportResponse>;
