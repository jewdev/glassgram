import type { ResolvedPost } from '../../shared/types';
import { normalizeMedia, type ApiMedia } from './media';
import { bridge, bridgeSafe } from './bridge';
import { isRateLimited } from './rate-limit';
import { shortcodeToPk } from './shortcode';
import { extractStoryExtras } from './story-extras';

// Instagram web app id — required by the private web API.
const APP_ID = '936619743392459';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public rateLimited = false,
  ) {
    super(message);
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
    headers: {
      'X-IG-App-ID': APP_ID,
      'X-Requested-With': 'XMLHttpRequest',
      'X-CSRFToken': cookie('csrftoken') ?? '',
      Accept: 'application/json',
    },
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

// ---------- posts / reels ----------
export function getPostByShortcode(shortcode: string): Promise<ResolvedPost> {
  return cached(postCache, shortcode, async () => {
    // Fast path: Instagram already loaded this media (feed, profile grid, post page).
    const sniffed = await bridgeSafe<ApiMedia | null>('getMedia', { code: shortcode }, null);
    let raw = sniffed;
    if (!raw?.image_versions2 && !raw?.carousel_media && !raw?.video_versions) {
      const data = await igGet<{ items: ApiMedia[] }>(`/api/v1/media/${shortcodeToPk(shortcode)}/info/`);
      raw = data.items?.[0] ?? null;
    }
    if (!raw) throw new ApiError('Post not found', 404);
    const post = normalizeMedia(raw);
    post.shortcode ||= shortcode;
    return post;
  });
}

// ---------- users ----------
type HdPic = { url: string; width?: number; height?: number };

export interface Friendship {
  following: boolean;
  followed_by: boolean;
}

interface BridgeUser {
  id: string;
  hd?: HdPic;
  fs?: Friendship;
}

export interface ProfileSummary {
  id: string;
  username: string;
  mediaCount?: number;
  isPrivate?: boolean;
  hd?: HdPic;
}

export function getUserId(username: string): Promise<string> {
  return cached(userIdCache, username.toLowerCase(), async () => {
    const known = await bridgeSafe<BridgeUser | null>('getUser', { username }, null);
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

/** Relationship between the logged-in user and `username`. `fresh` skips the page cache. */
export async function getFriendship(username: string, fresh = false): Promise<Friendship> {
  if (!fresh) {
    // Instagram's own profile query carries the relationship; it may land a moment after navigation.
    for (const wait of [0, 1200]) {
      if (wait) await sleep(wait);
      const known = await bridgeSafe<BridgeUser | null>('getUser', { username }, null);
      if (known?.fs) return known.fs;
    }
  }
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
  const known = await bridgeSafe<BridgeUser | null>('getUser', { username }, null);
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

/** reelId = user id for a user's stories, or `highlight:<id>` for a highlight. */
export async function getReelItems(reelId: string): Promise<ResolvedPost[]> {
  const data = await igGet<ReelsMediaResponse>(`/api/v1/feed/reels_media/?reel_ids=${encodeURIComponent(reelId)}`);
  const reel = data.reels?.[reelId] ?? data.reels_media?.find((r) => r.id === reelId) ?? data.reels_media?.[0];
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
