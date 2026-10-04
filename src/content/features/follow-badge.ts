import { getFriendship, getUserId, myUserId, type Friendship } from '../core/api';
import { onDomChange } from '../core/observer';
import { currentRoute, onRouteChange } from '../core/router';
import { SEL } from '../core/selectors';
import { h } from '../ui/dom';
import type { Feature } from './types';

type State = Friendship | 'own' | 'loading' | 'error';

const BADGE_CLASS = 'ige-follow-badge';

function describe(s: State): { text: string; kind: string; title: string } | null {
  if (s === 'own' || s === 'error') return null;
  if (s === 'loading') return { text: '…', kind: 'loading', title: 'Checking follow status' };
  if (s.following && s.followed_by) return { text: 'Follow each other', kind: 'mutual', title: 'You follow each other' };
  if (s.followed_by) return { text: 'Follows you', kind: 'follower', title: 'This account follows you' };
  if (s.following) return { text: "Doesn't follow you back", kind: 'notback', title: "You follow this account, but it doesn't follow you" };
  return { text: "Doesn't follow you", kind: 'none', title: "This account doesn't follow you" };
}

/** The visible username element in the profile header (a span inside h2, inside a link). */
function usernameAnchor(username: string): Element | null {
  const header = document.querySelector(`${SEL.main} header`) ?? document.querySelector('header');
  if (!header) return null;
  const target = username.toLowerCase();
  for (const el of header.querySelectorAll('h1, h2, span')) {
    if (el.childElementCount || el.textContent?.trim().toLowerCase() !== target) continue;
    if (el.getBoundingClientRect().width === 0) continue;
    return el.closest('a') ?? el.closest('h1, h2') ?? el;
  }
  return null;
}

export const followBadge: Feature = {
  id: 'follow-badge',
  isEnabled: (s) => s['profile.followBadge'],
  start() {
    const states = new Map<string, State>();
    let refreshTimer: number | undefined;

    const load = async (username: string, fresh = false) => {
      const key = username.toLowerCase();
      if (!fresh) states.set(key, 'loading');
      render();
      try {
        const [id, rel] = await Promise.all([getUserId(username), getFriendship(username, fresh)]);
        states.set(key, id === myUserId() ? 'own' : rel);
      } catch (e) {
        console.debug('[IGE] follow status failed', e);
        states.set(key, 'error');
      }
      render();
    };

    function render() {
      const r = currentRoute();
      document.querySelectorAll(`.${BADGE_CLASS}`).forEach((b) => {
        if (!r.username || b.getAttribute('data-user') !== r.username.toLowerCase()) b.remove();
      });
      if (r.kind !== 'profile' || !r.username) return;
      const key = r.username.toLowerCase();
      const state = states.get(key);
      if (state === undefined) {
        load(r.username);
        return;
      }
      const info = describe(state);
      const existing = document.querySelector<HTMLElement>(`.${BADGE_CLASS}[data-user="${CSS.escape(key)}"]`);
      if (!info) {
        existing?.remove();
        return;
      }
      if (existing?.isConnected && existing.dataset.kind === info.kind) return;
      const anchor = usernameAnchor(r.username);
      if (!anchor) return;
      existing?.remove();
      const badge = h('span', { class: `ige-root ${BADGE_CLASS} ${BADGE_CLASS}--${info.kind}`, title: info.title, 'data-user': key, 'data-kind': info.kind }, info.text);
      anchor.insertAdjacentElement('afterend', badge);
    }

    // Follow / unfollow clicks in the header change the relationship → re-check shortly after.
    const onClick = (e: MouseEvent) => {
      const r = currentRoute();
      if (r.kind !== 'profile' || !r.username) return;
      if (!(e.target as Element | null)?.closest?.('header button, header [role="button"]')) return;
      clearTimeout(refreshTimer);
      const username = r.username;
      refreshTimer = window.setTimeout(() => load(username, true), 1500);
    };
    document.addEventListener('click', onClick, true);

    const offDom = onDomChange(render);
    const offRoute = onRouteChange(render);
    return () => {
      offDom();
      offRoute();
      clearTimeout(refreshTimer);
      document.removeEventListener('click', onClick, true);
      document.querySelectorAll(`.${BADGE_CLASS}`).forEach((b) => b.remove());
    };
  },
};
