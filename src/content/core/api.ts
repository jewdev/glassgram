import type { KnownUser } from '../../shared/relay';
import type { ResolvedPost } from '../../shared/types';
import { linksExpireAt, normalizeMedia, type ApiMedia } from './media';
import { bridge, bridgeSafe, onPage } from './bridge';
import { randomPageId, restHeaders } from './headers';
import { isRateLimited } from './rate-limit';
import { shortcodeToPk } from './shortcode';
import { extractStoryExtras } from './story-extras';

// Calls that pass `offline` only use what Instagram's page already loaded: things that run on their
// own (hover, badges) never send a request Instagram's client wouldn't have sent. Clicks may.

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public rateLimited = false,
  ) {
    super(message);
  }
}

const pageId = randomPageId();
/** Instagram's current X-ASBD-ID, once the page script has seen it in one of Instagram's requests. */
let asbd: string | undefined;
onPage('asbd', (m) => (asbd = m.value));

/** Content scripts share the page's storage, but Instagram can't see us read it. */
function stored(area: () => Storage, key: string): string | null {
  try {
    return area().getItem(key);
  } catch {
    return null;
  }
}

function cookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

export function myUserId(): string | undefined {
  return cookie('ds_user_id');
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function jitter(minS: number, maxS: number): Promise<void> {
  const lo = Math.max(0, Math.min(minS, maxS));
  const hi = Math.max(minS, maxS);
  return sleep((lo + Math.random() * (hi - lo)) * 1000);
}

// ---------- rate-limit cooldown ----------
// When Instagram signals a rate limit we stop calling it entirely for a while instead of retrying.
// Shared across tabs and reloads through extension storage.
const COOLDOWN_KEY = 'ige.rateLimitedUntil';
const COOLDOWN_MS = 30 * 60 * 1000;
const RATE_LIMIT_MSG = 'Instagram is rate-limiting requests. Glassgram paused its own requests for 30 minutes.';
let cooldownUntil = 0;
const cooldownLoaded = chrome.storage.local
  .get(COOLDOWN_KEY)
  .then((r) => (cooldownUntil = Math.max(cooldownUntil, Number(r[COOLDOWN_KEY]) || 0)))
  .catch(() => 0);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && COOLDOWN_KEY in changes) cooldownUntil = Number(changes[COOLDOWN_KEY].newValue) || 0;
});

function startCooldown() {
  cooldownUntil = Date.now() + COOLDOWN_MS;
  chrome.storage.local.set({ [COOLDOWN_KEY]: cooldownUntil }).catch(() => {});
}

/** Throws while a rate-limit cooldown is active, without touching the network. */
async function assertNotCoolingDown() {
  await cooldownLoaded;
  if (Date.now() < cooldownUntil) {
    const mins = Math.ceil((cooldownUntil - Date.now()) / 60000);
    throw new ApiError(`Instagram rate-limited Glassgram recently. Its requests are paused for ${mins} more min.`, 429, true);
  }
}

/** Same-origin GET against instagram.com — session cookies are sent automatically. */
export async function igGet<T>(path: string): Promise<T> {
  await assertNotCoolingDown();
  const res = await fetch(path, {
    credentials: 'include',
    headers: restHeaders({
      csrf: cookie('csrftoken'),
      claim: stored(() => sessionStorage, 'www-claim-v2'),
      session: stored(() => localStorage, 'Session'),
      tab: stored(() => sessionStorage, 'TabId'),
      pageId,
      maxTouchPoints: navigator.maxTouchPoints ?? 0,
      asbd,
    }),
  });
  if (res.status === 429) {
    startCooldown();
    throw new ApiError(RATE_LIMIT_MSG, 429, true);
  }
  if (res.status === 401) throw new ApiError('Instagram refused the request. Make sure you are logged in.', 401);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ApiError(res.redirected ? 'Not logged in to Instagram.' : `Unexpected response (${res.status})`, res.status);
  }
  if (!res.ok || json.status === 'fail') {
    const msg: string = json.message ?? `Request failed (${res.status})`;
    const limited = isRateLimited(json);
    if (limited) startCooldown();
    throw new ApiError(limited ? `Instagram blocked the request: ${msg}` : msg, res.status, limited);
  }
  return json as T;
}

