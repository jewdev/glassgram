import { describe, expect, it } from 'vitest';
import { postsCsv } from '../src/content/core/post-csv';
import type { ResolvedPost } from '../src/shared/types';

const item = (type: 'image' | 'video') => ({ id: '1', url: 'https://x/y.jpg', type, width: 1, height: 1, ext: 'jpg' });
const post = (over: Partial<ResolvedPost>): ResolvedPost => ({ id: '1', shortcode: 'ABCDE', username: 'someone', takenAt: 1762560000, caption: '', items: [item('image')], ...over });

describe('postsCsv', () => {
  it('writes a header and one row per post', () => {
    const lines = postsCsv([
      post({ caption: 'hi "there"\nline 2' }),
      post({ shortcode: 'VVVVV', items: [item('video')] }),
      post({ shortcode: 'CCCCC', items: [item('image'), item('video')] }),
    ]).split('\r\n');
    expect(lines[0]).toBe('link,username,date,type,files,caption');
    expect(lines[1]).toBe('"https://www.instagram.com/p/ABCDE/","someone","2025-11-08T00:00:00.000Z","photo","1","hi ""there""\nline 2"');
    expect(lines[2]).toContain('"video","1"');
    expect(lines[3]).toContain('"carousel","2"');
  });

  it('keeps captions from running as spreadsheet formulas', () => {
    expect(postsCsv([post({ caption: '=HYPERLINK("x")' })])).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
