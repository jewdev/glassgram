import { describe, expect, it } from 'vitest';
import {
  HISTORY_LIMIT,
  addEntry,
  diffScans,
  hasChanges,
  historyCsv,
  isUnseen,
  longPauseMs,
  pageDelayMs,
  retryWaitS,
  snapshot,
  userIndex,
  type HistoryEntry,
} from '../src/content/features/unfollowers-history';

const u = (pk: string, username = `user${pk}`) => ({ pk, username, full_name: '', profile_pic_url: 'x' });
const names = (list: { username: string }[]) => list.map((x) => x.username).sort();

describe('scan pacing (same as InstagramUnfollowers)', () => {
  it('waits 0.3 to 1 s plus the delay to 1.3 times it between pages', () => {
    expect(pageDelayMs(1000, () => 0)).toBe(1300);
    expect(pageDelayMs(1000, () => 0.999999)).toBe(999 + 1299);
  });

  it('pauses the setting give or take 5 s, never below 0', () => {
    expect(longPauseMs(10000, () => 0)).toBe(5000);
    expect(longPauseMs(10000, () => 1)).toBe(15000);
    expect(longPauseMs(2000, () => 0)).toBe(0);
  });

  it('backs off 30, 60, 90 s on rate limits and 5, 10, 15 s on network errors', () => {
    expect([1, 2, 3].map((n) => retryWaitS(n, true))).toEqual([30, 60, 90]);
    expect([1, 2, 3].map((n) => retryWaitS(n, false))).toEqual([5, 10, 15]);
  });
});

describe('userIndex', () => {
  it('matches by id or by username in any case', () => {
    const has = userIndex([u('1', 'Ann')]);
    expect(has(u('1', 'renamed'))).toBe(true);
    expect(has(u('999', 'ann'))).toBe(true);
    expect(has(u('2', 'bob'))).toBe(false);
  });
});

describe('diffScans', () => {
  it('records only counts on the first scan', () => {
    const e = diffScans(undefined, snapshot(5, [u('1')], [u('1'), u('2')]));
    expect(e).toMatchObject({ at: 5, followers: 1, following: 2, lost: [], gained: [] });
    expect(e.prevAt).toBeUndefined();
    expect(hasChanges(e)).toBe(false);
  });

  it('finds who unfollowed, who followed, and your own changes', () => {
    const prev = snapshot(1, [u('1'), u('2'), u('3')], [u('1'), u('2'), u('4')]);
    const next = snapshot(2, [u('1'), u('3'), u('5')], [u('1'), u('2'), u('6')]);
    const e = diffScans(prev, next);
    expect(e.prevAt).toBe(1);
    expect(names(e.lost)).toEqual(['user2']);
    expect(names(e.gained)).toEqual(['user5']);
    expect(names(e.unfollowed)).toEqual(['user4']);
    expect(names(e.followed)).toEqual(['user6']);
  });

  it('does not count a renamed account as lost', () => {
    const e = diffScans(snapshot(1, [u('1', 'old')], []), snapshot(2, [u('1', 'new')], []));
    expect(hasChanges(e)).toBe(false);
  });

  it('keeps no picture links, which expire', () => {
    expect(snapshot(1, [u('1')], []).followers[0]).toEqual({ pk: '1', username: 'user1' });
  });
});

describe('history', () => {
  it('keeps the newest entries first, up to the limit', () => {
    let h: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h = addEntry(h, diffScans(undefined, snapshot(i, [], [])));
    expect(h).toHaveLength(HISTORY_LIMIT);
    expect(h[0].at).toBe(HISTORY_LIMIT + 4);
  });

  it('exports one CSV row per change, with formulas neutralised', () => {
    const e = diffScans(snapshot(1, [{ ...u('1', 'x'), full_name: '=cmd' }], []), snapshot(Date.UTC(2026, 0, 2), [], []));
    const rows = historyCsv([e]).split('\r\n');
    expect(rows[0]).toBe('scan_date,change,username,full_name,profile_url');
    expect(rows[1]).toBe(`"2026-01-02T00:00:00.000Z","Unfollowed you","x","'=cmd","https://www.instagram.com/x/"`);
  });

  it('exports only the kinds asked for', () => {
    const e = diffScans(snapshot(1, [u('1', 'gone')], []), snapshot(2, [u('2', 'fresh')], []));
    const rows = historyCsv([e], ['lost']).split('\r\n');
    expect(rows).toHaveLength(2);
    expect(rows[1]).toContain('"gone"');
  });
});

describe('isUnseen', () => {
  const changed = diffScans(snapshot(1, [u('1')], []), snapshot(2, [], []));
  const quiet = diffScans(snapshot(1, [u('1')], []), snapshot(2, [u('1')], []));
  const first = diffScans(undefined, snapshot(1, [u('1')], []));

  it('is false with no scans, a first scan only, or no changes', () => {
    expect(isUnseen([], undefined)).toBe(false);
    expect(isUnseen([first], undefined)).toBe(false);
    expect(isUnseen([quiet, first], undefined)).toBe(false);
  });

  it('is true until the newest scan has been looked at', () => {
    expect(isUnseen([changed], undefined)).toBe(true);
    expect(isUnseen([changed], 1)).toBe(true);
    expect(isUnseen([changed], 2)).toBe(false);
  });
});
