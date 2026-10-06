import { h, prog, ease, kf, lerp, style, vis, clamp } from '../lib.js';
import { SCENES, LO, CT } from '../timeline.js';
import { caption } from '../kit.js';

const CHECK = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const GH = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.69 1.25 3.35.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z"/></svg>';
const FOLDER = '<svg viewBox="0 0 16 16" width="16" height="16" fill="#7d8590"><path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.22.78 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/></svg>';
const FILE = '<svg viewBox="0 0 16 16" width="16" height="16" fill="#7d8590"><path d="M2 1.75C2 .78 2.78 0 3.75 0h6.59c.46 0 .9.18 1.23.51l2.92 2.92c.33.33.51.77.51 1.23v9.59A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .14.11.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Z"/></svg>';

/** Highlight the manifest's host permissions — the only places the extension can talk to. */
function manifestCard(src) {
  // the real host_permissions array from manifest.config.ts
  const hosts = [...src.slice(src.indexOf('host_permissions')).split(']')[0].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const str = (v) => `<span style="color:#a5d6ff">'${v}'</span>`;
  const code = [`<span style="color:#ffa657">host_permissions</span>: [`, ...hosts.map((x) => `  ${str(x)},`), '],'];
  return h(
    'div',
    { class: 'panel', style: { left: '0', top: '0', position: 'relative', padding: '20px 26px 22px', borderRadius: '18px', background: 'rgb(13 17 23 / 0.85)' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', font: '600 14px/1 var(--text)', color: '#7d8590', marginBottom: '14px' } }, h('span', {}, 'manifest.config.ts'), h('span', { style: { color: 'var(--ok)' } }, 'The only sites it can reach')),
    h('pre', { style: { margin: '0', font: '17px/1.65 Consolas, "Cascadia Mono", ui-monospace, monospace', color: '#e6edf3' }, html: code.map((l) => `<div data-hl="1" style="border-radius:6px;padding:0 8px;margin:0 -8px">${l}</div>`).join('') }),
  );
}

export function local() {
  const [start, end] = SCENES.local;
  const root = h('div');
  const cap = caption({ eyebrow: 'Privacy', icon: 'shield', title: ['Runs in your', '*browser.'], x: 130, y: 300, width: 640 });
  const lines = ['No Glassgram server.', 'No Glassgram analytics.', 'Open source. MIT licensed.'].map((txt) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '16px', marginTop: '22px', font: '600 38px/1.2 var(--display)', letterSpacing: '-0.02em' } }, h('span', { style: { display: 'grid', placeItems: 'center', width: '48px', height: '48px', borderRadius: '14px', background: 'rgb(94 227 154 / 0.14)', color: 'var(--ok)' }, html: CHECK }), txt));
  const linesBox = h('div', { style: { marginTop: '26px' } }, ...lines);
  cap.el.append(linesBox);

  // repository card (GitHub dark), with the real top-level tree
  const tree = [
    ['d', 'docs'], ['d', 'public/icons'], ['d', 'scripts'], ['d', 'src'], ['d', 'tests'],
    ['f', 'LICENSE'], ['f', 'README.md'], ['f', 'manifest.config.ts'], ['f', 'package.json'],
  ];
  const repo = h(
    'div',
    { style: { borderRadius: '14px', overflow: 'hidden', background: '#0d1117', boxShadow: '0 0 0 1px #30363d, 0 40px 90px -30px rgb(0 0 0 / 0.9)', font: '14px/1.5 -apple-system, "Segoe UI", sans-serif', color: '#e6edf3' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 20px', background: '#010409', borderBottom: '1px solid #30363d', fontSize: '18px' }, html: `<span style="color:#e6edf3">${GH}</span><span style="color:#7d8590">jewdev /</span><b>glassgram</b><span style="margin-left:auto;font-size:12px;padding:2px 9px;border:1px solid #30363d;border-radius:999px;color:#7d8590">MIT</span>` }),
    h('div', { style: { padding: '14px 20px', color: '#9198a1', borderBottom: '1px solid #30363d' } }, 'Unofficial browser extension that adds downloads, HD profile pictures, story mentions, follow badges and a cleaner feed to instagram.com.'),
    ...tree.map(([k, n]) => h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 20px', borderTop: '1px solid #21262d' }, html: `${k === 'd' ? FOLDER : FILE}<span>${n}</span>` })),
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 20px', borderTop: '1px solid #21262d', color: '#9198a1', fontSize: '13px' }, html: '<i style="width:10px;height:10px;border-radius:50%;background:#3178c6;display:inline-block"></i>TypeScript · Manifest V3' }),
  );
  const right = h('div', { class: 'abs', style: { left: '1010px', top: '130px', width: '780px', display: 'flex', flexDirection: 'column', gap: '22px' } }, repo);
  root.append(cap.el, right);
  let card;
  const ready = fetch('/repo/manifest.config.ts').then((r) => r.text()).then((src) => {
    card = manifestCard(src);
    right.append(card);
  });

  return {
    root,
    ready,
    update(t) {
      cap.update(t, start + 0.2);
      lines.forEach((l, i) => {
        const p = prog(t, LO.lines[i], LO.lines[i] + 0.5, ease.outQuart);
        style(l, { opacity: String(p), transform: `translateX(${(1 - p) * -24}px)` });
      });
      const rp = prog(t, start + 0.3, start + 1.1, ease.outQuart);
      style(repo, { opacity: String(rp), transform: `translateY(${(1 - rp) * 40}px)` });
      if (card) {
        const cp = prog(t, start + 0.9, start + 1.7, ease.outQuart);
        style(card, { opacity: String(cp), transform: `translateY(${(1 - cp) * 40}px)` });
        const hl = prog(t, LO.lines[0] + 0.3, LO.lines[0] + 0.8);
        card.querySelectorAll('[data-hl="1"]').forEach((d) => (d.style.background = `rgb(94 227 154 / ${0.16 * hl})`));
      }
      right.style.translate = `0 ${-kf(t, [[start, 0], [end + 0.5, 40, ease.linear]])}px`;
    },
  };
}

export function cta() {
  const [start] = SCENES.cta;
  const root = h('div');
  const glow = h('div', { class: 'abs', style: { left: '710px', top: '0', width: '500px', height: '500px', borderRadius: '50%', background: 'conic-gradient(from 210deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #2fb3d6, #feda75)', filter: 'blur(110px)' } });
  const logo = h('img', { class: 'abs', src: '/repo/docs/icon.svg', width: '180', height: '180', style: { left: '870px', top: '160px', borderRadius: '42px', boxShadow: '0 30px 80px -20px rgb(150 40 160 / 0.55)' } });
  const line = caption({ title: ['The tools Instagram’s website', '*leaves out.'], x: 0, y: 420, width: 1920, size: 84 });
  line.el.style.textAlign = 'center';
  const brand = h('div', { class: 'abs', style: { left: '0', right: '0', top: '392px', textAlign: 'center', font: '700 140px/1 var(--display)', letterSpacing: '-0.045em' } }, 'Glassgram');
  const meta = h('div', { class: 'abs', style: { left: '0', right: '0', top: '568px', textAlign: 'center', font: '500 32px/1 var(--text)', color: 'var(--ink-2)', letterSpacing: '0.01em' } }, 'The tools Instagram’s website leaves out.');
  const url = h('div', { class: 'abs', style: { left: '0', right: '0', top: '650px', display: 'flex', justifyContent: 'center' } }, h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '14px', height: '68px', padding: '0 30px 0 24px', borderRadius: '999px', background: 'rgb(255 255 255 / 0.08)', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.18), inset 0 0 0 1px rgb(255 255 255 / 0.08), 0 20px 50px -20px rgb(0 0 0 / 0.8)', font: '600 32px/1 var(--text)', color: 'var(--ink)' }, html: `${GH.replace(/22/g, '30')}github.com/jewdev/glassgram` }));
  const disc = h('div', { class: 'abs', style: { left: '0', right: '0', top: '1000px', textAlign: 'center', font: '400 19px/1.4 var(--text)', color: 'var(--ink-3)' } }, 'Unofficial. Not affiliated with, endorsed by, or sponsored by Instagram or Meta. Instagram is a trademark of Meta Platforms, Inc.');
  root.append(glow, logo, line.el, brand, meta, url, disc);

  return {
    root,
    update(t) {
      const lt = t - start;
      const s = ease.spring(clamp((lt - 0.1) / 1.0));
      style(logo, { opacity: String(clamp(lt / 0.3)), transform: `translateY(${(1 - s) * 30 + kf(t, [[CT.brand - 0.4, 0], [CT.brand + 0.4, 40]])}px) scale(${lerp(0.6, 1, s)})` });
      style(glow, { opacity: String(clamp(lt / 1) * (0.42 + 0.2 * Math.exp(-Math.max(0, t - CT.brand) * 2.5) * (t > CT.brand ? 1 : 0))), transform: `translateY(${kf(t, [[CT.brand - 0.4, 0], [CT.brand + 0.4, 40]])}px) rotate(${lt * 10}deg)` });
      line.update(t, CT.line, CT.brand - 0.55);
      const bp = prog(t, CT.brand, CT.brand + 0.7, ease.outQuart);
      style(brand, { opacity: String(bp), transform: `translateY(${(1 - bp) * 40 + 40}px) scale(${lerp(1.08, 1, bp)})`, filter: `blur(${(1 - bp) * 14}px)`, letterSpacing: `${lerp(-0.02, -0.045, bp)}em` });
      const mp = prog(t, CT.brand + 0.45, CT.brand + 1.05, ease.outQuart);
      style(meta, { opacity: String(mp), transform: `translateY(${(1 - mp) * 20 + 40}px)` });
      const up = prog(t, CT.brand + 0.75, CT.brand + 1.35, ease.outQuart);
      style(url, { opacity: String(up), transform: `translateY(${(1 - up) * 20 + 40}px)` });
      vis(disc, prog(t, CT.brand + 1.2, CT.brand + 1.9));
    },
  };
}
