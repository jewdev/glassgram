import { copyMediaUrl, downloadAll, downloadCurrent, zoomAvatar } from '../core/actions';
import { getHovered, type MediaEl } from '../core/hover';
import { contextFor, type MediaContext } from '../core/resolve';
import { currentRoute } from '../core/router';
import { getSettings } from '../core/state';
import { toast } from '../ui/toast';
import { comboFromEvent } from '../../shared/keys';
import type { Feature } from './types';

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || !!t.closest('[contenteditable="true"], [role="textbox"]'));
}

/** Media under the mouse, otherwise the largest visible media in the viewport. */
function currentContext(): MediaContext | null {
  const hovered = getHovered();
  if (hovered) return contextFor(hovered.el);
  let best: MediaEl | null = null;
  let bestArea = 0;
  for (const el of document.querySelectorAll<MediaEl>('article img, article video, main img, main video, section img, section video, div[role="dialog"] img, div[role="dialog"] video')) {
    if (el.closest('.ige-root')) continue;
    const r = el.getBoundingClientRect();
    const w = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
    const h = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
    if (w < 150 || h < 150) continue;
    if (w * h > bestArea) {
      bestArea = w * h;
      best = el;
    }
  }
  return best ? contextFor(best) : null;
}

export const shortcuts: Feature = {
  id: 'shortcuts',
  isEnabled: (s) => s['shortcuts.enabled'],
  start() {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTyping(e)) return;
      const s = getSettings();
      const combo = comboFromEvent(e);
      const map: [string, () => void][] = [
        [s['shortcuts.zoom'], () => {
          const r = currentRoute();
          if (r.kind === 'profile' && r.username) zoomAvatar(r.username);
          else toast('Open a profile to zoom its picture');
        }],
        [s['shortcuts.download'], () => run((c) => (c.kind === 'avatar' ? zoomAvatar(c.username) : downloadCurrent(c)))],
        [s['shortcuts.downloadAll'], () => run((c) => c.kind !== 'avatar' && downloadAll(c))],
        [s['shortcuts.copyUrl'], () => run((c) => c.kind !== 'avatar' && copyMediaUrl(c))],
      ];
      const hit = map.find(([k]) => k && k.toLowerCase() === combo);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      hit[1]();
    };
    const run = (fn: (c: MediaContext) => unknown) => {
      const ctx = currentContext();
      if (!ctx) toast('No media found — hover a post or story', 'error');
      else fn(ctx);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  },
};
