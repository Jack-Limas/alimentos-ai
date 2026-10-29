import type { FastifyBaseLogger } from 'fastify';
import { LlmError, type LlmClient } from '../../gemini/index.js';
import { PROPOSAL_EXPLANATION_PROMPT } from '../../prompts/index.js';
import { collectNumbers } from '../../shared/text/number-guard.js';
import { groundedList, groundedText, runLlm, type AiMeta } from '../ai-common/index.js';
import {
  PROPOSAL_EXPLANATION_JSON_SCHEMA,
  proposalExplanationOutputSchema,
  type ProposalExplanation,
  type ProposalExplanationInput,
  type ProposalExplanationRaw,
} from './proposal-explanation.schemas.js';

/** Orders closer than this in score are a tie the AI may reorder (contract 4.7). */
export const TIE_THRESHOLD = 2;
const MAX_HIGHLIGHTS = 5;
/** After an answer cut by the token limit: the highest-scoring lines only, and fewer sentences. */
export const COMPACT_LINES = 30;
const COMPACT_HIGHLIGHTS = 3;

/** The COMPACT_LINES lines with the highest score (the plan's rank), in their input order. */
export function topLines<T extends { score: number }>(
  lines: readonly T[],
  max = COMPACT_LINES,
): T[] {
  const keep = new Set(
    lines
      .map((line, index) => ({ line, index }))
      .sort((a, b) => b.line.score - a.line.score || a.index - b.index)
      .slice(0, max)
      .map(({ index }) => index),
  );
  return lines.filter((_, index) => keep.has(index));
}

/**
 * Groups of orders whose scores are within TIE_THRESHOLD of the previous one,
 * highest score first. Only these orders can be reordered by the model.
 */
export function findTies(lines: readonly { orderCode: string; score: number }[]): string[][] {
  const scores = new Map<string, number>();
  for (const line of lines) if (!scores.has(line.orderCode)) scores.set(line.orderCode, line.score);
  const orders = [...scores].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));

  const groups: string[][] = [];
  let current: [string, number][] = [];
  for (const order of orders) {
    const previous = current.at(-1);
    if (previous && previous[1] - order[1] < TIE_THRESHOLD) {
      current.push(order);
    } else {
      if (current.length > 1) groups.push(current.map(([code]) => code));
      current = [order];
    }
  }
  if (current.length > 1) groups.push(current.map(([code]) => code));
  return groups;
}

/** Keeps codes of tied orders only, each once, in the model's order. */
export function sanitizeTieBreakOrder(
  raw: readonly string[] | undefined,
  tied: ReadonlySet<string>,
): { codes: string[]; discarded: number } {
  const codes: string[] = [];
  let discarded = 0;
  for (const code of raw ?? []) {
    const clean = code.trim();
    if (!tied.has(clean) || codes.includes(clean)) discarded += 1;
    else codes.push(clean);
  }
  return { codes, discarded };
}

export interface ProposalExplanationService {
  explain(
    input: ProposalExplanationInput,
    log: FastifyBaseLogger,
    signal?: AbortSignal,
  ): Promise<ProposalExplanation & { meta: AiMeta }>;
}

export function createProposalExplanationService(llm: LlmClient): ProposalExplanationService {
  return {
    explain(input, log, signal) {
      const ties = findTies(input.lines);
      const totals = input.totals ? { totals: input.totals } : {};
      const userData = {
        role: input.role,
        strategy: input.strategy,
        ...totals,
        lines: input.lines,
        ties,
      };
      // Figures are always checked against the whole input, also after compacting.
      const allowed = collectNumbers(userData);
      const tied = new Set(ties.flat());
      const compactLines = topLines(input.lines);
      const shown = new Set(compactLines.map((line) => line.orderCode));
      const compactData = {
        ...userData,
        lines: compactLines,
        ties: ties
          .map((group) => group.filter((code) => shown.has(code)))
          .filter((group) => group.length > 1),
      };
      const base = {
        schema: proposalExplanationOutputSchema,
        jsonSchema: PROPOSAL_EXPLANATION_JSON_SCHEMA,
        ...(signal ? { signal } : {}),
      };

      return runLlm<ProposalExplanationRaw, ProposalExplanation>({
        llm,
        log,
        endpoint: 'proposal-explanation',
        promptVersion: PROPOSAL_EXPLANATION_PROMPT.version,
        request: {
          ...base,
          systemPrompt: PROPOSAL_EXPLANATION_PROMPT.system(input.locale),
          userData,
        },
        // Only when the full answer was cut (MAX_TOKENS); input.lines.length > COMPACT_LINES.
        ...(input.lines.length > COMPACT_LINES
          ? {
              compactRequest: {
                ...base,
                systemPrompt: PROPOSAL_EXPLANATION_PROMPT.system(input.locale, { compact: true }),
                userData: compactData,
              },
            }
          : {}),
        sanitize: (raw, stats, { compacted }) => {
          const maxHighlights = compacted ? COMPACT_HIGHLIGHTS : MAX_HIGHLIGHTS;
          const summary = groundedText(raw.summary, allowed, 400, stats);
          const highlights = groundedList(raw.highlights, allowed, maxHighlights, stats);
          const order = sanitizeTieBreakOrder(raw.tieBreakOrder, tied);
          stats.code += order.discarded;
          const text = summary.text ?? highlights.items[0];
          // Nothing grounded survived: the backend falls back to the rules result.
          if (text === undefined) throw new LlmError('UPSTREAM_ERROR');
          return {
            result: {
              summary: text,
              highlights: highlights.items,
              ...(order.codes.length > 1 ? { tieBreakOrder: order.codes } : {}),
            },
            discarded: summary.removed + highlights.discarded + order.discarded,
          };
        },
      });
    },
  };
}
