import type { StoryExtras } from '../../shared/types';

/** Sticker geometry is normalised to 0..1 of the story frame. */
interface Placed {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  is_hidden?: number | boolean;
}

interface RawStory {
  reel_mentions?: (Placed & { user?: { username?: string; full_name?: string; profile_pic_url?: string } })[];
  story_bloks_stickers?: (Placed & {
    bloks_sticker?: { sticker_data?: { ig_mention?: { username?: string; full_name?: string; profile_pic_url?: string } } };
  })[];
  story_hashtags?: (Placed & { hashtag?: { name?: string } })[];
  story_locations?: (Placed & { location?: { name?: string; pk?: string | number } })[];
  story_link_stickers?: (Placed & { story_link?: { url?: string; display_url?: string; link_title?: string } })[];
  story_music_stickers?: { music_asset_info?: { title?: string; display_artist?: string } }[];
  music_metadata?: { music_info?: { music_asset_info?: { title?: string; display_artist?: string } } } | null;
  story_feed_media?: { media_code?: string; product_type?: string }[];
}

/** Hidden = flagged hidden, too small to notice, or placed outside the frame. */
export function isHiddenSticker(s: Placed): boolean {
  if (s.is_hidden) return true;
  const { x = 0.5, y = 0.5, width = 1, height = 1 } = s;
  if (width * height < 0.002) return true;
  return x < -0.02 || x > 1.02 || y < -0.02 || y > 1.02;
}

export function extractStoryExtras(raw: unknown): StoryExtras {
  const r = (raw ?? {}) as RawStory;
  const mentions = new Map<string, StoryExtras['mentions'][number]>();
  const addMention = (u: { username?: string; full_name?: string; profile_pic_url?: string } | undefined, s: Placed) => {
    if (!u?.username) return;
    const key = u.username.toLowerCase();
    const hidden = isHiddenSticker(s);
    const prev = mentions.get(key);
    // Visible wins if the same account is mentioned twice.
    mentions.set(key, { username: u.username, fullName: u.full_name ?? '', picUrl: u.profile_pic_url ?? '', hidden: prev ? prev.hidden && hidden : hidden });
  };
  for (const s of r.story_bloks_stickers ?? []) addMention(s.bloks_sticker?.sticker_data?.ig_mention, s);
  for (const s of r.reel_mentions ?? []) addMention(s.user, s);

  const music = [...(r.story_music_stickers ?? []).map((m) => m.music_asset_info), r.music_metadata?.music_info?.music_asset_info]
    .filter((m): m is { title?: string; display_artist?: string } => !!m?.title)
    .map((m) => ({ title: m.title!, artist: m.display_artist ?? '' }));

  return {
    mentions: [...mentions.values()],
    hashtags: [...new Set((r.story_hashtags ?? []).map((h) => h.hashtag?.name).filter((n): n is string => !!n))],
    locations: (r.story_locations ?? []).filter((l) => l.location?.name).map((l) => ({ name: l.location!.name!, id: String(l.location!.pk ?? '') })),
    links: (r.story_link_stickers ?? [])
      .filter((l) => l.story_link?.url)
      .map((l) => ({ url: l.story_link!.url!, display: l.story_link!.display_url ?? l.story_link!.url!, title: l.story_link!.link_title ?? '' })),
    music: music.filter((m, i) => music.findIndex((x) => x.title === m.title && x.artist === m.artist) === i),
    sharedPosts: (r.story_feed_media ?? []).filter((f) => f.media_code).map((f) => ({ code: f.media_code!, isReel: f.product_type === 'clips' })),
  };
}

export function extrasCount(e: StoryExtras | undefined): number {
  if (!e) return 0;
  return e.mentions.length + e.hashtags.length + e.locations.length + e.links.length + e.music.length + e.sharedPosts.length;
}
