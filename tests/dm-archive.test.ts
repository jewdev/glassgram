import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DmMessage } from '../src/shared/slide';

vi.mock('../src/content/core/api', () => ({ myUserId: () => 'me' }));
vi.mock('../src/content/core/download', () => ({ inRootFolder: (p: string) => p }));
vi.mock('../src/content/core/observer', () => ({ onDomChange: () => () => {} }));
vi.mock('../src/content/core/state', () => ({ getSettings: () => settings }));
vi.mock('../src/content/core/bridge', () => ({ onFound: () => () => {}, onPage: () => () => {}, requestScan: () => {} }));
vi.mock('../src/content/ui/dom', () => ({ h: () => ({}), icon: () => '', shadowHost: () => ({}) }));
vi.mock('../src/content/ui/modal', () => ({ openModal: () => ({}) }));
vi.mock('../src/content/ui/toast', () => ({ toast: () => {} }));

let settings: Record<string, unknown> = {};
const store: Record<string, unknown> = {};
const set = vi.fn(async (items: Record<string, unknown>) => void Object.assign(store, structuredClone(items)));

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  for (const k of Object.keys(store)) delete store[k];
  set.mockClear();
  settings = { 'dm.keepFor': '30' };
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('document', { querySelectorAll: () => [] });
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        // Slow reads, so two batches overlap while their storage loads are in flight.
        get: async (keys: string | string[]) => {
          await new Promise((r) => setTimeout(r, 10));
          return Object.fromEntries([keys].flat().filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
        },
        getKeys: async () => Object.keys(store),
        set,
        remove: async (keys: string | string[]) => [keys].flat().forEach((k) => delete store[k]),
      },
      onChanged: { addListener: () => {} },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const msg = (id: string, ts = Date.now()): DmMessage => ({ id, thread: 't1', senderId: 'them', kind: 'TEXT', text: id, media: [], ts });

/** Runs `p` past the slow storage reads and the debounced save. */
async function settle(p: Promise<unknown>) {
  await vi.advanceTimersByTimeAsync(20);
  await p;
  await vi.advanceTimersByTimeAsync(1500);
}

describe('dm-archive handle', () => {
  it('keeps messages from two batches for the same chat that arrive together', async () => {
    const { handle } = await import('../src/content/features/dm-archive');
    await settle(Promise.all([handle([{ type: 'message', message: msg('a') }]), handle([{ type: 'message', message: msg('b') }])]));
    expect(Object.keys(store['ige.dm.t.t1'] as object).sort()).toEqual(['a', 'b']);
  });

  it("doesn't overwrite what another tab saved", async () => {
    const { handle } = await import('../src/content/features/dm-archive');
    await settle(handle([{ type: 'message', message: msg('a') }, { type: 'message', message: msg('b') }]));
    // Another tab, still holding an older copy, saves its own messages and an unsend.
    store['ige.dm.t.t1'] = { a: msg('a'), c: msg('c') };
    store['ige.dm.u.x'] = { ...msg('x'), unsentAt: 1 };
    await settle(handle([{ type: 'message', message: msg('d') }, { type: 'unsend', id: 'b', thread: 't1' }]));
    expect(Object.keys(store['ige.dm.t.t1'] as object).sort()).toEqual(['a', 'c', 'd']);
    expect(Object.keys(store).filter((k) => k.startsWith('ige.dm.u.')).sort()).toEqual(['ige.dm.u.b', 'ige.dm.u.x']);
  });

  it('moves unsent messages from the old single key to one key each', async () => {
    store['ige.dm.unsent'] = { a: { ...msg('a'), unsentAt: 1 } };
    store['ige.dmArchive'] = { b: { ...msg('b'), unsentAt: 2 }, c: msg('c') };
    const { handle } = await import('../src/content/features/dm-archive');
    await settle(handle([]));
    expect(Object.keys(store).sort()).toEqual(['ige.dm.u.a', 'ige.dm.u.b']);
  });

  it('caps each chat even when kept forever', async () => {
    settings = { 'dm.keepFor': '0' };
    const old = Date.now() - 1000 * 86_400_000;
    store['ige.dm.t.t1'] = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`m${i}`, msg(`m${i}`, old + i)]));
    const { handle } = await import('../src/content/features/dm-archive');
    await settle(handle([{ type: 'message', message: msg('new') }]));
    const kept = store['ige.dm.t.t1'] as Record<string, DmMessage>;
    expect(Object.keys(kept)).toHaveLength(2000);
    expect(kept.new).toBeDefined();
    expect(kept.m0).toBeUndefined(); // the oldest one made room
  });
});
