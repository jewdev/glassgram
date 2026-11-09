import { describe, expect, it } from 'vitest';
import { finished } from '../src/content/features/reels-autoscroll';

describe('finished', () => {
  it('spots a loop back to the start', () => {
    expect(finished(14.6, 0.2, 15)).toBe(true);
    expect(finished(7.4, 0.1, 8)).toBe(true);
  });

  it('ignores normal playback, seeks in the middle and short or unknown videos', () => {
    expect(finished(5, 5.25, 15)).toBe(false);
    expect(finished(6, 0.2, 15)).toBe(false);
    expect(finished(14.6, 9, 15)).toBe(false);
    expect(finished(1.4, 0.1, 1.5)).toBe(false);
    expect(finished(14, 0.1, NaN)).toBe(false);
  });
});
