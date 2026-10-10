import { describe, expect, it } from 'vitest';
import { sanitizeSettings } from '../src/shared/settings';

describe('sanitizeSettings', () => {
  it('drops unknown keys, wrong types and values outside a select', () => {
    expect(sanitizeSettings({ nope: 1, 'download.enabled': 'yes', 'ui.theme': 'neon', 'download.mode': 'tar', 'dm.keepFor': 'forever' })).toEqual({});
  });

  it('keeps valid values and clamps numbers to their range', () => {
    expect(sanitizeSettings({ 'ui.theme': 'dark', 'download.mode': 'folder', 'bulk.delayMin': 0, 'bulk.delayMax': 999, 'video.loop': false })).toEqual({
      'ui.theme': 'dark',
      'download.mode': 'folder',
      'bulk.delayMin': 0.5,
      'bulk.delayMax': 60,
      'video.loop': false,
    });
  });

  it('rejects non-finite numbers and inherited keys', () => {
    expect(sanitizeSettings({ 'bulk.delayMin': Number.NaN })).toEqual({});
    expect(sanitizeSettings(Object.create({ 'video.loop': false }))).toEqual({});
  });
});
