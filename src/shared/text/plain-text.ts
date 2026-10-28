/** Longest sentence-like text the service returns; the UI shows short cards. */
export const MAX_TEXT_LENGTH = 280;

/**
 * Turns model output into clean plain text for the UI: no Markdown emphasis
 * (`**`, `__`, `*x*`), headings, list markers, code ticks, links or emojis,
 * and one line. The frontend styles the text itself, so Markdown would only
 * show up as stray symbols.
 */
export function toPlainText(text: string, maxLength = MAX_TEXT_LENGTH): string {
  let clean = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [label](url) -> label
    .replace(/`+/g, '')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_]([^*_\s][^*_]*?)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/[*_]{2,}/g, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*(?:[-*•·>]|\d+[.)])\s+/gm, '')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (clean.length > maxLength) {
    const cut = clean.slice(0, maxLength - 1);
    const lastSpace = cut.lastIndexOf(' ');
    clean = `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:.]+$/, '')}…`;
  }
  return clean;
}
