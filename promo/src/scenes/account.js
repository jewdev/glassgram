import { h, prog, ease, kf, lerp, style, vis, clamp, pointIn } from '../lib.js';
import { SCENES, UF, MS, XT } from '../timeline.js';
import { caption, cursor, ggIcon, ggLayer } from '../kit.js';
import { browserWindow, navRail, avatarEl, igIcon, PEOPLE } from '../ig.js';
import { avatar, toUrl, dunes, lake } from '../art.js';
import { WIN, toastEl, profilePage } from './media.js';
import { extFrame } from './controls.js';

const P = PEOPLE;

/** Same markup as openModal() in src/content/ui/modal.ts. */
function modal(title, width) {
  const body = h('div', { class: 'ige-modal__body' });
  const footer = h('div', { class: 'ige-modal__footer' });
  const panel = h(
    'div',
    { class: 'ige-modal', role: 'dialog', style: { width: `${width}px` } },
    h('div', { class: 'ige-modal__head' }, h('h2', {}, title), h('button', { class: 'ige-btn ige-btn--ghost', type: 'button', title: 'Close', html: ggIcon('close') })),
    body,
    footer,
  );
  const root = h('div', { class: 'ige-backdrop is-in' }, panel);
  return { root, panel, body, footer };
}

/** Backdrop + panel entrance, like the real .is-in transition, on the video clock. */
function showModal(m, t, t0, t1 = Infinity) {
  const p = Math.min(prog(t, t0, t0 + 0.22, ease.outQuart), 1 - prog(t, t1, t1 + 0.2));
  vis(m.root, p);
  m.panel.style.transform = `scale(${lerp(0.97, 1, p)})`;
}

// ======================= Unfollowers checker =======================
const FAKE = [
  ['pixel.harbor', 'Pixel Harbor', 3, 'wave'],
  ['studio.verde', 'Studio Verde', 12, 'leaf'],
  ['morning.static', 'Morning Static', 27, 'sun'],
  ['kai.outdoors', 'Kai Brennan', 44, 'peak'],
  ['nightbus.club', 'Night Bus Club', 58, 'dot'],
  ['lena.draws', 'Lena Vogel', 71, 'cup'],
  ['the.slow.lane', 'The Slow Lane', 86, 'wave'],
  ['odd.ceramics', 'Odd Ceramics', 99, 'leaf'],
].map(([user, name, seed, motif]) => ({ user, name, pic: toUrl(avatar(seed, motif)) }));
/** Unfollowed you since the scan before (so they are also in "Don't follow back"), then picked to unfollow. */
const LOST = [0, 2, 6];
const KEPT = 1;

/** userRow() in src/content/features/unfollowers.ts. */
const userRow = (u) => h('a', { class: 'ige-user' }, h('img', { src: u.pic, alt: '' }), h('span', { class: 'ige-user__names' }, h('strong', {}, u.user), h('span', {}, u.name)));

