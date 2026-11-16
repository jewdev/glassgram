// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://www.instagram.com/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../src/shared/settings-schema';

// Instagram's feed, reduced to what declutter reads: <article> posts with a label, a time link and
// the author link. Layout doesn't exist here, so every post measures 0 and counts as on screen.

let stop: () => void;
let feed: HTMLElement;
let mod: typeof import('../src/content/features/declutter');
let state: typeof import('../src/content/core/state');

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] });
  vi.resetModules();
  history.replaceState(null, '', '/');
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  document.body.innerHTML = '<main><div id="feed"></div></main>';
  feed = document.getElementById('feed')!;
  state = await import('../src/content/core/state');
  mod = await import('../src/content/features/declutter');
  stop = mod.declutter.start();
  await scan();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

function post(code: string, { label, author = 'friend', text = '', links }: { label?: string; author?: string; text?: string; links?: string } = {}) {
  const art = document.createElement('article');
  art.innerHTML =
    `<a href="/${author}/">${author}</a>` +
    (label ? `<span>${label}</span>` : '') +
    (links ?? `<a href="/p/${code}/"><time>1h</time></a>`) +
    `<p>${text}</p>`;
  return art;
}

/** One throttled DOM scan, triggered the way the page triggers it: by a mutation. */
async function scan() {
  document.body.append(document.createElement('i'));
  await Promise.resolve();
  vi.advanceTimersByTime(300);
}

/** Let the observer deliver the latest mutations, without a scan. */
const delivered = () => Promise.resolve();

const collapsed = (el: HTMLElement) => el.style.getPropertyValue('height') === '1px';
const anchoring = () => document.documentElement.style.getPropertyValue('overflow-anchor');

function settings(patch: Partial<Settings>) {
  const next = { ...state.getSettings(), ...patch };
  state.setSettings(next);
  mod.declutter.onSettings?.(next);
}

/** Collapse an ad, then unmount it the way Instagram does when you scroll past. */
async function rememberAd(code: string) {
  const ad = post(code, { label: 'Sponsored' });
  feed.append(ad);
  await scan();
  expect(collapsed(ad)).toBe(true);
  ad.remove();
}

describe('declutter feed posts', () => {
  it('collapses an ad to 1px and leaves normal posts alone', async () => {
    const ad = post('ADPOST1', { label: 'Sponsored' });
    const normal = post('OKPOST1');
    feed.append(ad, normal);
    await scan();
    expect(collapsed(ad)).toBe(true);
    expect(ad.style.getPropertyValue('visibility')).toBe('hidden');
    expect(collapsed(normal)).toBe(false);
  });

  it('puts the post back when the feature stops', async () => {
    const ad = post('ADPOST1', { label: 'Sponsored' });
    ad.style.setProperty('height', '50px');
    feed.append(ad);
    await scan();
    stop();
    expect(ad.style.getPropertyValue('height')).toBe('50px');
    expect(ad.style.getPropertyValue('visibility')).toBe('');
    stop = () => {};
  });

  it('leaves suggested posts until that toggle is on', async () => {
    const sug = post('SUGPOST1', { label: 'Suggested for you' });
    feed.append(sug);
    await scan();
    expect(collapsed(sug)).toBe(false);
    settings({ 'declutter.suggested': true });
    expect(collapsed(sug)).toBe(true);
  });

  it('collapses muted posts on Home', async () => {
    settings({ 'declutter.muteWords': 'giveaway' });
    const muted = post('MUTED01', { text: 'Huge GIVEAWAY today' });
    feed.append(muted);
    await scan();
    expect(collapsed(muted)).toBe(true);
  });
});

describe('remounted posts', () => {
  it('collapses a remembered post the moment it mounts, before any scan', async () => {
    await rememberAd('ADPOST1');
    const again = post('ADPOST1'); // label not rendered yet
    feed.append(again);
    await delivered();
    expect(collapsed(again)).toBe(true);
  });

  it('keeps it collapsed when the label shows up again', async () => {
    await rememberAd('ADPOST1');
    const again = post('ADPOST1', { label: 'Sponsored' });
    feed.append(again);
    for (let i = 0; i < 8; i++) await scan();
    expect(collapsed(again)).toBe(true);
  });

  it('shows it again and forgets it when it no longer reads as an ad', async () => {
    await rememberAd('ADPOST1');
    const again = post('ADPOST1');
    feed.append(again);
    await delivered();
    expect(collapsed(again)).toBe(true);
    for (let i = 0; i < 6; i++) await scan();
    expect(collapsed(again)).toBe(false);

    again.remove();
    const third = post('ADPOST1');
    feed.append(third);
    await delivered();
    expect(collapsed(third)).toBe(false);
  });

  it('forgets but does not open a stale post above the screen', async () => {
    await rememberAd('ADPOST1');
    const again = post('ADPOST1');
    vi.spyOn(again, 'getBoundingClientRect').mockReturnValue({ top: -500, bottom: -499 } as DOMRect);
    feed.append(again);
    for (let i = 0; i < 6; i++) await scan();
    expect(collapsed(again)).toBe(true);

    again.remove();
    const next = post('ADPOST1');
    feed.append(next);
    await delivered();
    expect(collapsed(next)).toBe(false);
  });

  it('does not remember a post whose links point at different posts', async () => {
    // No time link, and the caption links another post first: the old fallback filed the ad under it.
    const ad = post('X', { label: 'Sponsored', links: '<span>see <a href="/p/BBBBB1/">this</a></span><a href="/p/AAAAA1/">photo</a>' });
    feed.append(ad);
    await scan();
    expect(collapsed(ad)).toBe(true);
    ad.remove();

    const other = post('BBBBB1');
    feed.append(other);
    await delivered();
    expect(collapsed(other)).toBe(false);
  });

  it('forgets the oldest of 500 remembered posts, not one the feed keeps remounting', async () => {
    await rememberAd('KEEPPOST');
    const batch = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => post(`${prefix}${String(i).padStart(4, '0')}`, { label: 'Sponsored' }));
    const many = batch('FILLA', 499); // 500 remembered: the cap, nothing forgotten yet
    feed.append(...many);
    await scan();
    many.forEach((a) => a.remove());

    const back = post('KEEPPOST', { label: 'Sponsored' });
    feed.append(back);
    await delivered();
    expect(collapsed(back)).toBe(true);
    back.remove();

    const more = batch('FILLB', 2); // two over the cap: the two oldest go
    feed.append(...more);
    await scan();
    more.forEach((a) => a.remove());

    const last = post('KEEPPOST');
    feed.append(last);
    await delivered();
    expect(collapsed(last)).toBe(true);
  });

  it('leaves a remembered post visible outside Home', async () => {
    await rememberAd('ADPOST1');
    history.replaceState(null, '', '/p/ADPOST1/');
    const opened = post('ADPOST1');
    feed.append(opened);
    await delivered();
    await scan();
    expect(collapsed(opened)).toBe(false);
  });
});

describe('scroll anchoring', () => {
  it('stays on until a post on Home is collapsed, then goes off, and comes back on stop', async () => {
    feed.append(post('OKPOST1'));
    await scan();
    expect(anchoring()).toBe('');

    feed.append(post('ADPOST1', { label: 'Sponsored' }));
    await scan();
    expect(anchoring()).toBe('none');

    stop();
    stop = () => {};
    expect(anchoring()).toBe('');
  });

  it('comes back on when every collapsing toggle is off', async () => {
    feed.append(post('ADPOST1', { label: 'Sponsored' }));
    await scan();
    expect(anchoring()).toBe('none');
    settings({ 'declutter.ads': false });
    expect(anchoring()).toBe('');
  });
});
