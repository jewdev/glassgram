// Procedural SVG "photos" for the mock Instagram content. No stock images, no real people:
// every picture is generated from a seed, so renders are identical and rights-free.
import { rng } from './lib.js';

let uid = 0;
const id = (p) => `${p}${++uid}`;

function ridge(r, w, base, amp, peaks = 4, rough = 1) {
  const ps = Array.from({ length: peaks }, () => ({ c: r() * w, h: 0.45 + r() * 0.55, s: w * (0.12 + r() * 0.22) }));
  const ph = [r() * 9, r() * 9, r() * 9];
  const pts = [];
  for (let x = -10; x <= w + 10; x += Math.max(3, w / 220)) {
    let y = 0;
    for (const p of ps) y = Math.max(y, p.h * Math.max(0, 1 - Math.abs(x - p.c) / p.s) ** 1.35);
    y += rough * (0.05 * Math.sin(x * 0.031 + ph[0]) + 0.03 * Math.sin(x * 0.083 + ph[1]) + 0.015 * Math.sin(x * 0.21 + ph[2]));
    pts.push(`${x.toFixed(1)},${(base - amp * y).toFixed(1)}`);
  }
  return pts;
}

function pine(x, y, s, fill) {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const ty = y - s * (0.35 + i * 0.22);
    const bw = s * (0.34 - i * 0.07);
    d += `M${x - bw},${ty + s * 0.3}L${x},${ty - s * 0.12}L${x + bw},${ty + s * 0.3}Z`;
  }
  return `<path d="${d}M${x - s * 0.03},${y}h${s * 0.06}v${-s * 0.3}h${-s * 0.06}Z" fill="${fill}"/>`;
}

