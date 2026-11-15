import { describe, expect, it } from 'vitest';
import { describeMove, marketWatchSchema, moveLevel } from '../domain/markets';

describe('market move levels', () => {
  it('counts whole steps towards zero, either way', () => {
    expect(moveLevel(0.9, 1)).toBe(0);
    expect(moveLevel(1, 1)).toBe(1);
    expect(moveLevel(2.37, 1)).toBe(2);
    expect(moveLevel(-1.4, 1)).toBe(-1);
    expect(moveLevel(-0.2, 1)).toBe(0);
    expect(moveLevel(1.6, 0.5)).toBe(3);
    // 0.3 / 0.1 is 2.9999999999999996 in floating point.
    expect(moveLevel(0.3, 0.1)).toBe(3);
  });

  it('describes the move in plain words', () => {
    expect(describeMove(2.04)).toBe('up 2.0%');
    expect(describeMove(-1.25)).toBe('down 1.3%');
  });

  it('accepts each market once', () => {
    const market = { epic: 'IX.D.NASDAQ.CASH.IP', name: 'US Tech 100', stepPct: 1 };
    expect(marketWatchSchema.safeParse({ markets: [market] }).success).toBe(true);
    expect(marketWatchSchema.safeParse({ markets: [market, market] }).success).toBe(false);
    expect(
      marketWatchSchema.safeParse({ markets: [{ ...market, epic: '<script>' }] }).success,
    ).toBe(false);
  });
});
