import { describe, expect, it } from 'vitest';
import { cleanInstagramUrl, isSingleInstagramUrl, unwrapLinkShim } from '../src/shared/links';

describe('cleanInstagramUrl', () => {
  it('strips share tracking params and keeps functional ones', () => {
    expect(cleanInstagramUrl('https://www.instagram.com/p/ABC/?utm_source=ig_web_copy_link&stkn=xyz&img_index=2')).toBe('https://www.instagram.com/p/ABC/?img_index=2');
    expect(cleanInstagramUrl('https://www.instagram.com/reel/ABC/?igsh=MWQ1')).toBe('https://www.instagram.com/reel/ABC/');
  });

  it('swaps the domain when one is given', () => {
    expect(cleanInstagramUrl('https://www.instagram.com/p/ABC/?igsh=1', 'kkinstagram.com')).toBe('https://kkinstagram.com/p/ABC/');
    expect(cleanInstagramUrl('https://www.instagram.com/p/ABC/', 'https://ddinstagram.com/')).toBe('https://ddinstagram.com/p/ABC/');
  });

  it('ignores invalid domains and non-Instagram URLs', () => {
    expect(cleanInstagramUrl('https://www.instagram.com/p/ABC/', 'not a domain')).toBe('https://www.instagram.com/p/ABC/');
    expect(cleanInstagramUrl('https://example.com/?utm_source=x')).toBe('https://example.com/?utm_source=x');
    expect(cleanInstagramUrl('hello')).toBe('hello');
  });
});

describe('unwrapLinkShim', () => {
  it('unwraps l.instagram.com redirects', () => {
    const shim = `https://l.instagram.com/?u=${encodeURIComponent('https://example.com/a?b=1')}&e=AT0abc`;
    expect(unwrapLinkShim(shim)).toBe('https://example.com/a?b=1');
  });

  it('rejects non-http targets and other hosts', () => {
    expect(unwrapLinkShim(`https://l.instagram.com/?u=${encodeURIComponent('javascript:alert(1)')}`)).toBeUndefined();
    expect(unwrapLinkShim('https://www.instagram.com/?u=https://x.com')).toBeUndefined();
    expect(unwrapLinkShim('https://l.instagram.com/')).toBeUndefined();
  });
});

describe('isSingleInstagramUrl', () => {
  it('detects copied post links only', () => {
    expect(isSingleInstagramUrl(' https://www.instagram.com/p/ABC/?utm_source=x ')).toBe(true);
    expect(isSingleInstagramUrl('look https://www.instagram.com/p/ABC/')).toBe(false);
    expect(isSingleInstagramUrl('https://example.com')).toBe(false);
  });
});
