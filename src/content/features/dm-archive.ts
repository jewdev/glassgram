import { send, type DownloadResult } from '../../shared/messages';
import type { DmEvent, DmMessage } from '../../shared/slide';
import { myUserId } from '../core/api';
import { onFound, onPage, requestScan } from '../core/bridge';
import { inRootFolder } from '../core/download';
import { renderFilename } from '../core/filename';
import { onDomChange } from '../core/observer';
import { getSettings } from '../core/state';
import { h, icon, shadowHost } from '../ui/dom';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import type { Feature } from './types';

// While dm.keepUnsent is on, the page script forwards decoded DM events, and points us at chat
// lists and their rows (message id, time, chat) when we ask it to scan.

// Storage layout (chrome.storage.local, private to the extension):
//   ige.dm.u.<id>       one unsent message, kept until you clear them
//   ige.dm.t.<thread>   recent messages of one chat, so a later unsend can be matched
// Unsent messages get a key each so two Instagram tabs never write over each other's.
const UNSENT_PREFIX = 'ige.dm.u.';
const THREAD_PREFIX = 'ige.dm.t.';
const OLD_UNSENT_KEY = 'ige.dm.unsent';
const LEGACY_KEY = 'ige.dmArchive';
/** Per-chat cap, also when recent messages are kept forever. */
const MAX_PER_THREAD = 2000;
const SAVE_DELAY = 1000;

export interface ArchivedMessage extends DmMessage {
  /** When the sender unsent it. */
  unsentAt?: number;
}

type Shard = Record<string, ArchivedMessage>;

let unsent: Shard | null = null;
// Promises, not values: two event batches arriving together must share one load, or the
// second copy replaces the first and the messages written into it are lost.
let unsentLoad: Promise<Shard> | null = null;
const shards = new Map<string, Shard>();
const shardLoads = new Map<string, Promise<Shard>>();
const dirtyThreads = new Set<string>();
const dirtyUnsent = new Set<string>(); // message ids
let saveTimer: number | undefined;
let saving: Promise<void> = Promise.resolve();

async function keysWith(prefix: string): Promise<string[]> {
  // getKeys() needs Chrome 130; older builds fall back to reading everything.
  const keys = await (chrome.storage.local.getKeys?.() ?? chrome.storage.local.get(null).then(Object.keys));
  return keys.filter((k) => k.startsWith(prefix));
}

/** Other tabs add and clear unsent messages too; keep this tab's copy in step. */
function onStorageChanged(changes: Record<string, chrome.storage.StorageChange>, area: string) {
  if (area !== 'local' || !unsent) return;
  let changed = false;
  for (const [key, { newValue }] of Object.entries(changes)) {
    if (!key.startsWith(UNSENT_PREFIX)) continue;
    const id = key.slice(UNSENT_PREFIX.length);
    if (newValue) unsent[id] = newValue as ArchivedMessage;
    else delete unsent[id];
    changed = true;
  }
  if (changed) renderGhosts();
}

function loadUnsent(): Promise<Shard> {
  unsentLoad ??= (async () => {
    const keys = await keysWith(UNSENT_PREFIX);
    const r = await chrome.storage.local.get([...keys, OLD_UNSENT_KEY, LEGACY_KEY]);
    const un: Shard = {};
    for (const k of keys) if (r[k]) un[k.slice(UNSENT_PREFIX.length)] = r[k] as ArchivedMessage;
    // One-time moves from older versions: everything under one key, then all unsent ones under one key.
    const moved: Shard = {};
    for (const m of Object.values((r[LEGACY_KEY] as Shard | undefined) ?? {})) if (m.unsentAt) moved[m.id] = m;
    Object.assign(moved, r[OLD_UNSENT_KEY] as Shard | undefined);
    if (r[LEGACY_KEY] || r[OLD_UNSENT_KEY]) {
      await chrome.storage.local.set(Object.fromEntries(Object.values(moved).map((m) => [UNSENT_PREFIX + m.id, m])));
      await chrome.storage.local.remove([OLD_UNSENT_KEY, LEGACY_KEY]);
    }
    unsent = { ...moved, ...un };
    chrome.storage.onChanged.addListener(onStorageChanged);
    return unsent;
  })().catch((e) => {
    unsentLoad = null;
    throw e;
  });
  return unsentLoad;
}

