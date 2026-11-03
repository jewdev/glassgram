import { describe, expect, it } from 'vitest';
import { clock, formatDuration, unfollowDelayMs, unfollowEtaMs } from '../src/content/features/unfollow-pacing';

describe('unfollow pacing', () => {
  it('waits the setting to 1.2 times it, like the upstream script', () => {
    expect(unfollowDelayMs(4000, () => 0)).toBe(4000);
    expect(unfollowDelayMs(4000, () => 0.999999)).toBe(4799);
  });

  it('counts a long pause after every 5 unfollows, none after the last', () => {
    expect(unfollowEtaMs(1, 4000, 300000)).toBe(0);
    expect(unfollowEtaMs(5, 4000, 300000)).toBeCloseTo(4 * 4400);
    expect(unfollowEtaMs(6, 4000, 300000)).toBeCloseTo(5 * 4400 + 300000);
    expect(unfollowEtaMs(11, 4000, 300000)).toBeCloseTo(10 * 4400 + 2 * 300000);
  });

  it('formats durations and countdowns', () => {
    expect(formatDuration(45000)).toBe('45 s');
    expect(formatDuration(12 * 60000)).toBe('12 min');
    expect(formatDuration(125 * 60000)).toBe('2 h 5 min');
    expect(formatDuration(120 * 60000)).toBe('2 h');
    expect(clock(299.2)).toBe('5:00');
    expect(clock(61)).toBe('1:01');
  });
});
