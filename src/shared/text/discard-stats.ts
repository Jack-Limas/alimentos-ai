/**
 * Why post-validation dropped model output, counted per rule (never the text):
 * - number: a sentence or item mentioned a figure that is not in the input;
 * - format: nothing was left after turning it into plain text;
 * - duplicate: the same item twice;
 * - limit: over the maximum number of items;
 * - code: an order or product code that is not allowed (tie-break, rescue plan).
 */
export interface DiscardStats {
  number: number;
  format: number;
  duplicate: number;
  limit: number;
  code: number;
}

export const emptyDiscardStats = (): DiscardStats => ({
  number: 0,
  format: 0,
  duplicate: 0,
  limit: 0,
  code: 0,
});

export const totalDiscards = (stats: DiscardStats): number =>
  stats.number + stats.format + stats.duplicate + stats.limit + stats.code;
