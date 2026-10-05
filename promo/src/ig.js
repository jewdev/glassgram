// A faithful-enough recreation of instagram.com's dark web UI, used as the stage Glassgram works on.
// No Instagram logo or wordmark is drawn (Glassgram must never look like an official Meta product).
import { h, frag } from './lib.js';
import { avatar, toUrl } from './art.js';

const ic = (d, size = 24, extra = '') =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

export const IG_ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>',
  reels: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M3 8h18M8.5 3l3 5M14.5 3l3 5"/><path d="m10 11.5 4.5 2.5-4.5 2.5Z"/>',
  messages: '<path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4-7-7-4Z"/>',
  heart: '<path d="M12 20s-7.5-4.6-9.2-9.3C1.6 7.2 3.8 4 7.2 4c2 0 3.6 1.1 4.8 2.8C13.2 5.1 14.8 4 16.8 4c3.4 0 5.6 3.2 4.4 6.7C19.5 15.4 12 20 12 20Z"/>',
  create: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 8v8M8 12h8"/>',
  comment: '<path d="M20.5 11.5a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.6-4.4A8.5 8.5 0 1 1 20.5 11.5Z"/>',
  share: '<path d="M21 3 10 14"/><path d="M21 3 14.5 21l-4-7-7-4Z"/>',
  save: '<path d="M19 21 12 16l-7 5V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1Z"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  mute: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  chevL: '<path d="m15 18-6-6 6-6"/>',
  chevR: '<path d="m9 18 6-6-6-6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
};
export const igIcon = (name, size, extra) => ic(IG_ICONS[name], size, extra);

// ---------------- people (all fictional) ----------------
export const PEOPLE = {
  nora: { user: 'nora.travels', name: 'Nora Lind', pic: toUrl(avatar(11, 'peak')) },
  luca: { user: 'luca.mrtn', name: 'Luca Martin', pic: toUrl(avatar(42, 'wave')) },
  kalma: { user: 'studio.kalma', name: 'Studio Kalma', pic: toUrl(avatar(77, 'dot')) },
  juno: { user: 'juno.eats', name: 'Juno Park', pic: toUrl(avatar(5, 'cup')) },
  dunes: { user: 'daily.dunes', name: 'Daily Dunes', pic: toUrl(avatar(93, 'sun')) },
  fern: { user: 'fern.and.fog', name: 'Fern & Fog', pic: toUrl(avatar(31, 'leaf')) },
  ivo: { user: 'ivo.frames', name: 'Ivo Novak', pic: toUrl(avatar(64, 'peak')) },
  mara: { user: 'mara.sea', name: 'Mara Costa', pic: toUrl(avatar(18, 'wave')) },
  you: { user: 'you', name: 'You', pic: toUrl(avatar(150, 'dot')) },
  brand: { user: 'aurora.audio', name: 'Aurora Audio', pic: toUrl(avatar(201, 'dot')) },
};

export function avatarEl(p, size = 32, ring = false) {
  const img = h('img', { class: 'ig-av', src: p.pic, alt: '', style: { width: `${size}px`, height: `${size}px` } });
  return ring ? h('span', { class: 'ig-ring', style: { '--s': `${size}px` } }, img) : img;
}

// ---------------- browser window ----------------
const GG_ICON = '/repo/docs/icon.svg';

export function browserWindow({ w, h: height, url = 'instagram.com', title = 'Instagram', favicon = 'ig' }) {
  const [host, ...rest] = url.split('/');
  const fav = favicon === 'gg' ? `<img src="${GG_ICON}" width="16" height="16" style="border-radius:4px">` : '<span class="win__fav"></span>';
  const el = frag(`
    <div class="win" style="width:${w}px;height:${height}px">
      <div class="win__tabs">
        <div class="win__tab">${fav}<span>${title}</span>${ic(IG_ICONS.close, 14)}</div>
        <div class="win__plus">${ic('<path d="M12 6v12M6 12h12"/>', 16)}</div>
        <div class="win__ctrls"><span>${ic('<path d="M5 12h14"/>', 16)}</span><span>${ic('<rect x="6" y="6" width="12" height="12" rx="1"/>', 14)}</span><span>${ic(IG_ICONS.close, 16)}</span></div>
      </div>
      <div class="win__bar">
        <span class="win__nav">${ic('<path d="M19 12H5M11 6l-6 6 6 6"/>', 18)}</span>
        <span class="win__nav win__nav--dim">${ic('<path d="M5 12h14M13 6l6 6-6 6"/>', 18)}</span>
        <span class="win__nav">${ic('<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>', 17)}</span>
        <div class="win__omni">${ic('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', 15)}<span class="win__url"><b>${host}</b>${rest.length ? '/' + rest.join('/') : ''}</span></div>
        <div class="win__ext">
          <span class="win__gg"><img src="${GG_ICON}" width="20" height="20"></span>
          <span class="win__dl" hidden>${ic('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>', 18)}<i class="win__dlring"></i></span>
          <span>${ic('<path d="M10 3h4v3a2 2 0 1 0 4 0V3h3v7h-3a2 2 0 1 0 0 4h3v7h-7v-3a2 2 0 1 0-4 0v3H3v-7h3a2 2 0 1 0 0-4H3V3h7Z"/>', 17)}</span>
          <span class="win__me"></span>
          <span>${ic(IG_ICONS.more.replace(/cx="(\d+)" cy="12"/g, 'cx="12" cy="$1"'), 18)}</span>
        </div>
      </div>
      <div class="win__view"></div>
    </div>`);
  return { el, view: el.querySelector('.win__view'), url: el.querySelector('.win__url'), dl: el.querySelector('.win__dl') };
}

