import { afterEach, describe, expect, it, vi } from 'vitest';
import { acceptPort, hooksFor, HANDSHAKE, NO_PAGE_SETTINGS, offerPort, pageSettings, RETRY } from '../src/shared/page-channel';
import { DEFAULTS } from '../src/shared/settings-schema';

/** Enough of `window` for the handshake: postMessage dispatches a message event later, like a browser. */
class FakeWindow extends EventTarget {
  posted: unknown[] = [];
  postMessage(data: unknown, _origin: string, ports: MessagePort[] = []) {
    this.posted.push(data);
    setTimeout(() => {
      const e = new Event('message');
      Object.assign(e, { data, ports, source: this });
      this.dispatchEvent(e);
    });
  }
}

const wait = (ms = 5) => new Promise((r) => setTimeout(r, ms));
const open: MessagePort[] = [];
afterEach(() => open.splice(0).forEach((p) => p.close()));

describe('hooksFor', () => {
  it('patches nothing when no page-level feature is on', () => {
    expect(hooksFor(NO_PAGE_SETTINGS)).toEqual([]);
  });

  it('patches only what the settings need', () => {
    expect(hooksFor({ ...NO_PAGE_SETTINGS, anonStories: true })).toEqual(['net']);
    expect(hooksFor({ ...NO_PAGE_SETTINGS, dmHideTyping: true })).toEqual(['socket', 'dgw']);
    expect(hooksFor({ ...NO_PAGE_SETTINGS, dmKeep: true })).toEqual(['net', 'socket']);
    expect(hooksFor({ ...NO_PAGE_SETTINGS, directLinks: true })).toEqual(['open']);
  });

  it('with the default settings, only cleans copied links', () => {
    expect(hooksFor(pageSettings(DEFAULTS))).toEqual(['clipboard']);
  });
});

describe('handshake', () => {
  it('hands the port over without the page ever seeing the message', async () => {
    const win = new FakeWindow();
    let pageSaw = 0;
    let page: MessagePort | undefined;
    let found = '';
    offerPort(win as unknown as Window, (p, init) => {
      page = p;
      found = init.found;
    });
    acceptPort(win as unknown as Window, (p) => {
      open.push(p);
      p.postMessage({ t: 'init', found: 'e123' });
    });
    // Instagram's scripts run after both content scripts and listen from then on.
    win.addEventListener('message', () => pageSaw++);
    win.addEventListener('message', () => pageSaw++, true);
    await vi.waitFor(() => expect(page).toBeDefined());
    open.push(page!);
    expect(found).toBe('e123');
    expect(win.posted).toEqual([HANDSHAKE]);
    expect(pageSaw).toBe(0);
  });

  it('offers again when the content script came late, and only until it connects', async () => {
    const win = new FakeWindow();
    let connects = 0;
    offerPort(win as unknown as Window, (p) => {
      open.push(p);
      connects++;
    });
    await wait(); // the first offer went unanswered
    acceptPort(
      win as unknown as Window,
      (p) => {
        open.push(p);
        p.postMessage({ t: 'init', found: 'x' });
      },
      0,
    );
    await vi.waitFor(() => expect(connects).toBe(1));
    expect(win.posted).toEqual([HANDSHAKE, RETRY, HANDSHAKE]);
    // A late ask (from anyone) gets no new port once connected.
    win.postMessage(RETRY, '*');
    await wait();
    expect(win.posted.filter((m) => m === HANDSHAKE)).toHaveLength(2);
  });

  it('ignores a port whose other end never says init', async () => {
    const win = new FakeWindow();
    let connected = false;
    offerPort(win as unknown as Window, () => (connected = true));
    acceptPort(win as unknown as Window, (p) => {
      open.push(p);
      p.postMessage({ t: 'rpc', id: 1, op: 'getUser', args: {} });
    });
    await wait(50);
    expect(open).toHaveLength(1); // the port did arrive
    expect(connected).toBe(false);
  });
});
