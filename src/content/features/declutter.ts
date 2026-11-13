import type { Settings } from '../../shared/settings-schema';
import { isEmpty, isMuted, parseMuteList, postAuthor, type MuteList } from '../core/mute';
import { onDomChange } from '../core/observer';
import { currentRoute } from '../core/router';
import { SEL, shortcodeInRoot, SPONSORED_WORDS, SUGGESTED_WORDS } from '../core/selectors';
import { getSettings } from '../core/state';
import type { Feature } from './types';

// We remember what each element is here, not on the element, and hide only what a toggle asks for
// with inline styles. Nothing else is written to Instagram's DOM.
type Kind = 'ad' | 'suggested' | 'muted' | 'sidebar' | 'stories' | 'reels' | 'explore' | 'threads';

const SETTING_FOR: Record<Kind, keyof Settings> = {
  ad: 'declutter.ads',
  suggested: 'declutter.suggested',
  muted: 'declutter.muteWords',
  sidebar: 'declutter.sidebarSuggestions',
  reels: 'declutter.reelsTab',
  explore: 'declutter.exploreTab',
  threads: 'declutter.threads',
  stories: 'declutter.storiesTray',
};

const MAX_CHECKS = 6;

/** Elements we recognized. */
const kinds = new Map<Element, Kind>();
/** Hidden elements → their own inline values of the properties we set, to put back. */
const hidden = new Map<HTMLElement, Map<string, [value: string, priority: string]>>();

/** display:none for most things. */
const REMOVE: Record<string, string> = { display: 'none' };
/**
 * Feed posts live in Instagram's virtualized list, which stops mounting new posts once one
 * measures 0px tall: the feed freezes, its bottom padding keeps growing and you scroll into
 * blank space. So posts keep a 1px box instead of leaving the layout.
 */
const COLLAPSE: Record<string, string> = { height: '1px', 'min-height': '0', overflow: 'hidden', visibility: 'hidden', margin: '0', padding: '0', border: '0' };

/**
 * Scroll anchoring pulls the feed back while posts in it are collapsed, in Chrome and Firefox alike.
 * Measured in Chrome: Instagram swaps the posts you scrolled past for a spacer of exactly their height,
 * yet the browser still scrolled the page back by about one post. With anchoring off every scroll moved
 * exactly as far as the wheel did. So Home turns anchoring off while ads, suggested or muted posts may collapse.
 */
const COLLAPSE_KINDS: Kind[] = ['ad', 'suggested', 'muted'];
let anchorOff: { el: HTMLElement; value: string; priority: string }[] | undefined;

function syncAnchoring(s: Settings, on = true) {
  const want = on && currentRoute().kind === 'home' && COLLAPSE_KINDS.some((k) => !!s[SETTING_FOR[k]]);
  if (want && !anchorOff) {
    anchorOff = [document.documentElement, document.body].filter(Boolean).map((el) => {
      const prev = { el, value: el.style.getPropertyValue('overflow-anchor'), priority: el.style.getPropertyPriority('overflow-anchor') };
      el.style.setProperty('overflow-anchor', 'none', 'important');
      return prev;
    });
  } else if (!want && anchorOff) {
    for (const { el, value, priority } of anchorOff) {
      if (value) el.style.setProperty('overflow-anchor', value, priority);
      else el.style.removeProperty('overflow-anchor');
    }
    anchorOff = undefined;
  }
}

function stylesFor(kind: Kind): Record<string, string> {
  return kind === 'ad' || kind === 'suggested' || kind === 'muted' ? COLLAPSE : REMOVE;
}
/**
 * Feed posts we collapsed, by shortcode. Instagram's feed unmounts posts you scrolled past and mounts
 * them again as new elements when you scroll back up. It remembers them as 1px tall, so a copy that
 * comes back at full height pushes the page down under you. A remembered post is collapsed again
 * the moment it is mounted, before the browser lays it out, wherever it is on the screen.
 */
const collapsedPosts = new Map<string, Kind>();

/** Articles looked at, and how often (labels may render late). */
let checks = new WeakMap<Element, number>();
/** Nav links / sidebar anchors already handled. */
let seen = new WeakSet<Element>();

/** Runs on every DOM scan: walk the map without copying it. */
function has(kind: Kind, within?: Element): boolean {
  for (const [el, k] of kinds) if (k === kind && el.isConnected && (!within || within.contains(el))) return true;
  return false;
}

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
    if (kinds.has(art) || restore(art)) continue;
    // Never collapse a post that starts above the screen: the page would shift up under you. Instagram's
    // feed also unmounts posts you scrolled past and mounts them again as new elements, so in a run
    // of suggested posts each collapse made it mount more above, and the feed kept jumping back.
    // Posts below are hidden before you reach them; one you already scrolled past stays as it is.
    if (!art.closest(SEL.dialog) && art.getBoundingClientRect().top < 0) continue;
    const n = checks.get(art) ?? 0;
    if (n >= MAX_CHECKS) continue;
    checks.set(art, n + 1);
    if (hasExactLabel(art, SPONSORED_WORDS)) kinds.set(art, 'ad');
    else if (hasExactLabel(art, SUGGESTED_WORDS)) kinds.set(art, 'suggested');
    // Mute is for the Home feed only: a post you open yourself (popup, post page, profile) stays visible.
    else if (!isEmpty(mute) && currentRoute().kind === 'home' && !art.closest(SEL.dialog) && isMuted(mute, postAuthor(art), art.textContent ?? '')) kinds.set(art, 'muted');
  }
}