function loadShard(thread: string): Promise<Shard> {
  let p = shardLoads.get(thread);
  if (!p) {
    const key = THREAD_PREFIX + thread;
    p = chrome.storage.local.get(key).then(
      (r) => {
        const s = (r[key] as Shard | undefined) ?? {};
        shards.set(thread, s);
        return s;
      },
      (e) => {
        shardLoads.delete(thread);
        throw e;
      },
    );
    shardLoads.set(thread, p);
  }
  return p;
}

/** Retention in days; 0 = forever. */
const keepDays = () => Number(getSettings()['dm.keepFor']) || 0;

function prune(s: Shard) {
  const days = keepDays();
  const cutoff = days ? Date.now() - days * 86_400_000 : 0;
  Object.values(s)
    .sort((a, b) => b.ts - a.ts)
    .forEach((m, i) => {
      if (m.ts < cutoff || i >= MAX_PER_THREAD || unsent?.[m.id]) delete s[m.id];
    });
}

async function save() {
  const threads = [...dirtyThreads];
  const ids = [...dirtyUnsent];
  dirtyThreads.clear();
  dirtyUnsent.clear();
  const out: Record<string, unknown> = {};
  for (const id of ids) if (unsent?.[id]) out[UNSENT_PREFIX + id] = unsent[id];
  if (threads.length) {
    // Another tab may have saved the same chat since this one loaded it: merge, don't replace.
    const stored = await chrome.storage.local.get(threads.map((t) => THREAD_PREFIX + t));
    for (const t of threads) {
      const s = shards.get(t);
      if (!s) continue;
      for (const [id, m] of Object.entries((stored[THREAD_PREFIX + t] as Shard | undefined) ?? {})) s[id] ??= m;
      prune(s);
      out[THREAD_PREFIX + t] = s;
    }
  }
  if (Object.keys(out).length) await chrome.storage.local.set(out);
}

function flush(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  // One save at a time, so a slow one can't land after a newer one.
  saving = saving.then(save).catch((e) => console.warn('[IGE] DM archive save failed', e));
  return saving;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(flush, SAVE_DELAY);
}

