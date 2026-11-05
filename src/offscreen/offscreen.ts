import type { Message } from '../shared/messages';
import { buildMp3, buildZip, cancelJob } from './jobs';

/** For tests, which drive the jobs through this module. */
export { buildZip, cancelJob as cancelZip };

chrome.runtime.onMessage.addListener((msg: Message, _sender, reply) => {
  if (!('target' in msg) || msg.target !== 'offscreen') return false;
  if (msg.type === 'offscreen:zip') {
    buildZip(msg.jobs, msg.jobId)
      .then((r) => reply({ ok: true, ...r }))
      .catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg.type === 'offscreen:mp3') {
    buildMp3(msg.url, msg.jobId)
      .then((url) => reply({ ok: true, url }))
      .catch((e) => reply({ ok: false, error: String(e?.message ?? e) }));
    return true;
  }
  if (msg.type === 'offscreen:cancel') cancelJob(msg.jobId);
  if (msg.type === 'offscreen:revoke') URL.revokeObjectURL(msg.url);
  return false;
});
