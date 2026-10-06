import { h, prog, ease, kf, lerp, style, vis, clamp, pointIn } from '../lib.js';
import { SCENES, DL, AV, ST, FO } from '../timeline.js';
import { caption, chips, cursor, ggButton, ggIcon, ggLayer, growIn } from '../kit.js';
import { browserWindow, navRail, avatarEl, igIcon, profileHeader, PEOPLE } from '../ig.js';
import { lake, city, dunes, forest, cafe, ocean, toUrl } from '../art.js';

const P = PEOPLE;
/** Feature scenes share one framing: caption on one side, the browser on the other. */
export const WIN = { w: 1100, h: 840, left: 720, top: 120 };

/** Toolbar placement exactly as media-toolbar.ts computes it (top/right offsets from the hovered rect). */
function placeToolbar(bar, rect, viewW, isStory = false) {
  style(bar, { top: `${Math.max(8, rect.top + (isStory ? 64 : 8))}px`, right: `${Math.max(8, viewW - rect.right + 8)}px` });
}
export const rectIn = (el, space) => {
  const a = pointIn(el, space, 0, 0);
  const b = pointIn(el, space, 1, 1);
  return { left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y };
};
export function toastEl(layer) {
  const stack = h('div', { class: 'ige-toasts' });
  layer.append(stack);
  return {
    /** list of [t0, t1, text, kind] */
    update(t, items) {
      stack.replaceChildren();
      for (const [a, b, text, kind] of items) {
        if (t < a || t > b + 0.2) continue;
        const p = Math.min(prog(t, a, a + 0.18), 1 - prog(t, b, b + 0.2));
        const el = h('div', { class: `ige-toast ige-toast--${kind}` }, text);
        style(el, { opacity: String(p), transform: `translateY(${(1 - p) * 8}px) scale(${lerp(0.97, 1, p)})` });
        stack.append(el);
      }
    },
  };
}

