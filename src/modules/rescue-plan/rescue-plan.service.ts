import type { FastifyBaseLogger } from 'fastify';
import type { LlmClient } from '../../gemini/index.js';
import { RESCUE_PLAN_PROMPT } from '../../prompts/index.js';
import { collectNumbers } from '../../shared/text/number-guard.js';
import { groundedText, runLlm, type AiMeta } from '../ai-common/index.js';
import {
  RESCUE_ACTIONS,
  RESCUE_PLAN_JSON_SCHEMA,
  rescuePlanOutputSchema,
  type RescueAction,
  type RescueActionType,
  type RescuePlan,
  type RescuePlanInput,
  type RescuePlanRaw,
} from './rescue-plan.schemas.js';

const normalize = (name: string) => name.normalize('NFC').trim().toLocaleLowerCase('es');

/**
 * Keeps only actions on input products (matched by name, case-insensitive,
 * and written back exactly as the input), with an action of the enum, at most
 * one per product, DONATE only when a food bank exists, and a grounded rationale.
 */
export function sanitizeRescueActions(
  raw: RescuePlanRaw['actions'],
  input: Pick<RescuePlanInput, 'products' | 'customerTypes'>,
  allowed: ReadonlySet<string>,
): { actions: RescueAction[]; discarded: number } {
  const names = new Map(input.products.map((product) => [normalize(product.name), product.name]));
  const canDonate = input.customerTypes.includes('FOOD_BANK');
  const seen = new Set<string>();
  const actions: RescueAction[] = [];
  let discarded = 0;

  for (const entry of raw) {
    const product = names.get(normalize(entry.product));
    const action = entry.action.trim().toUpperCase();
    const known = (RESCUE_ACTIONS as readonly string[]).includes(action);
    const rationale = groundedText(entry.rationale, allowed, 240);
    if (
      product === undefined ||
      !known ||
      (action === 'DONATE' && !canDonate) ||
      seen.has(product) ||
      rationale.text === null ||
      rationale.removed > 0
    ) {
      discarded += 1;
      continue;
    }
    seen.add(product);
    actions.push({ product, action: action as RescueActionType, rationale: rationale.text });
  }
  return { actions, discarded };
}

export interface RescuePlanService {
  plan(
    input: RescuePlanInput,
    log: FastifyBaseLogger,
    signal?: AbortSignal,
  ): Promise<RescuePlan & { meta: AiMeta }>;
}

export function createRescuePlanService(llm: LlmClient): RescuePlanService {
  return {
    plan(input, log, signal) {
      const userData = { products: input.products, customerTypes: input.customerTypes };
      const allowed = collectNumbers(userData);

      return runLlm<RescuePlanRaw, RescuePlan>({
        llm,
        log,
        endpoint: 'rescue-plan',
        promptVersion: RESCUE_PLAN_PROMPT.version,
        request: {
          schema: rescuePlanOutputSchema,
          jsonSchema: RESCUE_PLAN_JSON_SCHEMA,
          systemPrompt: RESCUE_PLAN_PROMPT.system(input.locale),
          userData,
          ...(signal ? { signal } : {}),
        },
        sanitize: (raw) => {
          const { actions, discarded } = sanitizeRescueActions(raw.actions, input, allowed);
          return { result: { actions }, discarded };
        },
      });
    },
  };
}
