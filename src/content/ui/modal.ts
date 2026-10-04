import { h, icon, ICONS, uiLayer } from './dom';

export interface Modal {
  root: HTMLElement;
  body: HTMLElement;
  footer: HTMLElement;
  close: () => void;
}

/** Centered dialog. `onClose` runs on X, Esc or backdrop click. */
export function openModal(title: string, opts: { width?: number; onClose?: () => void } = {}): Modal {
  const body = h('div', { class: 'ige-modal__body' });
  const footer = h('div', { class: 'ige-modal__footer' });
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    root.classList.remove('is-in');
    setTimeout(() => root.remove(), 180);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const panel = h(
    'div',
    { class: 'ige-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: opts.width ? { width: `min(${opts.width}px, calc(100vw - 32px))` } : undefined },
    h('div', { class: 'ige-modal__head' }, h('h2', {}, title), h('button', { class: 'ige-btn ige-btn--ghost', type: 'button', title: 'Close', html: icon(ICONS.close), onClick: close })),
    body,
    footer,
  );
  const root = h('div', { class: 'ige-backdrop', onClick: (e: MouseEvent) => e.target === root && close() }, panel);
  document.addEventListener('keydown', onKey, true);
  uiLayer().append(root);
  requestAnimationFrame(() => root.classList.add('is-in'));
  return { root, body, footer, close };
}
