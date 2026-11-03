import { addExtra, addUsage, dayKey, FOCUS_KEY, formatLeft, isLimitedPath, remainingMs, today, type FocusUsage } from '../../shared/focus';
import type { Settings } from '../../shared/settings-schema';
import { onRouteChange } from '../core/router';
import { getSettings } from '../core/state';
import { h, uiLayer } from '../ui/dom';
import { isOwnUi } from '../ui/hosts';
import type { Feature } from './types';

// Focus mode: a daily budget for the Reels feed and Explore, a time-left pill, and an optional
// grayscale veil. Everything is drawn in our own layer; Instagram's DOM is only read, and its
// videos are paused while the budget is used up.

const TICK_MS = 1000;
const FLUSH_MS = 5000;
/** A tick longer than this means the computer slept or the tab was frozen: don't count it. */
const MAX_TICK_MS = 3000;

let usage: FocusUsage = today(undefined, dayKey());
/** Counted in this tab but not saved yet. */
let unsaved = 0;
let lastTick = 0;
let lastFlush = 0;

let veil: HTMLElement | undefined;
let pill: HTMLElement | undefined;
let block: HTMLElement | undefined;

const limited = () => isLimitedPath(location.pathname);
const watching = () => limited() && document.visibilityState === 'visible';
const left = (s: Settings) => remainingMs({ ...usage, usedMs: usage.usedMs + unsaved }, s['focus.limit']);

async function flush() {
  if (!unsaved) return;
  const ms = unsaved;
  unsaved = 0;
  lastFlush = Date.now();
  try {
    const stored = (await chrome.storage.local.get(FOCUS_KEY))[FOCUS_KEY];
    usage = addUsage(stored, dayKey(), ms);
    await chrome.storage.local.set({ [FOCUS_KEY]: usage });
  } catch {
    unsaved += ms; // try again on the next flush
  }
}

async function moreTime() {
  await flush();
  const stored = (await chrome.storage.local.get(FOCUS_KEY).catch(() => ({}) as Record<string, unknown>))[FOCUS_KEY];
  usage = addExtra(stored, dayKey());
  await chrome.storage.local.set({ [FOCUS_KEY]: usage }).catch(() => {});
  render();
}

function goHome() {
  const home = [...document.querySelectorAll<HTMLAnchorElement>('a[href="/"]')].find((a) => a.getBoundingClientRect().width > 0);
  if (home) home.click();
  else location.assign('/');
}

function pauseVideos() {
  for (const v of document.querySelectorAll('video')) if (!v.paused) v.pause();
}

// While the block screen is up, keys (arrows, J/K, space) must not move the feed behind it.
function onKey(e: KeyboardEvent) {
  if (block?.isConnected && !isOwnUi(e.target as Node)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}

function blockScreen(limitMin: number): HTMLElement {
  const home = h('button', { class: 'ige-btn ige-btn--primary', type: 'button', onClick: goHome }, 'Go to Home');
  const more = h('button', { class: 'ige-btn ige-btn--ghost', type: 'button', onClick: moreTime }, '5 more minutes');
  const el = h(
    'div',
    { class: 'ige-focus-block', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ige-focus-title', onWheel: (e: WheelEvent) => e.preventDefault() },
    h(
      'div',
      { class: 'ige-focus-card' },
      h('h2', { id: 'ige-focus-title' }, "That's your time for today"),
      h('p', {}, `You've spent your ${formatLeft(limitMin * 60_000)} on Reels and Explore today. It resets at midnight.`),
      h('div', { class: 'ige-focus-actions' }, more, home),
    ),
  );
  requestAnimationFrame(() => {
    el.classList.add('is-in');
    home.focus();
  });
  return el;
}

function render() {
  const s = getSettings();
  const onLimited = limited();
  const remaining = left(s);

  const gray = s['focus.grayscale'] === 'always' || (s['focus.grayscale'] === 'limited' && onLimited);
  if (gray && !veil?.isConnected) uiLayer().prepend((veil = h('div', { class: 'ige-focus-veil', 'aria-hidden': 'true' })));
  else if (!gray && veil) {
    veil.remove();
    veil = undefined;
  }

  const blocked = onLimited && remaining <= 0;
  if (blocked) {
    if (!block?.isConnected) uiLayer().append((block = blockScreen(s['focus.limit'])));
    pauseVideos();
  } else if (block) {
    block.remove();
    block = undefined;
  }

  const showPill = onLimited && !blocked && s['focus.timer'];
  if (showPill) {
    if (!pill?.isConnected) uiLayer().append((pill = h('div', { class: 'ige-focus-pill', role: 'timer', 'aria-live': 'off' })));
    pill.textContent = `${formatLeft(remaining)} left today`;
    pill.classList.toggle('is-low', remaining < 60_000);
  } else if (pill) {
    pill.remove();
    pill = undefined;
  }
}

function tick() {
  const now = performance.now();
  const dt = now - lastTick;
  lastTick = now;
  if (usage.day !== dayKey()) usage = today(undefined, dayKey());
  if (watching() && dt > 0 && dt <= MAX_TICK_MS && left(getSettings()) > 0) unsaved += dt;
  if (unsaved && Date.now() - lastFlush >= FLUSH_MS) flush();
  render();
}

function onStorage(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  if (area !== 'local' || !(FOCUS_KEY in changes)) return;
  usage = today(changes[FOCUS_KEY].newValue, dayKey());
  render();
}

function onVisibility() {
  if (document.visibilityState === 'hidden') flush();
  lastTick = performance.now();
}

export const focusMode: Feature = {
  id: 'focus',
  isEnabled: (s) => s['focus.enabled'],
  start() {
    chrome.storage.local
      .get(FOCUS_KEY)
      .then((r) => {
        usage = today(r[FOCUS_KEY], dayKey());
        render();
      })
      .catch(() => {});
    lastTick = performance.now();
    lastFlush = Date.now();
    const timer = window.setInterval(tick, TICK_MS);
    const offRoute = onRouteChange(() => {
      lastTick = performance.now();
      render();
    });
    chrome.storage.onChanged.addListener(onStorage);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    window.addEventListener('keydown', onKey, true);
    render();
    return () => {
      clearInterval(timer);
      offRoute();
      flush();
      chrome.storage.onChanged.removeListener(onStorage);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('keydown', onKey, true);
      for (const el of [veil, pill, block]) el?.remove();
      veil = pill = block = undefined;
    };
  },
  onSettings: () => render(),
};
