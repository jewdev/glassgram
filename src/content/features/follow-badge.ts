import { getFriendship, getFriendshipDetails, getUserId, knownUser, myUserId, type Friendship, type FriendshipDetails } from '../core/api';
import { onDomChange } from '../core/observer';
import { currentRoute, onRouteChange } from '../core/router';
import { isOwnUi, SEL } from '../core/selectors';
import { h, shadowHost } from '../ui/dom';
import { openModal } from '../ui/modal';
import type { Feature } from './types';

/** `unknown`: Instagram's page data had no relationship; a click asks Instagram. */
type State = Friendship | 'own' | 'loading' | 'unknown' | 'error';

const BADGE_CLASS = 'ige-follow-badge';
/** The host is the flex item in Instagram's header row. */
const BADGE_HOST_CSS = ':host { display: inline-flex; align-self: center; flex: none; vertical-align: middle; }';
/** Instagram's profile query, which carries the relationship, may land a moment after navigation. */
const PAGE_DATA_WAITS = [0, 1200, 3000];

function describe(s: State): { text: string; kind: string; title: string } | null {
  if (s === 'own' || s === 'error') return null;
  if (s === 'loading') return { text: '…', kind: 'loading', title: 'Checking follow status' };
  if (s === 'unknown') return { text: 'Follow status?', kind: 'unknown', title: 'Click to check whether this account follows you' };
  if (s.following && s.followed_by) return { text: 'Follow each other', kind: 'mutual', title: 'You follow each other' };
  if (s.followed_by) return { text: 'Follows you', kind: 'follower', title: 'This account follows you' };
  if (s.following) return { text: "Doesn't follow you back", kind: 'notback', title: "You follow this account, but it doesn't follow you" };
  return { text: "Doesn't follow you", kind: 'none', title: "This account doesn't follow you" };
}

type Row = [label: string, on: boolean | undefined, onText?: string, offText?: string];

function detailRows(d: FriendshipDetails): { title: string; rows: Row[] }[] {
  return [
    {
      title: 'Following',
      rows: [
        ['You follow them', d.following || d.outgoing_request, d.following ? 'Yes' : 'Requested', 'No'],
        ['They follow you', d.followed_by || d.incoming_request, d.followed_by ? 'Yes' : 'Wants to follow you', 'No'],
      ],
    },
    {
      title: 'Your settings for them',
      rows: [
        ['Close friend', d.is_bestie],
        ['Favorite', d.is_feed_favorite],
        ['Posts muted', d.muting],
        ['Stories muted', d.is_muting_reel],
        ['Notes muted', d.is_muting_notes],
        ['Restricted', d.is_restricted],
        ['Your story hidden from them', d.is_blocking_reel],
        ['Blocked', d.blocking],
        ['Subscribed', d.subscribed],
      ],
    },
  ];
}

/** Full relationship breakdown, opened by clicking the badge. Always fetched fresh. */
async function openDetails(username: string) {
  const m = openModal(`You and @${username}`, { width: 380 });
  const loading = h('p', { class: 'ige-muted ige-empty' }, 'Loading…');
  m.body.append(loading);
  try {
    const d = await getFriendshipDetails(username);
    loading.remove();
    if (d.is_private) m.body.append(h('p', { class: 'ige-muted ige-sd__note' }, 'Private account'));
    for (const sec of detailRows(d)) {
      m.body.append(
        h(
          'section',
          { class: 'ige-sd__section' },
          h('h3', { class: 'ige-sd__title' }, sec.title),
          ...sec.rows.map(([label, on, onText = 'Yes', offText = 'No']) =>
            h('div', { class: 'ige-fs__row' }, h('span', {}, label), h('span', { class: on ? 'ige-fs__on' : 'ige-muted' }, on ? onText : offText)),
          ),
        ),
      );
    }
  } catch (e) {
    loading.className = 'ige-error ige-empty';
    loading.textContent = (e as Error).message || 'Could not load the relationship';
  }
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
    let badge: { host: HTMLElement; key: string; kind: string } | undefined;

    const removeBadge = () => {
      badge?.host.remove();
      badge = undefined;
    };

    /** From Instagram's page data only: visiting a profile sends no request of ours. */
    const load = async (username: string, waits = PAGE_DATA_WAITS) => {
      const key = username.toLowerCase();
      const prev = states.get(key);
      if (!prev) states.set(key, 'loading');
      render();
      // A re-check that finds nothing keeps what we knew.
      let state: State = prev && prev !== 'loading' ? prev : 'unknown';
      for (const wait of waits) {
        if (wait) await new Promise((r) => setTimeout(r, wait));
        const known = await knownUser(username);
        if (known && known.id === myUserId()) state = 'own';
        else if (known?.fs) state = known.fs;
        else continue;
        break;
      }
      states.set(key, state);
      render();
    };

    /** Asks Instagram, on a click on "Follow status?". */
    const lookUp = async (username: string) => {
      const key = username.toLowerCase();
      states.set(key, 'loading');
      render();
      try {
        const [id, rel] = await Promise.all([getUserId(username), getFriendship(username)]);
        states.set(key, id === myUserId() ? 'own' : rel);
      } catch (e) {
        console.debug('[IGE] follow status failed', e);
        states.set(key, 'error');
      }
      render();
    };

    function render() {
      const r = currentRoute();
      if (badge && (!r.username || badge.key !== r.username.toLowerCase())) removeBadge();
      if (r.kind !== 'profile' || !r.username) return;
      const key = r.username.toLowerCase();
      const state = states.get(key);
      if (state === undefined) {
        load(r.username);
        return;
      }
      const info = describe(state);
      if (!info) {
        removeBadge();
        return;
      }
      if (badge?.host.isConnected && badge.kind === info.kind) return;
      const anchor = usernameAnchor(r.username);
      if (!anchor) return;
      removeBadge();
      const username = r.username;
      const open = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (states.get(key) === 'unknown') lookUp(username);
        else openDetails(username);
      };
      const inner = h(
        'span',
        {
          class: `ige-root ${BADGE_CLASS} ${BADGE_CLASS}--${info.kind}`,
          title: state === 'unknown' ? info.title : `${info.title}. Click for details.`,
          role: 'button',
          tabindex: '0',
          onClick: open,
          onKeydown: (e: KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && open(e),
        },
        info.text,
      );
      badge = { host: shadowHost('span', inner, BADGE_HOST_CSS), key, kind: info.kind };
      anchor.insertAdjacentElement('afterend', badge.host);
    }

    // Follow / unfollow clicks in the header change the relationship; Instagram's own response
    // updates its page data, so re-read that shortly after.
    const onClick = (e: MouseEvent) => {
      const r = currentRoute();
      if (r.kind !== 'profile' || !r.username) return;
      const target = e.target as Element | null;
      if (isOwnUi(target) || !target?.closest?.('header button, header [role="button"]')) return;
      clearTimeout(refreshTimer);
      const username = r.username;
      refreshTimer = window.setTimeout(() => load(username, [0, 1500]), 1500);
    };
    document.addEventListener('click', onClick, true);

    const offDom = onDomChange(render);
    const offRoute = onRouteChange(render);
    return () => {
      offDom();
      offRoute();
      clearTimeout(refreshTimer);
      document.removeEventListener('click', onClick, true);
      removeBadge();
    };
  },
};
