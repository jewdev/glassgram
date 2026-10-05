// Small helpers for a deterministic, time-driven composition: every visual is a pure function of t.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, p) => a + (b - a) * p;

export const ease = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  outQuart: (t) => 1 - (1 - t) ** 4,
  outExpo: (t) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  inOutQuint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - (-2 * t + 2) ** 5 / 2),
  outBack: (t, s = 1.5) => 1 + (s + 1) * (t - 1) ** 3 + s * (t - 1) ** 2,
  // critically-damped-ish spring settle, overshoots a little
  spring: (t) => (t >= 1 ? 1 : 1 - Math.exp(-6.5 * t) * Math.cos(7.5 * t)),
};

/** Eased progress of t through [a, b]. */
export const prog = (t, a, b, e = ease.inOut) => (Number.isFinite(a) ? e(clamp((t - a) / (b - a || 1e-9))) : 0);

/** Envelope: 0 → 1 over [a, a+fi], hold, 1 → 0 over [b-fo, b]. */
export function env(t, a, b, fi = 0.4, fo = 0.4, e = ease.inOut) {
  if (t < a || t > b) return 0;
  return Math.min(fi ? e(clamp((t - a) / fi)) : 1, fo ? e(clamp((b - t) / fo)) : 1);
}

/** Keyframes: [[t, value, ease?], ...]; value may be a number or array of numbers. Ease applies to the segment ending at that key. */
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1, e = ease.inOut] = keys[i];
    if (t <= t1) {
      const [t0, v0] = keys[i - 1];
      const p = e(clamp((t - t0) / (t1 - t0 || 1)));
      return Array.isArray(v0) ? v0.map((v, j) => lerp(v, v1[j], p)) : lerp(v0, v1, p);
    }
  }
  return keys[keys.length - 1][1];
}

/** Hyperscript, same shape as Glassgram's own `h` (src/content/ui/dom.ts). */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') style(el, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c);
  return el;
}

export function frag(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Seeded RNG (mulberry32) so generated art is identical on every render. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Position of `el`'s centre (or a fractional point in it) in `space`'s untransformed coordinates. Works through same-origin iframes. */
export function pointIn(el, space, fx = 0.5, fy = 0.5) {
  if (!el) return { x: 0, y: 0 };
  let r = el.getBoundingClientRect();
  let x = r.left + r.width * fx;
  let y = r.top + r.height * fy;
  // climb out of iframes
  let win = el.ownerDocument.defaultView;
  while (win && win.frameElement) {
    const fr = win.frameElement.getBoundingClientRect();
    const sc = fr.width / win.frameElement.offsetWidth || 1;
    x = fr.left + x * sc;
    y = fr.top + y * sc;
    win = win.parent;
  }
  const s = space.getBoundingClientRect();
  const scale = s.width / space.offsetWidth || 1;
  return { x: (x - s.left) / scale, y: (y - s.top) / scale };
}

export const style = (el, s) => {
  for (const k in s) {
    if (k.startsWith('--')) el.style.setProperty(k, s[k]);
    else el.style[k] = s[k];
  }
  return el;
};

/** Show/hide helper that also keeps hidden elements out of the render cost. */
export function vis(el, o) {
  el.style.opacity = String(o);
  el.style.visibility = o <= 0.001 ? 'hidden' : 'visible';
}
