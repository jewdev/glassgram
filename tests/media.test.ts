import { describe, expect, it } from 'vitest';
import { extFromUrl, normalizeMedia, pickBest } from '../src/content/core/media';

const img = (w: number, name = 'a') => ({ url: `https://scontent.cdninstagram.com/v/t51/${name}_n.jpg?stp=x&w=${w}`, width: w, height: w });

describe('media normalize', () => {
  it('picks the largest candidate', () => {
    expect(pickBest([img(320), img(1080), img(640)])?.width).toBe(1080);
    expect(pickBest([])).toBeUndefined();
  });

  it('extracts extensions', () => {
    expect(extFromUrl('https://x.com/a/b_n.jpg?x=1', 'bin')).toBe('jpg');
    expect(extFromUrl('https://x.com/a/b.mp4', 'bin')).toBe('mp4');
    expect(extFromUrl('https://x.com/a/b', 'jpg')).toBe('jpg');
    expect(extFromUrl('not a url', 'png')).toBe('png');
  });

  it('normalizes a single image post', () => {
    const p = normalizeMedia({ pk: '1', code: 'B', media_type: 1, taken_at: 10, user: { username: 'u' }, caption: { text: 'hi' }, image_versions2: { candidates: [img(320), img(1440)] } });
    expect(p).toMatchObject({ id: '1', shortcode: 'B', username: 'u', caption: 'hi', takenAt: 10 });
    expect(p.items).toHaveLength(1);
    expect(p.items[0]).toMatchObject({ type: 'image', width: 1440, ext: 'jpg' });
  });

  it('prefers video versions and keeps duration', () => {
    const p = normalizeMedia({
      pk: '2',
      media_type: 2,
      video_duration: 12.5,
      image_versions2: { candidates: [img(1080)] },
      video_versions: [{ url: 'https://x.cdninstagram.com/v.mp4', width: 720, height: 1280 }, { url: 'https://x.cdninstagram.com/s.mp4', width: 480, height: 854 }],
    });
    expect(p.items[0]).toMatchObject({ type: 'video', width: 720, ext: 'mp4', duration: 12.5 });
  });

  it('expands carousels', () => {
    const p = normalizeMedia({
      pk: '3_99',
      media_type: 8,
      carousel_media: [
        { pk: '31', media_type: 1, image_versions2: { candidates: [img(1080, 'x')] } },
        { pk: '32', media_type: 2, video_versions: [{ url: 'https://x/v.mp4', width: 1, height: 1 }] },
      ],
    });
    expect(p.id).toBe('3');
    expect(p.items.map((i) => [i.id, i.type])).toEqual([
      ['31', 'image'],
      ['32', 'video'],
    ]);
  });
});
