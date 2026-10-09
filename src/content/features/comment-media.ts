import { send, type DownloadResult } from '../../shared/messages';
import { inRootFolder } from '../core/download';
import { renderFilename } from '../core/filename';
import { extFromUrl } from '../core/media';
import { onDomChange } from '../core/observer';
import { isCommentGif } from '../core/selectors';
import { toast } from '../ui/toast';
import { actionLineItem, makeCommentAction } from './copy-comment';
import type { Feature } from './types';

const MARK = 'data-ige-cm';
const BTN_CLASS = 'ige-save-comment-media';

/**
 * Smallest ancestor holding the whole comment: the commenter's avatar link and the
 * "likes · Reply" line. Stops before it swallows a neighbouring comment.
 */
function commentRow(media: Element): Element | null {
  let cur: Element = media;
  for (let i = 0; i < 10 && cur.parentElement; i++) {
    cur = cur.parentElement;
    const avatars = cur.querySelectorAll('a img').length;
    if (avatars > 1) return null;
    if (avatars === 1 && actionLineItem(cur)) return cur;
  }
  return null;
}

function commenter(row: Element): string {
  for (const a of row.querySelectorAll('a[href^="/"]')) {
    const name = a.getAttribute('href')!.split('/').filter(Boolean);
    if (name.length === 1) return name[0];
  }
  return 'unknown';
}

/** e.g. Glassgram/Comments/someone_gif_2026-10-06_14-03-12.gif — same root folder as the filename template. */
function mediaFilename(user: string, url: string): string {
  const now = Date.now() / 1000;
  const name = renderFilename('{user}_gif_{date}_{time}', { user, shortcode: '', index: 1, id: '', takenAt: now, type: 'gif' }, extFromUrl(url, 'gif'));
  return inRootFolder(`Comments/${name}`);
}

async function save(img: HTMLImageElement, row: Element) {
  const url = img.currentSrc || img.src;
  const res = await send<DownloadResult>({ type: 'download', jobs: [{ url, filename: mediaFilename(commenter(row), url) }] });
  toast(res?.ok ? 'Saving GIF' : 'Download failed', res?.ok ? 'success' : 'error');
}

function scan() {
  for (const img of document.querySelectorAll<HTMLImageElement>(`img:not([${MARK}])`)) {
    if (!isCommentGif(img)) continue;
    const row = commentRow(img);
    const template = row && actionLineItem(row);
    if (!row || !template) continue; // action line not rendered yet — retry on next scan
    img.setAttribute(MARK, '');
    template.insertAdjacentElement(
      'afterend',
      makeCommentAction(template, { text: 'Save GIF', label: 'Save GIF', className: BTN_CLASS, onActivate: () => save(img, row) }),
    );
  }
}

/** A "Save GIF" item under comments that are a GIF. */
export const commentMedia: Feature = {
  id: 'comment-media',
  isEnabled: (s) => s['info.commentMedia'],
  start() {
    const off = onDomChange(scan);
    return () => {
      off();
      document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove());
      document.querySelectorAll(`[${MARK}]`).forEach((m) => m.removeAttribute(MARK));
    };
  },
};
