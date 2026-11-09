import { onRouteChange } from '../core/router';
import { SEL } from '../core/selectors';
import type { Feature } from './types';

/**
 * True when a reel just finished: Instagram loops reels by jumping back to the start, so there is
 * no `ended` event. A jump from its last second (or last 20%) to its first second counts.
 */
export function finished(prev: number, cur: number, duration: number): boolean {
  if (!Number.isFinite(duration) || duration < 2) return false;
  return prev >= Math.min(duration - 1, duration * 0.8) && cur < 1 && prev - cur > 1;
}

/** Only the Reels tab (/reels/...), not a single reel opened from a post or a chat. */
const onReelsTab = () => location.pathname.startsWith('/reels/');

/** The reel on screen: its top sits near the top of the window. */
function isCurrent(v: HTMLVideoElement): boolean {
  const r = v.getBoundingClientRect();
  return r.height > 200 && Math.abs(r.top) < r.height / 2;
}

/** The scroll-snap list the reels sit in. */
function scroller(v: HTMLVideoElement): HTMLElement | null {
  for (let el = v.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

/** On the Reels tab, scrolls to the next reel when the one playing finishes. */
export const reelsAutoScroll: Feature = {
  id: 'reels-autoscroll',
  isEnabled: (s) => s['video.autoScroll'],
  start() {
    const last = new WeakMap<HTMLVideoElement, number>();
    let lastInput = -Infinity;
    let lastAdvance = -Infinity;
    const onInput = () => (lastInput = performance.now());

    const onTime = (e: Event) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || !onReelsTab()) return;
      const prev = last.get(v) ?? 0;
      last.set(v, v.currentTime);
      if (!finished(prev, v.currentTime, v.duration) || !isCurrent(v)) return;
      const now = performance.now();
      // You dragged the seek bar back, or a popup (comments, share) is open: stay.
      if (now - lastInput < 1000 || now - lastAdvance < 1500 || document.querySelector(SEL.dialog)) return;
      const list = scroller(v);
      if (!list) return;
      lastAdvance = now;
      list.scrollBy({ top: list.clientHeight, behavior: 'smooth' });
    };
    // A reel that doesn't loop (Glassgram's "Loop videos" off) ends for real.
    const onEnded = (e: Event) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || !onReelsTab() || !isCurrent(v) || document.querySelector(SEL.dialog)) return;
      const now = performance.now();
      if (now - lastAdvance < 1500) return;
      const list = scroller(v);
      if (!list) return;
      lastAdvance = now;
      list.scrollBy({ top: list.clientHeight, behavior: 'smooth' });
    };

    document.addEventListener('timeupdate', onTime, true);
    document.addEventListener('ended', onEnded, true);
    document.addEventListener('pointerdown', onInput, true);
    document.addEventListener('keydown', onInput, true);
    const offRoute = onRouteChange(() => (lastAdvance = performance.now()));
    return () => {
      offRoute();
      document.removeEventListener('timeupdate', onTime, true);
      document.removeEventListener('ended', onEnded, true);
      document.removeEventListener('pointerdown', onInput, true);
      document.removeEventListener('keydown', onInput, true);
    };
  },
};
