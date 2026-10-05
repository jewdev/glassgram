import { onDomChange } from '../core/observer';
import { copyText } from '../ui/toast';
import type { Feature } from './types';

// A comment's timestamp links to /p/<code>/c/<comment id>/ — captions don't have the /c/ part.
const COMMENT_TIME = 'a[href*="/c/"] time[datetime]';
const MARK = 'data-ige-cc';
const BTN_CLASS = 'ige-copy-comment';
/** Every item we add to a comment's action line, so we never clone or count our own. */
export const COMMENT_ACTION_CLASS = 'ige-comment-action';

/** Smallest ancestor that holds this comment (avatar + one timestamp). */
function commentRow(time: Element): Element | null {
  let cur: Element = time;
  let best: Element | null = null;
  for (let i = 0; i < 12 && cur.parentElement; i++) {
    cur = cur.parentElement;
    if (cur.querySelectorAll('time[datetime]').length > 1) break;
    if (cur.querySelector('img')) best = cur;
  }
  return best;
}

/** Comment text = the first dir="auto" span after the one holding the timestamp. */
function commentText(row: Element, time: Element): string {
  const spans = [...row.querySelectorAll<HTMLElement>('span[dir="auto"]')];
  const i = spans.findIndex((s) => s.contains(time));
  for (const s of spans.slice(i + 1)) {
    if (s.contains(time)) continue;
    const text = s.innerText.trim();
    if (text) return text;
  }
  return '';
}

/**
 * The "12 likes · Reply · See translation" line: the parent holding the most text-only buttons
 * (no icon) in the row. Returns its last button, which we clone so "Copy" matches Instagram's style.
 */
export function actionLineItem(row: Element): HTMLElement | null {
  const buttons = [...row.querySelectorAll<HTMLElement>('[role="button"], button')].filter(
    (b) => !b.classList.contains(COMMENT_ACTION_CLASS) && !b.querySelector('svg, img') && b.textContent?.trim(),
  );
  const byParent = new Map<Element, HTMLElement[]>();
  for (const b of buttons) {
    if (!b.parentElement) continue;
    byParent.set(b.parentElement, [...(byParent.get(b.parentElement) ?? []), b]);
  }
  let best: HTMLElement[] = [];
  for (const group of byParent.values()) if (group.length > best.length) best = group;
  return best.at(-1) ?? null;
}

/** Clone of an Instagram action-line item ("Reply") relabelled, so it matches the native style. */
export function makeCommentAction(template: HTMLElement, opts: { text: string; label: string; className: string; onActivate: () => void }): HTMLElement {
  const btn = template.cloneNode(true) as HTMLElement;
  btn.classList.add(COMMENT_ACTION_CLASS, opts.className);
  btn.removeAttribute('aria-describedby');
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', opts.label);
  // Replace the deepest text with ours, drop any other text nodes.
  const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  texts.forEach((t, i) => (t.data = i === 0 ? opts.text : ''));
  const activate = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    opts.onActivate();
  };
  btn.addEventListener('click', activate);
  btn.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && activate(e));
  return btn;
}

function scan() {
  for (const time of document.querySelectorAll(COMMENT_TIME)) {
    const link = time.closest('a')!;
    if (link.hasAttribute(MARK) || !/\/c\/\d+/.test(link.getAttribute('href') ?? '')) continue;
    const row = commentRow(time);
    const template = row && actionLineItem(row);
    if (!row || !template) continue; // action line not rendered yet — retry on next scan
    link.setAttribute(MARK, '');
    template.insertAdjacentElement(
      'afterend',
      makeCommentAction(template, {
        text: 'Copy',
        label: 'Copy comment',
        className: BTN_CLASS,
        onActivate: () => {
          const text = commentText(row, time);
          if (text) copyText(text, 'Comment copied');
        },
      }),
    );
  }
}

export const copyComment: Feature = {
  id: 'copy-comment',
  isEnabled: (s) => s['info.copyComment'],
  start() {
    const off = onDomChange(scan);
    return () => {
      off();
      document.querySelectorAll(`.${BTN_CLASS}`).forEach((b) => b.remove());
      document.querySelectorAll(`[${MARK}]`).forEach((l) => l.removeAttribute(MARK));
    };
  },
};
