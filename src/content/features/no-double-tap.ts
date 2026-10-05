import { isOnTopLayer, isOwnUi } from '../core/selectors';
import type { Feature } from './types';

/** True when a photo or video sits under the pointer (Instagram covers media with transparent layers). */
function mediaUnderPointer(x: number, y: number): boolean {
  return document.elementsFromPoint(x, y).some((el) => {
    if (!(el instanceof HTMLImageElement || el instanceof HTMLVideoElement) || isOwnUi(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 100 && r.height >= 100 && isOnTopLayer(el);
  });
}

export const noDoubleTap: Feature = {
  id: 'no-double-tap',
  isEnabled: (s) => s['feed.noDoubleTapLike'],
  start() {
    // Instagram likes on React's onDoubleClick; a capture listener on document runs before React's root listener.
    const onDbl = (e: MouseEvent) => {
      if (isOwnUi(e.target as Element)) return;
      if (!mediaUnderPointer(e.clientX, e.clientY)) return;
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    document.addEventListener('dblclick', onDbl, true);
    return () => document.removeEventListener('dblclick', onDbl, true);
  },
};
