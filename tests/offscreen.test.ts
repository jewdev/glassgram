import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeChrome } from './helpers/fake-chrome';

const SIZE = 100_000;
const blobs = new Map<string, Blob>();

beforeEach(() => {
  vi.stubGlobal('chrome', fakeChrome());
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const n = Number(/(\d+)\.bin$/.exec(url)?.[1]);
      return n === 99 ? new Response('gone', { status: 404 }) : new Response(new Uint8Array(SIZE).fill(n));
    }),
  );
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  blobs.clear();
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b) => {
    const url = `blob:test/${blobs.size}`;
    blobs.set(url, b as Blob);
    return url;
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function read(url: string) {
  return unzipSync(new Uint8Array(await blobs.get(url)!.arrayBuffer()));
}

const jobsFor = (ns: number[], name = (n: number) => `G/${n}.bin`) => ns.map((n) => ({ url: `https://cdn/${n}.bin`, filename: name(n) }));

describe('buildZip', () => {
  it('writes one valid archive with every file, renaming duplicates', async () => {
    const { buildZip } = await import('../src/offscreen/offscreen');
    const { urls, count } = await buildZip(jobsFor([1, 2, 3], () => 'G/u/f.bin'), 'j');
    expect(count).toBe(3);
    expect(urls).toHaveLength(1);
    const files = await read(urls[0]);
    expect(Object.keys(files).sort()).toEqual(['f (2).bin', 'f (3).bin', 'f.bin']);
    expect(new Set(Object.values(files).map((f) => f[0]))).toEqual(new Set([1, 2, 3])); // contents intact
    expect(Object.values(files).every((f) => f.length === SIZE)).toBe(true);
  });

  it('splits into several valid archives once a part passes the size limit', async () => {
    const { buildZip } = await import('../src/offscreen/offscreen');
    const ns = [1, 2, 3, 4, 5, 6, 7];
    const { urls, count } = await buildZip(jobsFor(ns), 'j', 250_000);
    expect(count).toBe(7);
    expect(urls.length).toBeGreaterThan(1);
    const names = (await Promise.all(urls.map(read))).flatMap((f) => Object.keys(f));
    expect(names.sort()).toEqual(ns.map((n) => `${n}.bin`)); // each file in exactly one part
  });

  it('skips files that fail, counts them out, and tags progress with the job id', async () => {
    const { buildZip } = await import('../src/offscreen/offscreen');
    const { urls, count } = await buildZip(jobsFor([1, 99]), 'job-7');
    expect(count).toBe(1);
    expect(Object.keys(await read(urls[0]))).toEqual(['1.bin']);
    const sent = vi.mocked(chrome.runtime.sendMessage).mock.calls.map(([m]) => m);
    expect(sent.at(-1)).toEqual({ type: 'zipProgress', jobId: 'job-7', done: 2, total: 2 });
  });

  it('fails when nothing could be fetched', async () => {
    const { buildZip } = await import('../src/offscreen/offscreen');
    await expect(buildZip(jobsFor([99]), 'j')).rejects.toThrow('Could not fetch any media');
  });
});
