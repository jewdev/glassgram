import type { Settings } from '../../shared/settings-schema';
import { onDomChange } from '../core/observer';
import { currentRoute } from '../core/router';
import { SEL, SPONSORED_WORDS, SUGGESTED_WORDS } from '../core/selectors';
import { getSettings } from '../core/state';
import type { Feature } from './types';

// We remember what each element is here, not on the element, and hide only what a toggle asks for
// with an inline display:none. Nothing else is written to Instagram's DOM.
type Kind = 'ad' | 'suggested' | 'sidebar' | 'stories' | 'reels' | 'explore' | 'threads';

const SETTING_FOR: Record<Kind, keyof Settings> = {
  ad: 'declutter.ads',
  suggested: 'declutter.suggested',
  sidebar: 'declutter.sidebarSuggestions',
  reels: 'declutter.reelsTab',
  explore: 'declutter.exploreTab',
  threads: 'declutter.threads',
  stories: 'declutter.storiesTray',
};

const MAX_CHECKS = 6;

/** Elements we recognized. */
const kinds = new Map<Element, Kind>();
/** Hidden elements → their own inline display, to put back. */
const hidden = new Map<HTMLElement, [value: string, priority: string]>();
/** Articles looked at, and how often (labels may render late). */
let checks = new WeakMap<Element, number>();
/** Nav links / sidebar anchors already handled. */
let seen = new WeakSet<Element>();

const has = (kind: Kind) => [...kinds].some(([el, k]) => k === kind && el.isConnected);

function hasExactLabel(root: Element, words: string[]): boolean {
  for (const el of root.querySelectorAll('span, a')) {
    if (el.childElementCount > 1) continue;
    const t = el.textContent?.trim();
    if (t && words.includes(t)) return true;
  }
  return false;
}

/** Walk up while the parent wraps nothing but this element (nav item wrappers). */
function soleWrapper(el: Element): Element {
  let cur = el;
  while (cur.parentElement && cur.parentElement.childElementCount === 1 && cur.parentElement.tagName !== 'NAV' && cur.parentElement !== document.body) {
    cur = cur.parentElement;
  }
  return cur;
}

function tagFeed() {
  for (const art of document.querySelectorAll<HTMLElement>(SEL.article)) {
    if (kinds.has(art)) continue;
    const n = checks.get(art) ?? 0;
    if (n >= MAX_CHECKS) continue;
    checks.set(art, n + 1);
    if (hasExactLabel(art, SPONSORED_WORDS)) kinds.set(art, 'ad');
    else if (hasExactLabel(art, SUGGESTED_WORDS)) kinds.set(art, 'suggested');
  }
}

function tagNav() {
  for (const [sel, name] of [
    [SEL.reelsNav, 'reels'],
    [SEL.exploreNav, 'explore'],
  ] as const) {
    for (const a of document.querySelectorAll(sel)) {
      if (seen.has(a)) continue;
      seen.add(a);
      if (a.closest(SEL.article)) continue;
      kinds.set(soleWrapper(a), name);
    }
  }
  for (const a of document.querySelectorAll(SEL.threadsLink)) if (!kinds.has(a)) kinds.set(a, 'threads');
}

function tagHome() {
  if (currentRoute().kind !== 'home') return;
  // Suggested accounts sidebar: climb from the "See all" link (older layout) or the
  // "Suggested for you" header (newer fixed right column) while the column stays narrow.
  if (!has('sidebar')) {
    const anchor =
      [...document.querySelectorAll(SEL.sidebarSuggestionsLink)].find((el) => !seen.has(el)) ??
      [...document.querySelectorAll(`${SEL.main} span`)].find(
        (el) => !seen.has(el) && el.childElementCount === 0 && SUGGESTED_WORDS.includes(el.textContent?.trim() ?? '') && !el.closest(SEL.article),
      );
    if (anchor && !anchor.closest(SEL.article)) {
      seen.add(anchor);
      let col: Element = anchor;
      while (col.parentElement && col.parentElement.getBoundingClientRect().width < 420 && col.parentElement !== document.body) col = col.parentElement;
      // Must be a real side column, not a narrow heading inside the feed.
      if (col !== anchor && col.getBoundingClientRect().left > window.innerWidth / 2) kinds.set(col, 'sidebar');
    }
  }
  // Stories tray: a list whose items contain story-ring canvases, near the top of <main>.
  const main = document.querySelector(SEL.main);
  if (main && ![...kinds].some(([el, k]) => k === 'stories' && main.contains(el))) {
    for (const ul of main.querySelectorAll('ul')) {
      if (ul.closest(SEL.article)) continue;
      if (ul.querySelectorAll('li canvas').length >= 2) {
        // Tray = <ul> inside a [role=presentation] scroller; its parent also holds the arrow buttons.
        kinds.set(ul.closest('[role="presentation"]')?.parentElement ?? ul.parentElement ?? ul, 'stories');
        break;
      }
    }
  }
}

function hide(el: HTMLElement) {
  if (hidden.has(el)) return;
  hidden.set(el, [el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')]);
  el.style.setProperty('display', 'none', 'important');
}

function show(el: HTMLElement) {
  const prev = hidden.get(el);
  if (!prev) return;
  hidden.delete(el);
  if (prev[0]) el.style.setProperty('display', prev[0], prev[1]);
  else el.style.removeProperty('display');
}

function apply(s: Settings) {
  for (const [el, kind] of kinds) {
    if (!el.isConnected) {
      kinds.delete(el);
      hidden.delete(el as HTMLElement);
    } else if (el instanceof HTMLElement) {
      if (s[SETTING_FOR[kind]]) hide(el);
      else show(el);
    }
  }
}

export const declutter: Feature = {
  id: 'declutter',
  isEnabled: (s) => Object.values(SETTING_FOR).some((k) => s[k]),
  start() {
    const off = onDomChange(() => {
      tagFeed();
      tagNav();
      tagHome();
      apply(getSettings());
    });
    return () => {
      off();
      for (const el of [...hidden.keys()]) show(el);
      kinds.clear();
      checks = new WeakMap();
      seen = new WeakSet();
    };
  },
  onSettings: apply,
};
