import { ApiError, cooldownLeft, getFriendshipPage, myUserId, startCooldown, type FriendUser } from '../core/api';
import { getSettings } from '../core/state';
import { h } from '../ui/dom';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import {
  BLOCKED_COOLDOWN_MS,
  CHANGE_KINDS,
  CHANGE_LABELS,
  MAX_RETRIES,
  PAGE_SAFETY_LIMIT,
  PAGES_BEFORE_LONG_PAUSE,
  addEntry,
  csvCell,
  diffScans,
  hasChanges,
  historyCsv,
  longPauseMs,
  pageDelayMs,
  retryWaitS,
  snapshot,
  userIndex,
  type HistoryEntry,
  type MiniUser,
  type Snapshot,
} from './unfollowers-history';

type Kind = 'followers' | 'following';

interface Progress {
  followers: FriendUser[];
  following: FriendUser[];
  next: Record<Kind, string | undefined>;
  done: Record<Kind, boolean>;
  /** Pages read so far per list; missing in progress saved by older versions. */
  pages?: Record<Kind, number>;
  updatedAt: number;
}

type Tab = 'notBack' | 'fans' | 'followers' | 'following' | 'changes';

const TABS: { id: Tab; label: string }[] = [
  { id: 'notBack', label: "Don't follow back" },
  { id: 'fans', label: "You don't follow" },
  { id: 'followers', label: 'Followers' },
  { id: 'following', label: 'Following' },
  { id: 'changes', label: 'Changes' },
];

/** Lists are read in the upstream script's order: followers first, then the accounts you follow. */
const ORDER: Kind[] = ['followers', 'following'];
const MAX_ROWS = 500;

const storageKey = (uid: string) => `unfollowers:${uid}`;
/** The last complete scan, kept while a rescan runs so the new one can be compared with it. */
const baseKey = (uid: string) => `unfollowers:base:${uid}`;
const historyKey = (uid: string) => `unfollowers:history:${uid}`;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function emptyProgress(): Progress {
  return { followers: [], following: [], next: { followers: undefined, following: undefined }, done: { followers: false, following: false }, pages: { followers: 0, following: 0 }, updatedAt: 0 };
}

export function csv(users: FriendUser[]): string {
  // Names are chosen by other people: csvCell keeps a leading = + - @ (or tab/CR) from running as a formula.
  const rows = users.map((u) => [u.username, u.full_name ?? '', `https://www.instagram.com/${u.username}/`, u.is_verified ? 'yes' : 'no', u.is_private ? 'yes' : 'no'].map(csvCell).join(','));
  return ['username,full_name,profile_url,verified,private', ...rows].join('\r\n');
}

function saveCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
  // A detached link downloads just the same, without showing up in Instagram's DOM.
  h('a', { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '±0');

function userRow(u: MiniUser & { profile_pic_url?: string }) {
  return h('a', { class: 'ige-user', href: `/${u.username}/`, target: '_blank', rel: 'noopener' },
    u.profile_pic_url
      ? h('img', { src: u.profile_pic_url, alt: '', loading: 'lazy' })
      : h('span', { class: 'ige-user__initial', 'aria-hidden': 'true' }, (u.username[0] ?? '?').toUpperCase()),
    h('span', { class: 'ige-user__names' }, h('strong', {}, u.username + (u.is_verified ? ' ✓' : '')), h('span', {}, u.full_name ?? '')),
  );
}

export async function openUnfollowers() {
  const me = myUserId();
  if (!me) {
    toast('Log in to Instagram first', 'error');
    return;
  }
  const uid: string = me;

  let running = false;
  let cancelled = false;
  let tab: Tab = 'notBack';
  let query = '';
  const stored = await chrome.storage.local.get([storageKey(uid), baseKey(uid), historyKey(uid)]);
  let data: Progress = (stored[storageKey(uid)] as Progress | undefined) ?? emptyProgress();
  let base = stored[baseKey(uid)] as Snapshot | undefined;
  let history = (stored[historyKey(uid)] as HistoryEntry[] | undefined) ?? [];

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
    // By id or username, like the upstream script, so nobody is listed by mistake.
    const isFollower = userIndex(data.followers);
    const isFollowing = userIndex(data.following);
    return {
      notBack: data.following.filter((u) => !isFollower(u)),
      fans: data.followers.filter((u) => !isFollowing(u)),
      followers: data.followers,
      following: data.following,
    } satisfies Record<Exclude<Tab, 'changes'>, FriendUser[]>;
  };

  const complete = () => data.done.followers && data.done.following;
  const matches = (q: string) => (u: MiniUser) => !q || u.username.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q);

  const renderChanges = (q: string): Node[] => {
    if (!history.length) {
      return [h('p', { class: 'ige-muted ige-empty' }, 'Changes show up here from your second full scan on. Each scan is compared with the one before it.')];
    }
    const out: Node[] = [];
    let rows = 0;
    for (const e of history) {
      const when = new Date(e.at).toLocaleString();
      if (e.prevAt === undefined) {
        if (!q) out.push(h('p', { class: 'ige-hist__head' }, h('strong', {}, when), ` · First scan: ${e.followers} followers · ${e.following} following`));
        continue;
      }
      const groups = CHANGE_KINDS.map((kind) => ({ kind, users: e[kind].filter(matches(q)) })).filter((g) => g.users.length);
      if (q && !groups.length) continue;
      out.push(
        h('p', { class: 'ige-hist__head' },
          h('strong', {}, when),
          ` · ${e.followers} followers (${signed(e.gained.length - e.lost.length)}) · ${e.following} following (${signed(e.followed.length - e.unfollowed.length)})`,
        ),
      );
      if (!hasChanges(e)) out.push(h('p', { class: 'ige-muted ige-hist__none' }, 'No changes since the scan before.'));
      for (const g of groups) {
        out.push(h('p', { class: 'ige-hist__group' }, `${CHANGE_LABELS[g.kind]} (${g.users.length})`));
        for (const u of g.users) {
          if (rows++ >= MAX_ROWS) {
            out.push(h('p', { class: 'ige-muted ige-empty' }, `Showing the first ${MAX_ROWS} changes. Use search or export CSV for the rest.`));
            return out;
          }
          out.push(userRow(u));
        }
      }
    }
    return out.length ? out : [h('p', { class: 'ige-muted ige-empty' }, 'Nobody here.')];
  };

  const render = () => {
    const all = sets();
    const latest = history[0];
    const count = (id: Tab) => (id === 'changes' ? (latest?.prevAt !== undefined ? latest.lost.length : 0) : all[id].length);
    tabs.replaceChildren(
      ...TABS.map((t) =>
        h('button', {
          class: `ige-tab${t.id === tab ? ' is-active' : ''}`,
          type: 'button',
          role: 'tab',
          'aria-selected': String(t.id === tab),
          title: t.id === 'changes' ? 'The number is how many unfollowed you since the scan before the last one' : undefined,
          onClick: () => {
            tab = t.id;
            render();
          },
        }, `${t.label} `, h('span', { class: 'ige-badge' }, String(count(t.id)))),
      ),
    );
    const q = query.toLowerCase();
    if (tab === 'changes') {
      list.replaceChildren(...renderChanges(q));
      exportBtn.disabled = !history.some(hasChanges);
    } else {
      const users = all[tab].filter(matches(q));
      list.replaceChildren(
        ...(users.length
          ? users.slice(0, MAX_ROWS).map(userRow)
          : [h('p', { class: 'ige-muted ige-empty' }, data.updatedAt ? 'Nobody here.' : 'Press Scan to load your followers and following.')]),
        ...(users.length > MAX_ROWS ? [h('p', { class: 'ige-muted ige-empty' }, `Showing ${MAX_ROWS} of ${users.length}. Use search or export CSV for the rest.`)] : []),
      );
      exportBtn.disabled = !all[tab].length;
    }
    if (!running) {
      status.textContent = data.updatedAt
        ? `${complete() ? 'Last scan' : 'Partial scan'}: ${new Date(data.updatedAt).toLocaleString()} · ${data.followers.length} followers · ${data.following.length} following`
        : 'Not scanned yet.';
      runBtn.textContent = complete() ? 'Rescan' : data.updatedAt ? 'Resume scan' : 'Scan';
    }
  };

  const persist = () => chrome.storage.local.set({ [storageKey(uid)]: data });

  /** Waits `ms`, showing a countdown, and stops early when the scan is paused or the panel closed. */
  const wait = async (ms: number, label?: (secondsLeft: number) => string) => {
    const end = Date.now() + ms;
    while (!cancelled && Date.now() < end) {
      if (label) status.textContent = label(Math.ceil((end - Date.now()) / 1000));
      await sleep(Math.min(label ? 1000 : ms, end - Date.now()));
    }
  };

  /** One page, retried up to 3 times on a rate limit (30, 60, 90 s) or a network error (5, 10, 15 s). */
  const fetchPage = async (kind: Kind) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await getFriendshipPage(uid, kind, data.next[kind]);
      } catch (e) {
        const limited = e instanceof ApiError && e.rateLimited;
        const network = e instanceof TypeError;
        // Another tab or feature started a cooldown: waiting here would only knock on the door again.
        if (!(limited || network) || (await cooldownLeft()) > 0) throw e;
        if (attempt >= MAX_RETRIES) {
          if (!limited) throw new Error('Could not reach Instagram.');
          startCooldown(BLOCKED_COOLDOWN_MS);
          throw new Error(`Instagram kept rate-limiting the scan, so Glassgram paused its requests for ${BLOCKED_COOLDOWN_MS / 60000} minutes.`);
        }
        const reason = limited ? 'Instagram asked to slow down' : 'Network error';
        await wait(retryWaitS(attempt + 1, limited) * 1000, (s) => `${reason}. Retry ${attempt + 1} of ${MAX_RETRIES} in ${s} s…`);
        if (cancelled) return null;
      }
    }
  };

  async function finish() {
    const entry = diffScans(base, snapshot(data.updatedAt, data.followers, data.following));
    history = addEntry(history, entry);
    base = undefined;
    await chrome.storage.local.set({ [historyKey(uid)]: history });
    await chrome.storage.local.remove(baseKey(uid));
    if (entry.prevAt === undefined) return toast('Scan complete. The next scan will show who unfollowed you.', 'success', 5000);
    const parts = [
      entry.lost.length && `${entry.lost.length} unfollowed you`,
      entry.gained.length && `${entry.gained.length} new follower${entry.gained.length === 1 ? '' : 's'}`,
    ].filter(Boolean);
    toast(parts.length ? `Scan complete: ${parts.join(', ')}.` : hasChanges(entry) ? 'Scan complete. See Changes.' : 'Scan complete. No changes since last time.', 'success', 6000);
  }

  async function scan() {
    if (running) {
      cancelled = true;
      return;
    }
    const blocked = await cooldownLeft();
    if (blocked) {
      toast(`Instagram rate-limited Glassgram recently. Try again in ${Math.ceil(blocked / 60000)} min.`, 'error', 6000);
      return;
    }
    if (complete()) {
      base = snapshot(data.updatedAt, data.followers, data.following);
      await chrome.storage.local.set({ [baseKey(uid)]: base });
      data = emptyProgress();
    }
    data.pages ??= { followers: Math.ceil(data.followers.length / 50), following: Math.ceil(data.following.length / 50) };
    running = true;
    cancelled = false;
    runBtn.textContent = 'Pause';
    const s = getSettings();
    let sinceLongPause = 0;
    try {
      for (const kind of ORDER) {
        const seen = new Set(data[kind].map((u) => u.pk));
        while (!data.done[kind]) {
          if (cancelled) return;
          const page = await fetchPage(kind);
          if (!page) return;
          for (const u of page.users) {
            if (seen.has(u.pk)) continue;
            seen.add(u.pk);
            data[kind].push(u);
          }
          data.next[kind] = page.next;
          data.done[kind] = !page.next;
          data.pages[kind]++;
          data.updatedAt = Date.now();
          await persist();
          status.textContent = `Loading ${kind}… ${data[kind].length}`;
          render();
          if (data.done[kind]) break;
          if (data.pages[kind] >= PAGE_SAFETY_LIMIT) {
            throw new Error(`Stopped: your ${kind} list is longer than ${(PAGE_SAFETY_LIMIT * 50).toLocaleString()} accounts.`);
          }
          await wait(pageDelayMs(s['account.scanDelay'] * 1000));
          if (++sinceLongPause >= PAGES_BEFORE_LONG_PAUSE) {
            sinceLongPause = 0;
            await wait(longPauseMs(s['account.scanPause'] * 1000), (left) => `Safety pause, ${left} s… (${data[kind].length} ${kind} so far)`);
          }
        }
      }
      if (complete()) await finish();
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
  exportBtn.addEventListener('click', () => {
    const day = new Date().toISOString().slice(0, 10);
    if (tab === 'changes') saveCsv(`instagram_changes_${day}.csv`, historyCsv(history));
    else saveCsv(`instagram_${tab}_${day}.csv`, csv(sets()[tab]));
  });
  render();
}
