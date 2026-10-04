import { getFriendshipPage, jitter, myUserId, type FriendUser } from '../core/api';
import { getSettings } from '../core/state';
import { h } from '../ui/dom';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';

type Kind = 'followers' | 'following';

interface Progress {
  followers: FriendUser[];
  following: FriendUser[];
  next: Record<Kind, string | undefined>;
  done: Record<Kind, boolean>;
  updatedAt: number;
}

type Tab = 'notBack' | 'fans' | 'followers' | 'following';

const TABS: { id: Tab; label: string }[] = [
  { id: 'notBack', label: "Don't follow back" },
  { id: 'fans', label: "You don't follow" },
  { id: 'followers', label: 'Followers' },
  { id: 'following', label: 'Following' },
];

const storageKey = (uid: string) => `unfollowers:${uid}`;

function emptyProgress(): Progress {
  return { followers: [], following: [], next: { followers: undefined, following: undefined }, done: { followers: false, following: false }, updatedAt: 0 };
}

function csv(users: FriendUser[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = users.map((u) => [u.username, u.full_name ?? '', `https://www.instagram.com/${u.username}/`, u.is_verified ? 'yes' : 'no', u.is_private ? 'yes' : 'no'].map(esc).join(','));
  return ['username,full_name,profile_url,verified,private', ...rows].join('\r\n');
}

function saveCsv(name: string, users: FriendUser[]) {
  const url = URL.createObjectURL(new Blob(['﻿' + csv(users)], { type: 'text/csv;charset=utf-8' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function openUnfollowers() {
  const uid = myUserId();
  if (!uid) {
    toast('Log in to Instagram first', 'error');
    return;
  }

  let running = false;
  let cancelled = false;
  let tab: Tab = 'notBack';
  let query = '';
  let data: Progress = ((await chrome.storage.local.get(storageKey(uid)))[storageKey(uid)] as Progress | undefined) ?? emptyProgress();

  const m = openModal('Unfollowers checker', { width: 560, onClose: () => (cancelled = true) });
  const status = h('p', { class: 'ige-muted', 'aria-live': 'polite' });
  const tabs = h('div', { class: 'ige-tabs', role: 'tablist' });
  const search = h('input', { class: 'ige-input', type: 'search', placeholder: 'Search username or name', 'aria-label': 'Search' });
  const list = h('div', { class: 'ige-userlist' });
  const runBtn = h('button', { class: 'ige-btn ige-btn--primary', type: 'button' }, 'Scan');
  const exportBtn = h('button', { class: 'ige-btn ige-btn--ghost', type: 'button' }, 'Export CSV');
  m.body.append(status, tabs, search, list);
  m.footer.append(exportBtn, runBtn);

  const sets = () => {
    const followerIds = new Set(data.followers.map((u) => u.pk));
    const followingIds = new Set(data.following.map((u) => u.pk));
    return {
      notBack: data.following.filter((u) => !followerIds.has(u.pk)),
      fans: data.followers.filter((u) => !followingIds.has(u.pk)),
      followers: data.followers,
      following: data.following,
    } satisfies Record<Tab, FriendUser[]>;
  };

  const complete = () => data.done.followers && data.done.following;

  const render = () => {
    const all = sets();
    tabs.replaceChildren(
      ...TABS.map((t) =>
        h('button', {
          class: `ige-tab${t.id === tab ? ' is-active' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': String(t.id === tab),
          onClick: () => {
            tab = t.id;
            render();
          },
        }, `${t.label} `, h('span', { class: 'ige-badge' }, String(all[t.id].length))),
      ),
    );
    const q = query.toLowerCase();
    const users = all[tab].filter((u) => !q || u.username.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q));
    list.replaceChildren(
      ...(users.length
        ? users.slice(0, 500).map((u) =>
            h('a', { class: 'ige-user', href: `/${u.username}/`, target: '_blank', rel: 'noopener' },
              h('img', { src: u.profile_pic_url, alt: '', loading: 'lazy' }),
              h('span', { class: 'ige-user__names' }, h('strong', {}, u.username + (u.is_verified ? ' ✓' : '')), h('span', {}, u.full_name ?? '')),
            ),
          )
        : [h('p', { class: 'ige-muted ige-empty' }, data.updatedAt ? 'Nobody here.' : 'Press Scan to load your followers and following.')]),
      ...(users.length > 500 ? [h('p', { class: 'ige-muted ige-empty' }, `Showing 500 of ${users.length}. Use search or export CSV for the rest.`)] : []),
    );
    if (!running) {
      status.textContent = data.updatedAt
        ? `${complete() ? 'Last scan' : 'Partial scan'}: ${new Date(data.updatedAt).toLocaleString()} · ${data.followers.length} followers · ${data.following.length} following`
        : 'Not scanned yet.';
      runBtn.textContent = complete() ? 'Rescan' : data.updatedAt ? 'Resume scan' : 'Scan';
    }
    exportBtn.disabled = !all[tab].length;
  };

  const persist = () => chrome.storage.local.set({ [storageKey(uid)]: data });

  async function scan() {
    if (running) {
      cancelled = true;
      return;
    }
    if (complete()) data = emptyProgress();
    running = true;
    cancelled = false;
    runBtn.textContent = 'Pause';
    const s = getSettings();
    try {
      for (const kind of ['following', 'followers'] as Kind[]) {
        const seen = new Set(data[kind].map((u) => u.pk));
        while (!data.done[kind]) {
          if (cancelled) return;
          const page = await getFriendshipPage(uid!, kind, data.next[kind]);
          for (const u of page.users) {
            if (seen.has(u.pk)) continue;
            seen.add(u.pk);
            data[kind].push(u);
          }
          data.next[kind] = page.next;
          data.done[kind] = !page.next;
          data.updatedAt = Date.now();
          await persist();
          status.textContent = `Loading ${kind}… ${data[kind].length}`;
          render();
          if (!data.done[kind]) await jitter(s['account.delayMin'], s['account.delayMax']);
        }
      }
      toast('Scan complete', 'success');
    } catch (e) {
      toast(`${(e as Error).message} Progress saved — resume later.`, 'error', 6000);
    } finally {
      running = false;
      render();
    }
  }

  runBtn.addEventListener('click', scan);
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  exportBtn.addEventListener('click', () => saveCsv(`instagram_${tab}_${new Date().toISOString().slice(0, 10)}.csv`, sets()[tab]));
  render();
}
