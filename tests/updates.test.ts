import { describe, expect, it } from 'vitest';
import { availableUpdate, between, compareVersions, newerThan, parseNotes, parseReleases, type Release } from '../src/shared/updates';

const rel = (version: string): Release => ({ version, name: `v${version}`, notes: '', url: '', publishedAt: '' });

describe('compareVersions', () => {
  it('orders numerically, not as strings', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0);
  });
});

describe('parseReleases', () => {
  it('drops drafts and pre-releases, sorts newest first and finds the ZIP', () => {
    const out = parseReleases([
      { tag_name: 'v1.0.0', html_url: 'u1', draft: false, prerelease: false, assets: [] },
      { tag_name: 'v1.2.0', html_url: 'u2', draft: false, prerelease: false, assets: [{ name: 'glassgram.zip', browser_download_url: 'zip' }] },
      { tag_name: 'v1.3.0', html_url: 'u3', draft: true, prerelease: false },
      { tag_name: 'v1.4.0-beta', html_url: 'u4', draft: false, prerelease: true },
    ]);
    expect(out.map((r) => r.version)).toEqual(['1.2.0', '1.0.0']);
    expect(out[0].zipUrl).toBe('zip');
  });

  it('ignores a non-array response', () => {
    expect(parseReleases({ message: 'rate limited' })).toEqual([]);
  });
});

describe('update selection', () => {
  const releases = [rel('1.3.0'), rel('1.2.0'), rel('1.1.0'), rel('1.0.0')];

  it('lists every version newer than the installed one', () => {
    expect(newerThan(releases, '1.1.0').map((r) => r.version)).toEqual(['1.3.0', '1.2.0']);
  });

  it('lists what changed in an update', () => {
    expect(between(releases, '1.0.0', '1.2.0').map((r) => r.version)).toEqual(['1.2.0', '1.1.0']);
  });

  it('hides a skipped version until a newer one ships', () => {
    expect(availableUpdate({ releases, skipped: '1.3.0' }, '1.0.0')).toBeUndefined();
    expect(availableUpdate({ releases, skipped: '1.2.0' }, '1.0.0')?.version).toBe('1.3.0');
    expect(availableUpdate({ releases }, '1.3.0')).toBeUndefined();
  });
});

describe('parseNotes', () => {
  it('reads headings, bullets and inline markup, and drops the changelog footer', () => {
    const blocks = parseNotes('## New\n- **Video:** Remember `volume` [docs](https://example.com)\n\n**Full Changelog**: https://github.com/x');
    expect(blocks).toEqual([
      { kind: 'heading', text: 'New' },
      {
        kind: 'item',
        parts: [
          { text: 'Video:', bold: true },
          { text: ' Remember ' },
          { text: 'volume', code: true },
          { text: ' ' },
          { text: 'docs', href: 'https://example.com' },
        ],
      },
    ]);
  });

  it('strips the "by @user in" tail of GitHub generated notes', () => {
    expect(parseNotes('* Fix thing by @jewdev in https://github.com/x/pull/1')).toEqual([{ kind: 'item', parts: [{ text: 'Fix thing' }] }]);
  });

  it('never turns non-https links into anchors', () => {
    expect(parseNotes('[x](javascript:alert(1))')[0]).toEqual({ kind: 'para', parts: [{ text: '[x](javascript:alert(1))' }] });
  });
});
