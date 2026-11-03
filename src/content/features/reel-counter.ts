import { addReel, dayKey, REELS_KEY, reelTally, type ReelTally } from '../../shared/focus';
import { currentRoute, onRouteChange } from '../core/router';
import { h, uiLayer } from '../ui/dom';
import type { Feature } from './types';

// Reel counter: a badge on the reel on screen with how many reels you've seen today. Each new
// reel (a new /reels/<code>/ or /reel/<code>/ address) counts once a day. The badge lives in our
// own layer and follows the reel's video; Instagram's DOM is only read.

let tally: ReelTally = reelTally(undefined, dayKey());
let badge: HTMLElement | undefined;
let num: HTMLElement | undefined;
let frame = 0;
/** The reel counted last, so a reel is counted when it appears, not on every check. */
let current: string | undefined;
/** Saves run one after another, so two quick reels can't overwrite each other's count. */
let saving: Promise<unknown> = Promise.resolve();

function reelCode(): string | undefined {
  const r = currentRoute();
  return r.kind === 'reel' ? r.shortcode : undefined;
}

/** The video nearest the middle of the screen: the reel being watched. */
function reelVideo(): HTMLVideoElement | undefined {
  const mid = innerHeight / 2;
  let best: HTMLVideoElement | undefined;
  let bestDist = Infinity;
  for (const v of document.querySelectorAll('video')) {
    const r = v.getBoundingClientRect();
    if (r.width < 120 || r.height < 120 || r.bottom <= 0 || r.top >= innerHeight) continue;
    const dist = Math.abs(r.top + r.height / 2 - mid);
    if (dist < bestDist) {
      best = v;
      bestDist = dist;
    }
  }
  return best;
}

function bump() {
  if (!num || !badge) return;
  num.textContent = String(tally.count);
  badge.setAttribute('aria-label', `Reel ${tally.count} today`);
  badge.classList.remove('is-bump');
  void badge.offsetWidth; // restart the animation
  badge.classList.add('is-bump');
}

function count(code: string) {
  tally = addReel(tally, dayKey(), code);
  bump();
  saving = saving.then(async () => {
    const stored = (await chrome.storage.local.get(REELS_KEY).catch(() => ({}) as Record<string, unknown>))[REELS_KEY];
    tally = addReel(stored, dayKey(), code); // other tabs may have counted meanwhile
    await chrome.storage.local.set({ [REELS_KEY]: tally }).catch(() => {});
    if (num) num.textContent = String(tally.count);
  });
}

function hideBadge() {
  if (badge) badge.style.visibility = 'hidden';
}

/** Follows the reel's video every frame while a reel is open. */
function place() {
  frame = 0;
  const code = reelCode();
  if (!code) return hideBadge();
  frame = requestAnimationFrame(place);
  if (document.visibilityState !== 'visible') return;
  const video = reelVideo();
  if (!video) return hideBadge();
  if (code !== current) {
    current = code;
    count(code);
  }
  if (!badge?.isConnected) {
    num = h('span', { class: 'ige-reels__num' }, String(tally.count));
    badge = h('div', { class: 'ige-reels', role: 'status', 'aria-label': `Reel ${tally.count} today` }, num, h('span', { class: 'ige-reels__label' }, 'reels today'));
    uiLayer().append(badge);
  }
  const r = video.getBoundingClientRect();
  badge.style.transform = `translate(${Math.round(Math.max(r.left, 0) + 12)}px, ${Math.round(Math.max(r.top, 0) + 12)}px)`;
  badge.style.visibility = 'visible';
}

function watch() {
  if (!frame && reelCode()) frame = requestAnimationFrame(place);
  if (!reelCode()) {
    current = undefined;
    hideBadge();
  }
}

function onStorage(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  if (area !== 'local' || !(REELS_KEY in changes)) return;
  tally = reelTally(changes[REELS_KEY].newValue, dayKey());
  if (num) num.textContent = String(tally.count);
}

export const reelCounter: Feature = {
  id: 'reelCounter',
  isEnabled: (s) => s['focus.reelCounter'],
  start() {
    chrome.storage.local
      .get(REELS_KEY)
      .then((r) => {
        tally = reelTally(r[REELS_KEY], dayKey());
        if (num) num.textContent = String(tally.count);
      })
      .catch(() => {});
    const offRoute = onRouteChange(watch);
    chrome.storage.onChanged.addListener(onStorage);
    document.addEventListener('visibilitychange', watch);
    watch();
    return () => {
      offRoute();
      chrome.storage.onChanged.removeListener(onStorage);
      document.removeEventListener('visibilitychange', watch);
      cancelAnimationFrame(frame);
      frame = 0;
      current = undefined;
      badge?.remove();
      badge = num = undefined;
    };
  },
};
