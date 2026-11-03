import { describe, expect, it } from 'vitest';
import { addExtra, addReel, addUsage, dayKey, EXTRA_MS, formatLeft, isLimitedPath, reelsText, reelTally, remainingMs, today } from '../src/shared/focus';

describe('isLimitedPath', () => {
  it('limits the Reels feed and Explore', () => {
    expect(isLimitedPath('/reels/')).toBe(true);
    expect(isLimitedPath('/reels/C9xYz12AbcD/')).toBe(true);
    expect(isLimitedPath('/explore/')).toBe(true);
    expect(isLimitedPath('/explore/tags/cats/')).toBe(true);
  });

  it('leaves shared reels, the feed, profiles and DMs alone', () => {
    expect(isLimitedPath('/reel/C9xYz12AbcD/')).toBe(false);
    expect(isLimitedPath('/')).toBe(false);
    expect(isLimitedPath('/direct/inbox/')).toBe(false);
    expect(isLimitedPath('/reelsfan/')).toBe(false);
    expect(isLimitedPath('/explorer_jane/')).toBe(false);
  });
});

describe('usage', () => {
  it('uses the local date', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('starts over on a new day or from bad data', () => {
    expect(today({ day: '2026-11-02', usedMs: 5000, extraMs: 0 }, '2026-11-03')).toEqual({ day: '2026-11-03', usedMs: 0, extraMs: 0 });
    expect(today('junk', '2026-11-03').usedMs).toBe(0);
    expect(today({ day: '2026-11-03', usedMs: -4, extraMs: NaN }, '2026-11-03')).toEqual({ day: '2026-11-03', usedMs: 0, extraMs: 0 });
  });

  it('adds time and extra minutes to today', () => {
    const u = addUsage({ day: '2026-11-03', usedMs: 1000, extraMs: 0 }, '2026-11-03', 500);
    expect(u.usedMs).toBe(1500);
    expect(addExtra(u, '2026-11-03').extraMs).toBe(EXTRA_MS);
    expect(addUsage(u, '2026-11-03', -100).usedMs).toBe(1500);
  });

  it('counts down from the limit plus extra time', () => {
    const day = '2026-11-03';
    expect(remainingMs({ day, usedMs: 10 * 60_000, extraMs: 0 }, 30)).toBe(20 * 60_000);
    expect(remainingMs({ day, usedMs: 31 * 60_000, extraMs: 0 }, 30)).toBe(0);
    expect(remainingMs({ day, usedMs: 31 * 60_000, extraMs: EXTRA_MS }, 30)).toBe(4 * 60_000);
  });
});

describe('reel counter', () => {
  const day = '2026-11-03';

  it('counts each reel once a day', () => {
    let t = addReel(undefined, day, 'A1');
    t = addReel(t, day, 'B2');
    t = addReel(t, day, 'A1');
    expect(t).toEqual({ day, count: 2, seen: ['A1', 'B2'] });
    expect(addReel(t, '2026-11-04', 'A1').count).toBe(1);
  });

  it('starts over from bad data', () => {
    expect(reelTally({ day, count: 'x', seen: [1, 'A1'] }, day)).toEqual({ day, count: 1, seen: ['A1'] });
    expect(reelTally(null, day).count).toBe(0);
  });

  it('caps the remembered codes but keeps the count', () => {
    let t = reelTally(undefined, day);
    for (let i = 0; i < 1005; i++) t = addReel(t, day, `c${i}`);
    expect(t.count).toBe(1005);
    expect(t.seen).toHaveLength(1000);
    expect(reelTally(t, day).count).toBe(1005);
  });

  it('says reel or reels', () => {
    expect(reelsText(1)).toBe('1 reel');
    expect(reelsText(34)).toBe('34 reels');
  });
});

describe('formatLeft', () => {
  it('reads naturally', () => {
    expect(formatLeft(45_000)).toBe('45 s');
    expect(formatLeft(12 * 60_000)).toBe('12 min');
    expect(formatLeft(65 * 60_000)).toBe('1 h 5 min');
    expect(formatLeft(120 * 60_000)).toBe('2 h');
  });
});
