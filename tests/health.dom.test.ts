// @vitest-environment happy-dom
// @vitest-environment-options {"url":"https://www.instagram.com/"}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HealthCheck, HealthReport } from '../src/shared/health';

// The content script's side of the full check, step by step, on hand-written copies of the pages.
// The page script and Instagram's session are stand-ins: these tests are about reading the page.

const page = { relay: true, templates: ['PolarisProfilePostsQuery'] };
vi.mock('../src/content/core/bridge', () => ({
  bridge: vi.fn(async (op: string) => (op === 'health' ? page : null)),
  bridgeSafe: vi.fn(async (op: string, _a: unknown, fallback: unknown) =>
    op === 'getMedia' ? { code: 'POSTCODE1', image_versions2: { candidates: [{ url: 'https://scontent.cdninstagram.com/a.jpg', width: 1, height: 1 }] } } : fallback,
  ),
  onPage: vi.fn(() => () => {}),
}));
vi.mock('../src/content/core/api', () => ({ myUserId: () => '1', cooldownLeft: async () => 0 }));

const { runHealthCheck } = await import('../src/content/health');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'performance', 'Date'] });
  (globalThis as { chrome?: unknown }).chrome = { runtime: { getManifest: () => ({ version: '1.9.0' }) } };
});
afterEach(() => vi.useRealTimers());

/** Run one step at `path` with `html` as the page, letting its waits pass. */
async function step(stepName: Parameters<typeof runHealthCheck>[0], path: string, html: string): Promise<HealthReport> {
  history.replaceState(null, '', path);
  document.body.innerHTML = html;
  const report = runHealthCheck(stepName);
  await vi.advanceTimersByTimeAsync(15000);
  return report;
}

const byId = (r: HealthReport, id: string): HealthCheck => {
  const c = r.checks.find((x) => x.id === id);
  if (!c) throw new Error(`no check ${id}: ${r.checks.map((x) => x.id).join(', ')}`);
  return c;
};

const NAV = '<nav><a href="/reels/">Reels</a><a href="/explore/">Explore</a></nav>';
const feedPost = (code: string, author: string) =>
  `<article><a href="/${author}/">${author}</a><img src="x.jpg"><a href="/p/${code}/"><time datetime="2026-11-16T00:00:00Z">1h</time></a></article>`;

describe('Home step', () => {
  const HOME = `${NAV}<main><div><ul><li><canvas></canvas></li><li><canvas></canvas></li></ul></div>${feedPost('POSTCODE1', 'alice')}${feedPost('POSTCODE2', 'bob')}</main>`;

  it("checks Glassgram's connection once, then the feed", async () => {
    const r = await step('home', '/', HOME);
    for (const id of ['session', 'page', 'relay', 'cooldown', 'feed', 'media', 'nav', 'stories']) expect(byId(r, id).status).toBe('ok');
    expect(byId(r, 'session').group).toBeUndefined();
    expect(byId(r, 'feed').group).toBe('Home feed');
    expect(byId(r, 'feed').detail).toBe('Recognized 2 of 2 posts on screen.');
  });

  it('finds a post and a profile for the next steps', async () => {
    const r = await step('home', '/', HOME);
    expect(r.next).toEqual({ post: 'POSTCODE1', profile: 'alice' });
  });

  it('warns about missing menu links, and skips a missing stories tray', async () => {
    const r = await step('home', '/', `<main>${feedPost('POSTCODE1', 'alice')}</main>`);
    expect(byId(r, 'nav').status).toBe('warn');
    expect(byId(r, 'stories').status).toBe('skip');
  });

  it('fails when posts are on screen but not inside <article>', async () => {
    const r = await step('home', '/', `<main><div><a href="/p/POSTCODE1/">post</a></div></main>`);
    expect(byId(r, 'feed').status).toBe('fail');
    expect(byId(r, 'home-load').status).toBe('warn');
  });
});

describe('post step', () => {
  it('finds the post, its date and its comments', async () => {
    const r = await step(
      'post',
      '/p/POSTCODE1/',
      `<main><img src="x.jpg"><time datetime="a">1h</time><ul><li><span dir="auto">nice</span><time datetime="b">2m</time></li></ul></main>`,
    );
    expect(byId(r, 'feed').status).toBe('ok');
    expect(byId(r, 'comments').detail).toBe('Found 1 comment with their text.');
    expect(r.checks.every((c) => c.group === 'A post')).toBe(true);
  });

  it('skips comments on a post without any', async () => {
    const r = await step('post', '/p/POSTCODE1/', `<main><img src="x.jpg"><time datetime="a">1h</time></main>`);
    expect(byId(r, 'comments').status).toBe('skip');
  });
});

describe('profile step', () => {
  it('finds the header, picture and username', async () => {
    const r = await step('profile', '/alice/', `<main><header><img src="p.jpg"><h2>alice</h2></header></main>`);
    expect(byId(r, 'profile').status).toBe('ok');
    expect(byId(r, 'bulk').status).toBe('skip'); // bulk download is off by default
  });

  it('warns when the username is not in the header', async () => {
    const r = await step('profile', '/alice/', `<main><header><img src="p.jpg"><h2>Someone else</h2></header></main>`);
    expect(byId(r, 'profile').status).toBe('warn');
    expect(byId(r, 'profile').affects).toContain('Follow status badge');
  });
});

describe('Reels, Explore and Messages steps', () => {
  it('fails Reels without a video', async () => {
    const r = await step('reels', '/reels/', '<main><div>nothing</div></main>');
    expect(byId(r, 'reels').status).toBe('fail');
    expect(byId(r, 'reels').affects).toContain('Reel counter');
  });

  it('passes Reels with a video', async () => {
    const r = await step('reels', '/reels/', '<main><video></video></main>');
    expect(byId(r, 'reels').status).toBe('ok');
  });

  it('counts the Explore grid', async () => {
    const r = await step('explore', '/explore/', '<main><a href="/p/POSTCODE1/">a</a><a href="/reel/REELCODE1/">b</a></main>');
    expect(byId(r, 'explore').detail).toBe('Found 2 posts in the grid.');
  });

  it('opens the inbox and says no chat was opened', async () => {
    const r = await step('direct', '/direct/inbox/', '<main><div>chats</div></main>');
    expect(byId(r, 'direct').status).toBe('ok');
    expect(byId(r, 'direct').detail).toContain('nothing is marked as read');
  });

  it('fails Messages when Instagram sent the tab elsewhere', async () => {
    const r = await step('direct', '/accounts/login/', '<main><div>log in</div></main>');
    expect(byId(r, 'direct').status).toBe('fail');
  });
});
