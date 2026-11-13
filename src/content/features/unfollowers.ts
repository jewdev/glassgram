import { ApiError, cooldownLeft, getFriendshipPage, myUserId, startCooldown, unfollowUser, type FriendUser, type UnfollowOutcome } from '../core/api';
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
  isUnseen,
  longPauseMs,
  newFollowersText,
  pageDelayMs,
  retryWaitS,
  snapshot,
  userIndex,
  type ChangeKind,
  type HistoryEntry,
  type MiniUser,
  type Snapshot,
} from './unfollowers-history';
import { UNFOLLOWS_BEFORE_PAUSE, clock, formatDuration, unfollowDelayMs, unfollowEtaMs } from './unfollow-pacing';

type Kind = 'followers' | 'following';

interface Progress {
  followers: FriendUser[];
  following: FriendUser[];
  next: Record<Kind, string | undefined>;
  done: Record<Kind, boolean>;
  /** Pages read so far per list; missing in progress saved by older versions. */
  pages?: Record<Kind, number>;
  /**
   * Ids unfollowed from this panel since the scan. Left out of the lists but kept in the scan itself,
   * so the next scan lists them under "You unfollowed".
   */
  unfollowed?: string[];
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
/** Time of the newest scan whose changes the user has looked at. */
const seenKey = (uid: string) => `unfollowers:seen:${uid}`;
/** Accounts the user chose to keep: never selected for unfollowing. */
const keepKey = (uid: string) => `unfollowers:keep:${uid}`;

/** Tabs listing accounts you follow, so they can be picked for unfollowing. */
const PICK_TABS: Tab[] = ['notBack', 'following'];
/** The queue stops after this many unfollows in a row fail: something changed on Instagram's side. */
const MAX_FAILS_IN_A_ROW = 3;

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
  let unfollowing = false;
  let cancelled = false;
  let tab: Tab = 'notBack';
  let query = '';
  /** Changes tab narrowed to one kind of change, picked from the summary card. */
  let kindFilter: ChangeKind | null = null;
  const stored = await chrome.storage.local.get([storageKey(uid), baseKey(uid), historyKey(uid), keepKey(uid), seenKey(uid)]);
  let seenAt = stored[seenKey(uid)] as number | undefined;
  let data: Progress = (stored[storageKey(uid)] as Progress | undefined) ?? emptyProgress();
  let base = stored[baseKey(uid)] as Snapshot | undefined;
  let history = (stored[historyKey(uid)] as HistoryEntry[] | undefined) ?? [];
  const keep = new Set((stored[keepKey(uid)] as string[] | undefined) ?? []);
  const selected = new Set<string>();

  const m = openModal('Unfollowers checker', { width: 560, onClose: () => (cancelled = true) });
  const status = h('p', { class: 'ige-muted', 'aria-live': 'polite' });
  const summary = h('div', { class: 'ige-summary' });
  summary.hidden = true;
  const tabs = h('div', { class: 'ige-tabs', role: 'tablist' });
  const search = h('input', { class: 'ige-input', type: 'search', placeholder: 'Search username or name', 'aria-label': 'Search' });
  const list = h('div', { class: 'ige-userlist' });
  const runBtn = h('button', { class: 'ige-btn ige-btn--primary', type: 'button' }, 'Scan');
  const exportBtn = h('button', { class: 'ige-btn ige-btn--ghost', type: 'button' }, 'Export CSV');
  const unfollowBtn = h('button', { class: 'ige-btn ige-btn--danger is-hidden', type: 'button' }, 'Unfollow');
  const pickAllBtn = h('button', { class: 'ige-btn ige-btn--ghost ige-btn--sm', type: 'button' }, 'Select all');
  const pickCount = h('span', { class: 'ige-muted', 'aria-live': 'polite' });
  const pickBar = h('div', { class: 'ige-pickbar' }, pickAllBtn, pickCount);
  const confirmBox = h('div', { class: 'ige-warn ige-confirm', role: 'alert' });
  confirmBox.hidden = true;
  m.body.append(status, summary, tabs, search, pickBar, confirmBox, list);
  m.footer.append(exportBtn, unfollowBtn, runBtn);

