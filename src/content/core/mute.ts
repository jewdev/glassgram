// Mute list for the feed: "@name" entries mute an account, everything else is a word or phrase
// matched against the post's text (caption, hashtags) as a whole word, ignoring case.

export interface MuteList {
  accounts: Set<string>;
  words: RegExp[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Parse the comma- or newline-separated setting text. */
export function parseMuteList(text: string): MuteList {
  const accounts = new Set<string>();
  const words: RegExp[] = [];
  for (const raw of text.split(/[,\n]/)) {
    const entry = raw.trim();
    if (!entry) continue;
    if (entry.startsWith('@')) {
      const name = entry.slice(1).trim().toLowerCase();
      if (name) accounts.add(name);
      continue;
    }
    // Whole words only: "cat" mutes "cat" and "#cat", not "category". Works for any script.
    words.push(new RegExp(`(?<![\\p{L}\\p{N}_])${escape(entry)}(?![\\p{L}\\p{N}_])`, 'iu'));
  }
  return { accounts, words };
}

export function isEmpty(list: MuteList): boolean {
  return !list.accounts.size && !list.words.length;
}

/** True when a post by `author` with this text should be hidden. */
export function isMuted(list: MuteList, author: string | undefined, text: string): boolean {
  if (author && list.accounts.has(author.toLowerCase())) return true;
  return list.words.some((re) => re.test(text));
}

/** The post's author: the first link to a profile in it (the header; "Liked by" links come later). */
export function postAuthor(root: Element): string | undefined {
  for (const a of root.querySelectorAll('a[href^="/"]')) {
    const m = a.getAttribute('href')?.match(/^\/([A-Za-z0-9._]+)\/$/);
    if (m && m[1] !== 'explore' && m[1] !== 'reels') return m[1];
  }
  return undefined;
}