/** Alpine lake at dusk. `detail` adds the cabin, stars and smoke that reward zooming in. */
export function lake({ w = 1080, h = 1080, seed = 7, detail = false, sky = ['#1d2b5a', '#6a4c8c', '#f08a6c', '#ffd29a'] } = {}) {
  const r = rng(seed);
  const g = id('lk');
  const hz = h * 0.6;
  const layers = [
    { base: hz, amp: h * 0.36, col: ['#8a83b8', '#b49ac0'], peaks: 3 },
    { base: hz, amp: h * 0.26, col: ['#5d5a93', '#7d6fa5'], peaks: 4 },
    { base: hz, amp: h * 0.16, col: ['#352f5f', '#4a3f74'], peaks: 6 },
  ].map((L, i) => ({ ...L, pts: ridge(r, w, L.base, L.amp, L.peaks, 1 + i * 0.5) }));
  const mtn = layers
    .map((L, i) => `<linearGradient id="${g}m${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${L.col[0]}"/><stop offset="1" stop-color="${L.col[1]}"/></linearGradient>`)
    .join('');
  const shapes = layers.map((L, i) => `<polygon points="${L.pts.join(' ')} ${w + 10},${hz} -10,${hz}" fill="url(#${g}m${i})"/>`).join('');
  // snow caps on the far range
  const snow = `<polygon points="${layers[0].pts.join(' ')} ${w + 10},${hz} -10,${hz}" fill="#fff" opacity="0.18" clip-path="url(#${g}snow)"/>`;
  let stars = '';
  for (let i = 0; i < (detail ? 140 : 40); i++) {
    const x = r() * w;
    const y = r() * hz * 0.55;
    stars += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(0.4 + r() * (detail ? 1.3 : 1.6)).toFixed(2)}" fill="#fff" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`;
  }
  let trees = '';
  for (let x = -20; x < w + 20; x += 14 + r() * 26) {
    if (detail && x > w * 0.56 && x < w * 0.72) continue; // clearing for the cabin
    const s = h * (0.07 + r() * 0.09);
    trees += pine(x, hz + h * 0.012, s, '#141026');
  }
  const cx = w * 0.64;
  const cabin = detail
    ? `<g>
        <radialGradient id="${g}glow"><stop offset="0" stop-color="#ffcf7a" stop-opacity="0.75"/><stop offset="1" stop-color="#ffcf7a" stop-opacity="0"/></radialGradient>
        <circle cx="${cx}" cy="${hz - h * 0.018}" r="${h * 0.07}" fill="url(#${g}glow)"/>
        <path d="M${cx - h * 0.032},${hz + 2} v${-h * 0.026} l${h * 0.032},${-h * 0.022} l${h * 0.032},${h * 0.022} v${h * 0.026} Z" fill="#1b1430"/>
        <path d="M${cx - h * 0.038},${hz - h * 0.025} l${h * 0.038},${-h * 0.027} l${h * 0.038},${h * 0.027}" fill="none" stroke="#2a2046" stroke-width="${h * 0.004}"/>
        <rect x="${cx - h * 0.016}" y="${hz - h * 0.019}" width="${h * 0.011}" height="${h * 0.01}" fill="#ffd27d"/>
        <rect x="${cx + h * 0.006}" y="${hz - h * 0.019}" width="${h * 0.011}" height="${h * 0.01}" fill="#ffc35e"/>
        <rect x="${cx + h * 0.014}" y="${hz - h * 0.05}" width="${h * 0.006}" height="${h * 0.014}" fill="#1b1430"/>
        <path d="M${cx + h * 0.017},${hz - h * 0.052} c ${h * 0.01},${-h * 0.02} ${-h * 0.012},${-h * 0.03} ${h * 0.004},${-h * 0.05} s ${-h * 0.006},${-h * 0.03} ${h * 0.01},${-h * 0.045}" fill="none" stroke="#e8dff5" stroke-opacity="0.35" stroke-width="${h * 0.005}" stroke-linecap="round"/>
      </g>`
    : '';
  const sunX = w * (0.3 + r() * 0.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${sky[0]}"/><stop offset="0.45" stop-color="${sky[1]}"/><stop offset="0.8" stop-color="${sky[2]}"/><stop offset="1" stop-color="${sky[3]}"/>
      </linearGradient>
      <linearGradient id="${g}w" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${sky[2]}" stop-opacity="0.55"/><stop offset="1" stop-color="#120d26" stop-opacity="0.95"/>
      </linearGradient>
      <radialGradient id="${g}sun"><stop offset="0" stop-color="#fff4d6"/><stop offset="0.18" stop-color="#ffe0a0" stop-opacity="0.9"/><stop offset="1" stop-color="#ffb38a" stop-opacity="0"/></radialGradient>
      <clipPath id="${g}snow"><rect x="0" y="0" width="${w}" height="${hz - h * 0.26}"/></clipPath>
      ${mtn}
    </defs>
    <rect width="${w}" height="${hz}" fill="url(#${g}s)"/>
    ${stars}
    <circle cx="${sunX}" cy="${hz - h * 0.06}" r="${h * 0.22}" fill="url(#${g}sun)"/>
    <circle cx="${sunX}" cy="${hz - h * 0.06}" r="${h * 0.035}" fill="#fff6dc"/>
    ${shapes}${snow}
    <g transform="translate(0 ${hz * 2}) scale(1 -1)" opacity="0.55">${shapes}</g>
    <rect y="${hz}" width="${w}" height="${h - hz}" fill="url(#${g}w)"/>
    ${Array.from({ length: 26 }, () => `<rect x="${(r() * w).toFixed(0)}" y="${(hz + r() * (h - hz)).toFixed(0)}" width="${(20 + r() * 120).toFixed(0)}" height="${(1 + r() * 2).toFixed(1)}" rx="1" fill="#ffe2b8" opacity="${(0.08 + r() * 0.2).toFixed(2)}"/>`).join('')}
    <ellipse cx="${sunX}" cy="${hz + h * 0.07}" rx="${h * 0.03}" ry="${h * 0.12}" fill="#ffe7b8" opacity="0.28"/>
    ${trees}${cabin}
  </svg>`;
}

/** City skyline at night. */
export function city({ w = 1080, h = 1350, seed = 3 } = {}) {
  const r = rng(seed);
  const g = id('ct');
  const ground = h * 0.78;
  let b = '';
  let x = -10;
  const far = [];
  while (x < w) {
    const bw = 40 + r() * 90;
    far.push(`<rect x="${x}" y="${ground - h * (0.18 + r() * 0.25)}" width="${bw}" height="${h}" fill="#2a2257"/>`);
    x += bw - 6;
  }
  x = -20;
  while (x < w) {
    const bw = 60 + r() * 120;
    const bh = h * (0.15 + r() * 0.42);
    const top = ground - bh;
    b += `<rect x="${x}" y="${top}" width="${bw}" height="${bh + h}" fill="#140f2e"/>`;
    if (r() > 0.6) b += `<rect x="${x + bw / 2 - 1.5}" y="${top - 40}" width="3" height="40" fill="#140f2e"/><circle cx="${x + bw / 2}" cy="${top - 42}" r="3.5" fill="#ff5f6d"/>`;
    for (let wy = top + 14; wy < ground - 10; wy += 18)
      for (let wx = x + 10; wx < x + bw - 12; wx += 16)
        if (r() > 0.55) b += `<rect x="${wx}" y="${wy}" width="8" height="10" fill="${r() > 0.3 ? '#ffd27a' : '#9fd7ff'}" opacity="${(0.45 + r() * 0.5).toFixed(2)}"/>`;
    x += bw + 4;
  }
  let stars = '';
  for (let i = 0; i < 70; i++) stars += `<circle cx="${r() * w}" cy="${r() * h * 0.4}" r="${0.6 + r() * 1.3}" fill="#fff" opacity="${0.3 + r() * 0.6}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a1f"/><stop offset="0.5" stop-color="#2b1d5c"/><stop offset="0.8" stop-color="#b8487a"/><stop offset="1" stop-color="#ff9a6b"/></linearGradient>
    <radialGradient id="${g}m"><stop offset="0" stop-color="#fffbe8"/><stop offset="0.25" stop-color="#fff2c4" stop-opacity="0.5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${g})"/>${stars}
    <circle cx="${w * 0.75}" cy="${h * 0.18}" r="${w * 0.16}" fill="url(#${g}m)"/><circle cx="${w * 0.75}" cy="${h * 0.18}" r="${w * 0.045}" fill="#fffbe8"/>
    ${far.join('')}${b}
    <rect y="${ground}" width="${w}" height="${h - ground}" fill="#0b0820"/>
    ${Array.from({ length: 40 }, () => `<rect x="${r() * w}" y="${ground + 8 + r() * (h - ground - 10)}" width="${10 + r() * 60}" height="2" fill="#ffcf7a" opacity="${0.1 + r() * 0.3}"/>`).join('')}
  </svg>`;
}

/** Desert dunes. */
export function dunes({ w = 1080, h = 1080, seed = 11, warm = ['#ffb37d', '#ff7a7a', '#7b4fa8'] } = {}) {
  const r = rng(seed);
  const g = id('du');
  const dune = (y0, amp, c1, c2, k) => {
    const ph = r() * 6;
    let d = `M-10,${h} L-10,${y0}`;
    for (let x = -10; x <= w + 10; x += 12) d += ` L${x},${(y0 - amp * Math.sin(x * k + ph) - amp * 0.4 * Math.sin(x * k * 2.3 + ph * 2)).toFixed(1)}`;
    return `<path d="${d} L${w + 10},${h} Z" fill="${c1}"/><path d="${d} L${w + 10},${h} Z" fill="${c2}" opacity="0.5" transform="translate(${w * 0.04} 6)"/>`;
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${warm[2]}"/><stop offset="0.55" stop-color="${warm[1]}"/><stop offset="1" stop-color="${warm[0]}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${g})"/>
    <circle cx="${w * 0.62}" cy="${h * 0.42}" r="${w * 0.12}" fill="#fff1d0" opacity="0.92"/>
    ${dune(h * 0.58, h * 0.04, '#e9875f', '#c9634a', 0.006)}
    ${dune(h * 0.7, h * 0.05, '#d46a4f', '#a84a3d', 0.008)}
    ${dune(h * 0.84, h * 0.05, '#a9473d', '#7e3333', 0.005)}
  </svg>`;
}

