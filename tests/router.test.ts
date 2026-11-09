import { describe, expect, it } from 'vitest';
import { parseRoute } from '../src/content/core/router';

describe('parseRoute saved pages', () => {
  it('reads all saved posts and single collections', () => {
    expect(parseRoute('/me/saved/')).toEqual({ kind: 'profile', username: 'me', saved: 'all' });
    expect(parseRoute('/me/saved/all-posts/')).toEqual({ kind: 'profile', username: 'me', saved: 'all' });
    expect(parseRoute('/me/saved/_/18033554407504156/')).toEqual({ kind: 'profile', username: 'me', saved: '18033554407504156' });
    expect(parseRoute('/me/saved/trips/123/')).toEqual({ kind: 'profile', username: 'me', saved: '123' });
  });

  it('leaves other profile pages alone', () => {
    expect(parseRoute('/me/')).toEqual({ kind: 'profile', username: 'me' });
    expect(parseRoute('/me/tagged/')).toEqual({ kind: 'profile', username: 'me' });
  });
});
