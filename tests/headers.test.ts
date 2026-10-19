import { describe, expect, it } from 'vitest';
import { randomPageId, restHeaders } from '../src/content/core/headers';

const base = { csrf: 'tok', claim: 'hmac.abc', session: 'abc123:4567890123456', tab: 'def456', pageId: 'ghi789', maxTouchPoints: 0 };

describe('restHeaders', () => {
  it("sends what Instagram's web client sends on /api/v1/, in its order", () => {
    expect(Object.entries(restHeaders(base))).toEqual([
      ['X-CSRFToken', 'tok'],
      ['X-IG-App-ID', '936619743392459'],
      ['X-ASBD-ID', '359341'],
      ['X-IG-WWW-Claim', 'hmac.abc'],
      ['X-Web-Session-ID', 'abc123:def456:ghi789'],
      ['X-IG-Max-Touch-Points', '0'],
      ['Accept', '*/*'],
      ['X-Requested-With', 'XMLHttpRequest'],
    ]);
  });

  it('falls back like Instagram does when its storage has no claim yet', () => {
    expect(restHeaders({ ...base, claim: null })['X-IG-WWW-Claim']).toBe('0');
  });

  it('leaves out the session id rather than sending a malformed one', () => {
    expect(restHeaders({ ...base, session: null })).not.toHaveProperty('X-Web-Session-ID');
    expect(restHeaders({ ...base, tab: 'x:y' })).not.toHaveProperty('X-Web-Session-ID');
  });
});

describe('randomPageId', () => {
  it('makes six lowercase letters and digits', () => {
    expect(randomPageId()).toMatch(/^[a-z0-9]{6}$/);
    expect(randomPageId(() => 0)).toBe('000000');
    expect(randomPageId(() => 0.999)).toBe('zzzzzz');
  });
});

describe('X-ASBD-ID', () => {
  it("sends Instagram's current value once the page script has seen it, the built-in one until then", () => {
    expect(restHeaders({ ...base, asbd: '123456' })['X-ASBD-ID']).toBe('123456');
    expect(restHeaders({ ...base, asbd: undefined })['X-ASBD-ID']).toBe('359341');
  });
});