// ---------- small in-memory caches (page lifetime) ----------
const postCache = new Map<string, Promise<ResolvedPost>>();
const userIdCache = new Map<string, Promise<string>>();

function cached<T>(map: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let p = map.get(key);
  if (!p) {
    p = load();
    map.set(key, p);
    p.catch(() => map.delete(key));
  }
  return p;
}

class NotLoaded extends ApiError {
  constructor() {
    super('Not loaded by Instagram yet', 0);
  }
}

// ---------- posts / reels ----------
const hasMedia = (m: ApiMedia | null): m is ApiMedia => !!(m?.image_versions2 || m?.carousel_media || m?.video_versions);

function toPost(raw: ApiMedia, shortcode: string): ResolvedPost {
  const post = normalizeMedia(raw);
  post.shortcode ||= shortcode;
  return post;
}

// Instagram's CDN links expire (days, not minutes), and a tab can stay open longer than that. A post is
// looked up again shortly before its links do; without an expiry in them, after an hour.
const LINK_MARGIN = 10 * 60 * 1000;
const NO_EXPIRY_TTL = 60 * 60 * 1000;
const postExpiry = new Map<string, number>();

const expiresAt = (post: ResolvedPost) => {
  const at = linksExpireAt(post.items.map((it) => it.url));
  return at === undefined ? Date.now() + NO_EXPIRY_TTL : at - LINK_MARGIN;
};

/** The post as Instagram's page loaded it, unless its links are about to expire (or it isn't loaded). */
async function knownPost(shortcode: string): Promise<ResolvedPost | null> {
  const raw = await bridgeSafe<ApiMedia | null>('getMedia', { code: shortcode }, null);
  if (!hasMedia(raw)) return null;
  const post = toPost(raw, shortcode);
  const linksEnd = linksExpireAt(post.items.map((it) => it.url)) ?? Infinity;
  return linksEnd - LINK_MARGIN > Date.now() ? post : null;
}

export async function getPostByShortcode(shortcode: string, offline = false): Promise<ResolvedPost> {
  if (Date.now() >= (postExpiry.get(shortcode) ?? Infinity)) {
    postCache.delete(shortcode);
    postExpiry.delete(shortcode);
  }
  if (offline && !postCache.has(shortcode)) {
    const known = await knownPost(shortcode);
    if (!known) throw new NotLoaded();
    postCache.set(shortcode, Promise.resolve(known));
    postExpiry.set(shortcode, expiresAt(known));
  }
  return cached(postCache, shortcode, async () => {
    // Fast path: Instagram already loaded this media (feed, profile grid, post page).
    let post = await knownPost(shortcode);
    if (!post) {
      const data = await igGet<{ items: ApiMedia[] }>(`/api/v1/media/${shortcodeToPk(shortcode)}/info/`);
      const raw = data.items?.[0];
      if (!raw) throw new ApiError('Post not found', 404);
      post = toPost(raw, shortcode);
    }
    postExpiry.set(shortcode, expiresAt(post));
    return post;
  });
}

// ---------- users ----------
type HdPic = { url: string; width?: number; height?: number };

export interface Friendship {
  following: boolean;
  followed_by: boolean;
}

/** What Instagram's page data says about `username` (id, HD picture, relationship); never sends a request. */
export function knownUser(username: string): Promise<KnownUser | null> {
  return bridgeSafe<KnownUser | null>('getUser', { username }, null);
}

export interface ProfileSummary {
  id: string;
  username: string;
  mediaCount?: number;
  isPrivate?: boolean;
  hd?: HdPic;
}

