// Unfollow pacing follows davidarroyo1234/InstagramUnfollowers: one unfollow, a wait of the setting to
// 1.2 times it (4 to 4.8 s by default), and a long pause after every 5 unfollows (5 min by default).
// Instagram action-blocks accounts that unfollow faster, so the floors below stay conservative.

/** A long pause is taken after every this many unfollows. */
export const UNFOLLOWS_BEFORE_PAUSE = 5;

/** Milliseconds between two unfollows: the setting to 1.2 times it. */
export function unfollowDelayMs(delayMs: number, rnd: () => number = Math.random): number {
  return Math.floor(rnd() * (delayMs * 1.2 - delayMs)) + delayMs;
}

/** Rough time a queue of `n` unfollows takes, with the average wait and every long pause. */
export function unfollowEtaMs(n: number, delayMs: number, pauseMs: number): number {
  if (n <= 1) return 0;
  const waits = n - 1;
  const pauses = Math.floor(waits / UNFOLLOWS_BEFORE_PAUSE);
  return waits * delayMs * 1.1 + pauses * pauseMs;
}

/** "45 s", "12 min", "2 h 5 min". */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

/** "4:59" for a countdown. */
export function clock(secondsLeft: number): string {
  const s = Math.max(0, Math.ceil(secondsLeft));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
