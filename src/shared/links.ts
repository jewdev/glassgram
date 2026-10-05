// Link helpers shared by the content script and the MAIN-world script (keep dependency-free).

/** Query params Instagram/Meta add for tracking. `img_index` and other functional params are kept. */
const TRACKING_PARAM = /^(utm_[a-z_]+|igsh|igshid|stkn|ig_rid|ig_mid|fbclid|xmt|si|_branch_match_id|_branch_referrer)$/i;

const IG_HOST = /(^|\.)instagram\.com$/i;

/** Remove tracking params from an Instagram URL and optionally swap its domain (e.g. "kkinstagram.com"). */
export function cleanInstagramUrl(input: string, domain = ''): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    return input;
  }
  if (!/^https?:$/.test(u.protocol) || !IG_HOST.test(u.hostname) || u.hostname === 'l.instagram.com') return input;
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAM.test(key)) u.searchParams.delete(key);
  const host = domain.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) u.hostname = host;
  return u.toString();
}

/** l.instagram.com/?u=<target>&e=… → <target>. Returns undefined if `input` isn't a redirect shim. */
export function unwrapLinkShim(input: string): string | undefined {
  let u: URL;
  try {
    u = new URL(input, 'https://www.instagram.com');
  } catch {
    return undefined;
  }
  if (!/^l\.(instagram|facebook)\.com$/i.test(u.hostname)) return undefined;
  const target = u.searchParams.get('u');
  if (!target) return undefined;
  try {
    const t = new URL(target);
    return /^https?:$/.test(t.protocol) ? t.toString() : undefined;
  } catch {
    return undefined;
  }
}

/** True when `text` is a single Instagram URL (what "Copy link" puts on the clipboard). */
export function isSingleInstagramUrl(text: string): boolean {
  const t = text.trim();
  if (!t || /\s/.test(t)) return false;
  try {
    const u = new URL(t);
    return IG_HOST.test(u.hostname) && u.hostname !== 'l.instagram.com';
  } catch {
    return false;
  }
}
