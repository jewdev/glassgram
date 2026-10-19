import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeChrome, type FakeChrome } from './helpers/fake-chrome';

const job = (n: number) => ({ url: `https://scontent.cdninstagram.com/${n}.jpg`, filename: `Glassgram/u/${n}.jpg` });
const flush = () => new Promise((r) => setTimeout(r, 0));

let chrome: FakeChrome;

/** Load the worker as Chrome would on a (re)start. */
async function startWorker(c: FakeChrome) {
  chrome = c;
  vi.stubGlobal('chrome', c);
  vi.resetModules();
  await import('../src/background/index');
  await flush();
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const revoked = () => chrome.runtime.sendMessage.mock.calls.filter(([m]) => m.type === 'offscreen:revoke').map(([m]) => m.url);

describe('download queue', () => {
  it('runs at most three downloads at once and starts the next when one finishes', async () => {
    await startWorker(fakeChrome());
    await chrome.runtime.deliver({ type: 'download', jobs: [1, 2, 3, 4, 5].map(job) });
    await flush();
    expect(chrome.downloads.download).toHaveBeenCalledTimes(3);
    await chrome.downloads.finish(1);
    await flush();
    expect(chrome.downloads.download).toHaveBeenCalledTimes(4);
  });

  it('picks the queue up again after the worker is stopped', async () => {
    await startWorker(fakeChrome());
    await chrome.runtime.deliver({ type: 'download', jobs: [1, 2, 3, 4, 5, 6].map(job) });
    await flush();
    expect(chrome.downloads.download).toHaveBeenCalledTimes(3);

    // Chrome stops the worker: browser downloads and session storage survive, memory doesn't.
    const { list } = chrome.downloads;
    await startWorker(fakeChrome({ downloads: list, session: chrome.storage.session.data }));
    expect(chrome.downloads.download).not.toHaveBeenCalled(); // three still running, no free slot

    for (const id of [1, 2, 3, 4]) {
      await chrome.downloads.finish(id);
      await flush();
    }
    // All six, once each, in order.
    expect(list.map((d) => d.filename)).toEqual([1, 2, 3, 4, 5, 6].map((n) => job(n).filename));
  });

  it('frees slots for downloads that ended while the worker was stopped', async () => {
    await startWorker(fakeChrome());
    await chrome.runtime.deliver({ type: 'download', jobs: [1, 2, 3, 4].map(job) });
    await flush();
    const { list } = chrome.downloads;
    list[0].state = 'complete'; // finished with no worker running
    await startWorker(fakeChrome({ downloads: list, session: chrome.storage.session.data }));
    expect(chrome.downloads.download).toHaveBeenCalledTimes(1);
    expect(list.at(-1)!.filename).toBe(job(4).filename);
  });
});

describe('ZIP', () => {
  /** Stand-in offscreen document: reports progress for its job, then returns blob URLs. */
  function offscreen(urls: (jobs: unknown[]) => string[], created: { doc: boolean }) {
    chrome.runtime.getContexts.mockImplementation(async () => (created.doc ? [{}] : []));
    chrome.offscreen.closeDocument.mockImplementation(async () => void (created.doc = false));
    chrome.offscreen.createDocument.mockImplementation(async () => {
      await flush();
      if (created.doc) throw new Error('Only a single offscreen document may be created.');
      created.doc = true;
    });
    chrome.runtime.sendMessage.mockImplementation(async (msg: any) => {
      if (msg.type !== 'offscreen:zip') return;
      for (let i = 1; i <= msg.jobs.length; i++) {
        await flush();
        chrome.runtime.onMessage.fire({ type: 'zipProgress', jobId: msg.jobId, done: i, total: msg.jobs.length }, {}, () => {});
      }
      return { ok: true, urls: urls(msg.jobs), count: msg.jobs.length };
    });
  }

  it('creates one offscreen document for two ZIPs at once and keeps their progress apart', async () => {
    await startWorker(fakeChrome());
    offscreen((jobs) => [`blob:${jobs.length}`], { doc: false });
    const [a, b] = await Promise.all([
      chrome.runtime.deliver({ type: 'zip', jobs: [1, 2].map(job), zipName: 'a.zip' }, { tab: { id: 10 } }),
      chrome.runtime.deliver({ type: 'zip', jobs: [1, 2, 3].map(job), zipName: 'b.zip' }, { tab: { id: 20 } }),
    ]);
    expect(a).toEqual({ ok: true, count: 2 });
    expect(b).toEqual({ ok: true, count: 3 });
    expect(chrome.offscreen.createDocument).toHaveBeenCalledTimes(1);

    const progress = (tab: number) => chrome.tabs.sendMessage.mock.calls.filter(([t]) => t === tab).map(([, m]) => `${m.done}/${m.total}`);
    expect(progress(10)).toEqual(['1/2', '2/2']);
    expect(progress(20)).toEqual(['1/3', '2/3', '3/3']);
  });

  it('names parts and frees every blob URL once its download ends', async () => {
    await startWorker(fakeChrome());
    offscreen(() => ['blob:1', 'blob:2', 'blob:3'], { doc: true });
    await chrome.runtime.deliver({ type: 'zip', jobs: [job(1)], zipName: 'Glassgram/u_posts.zip' }, { tab: { id: 1 } });
    expect(chrome.downloads.list.map((d) => d.filename)).toEqual(['Glassgram/u_posts_part1.zip', 'Glassgram/u_posts_part2.zip', 'Glassgram/u_posts_part3.zip']);
    expect(revoked()).toEqual([]);
    for (const d of chrome.downloads.list) await chrome.downloads.finish(d.id);
    expect(revoked().sort()).toEqual(['blob:1', 'blob:2', 'blob:3']);
  });

  it('keeps the plain name for a single archive', async () => {
    await startWorker(fakeChrome());
    offscreen(() => ['blob:1'], { doc: true });
    await chrome.runtime.deliver({ type: 'zip', jobs: [job(1)], zipName: 'Glassgram/u_posts.zip' }, { tab: { id: 1 } });
    expect(chrome.downloads.list.map((d) => d.filename)).toEqual(['Glassgram/u_posts.zip']);
  });

  it('revokes blob URLs that never reached a download', async () => {
    await startWorker(fakeChrome());
    offscreen(() => ['blob:1', 'blob:2'], { doc: true });
    chrome.downloads.download.mockRejectedValueOnce(new Error('Invalid filename'));
    const res = await chrome.runtime.deliver({ type: 'zip', jobs: [job(1)], zipName: 'x.zip' }, { tab: { id: 1 } });
    expect(res).toEqual({ ok: false, error: 'Invalid filename' });
    expect(revoked()).toEqual(['blob:1', 'blob:2']);
  });
});

describe('download URLs', () => {
  const at = (url: string) => ({ url, filename: 'Glassgram/x' });

  it('downloads from Instagram media hosts and the unsent-messages export', async () => {
    await startWorker(fakeChrome());
    const urls = ['https://scontent-ams2-1.cdninstagram.com/a.jpg', 'https://video.xx.fbcdn.net/b.mp4', 'https://lookaside.fbsbx.com/c.gif', 'data:application/json;charset=utf-8,%7B%7D'];
    expect(await chrome.runtime.deliver({ type: 'download', jobs: urls.map(at) })).toEqual({ ok: true, count: 4 });
    await flush();
    expect(chrome.downloads.download).toHaveBeenCalledTimes(3); // the fourth waits for a free slot
  });

  it('refuses anything else, without downloading any of the batch', async () => {
    await startWorker(fakeChrome());
    for (const bad of ['https://evil.test/x.jpg', 'https://cdninstagram.com.evil.test/x.jpg', 'https://evilfbcdn.net/x.jpg', 'http://scontent.cdninstagram.com/x.jpg', 'data:text/html,<script>', 'javascript:alert(1)', 'not a url']) {
      const res = await chrome.runtime.deliver({ type: 'download', jobs: [job(1), at(bad)] });
      expect(res).toEqual({ ok: false, error: 'Glassgram only downloads from Instagram.' });
    }
    await flush();
    expect(chrome.downloads.download).not.toHaveBeenCalled();
  });

  it('never fetches a data URL into a ZIP', async () => {
    await startWorker(fakeChrome());
    const res = await chrome.runtime.deliver({ type: 'zip', jobs: [at('data:application/json,{}')], zipName: 'x.zip' }, { tab: { id: 1 } });
    expect(res).toEqual({ ok: false, error: 'Glassgram only downloads from Instagram.' });
  });
});

describe('network rules', () => {
  /** Every rule the worker added, by id, after it applied the stored settings. */
  async function rulesFor(settings: Record<string, unknown>) {
    const c = fakeChrome();
    c.storage.sync.data.settings = settings;
    await startWorker(c);
    await Promise.all(c.runtime.onStartup.fire());
    await flush();
    const added = c.declarativeNetRequest.updateSessionRules.mock.calls.flatMap(([u]: any[]) => u.addRules ?? []);
    return new Map<number, chrome.declarativeNetRequest.Rule>(added.map((r: chrome.declarativeNetRequest.Rule) => [r.id, r]));
  }

  it('does not block analytics unless asked to', async () => {
    const rules = await rulesFor({});
    expect(rules.has(2)).toBe(false);
    expect(rules.has(3)).toBe(false);
    const on = await rulesFor({ 'privacy.blockAnalytics': true });
    expect(on.has(2) && on.has(3)).toBe(true);
  });

  it('makes extension downloads from the CDN look like the page fetching them', async () => {
    const rule = (await rulesFor({})).get(4)!;
    expect(rule.condition).toMatchObject({ tabIds: [-1], requestDomains: ['cdninstagram.com', 'fbcdn.net'] });
    expect(rule.action.requestHeaders).toEqual([
      { header: 'origin', operation: 'remove' },
      { header: 'referer', operation: 'set', value: 'https://www.instagram.com/' },
    ]);
  });
});

describe('offscreen document', () => {
  const zipReply = (urls: string[]) =>
    chrome.runtime.sendMessage.mockImplementation(async (msg: any) => (msg.type === 'offscreen:zip' ? { ok: true, urls, count: 1 } : undefined));

  it('closes once every ZIP part has finished downloading, not before', async () => {
    await startWorker(fakeChrome());
    const doc = { open: false };
    chrome.runtime.getContexts.mockImplementation(async () => (doc.open ? [{}] : []));
    chrome.offscreen.createDocument.mockImplementation(async () => void (doc.open = true));
    chrome.offscreen.closeDocument.mockImplementation(async () => void (doc.open = false));
    zipReply(['blob:1', 'blob:2']);
    await chrome.runtime.deliver({ type: 'zip', jobs: [job(1)], zipName: 'x.zip' }, { tab: { id: 1 } });
    await flush();
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    await chrome.downloads.finish(1);
    await flush();
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    await chrome.downloads.finish(2);
    await flush();
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });

  it('after a worker restart, waits for saved ZIP downloads, then closes', async () => {
    await startWorker(fakeChrome());
    chrome.runtime.getContexts.mockImplementation(async () => [{}]);
    zipReply(['blob:1']);
    await chrome.runtime.deliver({ type: 'zip', jobs: [job(1)], zipName: 'x.zip' }, { tab: { id: 1 } });
    const { list } = chrome.downloads;
    await startWorker(fakeChrome({ downloads: list, session: chrome.storage.session.data }));
    chrome.runtime.getContexts.mockImplementation(async () => [{}]);
    await flush();
    expect(chrome.offscreen.closeDocument).not.toHaveBeenCalled();
    await chrome.downloads.finish(list[0].id);
    await flush();
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });

  it('closes a document left open by a stopped worker with nothing to download', async () => {
    const c = fakeChrome();
    c.runtime.getContexts.mockImplementation(async () => [{}]);
    await startWorker(c);
    await flush();
    expect(chrome.offscreen.closeDocument).toHaveBeenCalledTimes(1);
  });
});

describe('cancelling a ZIP', () => {
  it("stops the tab's ZIP in the offscreen document and downloads nothing", async () => {
    await startWorker(fakeChrome());
    let finish!: (r: unknown) => void;
    chrome.runtime.sendMessage.mockImplementation((msg: any) => (msg.type === 'offscreen:zip' ? new Promise((r) => (finish = r)) : Promise.resolve()));
    const res = chrome.runtime.deliver({ type: 'zip', jobs: [job(1)], zipName: 'x.zip' }, { tab: { id: 7 } });
    await flush();
    await chrome.runtime.deliver({ type: 'cancelZip' }, { tab: { id: 8 } }); // another tab's cancel
    expect(chrome.runtime.sendMessage.mock.calls.some(([m]) => m.type === 'offscreen:cancel')).toBe(false);
    await chrome.runtime.deliver({ type: 'cancelZip' }, { tab: { id: 7 } });
    const cancel = chrome.runtime.sendMessage.mock.calls.find(([m]) => m.type === 'offscreen:cancel')![0];
    const zipMsg = chrome.runtime.sendMessage.mock.calls.find(([m]) => m.type === 'offscreen:zip')![0];
    expect(cancel.jobId).toBe(zipMsg.jobId);
    finish({ ok: true, urls: ['blob:1'], count: 1 }); // it had just finished: still nothing is saved
    expect(await res).toEqual({ ok: false, error: 'Cancelled' });
    expect(chrome.downloads.download).not.toHaveBeenCalled();
    expect(revoked()).toEqual(['blob:1']);
  });
});
