import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DmMessage } from '../src/shared/slide';

vi.mock('../src/content/core/api', () => ({ myUserId: () => 'me' }));
vi.mock('../src/content/core/download', () => ({ inRootFolder: (p: string) => p }));
vi.mock('../src/content/core/observer', () => ({ onDomChange: () => () => {} }));
vi.mock('../src/content/ui/dom', () => ({ h: () => ({}), icon: () => '' }));
vi.mock('../src/content/ui/modal', () => ({ openModal: () => ({}) }));
vi.mock('../src/content/ui/toast', () => ({ toast: () => {} }));

const store: Record<string, unknown> = {};
const set = vi.fn(async (items: Record<string, unknown>) => void Object.assign(store, structuredClone(items)));

beforeEach(() => {
  vi.useFakeTimers();
  for (const k of Object.keys(store)) delete store[k];
  set.mockClear();
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        // Slow reads, so two batches overlap while their storage loads are in flight.
        get: async (keys: string | string[]) => {
          await new Promise((r) => setTimeout(r, 10));
          return Object.fromEntries([keys].flat().filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
        },
        set,
        remove: async () => {},
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const msg = (id: string): DmMessage => ({ id, thread: 't1', senderId: 'them', kind: 'TEXT', text: id, media: [], ts: Date.now() });

describe('dm-archive handle', () => {
  it('keeps messages from two batches for the same chat that arrive together', async () => {
    const { handle } = await import('../src/content/features/dm-archive');
    const done = Promise.all([handle([{ type: 'message', message: msg('a') }]), handle([{ type: 'message', message: msg('b') }])]);
    await vi.advanceTimersByTimeAsync(20);
    await done;
    await vi.advanceTimersByTimeAsync(1500); // debounced save
    expect(Object.keys(store['ige.dm.t.t1'] as object).sort()).toEqual(['a', 'b']);
  });
});
