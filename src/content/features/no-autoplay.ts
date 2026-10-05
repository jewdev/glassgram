import { currentRoute } from '../core/router';
import { isOwnUi } from '../core/selectors';
import type { Feature } from './types';

const INTENT_MS = 1500;

/** Videos the user started themselves; Instagram may pause/resume them on scroll afterwards. */
const userStarted = new WeakSet<HTMLVideoElement>();

export const noAutoplay: Feature = {
  id: 'no-autoplay',
  isEnabled: (s) => s['video.noAutoplay'],
  start() {
    let intent: { x: number; y: number; t: number; ownUi: boolean } | null = null;

    const onPointer = (e: PointerEvent) => {
      intent = { x: e.clientX, y: e.clientY, t: Date.now(), ownUi: isOwnUi(e.target as Element) };
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'k' || e.key === 'Enter') intent = { x: -1, y: -1, t: Date.now(), ownUi: true };
    };

    const userIntended = (v: HTMLVideoElement) => {
      if (!intent || Date.now() - intent.t > INTENT_MS) return false;
      if (intent.ownUi) return true;
      const r = v.getBoundingClientRect();
      return intent.x >= r.left && intent.x <= r.right && intent.y >= r.top && intent.y <= r.bottom;
    };

    const onPlay = (e: Event) => {
      const v = e.target;
      if (!(v instanceof HTMLVideoElement) || isOwnUi(v)) return;
      const kind = currentRoute().kind;
      if (kind === 'stories' || kind === 'highlight') return; // stories can't work without playback
      if (userStarted.has(v)) return;
      if (userIntended(v)) {
        userStarted.add(v);
        return;
      }
      v.pause();
    };

    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('play', onPlay, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('play', onPlay, true);
    };
  },
};
