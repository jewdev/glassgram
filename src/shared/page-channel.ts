// Channel between the content script (isolated world) and the page script (src/inject/main-world.ts).
//
// Both worlds share the DOM, so anything left there (attributes, window.postMessage traffic) is
// visible to Instagram's own code, which can also fake it. The only page-visible step is the
// handshake: one window message at document_start, before any of Instagram's scripts exist, that
// hands a MessagePort to the content script. Our listener runs first and stops it there. After
// that everything goes over the port, which the page has no reference to.
//
// Elements can't travel over a port, so the page script points at elements by dispatching a
// non-bubbling CustomEvent on them, under an event name the content script makes up per page load.

import type { Settings } from './settings-schema';
import type { DmEvent } from './slide';

/** The window message that carries the port. Never reaches a page listener (see above). */
export const HANDSHAKE = 'gg-port';
/** Sent by the content script only if no port arrived in time (unexpected injection order). */
export const RETRY = 'gg-port?';

/** What the page script needs to know, and nothing else. */
export interface PageSettings {
  anonStories: boolean;
  anonLive: boolean;
  dmHideSeen: boolean;
  dmHideTyping: boolean;
  dmKeep: boolean;
  voice: boolean;
  cleanLinks: boolean;
  shareDomain: string;
  directLinks: boolean;
  bulk: boolean;
}

export const NO_PAGE_SETTINGS: PageSettings = {
  anonStories: false,
  anonLive: false,
  dmHideSeen: false,
  dmHideTyping: false,
  dmKeep: false,
  voice: false,
  cleanLinks: false,
  shareDomain: '',
  directLinks: false,
  bulk: false,
};

export function pageSettings(s: Settings): PageSettings {
  return {
    anonStories: s['privacy.anonStories'],
    anonLive: s['privacy.anonLive'],
    dmHideSeen: s['privacy.dmHideSeen'],
    dmHideTyping: s['privacy.dmHideTyping'],
    dmKeep: s['dm.keepUnsent'],
    voice: s['dm.voiceDownload'],
    cleanLinks: s['links.clean'],
    shareDomain: s['links.shareDomain'].trim(),
    directLinks: s['links.direct'],
    bulk: s['bulk.enabled'],
  };
}

/** A group of natives the page script patches. */
export type Hook = 'net' | 'socket' | 'dgw' | 'clipboard' | 'open';

/** The hooks these settings need. Empty when every one is off: then nothing on the page is patched. */
export function hooksFor(p: PageSettings): Hook[] {
  const hooks: Hook[] = [];
  // fetch + XHR: requests to swallow, live heartbeats, the bulk-download query template, DM history.
  if (p.anonStories || p.anonLive || p.dmHideSeen || p.dmKeep || p.bulk) hooks.push('net');
  // WebSocket send: typing / read receipts on the chat socket, and finding the DM gateway socket.
  if (p.dmHideTyping || p.dmHideSeen || p.dmKeep) hooks.push('socket');
  if (p.dmHideTyping) hooks.push('dgw');
  if (p.cleanLinks) hooks.push('clipboard');
  if (p.directLinks) hooks.push('open');
  return hooks;
}

/** Content script → page script. `init` is always first. */
export type ToPage =
  | { t: 'init'; found: string }
  | { t: 'settings'; s: PageSettings }
  | { t: 'rpc'; id: number; op: string; args: Record<string, unknown> }
  | { t: 'scan' };

/** Page script → content script. */
export type FromPage =
  | { t: 'rpc-reply'; id: number; ok: true; result: unknown }
  | { t: 'rpc-reply'; id: number; ok: false; error: string }
  | { t: 'dm-events'; events: DmEvent[] }
  | { t: 'scanned' }
  /** X-ASBD-ID Instagram sends now, read from a request a hook was already looking at. */
  | { t: 'asbd'; value: string };

/** What the page script says about an element it points at. */
export type Found =
  | { kind: 'voice'; url: string; id: string }
  | { kind: 'dm-list' }
  | { kind: 'dm-row'; mid: string; ts: number; thread: string };

type Win = Pick<Window, 'addEventListener' | 'removeEventListener' | 'postMessage'>;

/**
 * Page side of the handshake. Offers a port right away, and again if the content script asks
 * (it was injected late). The first port whose other end sends `init` wins; later asks are ignored.
 */
export function offerPort(win: Win, onConnect: (port: MessagePort, init: Extract<ToPage, { t: 'init' }>) => void) {
  let connected = false;
  const offer = () => {
    const { port1, port2 } = new MessageChannel();
    port1.onmessage = (e: MessageEvent) => {
      if (connected || e.data?.t !== 'init' || typeof e.data.found !== 'string') return;
      connected = true;
      win.removeEventListener('message', onRetry, true);
      onConnect(port1, e.data);
    };
    win.postMessage(HANDSHAKE, '*', [port2]);
  };
  const onRetry = (e: MessageEvent) => {
    if (e.data !== RETRY) return;
    e.stopImmediatePropagation();
    if (!connected) offer();
  };
  win.addEventListener('message', onRetry, true);
  offer();
}

/** Content-script side: takes the first offered port, and keeps the handshake message from the page. */
export function acceptPort(win: Win, onPort: (port: MessagePort) => void, retryMs = 2000) {
  const onMessage = (e: MessageEvent) => {
    if (e.data !== HANDSHAKE || e.source !== win || !e.ports?.[0]) return;
    e.stopImmediatePropagation();
    win.removeEventListener('message', onMessage, true);
    clearTimeout(timer);
    onPort(e.ports[0]);
  };
  win.addEventListener('message', onMessage, true);
  const timer = setTimeout(() => win.postMessage(RETRY, '*'), retryMs);
}
