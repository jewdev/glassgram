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

/** Stops a running job: no new fetches, the ones in flight are aborted, and buildZip rejects. */
export function cancelZip(jobId: string) {
  running.get(jobId)?.abort();
}

/** Exported for tests, which pass a small `partBytes`. */
export async function buildZip(jobs: DownloadJob[], jobId: string, partBytes = PART_BYTES): Promise<{ urls: string[]; count: number }> {
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
      chrome.runtime.sendMessage({ type: 'zipProgress', jobId, done, total: jobs.length } satisfies Message).catch(() => {});
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

chrome.runtime.onMessage.addListener((msg: Message, _sender, reply) => {
  if (!('target' in msg) || msg.target !== 'offscreen') return false;
  if (msg.type === 'offscreen:zip') {
    buildZip(msg.jobs, msg.jobId)
      .then((r) => reply({ ok: true, ...r }))
      .catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg.type === 'offscreen:cancel') cancelZip(msg.jobId);
  if (msg.type === 'offscreen:revoke') URL.revokeObjectURL(msg.url);
  return false;
});
