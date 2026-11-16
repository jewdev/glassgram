// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ownShortcode, shortcodeInRoot } from '../src/content/core/selectors';

function article(html: string): HTMLElement {
  const el = document.createElement('article');
  el.innerHTML = html;
  return el;
}

describe('ownShortcode', () => {
  it('takes the timestamp link first', () => {
    expect(ownShortcode(article('<a href="/p/OTHER/">x</a><a href="/p/OWNPOST/"><time>1h</time></a>'))).toBe('OWNPOST');
  });

  it('takes the shortcode every post link shares', () => {
    expect(ownShortcode(article('<a href="/p/AAAAA1/">photo</a><a href="/p/AAAAA1/c/1/">comment</a>'))).toBe('AAAAA1');
    expect(ownShortcode(article('<a href="/reel/RRRRR1/">reel</a>'))).toBe('RRRRR1');
  });

  it('refuses a post whose links point at different posts', () => {
    expect(ownShortcode(article('<a href="/p/AAAAA1/">photo</a><span>see <a href="/p/BBBBB1/">this</a></span>'))).toBeUndefined();
  });

  it('is undefined without post links', () => {
    expect(ownShortcode(article('<a href="/someone/">someone</a>'))).toBeUndefined();
  });
});

describe('shortcodeInRoot', () => {
  it('falls back to the first post link, even when others differ', () => {
    expect(shortcodeInRoot(article('<a href="/p/AAAAA1/">photo</a><a href="/p/BBBBB1/">this</a>'))).toBe('AAAAA1');
  });
});
