import { copyAvatarUrl, copyCaption, copyMediaUrl, downloadAll, downloadAvatar, downloadCurrent, hasMultiple, showStoryDetails, zoomAvatar } from '../core/actions';
import { extrasCount } from '../core/story-extras';
import { onHover, type Hovered } from '../core/hover';
import { contextFor, resolveTarget, type MediaContext } from '../core/resolve';
import { getSettings } from '../core/state';
import { h, iconButton, uiLayer } from '../ui/dom';
import type { Feature } from './types';

interface Buttons {
  btns: HTMLElement[];
  /** "Download all" button, revealed once we know the target has several items. */
  all?: HTMLElement;
  /** Story "mentions & stickers" button, revealed when the story has any. */
  details?: HTMLElement;
}

function buttonsFor(ctx: MediaContext): Buttons | null {
  const s = getSettings();
  if (ctx.kind === 'avatar') {
    if (!s['profile.hdPic']) return null;
    return {
      btns: [
        iconButton('zoom', 'View HD profile picture', () => zoomAvatar(ctx.username)),
        iconButton('download', 'Download HD profile picture', () => downloadAvatar(ctx.username)),
        iconButton('link', 'Copy HD image URL', () => copyAvatarUrl(ctx.username)),
      ],
    };
  }
  const isStory = ctx.kind === 'story';
  const details = isStory && s['stories.mentions'] ? iconButton('at', 'Mentions & stickers', () => showStoryDetails(ctx), 'is-hidden ige-btn--count') : undefined;
  if (isStory && !s['stories.download']) return details ? { btns: [details], details } : null;
  if (ctx.kind === 'post' && !s['download.enabled']) return null;

  const btns: HTMLElement[] = [iconButton('download', isStory ? 'Download this story' : 'Download this media', () => downloadCurrent(ctx))];
  let all: HTMLElement | undefined;
  if (isStory || s['download.showAll']) {
    all = iconButton('downloadAll', isStory ? 'Download all stories in this tray' : 'Download all items', () => downloadAll(ctx), 'is-hidden');
    btns.push(all);
  }
  if (isStory || s['download.copyUrl']) btns.push(iconButton('link', 'Copy media URL', () => copyMediaUrl(ctx)));
  if (!isStory && s['download.copyCaption']) btns.push(iconButton('caption', 'Copy caption', () => copyCaption(ctx)));
  if (details) btns.unshift(details);
  return { btns, all, details };
}

export const mediaToolbar: Feature = {
  id: 'media-toolbar',
  isEnabled: (s) => s['download.enabled'] || s['stories.download'] || s['profile.hdPic'],
  start() {
    const bar = h('div', { class: 'ige-toolbar', role: 'toolbar', 'aria-label': 'Instagram Enhanced' });
    uiLayer().append(bar);
    let boundEl: Element | null = null;
    let dwell: number | undefined;

    const place = (rect: DOMRect) => {
      const top = Math.max(8, rect.top + 8);
      const right = Math.max(8, innerWidth - rect.right + 8);
      bar.style.top = `${top}px`;
      bar.style.right = `${right}px`;
      bar.classList.toggle('is-visible', rect.bottom - top > 40);
    };

    const off = onHover((hv: Hovered | null) => {
      if (!hv) {
        bar.classList.remove('is-visible');
        boundEl = null;
        clearTimeout(dwell);
        return;
      }
      if (hv.el !== boundEl) {
        boundEl = hv.el;
        clearTimeout(dwell);
        const ctx = contextFor(hv.el);
        const b = ctx && buttonsFor(ctx);
        bar.replaceChildren(...(b?.btns ?? []));
        if (!ctx || !b?.btns.length) {
          bar.classList.remove('is-visible');
          return;
        }
        // After a short dwell, warm the API cache (clicks feel instant) and reveal "Download all" if useful.
        if (ctx.kind !== 'avatar') {
          dwell = window.setTimeout(() => {
            if (b.all) hasMultiple(ctx).then((multi) => multi && b.all!.classList.remove('is-hidden'));
            const target = resolveTarget(ctx);
            target.catch(() => {});
            const details = b.details;
            if (details) {
              target.then(({ post }) => {
                if (!extrasCount(post.extras) || !details.isConnected) return;
                const mentions = post.extras!.mentions.length;
                details.dataset.count = mentions ? String(mentions) : '';
                details.title = mentions ? `${mentions} mention${mentions > 1 ? 's' : ''} & stickers` : 'Stickers & tags';
                details.classList.remove('is-hidden');
              });
            }
          }, 350);
        }
      }
      if (bar.childElementCount) place(hv.rect);
    });

    return () => {
      off();
      clearTimeout(dwell);
      bar.remove();
    };
  },
};
