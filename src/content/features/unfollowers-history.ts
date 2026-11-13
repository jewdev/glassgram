import type { FriendUser } from '../core/api';

// Scan pacing and retries follow davidarroyo1234/InstagramUnfollowers, so a scan here looks the same to
// Instagram as one from that script: 50 users a page, about 1.3 to 2.3 s between pages, a 5 to 15 s
// pause every 15 pages, and up to 3 retries when Instagram asks to slow down.

export const PAGE_SIZE = 50;
/** Pages read per list before the scan gives up (12,500 accounts). */
export const PAGE_SAFETY_LIMIT = 250;
/** A long pause is taken once every this many pages. */
export const PAGES_BEFORE_LONG_PAUSE = 15;
export const MAX_RETRIES = 3;
/** Seconds to wait before retry N when Instagram rate-limits: N times this. */
export const RATE_LIMIT_RETRY_S = 30;
/** Seconds to wait before retry N after a network error: N times this. */
export const NETWORK_RETRY_S = 5;
/** How long Glassgram stops calling Instagram after the retries run out on a rate limit. */
export const BLOCKED_COOLDOWN_MS = 10 * 60 * 1000;
/** History entries kept per account, newest first. */
export const HISTORY_LIMIT = 100;

/** Milliseconds to wait between two pages: a 0.3 to 1 s jitter, then the delay to 1.3 times it. */
export function pageDelayMs(delayMs: number, rnd: () => number = Math.random): number {
  return Math.floor(rnd() * 700) + 300 + Math.floor(rnd() * (delayMs - delayMs * 0.7)) + delayMs;
}

/** Milliseconds of the long pause: the setting give or take 5 s. */
export function longPauseMs(pauseMs: number, rnd: () => number = Math.random): number {
  return Math.max(0, pauseMs + (rnd() * 10000 - 5000));
}

/** Seconds to wait before retry `attempt` (1-based). */
export function retryWaitS(attempt: number, rateLimited: boolean): number {
  return (rateLimited ? RATE_LIMIT_RETRY_S : NETWORK_RETRY_S) * attempt;
}

/** The few fields a history entry keeps. Picture links expire, so none is stored. */
export interface MiniUser {
  pk: string;
  username: string;
  full_name?: string;
  is_verified?: boolean;
}

export interface Snapshot {
  at: number;
  followers: MiniUser[];
  following: MiniUser[];
}

export interface HistoryEntry {
  at: number;
  /** The scan this one is compared with; missing on the first scan. */
  prevAt?: number;
  followers: number;
  following: number;
  /** Stopped following you (or deactivated, or blocked you). */
  lost: MiniUser[];
  /** Started following you. */
  gained: MiniUser[];
  /** You stopped following them. */
  unfollowed: MiniUser[];
  /** You started following them. */
  followed: MiniUser[];
}

export const mini = (u: MiniUser | FriendUser): MiniUser => ({
  pk: String(u.pk),
  username: u.username,
  ...(u.full_name ? { full_name: u.full_name } : {}),
  ...(u.is_verified ? { is_verified: true } : {}),
});

export function snapshot(at: number, followers: (MiniUser | FriendUser)[], following: (MiniUser | FriendUser)[]): Snapshot {
  return { at, followers: followers.map(mini), following: following.map(mini) };
}

/**
 * Membership by id or by lower-case username, like the upstream script's follower index: an account
 * only counts as missing when neither matches, so a changed id format never flags a real follower.
 */
export function userIndex(users: { pk: string; username: string }[]) {
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const u of users) {
    ids.add(String(u.pk));
    const name = u.username?.trim().toLowerCase();
    if (name) names.add(name);
  }
  return (u: { pk: string; username: string }) => ids.has(String(u.pk)) || names.has(u.username?.trim().toLowerCase() ?? '');
}

const missingFrom = <T extends { pk: string; username: string }>(from: T[], other: T[]) => {
  const has = userIndex(other);
  return from.filter((u) => !has(u));
};

/** What changed between two complete scans. Without a previous one, an entry with only the counts. */
export function diffScans(prev: Snapshot | undefined, next: Snapshot): HistoryEntry {
  const base = { at: next.at, followers: next.followers.length, following: next.following.length };
  if (!prev) return { ...base, lost: [], gained: [], unfollowed: [], followed: [] };
  return {
    ...base,
    prevAt: prev.at,
    lost: missingFrom(prev.followers, next.followers),
    gained: missingFrom(next.followers, prev.followers),
    unfollowed: missingFrom(prev.following, next.following),
    followed: missingFrom(next.following, prev.following),
  };
}

export const hasChanges = (e: HistoryEntry) => !!(e.lost.length || e.gained.length || e.unfollowed.length || e.followed.length);

export function addEntry(history: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [entry, ...history].slice(0, HISTORY_LIMIT);
}

export const CHANGE_LABELS = {
  lost: 'Unfollowed you',
  gained: 'New followers',
  unfollowed: 'You unfollowed',
  followed: 'You followed',
} as const satisfies Record<keyof Pick<HistoryEntry, 'lost' | 'gained' | 'unfollowed' | 'followed'>, string>;

export type ChangeKind = keyof typeof CHANGE_LABELS;

/** "1 new follower", "3 new followers". */
export const newFollowersText = (n: number) => `${n} new follower${n === 1 ? '' : 's'}`;
export const CHANGE_KINDS = Object.keys(CHANGE_LABELS) as ChangeKind[];

/** Spreadsheet cell, with names other people chose kept from running as formulas. */
export const csvCell = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

/** True when the newest scan has changes the user has not looked at yet. */
export function isUnseen(history: HistoryEntry[], seenAt: number | undefined): boolean {
  const latest = history[0];
  return !!latest && latest.prevAt !== undefined && hasChanges(latest) && latest.at > (seenAt ?? 0);
}

export function historyCsv(history: HistoryEntry[], kinds: readonly ChangeKind[] = CHANGE_KINDS): string {
  const rows: string[] = [];
  for (const e of history) {
    const date = new Date(e.at).toISOString();
    for (const kind of kinds) {
      for (const u of e[kind]) {
        rows.push([date, CHANGE_LABELS[kind], u.username, u.full_name ?? '', `https://www.instagram.com/${u.username}/`].map(csvCell).join(','));
      }
    }
  }
  return ['scan_date,change,username,full_name,profile_url', ...rows].join('\r\n');
}
