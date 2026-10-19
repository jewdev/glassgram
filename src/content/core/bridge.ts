// Private channel to the page script (src/inject/main-world.ts): a MessagePort handed over once at
// document_start (see shared/page-channel.ts). It reads Instagram's own data, replays Instagram's
// GraphQL queries, swallows "seen" requests and points us at elements only its world can identify.

import { acceptPort, pageSettings, type Found, type FromPage, type ToPage } from '../../shared/page-channel';
import type { Settings } from '../../shared/settings-schema';

let port: MessagePort | undefined;
const outbox: ToPage[] = [];
/** Event name the page script dispatches on elements it points at; random per page load. */
const FOUND = `e${crypto.randomUUID().replace(/-/g, '')}`;

let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }>();
const pageListeners = new Map<FromPage['t'], Set<(m: any) => void>>();
const foundListeners = new Map<Found['kind'], Set<(el: Element, f: any) => void>>();

function post(m: ToPage) {
  if (port) port.postMessage(m);
  else outbox.push(m);
}

function onMessage(m: FromPage) {
  if (m?.t === 'rpc-reply') {
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.result);
    else p.reject(new Error(m.error));
    return;
  }
  pageListeners.get(m?.t)?.forEach((l) => l(m));
}

function onFoundEvent(e: Event) {
  e.stopImmediatePropagation();
  let f: Found;
  try {
    f = JSON.parse(String((e as CustomEvent).detail));
  } catch {
    return;
  }
  if (e.target instanceof Element) foundListeners.get(f.kind)?.forEach((l) => l(e.target as Element, f));
}

/** Call once, at document_start, before Instagram's scripts run. */
export function connectPage() {
  document.addEventListener(FOUND, onFoundEvent, true);
  acceptPort(window, (p) => {
    port = p;
    p.onmessage = (e) => onMessage(e.data);
    p.postMessage({ t: 'init', found: FOUND } satisfies ToPage);
    for (const m of outbox.splice(0)) p.postMessage(m);
  });
}

let lastSettings = '';
/** Pass on the settings the page script acts on (it patches nothing until one needs it). */
export function sendPageSettings(s: Settings) {
  const ps = pageSettings(s);
  const key = JSON.stringify(ps);
  if (key === lastSettings) return;
  lastSettings = key;
  post({ t: 'settings', s: ps });
}

// A scan walks every div on the page, so at most one per SCAN_MS.
const SCAN_MS = 500;
let scanTimer: number | undefined;
/** Ask the page script to look for voice bubbles / chat rows; it answers with found events, then `scanned`. */
export function requestScan() {
  scanTimer ??= window.setTimeout(() => {
    scanTimer = undefined;
    post({ t: 'scan' });
  }, SCAN_MS);
}

export function onPage<T extends FromPage['t']>(type: T, fn: (m: Extract<FromPage, { t: T }>) => void): () => void {
  let set = pageListeners.get(type);
  if (!set) pageListeners.set(type, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function onFound<K extends Found['kind']>(kind: K, fn: (el: Element, f: Extract<Found, { kind: K }>) => void): () => void {
  let set = foundListeners.get(kind);
  if (!set) foundListeners.set(kind, (set = new Set()));
  set.add(fn);
  return () => set.delete(fn);
}

export function bridge<T>(op: string, args: Record<string, unknown> = {}, timeoutMs = 20000): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('Page bridge timed out — reload Instagram.'));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    post({ t: 'rpc', id, op, args });
  });
}

/** Like bridge(), but resolves to `fallback` on any error (cache lookups). */
export function bridgeSafe<T>(op: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  return bridge<T>(op, args, 3000).catch(() => fallback);
}
