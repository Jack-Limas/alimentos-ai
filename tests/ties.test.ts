import { describe, expect, it } from 'vitest';
import { findTies, sanitizeTieBreakOrder } from '../src/modules/proposal-explanation/index.js';

const l = (orderCode: string, score: number) => ({ orderCode, score });

describe('findTies', () => {
  it('groups orders whose scores are within 2 points of the previous one', () => {
    expect(
      findTies([l('A', 90), l('B', 88.5), l('C', 87), l('D', 80), l('E', 79.99), l('F', 50)]),
    ).toEqual([
      ['A', 'B', 'C'],
      ['D', 'E'],
    ]);
  });

  it('uses each order once even with several lines, and finds no ties when far apart', () => {
    expect(findTies([l('A', 90), l('A', 90), l('B', 70)])).toEqual([]);
  });

  it('treats a difference of exactly 2 as no tie', () => {
    expect(findTies([l('A', 90), l('B', 88)])).toEqual([]);
  });
});

describe('sanitizeTieBreakOrder', () => {
  it('keeps tied codes once, in the model order, and counts the rest', () => {
    expect(sanitizeTieBreakOrder([' B ', 'B', 'X', 'A'], new Set(['A', 'B']))).toEqual({
      codes: ['B', 'A'],
      discarded: 2,
    });
    expect(sanitizeTieBreakOrder(undefined, new Set(['A']))).toEqual({ codes: [], discarded: 0 });
  });
});
