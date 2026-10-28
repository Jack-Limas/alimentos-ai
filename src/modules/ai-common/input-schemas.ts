import { z } from 'zod';

/** Bounds on the input keep prompts (and tokens) small and predictable. */
export const MAX_LIST_ITEMS = 200;
export const MAX_TEXT = 120;

export const localeSchema = z.enum(['es', 'en']);
export const roleSchema = z.enum(['ADMIN', 'OPERATOR']);
export const customerTypeSchema = z.enum([
  'SUPERMARKET',
  'RESTAURANT',
  'SCHOOL',
  'HOSPITAL',
  'FOOD_BANK',
]);
export const unitSchema = z.enum(['KG', 'L', 'UNIT', 'BOX']);
export const prioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

/** Short free text from the database (names, codes): bounded, never trusted as instructions. */
export const shortText = z.string().trim().min(1).max(MAX_TEXT);
export const quantity = z.number().min(0).max(999_999_999.999);

export const listOf = <T extends z.ZodType>(item: T, min = 0) =>
  z.array(item).min(min).max(MAX_LIST_ITEMS);

/** `{ code, params }` reasons as the backend stores them. */
export const reasonSchema = z.object({
  code: z.string().trim().min(1).max(60),
  params: z.record(z.string().max(40), z.union([z.number(), shortText])).default({}),
});
