import { describe, expect, it } from 'vitest';
import { availableUpdate, between, checkBundle, compareVersions, newAccess, newerThan, parseNotes, parseReleases, safeZipPath, staleAssets, verifySignature, type Release } from '../src/shared/updates';

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

  it('reads the ZIP digest only when it is a SHA-256', () => {
    const sha = 'AB'.repeat(32);
    const out = parseReleases([
      { tag_name: 'v2.0.0', html_url: 'u', draft: false, prerelease: false, assets: [{ name: 'glassgram.zip', browser_download_url: 'zip', digest: `sha256:${sha}` }] },
      { tag_name: 'v1.0.0', html_url: 'u', draft: false, prerelease: false, assets: [{ name: 'glassgram.zip', browser_download_url: 'zip', digest: 'md5:abc' }] },
    ]);
    expect(out[0].zipSha256).toBe(sha.toLowerCase());
    expect(out[1].zipSha256).toBeUndefined();
  });

  it('finds the signature next to the ZIP', () => {
    const asset = (name: string) => ({ name, browser_download_url: name });
    const out = parseReleases([
      { tag_name: 'v2.0.0', html_url: 'u', draft: false, prerelease: false, assets: [asset('glassgram.zip'), asset('glassgram.zip.sig')] },
      { tag_name: 'v1.0.0', html_url: 'u', draft: false, prerelease: false, assets: [asset('glassgram.zip'), asset('other.sig')] },
    ]);
    expect(out[0].zipSigUrl).toBe('glassgram.zip.sig');
    expect(out[1].zipSigUrl).toBeUndefined();
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

describe('one-click install', () => {
  const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
  const bundle = (m: unknown) => new Map([['manifest.json', enc(m)]]);

  it('keeps paths inside the extension folder', () => {
    expect(safeZipPath('assets/index-abc.js')).toBe('assets/index-abc.js');
    expect(safeZipPath('manifest.json')).toBe('manifest.json');
    for (const bad of ['../evil.js', 'a/../../b', '/etc/x', 'C:/x', 'a\\b', 'a//b', './a', 'dir/', '']) expect(safeZipPath(bad)).toBeNull();
  });

  const running = { name: 'Glassgram', permissions: ['storage'], host_permissions: ['https://*.instagram.com/*'], content_scripts: [{ matches: ['https://www.instagram.com/*'] }] };
  const build = (extra: object = {}) => ({ ...running, manifest_version: 3, version: '1.2.0', ...extra });

  it('accepts only a Glassgram build of the expected version', () => {
    expect(checkBundle(bundle(build()), running, '1.2.0')).toBeUndefined();
    expect(checkBundle(bundle(build({ name: 'Other' })), running, '1.2.0')).toMatch(/isn't a Glassgram/);
    expect(checkBundle(bundle(build({ version: '1.1.0' })), running, '1.2.0')).toMatch(/1\.1\.0/);
    expect(checkBundle(new Map(), running, '1.2.0')).toMatch(/no manifest/);
    expect(checkBundle(new Map([['manifest.json', new Uint8Array([123])]]), running, '1.2.0')).toMatch(/broken/);
  });

  it('refuses a build that asks for new access', () => {
    expect(checkBundle(bundle(build({ permissions: ['storage', 'cookies'] })), running, '1.2.0')).toMatch(/new access \(permission cookies\)/);
    expect(checkBundle(bundle(build({ host_permissions: ['<all_urls>'] })), running, '1.2.0')).toMatch(/site <all_urls>/);
    expect(checkBundle(bundle(build({ permissions: [] })), running, '1.2.0')).toBeUndefined(); // dropping access is fine
  });

  it('lists every kind of new access', () => {
    const next = { permissions: ['storage', 'tabs'], host_permissions: ['https://*.instagram.com/*', 'https://example.com/*'], content_scripts: [{ matches: ['https://www.instagram.com/*', '*://*/*'] }], externally_connectable: { matches: ['https://evil.test/*'], ids: ['abc'] } };
    expect(newAccess(next, running)).toEqual(['permission tabs', 'site https://example.com/*', 'scripts on *://*/*', 'messages from https://evil.test/*', 'messages from extension abc']);
    expect(newAccess({ permissions: 'tabs', content_scripts: [null] }, running)).toEqual([]); // malformed fields count as nothing
  });

  it('checks the release signature', async () => {
    const ed = { name: 'Ed25519' };
    const b64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    const keys = (await crypto.subtle.generateKey(ed, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pub = b64(await crypto.subtle.exportKey('spki', keys.publicKey));
    const zip = new TextEncoder().encode('zip bytes');
    const sig = b64(await crypto.subtle.sign(ed, keys.privateKey, zip));
    expect(await verifySignature(zip, sig, pub)).toBe(true);
    expect(await verifySignature(new TextEncoder().encode('zip bytez'), sig, pub)).toBe(false);
    const other = (await crypto.subtle.generateKey(ed, true, ['sign', 'verify'])) as CryptoKeyPair;
    expect(await verifySignature(zip, sig, b64(await crypto.subtle.exportKey('spki', other.publicKey)))).toBe(false);
  });

  it('removes only old build chunks', () => {
    expect(staleAssets(['assets/old.js', 'assets/kept.js', 'icons/16.png', 'notes.txt'], ['assets/kept.js', 'manifest.json'])).toEqual(['assets/old.js']);
  });
});