/** Ocean at golden hour — animated (t in seconds) for the reel. */
export function ocean({ w = 1080, h = 1920, t = 0 } = {}) {
  const g = 'oc';
  const hz = h * 0.46;
  let waves = '';
  for (let i = 0; i < 26; i++) {
    const y = hz + (h - hz) * (i / 26) ** 1.6;
    const amp = 2 + i * 1.1;
    const k = 0.012 - i * 0.0003;
    const ph = t * (1.2 + i * 0.08) + i * 1.7;
    let d = `M-20,${y}`;
    for (let x = -20; x <= w + 20; x += 20) d += ` L${x},${(y + amp * Math.sin(x * k + ph)).toFixed(1)}`;
    waves += `<path d="${d}" fill="none" stroke="#ffe6c4" stroke-opacity="${(0.08 + 0.18 * (1 - i / 26)).toFixed(2)}" stroke-width="${1 + i * 0.25}"/>`;
  }
  const birds = [0, 1, 2]
    .map((i) => {
      const bx = ((t * 60 + i * 160) % (w + 200)) - 100;
      const by = h * 0.2 + i * 40 + Math.sin(t * 2 + i) * 12;
      const f = Math.sin(t * 9 + i * 2) * 8;
      return `<path d="M${bx - 16},${by + f} Q${bx - 6},${by - 6} ${bx},${by} Q${bx + 6},${by - 6} ${bx + 16},${by + f}" fill="none" stroke="#2a1838" stroke-width="3.5" stroke-linecap="round"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="${g}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2d2a6e"/><stop offset="0.5" stop-color="#d9628a"/><stop offset="1" stop-color="#ffc07a"/></linearGradient>
    <linearGradient id="${g}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f08f78"/><stop offset="0.3" stop-color="#7a3f7e"/><stop offset="1" stop-color="#1c1641"/></linearGradient>
    <radialGradient id="${g}sun"><stop offset="0" stop-color="#fff6dc"/><stop offset="0.2" stop-color="#ffe0a0" stop-opacity="0.85"/><stop offset="1" stop-color="#ffb38a" stop-opacity="0"/></radialGradient></defs>
    <rect width="${w}" height="${hz}" fill="url(#${g}s)"/>
    <circle cx="${w * 0.5}" cy="${hz - 30 + Math.sin(t * 0.3) * 4}" r="${w * 0.5}" fill="url(#${g}sun)"/>
    <circle cx="${w * 0.5}" cy="${hz - 30}" r="${w * 0.09}" fill="#fff4d8"/>
    <rect y="${hz}" width="${w}" height="${h - hz}" fill="url(#${g}w)"/>
    <ellipse cx="${w * 0.5}" cy="${hz + (h - hz) * 0.3}" rx="${w * 0.09}" ry="${(h - hz) * 0.32}" fill="#ffe1b0" opacity="0.25"/>
    ${waves}${birds}
  </svg>`;
}

/** Misty forest. */
export function forest({ w = 1080, h = 1350, seed = 21 } = {}) {
  const r = rng(seed);
  const g = id('fo');
  const rows = [0.42, 0.52, 0.64, 0.8].map((y, i) => {
    let s = '';
    const col = ['#8fb3a8', '#5f8a80', '#38615a', '#1b3a36'][i];
    for (let x = -30; x < w + 30; x += 18 + r() * 22) s += pine(x, h * y + r() * 20, h * (0.12 + i * 0.05 + r() * 0.05), col);
    return s + `<rect y="${h * y}" width="${w}" height="${h}" fill="${col}"/><rect y="${h * y - 60}" width="${w}" height="120" fill="#dfeee8" opacity="0.18"/>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9f1ec"/><stop offset="1" stop-color="#a9c6bd"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#${g})"/>${rows.join('')}
  </svg>`;
}

/** Bright still life (coffee + plant) for variety. */
export function cafe({ w = 1080, h = 1080 } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice">
    <defs><linearGradient id="cf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6e7d4"/><stop offset="1" stop-color="#e7c9a8"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#cf)"/>
    <rect y="${h * 0.66}" width="${w}" height="${h * 0.34}" fill="#c99b72"/>
    <ellipse cx="${w * 0.42}" cy="${h * 0.7}" rx="${w * 0.2}" ry="${h * 0.045}" fill="#a87a55" opacity="0.6"/>
    <ellipse cx="${w * 0.42}" cy="${h * 0.67}" rx="${w * 0.19}" ry="${h * 0.04}" fill="#fbf6ef"/>
    <path d="M${w * 0.31},${h * 0.44} h${w * 0.22} v${h * 0.16} a${w * 0.11},${h * 0.07} 0 0 1 ${-w * 0.22},0 Z" fill="#fbf6ef"/>
    <path d="M${w * 0.53},${h * 0.48} a${w * 0.05},${w * 0.05} 0 1 1 0,${w * 0.08}" fill="none" stroke="#fbf6ef" stroke-width="${w * 0.018}"/>
    <ellipse cx="${w * 0.42}" cy="${h * 0.44}" rx="${w * 0.11}" ry="${h * 0.022}" fill="#6b3f22"/>
    <path d="M${w * 0.39},${h * 0.44} q${w * 0.03},${-h * 0.01} ${w * 0.06},0" stroke="#e7c3a0" stroke-width="5" fill="none"/>
    <rect x="${w * 0.7}" y="${h * 0.48}" width="${w * 0.14}" height="${h * 0.18}" rx="12" fill="#d77a5b"/>
    ${[...Array(9)].map((_, i) => `<ellipse cx="${w * 0.77 + Math.cos(i * 0.7 - 2.6) * w * 0.08}" cy="${h * 0.4 + Math.sin(i * 0.7 - 2.6) * h * 0.1}" rx="${w * 0.025}" ry="${w * 0.07}" fill="${i % 2 ? '#4f8a5b' : '#3b7149'}" transform="rotate(${i * 40 - 160} ${w * 0.77 + Math.cos(i * 0.7 - 2.6) * w * 0.08} ${h * 0.4 + Math.sin(i * 0.7 - 2.6) * h * 0.1})"/>`).join('')}
  </svg>`;
}

/** Profile picture: gradient disc with a simple motif. */
export function avatar(seed, motif = 'peak') {
  const r = rng(seed);
  const hues = [r() * 360, r() * 360];
  const g = id('av');
  const m = {
    peak: '<path d="M10 70 L38 34 L52 50 L62 40 L90 70 Z" fill="#fff" opacity="0.85"/><circle cx="68" cy="28" r="8" fill="#fff" opacity="0.9"/>',
    wave: '<path d="M8 58 q14 -14 28 0 t28 0 t28 0 v40 h-84z" fill="#fff" opacity="0.85"/><circle cx="50" cy="34" r="12" fill="#fff" opacity="0.9"/>',
    leaf: '<path d="M50 20 C78 30 80 64 50 82 C20 64 22 30 50 20Z" fill="#fff" opacity="0.85"/><path d="M50 26 V78" stroke-width="3" stroke="#000" opacity="0.2"/>',
    cup: '<rect x="28" y="38" width="36" height="30" rx="8" fill="#fff" opacity="0.9"/><path d="M64 46 a8 8 0 0 1 0 14" stroke="#fff" stroke-width="5" fill="none" opacity="0.9"/>',
    dot: '<circle cx="50" cy="50" r="18" fill="#fff" opacity="0.9"/><circle cx="50" cy="50" r="30" fill="none" stroke="#fff" stroke-width="4" opacity="0.6"/>',
    sun: '<circle cx="50" cy="54" r="16" fill="#fff" opacity="0.9"/><path d="M14 72 h72" stroke="#fff" stroke-width="5" opacity="0.8"/>',
  }[motif];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="${g}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hues[0]} 70% 60%)"/><stop offset="1" stop-color="hsl(${hues[1]} 65% 42%)"/></linearGradient></defs><rect width="100" height="100" fill="url(#${g})"/>${m}</svg>`;
}

export const toUrl = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
