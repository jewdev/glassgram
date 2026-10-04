// Runs in the page's MAIN world at document_start, before Instagram's own scripts.
//
// 1. Anonymous stories: when enabled (attribute set by the content script), swallow
//    the requests that mark stories as seen.
// 2. Data bridge: Instagram's web app loads most data through GraphQL. We passively
//    cache users/media from its responses and remember request templates of a few
//    queries so the content script can paginate the same way Instagram does.
//    The content script talks to us via window.postMessage RPC (see content/core/bridge.ts).

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
    if (anonEnabled() && isSeenRequest(url, text)) {
      console.debug('[IGE] blocked story seen request', url);
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
    if (anonEnabled() && isSeenRequest(url, text)) {
      console.debug('[IGE] blocked story seen request', url);
      return Promise.resolve(new Response(FAKE_OK, { status: 200, headers: { 'Content-Type': 'application/json' } }));
    }
    const p = origFetch.call(this, input, init);
    if (DATA_URL_RE.test(url)) {
      p.then((r) => r.clone().text().then(sniff)).catch(() => {});
    }
    return p;
  };

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
