import { h, uiLayer } from './dom';

type Kind = 'info' | 'success' | 'error';

let stack: HTMLElement | undefined;

export function toast(message: string, kind: Kind = 'info', ms = 3200): { update: (m: string) => void; close: () => void } {
  if (!stack?.isConnected) {
    stack = h('div', { class: 'ige-toasts' });
    uiLayer().append(stack);
  }
  const el = h('div', { class: `ige-toast ige-toast--${kind}`, role: 'status' }, message);
  stack.append(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  const close = () => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 200);
  };
  if (ms > 0) setTimeout(close, ms);
  return { update: (m: string) => (el.textContent = m), close };
}

export async function copyText(text: string, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(label, 'success', 1800);
  } catch {
    toast('Clipboard blocked by the browser', 'error');
  }
}
