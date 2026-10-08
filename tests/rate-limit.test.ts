import { describe, expect, it } from 'vitest';
import { isRateLimited } from '../src/content/core/rate-limit';

describe('isRateLimited', () => {
  it("flags Instagram's slow-down answers", () => {
    expect(isRateLimited({ message: 'feedback_required', feedback_title: 'Try Again Later' })).toBe(true);
    expect(isRateLimited({ message: 'checkpoint_required' })).toBe(true);
    expect(isRateLimited({ message: 'Please wait a few minutes before you try again.' })).toBe(true);
    expect(isRateLimited({ message: 'Something odd', spam: true })).toBe(true);
  });

  it('leaves ordinary errors alone', () => {
    expect(isRateLimited({ message: 'Media not found or unavailable' })).toBe(false);
    expect(isRateLimited({ message: 'Character limit exceeded' })).toBe(false);
    expect(isRateLimited({ message: 'Wait for the upload to finish' })).toBe(false);
    expect(isRateLimited({ message: 'checkpoint_url missing' })).toBe(false);
    expect(isRateLimited({})).toBe(false);
    expect(isRateLimited(null)).toBe(false);
  });
});
