/**
 * "No invented figures": every number the model writes must exist in the
 * input. Numbers are compared by value with 3 decimals, so "12,5", "12.5" and
 * "12.50" are the same figure. Digits inside strings count too ("PED-000123"
 * allows 123, "2026-10-28" allows 2026, 10 and 28).
 */

const NUMBER_IN_TEXT = /\d+(?:[.,]\d+)*/g;

function key(value: number): string {
  return (Math.round(value * 1000) / 1000).toString();
}

/** The possible values of a written number: "1.200" is 1200 in Spanish and 1.2 in English. */
function readings(raw: string): number[] {
  const values = new Set<number>();
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) values.add(Number(raw.replace(/[.,]/g, '')));
  const parts = raw.split(/[.,]/);
  if (parts.length <= 2) values.add(Number(raw.replace(',', '.')));
  return [...values].filter((value) => Number.isFinite(value));
}

/** Every figure present in the input data, numbers and digits inside strings. */
export function collectNumbers(data: unknown, into = new Set<string>()): Set<string> {
  if (typeof data === 'number' && Number.isFinite(data)) {
    into.add(key(data));
    into.add(key(Math.abs(data)));
  } else if (typeof data === 'string') {
    for (const match of data.matchAll(NUMBER_IN_TEXT)) {
      for (const value of readings(match[0])) into.add(key(value));
    }
  } else if (Array.isArray(data)) {
    for (const item of data) collectNumbers(item, into);
  } else if (typeof data === 'object' && data !== null) {
    for (const value of Object.values(data)) collectNumbers(value, into);
  }
  return into;
}

/** True when every number in `text` exists in `allowed`. */
export function isGrounded(text: string, allowed: ReadonlySet<string>): boolean {
  for (const match of text.matchAll(NUMBER_IN_TEXT)) {
    if (!readings(match[0]).some((value) => allowed.has(key(value)))) return false;
  }
  return true;
}

/**
 * Drops the sentences of `text` that mention a figure not present in the
 * input, and reports how many were dropped.
 */
export function keepGroundedSentences(
  text: string,
  allowed: ReadonlySet<string>,
): { text: string; removed: number } {
  const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.trim() !== '');
  const kept = sentences.filter((sentence) => isGrounded(sentence, allowed));
  return { text: kept.join(' ').trim(), removed: sentences.length - kept.length };
}