/** Tag a remounted post we collapsed before. True when it was one. */
function restore(art: HTMLElement): boolean {
  if (!collapsedPosts.size || art.closest(SEL.dialog)) return false;
  const code = shortcodeInRoot(art);
  const kind = code && collapsedPosts.get(code);
  if (!kind) return false;
  kinds.set(art, kind);
  return true;
}

/** Runs on every mutation (not throttled), so a remounted post never gets laid out at full height. */
function restoreMounted(records: MutationRecord[]) {
  if (!collapsedPosts.size) return;
  const s = getSettings();
  for (const r of records) {
    for (const node of r.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const arts = node.matches(SEL.article) ? [node] : node.querySelectorAll<HTMLElement>(SEL.article);
      for (const art of arts) {
        if (kinds.has(art) || !restore(art)) continue;
        const kind = kinds.get(art)!;
        if (s[SETTING_FOR[kind]]) hide(art, stylesFor(kind));
      }
    }
  }
}

let muteText = '';
let mute: MuteList = parseMuteList('');

/** On a new mute list, forget which posts were muted and look at every post again. */
function syncMute(s: Settings) {
  const text = s['declutter.muteWords'];
  if (text === muteText) return;
  muteText = text;
  mute = parseMuteList(text);
  for (const [el, kind] of kinds) {
    if (kind !== 'muted') continue;
    kinds.delete(el);
    if (el instanceof HTMLElement) show(el);
  }
  for (const [code, kind] of collapsedPosts) if (kind === 'muted') collapsedPosts.delete(code);
  checks = new WeakMap();
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
  if (main && !has('stories', main)) {
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

function tagProfile() {
  if (currentRoute().kind !== 'profile') return;
  const main = document.querySelector(SEL.main);
  if (!main || has('sidebar', main)) return;
  // Private profiles (and public ones after Follow) show a "Suggested for you" carousel under the
  // header. Climb from the heading to the block that sits next to the profile header.
  const heading = [...main.querySelectorAll('h1, h2, h3, h4, h5, h6, span')].find(
    (el) => !seen.has(el) && el.childElementCount === 0 && SUGGESTED_WORDS.includes(el.textContent?.trim() ?? '') && !el.closest(SEL.article),
  );
  if (!heading) return;
  seen.add(heading);
  let block: Element = heading;
  while (block.parentElement && block.parentElement !== main && !block.parentElement.querySelector('header')) block = block.parentElement;
  if (block !== heading && block.parentElement !== main) kinds.set(block, 'sidebar');
}

function hide(el: HTMLElement, styles: Record<string, string>) {
  if (hidden.has(el)) return;
  const prev = new Map<string, [string, string]>();
  for (const [prop, value] of Object.entries(styles)) {
    prev.set(prop, [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, 'important');
  }
  hidden.set(el, prev);
}

function show(el: HTMLElement) {
  const prev = hidden.get(el);
  if (!prev) return;
  hidden.delete(el);
  for (const [prop, [value, priority]] of prev) {
    if (value) el.style.setProperty(prop, value, priority);
    else el.style.removeProperty(prop);
  }
}

function apply(s: Settings) {
  for (const [el, kind] of kinds) {
    if (!el.isConnected) {
      kinds.delete(el);
      hidden.delete(el as HTMLElement);
    } else if (el instanceof HTMLElement) {
      if (s[SETTING_FOR[kind]]) {
        const fresh = !hidden.has(el);
        hide(el, stylesFor(kind));
        if (fresh && stylesFor(kind) === COLLAPSE && el.matches(SEL.article) && !el.closest(SEL.dialog)) {
          const code = shortcodeInRoot(el);
          if (code) collapsedPosts.set(code, kind);
        }
      } else show(el);
    }
  }
}

export const declutter: Feature = {
  id: 'declutter',
  isEnabled: (s) => Object.values(SETTING_FOR).some((k) => s[k]),
  start() {
    const off = onDomChange(() => {
      syncMute(getSettings());
      syncAnchoring(getSettings());
      tagFeed();
      tagNav();
      tagHome();
      tagProfile();
      apply(getSettings());
    });
    const mounts = new MutationObserver(restoreMounted);
    mounts.observe(document.documentElement, { childList: true, subtree: true });
    return () => {
      off();
      mounts.disconnect();
      collapsedPosts.clear();
      for (const el of [...hidden.keys()]) show(el);
      kinds.clear();
      checks = new WeakMap();
      seen = new WeakSet();
      muteText = '';
      mute = parseMuteList('');
      syncAnchoring(getSettings(), false);
    };
  },
  onSettings(s) {
    syncMute(s);
    syncAnchoring(s);
    tagFeed();
    apply(s);
  },
};
