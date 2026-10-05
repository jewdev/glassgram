import { h, prog, ease, kf, lerp, style, vis, clamp, pointIn } from '../lib.js';
import { SCENES, FE, VI, PR, SE } from '../timeline.js';
import { caption, chips, cursor, ggButton, ggIcon, ggLayer } from '../kit.js';
import { browserWindow, navRail, avatarEl, igIcon, PEOPLE } from '../ig.js';
import { ocean, lake } from '../art.js';
import { homeFeed } from './intro.js';

const P = PEOPLE;
window.PROMO_SETTINGS = {
  feed: { 'declutter.ads': false },
  privacy: {},
  settings: {},
  popup: {},
};

/** The built extension page (dist/), running for real inside an iframe with the chrome.* shim. */
export function extFrame(name, src, w, height) {
  const iframe = h('iframe', { class: 'frame', name, src, width: String(w), height: String(height), style: { width: `${w}px`, height: `${height}px` } });
  const ready = new Promise((ok) => iframe.addEventListener('load', () => setTimeout(ok, 300)));
  return { iframe, ready, doc: () => iframe.contentDocument };
}

/** Flip a real settings switch on the video's clock: knob animates via --p, the checkbox changes at the midpoint. */
function driveSwitch(doc, key, t, t0, from = false) {
  const input = doc?.getElementById(`set-${key}`);
  if (!input) return null;
  const sw = input.parentElement;
  const p = prog(t, t0, t0 + 0.28, ease.out);
  const v = from ? 1 - p : p;
  sw.style.setProperty('--p', String(v));
  sw.style.setProperty('--press', String(clamp(1 - Math.abs(t - t0 - 0.05) / 0.14)));
  const want = from ? p < 0.5 : p >= 0.5;
  if (input.checked !== want) {
    input.checked = want;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return sw;
}

function scrollTo(doc, y) {
  const se = doc?.scrollingElement;
  if (se && Math.abs(se.scrollTop - y) > 0.5) se.scrollTop = y;
}
/** Height the page's sticky bar covers at the top (the narrow settings layout pins its nav). */
const stickyCover = (doc) => {
  const sb = doc?.querySelector('.sidebar');
  if (!sb || doc.defaultView.innerWidth > 860) return 12;
  return parseFloat(doc.defaultView.getComputedStyle(sb).top) + sb.offsetHeight + 14;
};
const secTop = (doc, id) => {
  const el = doc?.getElementById(id);
  return el ? el.getBoundingClientRect().top + doc.scrollingElement.scrollTop : 0;
};

// ======================= Cleaner feed =======================
export function feed() {
  const [start, end] = SCENES.feed;
  const root = h('div');
  const cap = caption({ eyebrow: 'Feed', icon: 'feed', title: 'Your feed. *Your rules.', x: 110, y: 64, width: 1100, size: 70 });
  const home = homeFeed({ w: 1040, h: 800, sponsoredFirst: true });
  style(home.el, { left: '110px', top: '250px' });
  const sw = browserWindow({ w: 640, h: 960, url: 'chrome-extension://glassgram/src/options/index.html', title: 'Glassgram · Settings', favicon: 'gg' });
  style(sw.el, { left: '1190px', top: '60px' });
  const fr = extFrame('feed', '/src/options/index.html', 640, 960 - 84);
  sw.view.append(fr.iframe);
  const cur = cursor(root);
  root.append(cap.el, home.el, sw.el, cur.el);

  const keys = ['declutter.ads', 'declutter.suggested', 'declutter.sidebarSuggestions', 'declutter.storiesTray', 'declutter.reelsTab', 'declutter.exploreTab'];
  const targets = [home.posts.sponsored, home.posts.suggested, home.side, home.tray, home.rail.querySelector('[data-nav=reels]'), home.rail.querySelector('[data-nav=explore]')];
  const flash = targets.map((el) => {
    const f = h('div', { class: 'abs', style: { inset: '0', borderRadius: '8px', background: 'rgb(255 110 110 / 0.16)', boxShadow: 'inset 0 0 0 2px rgb(255 130 120 / 0.9)', pointerEvents: 'none', zIndex: '5' } });
    el.style.position = 'relative';
    el.append(f);
    return f;
  });
  let natural = null;

  return {
    root,
    ready: fr.ready,
    update(t) {
      cap.update(t, start + 0.2);
      const doc = fr.doc();
      scrollTo(doc, secTop(doc, 'feed') - stickyCover(doc));
      natural ??= targets.map((el) => ({ h: el.offsetHeight, w: el.offsetWidth }));
      const switches = keys.map((k, i) => driveSwitch(doc, k, t, FE.toggles[i]));
      targets.forEach((el, i) => {
        const t0 = FE.toggles[i] + 0.12;
        const fl = prog(t, t0, t0 + 0.15) * (1 - prog(t, t0 + 0.35, t0 + 0.55));
        vis(flash[i], fl);
        const c = prog(t, t0 + 0.3, t0 + 0.85, ease.inOut);
        if (el === home.side) {
          style(el, { opacity: String(1 - c), transform: `translateX(${c * 30}px)`, width: `${natural[i].w * (1 - c)}px`, flex: 'none' });
          el.parentElement.style.gap = `${64 * (1 - c)}px`;
        } else if (el.dataset.nav) {
          style(el, { opacity: String(1 - c), height: `${48 * (1 - c)}px`, marginTop: `${-6 * c}px`, transform: `scale(${1 - c * 0.4})` });
        } else {
          style(el, { opacity: String(1 - c), height: c ? `${natural[i].h * (1 - c)}px` : '', marginBottom: c ? `${14 * (1 - c)}px` : '', paddingBottom: c ? `${18 * (1 - c)}px` : '', borderBottomWidth: c > 0.95 ? '0' : '' });
        }
      });
      const path = [[start + 0.3, { x: 1240, y: 900 }]];
      FE.toggles.forEach((t0, i) => {
        const at = () => pointIn(switches[i] ?? sw.view, root, 0.5, 0.55);
        path.push([t0 - 0.12, at], [t0 + 0.25, at]);
      });
      path.push([end + 0.5, { x: 1500, y: 980 }]);
      cur.update(t, { path, clicks: FE.toggles, shapes: [[0, 'hand']], show: [start + 0.3, end + 1] });
      // the feed window leans forward once it's clean
      const z = kf(t, [[start, 1], [FE.toggles[5] + 0.6, 1], [end + 0.3, 1.05]]);
      style(home.el, { transformOrigin: '30% 40%', transform: `scale(${z})` });
    },
  };
}

// ======================= Video controls =======================
export function video() {
  const [start, end] = SCENES.video;
  const root = h('div');
  const cap = caption({ eyebrow: 'Video', icon: 'play', title: ['More', '*control.'], sub: 'Seek, speed, volume and loop on every video and reel. Speed and volume are remembered.', x: 1290, y: 320, width: 520 });
  const win = browserWindow({ w: 1100, h: 840, url: 'instagram.com/reels/DBq2Rt7wN/' });
  style(win.el, { left: '110px', top: '120px' });
  const vh = 840 - 84;
  const ch = vh - 36;
  const cw = Math.round((ch * 9) / 16);
  const cl = Math.round((1100 - 74 - cw) / 2) + 74 - 30;
  const art = h('div', { class: 'abs', style: { inset: '0' } });
  const vid = h('div', { class: 'ig-card', style: { left: `${cl}px`, top: '18px', width: `${cw}px`, height: `${ch}px`, borderRadius: '8px' } }, art);
  const side = h(
    'div',
    { class: 'ig-reel__side', style: { left: `${cl + cw + 22}px`, bottom: '40px' } },
    h('div', { html: igIcon('heart', 28) + '<span>48.2K</span>' }),
    h('div', { html: igIcon('comment', 28) + '<span>612</span>' }),
    h('div', { html: igIcon('share', 26) }),
    h('div', { html: igIcon('save', 26) }),
    h('div', { html: igIcon('more', 26) }),
    avatarEl(P.mara, 30),
  );
  const capt = h('div', { class: 'ig-reel__cap', style: { bottom: '120px' } }, h('div', { class: 'ig-reel__who' }, avatarEl(P.mara, 32), P.mara.user, h('em', {}, 'Follow')), h('div', {}, 'Golden hour on the coast ☀️'));
  vid.append(capt);
  const ig = h('div', { class: 'ig' }, navRail({ active: 'reels' }), h('div', { style: { position: 'absolute', inset: '0' } }, vid, side));
  win.view.append(ig);

  // the real control bar (src/content/features/video-controls.ts)
  const layer = ggLayer(win.view);
  const SPEEDS = ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2', '3'];
  const playBtn = h('button', { class: 'ige-btn ige-btn--sm', type: 'button', html: ggIcon('pause', 16) });
  const time = h('span', { class: 'ige-vbar__time' }, '0:00 / 0:24');
  const seek = h('input', { class: 'ige-range ige-vbar__seek', type: 'range', min: '0', max: '1000', value: '0', step: '1' });
  const speed = h('select', { class: 'ige-vbar__speed' }, ...SPEEDS.map((v) => h('option', { value: v }, `${v}×`)));
  const muteBtn = h('button', { class: 'ige-btn ige-btn--sm', type: 'button', html: ggIcon('volume', 16) });
  const vol = h('input', { class: 'ige-range ige-vbar__vol', type: 'range', min: '0', max: '1', step: '0.05', value: '1' });
  const loopBtn = h('button', { class: 'ige-btn ige-btn--sm is-active', type: 'button', html: ggIcon('loop', 16) });
  const bar = h('div', { class: 'ige-vbar' }, playBtn, time, seek, speed, muteBtn, vol, loopBtn);
  layer.append(bar);
  const tag = (text) => h('div', { class: 'abs', style: { padding: '6px 12px', borderRadius: '999px', background: 'rgb(30 32 44 / 0.85)', boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 0.2), 0 8px 20px rgb(0 0 0 / 0.4)', font: '600 13px/1 var(--text)', color: '#fff', whiteSpace: 'nowrap', zIndex: '9' } }, text);
  const tags = { seek: tag('Seek'), speed: tag('Speed'), vol: tag('Volume'), loop: tag('Loop') };
  Object.values(tags).forEach((el) => layer.append(el));
  const cur = cursor(win.view);
  root.append(cap.el, win.el);

  const D = 24;
  const rateAt = (t) => (t >= VI.speed[1] ? 2 : t >= VI.speed[0] ? 1.5 : 1);
  /** Video position (s): plays at the current rate, jumps while the seek bar is dragged. */
  function videoTime(t) {
    const base = 7;
    if (t < VI.seekFrom) return base + Math.max(0, t - start);
    const atSeek = base + (VI.seekFrom - start);
    const target = 17;
    if (t < VI.seekTo) return lerp(atSeek, target, ease.inOut(clamp((t - VI.seekFrom) / (VI.seekTo - VI.seekFrom))));
    let v = target;
    let t0 = VI.seekTo;
    for (const s of [...VI.speed, Infinity]) {
      const t1 = Math.min(t, s);
      if (t1 > t0) v += (t1 - t0) * rateAt(t0 + 0.0001);
      t0 = Math.max(t0, t1);
      if (t <= s) break;
    }
    return v % D;
  }
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return {
    root,
    update(t) {
      cap.update(t, start + 0.25);
      const vt = videoTime(t);
      art.innerHTML = ocean({ t: vt * 0.8 });
      // bar geometry exactly as video-controls.ts places it over the hovered video
      const r = { left: cl, top: 18, right: cl + cw, bottom: 18 + ch };
      style(bar, { left: `${r.left + 8}px`, width: `${r.right - r.left - 16}px`, top: `${r.bottom - 44}px` });
      vis(bar, prog(t, VI.hover, VI.hover + 0.14));
      time.textContent = `${fmt(vt)} / ${fmt(D)}`;
      seek.value = String(Math.round((vt / D) * 1000));
      speed.value = String(rateAt(t));
      vol.value = String(kf(t, [[VI.volFrom, 1], [VI.volTo, 0.4, ease.inOut]]));
      speed.style.boxShadow = Math.abs(t - VI.speed[0]) < 0.25 || Math.abs(t - VI.speed[1]) < 0.25 ? '0 0 0 2px rgb(255 255 255 / 0.7)' : '';

      const showTag = (el, anchor, a, b) => {
        const p = Math.min(prog(t, a, a + 0.25, ease.outBack), 1 - prog(t, b, b + 0.25));
        const pt = pointIn(anchor, win.view, 0.5, 0);
        vis(el, clamp(p));
        el.style.transform = `translate(calc(${pt.x}px - 50%), ${pt.y - 40 - p * 6}px)`;
        el.style.left = '0';
        el.style.top = '0';
      };
      showTag(tags.seek, seek, VI.seekFrom, VI.seekTo + 0.4);
      showTag(tags.speed, speed, VI.speed[0], VI.speed[1] + 0.35);
      showTag(tags.vol, vol, VI.volFrom, VI.volTo + 0.3);
      showTag(tags.loop, loopBtn, VI.loop, end + 1);

      const seekPt = (f) => () => {
        const a = pointIn(seek, win.view, 0, 0.5);
        const b = pointIn(seek, win.view, 1, 0.5);
        return { x: lerp(a.x, b.x, f), y: a.y };
      };
      const volPt = (f) => () => {
        const a = pointIn(vol, win.view, 0.04, 0.5);
        const b = pointIn(vol, win.view, 0.96, 0.5);
        return { x: lerp(a.x, b.x, f), y: a.y };
      };
      const f0 = (7 + (VI.seekFrom - start)) / D;
      cur.update(t, {
        path: [
          [start + 0.3, { x: 820, y: 560 }],
          [VI.hover, { x: cl + cw * 0.6, y: 520 }],
          [VI.seekFrom - 0.05, seekPt(f0)],
          [VI.seekFrom + 0.05, seekPt(f0)],
          [VI.seekTo, seekPt(17 / D)],
          [VI.speed[0] - 0.1, () => pointIn(speed, win.view, 0.5, 0.55)],
          [VI.speed[1] + 0.2, () => pointIn(speed, win.view, 0.5, 0.55)],
          [VI.volFrom, volPt(1)],
          [VI.volTo, volPt(0.4)],
          [VI.loop - 0.05, () => pointIn(loopBtn, win.view, 0.5, 0.55)],
        ],
        clicks: [VI.seekFrom, ...VI.speed, VI.volFrom],
        shapes: [[0, 'arrow'], [VI.seekFrom - 0.2, 'hand']],
        show: [start + 0.3, end + 1],
      });
      // camera: push in on the bar so its 12px labels read at 1080p
      const z = kf(t, [[start, 1], [VI.hover, 1.0], [VI.seekFrom, 1.5], [end + 0.5, 1.56, ease.linear]]);
      style(win.view.firstElementChild, { transformOrigin: `${cl + cw / 2}px ${18 + ch - 30}px`, transform: `scale(${z})` });
      style(layer, { transformOrigin: `${cl + cw / 2}px ${18 + ch - 30}px`, transform: `scale(${z})` });
    },
  };
}

// ======================= Links + privacy =======================
export function privacy() {
  const [start, end] = SCENES.privacy;
  const root = h('div');
  const capA = caption({ eyebrow: 'Links', icon: 'link', title: ['Cleaner', '*links.'], sub: '“Copy link” drops utm_source, igsh and other tracking. Outbound links skip the l.instagram.com redirect.', x: 130, y: 300, width: 540 });
  const capB = caption({ eyebrow: 'Privacy', icon: 'shield', title: ['Privacy', '*first.'], sub: 'Block Instagram’s analytics requests. View stories without showing up in the viewer list — off until you turn it on.', x: 130, y: 300, width: 540 });

  // Instagram's own post-options menu, with "Copy link"
  const items = ['Report', 'Unfollow', 'Add to favourites', 'Go to post', 'Share to…', 'Copy link', 'Embed', 'About this account', 'Cancel'];
  const menu = h('div', { class: 'abs', style: { left: '960px', top: '150px', width: '400px', borderRadius: '14px', background: '#262626', overflow: 'hidden', font: '14px/1 -apple-system, "Segoe UI", sans-serif', color: '#f5f5f5', boxShadow: '0 40px 90px -30px rgb(0 0 0 / 0.9)' } }, ...items.map((txt, i) => h('div', { style: { height: '48px', display: 'grid', placeItems: 'center', borderTop: i ? '1px solid #363636' : '0', color: i < 2 ? '#ed4956' : '', fontWeight: i < 2 ? '700' : '400' } }, txt)));
  const copyRow = menu.children[5];
  const DIRTY = '?utm_source=ig_web_copy_link&igsh=MzRlODBiNWFlZA==';
  const clean = h('span', {}, 'https://www.instagram.com/p/DAx7Lm2pQ/');
  const dirty = h('span', { style: { display: 'inline-block', whiteSpace: 'nowrap', overflow: 'hidden', verticalAlign: 'bottom', borderRadius: '6px' } }, DIRTY);
  const url = h('div', { style: { font: '500 21px/1.5 Consolas, "Cascadia Mono", ui-monospace, monospace', color: '#e9ecf5', whiteSpace: 'nowrap', letterSpacing: '0' } }, clean, dirty);
  const okBadge = h('div', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '18px', padding: '8px 14px', borderRadius: '999px', background: 'rgb(94 227 154 / 0.14)', color: 'var(--ok)', font: '600 17px/1 var(--text)' }, html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>Tracking removed' });
  const clip = h('div', { class: 'panel', style: { left: '720px', top: '640px', padding: '26px 30px', width: '1100px' } }, h('div', { style: { font: '600 15px/1 var(--text)', color: 'var(--ink-3)', marginBottom: '14px', letterSpacing: '0.02em' } }, 'CLIPBOARD'), url, okBadge);
  const curA = cursor(root);

  const win = browserWindow({ w: 1060, h: 880, url: 'chrome-extension://glassgram/src/options/index.html', title: 'Glassgram · Settings', favicon: 'gg' });
  style(win.el, { left: '760px', top: '110px' });
  const fr = extFrame('privacy', '/src/options/index.html', 1060, 880 - 84);
  win.view.append(fr.iframe);
  const curB = cursor(win.view);
  const partA = h('div', { class: 'abs', style: { inset: '0' } }, capA.el, menu, clip, curA.el);
  const partB = h('div', { class: 'abs', style: { inset: '0' } }, capB.el, win.el);
  root.append(partA, partB);

  return {
    root,
    ready: fr.ready,
    update(t) {
      // part A: copy link → tracking stripped
      const aOut = prog(t, PR.cut - 0.25, PR.cut + 0.25);
      style(partA, { opacity: String(1 - aOut), transform: `translateX(${-aOut * 60}px)`, display: aOut >= 1 ? 'none' : '' });
      if (aOut < 1) {
        capA.update(t, start + 0.25);
        const mp = prog(t, start + 0.35, start + 0.75, ease.outQuart) * (1 - prog(t, PR.copy + 0.25, PR.copy + 0.55));
        style(menu, { opacity: String(mp), transform: `scale(${lerp(1.06, 1, mp)})` });
        copyRow.style.background = t > PR.copy - 0.35 && t < PR.copy + 0.3 ? '#363636' : '';
        const cp = prog(t, PR.copy + 0.2, PR.copy + 0.7, ease.outQuart);
        style(clip, { opacity: String(cp), transform: `translateY(${lerp(30, -210, prog(t, PR.copy + 0.35, PR.copy + 1.0, ease.inOut))}px)` });
        const red = prog(t, PR.clean - 0.4, PR.clean - 0.2);
        style(dirty, { background: `rgb(255 90 90 / ${0.22 * red})`, color: red > 0 ? `color-mix(in srgb, #ff8a7a ${red * 100}%, #e9ecf5)` : '', textDecoration: red > 0.5 ? 'line-through' : 'none' });
        const shrink = prog(t, PR.clean, PR.clean + 0.5, ease.inOut);
        dirty.style.maxWidth = `${(1 - shrink) * 900}px`;
        dirty.style.opacity = String(1 - shrink);
        const ok = prog(t, PR.clean + 0.45, PR.clean + 0.8, ease.outBack);
        style(okBadge, { opacity: String(clamp(ok)), transform: `scale(${lerp(0.8, 1, ok)})` });
        curA.update(t, {
          path: [[start + 0.4, { x: 1300, y: 900 }], [PR.copy - 0.15, () => pointIn(copyRow, root, 0.5, 0.55)], [PR.copy + 0.6, () => pointIn(copyRow, root, 0.62, 0.7)]],
          clicks: [PR.copy],
          shapes: [[0, 'hand']],
          show: [start + 0.4, PR.copy + 0.6],
        });
      }
      // part B: the real privacy settings
      const bIn = prog(t, PR.cut - 0.1, PR.cut + 0.45, ease.outQuart);
      style(partB, { opacity: String(bIn), transform: `translateX(${(1 - bIn) * 60}px)`, display: bIn <= 0 ? 'none' : '' });
      if (bIn > 0) {
        capB.update(t, PR.cut);
        const doc = fr.doc();
        scrollTo(doc, secTop(doc, 'privacy') - 12);
        const swEl = driveSwitch(doc, 'privacy.anonStories', t, PR.toggle);
        curB.update(t, {
          path: [[PR.cut + 0.2, { x: 700, y: 640 }], [PR.toggle - 0.12, () => pointIn(swEl ?? win.view, win.view, 0.5, 0.55)], [end + 0.5, () => pointIn(swEl ?? win.view, win.view, 0.3, 1.6)]],
          clicks: [PR.toggle],
          shapes: [[0, 'hand']],
          show: [PR.cut + 0.2, end + 1],
        });
      }
    },
  };
}

// ======================= Settings showcase =======================
export function settings() {
  const [start, end] = SCENES.settings;
  const root = h('div');
  const capA = caption({ title: 'You choose what *Glassgram does.', x: 0, y: 58, width: 1920, size: 64 });
  const capB = caption({ title: 'Every feature has a *switch.', x: 0, y: 58, width: 1920, size: 64 });
  capA.el.style.textAlign = capB.el.style.textAlign = 'center';
  const win = browserWindow({ w: 1500, h: 860, url: 'chrome-extension://glassgram/src/options/index.html', title: 'Glassgram · Settings', favicon: 'gg' });
  style(win.el, { left: '210px', top: '190px' });
  const fr = extFrame('settings', '/src/options/index.html', 1500, 860 - 84);
  win.view.append(fr.iframe);
  // the toolbar popup, anchored under the Glassgram icon like Chromium's extension popups
  const pop = extFrame('popup', '/src/popup/index.html', 384, 620);
  const popWrap = h('div', { class: 'abs', style: { left: '1312px', top: '268px', width: '384px', height: '620px', borderRadius: '12px', overflow: 'hidden', background: '#080a12', boxShadow: '0 30px 70px -10px rgb(0 0 0 / 0.75), 0 0 0 1px rgb(255 255 255 / 0.1)' } }, pop.iframe);
  pop.iframe.style.position = 'static';
  const cur = cursor(root);
  root.append(capA.el, capB.el, win.el, popWrap, cur.el);

  return {
    root,
    ready: Promise.all([fr.ready, pop.ready]),
    update(t) {
      capA.update(t, start + 0.15, SE.swap - 0.45);
      capB.update(t, SE.swap);
      const doc = fr.doc();
      const max = doc ? doc.scrollingElement.scrollHeight - doc.scrollingElement.clientHeight : 0;
      scrollTo(doc, kf(t, [[start + 0.4, 0], [SE.popup + 0.2, max * 0.92, ease.inOut]]));
      const pp = prog(t, SE.popup, SE.popup + 0.3, ease.outQuart);
      style(popWrap, { opacity: String(pp), transform: `translateY(${(1 - pp) * -10}px) scale(${lerp(0.96, 1, pp)})`, transformOrigin: '90% 0', visibility: pp ? 'visible' : 'hidden' });
      const pdoc = pop.doc();
      if (pdoc) {
        pdoc.documentElement.style.background = '#080a12';
        // height of the real popup content, so the frame hugs it
        const hgt = pdoc.body.scrollHeight;
        if (hgt && Math.abs(popWrap.offsetHeight - hgt) > 1) {
          popWrap.style.height = `${hgt}px`;
          pop.iframe.style.height = `${hgt}px`;
        }
      }
      const swEl = driveSwitch(pdoc, 'feed.followingOnly', t, SE.popupToggle);
      const icon = win.el.querySelector('.win__gg');
      cur.update(t, {
        path: [
          [start + 0.5, { x: 1400, y: 980 }],
          [SE.popup - 0.12, () => pointIn(icon, root)],
          [SE.popup + 0.3, () => pointIn(icon, root)],
          [SE.popupToggle - 0.12, () => pointIn(swEl ?? popWrap, root, 0.5, 0.55)],
          [end + 0.5, () => pointIn(swEl ?? popWrap, root, 0.2, 1.8)],
        ],
        clicks: [SE.popup - 0.05, SE.popupToggle],
        shapes: [[0, 'arrow'], [SE.popup - 0.3, 'hand']],
        show: [start + 0.5, end + 1],
      });
    },
  };
}
