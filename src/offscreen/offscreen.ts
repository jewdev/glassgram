import { zip, type Zippable } from 'fflate';
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

async function buildZip(jobs: DownloadJob[]): Promise<{ url: string; count: number }> {
  const files: Zippable = {};
  const used = new Set<string>();
  let done = 0;
  let next = 0;
  let failed = 0;

  async function worker() {
    while (next < jobs.length) {
      const job = jobs[next++];
      try {
        const res = await fetch(job.url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!res.ok) throw new Error(String(res.status));
        const name = uniqueName(basename(job.filename), used);
        used.add(name);
        // Media is already compressed — store without deflate for speed.
        files[name] = [new Uint8Array(await res.arrayBuffer()), { level: 0 }];
      } catch (e) {
        failed++;
        console.warn('[IGE] zip fetch failed', job.url, e);
      }
      done++;
      chrome.runtime.sendMessage({ type: 'zipProgress', done, total: jobs.length } satisfies Message).catch(() => {});
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, jobs.length) }, worker));
  if (!Object.keys(files).length) throw new Error('Could not fetch any media');

  const data = await new Promise<Uint8Array>((resolve, reject) => zip(files, (err, out) => (err ? reject(err) : resolve(out))));
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: 'application/zip' }));
  return { url, count: jobs.length - failed };
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, reply) => {
  if (!('target' in msg) || msg.target !== 'offscreen') return false;
  if (msg.type === 'offscreen:zip') {
    buildZip(msg.jobs)
      .then((r) => reply({ ok: true, ...r }))
      .catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg.type === 'offscreen:revoke') URL.revokeObjectURL(msg.url);
  return false;
});