export async function getUserId(username: string, offline = false): Promise<string> {
  const key = username.toLowerCase();
  if (offline && !userIdCache.has(key)) {
    const known = await knownUser(username);
    if (!known?.id) throw new NotLoaded();
    userIdCache.set(key, Promise.resolve(known.id));
  }
  return cached(userIdCache, key, async () => {
    const known = await knownUser(username);
    if (known?.id) return known.id;
    try {
      const data = await igGet<{ users?: { user: { pk?: string | number; pk_id?: string; username: string } }[] }>(
        `/web/search/topsearch/?query=${encodeURIComponent(username)}`,
      );
      const hit = data.users?.find((u) => u.user.username.toLowerCase() === username.toLowerCase());
      if (hit) return String(hit.user.pk ?? hit.user.pk_id);
    } catch {
      /* try the next source */
    }
    const data = await igGet<{ data: { user: { id: string } } }>(`/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`);
    if (!data.data?.user?.id) throw new ApiError('User not found', 404);
    return data.data.user.id;
  });
}

/** Relationship between the logged-in user and `username`, asked from Instagram (knownUser has the free one). */
export async function getFriendship(username: string): Promise<Friendship> {
  const id = await getUserId(username);
  const r = await igGet<{ following?: boolean; followed_by?: boolean }>(`/api/v1/friendships/show/${id}/`);
  return { following: !!r.following, followed_by: !!r.followed_by };
}

/** Everything Instagram knows about the relationship: requests, close friends, mutes, restrict, block… */
export interface FriendshipDetails extends Friendship {
  incoming_request?: boolean;
  outgoing_request?: boolean;
  is_bestie?: boolean;
  is_feed_favorite?: boolean;
  muting?: boolean;
  is_muting_reel?: boolean;
  is_muting_notes?: boolean;
  is_restricted?: boolean;
  blocking?: boolean;
  is_blocking_reel?: boolean;
  subscribed?: boolean;
  is_private?: boolean;
}

export async function getFriendshipDetails(username: string): Promise<FriendshipDetails> {
  const id = await getUserId(username);
  return igGet<FriendshipDetails>(`/api/v1/friendships/show/${id}/`);
}

/** Profile info via Instagram's own profile query (falls back to REST). */
export async function getProfileSummary(username: string): Promise<ProfileSummary> {
  const id = await getUserId(username);
  await assertNotCoolingDown();
  try {
    const u = await bridge<{ media_count?: number; is_private?: boolean; hd_profile_pic_url_info?: HdPic } | null>('profileInfo', { id });
    if (u) return { id, username, mediaCount: u.media_count, isPrivate: u.is_private, hd: u.hd_profile_pic_url_info };
  } catch (e) {
    if ((e as Error).message === 'RATE_LIMITED') {
      startCooldown();
      throw new ApiError(RATE_LIMIT_MSG, 429, true);
    }
    /* no template yet — use REST */
  }
  const info = await igGet<{ user: { media_count?: number; is_private?: boolean; hd_profile_pic_url_info?: HdPic } }>(`/api/v1/users/${id}/info/`);
  return { id, username, mediaCount: info.user.media_count, isPrivate: info.user.is_private, hd: info.user.hd_profile_pic_url_info };
}

/** Avatar shown in the profile header — low-res last resort. */
function headerAvatarUrl(): string | undefined {
  const img = document.querySelector<HTMLImageElement>('main header img, header img');
  return img?.currentSrc || img?.src || undefined;
}

/** Best available profile picture URL (usually 1080px). */
export async function getHdProfilePic(username: string): Promise<HdPic & { userId: string }> {
  const known = await knownUser(username);
  if (known?.hd?.url) return { ...known.hd, userId: known.id };
  const userId = await getUserId(username);
  try {
    const p = await getProfileSummary(username);
    if (p.hd?.url) return { ...p.hd, userId };
  } catch {
    /* fall through */
  }
  const url = headerAvatarUrl();
  if (!url) throw new ApiError('Could not load the profile picture', 404);
  return { url, width: 150, height: 150, userId };
}