// ---------------- Instagram pieces ----------------
export function navRail({ active = 'home' } = {}) {
  const items = ['home', 'search', 'explore', 'reels', 'messages', 'heart', 'create'];
  return h(
    'nav',
    { class: 'ig-rail' },
    h('div', { class: 'ig-rail__logo' }),
    ...items.map((k) => h('a', { class: `ig-rail__item${k === active ? ' is-active' : ''}`, 'data-nav': k, html: igIcon(k, 26, k === active ? 'stroke-width="2.4"' : '') })),
    h('a', { class: 'ig-rail__item', 'data-nav': 'profile' }, avatarEl(PEOPLE.you, 26)),
    h('a', { class: 'ig-rail__item ig-rail__item--end', html: igIcon('menu', 26) }),
  );
}

export function storiesTray(people) {
  return h(
    'div',
    { class: 'ig-tray', 'data-ige-stories': '' },
    ...people.map((p, i) => h('div', { class: 'ig-tray__item' }, avatarEl(p, 62, i < 5 ? true : 'seen'), h('span', {}, p.user.length > 10 ? p.user.slice(0, 9) + '…' : p.user))),
  );
}

export function post({ who, media, ratio = 1, ago = '2h', likes = '2,481', caption = '', comments = 48, sponsored = false, suggested = false, dots = 0, video = false, cta }) {
  const mediaEl = h('div', { class: 'ig-post__media', style: { aspectRatio: String(ratio) } });
  if (typeof media === 'string') mediaEl.innerHTML = media;
  else if (media) mediaEl.append(media);
  if (dots) mediaEl.append(h('div', { class: 'ig-post__dots' }, ...Array.from({ length: dots }, (_, i) => h('i', { class: i === 0 ? 'is-on' : '' }))));
  if (dots) mediaEl.append(h('div', { class: 'ig-post__count' }, `1/${dots}`));
  if (video) mediaEl.append(h('span', { class: 'ig-post__mute', html: igIcon('mute', 14) }));
  return h(
    'article',
    { class: 'ig-post', 'data-ige-flag': sponsored ? 'ad' : suggested ? 'suggested' : null },
    suggested ? h('div', { class: 'ig-post__sugg' }, 'Suggested for you') : null,
    h(
      'header',
      { class: 'ig-post__head' },
      avatarEl(who, 32, true),
      h('div', { class: 'ig-post__who' }, h('b', {}, who.user), sponsored ? h('span', {}, 'Sponsored') : h('span', {}, ` • ${ago}`)),
      suggested ? h('a', { class: 'ig-follow' }, 'Follow') : null,
      h('span', { class: 'ig-post__more', html: igIcon('more', 22) }),
    ),
    mediaEl,
    cta ? h('div', { class: 'ig-post__cta' }, h('span', {}, cta), h('span', { html: igIcon('chevR', 18) })) : null,
    h(
      'div',
      { class: 'ig-post__actions' },
      h('span', { html: igIcon('heart', 25) }),
      h('span', { html: igIcon('comment', 25) }),
      h('span', { html: igIcon('share', 24) }),
      h('span', { class: 'ig-push', html: igIcon('save', 24) }),
    ),
    h('div', { class: 'ig-post__likes' }, `${likes} likes`),
    caption ? h('div', { class: 'ig-post__cap' }, h('b', {}, who.user), ` ${caption}`) : null,
    comments ? h('div', { class: 'ig-post__dim' }, `View all ${comments} comments`) : null,
  );
}

export function sidebar(people) {
  return h(
    'aside',
    { class: 'ig-side', 'data-ige-sidebar': '' },
    h('div', { class: 'ig-side__me' }, avatarEl(PEOPLE.you, 44), h('div', {}, h('b', {}, 'you'), h('span', {}, 'Your name')), h('a', {}, 'Switch')),
    h('div', { class: 'ig-side__head' }, h('span', {}, 'Suggested for you'), h('b', {}, 'See all')),
    ...people.map((p) => h('div', { class: 'ig-side__row' }, avatarEl(p, 44), h('div', {}, h('b', {}, p.user), h('span', {}, 'Suggested for you')), h('a', {}, 'Follow'))),
    h('p', { class: 'ig-side__foot' }, 'About · Help · Press · API · Jobs · Privacy · Terms · Locations · Language'),
  );
}

export function profileHeader(p, { posts = '128', followers = '14.2K', following = '612', bio = [], big = 150, following_: fol = true } = {}) {
  return h(
    'header',
    { class: 'ig-prof' },
    h('div', { class: 'ig-prof__pic' }, avatarEl(p, big, true)),
    h(
      'section',
      { class: 'ig-prof__info' },
      h(
        'div',
        { class: 'ig-prof__row' },
        h('a', { class: 'ig-prof__user' }, h('h2', {}, h('span', {}, p.user))),
        h('span', { class: 'ig-btn ig-btn--grey' }, fol ? 'Following' : 'Follow'),
        h('span', { class: 'ig-btn ig-btn--grey' }, 'Message'),
        h('span', { class: 'ig-prof__more', html: igIcon('more', 24) }),
      ),
      h('div', { class: 'ig-prof__stats' }, h('span', {}, h('b', {}, posts), ' posts'), h('span', {}, h('b', {}, followers), ' followers'), h('span', {}, h('b', {}, following), ' following')),
      h('div', { class: 'ig-prof__name' }, p.name),
      ...bio.map((l) => h('div', { class: 'ig-prof__bio' }, l)),
    ),
  );
}
