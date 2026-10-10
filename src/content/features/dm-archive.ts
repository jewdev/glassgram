import { send, type DownloadResult } from '../../shared/messages';
import type { DmEvent, DmMessage } from '../../shared/slide';
import { myUserId } from '../core/api';
import { inRootFolder } from '../core/download';
import { renderFilename } from '../core/filename';
import { onDomChange } from '../core/observer';
import { getSettings } from '../core/state';
import { h, icon } from '../ui/dom';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';
import type { Feature } from './types';

// The MAIN-world script forwards decoded DM events while this attribute is set, and tags chat rows
// (data-ige-mid / data-ige-ts / data-ige-thread) inside lists marked data-ige-dmlist.
const ATTR = 'data-ige-dmkeep';

// Storage layout (chrome.storage.local, private to the extension):
//   ige.dm.unsent       every unsent message, kept until you clear them
//   ige.dm.t.<thread>   recent messages of one chat, so a later unsend can be matched
const UNSENT_KEY = 'ige.dm.unsent';
const THREAD_PREFIX = 'ige.dm.t.';
const LEGACY_KEY = 'ige.dmArchive';
/** Per-chat cap when recent messages aren't kept forever. */
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
const dirty = new Set<string>(); // thread ids, or UNSENT_KEY
let saveTimer: number | undefined;

function loadUnsent(): Promise<Shard> {
  unsentLoad ??= (async () => {
    const r = await chrome.storage.local.get([UNSENT_KEY, LEGACY_KEY]);
    const un = (r[UNSENT_KEY] as Shard | undefined) ?? {};
    // One-time move from the first version, which kept everything under a single key.
    const legacy = r[LEGACY_KEY] as Shard | undefined;
    if (legacy) {
      for (const m of Object.values(legacy)) if (m.unsentAt) un[m.id] = m;
      await chrome.storage.local.set({ [UNSENT_KEY]: un });
      await chrome.storage.local.remove(LEGACY_KEY);
    }
    return (unsent = un);
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
  if (!days) return;
  const cutoff = Date.now() - days * 86_400_000;
  Object.values(s)
    .sort((a, b) => b.ts - a.ts)
    .forEach((m, i) => {
      if (m.ts < cutoff || i >= MAX_PER_THREAD) delete s[m.id];
    });
}

function flush(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const out: Record<string, Shard> = {};
  for (const key of dirty) {
    if (key === UNSENT_KEY) {
      if (unsent) out[UNSENT_KEY] = unsent;
    } else {
      const s = shards.get(key);
      if (s) {
        prune(s);
        out[THREAD_PREFIX + key] = s;
      }
    }
  }
  dirty.clear();
  if (!Object.keys(out).length) return Promise.resolve();
  return chrome.storage.local.set(out).catch((e) => console.warn('[IGE] DM archive save failed', e));
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
      dirty.add(m.thread);
    } else {
      if (un[e.id]) continue;
      const s = await loadShard(e.thread);
      const m = s[e.id];
      if (!m) continue; // arrived before we were listening — nothing to show
      un[e.id] = { ...m, unsentAt: Date.now() };
      delete s[e.id];
      dirty.add(e.thread).add(UNSENT_KEY);
      fresh = true;
      const preview = describeContent(m);
      toast(`${who(m)} unsent: "${preview.length > 80 ? `${preview.slice(0, 80)}…` : preview}"`, 'info', 8000);
    }
  }
  if (dirty.size) scheduleSave();
  if (fresh) renderGhosts();
}

// ---------------- in-chat overlay ----------------

const GHOST = 'data-ige-ghost';
const UNSENT_ICON = '<path d="M3 7h18"/><path d="M8 7V4h8v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>';

/** Left edge of incoming bubbles in this list (they sit after the avatar column). */
function incomingInset(list: Element): number {
  const lr = list.getBoundingClientRect();
  for (const row of list.querySelectorAll(':scope > [data-ige-mid]')) {
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
  return h(
    'div',
    { class: 'ige-root ige-ghost', [GHOST]: m.id, 'data-ige-ts': String(m.ts), style: { paddingLeft: `${inset}px` } },
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

  for (const list of document.querySelectorAll('[data-ige-dmlist]')) {
    const rows = [...list.querySelectorAll<HTMLElement>(':scope > [data-ige-mid]')];
    const thread = rows[0]?.getAttribute('data-ige-thread');
    const wanted = (thread && byThread.get(thread)) || [];
    // Drop ghosts that no longer belong here (other chat now shown, or cleared).
    for (const g of list.querySelectorAll<HTMLElement>(`:scope > [${GHOST}]`)) {
      if (!wanted.some((m) => m.id === g.getAttribute(GHOST))) g.remove();
    }
    if (!wanted.length) continue;
    const firstTs = Number(rows[0].getAttribute('data-ige-ts'));
    let inset: number | undefined;
    for (const m of wanted.sort((a, b) => a.ts - b.ts)) {
      if (m.ts < firstTs) continue; // older than the loaded history — appears once you scroll up
      if (list.querySelector(`:scope > [data-ige-mid="${CSS.escape(m.id)}"]`)) continue; // Instagram still shows it
      const existing = list.querySelector<HTMLElement>(`:scope > [${GHOST}="${CSS.escape(m.id)}"]`);
      // Insert after the last message (or ghost) that is not newer than this one.
      let after: Element | null = null;
      for (const child of list.children) {
        if (child === existing) continue;
        const ts = Number(child.getAttribute('data-ige-ts'));
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
          await chrome.storage.local.set({ [UNSENT_KEY]: un });
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
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.data?.__ige !== 'dm-events' || !Array.isArray(e.data.events)) return;
      handle(e.data.events as DmEvent[]).catch((err) => console.debug('[IGE] DM archive', err));
    };
    window.addEventListener('message', onMessage);
    document.documentElement.setAttribute(ATTR, '1');
    loadUnsent().then(renderGhosts);
    const offDom = onDomChange(renderGhosts);
    return () => {
      offDom();
      window.removeEventListener('message', onMessage);
      document.documentElement.removeAttribute(ATTR);
      document.querySelectorAll(`[${GHOST}]`).forEach((g) => g.remove());
      // Turning the feature off forgets the recent-message buffer; unsent ones stay until cleared.
      dirty.forEach((k) => k !== UNSENT_KEY && dirty.delete(k));
      shards.clear();
      shardLoads.clear();
      flush() // a message unsent just before this must still reach storage
        // getKeys() needs Chrome 130; older builds fall back to reading everything.
        .then(() => chrome.storage.local.getKeys?.() ?? chrome.storage.local.get(null).then(Object.keys))
        .then((keys) => chrome.storage.local.remove(keys.filter((k) => k.startsWith(THREAD_PREFIX))));
    };
  },
};