  const sets = () => {
    // By id or username, like the upstream script, so nobody is listed by mistake.
    const gone = new Set(data.unfollowed ?? []);
    const following = gone.size ? data.following.filter((u) => !gone.has(u.pk)) : data.following;
    const isFollower = userIndex(data.followers);
    const isFollowing = userIndex(following);
    return {
      notBack: following.filter((u) => !isFollower(u)),
      fans: data.followers.filter((u) => !isFollowing(u)),
      followers: data.followers,
      following,
    } satisfies Record<Exclude<Tab, 'changes'>, FriendUser[]>;
  };

  const complete = () => data.done.followers && data.done.following;
  const matches = (q: string) => (u: MiniUser) => !q || u.username.toLowerCase().includes(q) || (u.full_name ?? '').toLowerCase().includes(q);

  const renderChanges = (q: string): Node[] => {
    if (!history.length) {
      return [h('p', { class: 'ige-muted ige-empty' }, 'Changes show up here from your second full scan on. Each scan is compared with the one before it.')];
    }
    const out: Node[] = [];
    const kinds = kindFilter ? [kindFilter] : CHANGE_KINDS;
    // A summary chip counts the newest scan only, so its list shows that scan and nothing older.
    const entries = kindFilter ? history.slice(0, 1) : history;
    if (kindFilter) {
      const since = history[0].prevAt !== undefined ? new Date(history[0].prevAt).toLocaleDateString() : '';
      out.push(
        h('div', { class: 'ige-pickbar ige-hist__filter' },
          h('strong', {}, since ? `${CHANGE_LABELS[kindFilter]} since your scan on ${since}` : CHANGE_LABELS[kindFilter]),
          h('button', {
            class: 'ige-btn ige-btn--ghost ige-btn--sm',
            type: 'button',
            onClick: () => {
              kindFilter = null;
              render();
            },
          }, 'Show all changes'),
        ),
      );
    }
    let rows = 0;
    for (const e of entries) {
      const when = new Date(e.at).toLocaleString();
      if (e.prevAt === undefined) {
        if (!q && !kindFilter) out.push(h('p', { class: 'ige-hist__head' }, h('strong', {}, when), ` · First scan: ${e.followers} followers · ${e.following} following`));
        continue;
      }
      const groups = kinds.map((kind) => ({ kind, users: e[kind].filter(matches(q)) })).filter((g) => g.users.length);
      if ((q || kindFilter) && !groups.length) continue;
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
    return out.length > (kindFilter ? 1 : 0) ? out : [...out, h('p', { class: 'ige-muted ige-empty' }, 'Nobody here.')];
  };

  /** Remembers that the newest scan's changes were looked at. */
  const markSeen = () => {
    const latest = history[0];
    if (!latest || latest.at === seenAt) return;
    seenAt = latest.at;
    void chrome.storage.local.set({ [seenKey(uid)]: seenAt });
  };

  /** What changed since the scan before the last one, with links to each list. */
  const renderSummary = () => {
    const latest = history[0];
    summary.hidden = !latest || latest.prevAt === undefined;
    if (!latest || latest.prevAt === undefined) return;
    const fresh = isUnseen(history, seenAt);
    summary.classList.toggle('is-new', fresh);
    const since = new Date(latest.prevAt).toLocaleDateString();
    const chip = (kind: ChangeKind, text: (n: number) => string) => {
      const n = latest[kind].length;
      return h('button', {
        class: `ige-summary__chip${kind === 'lost' ? ' ige-summary__chip--lost' : ''}`,
        type: 'button',
        disabled: !n,
        onClick: () => {
          tab = 'changes';
          kindFilter = kind;
          query = '';
          search.value = '';
          markSeen();
          render();
        },
      }, text(n));
    };
    const own = [latest.unfollowed.length && `You unfollowed ${latest.unfollowed.length}`, latest.followed.length && `You followed ${latest.followed.length}`].filter(Boolean);
    summary.replaceChildren(
      h('p', { class: 'ige-summary__head' },
        hasChanges(latest) ? `Since your scan on ${since}` : `No changes since your scan on ${since}`,
        ...(fresh ? [h('span', { class: 'ige-summary__new' }, 'New')] : []),
      ),
      ...(hasChanges(latest)
        ? [
            h('div', { class: 'ige-summary__chips' },
              chip('lost', (n) => `${n} unfollowed you`),
              chip('gained', newFollowersText),
            ),
          ]
        : []),
      ...(own.length ? [h('p', { class: 'ige-muted ige-summary__own' }, own.join(' · '))] : []),
    );
  };

  const render = () => {
    const all = sets();
    const latest = history[0];
    renderSummary();
    const count = (id: Tab) => (id === 'changes' ? (latest?.prevAt !== undefined ? latest.lost.length : 0) : all[id].length);
    const unseen = isUnseen(history, seenAt);
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
            kindFilter = null;
            // Seen when you open the tab, not on every redraw: a scan that ends while the tab is open stays New.
            if (tab === 'changes') markSeen();
            render();
          },
        },
        `${t.label} `,
        h('span', { class: 'ige-badge' }, String(count(t.id))),
        ...(t.id === 'changes' && unseen ? [h('span', { class: 'ige-dot', title: 'New changes' })] : [])),
      ),
    );
    const q = query.toLowerCase();
    if (tab === 'changes') {
      list.replaceChildren(...renderChanges(q));
      exportBtn.disabled = kindFilter ? !history[0]?.[kindFilter].length : !history.some(hasChanges);
    } else {
      const users = all[tab].filter(matches(q));
      const row = PICK_TABS.includes(tab) ? pickRow : userRow;
      list.replaceChildren(
        ...(users.length
          ? users.slice(0, MAX_ROWS).map((u) => row(u))
          : [h('p', { class: 'ige-muted ige-empty' }, data.updatedAt ? 'Nobody here.' : 'Press Scan to load your followers and following.')]),
        ...(users.length > MAX_ROWS ? [h('p', { class: 'ige-muted ige-empty' }, `Showing ${MAX_ROWS} of ${users.length}. Use search or export CSV for the rest.`)] : []),
      );
      exportBtn.disabled = !all[tab].length;
    }
    if (!running && !unfollowing) {
      status.textContent = data.updatedAt
        ? `${complete() ? 'Last scan' : 'Partial scan'}: ${new Date(data.updatedAt).toLocaleString()} · ${data.followers.length} followers · ${all.following.length} following`
        : 'Not scanned yet.';
      runBtn.textContent = complete() ? 'Rescan' : data.updatedAt ? 'Resume scan' : 'Scan';
    }
    syncPick();
  };

  /** Accounts that can be picked in the current tab and search: the ones not kept. */
  const pickable = () =>
    tab === 'notBack' || tab === 'following' ? sets()[tab].filter(matches(query.toLowerCase())).filter((u) => !keep.has(u.pk)) : [];

  /** Selection bar and buttons, without rebuilding the list (so it keeps its scroll). */
  function syncPick() {
    pickBar.hidden = !PICK_TABS.includes(tab) || !data.updatedAt;
    const can = pickable();
    const allPicked = can.length > 0 && can.every((u) => selected.has(u.pk));
    pickAllBtn.textContent = allPicked ? 'Clear selection' : `Select all${query ? ' shown' : ''} (${can.length})`;
    pickAllBtn.disabled = unfollowing || !can.length;
    pickCount.textContent = [selected.size && `${selected.size} selected`, keep.size && `${keep.size} kept`].filter(Boolean).join(' · ');
    if (!unfollowing) {
      unfollowBtn.textContent = `Unfollow ${selected.size}`;
      unfollowBtn.classList.toggle('is-hidden', !selected.size);
      unfollowBtn.disabled = running || !confirmBox.hidden;
    }
    runBtn.disabled = unfollowing;
  }

  function pickRow(u: FriendUser) {
    const kept = keep.has(u.pk);
    const box = h('input', {
      type: 'checkbox',
      checked: selected.has(u.pk),
      disabled: kept || unfollowing,
      'aria-label': `Select ${u.username}`,
      onChange: () => {
        if (box.checked) selected.add(u.pk);
        else selected.delete(u.pk);
        syncPick();
      },
    });
    const keepBtn = h('button', {
      class: `ige-btn ige-btn--sm ige-keep${kept ? ' is-active' : ''}`,
      type: 'button',
      'aria-pressed': String(kept),
      title: kept ? 'Kept: never selected for unfollowing. Click to allow it again.' : 'Keep: never select this account for unfollowing',
      disabled: unfollowing,
      onClick: async () => {
        if (keep.has(u.pk)) keep.delete(u.pk);
        else {
          keep.add(u.pk);
          selected.delete(u.pk);
        }
        await chrome.storage.local.set({ [keepKey(uid)]: [...keep] });
        render();
      },
    }, kept ? 'Kept' : 'Keep');
    return h('div', { class: `ige-pickrow${kept ? ' is-kept' : ''}` }, box, userRow(u), keepBtn);
  }

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
      entry.gained.length && newFollowersText(entry.gained.length),
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

  /** Asks first: how many, how long it takes, and that closing the panel stops it. While running, stops. */
  async function askUnfollow() {
    if (unfollowing) {
      cancelled = true;
      unfollowBtn.disabled = true;
      unfollowBtn.textContent = 'Stopping…';
      return;
    }
    const blocked = await cooldownLeft();
    if (blocked) {
      toast(`Instagram rate-limited Glassgram recently. Try again in ${Math.ceil(blocked / 60000)} min.`, 'error', 6000);
      return;
    }
    const queue = sets().following.filter((u) => selected.has(u.pk) && !keep.has(u.pk));
    if (!queue.length) return;
    const s = getSettings();
    const eta = unfollowEtaMs(queue.length, s['account.unfollowDelay'] * 1000, s['account.unfollowPause'] * 60000);
    const n = `${queue.length} account${queue.length === 1 ? '' : 's'}`;
    const cancel = h('button', { class: 'ige-btn ige-btn--ghost ige-btn--sm', type: 'button', onClick: hideConfirm }, 'Cancel');
    const go = h('button', {
      class: 'ige-btn ige-btn--danger ige-btn--sm',
      type: 'button',
      onClick: () => {
        hideConfirm();
        runUnfollow(queue);
      },
    }, `Unfollow ${n}`);
    confirmBox.replaceChildren(
      h('p', {}, h('strong', {}, `Unfollow ${n}?`)),
      h('p', {},
        `One every ${s['account.unfollowDelay']} s or so, with a ${s['account.unfollowPause']} min pause after every ${UNFOLLOWS_BEFORE_PAUSE}` +
          `${eta ? `: about ${formatDuration(eta)} in all` : ''}. Keep this panel open, closing it stops the queue. ` +
          'It also stops by itself if Instagram blocks the action.'),
      h('div', { class: 'ige-confirm__actions' }, cancel, go),
    );
    if (queue.some((u) => u.is_private)) {
      confirmBox.lastElementChild!.before(h('p', {}, 'Private accounts in the list need a new follow request if you change your mind.'));
    }
    confirmBox.hidden = false;
    syncPick();
    go.focus();
  }

  function hideConfirm() {
    confirmBox.hidden = true;
    confirmBox.replaceChildren();
    syncPick();
  }

  /**
   * One unfollow at a time, paced like davidarroyo1234/InstagramUnfollowers: the wait setting to 1.2
   * times it between two, a long pause after every 5, none after the last. An action block stops the
   * queue and pauses Glassgram's requests; 3 unconfirmed unfollows in a row stop it too.
   */
  async function runUnfollow(queue: FriendUser[]) {
    if (unfollowing || running) return;
    unfollowing = true;
    cancelled = false;
    unfollowBtn.textContent = 'Stop';
    unfollowBtn.disabled = false;
    render();
    const s = getSettings();
    const delay = s['account.unfollowDelay'] * 1000;
    const pause = s['account.unfollowPause'] * 60000;
    let done = 0;
    const failed: string[] = [];
    let failsInARow = 0;
    let stopReason = '';
    try {
      for (let i = 0; i < queue.length && !cancelled; i++) {
        const u = queue[i];
        status.textContent = `Unfollowing ${u.username} (${i + 1} of ${queue.length})…`;
        let outcome: UnfollowOutcome;
        try {
          outcome = (await unfollowUser(u)).outcome;
        } catch (e) {
          outcome = e instanceof ApiError && e.rateLimited ? 'blocked' : 'failed';
        }
        if (outcome === 'unfollowed') {
          done++;
          failsInARow = 0;
          selected.delete(u.pk);
          (data.unfollowed ??= []).push(u.pk);
          await persist();
        } else {
          failed.push(u.username);
          failsInARow++;
        }
        render();
        if (outcome === 'blocked') {
          startCooldown(BLOCKED_COOLDOWN_MS);
          stopReason = `Instagram blocked the action, so Glassgram stopped and paused its requests for ${BLOCKED_COOLDOWN_MS / 60000} min. Give it longer than that before you try again.`;
          break;
        }
        if (failsInARow >= MAX_FAILS_IN_A_ROW) {
          stopReason = `${MAX_FAILS_IN_A_ROW} unfollows in a row could not be confirmed, so Glassgram stopped. Reload Instagram and try again later.`;
          break;
        }
        if (i === queue.length - 1) break;
        await wait(unfollowDelayMs(delay), (left) => `Unfollowed ${done} of ${queue.length}. Next in ${left} s…`);
        if ((i + 1) % UNFOLLOWS_BEFORE_PAUSE === 0 && !cancelled) {
          await wait(pause, (left) => `Safety pause, ${clock(left)} left · ${done} of ${queue.length} unfollowed`);
        }
      }
    } finally {
      unfollowing = false;
      render();
    }
    const more = failed.length > 5 ? ` and ${failed.length - 5} more` : '';
    const summary = `Unfollowed ${done} of ${queue.length}.${failed.length ? ` Not confirmed: ${failed.slice(0, 5).join(', ')}${more}.` : ''}`;
    if (stopReason) toast(`${summary} ${stopReason}`, 'error', 10000);
    else if (cancelled && done + failed.length < queue.length) toast(`Stopped. ${summary}`, 'info', 6000);
    else toast(summary, failed.length ? 'error' : 'success', 6000);
  }

  pickAllBtn.addEventListener('click', () => {
    const can = pickable();
    if (can.length && can.every((u) => selected.has(u.pk))) for (const u of can) selected.delete(u.pk);
    else for (const u of can) selected.add(u.pk);
    render();
  });
  unfollowBtn.addEventListener('click', askUnfollow);
  runBtn.addEventListener('click', scan);
  search.addEventListener('input', () => {
    query = search.value;
    render();
  });
  exportBtn.addEventListener('click', () => {
    const day = new Date().toISOString().slice(0, 10);
    if (tab === 'changes') saveCsv(`instagram_${kindFilter ?? 'changes'}_${day}.csv`, kindFilter ? historyCsv(history.slice(0, 1), [kindFilter]) : historyCsv(history));
    else saveCsv(`instagram_${tab}_${day}.csv`, csv(sets()[tab]));
  });
  render();
}
