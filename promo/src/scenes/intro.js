import { h, prog, ease, kf, lerp, style, vis, clamp } from '../lib.js';
import { SCENES } from '../timeline.js';
import { caption } from '../kit.js';
import { browserWindow, navRail, storiesTray, post, sidebar, PEOPLE } from '../ig.js';
import { lake, city, cafe, toUrl } from '../art.js';

/** A full Instagram home feed in a browser window (also reused by the feed scene). */
export function homeFeed({ w, h: height, sponsoredFirst = true }) {
  const win = browserWindow({ w, h: height, url: 'instagram.com' });
  const P = PEOPLE;
  const posts = {
    sponsored: post({ who: P.brand, media: cafe(), sponsored: true, cta: 'Shop now', likes: '1,204', caption: 'Slow mornings, better sound.', comments: 0 }),
    suggested: post({ who: P.fern, media: lake({ seed: 4, sky: ['#14324a', '#3d7a8c', '#b9d6c8', '#f3e6c2'] }), suggested: true, likes: '8,930', caption: 'Fog season is here.', comments: 112 }),
    nora: post({ who: P.nora, media: lake({ seed: 7 }), dots: 4, likes: '2,481', caption: 'Blue hour above the lake.' }),
    luca: post({ who: P.luca, media: city(), ratio: 0.8, ago: '5h', likes: '934', caption: 'Lisbon after dark.' }),
  };
  const tray = storiesTray([P.nora, P.luca, P.kalma, P.juno, P.dunes, P.fern, P.ivo, P.mara]);
  const feed = h('div', { class: 'ig-feed' }, tray, ...(sponsoredFirst ? [posts.sponsored, posts.suggested, posts.nora, posts.luca] : [posts.nora, posts.sponsored, posts.luca, posts.suggested]));
  const side = sidebar([P.ivo, P.mara, P.dunes, P.juno, P.kalma]);
  const rail = navRail();
  const ig = h('div', { class: 'ig' }, rail, h('div', { class: 'ig-main' }, feed, side));
  win.view.append(ig);
  return { ...win, feed, side, tray, rail, posts };
}

export function problem() {
  const [, end] = SCENES.problem;
  const root = h('div');
  const home = homeFeed({ w: 1500, h: 900, sponsoredFirst: false });
  style(home.el, { left: '210px', top: '90px' });
  const dim = h('div', { class: 'abs', style: { inset: '0', background: 'radial-gradient(ellipse 70% 60% at 50% 50%, rgb(5 6 11 / 0.82), rgb(5 6 11 / 0.55))' } });
  const head = h('h1', { class: 'abs', style: { left: '0', right: '0', top: '380px', margin: '0', textAlign: 'center', font: '680 76px/1.05 var(--display)', letterSpacing: '-0.035em' } });
  const words = "Instagram's website leaves a lot out.".split(' ').map((w, i) => h('span', { style: { display: 'inline-block', whiteSpace: 'pre' } }, (i ? ' ' : '') + w));
  head.append(...words);
  const gaps = ['No download button', 'No seek or speed controls', 'Ads and suggestions in your feed', 'Tracking in copied links'];
  const X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ff8a7a" stroke-width="2.4" stroke-linecap="round"><path d="M17 7 7 17M7 7l10 10"/></svg>';
  const row = h('div', { class: 'abs', style: { left: '0', right: '0', top: '520px', display: 'flex', justifyContent: 'center', gap: '14px' } }, ...gaps.map((g) => h('span', { class: 'chip', html: `${X}${g}` })));
  root.append(home.el, dim, head, row);

  return {
    root,
    update(t) {
      // slow camera push and a gentle scroll of the feed
      const push = kf(t, [[0, 1.0], [end, 1.06, ease.linear]]);
      const blur = prog(t, 0.9, 1.8) * 7;
      style(home.el, { transform: `scale(${push})`, filter: blur ? `blur(${blur}px) saturate(${1 - prog(t, 0.9, 1.8) * 0.35})` : 'none' });
      home.feed.style.transform = `translateY(${-kf(t, [[0, 0], [end, 420, ease.linear]])}px)`;
      vis(dim, prog(t, 0.9, 1.8));
      words.forEach((w, i) => {
        const p = prog(t, 1.05 + i * 0.08, 1.8 + i * 0.08, ease.outQuart);
        style(w, { opacity: String(p), transform: `translateY(${(1 - p) * 30}px)`, filter: `blur(${(1 - p) * 10}px)` });
      });
      [...row.children].forEach((c, i) => {
        const p = prog(t, 2.6 + i * 0.32, 3.1 + i * 0.32, ease.outBack);
        style(c, { opacity: String(clamp(p)), transform: `translateY(${(1 - p) * 18}px) scale(${lerp(0.9, 1, p)})` });
      });
    },
  };
}

