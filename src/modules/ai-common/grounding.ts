import type { DiscardStats } from '../../shared/text/discard-stats.js';
import { keepGroundedSentences } from '../../shared/text/number-guard.js';
import { toPlainText } from '../../shared/text/plain-text.js';

/**
 * Cleans one model sentence: plain text, then only the sentences whose
 * figures exist in the input. Returns null when nothing usable is left.
 * `stats` (optional) counts why things were dropped.
 */
export function groundedText(
  raw: string,
  allowed: ReadonlySet<string>,
  maxLength?: number,
  stats?: DiscardStats,
): { text: string | null; removed: number } {
  const plain = toPlainText(raw, maxLength);
  if (plain === '') {
    if (stats && raw.trim() !== '') stats.format += 1;
    return { text: null, removed: 0 };
  }
  const { text, removed } = keepGroundedSentences(plain, allowed);
  if (stats) stats.number += removed;
  return { text: text === '' ? null : text, removed };
}

/**
 * Cleans a list of sentences: drops empty ones, invented figures and
 * duplicates, and caps the length. Reports how many were dropped.
 */
export function groundedList(
  raw: readonly string[],
  allowed: ReadonlySet<string>,
  max: number,
  stats?: DiscardStats,
): { items: string[]; discarded: number } {
  const items: string[] = [];
  let discarded = 0;
  for (const entry of raw) {
    const plain = toPlainText(entry);
    const { text, removed } =
      plain === '' ? { text: null, removed: 0 } : keepGroundedSentences(plain, allowed);
    // A list item with an invented figure is dropped whole: half a sentence reads badly.
    const reason =
      removed > 0
        ? 'number'
        : text === null || text === ''
          ? 'format'
          : items.includes(text)
            ? 'duplicate'
            : items.length >= max
              ? 'limit'
              : null;
    if (reason !== null) {
      discarded += 1;
      if (stats) stats[reason] += 1;
      continue;
    }
    items.push(text ?? '');
  }
  return { items, discarded };
}
