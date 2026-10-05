import { currentRoute, onRouteChange } from '../core/router';
import type { Feature } from './types';

// Instagram's chronological feed of accounts you follow.
const FOLLOWING_URL = '/?variant=following';

const onFollowingFeed = () => new URLSearchParams(location.search).get('variant') === 'following';

/** Navigate inside Instagram's SPA (its router listens to popstate). A fresh state object is required:
 *  reusing Instagram's own state makes its router treat it as the current entry and ignore it. */
function spaNavigate(url: string, replace: boolean) {
  if (replace) history.replaceState({}, '', url);
  else history.pushState({}, '', url);
  dispatchEvent(new PopStateEvent('popstate', { state: {} }));
}

export const followingFeed: Feature = {
  id: 'following-feed',
  isEnabled: (s) => s['feed.followingOnly'],
  start() {
    const enforce = () => {
      if (currentRoute().kind === 'home' && !onFollowingFeed()) spaNavigate(FOLLOWING_URL, true);
    };

    // Home links (logo, Home tab) → straight to the Following feed, no flash of the "For you" feed.
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]');
      if (!a || a.getAttribute('href') !== '/') return;
      e.preventDefault();
      e.stopPropagation();
      spaNavigate(FOLLOWING_URL, false);
    };

    document.addEventListener('click', onClick, true);
    enforce();
    const off = onRouteChange(enforce);
    return () => {
      off();
      document.removeEventListener('click', onClick, true);
    };
  },
};
