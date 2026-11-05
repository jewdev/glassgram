import { h, prog, ease, kf, lerp, style, vis, clamp } from '../lib.js';
import { SCENES, FC } from '../timeline.js';
import { caption, chips, cursor, ggLayer } from '../kit.js';
import { browserWindow, reelStage, PEOPLE } from '../ig.js';
import { ocean, dunes, forest, cafe } from '../art.js';
import { WIN } from './media.js';

const P = PEOPLE;

/** "12 min", "45 s": formatLeft() in src/shared/focus.ts. */
function formatLeft(ms) {
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s} s`;
  const min = Math.ceil(s / 60);
  if (min < 60) return `${min} min`;
  const hh = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${hh} h ${m} min` : `${hh} h`;
}

// ======================= Focus mode + reel counter =======================
export function focus() {
  const [start, end] = SCENES.focus;
  const root = h('div');
  const cap = caption({ eyebrow: 'Focus', icon: 'focus', title: ['Scroll less,', '*on purpose.'], sub: 'A daily limit for Reels and Explore, a timer that shows what’s left, and optional grayscale. A reel counter keeps today’s count. Off by default.', x: 130, y: 280, width: 490 });
  const kinds = chips(['Daily limit', 'Time left', 'Grayscale', 'Reel counter']);
  cap.el.append(kinds.el);

  const CODES = ['DBw1Kp3sQ', 'DC0hTz9Lm', 'DC2qAe5Rv', 'DC3nWx7Gd'];
  const win = browserWindow({ ...WIN, url: `instagram.com/reels/${CODES[0]}/` });
  style(win.el, { left: `${WIN.left}px`, top: `${WIN.top}px` });
  const reel = reelStage({ w: WIN.w, h: WIN.h, who: P.dunes, text: 'Wind sculpts the ridge overnight', likes: '12.9K', comments: '204' });
  win.view.append(reel.ig);
  // a vertical strip of reels; each swipe moves it up one card
  const who = [P.dunes, P.fern, P.mara, P.juno];
  const texts = ['Wind sculpts the ridge overnight', 'Morning fog, no filter', 'Low tide, long exposure', 'Best flat white in town?'];
  const arts = [dunes({ w: 1080, h: 1920, seed: 3 }), forest({ w: 1080, h: 1920, seed: 8 }), ocean({ w: 1080, h: 1920, t: 2 }), cafe({ w: 1080, h: 1920 })];
  const strip = h('div', { class: 'abs', style: { left: '0', top: '0', width: '100%', height: `${arts.length * 100}%` } }, ...arts.map((a) => h('div', { style: { height: `${100 / arts.length}%`, overflow: 'hidden' }, html: a })));
  reel.media.append(strip);
  const whoName = reel.capt.querySelector('.ig-reel__who');
  const capLine = reel.capt.lastElementChild;

  // Glassgram's own layer (focus.ts, reel-counter.ts)
  const layer = ggLayer(win.view);
  const num = h('span', { class: 'ige-reels__num' }, '23');
  const badge = h('div', { class: 'ige-reels', role: 'status' }, num, h('span', { class: 'ige-reels__label' }, 'reels today'));
  const pill = h('div', { class: 'ige-focus-pill', role: 'timer' });
  const more = h('button', { class: 'ige-btn ige-btn--ghost', type: 'button' }, '5 more minutes');
  const home = h('button', { class: 'ige-btn ige-btn--primary', type: 'button' }, 'Go to Home');
  const card = h('div', { class: 'ige-focus-card' }, h('h2', {}, 'That’s your time for today'), h('p', {}, 'You’ve spent your 30 min on Reels and Explore today. It resets at midnight.'), h('div', { class: 'ige-focus-actions' }, more, home));
  const block = h('div', { class: 'ige-focus-block is-in', role: 'dialog' }, card);
  layer.append(badge, pill, block);
  const cur = cursor(win.view);
  root.append(cap.el, win.el);

  /** Milliseconds left in today's 30 min budget at video time t: the clock runs fast for the demo. */
  const leftMs = (t) => kf(t, [[start, 152_000], [FC.low - 0.05, 64_000, ease.linear], [FC.low, 58_000, ease.linear], [FC.block, 0, ease.linear]]);
  let lastIdx = -1;

  return {
    root,
    update(t) {
      cap.update(t, start + 0.2);
      kinds.update(t, start + 1.4);
      // swipes: the strip moves one card up per swipe
      const idx = FC.swipes.filter((s) => t >= s + 0.15).length;
      const pos = FC.swipes.reduce((acc, s) => acc + prog(t, s, s + 0.38, ease.inOutQuint), 0);
      strip.style.transform = `translateY(${(-pos * 100) / arts.length}%)`;
      if (idx !== lastIdx) {
        lastIdx = idx;
        whoName.childNodes[0].src = who[idx].pic;
        whoName.childNodes[1].textContent = who[idx].user;
        capLine.textContent = texts[idx];
        win.url.innerHTML = `<b>instagram.com</b>/reels/${CODES[idx]}/`;
      }
      // reel counter: +1 for each new reel, with its bump
      num.textContent = String(23 + idx);
      const bumpAt = FC.swipes[idx - 1];
      const bump = bumpAt === undefined ? 0 : Math.sin(clamp((t - bumpAt - 0.15) / 0.35) * Math.PI) * 0.35;
      style(num, { display: 'inline-block', transform: `scale(${1 + bump})` });
      // badge follows the reel's video: 12 px in from its top-left corner
      badge.style.transform = `translate(${reel.rect.left + 12}px, ${reel.rect.top + 12}px)`;
      vis(badge, prog(t, start + 0.25, start + 0.5) * (1 - prog(t, FC.block, FC.block + 0.3)));

      // time-left pill, bottom centre of the page; red under a minute
      const ms = leftMs(t);
      pill.textContent = `${formatLeft(ms)} left today`;
      pill.classList.toggle('is-low', ms < 60_000);
      vis(pill, prog(t, start + 0.25, start + 0.5) * (1 - prog(t, FC.block - 0.1, FC.block + 0.1)));
      const lowPulse = prog(t, FC.low, FC.low + 0.12) * (1 - prog(t, FC.low + 0.2, FC.low + 0.5));
      pill.style.transform = `translateX(-50%) scale(${1 + lowPulse * 0.12})`;

      // budget used up: the block screen (blur + grayscale over the page)
      const bp = prog(t, FC.block, FC.block + 0.35, ease.out);
      vis(block, bp);
      card.style.transform = `translateY(${(1 - bp) * 14}px) scale(${lerp(0.96, 1, bp)})`;

      cur.update(t, {
        path: [
          [start + 0.3, { x: 560, y: 690 }],
          [FC.swipes[0] - 0.2, { x: reel.rect.left + reel.rect.width * 0.62, y: 470 }],
          ...FC.swipes.flatMap((s, i) => [
            [s, { x: reel.rect.left + reel.rect.width * 0.62, y: 470 + (i % 2) * 6 }],
            [s + 0.35, { x: reel.rect.left + reel.rect.width * 0.62, y: 440 + (i % 2) * 6 }],
          ]),
          [FC.block + 0.6, () => ({ x: reel.rect.left + reel.rect.width * 0.62, y: 440 })],
          [end + 0.5, () => {
            const r = home.getBoundingClientRect();
            const v = win.view.getBoundingClientRect();
            const sc = v.width / win.view.offsetWidth || 1;
            return { x: (r.left + r.width * 0.5 - v.left) / sc, y: (r.top + r.height * 0.6 - v.top) / sc };
          }],
        ],
        show: [start + 0.3, end + 1],
      });
      // camera: push in on the reel, ease out when the block screen lands
      const z = kf(t, [[start, 1.0], [FC.swipes[0], 1.06], [FC.block, 1.09, ease.linear], [end + 0.5, 1.03]]);
      style(win.el, { transformOrigin: '70% 50%', transform: `scale(${z})` });
    },
  };
}
