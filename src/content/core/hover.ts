import { isOnTopLayer, isOwnUi } from './selectors';

export type MediaEl = HTMLImageElement | HTMLVideoElement;

export interface Hovered {
  el: MediaEl;
  rect: DOMRect;
}

type Sub = (h: Hovered | null) => void;

const MIN_SIZE = 100;
const subs = new Set<Sub>();
let current: Hovered | null = null;
let pointer: { x: number; y: number } | null = null;
let frame = 0;
let hideTimer: number | undefined;
let started = false;

function isMedia(e: Element): e is MediaEl {
  if (!(e instanceof HTMLImageElement || e instanceof HTMLVideoElement)) return false;
  if (isOwnUi(e)) return false;
  const r = e.getBoundingClientRect();
  return r.width >= MIN_SIZE && r.height >= MIN_SIZE && isOnTopLayer(e);
}

function emit(next: Hovered | null) {
  current = next;
  subs.forEach((s) => s(next));
}

function evaluate() {
  frame = 0;
  if (!pointer) return;
  const stack = document.elementsFromPoint(pointer.x, pointer.y);
  const media = stack.find(isMedia);
  const onOwnUi = stack.length > 0 && isOwnUi(stack[0]);

  if (media) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    const rect = visibleRect(media);
    if (media !== current?.el || !sameRect(rect, current.rect)) emit({ el: media, rect });
    return;
  }
  if (onOwnUi && current) {
    clearTimeout(hideTimer);
    hideTimer = undefined;
    return;
  }
  if (current && hideTimer === undefined) {
    hideTimer = window.setTimeout(() => {
      hideTimer = undefined;
      emit(null);
    }, 250);
  }
}

/**
 * The media's on-screen box, cut down to what its clipping ancestors actually show. Profile-grid
 * reels are taller than their tile and translated inside an `overflow: hidden` wrapper, so the raw
 * rect pokes out above/below the tile and anything anchored to it lands in the wrong place.
 */
function visibleRect(el: Element): DOMRect {
  let { left, top, right, bottom } = el.getBoundingClientRect();
  for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
    const cs = getComputedStyle(a);
    const clipX = cs.overflowX !== 'visible';
    const clipY = cs.overflowY !== 'visible';
    if (clipX || clipY) {
      const r = a.getBoundingClientRect();
      if (clipX) {
        left = Math.max(left, r.left);
        right = Math.min(right, r.right);
      }
      if (clipY) {
        top = Math.max(top, r.top);
        bottom = Math.min(bottom, r.bottom);
      }
    }
    if (cs.position === 'fixed') break;
  }
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top));
}

function sameRect(a: DOMRect, b: DOMRect) {
  return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

function queue() {
  if (!frame) frame = requestAnimationFrame(evaluate);
}

function start() {
  started = true;
  document.addEventListener('mousemove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    queue();
  }, { passive: true, capture: true });
  addEventListener('scroll', queue, { passive: true, capture: true });
  addEventListener('resize', queue, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    pointer = null;
    emit(null);
  });
}

export function onHover(sub: Sub): () => void {
  if (!started) start();
  subs.add(sub);
  return () => subs.delete(sub);
}

export function getHovered(): Hovered | null {
  if (current && !current.el.isConnected) current = null;
  return current;
}

/** Re-check what's under the pointer (e.g. after a carousel slide changes). */
export function refreshHover() {
  queue();
}
