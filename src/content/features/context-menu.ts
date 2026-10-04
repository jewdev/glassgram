import { downloadAvatar, downloadCurrent } from '../core/actions';
import { getHovered, type MediaEl } from '../core/hover';
import { contextFor } from '../core/resolve';
import { toast } from '../ui/toast';
import type { Feature } from './types';

let lastTarget: MediaEl | null = null;

/** Download whatever media was under the pointer when the context menu opened. */
export async function contextDownload() {
  const el = lastTarget?.isConnected ? lastTarget : getHovered()?.el;
  const ctx = el && contextFor(el);
  if (!ctx) {
    toast('No Instagram media found under the cursor', 'error');
    return;
  }
  if (ctx.kind === 'avatar') await downloadAvatar(ctx.username);
  else await downloadCurrent(ctx);
}

export const contextMenu: Feature = {
  id: 'context-menu',
  isEnabled: (s) => s['info.contextMenu'],
  start() {
    // Instagram covers images with transparent divs, so record the media under the pointer ourselves.
    const onCtx = (e: MouseEvent) => {
      const media = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((x): x is MediaEl => x instanceof HTMLImageElement || x instanceof HTMLVideoElement);
      lastTarget = media ?? null;
    };
    document.addEventListener('contextmenu', onCtx, true);
    return () => document.removeEventListener('contextmenu', onCtx, true);
  },
};
