import { onRouteChange } from '../core/router';
import { REEL_AD_WORDS } from '../core/selectors';
import type { Feature } from './types';

/** Only the Reels tab (/reels/...): a single reel opened from a post or a chat is never skipped. */
const onReelsTab = () => location.pathname.startsWith('/reels/');

/** The scroll-snap list the reels sit in, found from any reel's video. */
function reelList(): HTMLElement | null {
  const v = document.querySelector('main video');
  for (let el = v?.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

/** The reel filling the list now: one child of the list per reel. */
function currentReel(list: HTMLElement): Element | undefined {
  const top = list.getBoundingClientRect().top;
  return [...list.children].find((c) => {
    const r = c.getBoundingClientRect();
    return r.height > 200 && Math.abs(r.top - top) < r.height / 2;
  });
}

function isAd(reel: Element): boolean {
  for (const el of reel.querySelectorAll('span')) {
    if (el.childElementCount === 0 && REEL_AD_WORDS.includes(el.textContent?.trim() ?? '')) return true;
  }
  return false;
}

/** With "Hide sponsored posts" on, the Reels tab moves past ad reels in the direction you scroll. */
export const reelAds: Feature = {
  id: 'reel-ads',
  isEnabled: (s) => s['declutter.ads'],
  start() {
    let lastTop = 0;
    let down = true;
    let timers: ReturnType<typeof setTimeout>[] = [];

    const check = () => {
      if (!onReelsTab()) return;
      const list = reelList();
      if (!list) return;
      if (list.scrollTop !== lastTop) down = list.scrollTop > lastTop;
      lastTop = list.scrollTop;
      const reel = currentReel(list);
      if (!reel || !isAd(reel)) return;
      // At the very top there is nothing to go back to: skip forward instead.
      const dir = down || list.scrollTop < list.clientHeight / 2 ? 1 : -1;
      list.scrollBy({ top: dir * list.clientHeight, behavior: 'smooth' });
    };
    // Instagram changes the address for every reel; its label can render a moment later.
    const onRoute = () => {
      timers.forEach(clearTimeout);
      timers = [150, 700, 1500].map((ms) => setTimeout(check, ms));
    };
    const off = onRouteChange(onRoute);
    onRoute();
    return () => {
      off();
      timers.forEach(clearTimeout);
    };
  },
};
