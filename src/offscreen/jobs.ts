// ZIP and MP3 jobs. They need a DOM (blob URLs, audio decoding): Chrome runs them in the offscreen
// document, Firefox in its background page, which has one.

import { Zip, ZipPassThrough } from 'fflate';
import type { Message } from '../shared/messages';
import type { DownloadJob } from '../shared/types';

const PARALLEL = 4;

function basename(path: string) {
  return path.slice(path.lastIndexOf('/') + 1);
}

function uniqueName(name: string, used: Set<string>) {
  if (!used.has(name)) return name;
  const dot = name.lastIndexOf('.');
  for (let i = 2; ; i++) {
    const candidate = dot > 0 ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * Start a new ZIP once a part passes this size, so no single archive has to sit in memory whole. A
 * part's chunks are copied into a Blob when it ends, so it briefly takes about twice this.
 */
const PART_BYTES = 512 * 1024 ** 2;

/** Running jobs, so the background can stop one. */
const running = new Map<string, AbortController>();

/** One archive being written: fflate streams it out in chunks that become a Blob when it ends. */
function openPart() {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let error: Error | null = null;
  const zip = new Zip((err, data) => {
    if (err) error = err;
    else {
      chunks.push(data);
      size += data.length;
    }
  });
  return {
    zip,
    files: 0,
    get size() {
      return size;
    },
    finish(): string {
      zip.end();
      if (error) throw error;
      return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/zip' }));
    },
  };
}

/** Stops a running job: no new fetches, the ones in flight are aborted, and it rejects. */
export function cancelJob(jobId: string) {
  running.get(jobId)?.abort();
}

type Progress = (done: number, total: number) => void;

/** From the offscreen document: the background forwards it to the tab that asked. */
const messageProgress = (jobId: string): Progress => (done, total) =>
  chrome.runtime.sendMessage({ type: 'zipProgress', jobId, done, total } satisfies Message).catch(() => {});

/**
 * Tests pass a small `partBytes`. Firefox's background page passes `onProgress`: a page never gets
 * its own runtime messages.
 */
export async function buildZip(jobs: DownloadJob[], jobId: string, partBytes = PART_BYTES, onProgress: Progress = messageProgress(jobId)): Promise<{ urls: string[]; count: number }> {
  const used = new Set<string>();
  const urls: string[] = [];
  let part = openPart();
  let done = 0;
  let next = 0;
  let failed = 0;
  const abort = new AbortController();
  running.set(jobId, abort);

  // Each fetched file goes straight into the archive and its buffer is dropped, so memory stays
  // around one part plus the files in flight instead of every file twice.
  function add(name: string, data: Uint8Array) {
    const file = new ZipPassThrough(name); // media is already compressed — store without deflate
    part.zip.add(file);
    file.push(data, true);
    part.files++;
    if (part.size >= partBytes) {
      urls.push(part.finish());
      part = openPart();
    }
  }

  async function worker() {
    while (next < jobs.length && !abort.signal.aborted) {
      const job = jobs[next++];
      try {
        const res = await fetch(job.url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: abort.signal });
        if (!res.ok) throw new Error(String(res.status));
        const data = new Uint8Array(await res.arrayBuffer());
        const name = uniqueName(basename(job.filename), used);
        used.add(name);
        add(name, data);
      } catch (e) {
        failed++;
        if (!abort.signal.aborted) console.warn('[IGE] zip fetch failed', job.url, e);
      }
      done++;
      onProgress(done, jobs.length);
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
    if (abort.signal.aborted) throw new Error('Cancelled');
    if (part.files) urls.push(part.finish());
    if (!urls.length) throw new Error('Could not fetch any media');
  } catch (e) {
    urls.forEach((u) => URL.revokeObjectURL(u));
    throw e;
  } finally {
    running.delete(jobId);
  }
  return { urls, count: jobs.length - failed };
}

/** A video's sound as an MP3 blob URL. Rejects with 'Cancelled' once cancelJob(jobId) runs. */
export async function buildMp3(url: string, jobId: string): Promise<string> {
  const abort = new AbortController();
  running.set(jobId, abort);
  try {
    // Loaded on first use: ZIP-only sessions never parse the encoder.
    const { videoToMp3 } = await import('./mp3');
    return await videoToMp3(url, abort.signal);
  } catch (e) {
    throw abort.signal.aborted ? new Error('Cancelled') : e;
  } finally {
    running.delete(jobId);
  }
}
