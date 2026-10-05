import { currentRoute, onRouteChange, type Route } from '../core/router';
import { STORY_PAUSE_LABELS, STORY_PLAY_LABELS } from '../core/selectors';
import type { Feature } from './types';

/** Pause this long before the end, so Instagram's own end-of-story timer never fires. */
const STOP_BEFORE_MS = 250;
/** Hard stop if we can't estimate the speed yet (e.g. the first frames of a story). */
const STOP_AT = 0.985;
/** Minimum gap between speed samples; per-frame deltas are too noisy. */
const SAMPLE_MS = 100;
/** Re-press pause if Instagram hasn't switched to the play icon by then. */
const RETRY_MS = 150;

const isStoryRoute = (r: Route) => r.kind === 'stories' || r.kind === 'highlight';

type ToggleState = 'playing' | 'paused';

/** Instagram's play/pause toggle in the story header, and which icon it shows right now. */
function findToggle(): { btn: HTMLElement; state: ToggleState } | null {
  for (const svg of document.querySelectorAll('svg[aria-label]')) {
    const label = svg.getAttribute('aria-label') ?? '';
    const state: ToggleState | null = STORY_PAUSE_LABELS.includes(label) ? 'playing' : STORY_PLAY_LABELS.includes(label) ? 'paused' : null;
    if (!state) continue;
    const btn = svg.closest<HTMLElement>('[role="button"], button');
    if (btn && btn.getBoundingClientRect().width > 0) return { btn, state };
  }
  return null;
}

/**
 * The active segment's fill: a div translated from -100% (start) to 0 (end) inside a thin
 * overflow-hidden bar. Only the playing segment carries an inline transform.
 */
function findFill(near: Element): HTMLElement | null {
  for (let a = near.parentElement; a && a !== document.body; a = a.parentElement) {
    for (const fill of a.querySelectorAll<HTMLElement>('div[style*="translateX"]')) {
      const bar = fill.parentElement;
      if (!bar) continue;
      const r = bar.getBoundingClientRect();
      if (r.height > 0 && r.height <= 6 && getComputedStyle(bar).overflow === 'hidden') return fill;
    }
  }
  return null;
}

/** 0..1 — read from the computed transform, so it works for JS-driven and CSS-transition fills alike. */
function progressOf(fill: HTMLElement): number | null {
  const w = fill.getBoundingClientRect().width;
  if (!w) return null;
  const t = getComputedStyle(fill).transform;
  const tx = t === 'none' ? 0 : new DOMMatrixReadOnly(t).m41;
  return Math.min(1, Math.max(0, 1 + tx / w));
}

/** Stop each story at its end instead of letting Instagram flip to the next one. */
export const storyNoAdvance: Feature = {
  id: 'story-no-advance',
  isEnabled: (s) => s['stories.noAutoAdvance'],
  start() {
    let frame = 0;
    let anchor: { fill: HTMLElement; p: number; t: number } | null = null;
    let rate = 0; // progress per ms
    /**
     * The story we stopped at. `confirmed` once Instagram shows it paused; `released` once the
     * user resumed it themselves.
     */
    let held: { fill: HTMLElement; href: string; confirmed: boolean; released: boolean; clickedAt: number } | null = null;

    const tick = () => {
      frame = requestAnimationFrame(tick);
      const toggle = findToggle();
      const fill = toggle && findFill(toggle.btn);
      const p = fill && progressOf(fill);
      if (!toggle || !fill || p == null) return;
      const now = performance.now();

      if (held && (held.fill !== fill || held.href !== location.href || p < 0.5)) {
        // Moved on to another story: undo our pause so it plays normally.
        if (held.confirmed && !held.released && toggle.state === 'paused') toggle.btn.click();
        held = null;
        anchor = null;
        rate = 0;
        return;
      }
      if (held) {
        if (toggle.state === 'paused') held.confirmed = true;
        else if (held.confirmed) held.released = true; // pressing play on a held story means "go on"
        else if (now - held.clickedAt > RETRY_MS) {
          toggle.btn.click();
          held.clickedAt = now;
        }
        return;
      }

      if (!anchor || anchor.fill !== fill || p < anchor.p) {
        anchor = { fill, p, t: now };
        rate = 0;
      } else if (now - anchor.t >= SAMPLE_MS) {
        if (p > anchor.p) rate = (p - anchor.p) / (now - anchor.t);
        anchor = { fill, p, t: now };
      }

      if (toggle.state !== 'playing') return;
      const msLeft = rate > 0 ? (1 - p) / rate : Infinity;
      if (msLeft <= STOP_BEFORE_MS || p >= STOP_AT) {
        toggle.btn.click();
        held = { fill, href: location.href, confirmed: false, released: false, clickedAt: now };
      }
    };

    const sync = (r: Route) => {
      if (isStoryRoute(r) && !frame) frame = requestAnimationFrame(tick);
      else if (!isStoryRoute(r) && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
        anchor = null;
        held = null;
      }
    };
    sync(currentRoute());
    const off = onRouteChange(sync);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  },
};
