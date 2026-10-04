import { describe, expect, it } from 'vitest';
import { pkToShortcode, shortcodeToPk } from '../src/content/core/shortcode';

describe('shortcode', () => {
  it('decodes a known shortcode', () => {
    // https://www.instagram.com/p/B/ -> pk 1 ; "BA" -> 64
    expect(shortcodeToPk('B')).toBe('1');
    expect(shortcodeToPk('BA')).toBe('64');
  });

  it('round-trips large ids', () => {
    const code = 'C9xYz12AbcD';
    expect(pkToShortcode(shortcodeToPk(code))).toBe(code);
  });

  it('ignores the private-post suffix after 11 chars', () => {
    expect(shortcodeToPk('C9xYz12AbcDextraPrivateChars')).toBe(shortcodeToPk('C9xYz12AbcD'));
  });

  it('accepts pk_userid style ids', () => {
    expect(pkToShortcode('64_123')).toBe('BA');
  });

  it('rejects invalid characters', () => {
    expect(() => shortcodeToPk('ab$cd')).toThrow();
  });
});
