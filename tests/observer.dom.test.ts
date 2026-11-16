// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Observer = typeof import('../src/content/core/observer');
let obs: Observer;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame', 'performance'] });
  vi.resetModules();
  obs = await import('../src/content/core/observer');
  document.body.innerHTML = '';
});

afterEach(() => vi.useRealTimers());

/** Let the observer deliver its records (a microtask). */
const delivered = () => Promise.resolve();

describe('onMutations', () => {
  it('gets each batch right away, before the throttled scans run', async () => {
    const order: string[] = [];
    const offScan = obs.onDomChange(() => order.push('scan'));
    vi.advanceTimersByTime(300);
    order.length = 0;
    const offNow = obs.onMutations((records) => order.push(`now:${records.length}`));

    document.body.append(document.createElement('div'));
    await delivered();
    expect(order).toEqual(['now:1']);

    vi.advanceTimersByTime(300);
    expect(order).toEqual(['now:1', 'scan']);
    offScan();
    offNow();
  });

  it('keeps going when one handler throws', async () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const seen: number[] = [];
    const offBad = obs.onMutations(() => {
      throw new Error('boom');
    });
    const offGood = obs.onMutations((r) => seen.push(r.length));
    document.body.append(document.createElement('div'));
    await delivered();
    expect(seen).toEqual([1]);
    offBad();
    offGood();
  });

  it('stops calling a handler once removed', async () => {
    const handler = vi.fn();
    const off = obs.onMutations(handler);
    off();
    document.body.append(document.createElement('div'));
    await delivered();
    expect(handler).not.toHaveBeenCalled();
  });
});