/** Only web links from DM payloads become hrefs. */
const safeUrl = (url: string) => (/^https:\/\//i.test(url) ? url : undefined);

export function describeContent(m: ArchivedMessage): string {
  if (m.text) return m.text;
  const kind = m.kind.toLowerCase().replace(/^slidemessage/, '').replace(/_/g, ' ');
  return `[${kind || 'attachment'}]`;
}

const who = (m: ArchivedMessage) => (m.username ? `@${m.username}` : m.name || 'Someone');
const fmt = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Exported for tests. */
export async function handle(events: DmEvent[]) {
  const me = myUserId();
  const un = await loadUnsent();
  let fresh = false;
  for (const e of events) {
    if (e.type === 'message') {
      const m = e.message;
      // Only other people's messages: you already know what you sent.
      if (m.senderId === me || un[m.id]) continue;
      const s = await loadShard(m.thread);
      s[m.id] = { ...s[m.id], ...m };
      dirtyThreads.add(m.thread);
    } else {
      if (un[e.id]) continue;
      const s = await loadShard(e.thread);
      const m = s[e.id];
      if (!m) continue; // arrived before we were listening — nothing to show
      un[e.id] = { ...m, unsentAt: Date.now() };
      delete s[e.id];
      dirtyThreads.add(e.thread);
      dirtyUnsent.add(e.id);
      fresh = true;
      const preview = describeContent(m);
      toast(`${who(m)} unsent: "${preview.length > 80 ? `${preview.slice(0, 80)}…` : preview}"`, 'info', 8000);
    }
  }
  if (dirtyThreads.size || dirtyUnsent.size) scheduleSave();
  if (fresh) renderGhosts();
}

// ---------------- in-chat overlay ----------------

const UNSENT_ICON = '<path d="M3 7h18"/><path d="M8 7V4h8v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>';

/** Chat message lists the page script found. */
const lists = new Set<Element>();
/** Instagram's message rows → what the page script read from them. */
const rowInfo = new WeakMap<Element, { mid: string; ts: number; thread: string }>();
/** Our ghost rows → the unsent message they show. */
const ghostInfo = new WeakMap<Element, { id: string; ts: number }>();
const ghosts = new Set<HTMLElement>();

const rowsOf = (list: Element) => [...list.children].filter((c) => rowInfo.has(c));
const tsOf = (el: Element) => rowInfo.get(el)?.ts ?? ghostInfo.get(el)?.ts ?? NaN;

/** Left edge of incoming bubbles in this list (they sit after the avatar column). */
function incomingInset(list: Element): number {
  const lr = list.getBoundingClientRect();
  for (const row of rowsOf(list)) {
    for (const d of row.querySelectorAll('div')) {
      const s = getComputedStyle(d);
      if (s.backgroundColor === 'rgba(0, 0, 0, 0)' || parseFloat(s.borderRadius) < 10) continue;
      const r = d.getBoundingClientRect();
      if (r.left - lr.left < lr.right - r.right) return Math.round(r.left - lr.left);
      break; // outgoing bubble — try the next row
    }
  }
  return 52;
}

function ghostFor(m: ArchivedMessage, inset: number): HTMLElement {
  const host = shadowHost('div', ghostContent(m, inset));
  ghostInfo.set(host, { id: m.id, ts: m.ts });
  ghosts.add(host);
  return host;
}

function ghostContent(m: ArchivedMessage, inset: number): HTMLElement {
  return h(
    'div',
    { class: 'ige-root ige-ghost', style: { paddingLeft: `${inset}px` } },
    h(
      'div',
      { class: 'ige-ghost__bubble', title: `Unsent by ${who(m)}\nSent ${fmt(m.ts)}\nUnsent ${fmt(m.unsentAt!)}` },
      h('span', { class: 'ige-ghost__text' }, describeContent(m)),
      ...m.media.map((url, i) => h('a', { class: 'ige-ghost__link', href: safeUrl(url), target: '_blank', rel: 'noopener noreferrer' }, `Attachment ${i + 1}`)),
    ),
    h('span', { class: 'ige-ghost__icon', title: 'Unsent', 'aria-label': 'Unsent message', html: icon(UNSENT_ICON, 14) }),
  );
}

function renderGhosts() {
  if (!unsent) return;
  const byThread = new Map<string, ArchivedMessage[]>();
  for (const m of Object.values(unsent)) byThread.set(m.thread, [...(byThread.get(m.thread) ?? []), m]);

  for (const g of ghosts) if (!g.isConnected) ghosts.delete(g);
  for (const list of lists) {
    if (!list.isConnected) {
      lists.delete(list);
      continue;
    }
    const rows = rowsOf(list);
    const thread = rows[0] && rowInfo.get(rows[0])?.thread;
    const wanted = (thread && byThread.get(thread)) || [];
    const listGhosts = [...list.children].filter((c) => ghostInfo.has(c));
    // Drop ghosts that no longer belong here (other chat now shown, or cleared).
    for (const g of listGhosts) {
      if (!wanted.some((m) => m.id === ghostInfo.get(g)!.id)) g.remove();
    }
    if (!wanted.length) continue;
    const firstTs = tsOf(rows[0]);
    let inset: number | undefined;
    for (const m of wanted.sort((a, b) => a.ts - b.ts)) {
      if (m.ts < firstTs) continue; // older than the loaded history — appears once you scroll up
      if (rows.some((r) => rowInfo.get(r)!.mid === m.id)) continue; // Instagram still shows it
      const existing = listGhosts.find((g) => g.isConnected && ghostInfo.get(g)!.id === m.id);
      // Insert after the last message (or ghost) that is not newer than this one.
      let after: Element | null = null;
      for (const child of list.children) {
        if (child === existing) continue;
        const ts = tsOf(child);
        if (Number.isFinite(ts) && ts > 0 && ts <= m.ts) after = child;
      }
      if (!after) continue;
      if (existing && existing.previousElementSibling === after) continue;
      inset ??= incomingInset(list);
      after.insertAdjacentElement('afterend', existing ?? ghostFor(m, inset));
    }
  }
}

// ---------------- list panel ----------------

/** Save the unsent list as readable JSON (newest first) to e.g. Glassgram/DMs/Unsent/unsent_2026-10-09_18-30-05.json. */
async function saveToFile(items: ArchivedMessage[]) {
  const messages = items.map((m) => ({
    ...m,
    from: m.username ? `@${m.username}` : m.name || null,
    text: describeContent(m),
    sent: new Date(m.ts).toISOString(),
    unsent: new Date(m.unsentAt!).toISOString(),
    chat: `https://www.instagram.com/direct/t/${m.thread}/`,
  }));
  const json = JSON.stringify({ savedAt: new Date().toISOString(), count: messages.length, messages }, null, 2);
  // A data URL so the background can save it through chrome.downloads, which is what makes the folders.
  const url = `data:application/json;charset=utf-8,${encodeURIComponent(json)}`;
  const name = renderFilename('unsent_{date}_{time}', { user: '', shortcode: '', index: 1, id: '', takenAt: Date.now() / 1000, type: 'json' }, 'json');
  const res = await send<DownloadResult>({ type: 'download', jobs: [{ url, filename: inRootFolder(`DMs/Unsent/${name}`) }] });
  toast(res?.ok ? 'Saving unsent messages' : 'Saving failed', res?.ok ? 'success' : 'error');
}

/** Panel listing every message that was unsent while Instagram was open. */
export async function openUnsentMessages() {
  const m = openModal('Unsent messages', { width: 520 });
  const un = await loadUnsent();
  const list = () => Object.values(un).sort((x, y) => y.unsentAt! - x.unsentAt!);

  const render = () => {
    m.body.replaceChildren();
    const items = list();
    if (!items.length) {
      m.body.append(h('p', { class: 'ige-muted ige-empty' }, 'Nothing unsent yet. Messages people unsend while Instagram is open in this browser show up here.'));
      return;
    }
    m.body.append(
      h(
        'div',
        { class: 'ige-userlist ige-dmu' },
        ...items.map((x) =>
          h(
            'div',
            { class: 'ige-dmu__item' },
            h(
              'div',
              { class: 'ige-dmu__head' },
              x.username ? h('a', { href: `/${x.username}/`, target: '_blank', rel: 'noopener' }, h('strong', {}, `@${x.username}`)) : h('strong', {}, x.name || 'Unknown'),
              h('a', { class: 'ige-muted', href: `/direct/t/${x.thread}/`, title: 'Open the chat' }, 'chat'),
            ),
            h('p', { class: 'ige-dmu__text' }, describeContent(x)),
            ...x.media.map((url, i) => h('a', { class: 'ige-sd__link', href: safeUrl(url), target: '_blank', rel: 'noopener noreferrer' }, `Attachment ${i + 1} (may have expired)`)),
            h('span', { class: 'ige-muted ige-dmu__time' }, `Sent ${fmt(x.ts)} · unsent ${fmt(x.unsentAt!)}`),
          ),
        ),
      ),
    );
  };
  render();

  m.footer.append(
    h('span', { class: 'ige-muted ige-dmu__hint' }, 'Saved in this browser. Use Save to file to keep a copy.'),
    h(
      'button',
      {
        class: 'ige-btn ige-btn--ghost',
        type: 'button',
        onClick: () => {
          const items = list();
          if (items.length) saveToFile(items);
          else toast('Nothing to save yet', 'info');
        },
      },
      'Save to file',
    ),
    h(
      'button',
      {
        class: 'ige-btn ige-btn--ghost',
        type: 'button',
        onClick: async () => {
          if (!list().length) return;
          for (const id of Object.keys(un)) delete un[id];
          dirtyUnsent.clear();
          // Every tab's, not just the ones this tab knows about.
          await chrome.storage.local.remove(await keysWith(UNSENT_PREFIX));
          render();
          renderGhosts();
          toast('Unsent messages cleared', 'success');
        },
      },
      'Clear all',
    ),
  );
}

/** Keep incoming DMs locally and show the ones the sender unsends, in the chat and in a list. */
export const dmArchive: Feature = {
  id: 'dm-archive',
  isEnabled: (s) => s['dm.keepUnsent'],
  start() {
    const offs = [
      onPage('dm-events', (m) => {
        if (Array.isArray(m.events)) handle(m.events).catch((err) => console.debug('[IGE] DM archive', err));
      }),
      onFound('dm-list', (list) => lists.add(list)),
      onFound('dm-row', (row, f) => rowInfo.set(row, { mid: f.mid, ts: f.ts, thread: f.thread })),
      onPage('scanned', renderGhosts),
      // Instagram changed the DOM: ask the page script to look at the chat again, then draw.
      onDomChange(requestScan),
    ];
    loadUnsent().then(renderGhosts);
    return () => {
      offs.forEach((off) => off());
      ghosts.forEach((g) => g.remove());
      ghosts.clear();
      lists.clear();
      // Turning the feature off forgets the recent-message buffer; unsent ones stay until cleared.
      dirtyThreads.clear();
      shards.clear();
      shardLoads.clear();
      flush() // a message unsent just before this must still reach storage
        .then(() => keysWith(THREAD_PREFIX))
        .then((keys) => chrome.storage.local.remove(keys));
    };
  },
};
