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

export function isOwnUi(el: Element | null): boolean {
  return !!el?.closest('.ige-root');
}

export function textMatches(el: Element, words: string[]): boolean {
  const t = el.textContent ?? '';
  return words.some((w) => t.includes(w));
}
