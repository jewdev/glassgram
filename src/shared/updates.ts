// Update check against GitHub Releases. Pure helpers here; the fetching lives in the background worker.

export const REPO = 'jewdev/glassgram';
export const RELEASES_URL = `https://github.com/${REPO}/releases`;
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases?per_page=20`;
export const UPDATE_KEY = 'updates';

export interface Release {
  version: string;
  name: string;
  /** Release body (Markdown). */
  notes: string;
  url: string;
  zipUrl?: string;
  publishedAt: string;
}

export interface UpdateState {
  /** Published releases, newest first. */
  releases: Release[];
  checkedAt?: number;
  error?: string;
  /** Version the user chose to skip; hidden until a newer one ships. */
  skipped?: string;
  /** Set when the extension was updated, until the user dismisses the "What's new" card. */
  updatedFrom?: string;
}

export const EMPTY_STATE: UpdateState = { releases: [] };

/** "v1.2.0" / "1.2" → [1, 2, 0]. Pre-release suffixes are ignored. */
function parts(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split(/[-+]/)[0]
    .split('.')
    .map((n) => Number.parseInt(n, 10) || 0);
}

/** Negative if a < b, 0 if equal, positive if a > b. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

type ApiAsset = { name: string; browser_download_url: string };
type ApiRelease = { tag_name: string; name?: string | null; body?: string | null; html_url: string; draft: boolean; prerelease: boolean; published_at?: string | null; assets?: ApiAsset[] };

/** GitHub's /releases response → published releases, newest version first. */
export function parseReleases(json: unknown): Release[] {
  if (!Array.isArray(json)) return [];
  return (json as ApiRelease[])
    .filter((r) => r && !r.draft && !r.prerelease && /^v?\d/.test(r.tag_name ?? ''))
    .map((r) => ({
      version: r.tag_name.replace(/^v/i, ''),
      name: r.name || r.tag_name,
      notes: r.body ?? '',
      url: r.html_url,
      zipUrl: r.assets?.find((a) => a.name.endsWith('.zip'))?.browser_download_url,
      publishedAt: r.published_at ?? '',
    }))
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** Releases newer than `current`, newest first. */
export function newerThan(releases: Release[], current: string): Release[] {
  return releases.filter((r) => compareVersions(r.version, current) > 0);
}

/** Releases in (from, to], newest first: what changed in an update that just happened. */
export function between(releases: Release[], from: string, to: string): Release[] {
  return releases.filter((r) => compareVersions(r.version, from) > 0 && compareVersions(r.version, to) <= 0);
}

/** The update to offer, or undefined when up to date or the newest one was skipped. */
export function availableUpdate(state: UpdateState, current: string): Release | undefined {
  const latest = newerThan(state.releases, current)[0];
  if (!latest || (state.skipped && compareVersions(latest.version, state.skipped) <= 0)) return undefined;
  return latest;
}

// ---------------- storage ----------------
export async function loadUpdateState(): Promise<UpdateState> {
  const r = await chrome.storage.local.get(UPDATE_KEY);
  return { ...EMPTY_STATE, ...((r[UPDATE_KEY] as UpdateState | undefined) ?? {}) };
}

export async function patchUpdateState(patch: Partial<UpdateState>): Promise<UpdateState> {
  const next = { ...(await loadUpdateState()), ...patch };
  await chrome.storage.local.set({ [UPDATE_KEY]: next });
  return next;
}

export function onUpdateStateChanged(cb: (s: UpdateState) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === 'local' && UPDATE_KEY in changes) cb({ ...EMPTY_STATE, ...((changes[UPDATE_KEY].newValue as UpdateState | undefined) ?? {}) });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

// ---------------- release notes ----------------
export type Inline = { text: string; bold?: boolean; code?: boolean; href?: string };
export type Block = { kind: 'heading'; text: string } | { kind: 'item'; parts: Inline[] } | { kind: 'para'; parts: Inline[] };

const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\((https:\/\/[^)\s]+)\)|(https:\/\/[^\s)]+)/g;

function inline(text: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    if (m[1] != null) out.push({ text: m[1], bold: true });
    else if (m[2] != null) out.push({ text: m[2], code: true });
    else if (m[3] != null) out.push({ text: m[3], href: m[4] });
    else out.push({ text: m[5], href: m[5] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * The small Markdown subset release notes use: headings, bullets, paragraphs, bold, code, links.
 * Drops GitHub's "Full Changelog" footer and the "by @user in #PR" tail of generated notes.
 */
export function parseNotes(md: string): Block[] {
  const blocks: Block[] = [];
  for (const raw of md.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line || /^\*\*Full Changelog\*\*/i.test(line) || /^<!--.*-->$/.test(line)) continue;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ kind: 'heading', text: h[1].replace(/[*_`]/g, '') });
      continue;
    }
    const li = /^[-*+]\s+(.*)$/.exec(line);
    if (li) {
      blocks.push({ kind: 'item', parts: inline(li[1].replace(/\s+by @[\w-]+ in https:\/\/\S+$/, '')) });
      continue;
    }
    blocks.push({ kind: 'para', parts: inline(line) });
  }
  return blocks;
}
