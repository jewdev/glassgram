import { send, type DownloadResult } from '../../shared/messages';
import type { DownloadJob, ResolvedPost } from '../../shared/types';
import { ApiError, getProfileSummary, getSavedPage, getUserFeedPage, jitter } from '../core/api';
import { jobsForPost, zipNameFor } from '../core/download';
import { postsCsv, saveCsv } from '../core/post-csv';
import { getSettings } from '../core/state';
import { h } from '../ui/dom';
import { openModal } from '../ui/modal';
import { toast } from '../ui/toast';

const CHUNK = 25;

type Page = { posts: ResolvedPost[]; next?: string };

/** What to download: a profile's posts or your saved posts. */
interface Source {
  title: string;
  /** Base name of the ZIP and CSV files. */
  fileName: string;
  /** Label of the "how many" field. */
  countLabel: string;
  /** "123 posts" line, loaded when the dialog opens. */
  summary: () => Promise<{ total?: number; text: string }>;
  page: (cursor?: string) => Promise<Page>;
  /** Wait between page requests, in seconds. */
  delay: () => { min: number; max: number };
}

function checkbox(label: string, checked: boolean) {
  const input = h('input', { type: 'checkbox', checked });
  return { input, el: h('label', { class: 'ige-check' }, input, h('span', {}, label)) };
}

export function openBulkDownload(username: string) {
  return openBulk({
    title: `Download posts · @${username}`,
    fileName: `${username}_posts`,
    countLabel: 'Latest posts to download',
    summary: async () => {
      // Post count is nice-to-have; pagination only needs the username.
      let profile: { mediaCount?: number; isPrivate?: boolean } = {};
      try {
        profile = await getProfileSummary(username);
      } catch (e) {
        console.debug('[IGE] profile summary unavailable', e);
      }
      const total = profile.mediaCount;
      return { total, text: `${total ? total.toLocaleString() : 'Unknown number of'} posts${profile.isPrivate ? ' · private account (you must follow it)' : ''}` };
    },
    page: (cursor) => getUserFeedPage(username, cursor),
    delay: () => ({ min: getSettings()['bulk.delayMin'], max: getSettings()['bulk.delayMax'] }),
  });
}

/** Your saved posts: `collection` is 'all' or a collection's id. */
export function openSavedDownload(collection: string) {
  const all = collection === 'all';
  return openBulk({
    title: all ? 'Download saved posts' : 'Download this collection',
    fileName: all ? 'saved_posts' : `saved_${collection}`,
    countLabel: 'Latest saved posts to download',
    summary: async () => ({ text: all ? 'All posts you saved, newest first.' : 'The posts in this collection, newest first.' }),
    page: (cursor) => getSavedPage(collection, cursor),
    delay: () => ({ min: getSettings()['saved.delayMin'], max: getSettings()['saved.delayMax'] }),
  });
}

async function openBulk(src: Source) {
  const m = openModal(src.title, {
    width: 460,
    onClose: () => {
      cancelled = true;
      // The ZIP is built in the background; stop it there too.
      if (zipping) send({ type: 'cancelZip' }).catch(() => {});
    },
  });
  let cancelled = false;
  let zipping = false;
  m.body.append(h('p', { class: 'ige-muted' }, 'Loading…'));

  const { total = 0, text } = await src.summary();
  const s = getSettings();
  const delay = src.delay();

  const photos = checkbox('Photos', true);
  const videos = checkbox('Videos & reels', true);
  const carousel = checkbox('All items of carousels (not just the cover)', true);
  const limit = h('input', { class: 'ige-input', type: 'number', min: '1', max: total ? String(total) : '100000', value: String(total || 100), 'aria-label': src.countLabel });
  const mode = h(
    'select',
    { class: 'ige-input', 'aria-label': 'Save as' },
    h('option', { value: 'zip', selected: s['download.mode'] === 'zip' }, 'One ZIP file'),
    h('option', { value: 'folder', selected: s['download.mode'] === 'folder' }, 'Separate files'),
    h('option', { value: 'csv' }, 'List only (CSV, no media)'),
  );
  const filters = [photos.el, videos.el, carousel.el];
  // A list has no files to filter.
  const syncMode = () => filters.forEach((el) => (el.style.display = mode.value === 'csv' ? 'none' : ''));
  mode.addEventListener('change', syncMode);
  const progress = h('div', { class: 'ige-progress', hidden: true }, h('div', { class: 'ige-progress__fill' }));
  const status = h('p', { class: 'ige-muted', 'aria-live': 'polite' });

  m.body.replaceChildren(
    h('p', {}, text),
    h('div', { class: 'ige-form' },
      ...filters,
      h('label', { class: 'ige-field' }, h('span', {}, src.countLabel), limit),
      h('label', { class: 'ige-field' }, h('span', {}, 'Save as'), mode),
    ),
    h('p', { class: 'ige-warn' }, `Requests are spaced ${delay.min}–${delay.max}s apart to avoid rate limits. Long lists take a while.`),
    progress,
    status,
  );
  syncMode();

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
        const page = await src.page(next);
        posts.push(...page.posts);
        next = page.next;
        setProgress(Math.min(posts.length, max), max, `Found ${Math.min(posts.length, max)} / ${max} posts…`);
        if (next && posts.length < max) await jitter(delay.min, delay.max);
      } while (next && posts.length < max);
      if (cancelled) return;
      const picked = posts.slice(0, max);

      if (mode.value === 'csv') {
        saveCsv(`${src.fileName}_${new Date().toISOString().slice(0, 10)}.csv`, postsCsv(picked));
        setProgress(1, 1, `Done — list of ${picked.length} posts saved.`);
        toast('List saved', 'success');
        return;
      }

      // 2) Build download jobs with filters.
      const jobs: DownloadJob[] = [];
      for (const post of picked) {
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

      // 3) Hand off to the background worker.
      if (mode.value === 'zip') {
        setProgress(0, jobs.length, `Downloading & zipping ${jobs.length} files… keep this tab open.`);
        const onMsg = (msg: { type?: string; done?: number; total?: number }) => {
          if (msg?.type === 'zipProgress') setProgress(msg.done!, msg.total!, `Zipping ${msg.done} / ${msg.total} files…`);
        };
        chrome.runtime.onMessage.addListener(onMsg);
        zipping = true;
        try {
          const res = await send<DownloadResult>({ type: 'zip', jobs, zipName: zipNameFor(jobs, src.fileName) });
          if (cancelled) return;
          if (!res?.ok) throw new Error(res?.error);
          setProgress(1, 1, `Done — ZIP with ${res.count} files saved.`);
        } finally {
          zipping = false;
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
