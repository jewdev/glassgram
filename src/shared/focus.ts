// Focus mode: a daily time budget for Instagram's endless feeds (the Reels feed and Explore).
// Usage is counted per local calendar day in extension storage, shared by all Instagram tabs.

export const FOCUS_KEY = 'ige.focus';
/** What "5 more minutes" adds. */
export const EXTRA_MS = 5 * 60 * 1000;

export interface FocusUsage {
  /** Local date the counts belong to, YYYY-MM-DD. */
  day: string;
  /** Time spent on limited pages today. */
  usedMs: number;
  /** Time added today with "5 more minutes". */
  extraMs: number;
}

/** Reel counter: the reels shown today, each once. Kept apart from focus time (own storage key). */
export const REELS_KEY = 'ige.reels';

export interface ReelTally {
  day: string;
  count: number;
  /** Codes counted today, newest last, so scrolling back to a reel doesn't count it again. */
  seen: string[];
}

/** Reel codes kept per day; past this the oldest are dropped (and could count again). */
const MAX_SEEN = 1000;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

export function dayKey(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's usage; a stored value from an earlier day (or garbage) starts over. */
export function today(stored: unknown, day: string): FocusUsage {
  const u = stored as Partial<FocusUsage> | undefined;
  if (!u || u.day !== day) return { day, usedMs: 0, extraMs: 0 };
  return { day, usedMs: num(u.usedMs), extraMs: num(u.extraMs) };
}

export function addUsage(stored: unknown, day: string, ms: number): FocusUsage {
  const u = today(stored, day);
  return { ...u, usedMs: u.usedMs + Math.max(0, ms) };
}

export function addExtra(stored: unknown, day: string, ms = EXTRA_MS): FocusUsage {
  const u = today(stored, day);
  return { ...u, extraMs: u.extraMs + ms };
}

/** Today's reel tally; one from an earlier day (or garbage) starts over. */
export function reelTally(stored: unknown, day: string): ReelTally {
  const t = stored as Partial<ReelTally> | undefined;
  if (!t || t.day !== day) return { day, count: 0, seen: [] };
  const seen = Array.isArray(t.seen) ? t.seen.filter((c): c is string => typeof c === 'string') : [];
  return { day, count: Math.max(num(t.count), seen.length), seen };
}

/** Counts the reel `code` today, once. */
export function addReel(stored: unknown, day: string, code: string): ReelTally {
  const t = reelTally(stored, day);
  if (t.seen.includes(code)) return t;
  return { day, count: t.count + 1, seen: [...t.seen, code].slice(-MAX_SEEN) };
}

/** "1 reel", "34 reels" */
export const reelsText = (n: number) => `${n} ${n === 1 ? 'reel' : 'reels'}`;

/** Milliseconds left today under a limit of `limitMin` minutes. */
export function remainingMs(u: FocusUsage, limitMin: number): number {
  return Math.max(0, limitMin * 60_000 + u.extraMs - u.usedMs);
}

/** The Reels feed (/reels/, /reels/<code>/) and Explore count; a single shared reel (/reel/<code>/) doesn't. */
export function isLimitedPath(pathname: string): boolean {
  return /^\/(reels|explore)(\/|$)/.test(pathname);
}

/** "12 min", "1 h 5 min", "45 s" */
export function formatLeft(ms: number): string {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
