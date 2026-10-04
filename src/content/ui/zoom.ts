import { h, iconButton, uiLayer } from './dom';

export interface ZoomOptions {
  src: string;
  caption?: string;
  onDownload?: () => void;
  onCopy?: () => void;
}

/** Full-screen image viewer: wheel to zoom, drag to pan, double-click to reset, Esc to close. */
export function openZoom(opts: ZoomOptions) {
  let scale = 1;
  let x = 0;
  let y = 0;
  let drag: { sx: number; sy: number; ox: number; oy: number } | null = null;

  const img = h('img', { class: 'ige-zoom__img', src: opts.src, alt: opts.caption ?? '', draggable: false });
  img.addEventListener('load', () => {
    const cap = root.querySelector('.ige-zoom__caption');
    if (cap) cap.textContent = `${opts.caption ? `${opts.caption} · ` : ''}${img.naturalWidth}×${img.naturalHeight}`;
  });
  const apply = () => (img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`);
  const reset = () => {
    scale = 1;
    x = y = 0;
    apply();
  };

  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-in');
    setTimeout(() => root.remove(), 180);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    } else if (e.key === '0') reset();
  };

  const stage = h('div', {
    class: 'ige-zoom__stage',
    onWheel: (e: WheelEvent) => {
      e.preventDefault();
      const prev = scale;
      scale = Math.min(8, Math.max(0.5, scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      // keep the point under the cursor fixed
      const r = stage.getBoundingClientRect();
      const cx = e.clientX - r.left - r.width / 2;
      const cy = e.clientY - r.top - r.height / 2;
      x = cx - ((cx - x) * scale) / prev;
      y = cy - ((cy - y) * scale) / prev;
      apply();
    },
    onMousedown: (e: MouseEvent) => {
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, ox: x, oy: y };
      stage.classList.add('is-dragging');
    },
    onMousemove: (e: MouseEvent) => {
      if (!drag) return;
      x = drag.ox + e.clientX - drag.sx;
      y = drag.oy + e.clientY - drag.sy;
      apply();
    },
    onMouseup: () => {
      drag = null;
      stage.classList.remove('is-dragging');
    },
    onMouseleave: () => (drag = null),
    onDblclick: reset,
    onClick: (e: MouseEvent) => {
      if (e.target === stage) close();
    },
  }, img);

  const bar = h(
    'div',
    { class: 'ige-zoom__bar' },
    h('span', { class: 'ige-zoom__caption' }, opts.caption ?? ''),
    h(
      'div',
      { class: 'ige-zoom__actions' },
      opts.onDownload ? iconButton('download', 'Download', opts.onDownload) : null,
      opts.onCopy ? iconButton('link', 'Copy image URL', opts.onCopy) : null,
      iconButton('open', 'Open in new tab', () => window.open(opts.src, '_blank', 'noopener')),
      iconButton('close', 'Close (Esc)', close),
    ),
  );

  const root = h('div', { class: 'ige-zoom', role: 'dialog', 'aria-label': 'Image viewer' }, stage, bar);
  document.addEventListener('keydown', onKey, true);
  uiLayer().append(root);
  requestAnimationFrame(() => root.classList.add('is-in'));
}
