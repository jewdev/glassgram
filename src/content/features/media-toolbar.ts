import { copyAvatarUrl, copyCaption, copyMediaUrl, downloadAll, downloadAudio, downloadAvatar, downloadCurrent, hasMultiple, showStoryDetails, zoomAvatar, zoomMedia } from '../core/actions';
import { extrasCount } from '../core/story-extras';
import { onHover, type Hovered } from '../core/hover';
import { contextFor, resolveTarget, type MediaContext } from '../core/resolve';
import { getSettings } from '../core/state';
import { h, icon, iconButton, ICONS, uiLayer } from '../ui/dom';
import type { Feature } from './types';

/** Space taken by a story's progress bars and header row, so the toolbar clears them. */
const STORY_HEADER_OFFSET = 64;

interface Buttons {
  btns: HTMLElement[];
  /** "Download all" button, revealed once we know the target has several items. */
  all?: HTMLElement;
  /** Story "mentions & stickers" button, revealed when the story has any. */
  details?: HTMLElement;
}

type OpenPicker = (anchor: HTMLButtonElement, ctx: MediaContext) => void;

function buttonsFor(ctx: MediaContext, openPicker: OpenPicker): Buttons | null {
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
  const details = isStory && s['stories.mentions'] ? iconButton('at', 'Mentions & stickers', () => showStoryDetails(ctx), 'is-hidden ige-btn--late ige-btn--count') : undefined;
  if (isStory && !s['stories.download']) return details ? { btns: [details], details } : null;
  if (ctx.kind === 'post' && !s['download.enabled']) return null;

  // Videos: the download button asks what to save, the video or just its sound.
  const pick = ctx.el instanceof HTMLVideoElement && s['download.audio'];
  const dl: HTMLButtonElement = iconButton('download', pick ? 'Download…' : isStory ? 'Download this story' : 'Download this media', () =>
    pick ? openPicker(dl, ctx) : downloadCurrent(ctx),
  );
  if (pick) {
    dl.setAttribute('aria-haspopup', 'menu');
    dl.setAttribute('aria-expanded', 'false');
  }
  const btns: HTMLElement[] = [dl];
  let all: HTMLElement | undefined;
  if (isStory || s['download.showAll']) {
    all = iconButton('downloadAll', isStory ? 'Download all stories in this tray' : 'Download all items', () => downloadAll(ctx), 'is-hidden ige-btn--late');
    // Leftmost: the bar is right-anchored, so revealing it later grows leftward and the other buttons stay put.
    btns.unshift(all);
  }
  if (isStory || s['download.copyUrl']) btns.push(iconButton('link', 'Copy media URL', () => copyMediaUrl(ctx)));
  if (!isStory && s['download.copyCaption']) btns.push(iconButton('caption', 'Copy caption', () => copyCaption(ctx)));
  if (ctx.el instanceof HTMLImageElement && (isStory || s['download.zoom'])) btns.push(iconButton('zoom', 'View full size', () => zoomMedia(ctx)));
  if (details) btns.unshift(details);
  return { btns, all, details };
}

export const mediaToolbar: Feature = {
  id: 'media-toolbar',
  isEnabled: (s) => s['download.enabled'] || s['stories.download'] || s['profile.hdPic'],
  start() {
    const bar = h('div', { class: 'ige-toolbar', role: 'toolbar', 'aria-label': 'Glassgram' });
    // Beside the bar, not in it: the bar's backdrop blur would keep a nested menu from blurring the page.
    const menu = h('div', { class: 'ige-dlmenu', role: 'menu', 'aria-label': 'Download' });
    uiLayer().append(bar, menu);
    let boundEl: Element | null = null;
    let dwell: number | undefined;
    let anchor: HTMLButtonElement | null = null;

    const placeMenu = () => {
      if (!anchor) return;
      const r = anchor.getBoundingClientRect();
      menu.style.top = `${r.bottom + 6}px`;
      menu.style.right = `${Math.max(8, innerWidth - r.right)}px`;
    };
    const closeMenu = () => {
      anchor?.setAttribute('aria-expanded', 'false');
      anchor = null;
      menu.classList.remove('is-open');
    };
    const item = (name: 'download' | 'music', label: string, run: () => void) =>
      h('button', {
        class: 'ige-menuitem',
        type: 'button',
        role: 'menuitem',
        html: `${icon(ICONS[name], 16)}<span>${label}</span>`,
        onClick: (e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          closeMenu();
          run();
        },
      });
    const openPicker: OpenPicker = (btn, ctx) => {
      if (anchor === btn) return closeMenu();
      closeMenu();
      menu.replaceChildren(item('download', 'Video', () => downloadCurrent(ctx)), item('music', 'Sound only (MP3)', () => downloadAudio(ctx)));
      anchor = btn;
      btn.setAttribute('aria-expanded', 'true');
      placeMenu();
      menu.classList.add('is-open');
      (menu.firstElementChild as HTMLElement | null)?.focus({ preventScroll: true });
    };
    // Clicks inside our shadow root reach the document retargeted to its host, so stop them on the menu
    // and let any other click close it.
    menu.addEventListener('click', (e) => e.stopPropagation());
    const onDocClick = () => anchor && closeMenu();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && anchor && closeMenu();
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onKey, true);

    let isStory = false;

    const place = (rect: DOMRect) => {
      // Stories: the top-right header row holds Instagram's pause/mute/menu, so sit just below it, still right-aligned.
      const top = Math.max(8, rect.top + (isStory ? STORY_HEADER_OFFSET : 8));
      const right = Math.max(8, innerWidth - rect.right + 8);
      bar.style.top = `${top}px`;
      bar.style.right = `${right}px`;
      bar.classList.toggle('is-visible', rect.bottom - top > 40);
    };

    const off = onHover((hv: Hovered | null) => {
      if (!hv) {
        bar.classList.remove('is-visible');
        closeMenu();
        boundEl = null;
        clearTimeout(dwell);
        return;
      }
      if (hv.el !== boundEl) {
        boundEl = hv.el;
        clearTimeout(dwell);
        closeMenu();
        const ctx = contextFor(hv.el);
        isStory = ctx?.kind === 'story';
        const b = ctx && buttonsFor(ctx, openPicker);
        bar.replaceChildren(...(b?.btns ?? []));
        if (!ctx || !b?.btns.length) {
          bar.classList.remove('is-visible');
          return;
        }
        // After a short dwell, reveal "Download all" / story details if useful. Only from what Instagram
        // already loaded: hovering must not send requests Instagram's own client wouldn't.
        if (ctx.kind !== 'avatar') {
          dwell = window.setTimeout(() => {
            if (b.all) hasMultiple(ctx, true).then((multi) => multi && b.all!.classList.remove('is-hidden'));
            const target = resolveTarget(ctx, true);
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
      if (bar.childElementCount) {
        place(hv.rect);
        placeMenu();
      }
    });

    return () => {
      off();
      clearTimeout(dwell);
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onKey, true);
      bar.remove();
      menu.remove();
    };
  },
};
