import { cleanInstagramUrl, isSingleInstagramUrl, unwrapLinkShim } from '../../shared/links';
import { onDomChange } from '../core/observer';
import { getSettings } from '../core/state';
import type { Feature } from './types';

// The MAIN-world script reads these attributes for clipboard.writeText and window.open.
const ATTR_CLEAN = 'data-ige-cleanlinks';
const ATTR_DOMAIN = 'data-ige-sharedomain';
const ATTR_DIRECT = 'data-ige-directlinks';

function copiedText(): string {
  const el = document.activeElement;
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const { selectionStart: a, selectionEnd: b, value } = el;
    return a != null && b != null && b > a ? value.slice(a, b) : value;
  }
  return document.getSelection()?.toString() ?? '';
}

/** Clean share links: strip tracking params from copied Instagram links, optionally swap the domain. */
export const cleanLinks: Feature = {
  id: 'clean-links',
  isEnabled: (s) => s['links.clean'],
  start() {
    const html = document.documentElement;
    const sync = () => {
      html.setAttribute(ATTR_CLEAN, '1');
      html.setAttribute(ATTR_DOMAIN, getSettings()['links.shareDomain'].trim());
    };
    sync();

    // Instagram's "Copy link" uses a hidden textarea + execCommand('copy'), which fires this event.
    const onCopy = (e: ClipboardEvent) => {
      const text = copiedText();
      if (!e.clipboardData || !isSingleInstagramUrl(text)) return;
      const cleaned = cleanInstagramUrl(text, getSettings()['links.shareDomain']);
      if (cleaned === text.trim()) return;
      e.clipboardData.setData('text/plain', cleaned);
      e.preventDefault();
    };
    document.addEventListener('copy', onCopy, true);
    return () => {
      document.removeEventListener('copy', onCopy, true);
      html.removeAttribute(ATTR_CLEAN);
      html.removeAttribute(ATTR_DOMAIN);
    };
  },
  onSettings: (s) => document.documentElement.setAttribute(ATTR_DOMAIN, s['links.shareDomain'].trim()),
};

/** Open links directly: skip the l.instagram.com redirect page. */
export const directLinks: Feature = {
  id: 'direct-links',
  isEnabled: (s) => s['links.direct'],
  start() {
    document.documentElement.setAttribute(ATTR_DIRECT, '1');

    const rewrite = () => {
      for (const a of document.querySelectorAll<HTMLAnchorElement>('a[href*="l.instagram.com/"], a[href*="l.facebook.com/"]')) {
        const target = unwrapLinkShim(a.href);
        if (target) a.href = target;
      }
    };

    // React may restore the shim href on re-render; handle the click itself too.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      const target = a && unwrapLinkShim(a.href);
      if (!target || e.button > 1) return;
      e.preventDefault();
      e.stopPropagation();
      window.open(target, '_blank', 'noopener');
    };

    const off = onDomChange(rewrite);
    document.addEventListener('click', onClick, true);
    document.addEventListener('auxclick', onClick, true);
    return () => {
      off();
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('auxclick', onClick, true);
      document.documentElement.removeAttribute(ATTR_DIRECT);
    };
  },
};
