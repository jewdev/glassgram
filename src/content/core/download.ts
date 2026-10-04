import { send, type DownloadResult } from '../../shared/messages';
import type { DownloadJob, ResolvedPost } from '../../shared/types';
import { toast } from '../ui/toast';
import { filenameFor, renderFilename, sanitizeSegment } from './filename';
import { getSettings } from './state';

export function jobsForPost(post: ResolvedPost, indices?: number[]): DownloadJob[] {
  const tpl = getSettings()['download.filename'];
  return (indices ?? post.items.map((_, i) => i))
    .filter((i) => post.items[i])
    .map((i) => ({ url: post.items[i].url, filename: filenameFor(tpl, post, post.items[i], i) }));
}

/** Zip path = folder of the first file + `<name>.zip`. */
export function zipNameFor(jobs: DownloadJob[], name: string): string {
  const first = jobs[0]?.filename ?? '';
  const dir = first.includes('/') ? first.slice(0, first.lastIndexOf('/') + 1) : '';
  return `${dir}${sanitizeSegment(name)}.zip`;
}

export async function dispatch(jobs: DownloadJob[], zipBaseName: string): Promise<boolean> {
  if (!jobs.length) {
    toast('Nothing to download', 'error');
    return false;
  }
  const s = getSettings();
  const zip = jobs.length > 1 && s['download.mode'] === 'zip';
  const t = toast(zip ? `Zipping ${jobs.length} files…` : `Downloading ${jobs.length} file${jobs.length > 1 ? 's' : ''}…`, 'info', zip ? 0 : 2500);
  try {
    const res = await send<DownloadResult>(
      zip ? { type: 'zip', jobs, zipName: zipNameFor(jobs, zipBaseName) } : { type: 'download', jobs, saveAs: jobs.length === 1 && s['download.saveAs'] },
    );
    if (!res?.ok) throw new Error(res?.error ?? 'Download failed');
    if (zip) {
      t.close();
      toast(`Saved ZIP with ${res.count} files`, 'success');
    }
    return true;
  } catch (e) {
    t.close();
    toast(`Download failed: ${(e as Error).message}`, 'error', 5000);
    return false;
  }
}

export function downloadPost(post: ResolvedPost, indices?: number[]) {
  const jobs = jobsForPost(post, indices);
  return dispatch(jobs, `${post.username}_${post.shortcode || post.id}`);
}

export function profilePicFilename(username: string, userId: string, ext: string): string {
  return renderFilename(
    getSettings()['download.filename'],
    { user: username, shortcode: 'profile_picture', index: 1, id: userId, takenAt: Date.now() / 1000, type: 'image' },
    ext,
  );
}