export function hero() {
  const [start, end] = SCENES.hero;
  const root = h('div');
  const glow = h('div', { class: 'abs', style: { left: '660px', top: '90px', width: '600px', height: '600px', borderRadius: '50%', background: 'conic-gradient(from 210deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #2fb3d6, #feda75)', filter: 'blur(120px)' } });
  const ripple = h('div', { class: 'abs', style: { left: '960px', top: '390px', width: '0', height: '0' } }, h('i', { style: { position: 'absolute', left: '-130px', top: '-130px', width: '260px', height: '260px', borderRadius: '30%', border: '2px solid rgb(255 255 255 / 0.5)' } }));
  const logoBox = h('div', { class: 'abs', style: { left: '845px', top: '275px', width: '230px', height: '230px', borderRadius: '54px', overflow: 'hidden', boxShadow: '0 40px 90px -20px rgb(150 40 160 / 0.55), 0 0 0 1px rgb(255 255 255 / 0.12)' } });
  const logo = h('img', { src: '/repo/docs/icon.svg', width: '230', height: '230', style: { display: 'block' } });
  const sheen = h('div', { class: 'abs', style: { top: '-50%', left: '-60%', width: '50%', height: '200%', background: 'linear-gradient(90deg, transparent, rgb(255 255 255 / 0.55), transparent)', transform: 'rotate(20deg)' } });
  logoBox.append(logo, sheen);
  const title = caption({ title: 'Meet *Glassgram.', x: 0, y: 560, width: 1920, size: 108 });
  title.el.style.textAlign = 'center';
  const tag = h('p', { class: 'abs', style: { left: '0', right: '0', top: '712px', margin: '0', textAlign: 'center', font: '500 40px/1.2 var(--display)', color: 'var(--ink-2)', letterSpacing: '-0.015em' } }, "The tools Instagram's website leaves out.");
  root.append(glow, ripple, logoBox, title.el, tag);

  return {
    root,
    update(t) {
      const lt = t - start;
      const s = ease.spring(clamp((lt - 0.15) / 1.1));
      style(logoBox, { opacity: String(clamp((lt - 0.1) / 0.3)), transform: `translateY(${(1 - s) * 40}px) scale(${lerp(0.55, 1, s)}) rotate(${(1 - s) * -10}deg)` });
      const breathe = 1 + 0.04 * Math.sin(lt * 1.6);
      style(glow, { opacity: String(clamp((lt - 0.2) / 0.8) * (0.45 + 0.25 * Math.exp(-Math.max(0, lt - 0.5) * 2))), transform: `scale(${breathe}) rotate(${lt * 8}deg)` });
      const r = prog(t, 6.0, 7.1, ease.out);
      const ri = ripple.firstChild;
      style(ri, { opacity: String(t < 6.0 ? 0 : (1 - r) * 0.7), transform: `scale(${1 + r * 1.6})` });
      sheen.style.transform = `translateX(${kf(t, [[6.1, 0], [7.0, 520, ease.inOut]])}px) rotate(20deg)`;
      title.update(t, start + 0.95);
      const tp = prog(t, start + 2.4, start + 3.2, ease.outQuart);
      style(tag, { opacity: String(tp), transform: `translateY(${(1 - tp) * 24}px)`, filter: `blur(${(1 - tp) * 8}px)` });
      // gentle drift up as the scene ends
      root.style.translate = `0 ${-prog(t, end - 1.2, end + 0.3, ease.in) * 30}px`;
    },
  };
}
