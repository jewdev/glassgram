// Runs in the page's MAIN world at document_start, before Instagram's own scripts.
//
// Whatever this script touches, Instagram's code can see, so it starts out touching nothing: it
// only offers the content script a private channel (see shared/page-channel.ts). Natives are
// patched once a setting needs them, and the patches look like the originals (see stealth.ts).
//
// 1. Privacy: swallow the requests that mark stories / DMs seen, the live-viewer heartbeat and the
//    DM typing indicator.
// 2. Data: answer lookups from Instagram's Relay store, and replay the profile queries Instagram
//    already made (bulk download), with its own request template.
// 3. DMs: forward incoming messages and unsends, and point the content script at chat rows and
//    voice bubbles (React/Relay data is only readable in this world).

import { filterLightspeedRequest, filterMqttFrame, mqttPubAck } from '../shared/lightspeed';
import { cleanInstagramUrl, isSingleInstagramUrl, unwrapLinkShim } from '../shared/links';
import { hooksFor, NO_PAGE_SETTINGS, offerPort, type Found, type FromPage, type Hook, type PageSettings, type ToPage } from '../shared/page-channel';
import { findMedia, findReel, findUser, type RelaySource } from '../shared/relay';
import { collectDmEvents, decodeGatewayFrame, type DmEvent } from '../shared/slide';
import { apply, defineProperty, disguise, dispatchLater, later, natives, nativeFetch, replace } from './stealth';

