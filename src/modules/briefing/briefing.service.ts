import type { FastifyBaseLogger } from 'fastify';
import { LlmError, type LlmClient } from '../../gemini/index.js';
import { BRIEFING_PROMPT } from '../../prompts/index.js';
import { collectNumbers } from '../../shared/text/number-guard.js';
import { groundedList, groundedText, runLlm, type AiMeta } from '../ai-common/index.js';
import {
  BRIEFING_JSON_SCHEMA,
  briefingOutputSchema,
  type Briefing,
  type BriefingInput,
  type BriefingRaw,
} from './briefing.schemas.js';

const MAX_TOP_ACTIONS = 5;
const SEVERITY_RANK = { CRITICAL: 0, WARNING: 1, INFO: 2 } as const;

export interface BriefingService {
  brief(
    input: BriefingInput,
    log: FastifyBaseLogger,
    signal?: AbortSignal,
  ): Promise<Briefing & { meta: AiMeta }>;
}

export function createBriefingService(llm: LlmClient): BriefingService {
  return {
    brief(input, log, signal) {
      // The most severe alerts first, so the model reads what matters before the rest.
      const alerts = [...input.alerts].sort(
        (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
      );
      const userData = {
        role: input.role,
        kpis: input.kpis,
        alerts,
        pendingOrders: input.pendingOrders,
      };
      const allowed = collectNumbers(userData);

      return runLlm<BriefingRaw, Briefing>({
        llm,
        log,
        endpoint: 'briefing',
        promptVersion: BRIEFING_PROMPT.version,
        request: {
          schema: briefingOutputSchema,
          jsonSchema: BRIEFING_JSON_SCHEMA,
          systemPrompt: BRIEFING_PROMPT.system(input.locale),
          userData,
          ...(signal ? { signal } : {}),
        },
        sanitize: (raw, stats) => {
          const summary = groundedText(raw.summary, allowed, 400, stats);
          const actions = groundedList(raw.topActions, allowed, MAX_TOP_ACTIONS, stats);
          if (summary.text === null && actions.items.length === 0) {
            throw new LlmError('UPSTREAM_ERROR');
          }
          return {
            result: { summary: summary.text ?? '', topActions: actions.items },
            discarded: summary.removed + actions.discarded,
          };
        },
      });
    },
  };
}
