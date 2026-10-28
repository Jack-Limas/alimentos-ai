import { z } from 'zod';
import type { JsonSchema } from '../../gemini/index.js';
import {
  customerTypeSchema,
  listOf,
  localeSchema,
  prioritySchema,
  roleSchema,
  shortText,
} from '../ai-common/index.js';

export const briefingInputSchema = z.object({
  locale: localeSchema,
  role: roleSchema,
  alerts: listOf(
    z.object({
      type: z.string().trim().min(1).max(40),
      severity: z.enum(['INFO', 'WARNING', 'CRITICAL']),
      code: z.string().trim().min(1).max(60),
      params: z
        .record(z.string().max(40), z.union([z.number(), shortText]))
        .refine((params) => Object.keys(params).length <= 10, 'at most 10 params')
        .default({}),
    }),
  ),
  pendingOrders: listOf(
    z.object({
      orderCode: shortText,
      priority: prioritySchema,
      dueDate: z.iso.date(),
      customerType: customerTypeSchema.optional(),
    }),
  ),
  kpis: z
    .record(z.string().max(40), z.number())
    .refine((kpis) => Object.keys(kpis).length <= 20, 'at most 20 kpis')
    .default({}),
});

export type BriefingInput = z.infer<typeof briefingInputSchema>;

export const briefingOutputSchema = z.object({
  summary: z.string(),
  topActions: z.array(z.string()).max(20),
});

export type BriefingRaw = z.infer<typeof briefingOutputSchema>;

export const BRIEFING_JSON_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    topActions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
  },
  required: ['summary', 'topActions'],
};

export interface Briefing {
  summary: string;
  /** Most urgent first, at most 5. */
  topActions: string[];
}