(() => {
  let s: PageSettings = NO_PAGE_SETTINGS;
  let port: MessagePort | undefined;
  let foundEvent = '';

  const send = (m: FromPage) => port && apply(natives.portPost, port, [m]);

  /** Tell the content script about `el` (it listens for `foundEvent`; nothing else knows the name). */
  const report = (el: Element, f: Found) =>
    apply(natives.dispatchEvent, el, [new natives.CustomEvent(foundEvent, { detail: apply(natives.stringify, JSON, [f]) })]);

  // ---------------- shared helpers ----------------
  function bodyText(body: unknown): string {
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();
    if (body instanceof FormData) {
      const p = new URLSearchParams();
      body.forEach((v, k) => typeof v === 'string' && p.append(k, v));
      return p.toString();
    }
    return '';
  }

  function friendlyName(text: string): string {
    const m = /(?:^|&)fb_api_req_friendly_name=([^&]+)/.exec(text);
    if (!m) return '';
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }

  const absolute = (url: string) => new URL(url, location.href).href;

  // ---------------- anonymous stories ----------------
  // REST endpoints that mark stories seen.
  const SEEN_URL_RE = /stories\/reel\/seen|media\/seen/i;
  // GraphQL operation names, e.g. PolarisAPIReelSeenMutation, PolarisStoriesV3SeenMutation (not DM "seen").
  const SEEN_OP_RE = /(stor(y|ies)|reel).*seen|seen.*(stor(y|ies)|reel)/i;
  const isSeenRequest = (url: string, body: string) =>
    SEEN_URL_RE.test(url) || (/graphql|\/api\/v1\//.test(url) && SEEN_OP_RE.test(friendlyName(body)));
  const FAKE_OK = '{"status":"ok","data":{}}';

  // ---------------- DM "Seen" ----------------
  // Instagram's current DM client marks threads read with these GraphQL mutations
  // (useIGDMarkThreadAsReadMutation / ...ValidationMutation); older clients used a REST endpoint.
  const DM_SEEN_OP_RE = /IGDMarkThreadAsRead/;
  const DM_SEEN_URL_RE = /\/direct_v2\/threads\/[^/]+\/items\/[^/]+\/seen/;
  const isDmSeenRequest = (url: string, body: string) => DM_SEEN_URL_RE.test(url) || (/graphql/.test(url) && DM_SEEN_OP_RE.test(friendlyName(body)));

  // ---------------- anonymous live ----------------
  // Watching a live broadcast POSTs heartbeat_and_get_viewer_count every few seconds; that heartbeat
  // is what lists you as a viewer. We answer it from the read-only /info/ endpoint instead, so the
  // player still gets a real viewer count and notices when the broadcast ends.
  const LIVE_HEARTBEAT_RE = /\/api\/v1\/live\/(\d+)\/heartbeat_and_get_viewer_count\//;

  async function fakeLiveHeartbeat(broadcastId: string, headers: Record<string, string>): Promise<string> {
    let info: { viewer_count?: number; broadcast_status?: string } = {};
    try {
      const res = await nativeFetch(`/api/v1/live/${broadcastId}/info/`, { credentials: 'include', headers });
      if (res.ok) info = await res.json();
    } catch {
      /* answer with defaults */
    }
    return apply(natives.stringify, JSON, [{ viewer_count: info.viewer_count ?? 0, broadcast_status: info.broadcast_status ?? 'active', status: 'ok' }]);
  }

  /** Requests we swallow (answering with a fake success so Instagram doesn't retry). */
  const shouldBlock = (url: string, body: string) => (s.anonStories && isSeenRequest(url, body)) || (s.dmHideSeen && isDmSeenRequest(url, body));

  // ---------------- request templates (bulk download) ----------------
  const TEMPLATE_NAMES = new Set(['PolarisProfilePostsQuery', 'PolarisProfilePageContentQuery']);
  const templates = new Map<string, { url: string; body: string; headers: Record<string, string> }>();
  // Per-session tokens and the request counter from Instagram's latest requests, so a replay doesn't
  // carry stale ones from when its template was captured.
  const tokens: Record<string, string> = {};
  let lastReq = 0;

  function rememberRequest(url: string, body: string, headers: Record<string, string>) {
    const p = new URLSearchParams(body);
    for (const k of ['fb_dtsg', 'lsd', 'jazoest']) {
      const v = p.get(k);
      if (v) tokens[k] = v;
    }
    const req = parseInt(p.get('__req') ?? '', 36);
    if (req > lastReq) lastReq = req;
    const name = p.get('fb_api_req_friendly_name') ?? '';
    if (TEMPLATE_NAMES.has(name)) templates.set(name, { url: url.split('?')[0], body, headers: { ...headers } });
  }

  // ---------------- DMs: keep unsent messages ----------------
  // Incoming messages and unsends arrive on the gateway socket (see shared/slide.ts); thread history
  // loaded over HTTP carries the same message objects. We only forward them — the content script
  // decides what to keep and stores it in extension storage.
  const DM_GATEWAY_RE = /gateway\.instagram\.com\/ws\/lightspeed/;
  const DATA_URL_RE = /\/(api\/graphql|graphql\/query|api\/v1\/)/;

  function postDmEvents(events: DmEvent[]) {
    if (events.length) send({ t: 'dm-events', events });
  }

  /** HTTP thread history: only responses that carry messages are parsed. */
  function sniffDm(text: string) {
    if (!s.dmKeep || !text.includes('"message_id"')) return;
    const clean = text.startsWith('for (;;);') ? text.slice(9) : text;
    // GraphQL may stream several JSON documents separated by newlines.
    for (const part of clean.includes('\n{') ? clean.split(/\n(?=\{)/) : [clean]) {
      if (!part.includes('"message_id"')) continue;
      try {
        postDmEvents(collectDmEvents(apply(natives.parse, JSON, [part])));
      } catch {
        /* not JSON */
      }
    }
  }

  function onGatewayMessage(e: MessageEvent) {
    if (!s.dmKeep) return;
    const handle = (buf: ArrayBuffer) => {
      try {
        postDmEvents(decodeGatewayFrame(new Uint8Array(buf)).flatMap(collectDmEvents));
      } catch {
        /* unknown frame */
      }
    };
    if (e.data instanceof ArrayBuffer) handle(e.data);
    else if (e.data instanceof Blob) e.data.arrayBuffer().then(handle, () => {});
  }

  // ---------------- network hook (fetch + XHR) ----------------
  /** What to do with a request: answer it locally, and/or read its response. */
  function inspect(url: string, body: string, headers: () => Record<string, string>): { answer?: Promise<string>; watch: boolean } {
    const liveId = s.anonLive ? LIVE_HEARTBEAT_RE.exec(url)?.[1] : undefined;
    if (liveId) return { answer: fakeLiveHeartbeat(liveId, headers()), watch: false };
    if (shouldBlock(url, body)) return { answer: Promise.resolve(FAKE_OK), watch: false };
    if (/graphql/.test(url)) rememberRequest(url, body, headers());
    return { watch: s.dmKeep && DATA_URL_RE.test(url) };
  }

  /** URLs worth a look; everything else passes straight through. */
  const API_RE = /graphql|\/api\/v[12]\//;

  function installNet() {
    const XHR = XMLHttpRequest.prototype;
    const origOpen = XHR.open;
    const origSend = XHR.send;
    const origSetHeader = XHR.setRequestHeader;
    const xhrs = new WeakMap<XMLHttpRequest, { url: string; headers: Record<string, string> }>();

    replace(XHR, 'open', disguise({
      open(this: XMLHttpRequest, ...args: unknown[]) {
        try {
          xhrs.set(this, { url: String(args[1]), headers: {} });
        } catch {
          /* not an XHR or a bad URL: the native call below throws as usual */
        }
        return apply(origOpen, this, args);
      },
    }.open, origOpen));

    replace(XHR, 'setRequestHeader', disguise({
      setRequestHeader(this: XMLHttpRequest, ...args: unknown[]) {
        try {
          const st = xhrs.get(this);
          if (st) st.headers[String(args[0])] = String(args[1]);
        } catch {
          /* let the native call decide */
        }
        return apply(origSetHeader, this, args);
      },
    }.setRequestHeader, origSetHeader));

    replace(XHR, 'send', disguise({
      send(this: XMLHttpRequest, ...args: unknown[]) {
        let r: ReturnType<typeof inspect> | undefined;
        const st = xhrs.get(this);
        try {
          if (st && API_RE.test(st.url)) r = inspect(st.url, bodyText(args[0]), () => st.headers);
        } catch {
          r = undefined;
        }
        if (r?.answer) {
          answerXhr(this, st!.url, r.answer);
          return undefined;
        }
        if (r?.watch) {
          this.addEventListener('load', () => {
            try {
              if (this.responseType === '' || this.responseType === 'text') sniffDm(this.responseText);
            } catch {
              /* ignore */
            }
          });
        }
        return apply(origSend, this, args);
      },
    }.send, origSend));

    const origFetch = window.fetch;
    function hooked(self: unknown, args: unknown[], url: string, text: string): Promise<Response> {
      const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
      let r: ReturnType<typeof inspect>;
      try {
        r = inspect(url, text, () => Object.fromEntries(new Headers(input instanceof Request ? input.headers : init?.headers)));
      } catch {
        return apply(origFetch, self, args) as Promise<Response>;
      }
      if (r.answer) return r.answer.then((body) => answerFetch(url, body));
      const p = apply(origFetch, self, args) as Promise<Response>;
      if (r.watch) p.then((res) => res.clone().text().then(sniffDm)).catch(() => {});
      return p;
    }

    replace(window, 'fetch', disguise({
      fetch(this: unknown, ...args: unknown[]) {
        try {
          const [input, init] = args as [RequestInfo | URL, RequestInit | undefined];
          const url = input instanceof Request ? input.url : String(input);
          if (!API_RE.test(url)) return apply(origFetch, this, args);
          // A Request object carries its own body, which can only be read asynchronously.
          if (input instanceof Request && init?.body == null && input.body) {
            return input
              .clone()
              .text()
              .then((text) => hooked(this, args, url, text), () => apply(origFetch, this, args));
          }
          return hooked(this, args, url, bodyText(init?.body));
        } catch {
          return apply(origFetch, this, args);
        }
      },
    }.fetch, origFetch));
  }

  const JSON_TYPE = 'application/json; charset=utf-8';

  function answerFetch(url: string, body: string): Response {
    const res = new Response(body, { status: 200, headers: { 'content-type': JSON_TYPE } });
    // A constructed Response has url '' and type 'default'; a real one has neither.
    defineProperty(res, 'url', { value: absolute(url), configurable: true });
    defineProperty(res, 'type', { value: 'basic', configurable: true });
    return res;
  }

  /** Play a successful response on an XHR that never went out, in the order a real one fires its events. */
  function answerXhr(xhr: XMLHttpRequest, url: string, answer: Promise<string>) {
    let state = 1;
    let body = '';
    const text = () => (xhr.responseType === '' || xhr.responseType === 'text' ? body : '');
    const props: Record<string, () => unknown> = {
      readyState: () => state,
      status: () => (state >= 2 ? 200 : 0),
      statusText: () => '',
      responseURL: () => (state >= 2 ? absolute(url) : ''),
      responseText: () => (state >= 3 ? text() : ''),
      response: () => (state < 4 ? (state >= 3 ? text() : '') : xhr.responseType === 'json' ? apply(natives.parse, JSON, [body]) : body),
    };
    for (const [k, get] of Object.entries(props)) defineProperty(xhr, k, { get, configurable: true });
    defineProperty(xhr, 'getResponseHeader', { value: (name: string) => (state >= 2 && /^content-type$/i.test(name) ? JSON_TYPE : null), configurable: true });
    defineProperty(xhr, 'getAllResponseHeaders', { value: () => (state >= 2 ? `content-type: ${JSON_TYPE}\r\n` : ''), configurable: true });

    const progress = (type: string) => new ProgressEvent(type, { lengthComputable: true, loaded: body.length, total: body.length });
    dispatchLater(xhr, progress('loadstart'));
    answer.then((b) => {
      body = b;
      // Timers run in order: each state change lands before the events that report it.
      later(() => (state = 2));
      dispatchLater(xhr, new Event('readystatechange'));
      later(() => (state = 3));
      dispatchLater(xhr, new Event('readystatechange'));
      dispatchLater(xhr, progress('progress'));
      later(() => (state = 4));
      dispatchLater(xhr, new Event('readystatechange'));
      dispatchLater(xhr, progress('load'));
      dispatchLater(xhr, progress('loadend'));
    });
  }

  // ---------------- socket hook: typing indicator / read receipts, DM gateway ----------------
  const DM_SOCKET_RE = /edge-chat\.instagram\.com|\/ws\/lightspeed/;
  const watched = new WeakSet<WebSocket>();

  function installSocket() {
    const origWsSend = WebSocket.prototype.send;
    replace(WebSocket.prototype, 'send', disguise({
      send(this: WebSocket, ...args: unknown[]) {
        let data = args[0];
        try {
          // The gateway client sends before the server says anything, so its first send finds it.
          if (!watched.has(this)) {
            watched.add(this);
            if (DM_GATEWAY_RE.test(this.url)) this.addEventListener('message', onGatewayMessage);
          }
          const f = { typing: s.dmHideTyping, seen: s.dmHideSeen };
          if ((f.typing || f.seen) && DM_SOCKET_RE.test(this.url)) {
            if (typeof data === 'string') {
              const out = filterLightspeedRequest(data, f);
              if (out === null) return undefined;
              data = out;
            } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
              const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
              const out = filterMqttFrame(bytes, f);
              if (out === null) {
                // The client waits for an acknowledgement of a QoS 1 publish; answer it ourselves.
                const ack = mqttPubAck(bytes);
                if (ack) dispatchLater(this, new MessageEvent('message', { data: this.binaryType === 'blob' ? new Blob([ack]) : ack.buffer, origin: new URL(this.url).origin }));
                return undefined;
              }
              if (out !== bytes) data = out;
            }
          }
        } catch {
          /* never break the chat socket */
        }
        return apply(origWsSend, this, data === args[0] ? args : [data]);
      },
    }.send, origWsSend));
  }

  // ---------------- DGW module: typing indicator ----------------
  // The current DM client publishes {"action":"indicate_activity", ...} to /ig_send_message through
  // Instagram's MqttBypassDGWClient module. Patch that module's send methods once Instagram defines
  // it, and drop only those calls.
  const decodeArg = (a: unknown): string => {
    if (typeof a === 'string') return a;
    if (a instanceof Uint8Array) return new TextDecoder().decode(a);
    if (a instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(a));
    return '';
  };
  const isTypingCall = (args: unknown[]) => args.some((a) => decodeArg(a).includes('"indicate_activity"'));
  const patchedProtos = new WeakSet<object>();

  function patchDgwClient(M: { prototype?: Record<string, unknown> } | undefined) {
    const P = M?.prototype;
    if (!P || patchedProtos.has(P)) return;
    patchedProtos.add(P);
    for (const name of ['send', 'sendAndForget', 'publish']) {
      const orig = P[name];
      if (typeof orig !== 'function') continue;
      const fake = {
        [name](this: unknown, ...args: unknown[]) {
          if (s.dmHideTyping && isTypingCall(args)) return name === 'send' ? Promise.resolve(undefined) : undefined;
          return apply(orig as (...a: unknown[]) => unknown, this, args);
        },
      }[name];
      replace(P, name, disguise(fake, orig as (...a: never[]) => unknown));
    }
  }

  // Instagram's module loader (requireLazy) appears after its bootstrap script runs. Pages that
  // never get one (embeds, error pages) stop looking after 30s.
  function installDgw() {
    const deadline = Date.now() + 30_000;
    const poll = () => {
      const w = window as unknown as { requireLazy?: (deps: string[], cb: (m: never) => void) => void };
      if (typeof w.requireLazy !== 'function') {
        if (Date.now() < deadline) later(poll, 200);
        return;
      }
      try {
        w.requireLazy(['MqttBypassDGWClient'], (m) => patchDgwClient(m));
      } catch {
        /* module system changed — feature stays inactive */
      }
    };
    poll();
  }

  // ---------------- links: clean copied share links, skip the l.instagram.com shim ----------------
  function installClipboard() {
    const C = (window as { Clipboard?: typeof Clipboard }).Clipboard?.prototype;
    const orig = C?.writeText;
    if (!C || !orig) return;
    replace(C, 'writeText', disguise({
      writeText(this: Clipboard, ...args: unknown[]) {
        try {
          const text = args[0];
          if (s.cleanLinks && typeof text === 'string' && isSingleInstagramUrl(text)) args = [cleanInstagramUrl(text, s.shareDomain), ...args.slice(1)];
        } catch {
          /* copy what Instagram asked for */
        }
        return apply(orig, this, args);
      },
    }.writeText, orig));
  }

  function installOpen() {
    const orig = window.open;
    replace(window, 'open', disguise({
      open(this: unknown, ...args: unknown[]) {
        try {
          const target = s.directLinks && args[0] != null ? unwrapLinkShim(String(args[0])) : undefined;
          if (target) args = [target, ...args.slice(1)];
        } catch {
          /* open what Instagram asked for */
        }
        return apply(orig, this, args);
      },
    }.open, orig));
  }

  // ---------------- installing hooks on demand ----------------
  const INSTALL: Record<Hook, () => void> = { net: installNet, socket: installSocket, dgw: installDgw, clipboard: installClipboard, open: installOpen };
  const installed = new Set<Hook>();

  // A hook stays installed once a setting needed it; with the setting off it just passes calls through.
  function applySettings(next: PageSettings) {
    s = next;
    for (const hook of hooksFor(s)) {
      if (installed.has(hook)) continue;
      installed.add(hook);
      try {
        INSTALL[hook]();
      } catch {
        /* leave this one native */
      }
    }
  }

  // ---------------- Relay store ----------------
  type Fiber = { memoizedProps?: Record<string, any>; return?: Fiber };
  let fiberKey: string | undefined;
  let relaySource: RelaySource | undefined;

  const fiberOf = (el: Element): Fiber | undefined => {
    if (!fiberKey) fiberKey = Object.keys(el).find((k) => k.startsWith('__reactFiber$'));
    return fiberKey ? (el as unknown as Record<string, Fiber>)[fiberKey] : undefined;
  };

  function findRelaySource(): RelaySource | undefined {
    for (const el of document.querySelectorAll('main div, div[role="main"] div, div')) {
      let f = fiberOf(el);
      for (let i = 0; i < 80 && f; i++, f = f.return) {
        const env = f.memoizedProps?.environment ?? f.memoizedProps?.value?.environment;
        if (env && typeof env.getStore === 'function') return env.getStore().getSource();
      }
    }
    return undefined;
  }

  // Finding the Relay store walks the whole DOM; after a miss, wait before trying again. Short, since
  // the first lookups come while the page is still rendering and the follow badge retries within seconds.
  const RELAY_RETRY_MS = 1000;
  let relayRetryAt = 0;
  function getRelaySource(): RelaySource | undefined {
    if (!relaySource && Date.now() >= relayRetryAt) {
      relaySource = findRelaySource();
      if (!relaySource) relayRetryAt = Date.now() + RELAY_RETRY_MS;
    }
    return relaySource;
  }

  /** A lookup in the store; a failure means the environment was replaced, so find it again next time. */
  function fromStore<T>(read: (src: RelaySource) => T): T | null {
    const src = getRelaySource();
    if (!src) return null;
    try {
      return read(src);
    } catch {
      relaySource = undefined;
      return null;
    }
  }

  // ---------------- DMs: voice messages ----------------
  // Voice bubbles are React components whose props reference a Relay record (XFBSlideAudioAttachment)
  // holding attachment_cdn_url. Point the content script at each bubble with its URL; it adds a
  // download button.
  const voiceBubbles = new Map<string, Element>();
  const voiceInfo = new WeakMap<Element, Found>();

  function insideVoiceBubble(el: Element): boolean {
    for (let a = el.parentElement; a; a = a.parentElement) if (voiceInfo.has(a)) return true;
    return false;
  }

  function findVoiceBubbles(src: RelaySource) {
    for (const [id, el] of voiceBubbles) if (!el.isConnected) voiceBubbles.delete(id);
    for (const el of document.querySelectorAll('div')) {
      if (voiceInfo.has(el)) continue;
      let f = fiberOf(el);
      for (let i = 0; i < 4 && f; i++, f = f.return) {
        const id: string | undefined = f.memoizedProps?.audioAttachmentRef?.__id;
        if (!id) continue;
        if (!voiceBubbles.has(id) && !insideVoiceBubble(el)) {
          const rec = src.get(id);
          if (rec?.attachment_cdn_url) {
            voiceBubbles.set(id, el);
            voiceInfo.set(el, { kind: 'voice', url: String(rec.attachment_cdn_url), id: String(rec.attachment_fbid ?? '') });
          }
        }
        break;
      }
    }
    for (const el of voiceBubbles.values()) report(el, voiceInfo.get(el)!);
  }

  // ---------------- DMs: chat rows for the unsent-message overlay ----------------
  // Each child of a chat's message list is one message; its React props reference the Relay record
  // (currentMessageRef → SlideMessage with message_id, timestamp_ms, thread_fbid). Telling the content
  // script those lets it put unsent messages back in the right place. Works for the full inbox and
  // the floating chat window.
  const ROW_SEED = '[data-igd-message-actions-hidden]';
  const lists = new Set<Element>();

  function messageRefOf(el: Element): string | undefined {
    let f = fiberOf(el);
    for (let i = 0; i < 2 && f; i++, f = f.return) {
      const id = f.memoizedProps?.currentMessageRef?.__id;
      if (typeof id === 'string') return id;
    }
    return undefined;
  }

  const inList = (el: Element) => [...lists].some((l) => l.contains(el));

  // Without the usual row marker every div on the page is a candidate, so that scan runs at most
  // every few seconds, and only while no chat list has been found.
  const FALLBACK_SCAN_MS = 3000;
  let fallbackScanAt = 0;

  function findLists() {
    for (const l of lists) if (!l.isConnected) lists.delete(l);
    const seeds: Element[] = [...document.querySelectorAll(ROW_SEED)];
    if (!seeds.length && !lists.size && location.pathname.startsWith('/direct/') && Date.now() >= fallbackScanAt) {
      fallbackScanAt = Date.now() + FALLBACK_SCAN_MS;
      seeds.push(...document.querySelectorAll('div'));
    }
    for (const seed of seeds) {
      if (inList(seed)) continue;
      for (let x: Element | null = seed, i = 0; x && i < 10; x = x.parentElement, i++) {
        if (messageRefOf(x) && x.parentElement) {
          lists.add(x.parentElement);
          break;
        }
      }
    }
  }

  function findDmRows(src: RelaySource) {
    for (const list of lists) {
      report(list, { kind: 'dm-list' });
      for (const row of list.children) {
        const ref = messageRefOf(row);
        const rec = ref ? src.get(ref) : undefined;
        if (!rec?.message_id) continue;
        report(row, { kind: 'dm-row', mid: String(rec.message_id), ts: Number(rec.timestamp_ms ?? 0), thread: String(rec.thread_fbid ?? '') });
      }
    }
  }

  /** The content script asks after Instagram's DOM changed (it already watches it). */
  function scan() {
    try {
      const voice = s.voice && location.pathname.startsWith('/direct/');
      if (s.dmKeep) findLists();
      // No chat open: skip the (expensive) Relay lookup.
      if (voice || lists.size) {
        const src = getRelaySource();
        if (src) {
          if (voice) findVoiceBubbles(src);
          if (s.dmKeep) findDmRows(src);
        }
      }
    } catch {
      relaySource = undefined; // environment may have been replaced; find it again next time
    }
    send({ t: 'scanned' });
  }

  // ---------------- RPC for the content script ----------------
  async function replay(name: string, patch: (vars: Record<string, unknown>) => Record<string, unknown>) {
    const t = templates.get(name);
    if (!t) throw new Error(`NO_TEMPLATE:${name}`);
    const params = new URLSearchParams(t.body);
    params.set('variables', apply(natives.stringify, JSON, [patch(apply(natives.parse, JSON, [params.get('variables') ?? '{}']))]));
    for (const [k, v] of Object.entries(tokens)) if (params.has(k)) params.set(k, v);
    if (params.has('__req')) params.set('__req', (++lastReq).toString(36));
    const headers = { ...t.headers };
    for (const k of Object.keys(headers)) if (/^x-fb-lsd$/i.test(k) && tokens.lsd) headers[k] = tokens.lsd;
    const res = await nativeFetch(t.url, { method: 'POST', credentials: 'include', headers, body: params.toString() });
    if (res.status === 429) throw new Error('RATE_LIMITED');
    const text = await res.text();
    const json = apply(natives.parse, JSON, [text.startsWith('for (;;);') ? text.slice(9) : text]);
    if (json.errors?.length && !json.data) throw new Error(json.errors[0].message ?? 'GraphQL error');
    return json;
  }

  const ops: Record<string, (a: any) => unknown> = {
    getMedia: ({ code }) => fromStore((src) => findMedia(src, String(code))),
    getUser: ({ username }) => fromStore((src) => findUser(src, String(username))),
    getReel: ({ id }) => fromStore((src) => findReel(src, String(id))),
    hasTemplate: ({ name }) => templates.has(name),
    profilePosts: async ({ username, after }) => {
      const json = await replay('PolarisProfilePostsQuery', (v) => {
        const next: Record<string, unknown> = { ...v, username };
        if (after) Object.assign(next, { after, before: null, first: 12, last: null });
        else delete next.after;
        return next;
      });
      const conn = json.data?.xdt_api__v1__feed__user_timeline_graphql_connection;
      return {
        items: (conn?.edges ?? []).map((e: { node: unknown }) => e.node),
        next: conn?.page_info?.has_next_page ? conn.page_info.end_cursor : null,
      };
    },
    profileInfo: async ({ id }) => {
      const json = await replay('PolarisProfilePageContentQuery', (v) => ({ ...v, id }));
      return json.data?.user ?? null;
    },
  };

  async function onRpc(m: Extract<ToPage, { t: 'rpc' }>) {
    try {
      if (!Object.hasOwn(ops, m.op)) throw new Error(`Unknown op ${m.op}`);
      send({ t: 'rpc-reply', id: m.id, ok: true, result: await ops[m.op](m.args ?? {}) });
    } catch (err) {
      send({ t: 'rpc-reply', id: m.id, ok: false, error: String((err as Error)?.message ?? err) });
    }
  }

  offerPort(window, (p, init) => {
    port = p;
    foundEvent = init.found;
    p.onmessage = (e: MessageEvent) => {
      const m = e.data as ToPage;
      if (m?.t === 'settings') applySettings(m.s);
      else if (m?.t === 'rpc') onRpc(m);
      else if (m?.t === 'scan') scan();
    };
  });
})();