export function unfollowers() {
  const [start, end] = SCENES.unfollowers;
  const root = h('div');
  const cap = caption({ eyebrow: 'Account', icon: 'tools', title: ['See who', '*unfollowed you.'], sub: 'Each scan is compared with the last one. Pick accounts and unfollow them slowly, with safety pauses and a keep list. Off by default.', x: 130, y: 280, width: 560, size: 70 });
  const win = browserWindow({ ...WIN, url: `instagram.com/${P.you.user}/` });
  style(win.el, { left: `${WIN.left}px`, top: `${WIN.top}px` });
  const prof = profilePage(P.you, { posts: '86', followers: '1,282', following: '731', bio: ['Photos, mostly.'] });
  prof.header.querySelectorAll('.ig-btn').forEach((b, i) => (b.textContent = ['Edit profile', 'View archive'][i]));
  win.view.append(prof.ig);
  const layer = ggLayer(win.view);

  // markup from openUnfollowers() in src/content/features/unfollowers.ts
  const m = modal('Unfollowers checker', 560);
  const status = h('p', { class: 'ige-muted' });
  const tabs = h('div', { class: 'ige-tabs', role: 'tablist' });
  const search = h('input', { class: 'ige-input', type: 'search', placeholder: 'Search username or name' });
  const list = h('div', { class: 'ige-userlist', style: { height: '286px', minHeight: '0' } });
  const runBtn = h('button', { class: 'ige-btn ige-btn--primary', type: 'button' }, 'Scan');
  const exportBtn = h('button', { class: 'ige-btn ige-btn--ghost', type: 'button' }, 'Export CSV');
  const unfollowBtn = h('button', { class: 'ige-btn ige-btn--danger is-hidden', type: 'button' }, 'Unfollow');
  const pickAllBtn = h('button', { class: 'ige-btn ige-btn--ghost ige-btn--sm', type: 'button' }, 'Select all');
  const pickCount = h('span', { class: 'ige-muted' });
  const pickBar = h('div', { class: 'ige-pickbar' }, pickAllBtn, pickCount);
  const cancelBtn = h('button', { class: 'ige-btn ige-btn--ghost ige-btn--sm', type: 'button' }, 'Cancel');
  const goBtn = h('button', { class: 'ige-btn ige-btn--danger ige-btn--sm', type: 'button' }, 'Unfollow 3 accounts');
  // askUnfollow() with the defaults: 3 accounts, 4 s apart → 2 waits × 4 s × 1.1 ≈ 9 s
  const confirmBox = h(
    'div',
    { class: 'ige-warn ige-confirm', role: 'alert' },
    h('p', {}, h('strong', {}, 'Unfollow 3 accounts?')),
    h('p', {}, 'One every 4 s or so, with a 5 min pause after every 5: about 9 s in all. Keep this panel open, closing it stops the queue. It also stops by itself if Instagram blocks the action.'),
    h('div', { class: 'ige-confirm__actions' }, cancelBtn, goBtn),
  );
  m.body.append(status, tabs, search, pickBar, confirmBox, list);
  m.footer.append(exportBtn, unfollowBtn, runBtn);
  layer.append(m.root);
  const toasts = toastEl(layer); // above the dialog backdrop, like the real stack

  const TABS = ["Don't follow back", "You don't follow", 'Followers', 'Following', 'Changes'];
  const tabEls = TABS.map((label) => h('button', { class: 'ige-tab', type: 'button', role: 'tab' }, `${label} `, h('span', { class: 'ige-badge' }, '0')));
  tabs.append(...tabEls);

  // "Don't follow back": pick rows (pickRow())
  const boxes = [];
  const keeps = [];
  const pickRows = FAKE.map((u) => {
    const box = h('input', { type: 'checkbox' });
    const keep = h('button', { class: 'ige-btn ige-btn--sm ige-keep', type: 'button' }, 'Keep');
    boxes.push(box);
    keeps.push(keep);
    return h('div', { class: 'ige-pickrow' }, box, userRow(u), keep);
  });
  // "Changes": the scan history, newest first (renderChanges())
  const changes = [
    h('p', { class: 'ige-hist__head' }, h('strong', {}, '11/4/2026, 9:41:07 PM'), ' · 1282 followers (−2) · 731 following (±0)'),
    h('p', { class: 'ige-hist__group' }, 'Unfollowed you (3)'),
    ...LOST.map((i) => userRow(FAKE[i])),
    h('p', { class: 'ige-hist__group' }, 'New followers (1)'),
    userRow({ user: P.fern.user, name: P.fern.name, pic: P.fern.pic }),
    h('p', { class: 'ige-hist__head' }, h('strong', {}, '10/28/2026, 8:15:44 PM'), ' · First scan: 1284 followers · 731 following'),
  ];
  const empty = h('p', { class: 'ige-muted ige-empty' }, 'Press Scan to load your followers and following.');
  const cur = cursor(win.view);
  root.append(cap.el, win.el);
  let lastKey = '';

  // the unfollow queue on the video's clock: [starts, confirmed] per picked account
  const Q = LOST.map((_, i) => [UF.go + 0.05 + i * 0.62, UF.go + 0.45 + i * 0.62]);

  return {
    root,
    update(t) {
      cap.update(t, start + 0.2);
      showModal(m, t, UF.open);
      const loaded = t >= UF.loaded;
      const tab = loaded && t >= UF.changes && t < UF.back ? 4 : 0;
      const kept = t >= UF.keep;
      const picked = LOST.filter((_, i) => t >= UF.picks[i]);
      const confirming = t >= UF.unfollow + 0.05 && t < UF.go;
      const done = Q.filter(([, b]) => t >= b).length;
      const unfollowing = t >= UF.go;
      const gone = new Set(LOST.slice(0, done));

      // scan progress, followers first, then following (ORDER in unfollowers.ts)
      const fwr = Math.round(1282 * prog(t, UF.scan + 0.1, UF.scan + 0.6, ease.linear));
      const fol = Math.round(731 * prog(t, UF.scan + 0.62, UF.loaded - 0.05, ease.linear));
      if (t < UF.scan) status.textContent = 'Not scanned yet.';
      else if (!loaded) status.textContent = fol > 0 ? `Loading following… ${fol}` : `Loading followers… ${fwr}`;
      else if (!unfollowing) status.textContent = 'Last scan: 11/4/2026, 9:41:07 PM · 1282 followers · 731 following';
      else {
        const active = Q.findIndex(([a, b]) => t >= a && t < b);
        status.textContent = active >= 0 ? `Unfollowing ${FAKE[LOST[active]].user} (${active + 1} of 3)…` : `Unfollowed ${done} of 3. Next in ${done === 1 ? 4 : 5} s…`;
      }
      runBtn.textContent = t < UF.scan ? 'Scan' : loaded ? 'Rescan' : 'Pause';
      runBtn.disabled = unfollowing;
      const counts = loaded ? [23 - done, 574, 1282, 731 - done, 3] : [0, 0, fwr, fol, 0];
      tabEls.forEach((el, i) => {
        el.classList.toggle('is-active', i === tab);
        el.lastChild.textContent = String(counts[i]);
        el.style.background = (Math.abs(t - UF.changes) < 0.2 && i === 4) || (Math.abs(t - UF.back) < 0.2 && i === 0) ? 'var(--ige-hover)' : '';
      });
      // the tab row scrolls so "Changes" is in view while it is used
      tabs.scrollLeft = kf(t, [[UF.changes - 0.5, 0], [UF.changes - 0.15, 400], [UF.back - 0.5, 400], [UF.back - 0.2, 0]]);

      pickBar.hidden = !loaded || tab !== 0;
      pickAllBtn.textContent = `Select all (${23 - done - (kept ? 1 : 0)})`;
      pickAllBtn.disabled = unfollowing;
      const sel = picked.length - done;
      pickCount.textContent = [sel && `${sel} selected`, kept && '1 kept'].filter(Boolean).join(' · ');
      confirmBox.hidden = !confirming;
      list.style.height = confirming ? '190px' : '286px'; // keeps the taller dialog inside the window
      goBtn.style.filter = Math.abs(t - UF.go) < 0.18 ? 'brightness(1.15)' : '';
      unfollowBtn.classList.toggle('is-hidden', !picked.length);
      unfollowBtn.textContent = unfollowing ? 'Stop' : `Unfollow ${picked.length}`;
      unfollowBtn.disabled = confirming;
      exportBtn.disabled = !loaded;

      boxes.forEach((b, i) => {
        b.checked = picked.includes(i) && !gone.has(i);
        b.disabled = (kept && i === KEPT) || unfollowing;
      });
      pickRows[KEPT].classList.toggle('is-kept', kept);
      keeps[KEPT].classList.toggle('is-active', kept);
      keeps[KEPT].textContent = kept ? 'Kept' : 'Keep';
      keeps.forEach((k) => (k.disabled = unfollowing));
      keeps[KEPT].style.background = Math.abs(t - UF.keep) < 0.2 ? 'var(--ige-hover)' : '';

      const key = !loaded ? 'e' : tab === 4 ? 'c' : `p${done}`;
      if (key !== lastKey) {
        list.replaceChildren(...(key === 'e' ? [empty] : key === 'c' ? changes : pickRows.filter((_, i) => !gone.has(i))));
        list.scrollTop = 0;
        lastKey = key;
      }
      const rise = (els, t0) =>
        els.forEach((r, i) => {
          const p = prog(t, t0 + i * 0.05, t0 + 0.3 + i * 0.05, ease.outQuart);
          style(r, { opacity: String(p), transform: `translateY(${(1 - p) * 10}px)` });
        });
      if (tab === 4) rise(changes, UF.changes + 0.05);
      else rise(pickRows, t < UF.changes ? UF.loaded + 0.05 : UF.back + 0.05);
      // the row being unfollowed dims until Instagram confirms
      Q.forEach(([a, b], i) => {
        if (t >= a && t < b) pickRows[LOST[i]].style.opacity = String(1 - 0.5 * prog(t, a, b));
      });
      toasts.update(t, [[UF.loaded + 0.1, UF.changes + 1.2, 'Scan complete: 3 unfollowed you, 1 new follower.', 'success']]);

      const at = (el, fx = 0.5, fy = 0.55) => () => pointIn(el, win.view, fx, fy);
      cur.update(t, {
        path: [
          [start + 0.3, { x: 820, y: 600 }],
          [UF.scan - 0.12, at(runBtn)],
          [UF.loaded, at(runBtn)],
          [UF.changes - 0.12, at(tabEls[4], 0.4)],
          [UF.changes + 0.6, at(tabEls[4], 0.4)],
          [UF.back - 0.12, at(tabEls[0], 0.4)],
          [UF.keep - 0.12, at(keeps[KEPT])],
          ...LOST.map((i, k) => [UF.picks[k] - 0.08, at(boxes[i])]),
          [UF.unfollow - 0.12, at(unfollowBtn)],
          [UF.unfollow + 0.2, at(unfollowBtn)],
          [UF.go - 0.12, at(goBtn)],
          [end + 0.5, () => pointIn(goBtn, win.view, 0.5, 2.5)],
        ],
        clicks: [UF.scan, UF.changes, UF.back, UF.keep, ...UF.picks, UF.unfollow, UF.go],
        shapes: [[0, 'hand']],
        show: [start + 0.3, end + 1],
      });
      // camera: push in on the dialog so its 13px text reads
      const z = kf(t, [[start, 1.0], [UF.scan, 1.1], [end + 0.5, 1.14, ease.linear]]);
      const origin = '550px 400px';
      style(prof.ig, { transformOrigin: origin, transform: `scale(${z})` });
      style(layer, { transformOrigin: origin, transform: `scale(${z})` });
    },
  };
}

