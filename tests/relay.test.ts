import { describe, expect, it } from 'vitest';
import { denormalize, findMedia, findReel, findUser, type RelaySource } from '../src/shared/relay';

/** A record source like the one Instagram's Relay environment exposes (shapes from instagram.com). */
function source(records: Record<string, Record<string, unknown>>): RelaySource {
  return { get: (id) => records[id], getRecordIDs: () => Object.keys(records) };
}

const store = source({
  'XDTMediaDict:1': {
    __id: 'XDTMediaDict:1',
    __typename: 'XDTMediaDict',
    code: 'ABC',
    pk: '1',
    media_type: 8,
    user: { __ref: 'XDTUserDict:9' },
    caption: { __ref: 'XDTCommentDict:5' },
    image_versions2: { __ref: 'iv:1' },
    carousel_media: { __refs: ['XDTMediaDict:2'] },
    video_versions: null,
  },
  'XDTMediaDict:2': { __id: 'XDTMediaDict:2', pk: '2', media_type: 1, image_versions2: { __ref: 'iv:2' }, video_versions: null },
  'iv:1': { __id: 'iv:1', candidates: { __refs: ['c:1'] } },
  'iv:2': { __id: 'iv:2', candidates: { __refs: ['c:2', 'c:missing'] } },
  'c:1': { __id: 'c:1', url: 'https://cdn/1.jpg', width: 1080, height: 1080 },
  'c:2': { __id: 'c:2', url: 'https://cdn/2.jpg', width: 640, height: 640 },
  'XDTCommentDict:5': { text: 'hello' },
  'XDTUserDict:9': {
    __typename: 'XDTUserDict',
    pk: '9',
    username: 'Someone',
    friendship_status: { __ref: 'fs:9' },
    hd_profile_pic_url_info: { __ref: 'hd:9' },
  },
  'fs:9': { following: true, followed_by: false },
  'hd:9': { url: 'https://cdn/hd.jpg', width: 1080, height: 1080 },
  'XDTReelDict:9': { id: '9', items: { __refs: ['XDTMediaDict:2'] }, user: { __ref: 'XDTUserDict:9' } },
});

describe('denormalize', () => {
  it('follows __ref / __refs and drops Relay bookkeeping', () => {
    const out = denormalize(store, store.get('XDTMediaDict:2')) as any;
    expect(out).toEqual({ pk: '2', media_type: 1, image_versions2: { candidates: [{ url: 'https://cdn/2.jpg', width: 640, height: 640 }, null] }, video_versions: null });
  });

  it('reads fields stored with arguments under their plain name, unless the plain one exists', () => {
    const src = source({ a: { 'items(first:12)': [1], 'name(x:1)': 'args', name: 'plain' } });
    expect(denormalize(src, src.get('a'))).toEqual({ items: [1], name: 'plain' });
  });

  it('stops at cycles and at the depth limit', () => {
    const src = source({ a: { __id: 'a', next: { __ref: 'b' } }, b: { __id: 'b', next: { __ref: 'a' } } });
    expect(denormalize(src, src.get('a'))).toEqual({ next: { next: null } });
    expect(denormalize(source({ a: { x: { __ref: 'b' } }, b: { y: 1 } }), { __ref: 'a' }, 1)).toEqual({ x: null });
  });
});

describe('lookups', () => {
  it('finds a post by shortcode in the shape normalizeMedia expects', () => {
    const m = findMedia(store, 'ABC') as any;
    expect(m.user.username).toBe('Someone');
    expect(m.caption.text).toBe('hello');
    expect(m.carousel_media[0].image_versions2.candidates[0].url).toBe('https://cdn/2.jpg');
    expect(findMedia(store, 'nope')).toBeNull();
  });

  it('returns only what media.ts reads, and nothing a MessagePort cannot clone', () => {
    const src = source({
      m: { code: 'X', pk: '1', image_versions2: { __ref: 'iv' }, user: { __ref: 'u' }, getter: () => 1, big_unused_field: { __ref: 'u' } },
      iv: { candidates: [{ url: 'https://cdn/x.jpg', width: 1, height: 1, lazy: () => 2 }] },
      u: { username: 'someone', pk: '9', huge: 'x'.repeat(1000), feed: { __ref: 'm' } },
    });
    const m = findMedia(src, 'X')!;
    expect(m).toEqual({ pk: '1', code: 'X', image_versions2: { candidates: [{ url: 'https://cdn/x.jpg', width: 1, height: 1 }] }, user: { username: 'someone', pk: '9' } });
    expect(() => structuredClone(m)).not.toThrow();
  });

  it('finds a user case-insensitively, with relationship and HD picture', () => {
    expect(findUser(store, 'someone')).toEqual({
      id: '9',
      fs: { following: true, followed_by: false },
      hd: { url: 'https://cdn/hd.jpg', width: 1080, height: 1080 },
    });
    expect(findUser(store, 'nobody')).toBeNull();
  });

  it('leaves out a relationship Instagram has not loaded', () => {
    const src = source({ u: { pk: 1, username: 'x' } });
    expect(findUser(src, 'x')).toEqual({ id: '1', fs: undefined, hd: undefined });
  });

  it('finds a story tray by reel id', () => {
    const reel = findReel(store, '9')!;
    expect(reel.items).toHaveLength(1);
    expect(reel.user?.username).toBe('Someone');
    expect(findReel(store, 'highlight:1')).toBeNull();
  });
});
