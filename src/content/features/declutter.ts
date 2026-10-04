import type { Settings } from '../../shared/settings-schema';
import { onDomChange } from '../core/observer';
import { currentRoute } from '../core/router';
import { SEL, SPONSORED_WORDS, SUGGESTED_WORDS } from '../core/selectors';
import type { Feature } from './types';

// Each toggle maps to a class on <html>; styles.css hides elements we tag with data-ige-* attributes.
const CLASS_FOR: Partial<Record<keyof Settings, string>> = {
  'declutter.ads': 'ige-hide-ads',
  'declutter.suggested': 'ige-hide-suggested',
  'declutter.sidebarSuggestions': 'ige-hide-sidebar',
  'declutter.reelsTab': 'ige-hide-reels',
  'declutter.exploreTab': 'ige-hide-explore',
  'declutter.threads': 'ige-hide-threads',
  'declutter.storiesTray': 'ige-hide-stories',
};

const MAX_CHECKS = 6;

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
  for (const art of document.querySelectorAll<HTMLElement>(`${SEL.article}:not([data-ige-flag])`)) {
    const n = Number(art.dataset.igeChecks ?? 0);
    if (n >= MAX_CHECKS) continue;
    art.dataset.igeChecks = String(n + 1);
    if (hasExactLabel(art, SPONSORED_WORDS)) art.dataset.igeFlag = 'ad';
    else if (hasExactLabel(art, SUGGESTED_WORDS)) art.dataset.igeFlag = 'suggested';
  }
}

function tagNav() {
  for (const [sel, name] of [
    [SEL.reelsNav, 'reels'],
    [SEL.exploreNav, 'explore'],
  ] as const) {
    for (const a of document.querySelectorAll(`${sel}:not([data-ige-seen])`)) {
      a.setAttribute('data-ige-seen', '');
      if (a.closest(SEL.article)) continue;
      soleWrapper(a).setAttribute('data-ige-nav', name);
    }
  }
}

function tagHome() {
  if (currentRoute().kind !== 'home') return;
  // Suggested accounts sidebar: climb from the "See all" link while the column stays narrow.
  const seeAll = document.querySelector(`${SEL.sidebarSuggestionsLink}:not([data-ige-seen])`);
  if (seeAll && !seeAll.closest(SEL.article)) {
    seeAll.setAttribute('data-ige-seen', '');
    let col: Element = seeAll;
    while (col.parentElement && col.parentElement.getBoundingClientRect().width < 420 && col.parentElement !== document.body) col = col.parentElement;
    if (col !== seeAll) col.setAttribute('data-ige-sidebar', '');
  }
  // Stories tray: a list whose items contain story-ring canvases, near the top of <main>.
  const main = document.querySelector(SEL.main);
  if (main && !main.querySelector('[data-ige-stories]')) {
    for (const ul of main.querySelectorAll('ul')) {
      if (ul.closest(SEL.article)) continue;
      if (ul.querySelectorAll('li canvas').length >= 2) {
        // Tray = <ul> inside a [role=presentation] scroller; its parent also holds the arrow buttons.
        (ul.closest('[role="presentation"]')?.parentElement ?? ul.parentElement ?? ul).setAttribute('data-ige-stories', '');
        break;
      }
    }
  }
}

function applyClasses(s: Settings) {
  for (const [key, cls] of Object.entries(CLASS_FOR)) {
    document.documentElement.classList.toggle(cls!, !!s[key as keyof Settings]);
  }
}

export const declutter: Feature = {
  id: 'declutter',
  isEnabled: () => true, // individual toggles are applied via classes
  start() {
    const off = onDomChange(() => {
      tagFeed();
      tagNav();
      tagHome();
    });
    return () => {
      off();
      Object.values(CLASS_FOR).forEach((c) => document.documentElement.classList.remove(c!));
    };
  },
  onSettings: applyClasses,
};