// ======================= Keep unsent messages =======================
function bubble(text, out = false) {
  return h('div', { class: `ig-msg${out ? ' ig-msg--out' : ''}` }, h('div', { class: 'ig-msg__b' }, text));
}

/** Same markup as ghostFor() in src/content/features/dm-archive.ts. */
const UNSENT_ICON = '<path d="M3 7h18"/><path d="M8 7V4h8v3"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>';
function ghost(text) {
  return h(
    'div',
    { class: 'ige-root ige-ghost', style: { paddingLeft: '44px' } },
    h('div', { class: 'ige-ghost__bubble' }, h('span', { class: 'ige-ghost__text' }, text)),
    h('span', { class: 'ige-ghost__icon', html: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${UNSENT_ICON}</svg>` }),
  );
}

export function messages() {
  const [start, end] = SCENES.messages;
  const root = h('div');
  const cap = caption({ eyebrow: 'Messages', icon: 'message', title: ['Unsent,', '*not gone.'], sub: 'Keep unsent messages: when someone unsends a message, it stays in the chat with a mark and is listed in the popup. Off by default.', x: 130, y: 280, width: 540 });
  window.PROMO_SETTINGS.msgpopup = { 'dm.keepUnsent': true, 'account.unfollowers': true };
  const win = browserWindow({ ...WIN, url: 'instagram.com/direct/t/18120394857/' });
  style(win.el, { left: `${WIN.left}px`, top: `${WIN.top}px` });

  const threads = [P.mara, P.luca, P.juno, P.ivo, P.nora].map((p, i) =>
    h('div', { class: `ig-thread${i === 0 ? ' is-on' : ''}` }, avatarEl(p, 52), h('div', {}, h('b', {}, p.name), h('span', {}, ['Active now', 'Sent a reel · 2h', 'see you sunday! · 5h', 'Liked a message · 1d', 'You: haha same · 3d'][i]))),
  );
  const inbox = h('div', { class: 'ig-inbox' }, h('div', { class: 'ig-inbox__me' }, 'you'), h('div', { class: 'ig-inbox__h' }, h('b', {}, 'Messages'), h('span', {}, 'Requests')), ...threads);
  const UNSENT_TEXT = 'ok honestly that photo of me is not my best angle 😅';
  const m1 = bubble('save me a seat near the front');
  const m2 = bubble(UNSENT_TEXT);
  const g = ghost(UNSENT_TEXT);
  const list = h(
    'div',
    { class: 'ig-chat__list' },
    h('div', { class: 'ig-chat__day' }, 'Today 9:38 PM'),
    bubble('are you coming tonight?', true),
    bubble('yes!! running a bit late'),
    bubble('no rush 🙂', true),
    m1,
    m2,
    g,
  );
  [m1, m2].forEach((b) => b.prepend(avatarEl(P.mara, 28)));
  list.querySelectorAll('.ig-msg:not(.ig-msg--out)').forEach((b) => b.firstElementChild.tagName !== 'IMG' && b.prepend(h('span', { class: 'ig-msg__pad' })));
  const chat = h(
    'div',
    { class: 'ig-chat' },
    h('div', { class: 'ig-chat__head' }, avatarEl(P.mara, 44), h('div', {}, h('b', {}, P.mara.name), h('span', {}, P.mara.user))),
    list,
    h('div', { class: 'ig-chat__input', html: `<span>Message…</span>${igIcon('heart', 22)}` }),
  );
  const ig = h('div', { class: 'ig' }, navRail({ active: 'messages' }), h('div', { class: 'ig-dm' }, inbox, chat));
  win.view.append(ig);
  const layer = ggLayer(win.view);
  const toasts = toastEl(layer);

  // the "Unsent messages" panel (openUnsentMessages in dm-archive.ts)
  const um = modal('Unsent messages', 520);
  const item = (user, text, sent, unsent) =>
    h('div', { class: 'ige-dmu__item' }, h('div', { class: 'ige-dmu__head' }, h('a', {}, h('strong', {}, `@${user}`)), h('a', { class: 'ige-muted' }, 'chat')), h('p', { class: 'ige-dmu__text' }, text), h('span', { class: 'ige-muted ige-dmu__time' }, `Sent ${sent} · unsent ${unsent}`));
  um.body.append(h('div', { class: 'ige-userlist ige-dmu', style: { minHeight: '0' } }, item(P.mara.user, UNSENT_TEXT, 'Oct 6, 2026, 9:41 PM', 'Oct 6, 2026, 9:41 PM'), item(P.juno.user, 'wait don’t tell anyone about the surprise yet', 'Oct 2, 2026, 6:15 PM', 'Oct 2, 2026, 6:16 PM')));
  um.footer.append(h('button', { class: 'ige-btn ige-btn--ghost', type: 'button' }, 'Clear all'));
  layer.append(um.root);

  // the real toolbar popup, under the Glassgram icon
  const pop = extFrame('msgpopup', '/src/popup/index.html', 384, 620);
  const popWrap = h('div', { class: 'abs', style: { width: '384px', height: '620px', borderRadius: '12px', overflow: 'hidden', background: '#080a12', zIndex: '45', boxShadow: '0 30px 70px -10px rgb(0 0 0 / 0.75), 0 0 0 1px rgb(255 255 255 / 0.1)' } }, pop.iframe);
  pop.iframe.style.position = 'static';
  win.el.append(popWrap);
  const cur = cursor(win.el);
  root.append(cap.el, win.el);
  const ggIconEl = win.el.querySelector('.win__gg');
  let natural = 0;

  return {
    root,
    ready: pop.ready,
    update(t) {
      cap.update(t, start + 0.2);
      natural ||= m2.offsetHeight;
      const pIn = (el, a) => {
        const p = prog(t, a, a + 0.3, ease.outQuart);
        style(el, { opacity: String(p), transform: `translateY(${(1 - p) * 12}px) scale(${lerp(0.96, 1, p)})`, display: t < a ? 'none' : '' });
      };
      pIn(m1, MS.msg1);
      pIn(m2, MS.msg2);
      // Instagram removes the unsent bubble...
      const gone = prog(t, MS.unsend, MS.unsend + 0.35, ease.inOut);
      if (t >= MS.msg2) style(m2, { opacity: String(1 - gone), height: gone ? `${natural * (1 - gone)}px` : '', transform: `scale(${lerp(1, 0.94, gone)})`, display: gone >= 1 ? 'none' : '' });
      // ...and Glassgram puts it back, marked
      const gp = prog(t, MS.ghost, MS.ghost + 0.4, ease.outQuart);
      style(g, { display: t < MS.ghost ? 'none' : '', opacity: String(gp), transform: `translateY(${(1 - gp) * 8}px)` });
      const pulse = prog(t, MS.ghost + 0.2, MS.ghost + 0.5) * (1 - prog(t, MS.ghost + 0.9, MS.ghost + 1.4));
      g.firstElementChild.style.boxShadow = `0 0 0 ${3 * pulse}px rgb(157 156 255 / ${0.55 * pulse})`;
      toasts.update(t, [[MS.ghost + 0.1, MS.panel - 0.1, `@${P.mara.user} unsent: "${UNSENT_TEXT}"`, 'info']]);

      // popup → "Unsent messages"
      const gr = pointIn(ggIconEl, win.el, 0.5, 1);
      const pp = Math.min(prog(t, MS.popup, MS.popup + 0.25, ease.outQuart), 1 - prog(t, MS.click + 0.1, MS.click + 0.25));
      style(popWrap, { left: `${gr.x - 384 + 40}px`, top: `${gr.y + 8}px`, opacity: String(pp), transform: `translateY(${(1 - pp) * -10}px) scale(${lerp(0.96, 1, pp)})`, transformOrigin: '90% 0', visibility: pp ? 'visible' : 'hidden' });
      const pdoc = pop.doc();
      if (pdoc) {
        pdoc.documentElement.style.background = '#080a12';
        const hgt = pdoc.body.scrollHeight;
        if (hgt && Math.abs(popWrap.offsetHeight - hgt) > 1) {
          popWrap.style.height = `${hgt}px`;
          pop.iframe.style.height = `${hgt}px`;
        }
      }
      const unsentBtn = pdoc?.getElementById('unsent');
      if (unsentBtn) unsentBtn.style.filter = Math.abs(t - MS.click) < 0.18 ? 'brightness(1.5)' : '';
      showModal(um, t, MS.panel);

      cur.update(t, {
        path: [
          [start + 0.4, { x: 900, y: 700 }],
          [MS.ghost + 0.3, () => pointIn(g, win.el, 0.85, 1.4)],
          [MS.popup - 0.12, () => pointIn(ggIconEl, win.el)],
          [MS.popup + 0.3, () => pointIn(ggIconEl, win.el)],
          [MS.click - 0.1, () => pointIn(unsentBtn ?? popWrap, win.el, 0.5, 0.55)],
          [end + 0.5, () => pointIn(unsentBtn ?? popWrap, win.el, 0.5, 0.55)],
        ],
        clicks: [MS.popup - 0.05, MS.click],
        shapes: [[0, 'arrow'], [MS.popup - 0.3, 'hand']],
        show: [start + 0.4, MS.panel + 0.3],
      });
      // camera: close on the conversation, then back out for the popup
      const z = kf(t, [[start, 1.0], [MS.msg2, 1.16], [MS.ghost + 0.6, 1.2, ease.linear], [MS.popup - 0.1, 1.0], [end + 0.5, 1.03, ease.linear]]);
      const origin = '1000px 720px';
      style(ig, { transformOrigin: origin, transform: `scale(${z})` });
      style(layer, { transformOrigin: origin, transform: `scale(${t < MS.panel - 0.3 ? z : 1})` });
    },
  };
}

// ======================= Small extras =======================
function card(title, desc, demo) {
  return h('div', { class: 'xcard' }, h('div', { class: 'xcard__demo' }, demo), h('div', { class: 'xcard__t' }, title), h('div', { class: 'xcard__d' }, desc));
}
const miniToast = (text) => h('div', { class: 'ige-toast ige-toast--success xcard__toast' }, text);
const commentRow = (p, text, actions) =>
  h('div', { class: 'xc-com' }, avatarEl(p, 34), h('div', {}, h('div', {}, h('b', {}, p.user), ` ${text}`), h('div', { class: 'xc-com__a' }, ...actions)));

export function extras() {
  const [start] = SCENES.extras;
  const root = h('div');
  const cap = caption({ title: 'And a lot of *small things.', x: 0, y: 70, width: 1920, size: 64 });
  cap.el.style.textAlign = 'center';

  // 1. exact timestamps (timestamps.ts)
  const rel = h('span', { class: 'xc-time' }, '3d');
  const abs = h('span', { class: 'xc-time' }, 'Oct 3, 2026, 09:41 PM');
  const tsDemo = h('div', { class: 'xc-post' }, avatarEl(P.nora, 40, true), h('div', {}, h('b', {}, P.nora.user), h('div', { class: 'xc-timewrap' }, rel, abs)));
  // 2. copy comment (copy-comment.ts)
  const copyBtn = h('span', { class: 'xc-act' }, 'Copy');
  const t2 = miniToast('Comment copied');
  const copyDemo = h('div', {}, commentRow(P.ivo, 'this light is unreal', [h('span', {}, '2h'), h('span', {}, '12 likes'), h('span', {}, 'Reply'), copyBtn]), t2);
  // 3. save GIFs from comments (comment-media.ts)
  const gif = h('div', { class: 'xc-gif', html: dunes({ w: 220, h: 140, seed: 4 }) });
  const gifBtn = h('span', { class: 'xc-act' }, 'Save GIF');
  const t3 = miniToast('Saving GIF');
  const gifDemo = h('div', {}, h('div', { class: 'xc-com' }, avatarEl(P.juno, 34), h('div', {}, h('b', {}, P.juno.user), gif, h('div', { class: 'xc-com__a' }, h('span', {}, '1h'), h('span', {}, 'Reply'), gifBtn))), t3);
  // 4. voice messages (dm-tools.ts)
  const bars = Array.from({ length: 26 }, (_, i) => h('i', { style: { height: `${6 + Math.abs(Math.sin(i * 1.7) * 18) + (i % 3) * 3}px` } }));
  const vbtn = h('button', { class: 'ige-root ige-voice-dl', type: 'button', html: ggIcon('download', 16) });
  const t4 = miniToast('Downloading voice message');
  const voiceDemo = h('div', {}, h('div', { class: 'xc-voice' }, avatarEl(P.mara, 30), h('div', { class: 'xc-voice__b', html: '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M8 5v14l11-7Z" fill="currentColor"/></svg>' }, h('span', { class: 'xc-wave' }, ...bars), h('span', {}, '0:12')), vbtn), t4);
  // 5. right-click download (context-menu.ts / background)
  const ctxItem = h('div', { class: 'xc-ctx__i xc-ctx__gg', html: `<img src="/repo/docs/icon.svg" width="16" height="16">Download Instagram media` });
  const ctxDemo = h('div', { class: 'xc-ctxwrap' }, h('div', { class: 'xc-photo', html: lake({ w: 240, h: 240, seed: 12 }) }), h('div', { class: 'xc-ctx' }, ...['Open image in new tab', 'Save image as…', 'Copy image'].map((x) => h('div', { class: 'xc-ctx__i' }, x)), h('div', { class: 'xc-ctx__sep' }), ctxItem));
  // 6. keyboard shortcuts (shortcuts.ts)
  const KEYS = [[['D'], 'Download'], [['Shift', 'D'], 'Download all'], [['Z'], 'Profile picture'], [['Shift', 'C'], 'Copy media URL']];
  const keyRows = KEYS.map(([ks, label]) => h('div', { class: 'xc-keyrow' }, h('span', { class: 'xc-keys' }, ...ks.map((k) => h('kbd', {}, k))), h('span', {}, label)));
  const keyDemo = h('div', { class: 'xc-keylist' }, ...keyRows);

  const cards = [
    card('Exact timestamps', 'The real date and time instead of “3d”.', tsDemo),
    card('Copy comments', 'A Copy button on every comment.', copyDemo),
    card('Save GIFs', 'From comments, in one click.', gifDemo),
    card('Voice messages', 'Download one without playing it.', voiceDemo),
    card('Right-click download', 'From the browser’s context menu.', ctxDemo),
    card('Keyboard shortcuts', 'All of them rebindable.', keyDemo),
  ];
  const grid = h('div', { class: 'xgrid' }, ...cards);
  root.append(cap.el, grid);

  const flash = (el, t0) => {
    const p = prog(t, t0 - 0.1, t0 + 0.05) * (1 - prog(t, t0 + 0.35, t0 + 0.6));
    el.style.background = `rgb(157 156 255 / ${0.28 * p})`;
  };
  let t = 0;
  const toastIn = (el, t0) => {
    const p = prog(t, t0 + 0.1, t0 + 0.3, ease.outQuart);
    style(el, { opacity: String(p), transform: `translate(-50%, ${(1 - p) * 8}px)` });
  };

  return {
    root,
    update(time) {
      t = time;
      cap.update(t, start + 0.1);
      const F = XT.fire;
      cards.forEach((c, i) => {
        const p = prog(t, XT.cards + i * 0.07, XT.cards + 0.55 + i * 0.07, ease.outQuart);
        style(c, { opacity: String(p), transform: `translateY(${(1 - p) * 40}px) scale(${lerp(0.96, 1, p)})` });
      });
      const sw = prog(t, F[0], F[0] + 0.35, ease.inOut);
      style(rel, { opacity: String(1 - sw), filter: `blur(${sw * 6}px)`, transform: `translateY(${-sw * 10}px)` });
      style(abs, { opacity: String(sw), filter: `blur(${(1 - sw) * 6}px)`, transform: `translateY(${(1 - sw) * 10}px)` });
      flash(copyBtn, F[1]);
      toastIn(t2, F[1]);
      flash(gifBtn, F[2]);
      toastIn(t3, F[2]);
      gif.firstElementChild && (gif.firstElementChild.style.transform = `scale(${1.1 + Math.sin(t * 3) * 0.05}) translateX(${Math.sin(t * 2) * 6}px)`);
      vbtn.style.background = `rgb(127 127 127 / ${0.16 + 0.3 * prog(t, F[3] - 0.1, F[3]) * (1 - prog(t, F[3] + 0.3, F[3] + 0.5))})`;
      vbtn.style.transform = `scale(${1 - 0.1 * clamp(1 - Math.abs(t - F[3]) / 0.1)})`;
      toastIn(t4, F[3]);
      ctxItem.style.background = t > F[4] - 0.2 ? 'rgb(255 255 255 / 0.1)' : '';
      keyRows.forEach((r, i) => {
        const k0 = F[5] - 1.2 + i * 0.35;
        const p = clamp(1 - Math.abs(t - k0) / 0.2);
        r.querySelectorAll('kbd').forEach((k) => style(k, { transform: `translateY(${p * 2}px)`, boxShadow: `0 ${3 - p * 2}px 0 #0b0c12, inset 0 1px 0 rgb(255 255 255 / 0.12)`, background: p > 0.3 ? '#3a3d52' : '' }));
      });
    },
  };
}
