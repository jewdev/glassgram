// Runs in the page's MAIN world at document_start, before Instagram's own scripts.
//
// 1. Anonymous stories: when enabled (attribute set by the content script), swallow
//    the requests that mark stories as seen.
// 2. Data bridge: Instagram's web app loads most data through GraphQL. We passively
//    cache users/media from its responses and remember request templates of a few
//    queries so the content script can paginate the same way Instagram does.
//    The content script talks to us via window.postMessage RPC (see content/core/bridge.ts).

import { filterLightspeedRequest, filterMqttFrame, mqttPubAck } from '../shared/lightspeed';
import { cleanInstagramUrl, isSingleInstagramUrl, unwrapLinkShim } from '../shared/links';
import { collectDmEvents, decodeGatewayFrame, type DmEvent } from '../shared/slide';

(() => {
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

  // ---------------- anonymous stories ----------------
  // REST endpoints that mark stories seen.
  const SEEN_URL_RE = /stories\/reel\/seen|media\/seen/i;
  // GraphQL operation names, e.g. PolarisAPIReelSeenMutation, PolarisStoriesV3SeenMutation (not DM "seen").
  const SEEN_OP_RE = /(stor(y|ies)|reel).*seen|seen.*(stor(y|ies)|reel)/i;
  const anonEnabled = () => document.documentElement.getAttribute('data-ige-anon') === '1';
  const isSeenRequest = (url: string, body: string) =>
    SEEN_URL_RE.test(url) || (/graphql|\/api\/v1\//.test(url) && SEEN_OP_RE.test(friendlyName(body)));
  const FAKE_OK = '{"status":"ok","data":{}}';

  // ---------------- DM "Seen" ----------------
  // Instagram's current DM client marks threads read with these GraphQL mutations
  // (useIGDMarkThreadAsReadMutation / ...ValidationMutation); older clients used a REST endpoint.
  const DM_SEEN_OP_RE = /IGDMarkThreadAsRead/;
  const DM_SEEN_URL_RE = /\/direct_v2\/threads\/[^/]+\/items\/[^/]+\/seen/;
  const dmSeenEnabled = () => document.documentElement.getAttribute('data-ige-dmseen') === '1';
  const isDmSeenRequest = (url: string, body: string) => DM_SEEN_URL_RE.test(url) || (/graphql/.test(url) && DM_SEEN_OP_RE.test(friendlyName(body)));

  // ---------------- anonymous live ----------------
  // Watching a live broadcast POSTs heartbeat_and_get_viewer_count every few seconds; that heartbeat
  // is what lists you as a viewer. We answer it from the read-only /info/ endpoint instead, so the
  // player still gets a real viewer count and notices when the broadcast ends.
  const LIVE_HEARTBEAT_RE = /\/api\/v1\/live\/(\d+)\/heartbeat_and_get_viewer_count\//;
  const anonLiveEnabled = () => document.documentElement.getAttribute('data-ige-anonlive') === '1';
  const liveHeartbeatId = (url: string) => (anonLiveEnabled() ? LIVE_HEARTBEAT_RE.exec(url)?.[1] : undefined);

  async function fakeLiveHeartbeat(broadcastId: string, headers: Record<string, string>): Promise<string> {
    let info: { viewer_count?: number; broadcast_status?: string } = {};
    try {
      const res = await origFetch(`/api/v1/live/${broadcastId}/info/`, { credentials: 'include', headers });
      if (res.ok) info = await res.json();
    } catch {
      /* answer with defaults */
    }
    console.debug('[IGE] live heartbeat replaced with info lookup');
    return JSON.stringify({ viewer_count: info.viewer_count ?? 0, broadcast_status: info.broadcast_status ?? 'active', status: 'ok' });
  }

  /** Requests we swallow (answering with a fake success so Instagram doesn't retry). */
  const shouldBlock = (url: string, body: string) =>
    (anonEnabled() && isSeenRequest(url, body)) || (dmSeenEnabled() && isDmSeenRequest(url, body));

  // ---------------- data cache ----------------
  interface UserInfo {
    id: string;
    hd?: { url: string; width: number; height: number };
    /** Relationship with the logged-in user, when Instagram sent it. */
    fs?: { following: boolean; followed_by: boolean };
  }
  const MAX_MEDIA = 600;
  const users = new Map<string, UserInfo>();
  const media = new Map<string, unknown>();
  const TEMPLATE_NAMES = new Set(['PolarisProfilePostsQuery', 'PolarisProfilePageContentQuery']);
  const templates = new Map<string, { url: string; body: string; headers: Record<string, string> }>();

  function remember(o: Record<string, any>) {
    if (typeof o.username === 'string' && (o.pk || o.id)) {
      const key = o.username.toLowerCase();
      const prev = users.get(key);
      const hd = o.hd_profile_pic_url_info?.url ? o.hd_profile_pic_url_info : prev?.hd;
      const f = o.friendship_status;
      const fs = f && typeof f.followed_by === 'boolean' ? { following: !!f.following, followed_by: f.followed_by } : prev?.fs;
      users.set(key, { id: String(o.pk ?? o.id), hd, fs });
    }
    if (typeof o.code === 'string' && (o.image_versions2 || o.carousel_media || o.video_versions)) {
      media.delete(o.code);
      media.set(o.code, o);
      if (media.size > MAX_MEDIA) media.delete(media.keys().next().value!);
    }
  }

  function walk(root: unknown) {
    const stack: unknown[] = [root];
    let budget = 50000;
    while (stack.length && budget-- > 0) {
      const v = stack.pop();
      if (!v || typeof v !== 'object') continue;
      if (Array.isArray(v)) {
        for (const x of v) if (x && typeof x === 'object') stack.push(x);
        continue;
      }
      remember(v as Record<string, any>);
      for (const k in v) {
        const x = (v as Record<string, unknown>)[k];
        if (x && typeof x === 'object') stack.push(x);
      }
    }
  }

  function sniff(text: string) {
    if (!text || text.length < 20) return;
    const clean = text.startsWith('for (;;);') ? text.slice(9) : text;
    // GraphQL may stream several JSON documents separated by newlines.
    for (const part of clean.includes('\n{') ? clean.split(/\n(?=\{)/) : [clean]) {
      try {
        const doc = JSON.parse(part);
        walk(doc);
        if (dmKeepEnabled() && part.includes('"message_id"')) postDmEvents(collectDmEvents(doc));
      } catch {
        /* not JSON */
      }
    }
  }

  const DATA_URL_RE = /\/(api\/graphql|graphql\/query|api\/v1\/)/;

  // ---------------- DMs: keep unsent messages ----------------
  // Incoming messages and unsends arrive on the gateway socket (see shared/slide.ts); thread history
  // loaded over HTTP carries the same message objects. We only forward them — the content script
  // decides what to keep and stores it in extension storage.
  const dmKeepEnabled = () => document.documentElement.getAttribute('data-ige-dmkeep') === '1';
  const DM_GATEWAY_RE = /gateway\.instagram\.com\/ws\/lightspeed/;

  function postDmEvents(events: DmEvent[]) {
    if (events.length) window.postMessage({ __ige: 'dm-events', events }, location.origin);
  }

  function onGatewayMessage(e: MessageEvent) {
    if (!dmKeepEnabled()) return;
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

  // Listen on the socket from the moment Instagram creates it.
  window.WebSocket = new Proxy(WebSocket, {
    construct(target, args: ConstructorParameters<typeof WebSocket>, newTarget) {
      const ws = Reflect.construct(target, args, newTarget) as WebSocket;
      try {
        if (DM_GATEWAY_RE.test(String(args[0]))) ws.addEventListener('message', onGatewayMessage);
      } catch {
        /* never break the socket */
      }
      return ws;
    },
  });

  // ---------------- XHR ----------------
  type X = XMLHttpRequest & { __igeUrl?: string; __igeHeaders?: Record<string, string> };
  const XHR = XMLHttpRequest.prototype;
  const origOpen = XHR.open;
  const origSend = XHR.send;
  const origSetHeader = XHR.setRequestHeader;

  XHR.open = function (this: X, method: string, url: string | URL, ...rest: unknown[]) {
    this.__igeUrl = String(url);
    this.__igeHeaders = {};
    return (origOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof XHR.open;

  XHR.setRequestHeader = function (this: X, k: string, v: string) {
    if (this.__igeHeaders) this.__igeHeaders[k] = v;
    return origSetHeader.call(this, k, v);
  };

  XHR.send = function (this: X, body?: Document | XMLHttpRequestBodyInit | null) {
    const url = this.__igeUrl ?? '';
    const text = bodyText(body);
    const liveId = liveHeartbeatId(url);
    if (shouldBlock(url, text) || liveId) {
      console.debug('[IGE] answered locally', url);
      // Pretend success so Instagram doesn't retry.
      const answer = liveId ? fakeLiveHeartbeat(liveId, this.__igeHeaders ?? {}) : Promise.resolve(FAKE_OK);
      answer.then((body) => {
        Object.defineProperty(this, 'readyState', { value: 4 });
        Object.defineProperty(this, 'status', { value: 200 });
        Object.defineProperty(this, 'responseText', { value: body });
        Object.defineProperty(this, 'response', { value: this.responseType === 'json' ? JSON.parse(body) : body });
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new ProgressEvent('load'));
        this.dispatchEvent(new ProgressEvent('loadend'));
      });
      return;
    }
    const name = friendlyName(text);
    if (TEMPLATE_NAMES.has(name)) templates.set(name, { url: url.split('?')[0], body: text, headers: { ...this.__igeHeaders } });
    if (DATA_URL_RE.test(url)) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') sniff(this.responseText);
        } catch {
          /* ignore */
        }
      });
    }
    return origSend.call(this, body);
  };

  // ---------------- fetch ----------------
  const origFetch = window.fetch;
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    // A Request object carries its own body, which can only be read asynchronously.
    if (input instanceof Request && init?.body == null && input.body) {
      return input
        .clone()
        .text()
        .then((text) => hookedFetch.call(this, input, init, text));
    }
    return hookedFetch.call(this, input, init, bodyText(init?.body));
  };

  function hookedFetch(this: unknown, input: RequestInfo | URL, init: RequestInit | undefined, text: string): Promise<Response> {
    const url = input instanceof Request ? input.url : String(input);
    const liveId = liveHeartbeatId(url);
    if (shouldBlock(url, text) || liveId) {
      console.debug('[IGE] answered locally', url);
      const headers = Object.fromEntries(new Headers(input instanceof Request ? input.headers : init?.headers));
      return (liveId ? fakeLiveHeartbeat(liveId, headers) : Promise.resolve(FAKE_OK)).then(
        (body) => new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }),
      );
    }
    const p = origFetch.call(this, input, init);
    if (DATA_URL_RE.test(url)) {
      p.then((r) => r.clone().text().then(sniff)).catch(() => {});
    }
    return p;
  }

  // ---------------- links: clean copied share links, skip the l.instagram.com shim ----------------
  const attr = (name: string) => document.documentElement.getAttribute(name);

  const clip = navigator.clipboard;
  if (clip?.writeText) {
    const origWriteText = clip.writeText.bind(clip);
    clip.writeText = (text: string) =>
      origWriteText(attr('data-ige-cleanlinks') === '1' && isSingleInstagramUrl(text) ? cleanInstagramUrl(text, attr('data-ige-sharedomain') ?? '') : text);
  }

  const origWindowOpen = window.open;
  window.open = function (url?: string | URL, ...rest: unknown[]) {
    const target = url != null && attr('data-ige-directlinks') === '1' ? unwrapLinkShim(String(url)) : undefined;
    return (origWindowOpen as (...a: unknown[]) => Window | null).call(window, target ?? url, ...rest);
  } as typeof window.open;

  // ---------------- DMs: hide typing indicator / read receipts (experimental) ----------------
  const DM_SOCKET_RE = /edge-chat\.instagram\.com|\/ws\/lightspeed/;
  const origWsSend = WebSocket.prototype.send;
  WebSocket.prototype.send = function (this: WebSocket, data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    const f = { typing: attr('data-ige-dmtyping') === '1', seen: attr('data-ige-dmseen') === '1' };
    if ((f.typing || f.seen) && DM_SOCKET_RE.test(this.url)) {
      try {
        if (typeof data === 'string') {
          const out = filterLightspeedRequest(data, f);
          if (out === null) return console.debug('[IGE] DM typing/seen request dropped');
          data = out;
        } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
          const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
          const out = filterMqttFrame(bytes, f);
          if (out === null) {
            // The client waits for an acknowledgement of a QoS 1 publish; answer it ourselves.
            const ack = mqttPubAck(bytes);
            if (ack) setTimeout(() => this.dispatchEvent(new MessageEvent('message', { data: this.binaryType === 'blob' ? new Blob([ack]) : ack.buffer })));
            return console.debug('[IGE] DM typing/seen frame dropped');
          }
          if (out !== bytes) data = out;
        }
      } catch {
        /* never break the chat socket */
      }
    }
    return origWsSend.call(this, data as never);
  };

  // Typing indicator: the current DM client publishes {"action":"indicate_activity", ...} to
  // /ig_send_message through Instagram's MqttBypassDGWClient module. Patch that module's send
  // methods once Instagram defines it, and drop only those calls.
  const decodeArg = (a: unknown): string => {
    if (typeof a === 'string') return a;
    if (a instanceof Uint8Array) return new TextDecoder().decode(a);
    if (a instanceof ArrayBuffer) return new TextDecoder().decode(new Uint8Array(a));
    return '';
  };
  const isTypingCall = (args: unknown[]) => args.some((a) => decodeArg(a).includes('"indicate_activity"'));

  function patchDgwClient(M: { prototype?: Record<string, unknown> } | undefined) {
    const P = M?.prototype as (Record<string, unknown> & { __igePatched?: boolean }) | undefined;
    if (!P || P.__igePatched) return;
    P.__igePatched = true;
    for (const name of ['send', 'sendAndForget', 'publish']) {
      const orig = P[name];
      if (typeof orig !== 'function') continue;
      P[name] = function (this: unknown, ...args: unknown[]) {
        if (attr('data-ige-dmtyping') === '1' && isTypingCall(args)) {
          console.debug('[IGE] typing indicator suppressed');
          return name === 'send' ? Promise.resolve(undefined) : undefined;
        }
        return (orig as (...a: unknown[]) => unknown).apply(this, args);
      };
    }
  }

  // Instagram's module loader (requireLazy) appears after its bootstrap script runs. Pages that
  // never get one (embeds, error pages) stop looking after 30s.
  const loaderDeadline = Date.now() + 30_000;
  const waitForLoader = window.setInterval(() => {
    const w = window as unknown as { requireLazy?: (deps: string[], cb: (m: never) => void) => void };
    if (typeof w.requireLazy !== 'function') {
      if (Date.now() > loaderDeadline) clearInterval(waitForLoader);
      return;
    }
    clearInterval(waitForLoader);
    try {
      w.requireLazy(['MqttBypassDGWClient'], (m) => patchDgwClient(m));
    } catch {
      /* module system changed — feature stays inactive */
    }
  }, 200);

  // ---------------- DMs: voice messages ----------------
  // Voice bubbles are React components whose props reference a Relay record (XFBSlideAudioAttachment)
  // holding attachment_cdn_url. React/Relay data is only visible in this world, so tag each bubble's
  // element with the URL; the content script reads the attributes and adds a download button.
  type Fiber = { memoizedProps?: Record<string, any>; return?: Fiber };
  type RelaySource = { get(id: string): Record<string, any> | undefined };
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

  // Finding the Relay store walks the whole DOM; after a miss, wait before trying again.
  const RELAY_RETRY_MS = 5000;
  let relayRetryAt = 0;
  function getRelaySource(): RelaySource | undefined {
    if (!relaySource && Date.now() >= relayRetryAt) {
      relaySource = findRelaySource();
      if (!relaySource) relayRetryAt = Date.now() + RELAY_RETRY_MS;
    }
    return relaySource;
  }

  function tagVoiceBubbles() {
    if (attr('data-ige-voice') !== '1' || !location.pathname.startsWith('/direct/')) return;
    const relaySource = getRelaySource();
    if (!relaySource) return;
    const tagged = new Set<string>();
    document.querySelectorAll('[data-ige-voice-ref]').forEach((el) => tagged.add(el.getAttribute('data-ige-voice-ref')!));
    for (const el of document.querySelectorAll('div:not([data-ige-voice-ref])')) {
      let f = fiberOf(el);
      for (let i = 0; i < 4 && f; i++, f = f.return) {
        const id: string | undefined = f.memoizedProps?.audioAttachmentRef?.__id;
        if (!id) continue;
        if (!tagged.has(id) && !el.parentElement?.closest('[data-ige-voice-ref]')) {
          const rec = relaySource.get(id);
          if (rec?.attachment_cdn_url) {
            tagged.add(id);
            el.setAttribute('data-ige-voice-ref', id);
            el.setAttribute('data-ige-voice-url', rec.attachment_cdn_url);
            el.setAttribute('data-ige-voice-id', String(rec.attachment_fbid ?? ''));
          }
        }
        break;
      }
    }
  }

  // ---------------- DMs: tag chat rows for the unsent-message overlay ----------------
  // Each child of a chat's message list is one message; its React props reference the Relay record
  // (currentMessageRef → SlideMessage with message_id, timestamp_ms, thread_fbid). We copy those onto
  // the row so the content script can put unsent messages back in the right place. Works for the
  // full inbox and the floating chat window.
  const ROW_SEED = '[data-igd-message-actions-hidden]';
  const LIST_MARK = 'data-ige-dmlist';

  function messageRefOf(el: Element): string | undefined {
    let f = fiberOf(el);
    for (let i = 0; i < 2 && f; i++, f = f.return) {
      const id = f.memoizedProps?.currentMessageRef?.__id;
      if (typeof id === 'string') return id;
    }
    return undefined;
  }

  // Without the usual row marker every div on the page is a candidate, so that scan runs at most
  // every few seconds, and only while no chat list has been found.
  const FALLBACK_SCAN_MS = 3000;
  let fallbackScanAt = 0;

  function findLists(): Set<Element> {
    const lists = new Set<Element>(document.querySelectorAll(`[${LIST_MARK}]`));
    const seeds: Element[] = [...document.querySelectorAll(ROW_SEED)];
    if (!seeds.length && !lists.size && location.pathname.startsWith('/direct/') && Date.now() >= fallbackScanAt) {
      fallbackScanAt = Date.now() + FALLBACK_SCAN_MS;
      seeds.push(...document.querySelectorAll('div'));
    }
    for (const seed of seeds) {
      if (seed.closest(`[${LIST_MARK}]`)) continue;
      for (let x: Element | null = seed, i = 0; x && i < 10; x = x.parentElement, i++) {
        if (messageRefOf(x) && x.parentElement) {
          lists.add(x.parentElement);
          x.parentElement.setAttribute(LIST_MARK, '');
          break;
        }
      }
    }
    return lists;
  }

  function tagDmRows() {
    if (!dmKeepEnabled()) return;
    const lists = findLists();
    if (!lists.size) return; // no chat open — skip the (expensive) Relay lookup
    const relaySource = getRelaySource();
    if (!relaySource) return;
    for (const list of lists) {
      for (const row of list.children) {
        const ref = messageRefOf(row);
        const rec = ref ? relaySource.get(ref) : undefined;
        if (!rec?.message_id) continue;
        if (row.getAttribute('data-ige-mid') === rec.message_id) continue;
        row.setAttribute('data-ige-mid', rec.message_id);
        row.setAttribute('data-ige-ts', String(rec.timestamp_ms ?? ''));
        row.setAttribute('data-ige-thread', String(rec.thread_fbid ?? ''));
      }
    }
  }

  let domTimer: number | undefined;
  new MutationObserver(() => {
    if (domTimer !== undefined) return;
    const voice = attr('data-ige-voice') === '1' && location.pathname.startsWith('/direct/');
    if (!voice && !dmKeepEnabled()) return;
    domTimer = window.setTimeout(() => {
      domTimer = undefined;
      try {
        if (voice) tagVoiceBubbles();
        tagDmRows();
      } catch {
        relaySource = undefined; // environment may have been replaced; find it again next time
      }
    }, 500);
  }).observe(document, { childList: true, subtree: true });

  // ---------------- RPC for the content script ----------------
  async function replay(name: string, patch: (vars: Record<string, unknown>) => Record<string, unknown>) {
    const t = templates.get(name);
    if (!t) throw new Error(`NO_TEMPLATE:${name}`);
    const params = new URLSearchParams(t.body);
    params.set('variables', JSON.stringify(patch(JSON.parse(params.get('variables') ?? '{}'))));
    const res = await origFetch(t.url, { method: 'POST', credentials: 'include', headers: t.headers, body: params.toString() });
    if (res.status === 429) throw new Error('RATE_LIMITED');
    const text = await res.text();
    sniff(text);
    const json = JSON.parse(text.startsWith('for (;;);') ? text.slice(9) : text);
    if (json.errors?.length && !json.data) throw new Error(json.errors[0].message ?? 'GraphQL error');
    return json;
  }

  const ops: Record<string, (a: any) => unknown> = {
    getMedia: ({ code }) => media.get(code) ?? null,
    getUser: ({ username }) => users.get(String(username).toLowerCase()) ?? null,
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

  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.__ige !== 'rpc' || typeof d.op !== 'string' || !Object.hasOwn(ops, d.op)) return;
    try {
      const result = await ops[d.op](d.args ?? {});
      window.postMessage({ __ige: 'rpc-reply', id: d.id, ok: true, result }, location.origin);
    } catch (err) {
      window.postMessage({ __ige: 'rpc-reply', id: d.id, ok: false, error: String((err as Error)?.message ?? err) }, location.origin);
    }
  });
})();
