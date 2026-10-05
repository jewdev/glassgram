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
    const rect = media.getBoundingClientRect();
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
