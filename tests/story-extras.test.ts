import { describe, expect, it } from 'vitest';
import { extractStoryExtras, extrasCount, isHiddenSticker } from '../src/content/core/story-extras';

const mention = (username: string, geo: Record<string, number> = {}) => ({
  x: 0.5,
  y: 0.5,
  width: 0.3,
  height: 0.05,
  ...geo,
  bloks_sticker: {
    bloks_sticker_type: 'mention',
    sticker_data: { ig_mention: { account_id: '1', username, full_name: `${username} name`, profile_pic_url: 'https://x/p.jpg' } },
  },
});

describe('story extras', () => {
  it('reads bloks mention stickers and flags hidden ones', () => {
    const e = extractStoryExtras({ story_bloks_stickers: [mention('visible'), mention('tiny', { width: 0.01, height: 0.01 }), mention('off', { x: 1.4 })] });
    expect(e.mentions.map((m) => [m.username, m.hidden])).toEqual([
      ['visible', false],
      ['tiny', true],
      ['off', true],
    ]);
  });

  it('dedupes the same account and keeps it visible if any sticker is visible', () => {
    const e = extractStoryExtras({ story_bloks_stickers: [mention('a', { is_hidden: 1 }), mention('A')], reel_mentions: [{ user: { username: 'a' } }] });
    expect(e.mentions).toHaveLength(1);
    expect(e.mentions[0].hidden).toBe(false);
  });

  it('reads links, locations, music, hashtags and shared posts', () => {
    const e = extractStoryExtras({
      story_link_stickers: [{ story_link: { url: 'https://l.instagram.com/?u=x', display_url: 'x.com', link_title: 'Visit Link' } }],
      story_locations: [{ location: { name: 'Tel Aviv', pk: 123 } }],
      story_music_stickers: [{ music_asset_info: { title: 'Song', display_artist: 'Artist' } }],
      music_metadata: { music_info: { music_asset_info: { title: 'Song', display_artist: 'Artist' } } },
      story_hashtags: [{ hashtag: { name: 'travel' } }, { hashtag: { name: 'travel' } }],
      story_feed_media: [{ media_code: 'ABC', product_type: 'clips' }],
    });
    expect(e.links[0]).toMatchObject({ display: 'x.com' });
    expect(e.locations).toEqual([{ name: 'Tel Aviv', id: '123' }]);
    expect(e.music).toEqual([{ title: 'Song', artist: 'Artist' }]);
    expect(e.hashtags).toEqual(['travel']);
    expect(e.sharedPosts).toEqual([{ code: 'ABC', isReel: true }]);
    expect(extrasCount(e)).toBe(5);
  });

  it('handles empty input', () => {
    expect(extrasCount(extractStoryExtras(undefined))).toBe(0);
    expect(isHiddenSticker({ is_hidden: 0 })).toBe(false);
  });
});
