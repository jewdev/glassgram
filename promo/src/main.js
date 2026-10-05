// Boots the composition and exposes window.seek(t) for the renderer.
import { SCENES, DURATION, XFADE, FPS } from './timeline.js';
import { h, prog, ease, style } from './lib.js';
import { loadGlassgramAssets } from './kit.js';
import { problem, hero } from './scenes/intro.js';
import { download, avatarScene, story, follow } from './scenes/media.js';
import { feed, video, privacy, settings } from './scenes/controls.js';
import { local, cta } from './scenes/outro.js';

await loadGlassgramAssets();
const stage = document.getElementById('stage');

// ---------------- background light field ----------------
const pools = ['a', 'b', 'c'].map((k) => h('span', { class: `bg__pool bg__pool--${k}` }));
const bg = h('div', { class: 'bg' }, ...pools, h('div', { class: 'bg__lattice' }), h('div', { class: 'bg__vignette' }));
stage.append(bg);
function updateBg(t) {
  const heroBoost = Math.max(prog(t, SCENES.hero[0] - 0.3, SCENES.hero[0] + 0.8) - prog(t, SCENES.hero[1] - 0.5, SCENES.hero[1] + 0.5), prog(t, SCENES.cta[0] - 0.3, SCENES.cta[0] + 1));
  const o = 0.55 + 0.45 * heroBoost;
  style(pools[0], { opacity: String(o), transform: `translate(${-300 + Math.sin(t * 0.21) * 120}px, ${-420 + Math.cos(t * 0.17) * 80}px)` });
  style(pools[1], { opacity: String(o), transform: `translate(${1300 + Math.cos(t * 0.19) * 140}px, ${300 + Math.sin(t * 0.23) * 100}px)` });
  style(pools[2], { opacity: String(o * 0.9), transform: `translate(${600 + Math.sin(t * 0.15) * 200}px, ${700 + Math.cos(t * 0.2) * 60}px)` });
}

// ---------------- scenes ----------------
const makers = { problem, hero, download, avatar: avatarScene, story, follow, feed, video, privacy, settings, local, cta };
const scenes = Object.entries(makers).map(([key, make]) => {
  const s = make();
  s.key = key;
  s.range = SCENES[key];
  s.root.classList.add('scene');
  s.root.dataset.scene = key;
  stage.append(s.root);
  return s;
});

const params = new URLSearchParams(location.search);
await Promise.all(scenes.map((s) => s.ready).filter(Boolean));
await document.fonts.ready;

let lastT = -1;
function apply(t) {
  updateBg(t);
  for (const s of scenes) {
    const [a, b] = s.range;
    const active = t >= a - XFADE / 2 && t <= b + XFADE / 2;
    s.root.style.display = active ? 'block' : 'none';
    if (!active) continue;
    const p = a <= 0 ? 1 : prog(t, a - XFADE / 2, a + XFADE / 2, ease.inOut);
    const q = b >= DURATION ? 0 : prog(t, b - XFADE / 2, b + XFADE / 2, ease.inOut);
    const blur = (1 - p) * 14 + q * 14;
    style(s.root, { opacity: String(p * (1 - q)), transform: `scale(${(1 + 0.045 * (1 - p)) * (1 - 0.035 * q)})`, filter: blur > 0.05 ? `blur(${blur}px)` : 'none' });
    s.update(t);
  }
  lastT = t;
}

const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/** Render the composition at time t (seconds) and resolve once it has painted. */
window.seek = async (t) => {
  apply(t);
  // iframes (the real settings page) react to their switches asynchronously; let them settle.
  await frame();
  apply(t);
  await frame();
};
window.DURATION = DURATION;
window.FPS = FPS;

// ---------------- preview mode (open in a normal browser) ----------------
if (!params.has('render')) {
  document.documentElement.classList.add('preview');
  const fit = () => (stage.style.transform = `scale(${Math.min(innerWidth / 1920, innerHeight / 1080)})`);
  addEventListener('resize', fit);
  fit();
  let t0 = Number(params.get('t') || 0);
  if (params.has('play')) {
    const begin = performance.now() - t0 * 1000;
    const loop = () => {
      apply(((performance.now() - begin) / 1000) % DURATION);
      requestAnimationFrame(loop);
    };
    loop();
  } else {
    await window.seek(t0);
    addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 1 : 1 / FPS;
      if (e.key === 'ArrowRight') window.seek((t0 = Math.min(DURATION, t0 + step)));
      if (e.key === 'ArrowLeft') window.seek((t0 = Math.max(0, t0 - step)));
    });
  }
}
window.promoReady = true;
void lastT;
