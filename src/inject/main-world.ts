// Runs in the page's MAIN world at document_start, before Instagram's own scripts.
//
// 1. Anonymous stories: when enabled (attribute set by the content script), swallow
//    the requests that mark stories as seen.
// 2. Data bridge: Instagram's web app loads most data through GraphQL. We passively
//    cache users/media from its responses and remember request templates of a few
//    queries so the content script can paginate the same way Instagram does.
//    The content script talks to us via window.postMessage RPC (see content/core/bridge.ts).

import { filterLightspeedRequest, filterMqttFrame } from '../shared/lightspeed';
import { cleanInstagramUrl, isSingleInstagramUrl, unwrapLinkShim } from '../shared/links';

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
        walk(JSON.parse(part));
      } catch {
        /* not JSON */
      }
    }
  }

  const DATA_URL_RE = /\/(api\/graphql|graphql\/query|api\/v1\/)/;

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
    if (shouldBlock(url, text)) {
      console.debug('[IGE] blocked seen request', url);
      // Pretend success so Instagram doesn't retry.
      Object.defineProperty(this, 'readyState', { value: 4 });
      Object.defineProperty(this, 'status', { value: 200 });
      Object.defineProperty(this, 'responseText', { value: FAKE_OK });
      Object.defineProperty(this, 'response', { value: FAKE_OK });
      setTimeout(() => {
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new ProgressEvent('load'));
        this.dispatchEvent(new ProgressEvent('loadend'));
      }, 0);
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
    const url = input instanceof Request ? input.url : String(input);
    const text = bodyText(init?.body);
    if (shouldBlock(url, text)) {
      console.debug('[IGE] blocked seen request', url);
      return Promise.resolve(new Response(FAKE_OK, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    const p = origFetch.call(this, input, init);
    if (DATA_URL_RE.test(url)) {
      p.then((r) => r.clone().text().then(sniff)).catch(() => {});
    }
    return p;
  };

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
          if (out === null) return console.debug('[IGE] DM typing/seen frame dropped');
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

  // Instagram's module loader (requireLazy) appears after its bootstrap script runs.
  const waitForLoader = window.setInterval(() => {
    const w = window as unknown as { requireLazy?: (deps: string[], cb: (m: never) => void) => void };
    if (typeof w.requireLazy !== 'function') return;
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

  function tagVoiceBubbles() {
    if (attr('data-ige-voice') !== '1' || !location.pathname.startsWith('/direct/')) return;
    relaySource ??= findRelaySource();
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

  let voiceTimer: number | undefined;
  new MutationObserver(() => {
    if (voiceTimer !== undefined || attr('data-ige-voice') !== '1' || !location.pathname.startsWith('/direct/')) return;
    voiceTimer = window.setTimeout(() => {
      voiceTimer = undefined;
      try {
        tagVoiceBubbles();
      } catch {
        relaySource = undefined; // environment may have been replaced; find it again next time
      }
    }, 700);
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
    if (e.source !== window || !d || d.__ige !== 'rpc' || !(d.op in ops)) return;
    try {
      const result = await ops[d.op](d.args ?? {});
      window.postMessage({ __ige: 'rpc-reply', id: d.id, ok: true, result }, location.origin);
    } catch (err) {
      window.postMessage({ __ige: 'rpc-reply', id: d.id, ok: false, error: String((err as Error)?.message ?? err) }, location.origin);
    }
  });
})();
