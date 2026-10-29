import { z } from 'zod';
import type { JsonSchema } from '../../gemini/index.js';
import {
  customerTypeSchema,
  listOf,
  localeSchema,
  MAX_LIST_ITEMS,
  quantity,
  reasonSchema,
  roleSchema,
  shortText,
} from '../ai-common/index.js';

const count = z.number().int().min(0).max(100_000);

/**
 * Counts of the whole proposal, computed by the backend. The model may only
 * write counts it can copy from here ("35 pedidos"), never count by itself.
 */
export const proposalTotalsSchema = z.object({
  orders: count,
  lines: count,
  full: count,
  partial: count,
  unserved: count,
});

export type ProposalTotals = z.infer<typeof proposalTotalsSchema>;

export const proposalExplanationInputSchema = z.object({
  locale: localeSchema,
  role: roleSchema,
  strategy: z.string().trim().max(40).optional(),
  /** Optional: older backends do not send it. */
  totals: proposalTotalsSchema.optional(),
  lines: listOf(
    z.object({
      orderCode: shortText,
      customerType: customerTypeSchema,
      product: shortText,
      requestedQty: quantity,
      recommendedQty: quantity,
      score: z.number().min(0).max(100),
      reasons: z
        .array(z.union([z.string().trim().min(1).max(60), reasonSchema]))
        .max(10)
        .default([]),
    }),
    1,
  ),
});

export type ProposalExplanationInput = z.infer<typeof proposalExplanationInputSchema>;

/** What the model must return (loose on purpose: sanitizing does the strict part). */
export const proposalExplanationOutputSchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).max(20),
  tieBreakOrder: z.array(z.string()).max(MAX_LIST_ITEMS).optional(),
});

export type ProposalExplanationRaw = z.infer<typeof proposalExplanationOutputSchema>;

export const PROPOSAL_EXPLANATION_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    highlights: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    tieBreakOrder: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'highlights'],
};

export interface ProposalExplanation {
  summary: string;
  highlights: string[];
  /** Only codes of tied orders, each once; absent when there were no ties. */
  tieBreakOrder?: string[];
}
