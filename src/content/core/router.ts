export type RouteKind = 'home' | 'post' | 'reel' | 'reels' | 'stories' | 'highlight' | 'profile' | 'explore' | 'direct' | 'other';

export interface Route {
  kind: RouteKind;
  shortcode?: string;
  username?: string;
  storyId?: string;
  highlightId?: string;
}

const RESERVED = new Set([
  'accounts', 'explore', 'direct', 'about', 'developer', 'legal', 'emails', 'challenge', 'stories', 'reels', 'reel', 'p', 'tv',
  'web', 'session', 'privacy', 'terms', 'press', 'api', 'graphql', 'oauth', 'nametag', 'lite', 'your_activity', 'notifications', 'threads',
]);

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  const [a, b, c] = parts;
  if (!a) return { kind: 'home' };
  if (a === 'p' || a === 'tv') return { kind: 'post', shortcode: b };
  if (a === 'reel' && b) return { kind: 'reel', shortcode: b };
  if (a === 'reels') return b ? { kind: 'reel', shortcode: b } : { kind: 'reels' };
  if (a === 'stories') {
    if (b === 'highlights' && c) return { kind: 'highlight', highlightId: c };
    if (b) return { kind: 'stories', username: b, storyId: c };
  }
  if (a === 'explore') return { kind: 'explore' };
  if (a === 'direct') return { kind: 'direct' };
  if (RESERVED.has(a)) return { kind: 'other' };
  // /{user}/p/{code}/ and /{user}/reel/{code}/
  if ((b === 'p' || b === 'reel') && c) return { kind: b === 'p' ? 'post' : 'reel', shortcode: c, username: a };
  return { kind: 'profile', username: a };
}

export function currentRoute(): Route {
  return parseRoute(location.pathname);
}

type Listener = (r: Route) => void;
const listeners = new Set<Listener>();
let lastHref = '';

function check() {
  if (location.href === lastHref) return;
  lastHref = location.href;
  const r = currentRoute();
  listeners.forEach((l) => l(r));
}

let started = false;
export function onRouteChange(l: Listener): () => void {
  listeners.add(l);
  if (!started) {
    started = true;
    lastHref = location.href;
    // Instagram is an SPA; pushState isn't observable from the isolated world, so poll cheaply.
    setInterval(check, 400);
    addEventListener('popstate', check);
  }
  return () => listeners.delete(l);
}
