import { z } from 'zod';
import type { JsonSchema } from '../../gemini/index.js';
import {
  customerTypeSchema,
  listOf,
  localeSchema,
  MAX_LIST_ITEMS,
  quantity,
  shortText,
  unitSchema,
} from '../ai-common/index.js';

export const RESCUE_ACTIONS = ['DONATE', 'REALLOCATE', 'PRIORITIZE'] as const;
export type RescueActionType = (typeof RESCUE_ACTIONS)[number];

export const rescuePlanInputSchema = z.object({
  locale: localeSchema,
  products: listOf(
    z.object({
      name: shortText,
      category: z.string().trim().min(1).max(40),
      qty: quantity,
      unit: unitSchema,
      daysToExpiry: z.number().int().min(-365).max(3650),
      avgDailyOut: quantity,
    }),
    1,
  ),
  customerTypes: z.array(customerTypeSchema).max(5).default([]),
});

export type RescuePlanInput = z.infer<typeof rescuePlanInputSchema>;

export const rescuePlanOutputSchema = z.object({
  actions: z
    .array(z.object({ product: z.string(), action: z.string(), rationale: z.string() }))
    .max(MAX_LIST_ITEMS),
});

export type RescuePlanRaw = z.infer<typeof rescuePlanOutputSchema>;

export const RESCUE_PLAN_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          product: { type: 'string' },
          action: { type: 'string', enum: [...RESCUE_ACTIONS] },
          rationale: { type: 'string' },
        },
        required: ['product', 'action', 'rationale'],
      },
    },
  },
  required: ['actions'],
};

export interface RescueAction {
  /** Exactly one of the input product names. */
  product: string;
  action: RescueActionType;
  rationale: string;
}

export interface RescuePlan {
  actions: RescueAction[];
}