// ---------- stories ----------
interface ReelsMediaResponse {
  reels?: Record<string, { items?: ApiMedia[]; user?: { username?: string } }>;
  reels_media?: { id: string; items?: ApiMedia[]; user?: { username?: string } }[];
}

type Reel = { items?: ApiMedia[]; user?: { username?: string } };

// Story trays rarely change while one is open; hovering it again shouldn't fetch it again.
const REEL_TTL = 2 * 60 * 1000;
const reelCache = new Map<string, { at: number; items: Promise<ResolvedPost[]>; full: boolean }>();

/**
 * reelId = user id for a user's stories, or `highlight:<id>` for a highlight.
 * `full`: as Instagram's API returns it. Its page data leaves out the mentioned accounts' pictures.
 */
export function getReelItems(reelId: string, offline = false, full = false): Promise<ResolvedPost[]> {
  const hit = reelCache.get(reelId);
  if (hit && Date.now() - hit.at < REEL_TTL && (hit.full || !full)) return hit.items;
  const items = full ? fetchReel(reelId) : loadReel(reelId, offline);
  const remember = () => void reelCache.set(reelId, { at: Date.now(), items, full });
  // An offline miss must not answer a click that comes while it is still pending.
  if (offline) items.then(remember, () => {});
  else {
    remember();
    items.catch(() => reelCache.delete(reelId));
  }
  return items;
}

async function loadReel(reelId: string, offline: boolean): Promise<ResolvedPost[]> {
  // The tray Instagram loaded to show it; the request only when it isn't there.
  const known = await bridgeSafe<Reel | null>('getReel', { id: reelId }, null);
  if (known?.items?.length) return reelPosts(known);
  if (offline) throw new NotLoaded();
  return fetchReel(reelId);
}

async function fetchReel(reelId: string): Promise<ResolvedPost[]> {
  const data = await igGet<ReelsMediaResponse>(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`);
  return reelPosts(data.reels?.[reelId] ?? data.reels_media?.find((r) => r.id === reelId) ?? data.reels_media?.[0]);
}

function reelPosts(reel: Reel | undefined): ResolvedPost[] {
  const owner = reel?.user?.username;
  return (reel?.items ?? []).map((m) => {
    const p = normalizeMedia(m);
    if (owner && p.username === 'unknown') p.username = owner;
    p.shortcode = p.id;
    p.extras = extractStoryExtras(m);
    return p;
  });
}

// ---------- paginated feeds ----------
/** One page of a profile's posts, using Instagram's own profile-grid query. */
export async function getUserFeedPage(username: string, cursor?: string) {
  await assertNotCoolingDown();
  try {
    const page = await bridge<{ items: ApiMedia[]; next: string | null }>('profilePosts', { username, after: cursor ?? null }, 30000);
    return { posts: page.items.map(normalizeMedia), next: page.next ?? undefined };
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.startsWith('NO_TEMPLATE')) throw new ApiError('Reload this profile page once, then try again (Instagram request format not captured yet).', 0);
    if (msg === 'RATE_LIMITED') {
      startCooldown();
      throw new ApiError(RATE_LIMIT_MSG, 429, true);
    }
    throw new ApiError(msg, 0);
  }
}

export interface FriendUser {
  pk: string;
  username: string;
  full_name: string;
  profile_pic_url: string;
  is_verified?: boolean;
  is_private?: boolean;
}

export async function getFriendshipPage(userId: string, kind: 'followers' | 'following', maxId?: string) {
  const qs = new URLSearchParams({ count: '50' });
  if (maxId) qs.set('max_id', maxId);
  const data = await igGet<{ users: FriendUser[]; next_max_id?: string | number; big_list?: boolean }>(
    `/api/v1/friendships/${userId}/${kind}/?${qs}`,
  );
  return {
    users: (data.users ?? []).map((u) => ({ ...u, pk: String(u.pk) })),
    next: data.next_max_id != null && data.next_max_id !== '' ? String(data.next_max_id) : undefined,
  };
}
