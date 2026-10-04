import { send, type DownloadResult } from '../../shared/messages';
import type { DownloadJob, ResolvedPost } from '../../shared/types';
import { ApiError, getProfileSummary, getUserFeedPage, jitter } from '../core/api';
import { jobsForPost, zipNameFor } from '../core/download';
import { getSettings } from '../core/state';
import { h } from '../ui/dom';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';

const CHUNK = 25;

function checkbox(label: string, checked: boolean) {
  const input = h('input', { type: 'checkbox', checked });
  return { input, el: h('label', { class: 'ige-check' }, input, h('span', {}, label)) };
}

export async function openBulkDownload(username: string) {
  const m = openModal(`Download posts · @${username}`, { width: 460, onClose: () => (cancelled = true) });
  let cancelled = false;
  m.body.append(h('p', { class: 'ige-muted' }, 'Loading profile…'));

  // Post count is nice-to-have; pagination only needs the username.
  let profile: { mediaCount?: number; isPrivate?: boolean } = {};
  try {
    profile = await getProfileSummary(username);
  } catch (e) {
    console.debug('[IGE] profile summary unavailable', e);
  }
  const total = profile.mediaCount ?? 0;
  const s = getSettings();

  const photos = checkbox('Photos', true);
  const videos = checkbox('Videos & reels', true);
  const carousel = checkbox('All items of carousels (not just the cover)', true);
  const limit = h('input', { class: 'ige-input', type: 'number', min: '1', max: total ? String(total) : '100000', value: String(total || 100), 'aria-label': 'Number of latest posts' });
  const mode = h(
    'select',
    { class: 'ige-input', 'aria-label': 'Save as' },
    h('option', { value: 'folder', selected: s['download.mode'] === 'folder' }, 'Separate files'),
    h('option', { value: 'zip', selected: s['download.mode'] === 'zip' }, 'One ZIP file'),
  );
  const progress = h('div', { class: 'ige-progress', hidden: true }, h('div', { class: 'ige-progress__fill' }));
  const status = h('p', { class: 'ige-muted', 'aria-live': 'polite' });

  m.body.replaceChildren(
    h('p', {}, `${total ? total.toLocaleString() : 'Unknown number of'} posts${profile.isPrivate ? ' · private account (you must follow it)' : ''}`),
    h('div', { class: 'ige-form' },
      photos.el,
      videos.el,
      carousel.el,
      h('label', { class: 'ige-field' }, h('span', {}, 'Latest posts to download'), limit),
      h('label', { class: 'ige-field' }, h('span', {}, 'Save as'), mode),
    ),
    h('p', { class: 'ige-warn' }, `Requests are spaced ${s['bulk.delayMin']}–${s['bulk.delayMax']}s apart to avoid rate limits. Large profiles take a while.`),
    progress,
    status,
  );

  const startBtn = h('button', { class: 'ige-btn ige-btn--primary', type: 'button' }, 'Start');
  const cancelBtn = h('button', { class: 'ige-btn ige-btn--ghost', type: 'button', onClick: () => m.close() }, 'Close');
  m.footer.append(cancelBtn, startBtn);

  const setProgress = (done: number, of: number, text: string) => {
    progress.hidden = false;
    (progress.firstElementChild as HTMLElement).style.transform = `scaleX(${of ? Math.min(1, done / of) : 0})`;
    status.textContent = text;
  };

  startBtn.addEventListener('click', async () => {
    startBtn.disabled = true;
    m.body.querySelectorAll('input, select').forEach((el) => ((el as HTMLInputElement).disabled = true));
    cancelBtn.textContent = 'Cancel';
    const max = Math.max(1, Number(limit.value) || total);
    const posts: ResolvedPost[] = [];
    let next: string | undefined;

    try {
      // 1) Collect posts page by page.
      do {
        if (cancelled) return;
        const page = await getUserFeedPage(username, next);
        posts.push(...page.posts);
        next = page.next;
        setProgress(Math.min(posts.length, max), max, `Found ${Math.min(posts.length, max)} / ${max} posts…`);
        if (next && posts.length < max) await jitter(s['bulk.delayMin'], s['bulk.delayMax']);
      } while (next && posts.length < max);

      // 2) Build download jobs with filters.
      const jobs: DownloadJob[] = [];
      for (const post of posts.slice(0, max)) {
        const indices = (carousel.input.checked ? post.items.map((_, i) => i) : [0]).filter((i) => {
          const t = post.items[i]?.type;
          return (t === 'image' && photos.input.checked) || (t === 'video' && videos.input.checked);
        });
        jobs.push(...jobsForPost(post, indices));
      }
      if (!jobs.length) {
        status.textContent = 'No files match the selected filters.';
        return;
      }
      if (cancelled) return;

      // 3) Hand off to the background worker.
      if (mode.value === 'zip') {
        setProgress(0, jobs.length, `Downloading & zipping ${jobs.length} files… keep this tab open.`);
        const onMsg = (msg: { type?: string; done?: number; total?: number }) => {
          if (msg?.type === 'zipProgress') setProgress(msg.done!, msg.total!, `Zipping ${msg.done} / ${msg.total} files…`);
        };
        chrome.runtime.onMessage.addListener(onMsg);
        try {
          const res = await send<DownloadResult>({ type: 'zip', jobs, zipName: zipNameFor(jobs, `${username}_posts`) });
          if (!res?.ok) throw new Error(res?.error);
          setProgress(1, 1, `Done — ZIP with ${res.count} files saved.`);
        } finally {
          chrome.runtime.onMessage.removeListener(onMsg);
        }
      } else {
        for (let i = 0; i < jobs.length; i += CHUNK) {
          if (cancelled) return;
          const res = await send<DownloadResult>({ type: 'download', jobs: jobs.slice(i, i + CHUNK) });
          if (!res?.ok) throw new Error(res?.error);
          setProgress(Math.min(i + CHUNK, jobs.length), jobs.length, `Queued ${Math.min(i + CHUNK, jobs.length)} / ${jobs.length} files…`);
        }
        setProgress(1, 1, `Done — ${jobs.length} files queued. Check your Downloads.`);
      }
      toast('Bulk download finished', 'success');
    } catch (e) {
      const msg = e instanceof ApiError && e.rateLimited ? `${e.message} Collected ${posts.length} posts before stopping.` : (e as Error).message;
      status.textContent = msg;
      status.className = 'ige-error';
    } finally {
      cancelBtn.textContent = 'Close';
    }
  });
}
