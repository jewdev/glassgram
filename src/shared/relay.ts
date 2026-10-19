// Reading Instagram's Relay store (the page's own data cache) instead of watching its network
// traffic. Records are normalized: a field that holds another object holds {__ref: id} instead, and
// a list of objects holds {__refs: [...]}. denormalize() puts them back together into the shape of
// the API JSON the records were built from, which is what the rest of the code expects.

/** The part of Relay's record source we use. */
export interface RelaySource {
  get(id: string): Record<string, unknown> | null | undefined;
  getRecordIDs(): string[];
}

/** Deep enough for media → carousel item → image_versions2 → candidates → candidate. */
const MAX_DEPTH = 6;

/** Field keys with arguments look like `name(arg:1)` or `name{"arg":1}`. */
const fieldName = (key: string) => key.replace(/[({].*$/, '');

export function denormalize(src: RelaySource, value: unknown, depth = MAX_DEPTH, path = new Set<string>()): unknown {
  // Some records hold getters as functions; the result must survive structured cloning (MessagePort).
  if (typeof value === 'function') return undefined;
  if (value == null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => denormalize(src, v, depth, path));
  const o = value as Record<string, unknown>;
  const link = (id: unknown) => {
    if (typeof id !== 'string' || depth <= 0 || path.has(id)) return null;
    const rec = src.get(id);
    if (!rec) return null;
    path.add(id);
    const out = denormalize(src, rec, depth - 1, path);
    path.delete(id);
    return out;
  };
  if ('__ref' in o) return link(o.__ref);
  if (Array.isArray(o.__refs)) return o.__refs.map(link);
  // A record links back to itself through others (user → media → user); don't expand it inside itself.
  const self = typeof o.__id === 'string' && !path.has(o.__id) ? o.__id : undefined;
  if (self) path.add(self);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (k === '__id' || k === '__typename') continue;
    const name = fieldName(k);
    // A plain key wins over the same field stored with arguments.
    if (name !== k && name in o) continue;
    const d = denormalize(src, v, depth, path);
    if (d !== undefined) out[name] = d;
  }
  if (self) path.delete(self);
  return out;
}

function find(src: RelaySource, match: (r: Record<string, unknown>) => boolean): Record<string, unknown> | undefined {
  for (const id of src.getRecordIDs()) {
    const r = src.get(id);
    if (r && match(r)) return r;
  }
  return undefined;
}

// Everything a record links to adds up (a post with its owner, their pictures, tags… is over a
// megabyte), so media keeps only the fields media.ts and story-extras.ts read.
const MEDIA_FIELDS = ['pk', 'id', 'code', 'media_type', 'taken_at', 'video_duration', 'image_versions2', 'video_versions'];
const STORY_FIELDS = ['reel_mentions', 'story_bloks_stickers', 'story_feed_media', 'story_hashtags', 'story_link_stickers', 'story_locations', 'story_music_stickers', 'music_metadata'];
/** Story stickers nest deep (story_bloks_stickers → bloks_sticker → sticker_data → …). */
const STICKER_DEPTH = 6;

/** The value of `field`, also when Relay stored it with arguments. */
function field(rec: Record<string, unknown>, name: string): unknown {
  if (name in rec) return rec[name];
  const key = Object.keys(rec).find((k) => fieldName(k) === name);
  return key === undefined ? undefined : rec[key];
}

const linked = (src: RelaySource, v: unknown): Record<string, unknown>[] => {
  const ids = v && typeof v === 'object' ? ((v as { __refs?: unknown }).__refs ?? (v as { __ref?: unknown }).__ref) : undefined;
  return [ids]
    .flat()
    .map((id) => (typeof id === 'string' ? src.get(id) : undefined))
    .filter((r): r is Record<string, unknown> => !!r);
};

function pickMedia(src: RelaySource, rec: Record<string, unknown>, story: boolean): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of MEDIA_FIELDS) {
    const v = field(rec, name);
    if (v !== undefined) out[name] = denormalize(src, v, 3);
  }
  for (const name of ['user', 'owner']) {
    const u = linked(src, field(rec, name))[0];
    if (u) out[name] = { username: u.username, pk: u.pk };
  }
  const caption = linked(src, field(rec, 'caption'))[0];
  if (caption) out.caption = { text: caption.text };
  const children = linked(src, field(rec, 'carousel_media'));
  if (children.length) out.carousel_media = children.map((c) => pickMedia(src, c, false));
  if (story) {
    for (const name of STORY_FIELDS) {
      const v = field(rec, name);
      if (v !== undefined) out[name] = denormalize(src, v, STICKER_DEPTH);
    }
  }
  return out;
}

/** A post or reel Instagram has loaded, as API-shaped JSON, or null. */
export function findMedia(src: RelaySource, code: string): Record<string, unknown> | null {
  const r = find(src, (r) => r.code === code && !!(r.image_versions2 || r.carousel_media || r.video_versions));
  return r ? pickMedia(src, r, false) : null;
}

/** A story tray Instagram has loaded: a user's stories (reel id = user id) or a highlight (`highlight:<id>`). */
export function findReel(src: RelaySource, reelId: string): { items: Record<string, unknown>[]; user?: { username?: string } } | null {
  const r = find(src, (r) => String(r.id) === reelId && !!field(r, 'items') && typeof field(r, 'items') === 'object');
  if (!r) return null;
  const items = linked(src, field(r, 'items')).map((m) => pickMedia(src, m, true));
  const owner = linked(src, field(r, 'user'))[0];
  return items.length ? { items, user: owner ? { username: owner.username as string | undefined } : undefined } : null;
}

export interface KnownUser {
  id: string;
  hd?: { url: string; width: number; height: number };
  /** Relationship with the logged-in user, when Instagram loaded it. */
  fs?: { following: boolean; followed_by: boolean };
}

export function findUser(src: RelaySource, username: string): KnownUser | null {
  const name = username.toLowerCase();
  const r = find(src, (r) => typeof r.username === 'string' && r.username.toLowerCase() === name && !!(r.pk || r.id));
  if (!r) return null;
  const hd = denormalize(src, r.hd_profile_pic_url_info, 2) as KnownUser['hd'] | null;
  const f = denormalize(src, r.friendship_status, 2) as { following?: boolean; followed_by?: boolean } | null;
  return {
    id: String(r.pk ?? r.id),
    hd: hd?.url ? hd : undefined,
    fs: f && typeof f.followed_by === 'boolean' ? { following: !!f.following, followed_by: f.followed_by } : undefined,
  };
}
