// Shared scene parts: Glassgram's real icons (read from the extension source), captions, cursor,
// and a scoped copy of Glassgram's in-page UI layer.
import { h, clamp, ease, prog, kf, lerp, vis, style } from './lib.js';

export const GG = { ICONS: {}, SECTION: {} };

/** Parse `name: '<svg paths>'` maps straight out of the TypeScript source, so the video always shows the shipped icons. */
async function readIconMap(path, constName) {
  const src = await (await fetch(path)).text();
  const start = src.indexOf(constName);
  const body = src.slice(start, src.indexOf('};', start));
  return Object.fromEntries([...body.matchAll(/^\s*(\w+): '([^']+)'/gm)].map((m) => [m[1], m[2]]));
}

export async function loadGlassgramAssets() {
  GG.ICONS = await readIconMap('/repo/src/content/ui/dom.ts', 'export const ICONS');
  GG.SECTION = await readIconMap('/repo/src/shared/icons.ts', 'SECTION_ICON_PATHS');
}

/** Same markup as `icon()` in src/content/ui/dom.ts. */
export const ggIcon = (name, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GG.ICONS[name]}</svg>`;
/** Same markup as `sectionIcon()` in src/shared/icons.ts. */
export const sectionIcon = (name, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${GG.SECTION[name]}</svg>`;

/** Same markup as `iconButton()` in src/content/ui/dom.ts. */
export const ggButton = (name, title, extra = '') => h('button', { class: `ige-btn ${extra}`.trim(), type: 'button', title, html: ggIcon(name) });

/** Glassgram's UI layer (real classes and CSS), scoped to a window's viewport instead of the page. */
export function ggLayer(parent) {
  const layer = h('div', { class: 'ige-root ige-layer promo-layer' });
  parent.append(layer);
  return layer;
}

/** A late-revealed toolbar button grows in, like the real `ige-btn-in` keyframes. */
export function growIn(btn, p) {
  if (p <= 0) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  const e = ease.out(clamp(p));
  style(btn, { maxWidth: `${lerp(0, 80, e)}px`, minWidth: `${lerp(0, 34, e)}px`, padding: e < 1 ? `0 ${lerp(0, 8, e)}px` : '', opacity: String(e), overflow: 'hidden' });
}

// ---------------- caption ----------------
/** Eyebrow + headline + subline. Words rise in one after another. */
export function caption({ eyebrow, icon, title, sub, x = 140, y = 360, width = 600, size }) {
  const words = (Array.isArray(title) ? title : [title]).map((line) => line);
  const titleEl = h('h2', { class: 'cap__title' });
  if (size) titleEl.style.fontSize = `${size}px`;
  const wordEls = [];
  words.forEach((line, li) => {
    if (li) titleEl.append(h('br'));
    for (const [i, w] of line.split(' ').entries()) {
      const accent = w.startsWith('*');
      const el = h('span', { class: `w${accent ? ' accent' : ''}` }, (i ? ' ' : '') + w.replace(/^\*/, ''));
      wordEls.push(el);
      titleEl.append(el);
    }
  });
  const eb = eyebrow ? h('div', { class: 'cap__eyebrow' }, h('i', { html: sectionIcon(icon, 18) }), eyebrow) : null;
  const subEl = sub ? h('p', { class: 'cap__sub', html: sub }) : null;
  const el = h('div', { class: 'cap', style: { left: `${x}px`, top: `${y}px`, width: `${width}px` } }, eb, titleEl, subEl);
  return {
    el,
    sub: subEl,
    /** t0: when the caption starts entering; t1: when it starts leaving (or Infinity). */
    update(t, t0, t1 = Infinity) {
      const out = prog(t, t1, t1 + 0.45, ease.in);
      const rise = (p) => `translateY(${lerp(34, 0, p) - out * 20}px)`;
      if (eb) {
        const p = prog(t, t0, t0 + 0.6, ease.outQuart);
        style(eb, { opacity: String(p * (1 - out)), transform: rise(p) });
      }
      wordEls.forEach((w, i) => {
        const p = prog(t, t0 + 0.12 + i * 0.07, t0 + 0.82 + i * 0.07, ease.outQuart);
        style(w, { opacity: String(p * (1 - out)), transform: rise(p), filter: `blur(${(1 - p) * 10 + out * 6}px)` });
      });
      if (subEl) {
        const p = prog(t, t0 + 0.5 + wordEls.length * 0.07, t0 + 1.2 + wordEls.length * 0.07, ease.outQuart);
        style(subEl, { opacity: String(p * (1 - out)), transform: rise(p) });
      }
    },
  };
}

/** Pills that pop in one by one. */
export function chips(labels) {
  const items = labels.map((l) => h('span', { class: 'chip', html: l }));
  const el = h('div', { class: 'chips' }, ...items);
  return {
    el,
    update(t, t0, step = 0.12, t1 = Infinity) {
      const out = prog(t, t1, t1 + 0.4, ease.in);
      items.forEach((c, i) => {
        const p = prog(t, t0 + i * step, t0 + i * step + 0.45, ease.outBack);
        style(c, { opacity: String(clamp(p) * (1 - out)), transform: `translateY(${(1 - p) * 16}px) scale(${lerp(0.85, 1, p)})` });
      });
    },
  };
}

// ---------------- cursor ----------------
const ARROW = `<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3.5v18.2l4.6-4.4 3 6.7 3.4-1.5-3-6.6h6.4Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
const HAND = `<svg width="28" height="28" viewBox="0 0 28 28" style="left:-8px;top:-2px"><path d="M10.5 13V5.2a1.8 1.8 0 0 1 3.6 0V12m0-1.3a1.8 1.8 0 0 1 3.6 0V13m0-1a1.8 1.8 0 0 1 3.6 0v1.4m0-.2a1.7 1.7 0 0 1 3.3.4v4.6c0 4.4-3 7.3-7.2 7.3h-1.7c-2.6 0-4.3-1.1-5.8-3.3L4.6 17a1.8 1.8 0 0 1 2.8-2.2l3.1 3.1Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
const GRAB = `<svg width="28" height="28" viewBox="0 0 28 28" style="left:-10px;top:-8px"><path d="M8 13.5v-2a1.7 1.7 0 0 1 3.4 0v1m0-2.2a1.7 1.7 0 0 1 3.4 0v1.7m0-1.2a1.7 1.7 0 0 1 3.4 0v1.6m0-.6a1.7 1.7 0 0 1 3.4 0v4.6c0 4.2-2.8 7-6.8 7h-1.6c-2.4 0-4-1-5.4-3L5 17.4a1.7 1.7 0 0 1 2.6-2.1L8 15.8Z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>`;

/**
 * Cursor following a path of [t, point] keys; a point is {x, y} or a function returning one (resolved each frame,
 * so it can track live layout). `clicks` are times of mouse presses; `shapes` are [t, 'arrow'|'hand'|'grab'] keys.
 */
export function cursor(parent) {
  const svgWrap = h('div', { html: ARROW });
  const ring = h('div', { class: 'cursor__ring' });
  const el = h('div', { class: 'cursor' }, ring, svgWrap);
  parent.append(el);
  let shape = 'arrow';
  return {
    el,
    update(t, { path, clicks = [], shapes = [], show = [0, Infinity] }) {
      const resolve = (p) => (typeof p === 'function' ? p() : p);
      let pos;
      if (t <= path[0][0]) pos = resolve(path[0][1]);
      else if (t >= path[path.length - 1][0]) pos = resolve(path[path.length - 1][1]);
      else {
        for (let i = 1; i < path.length; i++) {
          if (t <= path[i][0]) {
            const a = resolve(path[i - 1][1]);
            const b = resolve(path[i][1]);
            const e = path[i][2] ?? ease.inOutQuint;
            const p = e(clamp((t - path[i - 1][0]) / (path[i][0] - path[i - 1][0])));
            // a slight arc makes hand motion feel human
            const arc = Math.sin(p * Math.PI) * Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.08);
            pos = { x: lerp(a.x, b.x, p) + arc * 0.3, y: lerp(a.y, b.y, p) - arc };
            break;
          }
        }
      }
      let s = 'arrow';
      for (const [ts, name] of shapes) if (t >= ts) s = name;
      if (s !== shape) {
        shape = s;
        svgWrap.innerHTML = s === 'hand' ? HAND : s === 'grab' ? GRAB : ARROW;
      }
      let press = 0;
      let ringP = -1;
      for (const c of clicks) {
        press = Math.max(press, 1 - Math.abs(t - c) / 0.09);
        if (t >= c && t < c + 0.45) ringP = (t - c) / 0.45;
      }
      const o = Math.min(prog(t, show[0], show[0] + 0.25), 1 - prog(t, show[1] - 0.25, show[1]));
      vis(el, o);
      el.style.transform = `translate(${pos.x - 5}px, ${pos.y - 4}px) scale(${1 - 0.14 * clamp(press)})`;
      style(ring, { opacity: ringP < 0 ? '0' : String((1 - ringP) * 0.8), transform: `scale(${0.4 + ringP * 0.9})` });
      return pos;
    },
  };
}

export { kf };
