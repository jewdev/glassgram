// Headers for our REST calls, matching what Instagram's own web client sends on /api/v1/ requests,
// so they don't stand out from its traffic. Checked against instagram.com on 2026-10-19.

/** Instagram web app id. */
export const APP_ID = '936619743392459';
/** Sent with every request by Instagram's current web build. Update when Instagram changes it. */
export const ASBD_ID = '359341';

export interface HeaderSource {
  csrf?: string;
  /** sessionStorage `www-claim-v2`, which Instagram keeps up to date from its responses. */
  claim?: string | null;
  /** localStorage `Session`; the part before ':' starts X-Web-Session-ID. */
  session?: string | null;
  /** sessionStorage `TabId`. */
  tab?: string | null;
  /** Third X-Web-Session-ID part, made up once per page load. */
  pageId: string;
  maxTouchPoints: number;
}

const ID_RE = /^[a-z0-9]+$/i;

export function restHeaders(src: HeaderSource): Record<string, string> {
  const h: Record<string, string> = {
    'X-CSRFToken': src.csrf ?? '',
    'X-IG-App-ID': APP_ID,
    'X-ASBD-ID': ASBD_ID,
    'X-IG-WWW-Claim': src.claim || '0',
  };
  const session = src.session?.split(':')[0];
  if (session && ID_RE.test(session) && src.tab && ID_RE.test(src.tab)) h['X-Web-Session-ID'] = `${session}:${src.tab}:${src.pageId}`;
  h['X-IG-Max-Touch-Points'] = String(src.maxTouchPoints);
  h.Accept = '*/*';
  h['X-Requested-With'] = 'XMLHttpRequest';
  return h;
}

/** Six lowercase letters and digits, like the parts of Instagram's own session ids. */
export function randomPageId(rand: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand() * 36)];
  return s;
}