// ======================= Download =======================
export function download() {
  const [start, end] = SCENES.download;
  const root = h('div');
  const cap = caption({ eyebrow: 'Downloads', icon: 'download', title: ['Download', '*anything.'], sub: 'Full resolution, one click. Carousels and story trays go into a single ZIP.', x: 130, y: 300, width: 500 });
  const kinds = chips(['Photos', 'Videos', 'Reels', 'Stories', 'Carousels']);
  cap.el.append(kinds.el);

  const win = browserWindow({ ...WIN, url: 'instagram.com/p/DAx7Lm2pQ/' });
  style(win.el, { left: `${WIN.left}px`, top: `${WIN.top}px` });
  // post page: media on the left, comments on the right
  const media = h('div', { class: 'ig-post__media', style: { position: 'relative', width: '620px', height: '620px', border: '1px solid #262626', borderRadius: '4px 0 0 4px' }, html: lake({ seed: 7 }) });
  media.append(h('div', { class: 'ig-post__dots' }, ...[0, 1, 2, 3].map((i) => h('i', { class: i ? '' : 'is-on' }))));
  media.append(h('span', { class: 'ig-sv__arrow', style: { right: '12px', left: 'auto' }, html: igIcon('chevR', 18) }));
  const comments = [
    [P.luca, 'This light is unreal.', '1h'],
    [P.mara, 'Saving this for our trip!', '1h'],
    [P.ivo, 'Which lake is this?', '52m'],
    [P.juno, 'Frame-worthy.', '40m'],
  ];
  const right = h(
    'div',
    { style: { width: '380px', height: '620px', border: '1px solid #262626', borderLeft: '0', display: 'flex', flexDirection: 'column', borderRadius: '0 4px 4px 0' } },
    h('div', { class: 'ig-post__head', style: { padding: '14px 16px', borderBottom: '1px solid #262626' } }, avatarEl(P.nora, 32, true), h('div', { class: 'ig-post__who' }, h('b', {}, P.nora.user), h('span', { class: 'ig-follow' }, ' • Follow')), h('span', { html: igIcon('more', 22) })),
    h(
      'div',
      { style: { flex: '1', padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' } },
      h('div', { style: { display: 'flex', gap: '12px' } }, avatarEl(P.nora, 32), h('div', {}, h('b', {}, P.nora.user), ' Blue hour above the lake. 4 frames from last night.')),
      ...comments.map(([p, txt, ago]) => h('div', { style: { display: 'flex', gap: '12px' } }, avatarEl(p, 32), h('div', {}, h('b', {}, p.user), ` ${txt}`, h('div', { style: { color: '#a8a8a8', fontSize: '12px', marginTop: '4px' } }, `${ago}  Reply`)))),
    ),
    h('div', { class: 'ig-post__actions', style: { padding: '10px 16px 6px', borderTop: '1px solid #262626' } }, h('span', { html: igIcon('heart', 24) }), h('span', { html: igIcon('comment', 24) }), h('span', { html: igIcon('share', 24) }), h('span', { class: 'ig-push', html: igIcon('save', 24) })),
    h('div', { class: 'ig-post__likes', style: { padding: '0 16px 4px' } }, '2,481 likes'),
    h('div', { style: { padding: '0 16px 16px', color: '#a8a8a8', fontSize: '12px' } }, '2 hours ago'),
  );
  const ig = h('div', { class: 'ig' }, navRail({ active: '' }), h('div', { style: { flex: '1', display: 'flex', justifyContent: 'center', alignItems: 'center' } }, media, right));
  win.view.append(ig);

  const layer = ggLayer(win.view);
  const all = ggButton('downloadAll', 'Download all items');
  const dl = ggButton('download', 'Download this media');
  const link = ggButton('link', 'Copy media URL');
  const capBtn = ggButton('caption', 'Copy caption');
  const bar = h('div', { class: 'ige-toolbar', role: 'toolbar' }, all, dl, link, capBtn);
  layer.append(bar);
  const toasts = toastEl(layer);
  const thumb = toUrl(lake({ seed: 7, w: 200, h: 200 }));
  const bubble = h(
    'div',
    { class: 'dlb' },
    h('div', { class: 'dlb__title' }, 'Recent download history'),
    h('div', { class: 'dlb__row', 'data-row': 'zip' }, h('span', { class: 'dlb__file' }, 'ZIP'), h('div', {}, h('div', { class: 'dlb__name' }, 'nora.travels_DAx7Lm2pQ.zip'), h('div', { class: 'dlb__meta' }, '4 files • 7.6 MB • Done'))),
    h('div', { class: 'dlb__row', 'data-row': 'one' }, h('span', { class: 'dlb__file' }, h('img', { src: thumb })), h('div', {}, h('div', { class: 'dlb__name' }, 'nora.travels_2026-10-03_DAx7Lm2pQ_1.jpg'), h('div', { class: 'dlb__meta' }, '1080 × 1350 • 1.9 MB • Done'))),
  );
  win.el.append(bubble);
  const cur = cursor(win.view);
  root.append(cap.el, win.el);

  return {
    root,
    update(t) {
      cap.update(t, start + 0.25);
      kinds.update(t, DL.chips);
      const vw = win.view.offsetWidth;
      // camera: lean into the toolbar while it is used
      const z = kf(t, [[start, 1], [DL.hover, 1], [DL.hover + 0.9, 1.1], [DL.zipDone + 0.2, 1.1], [DL.zipDone + 1.1, 1]]);
      style(win.el, { transformOrigin: '85% 20%', transform: `scale(${z})` });

      const hovered = t >= DL.hover;
      vis(bar, prog(t, DL.hover, DL.hover + 0.14));
      bar.style.transform = `translateY(${hovered ? -4 * (1 - prog(t, DL.hover, DL.hover + 0.14)) : -4}px)`;
      growIn(all, prog(t, DL.allReveal, DL.allReveal + 0.18, ease.linear));
      placeToolbar(bar, rectIn(media, win.view), vw);
      [dl, all].forEach((b) => (b.style.background = ''));
      if (t > DL.click1 - 0.3 && t < DL.click1 + 0.35) dl.style.background = 'rgb(255 255 255 / 0.22)';
      if (t > DL.click2 - 0.3 && t < DL.click2 + 0.35) all.style.background = 'rgb(255 255 255 / 0.22)';
      dl.style.transform = `scale(${1 - 0.06 * clamp(1 - Math.abs(t - DL.click1) / 0.08)})`;
      all.style.transform = `scale(${1 - 0.06 * clamp(1 - Math.abs(t - DL.click2) / 0.08)})`;

      toasts.update(t, [
        [DL.click1 + 0.05, DL.click1 + 1.6, 'Downloading 1 file…', 'info'],
        [DL.click2 + 0.05, DL.zipDone - 0.05, 'Zipping 4 files…', 'info'],
        [DL.zipDone, DL.zipDone + 1.9, 'Saved ZIP with 4 files', 'success'],
      ]);

      // Chromium's download icon + bubble
      win.dl.hidden = t < DL.panel - 0.1;
      const ring = win.dl.querySelector('.win__dlring');
      const rp = Math.max(prog(t, DL.panel - 0.1, DL.panel + 0.5), 0);
      style(ring, { opacity: String(t > DL.panel - 0.1 && rp < 1 ? 1 - rp : 0), transform: `scale(${1 + rp * 0.4})` });
      const bp = Math.min(prog(t, DL.panel, DL.panel + 0.3, ease.outQuart), 1 - prog(t, end - 1.3, end - 1.0));
      vis(bubble, bp);
      bubble.style.transform = `translateY(${(1 - bp) * -10}px) scale(${lerp(0.97, 1, bp)})`;
      const zipRow = bubble.querySelector('[data-row=zip]');
      const zp = prog(t, DL.zipDone, DL.zipDone + 0.35, ease.outQuart);
      style(zipRow, { display: t < DL.zipDone ? 'none' : 'flex', opacity: String(zp), transform: `translateY(${(1 - zp) * -8}px)` });

      const pDl = () => pointIn(dl, win.view, 0.55, 0.6);
      const pAll = () => pointIn(all, win.view, 0.55, 0.6);
      cur.update(t, {
        path: [
          [start + 0.3, { x: 260, y: 720 }],
          [DL.hover, { x: 470, y: 380 }],
          [DL.click1 - 0.25, pDl],
          [DL.click2 - 0.45, pDl],
          [DL.click2 - 0.1, pAll],
          [DL.zipDone + 0.6, pAll],
          [DL.zipDone + 1.4, { x: 560, y: 470 }],
        ],
        clicks: [DL.click1, DL.click2],
        shapes: [[0, 'arrow'], [DL.click1 - 0.3, 'hand'], [DL.zipDone + 0.8, 'arrow']],
        show: [start + 0.3, end + 1],
      });
    },
  };
}

// ======================= HD profile picture =======================
export function profilePage(person, opts = {}) {
  const grid = h('div', { class: 'ig-grid' }, ...[lake({ seed: 7, w: 600, h: 800 }), dunes({ w: 600, h: 800 }), forest({ w: 600, h: 800 }), city({ w: 600, h: 800, seed: 9 }), lake({ seed: 21, w: 600, h: 800, sky: ['#0f2a4a', '#3c6e9a', '#9cc9d9', '#f5e6c8'] }), cafe({ w: 600, h: 800 })].map((s) => h('div', { html: s })));
  const highlights = h('div', { style: { display: 'flex', gap: '40px', padding: '0 0 30px 60px' } }, ...['Alps', 'Norway', 'Iceland', 'Lisbon'].map((n, i) => h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', fontSize: '12px', fontWeight: '600' } }, h('span', { style: { padding: '3px', borderRadius: '50%', border: '1px solid #363636' }, html: `<img src="${toUrl(i % 2 ? dunes({ w: 160, h: 160, seed: i }) : lake({ seed: i + 30, w: 160, h: 160 }))}" style="width:70px;height:70px;border-radius:50%;display:block;object-fit:cover">` }), n)));
  const header = profileHeader(person, opts);
  const page = h('div', { style: { flex: '1', overflow: 'hidden', padding: '10px 50px 0' } }, header, highlights, h('div', { class: 'ig-tabs' }, h('span', { class: 'is-on' }, 'POSTS'), h('span', {}, 'REELS'), h('span', {}, 'TAGGED')), grid);
  return { ig: h('div', { class: 'ig' }, navRail({ active: '' }), page), header, page };
}

export function avatarScene() {
  const [start, end] = SCENES.avatar;
  const root = h('div');
  const cap = caption({ eyebrow: 'Profiles', icon: 'eye', title: ['HD profile', '*pictures.'], sub: 'Hover a profile picture to open it full size. Zoom with the wheel, drag to pan, download.', x: 1290, y: 330, width: 520 });
  const win = browserWindow({ ...WIN, url: `instagram.com/${P.nora.user}/` });
  style(win.el, { left: '110px', top: `${WIN.top}px` });
  const prof = profilePage(P.nora, { bio: ['Landscapes, mostly at the edges of the day.', 'Alps · Norway · Iceland'] });
  win.view.append(prof.ig);
  const pic = prof.header.querySelector('.ig-ring');

  const layer = ggLayer(win.view);
  const zoomBtn = ggButton('zoom', 'View HD profile picture');
  const dlBtn = ggButton('download', 'Download HD profile picture');
  const linkBtn = ggButton('link', 'Copy HD image URL');
  const bar = h('div', { class: 'ige-toolbar' }, zoomBtn, dlBtn, linkBtn);
  // real viewer markup (src/content/ui/zoom.ts)
  const img = h('img', { class: 'ige-zoom__img', src: toUrl(lake({ seed: 7, detail: true })), alt: '', draggable: 'false' });
  const stage = h('div', { class: 'ige-zoom__stage' }, img);
  const zbar = h(
    'div',
    { class: 'ige-zoom__bar' },
    h('span', { class: 'ige-zoom__caption' }, `@${P.nora.user} · 1080×1080`),
    h('div', { class: 'ige-zoom__actions' }, ggButton('download', 'Download'), ggButton('link', 'Copy image URL'), ggButton('open', 'Open in new tab'), ggButton('close', 'Close (Esc)')),
  );
  const viewer = h('div', { class: 'ige-zoom' }, stage, zbar);
  layer.append(bar, viewer);
  const cur = cursor(win.view);
  root.append(cap.el, win.el);

  // zoom/pan state, mirroring zoom.ts: scale about the cursor, then drag translates.
  const zoomAt = { x: 0.64, y: 0.58 }; // the cabin, as a fraction of the image
  return {
    root,
    update(t) {
      cap.update(t, start + 0.25);
      const vw = win.view.offsetWidth;
      const vh = win.view.offsetHeight;
      img.style.maxHeight = `${vh - 90}px`;
      img.style.maxWidth = `${vw * 0.92}px`;
      vis(bar, prog(t, AV.hover, AV.hover + 0.14) * (1 - prog(t, AV.open, AV.open + 0.15)));
      placeToolbar(bar, rectIn(pic, win.view), vw);
      zoomBtn.style.background = t > AV.click - 0.3 && t < AV.open ? 'rgb(255 255 255 / 0.22)' : '';
      const vo = prog(t, AV.open, AV.open + 0.3, ease.out);
      vis(viewer, vo);
      stage.style.cursor = 'grab';

      const ir = { w: img.offsetWidth, h: img.offsetHeight };
      const st = stage.getBoundingClientRect();
      const sc = st.width / stage.offsetWidth || 1;
      const sw = stage.offsetWidth;
      const sh = stage.offsetHeight;
      // point under the cursor, relative to the stage centre, at scale 1
      const cx = (zoomAt.x - 0.5) * ir.w;
      const cy = (zoomAt.y - 0.5) * ir.h;
      const scale = kf(t, [[AV.zoomFrom, 1], [AV.zoomTo, 3.2, ease.inOut]]);
      const zx = cx - cx * scale;
      const zy = cy - cy * scale;
      const pan = kf(t, [[AV.panFrom, [0, 0]], [AV.panTo, [260, -60], ease.inOut]]);
      const x = zx + pan[0];
      const y = zy + pan[1];
      img.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
      void sc;

      const stagePt = (px, py) => ({ x: sw / 2 + px, y: sh / 2 + py });
      const zoomPt = stagePt(cx, cy);
      cur.update(t, {
        path: [
          [start + 0.3, { x: 820, y: 640 }],
          [AV.hover, () => pointIn(pic, win.view, 0.62, 0.55)],
          [AV.click - 0.25, () => pointIn(zoomBtn, win.view, 0.55, 0.6)],
          [AV.open + 0.2, () => pointIn(zoomBtn, win.view, 0.55, 0.6)],
          [AV.zoomFrom - 0.1, zoomPt],
          [AV.panFrom, zoomPt],
          [AV.panTo, { x: zoomPt.x + 260, y: zoomPt.y - 60 }],
        ],
        clicks: [AV.click],
        shapes: [[0, 'arrow'], [AV.click - 0.3, 'hand'], [AV.open + 0.4, 'arrow'], [AV.panFrom - 0.15, 'grab']],
        show: [start + 0.3, end + 1],
      });
      // camera
      const z = kf(t, [[start, 1.0], [AV.hover, 1.0], [AV.hover + 0.7, 1.08], [AV.open, 1.08], [AV.open + 0.6, 1.0]]);
      style(win.el, { transformOrigin: '30% 25%', transform: `scale(${z})` });
    },
  };
}

// ======================= Story mentions =======================
export function story() {
  const [start, end] = SCENES.story;
  const root = h('div');
  const cap = caption({ eyebrow: 'Stories', icon: 'eye', title: ["See who's", '*mentioned.'], sub: 'Every @mention in a story, even the ones the poster hid. Plus hashtags, location, links and music.', x: 130, y: 300, width: 560 });
  const win = browserWindow({ ...WIN, url: `instagram.com/stories/${P.nora.user}/` });
  style(win.el, { left: `${WIN.left}px`, top: `${WIN.top}px` });
  const sv = h('div', { class: 'ig-sv' });
  win.view.append(sv);
  const vh = WIN.h - 84;
  const ch = vh - 36;
  const cw = Math.round((ch * 9) / 16);
  const cl = Math.round((WIN.w - cw) / 2);
  const card = h('div', { class: 'ig-card', style: { left: `${cl}px`, top: '18px', width: `${cw}px`, height: `${ch}px` }, html: city({ w: 1080, h: 1920, seed: 5 }) });
  card.append(
    h('div', { class: 'ig-card__shade' }),
    h('div', { class: 'ig-bars' }, h('i', {}, h('b', { style: { width: '100%' } })), h('i', {}, h('b', { class: 'cur', style: { width: '30%' } })), h('i', {})),
    h('div', { class: 'ig-shead' }, avatarEl(P.nora, 32), h('b', {}, P.nora.user), h('span', {}, '4h'), h('em', { html: igIcon('pause', 20) + igIcon('mute', 20) + igIcon('more', 20) })),
    h('div', { class: 'ig-sticker ig-sticker--mention', style: { left: '70px', top: '300px' } }, '@LUCA.MRTN'),
    h('div', { class: 'ig-sticker ig-sticker--mention', style: { left: '170px', top: '380px', transform: 'rotate(5deg)', fontSize: '18px' } }, '@JUNO.EATS'),
    h('div', { class: 'ig-sticker ig-sticker--tag', style: { left: '100px', top: '470px', transform: 'rotate(-2deg)' } }, '#NIGHTWALK'),
    h('div', { class: 'ig-reply' }, h('span', {}, `Reply to ${P.nora.user}...`), h('i', { html: igIcon('heart', 26) }), h('i', { html: igIcon('share', 24) })),
  );
  const side = (x, art) => h('div', { class: 'ig-side-story', style: { left: `${x}px`, top: `${18 + ch * 0.2}px`, width: `${cw * 0.42}px`, height: `${ch * 0.6}px` }, html: art });
  sv.append(side(cl - cw * 0.42 - 70, dunes({ w: 600, h: 1067 })), side(cl + cw + 70, forest({ w: 600, h: 1067 })), card);
  sv.append(h('span', { class: 'ig-sv__arrow', style: { left: `${cl - 48}px` }, html: igIcon('chevL', 18) }), h('span', { class: 'ig-sv__arrow', style: { left: `${cl + cw + 16}px` }, html: igIcon('chevR', 18) }), h('span', { class: 'ig-sv__x', html: igIcon('close', 30) }));

  const layer = ggLayer(win.view);
  const at = ggButton('at', 'Mentions & stickers', 'ige-btn--count');
  at.dataset.count = '3';
  const all = ggButton('downloadAll', 'Download all stories in this tray');
  const dl = ggButton('download', 'Download this story');
  const link = ggButton('link', 'Copy media URL');
  const bar = h('div', { class: 'ige-toolbar' }, at, all, dl, link);
  layer.append(bar);

  // the real panel (src/content/features/story-details.ts), filled with this story's data
  const user = (p, hidden) =>
    h('a', { class: 'ige-user' }, h('img', { src: p.pic, alt: '' }), h('span', { class: 'ige-user__names' }, h('strong', {}, `@${p.user}`), h('span', {}, p.name)), hidden ? h('span', { class: 'ige-pill', title: 'Not visible on the story' }, 'hidden') : null);
  const sec = (title, n, ...rows) => h('section', { class: 'ige-sd__section' }, h('h3', { class: 'ige-sd__title' }, `${title} `, h('span', { class: 'ige-badge' }, String(n))), ...rows);
  const hiddenRow = user(P.kalma, true);
  const body = h(
    'div',
    { class: 'ige-modal__body' },
    sec('Mentions', 3, h('p', { class: 'ige-muted ige-sd__note' }, '1 hidden (tiny, flagged hidden, or outside the frame).'), user(P.luca), user(P.juno), hiddenRow),
    sec('Hashtags', 1, h('a', { class: 'ige-sd__row' }, '#nightwalk')),
    sec('Location', 1, h('a', { class: 'ige-sd__row' }, 'Alfama, Lisbon')),
    sec('Music', 1, h('div', { class: 'ige-sd__row' }, h('strong', {}, 'Neon Harbour'), h('span', { class: 'ige-muted' }, 'Halcyon Drive'))),
  );
  const modal = h('div', { class: 'ige-modal', style: { width: '440px' } }, h('div', { class: 'ige-modal__head' }, h('h2', {}, `Story by @${P.nora.user}`), ggButton('close', 'Close', 'ige-btn--ghost')), body, h('div', { class: 'ige-modal__footer' }));
  const backdrop = h('div', { class: 'ige-backdrop' }, modal);
  layer.append(backdrop);
  const glowRing = h('div', { class: 'abs', style: { inset: '-4px -10px', borderRadius: '14px', boxShadow: '0 0 0 2px #ffd98a, 0 0 28px rgb(255 217 138 / 0.45)', pointerEvents: 'none' } });
  hiddenRow.style.position = 'relative';
  hiddenRow.append(glowRing);
  const cur = cursor(win.view);
  root.append(cap.el, win.el);

  return {
    root,
    update(t) {
      cap.update(t, start + 0.25);
      const vw = win.view.offsetWidth;
      const lt = t - start;
      card.querySelector('.cur').style.width = `${Math.min(100, 30 + lt * 10)}%`;
      vis(bar, prog(t, start + 0.7, start + 0.85));
      placeToolbar(bar, rectIn(card, win.view), vw, true);
      growIn(at, prog(t, ST.reveal, ST.reveal + 0.18, ease.linear));
      growIn(all, prog(t, ST.reveal, ST.reveal + 0.18, ease.linear));
      at.style.background = t > ST.click - 0.3 && t < ST.open + 0.1 ? 'rgb(255 255 255 / 0.22)' : '';
      const mo = prog(t, ST.open, ST.open + 0.25, ease.out);
      vis(backdrop, mo);
      modal.style.transform = `scale(${lerp(0.97, 1, mo)})`;
      const hp = prog(t, ST.highlight, ST.highlight + 0.4, ease.out);
      vis(glowRing, hp * (0.75 + 0.25 * Math.sin((t - ST.highlight) * 5)));
      cur.update(t, {
        path: [
          [start + 0.3, { x: 640, y: 690 }],
          [start + 0.8, { x: 560, y: 380 }],
          [ST.click - 0.25, () => pointIn(at, win.view, 0.45, 0.6)],
          [ST.open + 0.5, () => pointIn(at, win.view, 0.45, 0.6)],
          [ST.highlight - 0.2, () => pointIn(hiddenRow, win.view, 0.6, 0.62)],
        ],
        clicks: [ST.click],
        shapes: [[0, 'arrow'], [ST.click - 0.3, 'hand'], [ST.open + 0.6, 'arrow']],
        show: [start + 0.3, end + 1],
      });
      const z = kf(t, [[start, 1], [ST.open, 1], [ST.open + 0.8, 1.06]]);
      style(win.el, { transformOrigin: '50% 45%', transform: `scale(${z})` });
    },
  };
}

// ======================= Follow badge =======================
export function follow() {
  const [start, end] = SCENES.follow;
  const root = h('div');
  const cap = caption({ eyebrow: 'Profiles', icon: 'eye', title: ['Know who', '*follows you back.'], x: 130, y: 300, width: 600, size: 74 });
  const kinds = [
    ['mutual', 'Follow each other'],
    ['follower', 'Follows you'],
    ['notback', "Doesn't follow you back"],
    ['none', "Doesn't follow you"],
  ];
  const legend = h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '14px', marginTop: '34px' } }, ...kinds.map(([k, txt]) => h('span', { class: `ige-follow-badge ige-follow-badge--${k}`, style: { height: '34px', padding: '0 16px', fontSize: '17px', margin: '0', alignSelf: 'flex-start' } }, txt)));
  cap.el.append(legend);
  const win = browserWindow({ ...WIN, url: `instagram.com/${P.luca.user}/` });
  style(win.el, { left: `${WIN.left}px`, top: `${WIN.top}px` });
  const prof = profilePage(P.luca, { posts: '342', followers: '3,918', following: '701', bio: ['Night walks & city light.', 'Lisbon · Porto'] });
  win.view.append(prof.ig);
  const anchor = prof.header.querySelector('.ig-prof__user');
  const badge = h('span', { class: 'ige-root ige-follow-badge ige-follow-badge--loading' }, '…');
  anchor.insertAdjacentElement('afterend', badge);
  root.append(cap.el, win.el);

  return {
    root,
    update(t) {
      cap.update(t, start + 0.25);
      const loaded = t >= FO.badge;
      badge.className = `ige-root ige-follow-badge ige-follow-badge--${loaded ? 'follower' : 'loading'}`;
      badge.textContent = loaded ? 'Follows you' : '…';
      const bp = loaded ? ease.outBack(clamp((t - FO.badge) / 0.35), 2.2) : prog(t, FO.loading, FO.loading + 0.2);
      style(badge, { display: t < FO.loading ? 'none' : '', transform: `scale(${loaded ? lerp(0.6, 1, bp) : 1})`, opacity: loaded ? '1' : String(0.6 * bp) });
      [...legend.children].forEach((c, i) => {
        const p = prog(t, FO.legend + i * 0.14, FO.legend + i * 0.14 + 0.4, ease.outBack);
        style(c, { opacity: String(clamp(p)), transform: `translateX(${(1 - p) * -20}px)` });
      });
      // camera: start close on the header, ease back
      const z = kf(t, [[start, 1.42], [FO.badge + 0.2, 1.36, ease.inOut], [end, 1.26, ease.inOut]]);
      style(prof.ig, { transformOrigin: '520px 40px', transform: `scale(${z})` });
    },
  };
}
