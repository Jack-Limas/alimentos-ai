import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { LlmTransport } from './llm-client.js';

/**
 * The only place that talks to Google. JSON output with a schema, low
 * temperature, the abort signal of the caller, and minimal "thinking": the
 * answers are short explanations of data the backend already computed.
 * Gemini 3.x rejects thinkingBudget (400), so the level is used instead.
 */
export function createGoogleTransport(apiKey: string): LlmTransport {
  const ai = new GoogleGenAI({ apiKey });

  return async ({ model, systemInstruction, userText, jsonSchema, temperature, signal }) => {
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseJsonSchema: jsonSchema,
        temperature,
        maxOutputTokens: 2048,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal: signal,
      },
    });
    const usage = response.usageMetadata;
    const finishReason = response.candidates?.[0]?.finishReason;
    return {
      text: response.text,
      ...(finishReason === undefined ? {} : { finishReason }),
      ...(usage?.promptTokenCount === undefined ? {} : { inputTokens: usage.promptTokenCount }),
      ...(usage?.candidatesTokenCount === undefined
        ? {}
        : { outputTokens: usage.candidatesTokenCount }),
    };
  };
}
