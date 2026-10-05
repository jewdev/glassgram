// Every DOM assumption about Instagram's markup lives here.
// Instagram uses obfuscated, frequently changing class names, so we only rely on
// tags, roles, hrefs and attributes. Patch this file when Instagram changes.

export const SHORTCODE_RE = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]{5,})/;

export const SEL = {
  article: 'article',
  dialog: 'div[role="dialog"]',
  main: 'main',
  postLink: 'a[href*="/p/"], a[href*="/reel/"], a[href*="/tv/"]',
  time: 'time[datetime]',
  profileHeader: 'main header, header',
  reelsNav: 'a[href="/reels/"]',
  exploreNav: 'a[href="/explore/"]',
  threadsLink: 'a[href*="threads.net"], a[href*="threads.com"]',
  sidebarSuggestionsLink: 'a[href="/explore/people/"]',
};

/** Words Instagram uses to label ads / suggestions (a few common locales). */
export const SPONSORED_WORDS = ['Sponsored', 'Paid partnership', 'Gesponsert', 'Sponsorisé', 'Patrocinado', 'Sponsorizzato', 'Реклама', 'ממומן', 'Gesponsord', 'Sponsorlu'];
export const SUGGESTED_WORDS = ['Suggested for you', 'Suggested posts', 'Suggested reels', 'Vorgeschlagen für dich', 'Suggestions pour vous', 'Sugerencias para ti', 'Suggeriti per te', 'הצעות בשבילך'];

/** aria-labels of the story viewer's play/pause toggle icon (a few common locales). */
export const STORY_PAUSE_LABELS = ['Pause', 'Pausieren', 'Pausar', 'Metti in pausa', 'Pauzeren', 'Пауза', 'השהיה', 'Duraklat'];
export const STORY_PLAY_LABELS = ['Play', 'Abspielen', 'Lire', 'Reproducir', 'Riproduci', 'Afspelen', 'Воспроизвести', 'הפעלה', 'Oynat'];

/** Comment GIFs are served through Instagram's Giphy proxy; post media never is. */
export const COMMENT_GIF_HOST = 'fbsbx.com';

export function isCommentGif(el: Element): el is HTMLImageElement {
  if (!(el instanceof HTMLImageElement) || el.closest('a')) return false;
  try {
    return new URL(el.currentSrc || el.src).hostname.endsWith(COMMENT_GIF_HOST);
  } catch {
    return false;
  }
}

export function shortcodeFromHref(href: string | null | undefined): string | undefined {
  return href?.match(SHORTCODE_RE)?.[1];
}

/** Find the shortcode of the post containing `el` (feed article). */
export function shortcodeInRoot(root: Element): string | undefined {
  // Prefer the timestamp link — it always points at the post itself.
  const timeLink = root.querySelector('a time')?.closest('a');
  const fromTime = shortcodeFromHref(timeLink?.getAttribute('href'));
  if (fromTime) return fromTime;
  for (const a of root.querySelectorAll<HTMLAnchorElement>(SEL.postLink)) {
    const sc = shortcodeFromHref(a.getAttribute('href'));
    if (sc) return sc;
  }
  return undefined;
}

/**
 * False for elements hidden behind an open popup (post modal, menus). elementsFromPoint lists
 * everything under the cursor, including the page behind a modal, so callers must filter with this.
 */
export function isOnTopLayer(el: Element): boolean {
  const dialogs = [...document.querySelectorAll(SEL.dialog)].filter((d) => {
    const r = d.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  return !dialogs.length || dialogs.some((d) => d.contains(el));
}

export function isOwnUi(el: Element | null): boolean {
  return !!el?.closest('.ige-root');
}

export function textMatches(el: Element, words: string[]): boolean {
  const t = el.textContent ?? '';
  return words.some((w) => t.includes(w));
}
