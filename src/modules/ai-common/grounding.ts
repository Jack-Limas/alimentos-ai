import { keepGroundedSentences } from '../../shared/text/number-guard.js';
import { toPlainText } from '../../shared/text/plain-text.js';

/**
 * Cleans one model sentence: plain text, then only the sentences whose
 * figures exist in the input. Returns null when nothing usable is left.
 */
export function groundedText(
  raw: string,
  allowed: ReadonlySet<string>,
  maxLength?: number,
): { text: string | null; removed: number } {
  const plain = toPlainText(raw, maxLength);
  const { text, removed } = keepGroundedSentences(plain, allowed);
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
): { items: string[]; discarded: number } {
  const items: string[] = [];
  let discarded = 0;
  for (const entry of raw) {
    const { text, removed } = groundedText(entry, allowed);
    // A list item with an invented figure is dropped whole: half a sentence reads badly.
    if (text === null || removed > 0 || items.includes(text) || items.length >= max) {
      discarded += 1;
      continue;
    }
    items.push(text);
  }
  return { items, discarded };
}
