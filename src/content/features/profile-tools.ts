import { getUserId, myUserId } from '../core/api';
import { currentRoute, onRouteChange, type Route } from '../core/router';
import { getSettings } from '../core/state';
import { h, icon, ICONS, uiLayer } from '../ui/dom';
import { openBulkDownload } from './bulk-download';
import { openUnfollowers } from './unfollowers';
import type { Feature } from './types';

let refresh: (() => void) | undefined;

/** Floating action button on profile pages: bulk download + unfollowers checker. */
export const profileTools: Feature = {
  id: 'profile-tools',
  isEnabled: (s) => s['bulk.enabled'] || s['account.unfollowers'],
  start() {
    const menu = h('div', { class: 'ige-fab__menu', role: 'menu' });
    const fab = h('button', { class: 'ige-fab__btn', type: 'button', title: 'Glassgram tools', 'aria-haspopup': 'menu', html: icon(ICONS.spark, 20) });
    const root = h('div', { class: 'ige-fab' }, menu, fab);
    uiLayer().append(root);

    const toggle = (open?: boolean) => root.classList.toggle('is-open', open);
    fab.addEventListener('click', (e) => {
      e.stopPropagation();
      toggle();
    });
    const onDocClick = (e: MouseEvent) => !root.contains(e.target as Node) && toggle(false);
    document.addEventListener('click', onDocClick, true);

    let token = 0;
    const update = async (r: Route) => {
      const my = ++token;
      toggle(false);
      root.classList.remove('is-visible');
      if (r.kind !== 'profile' || !r.username) return;
      const s = getSettings();
      const username = r.username;
      const items: HTMLElement[] = [];
      if (s['bulk.enabled']) {
        items.push(h('button', { class: 'ige-menuitem', type: 'button', role: 'menuitem', onClick: () => (toggle(false), openBulkDownload(username)), html: `${icon(ICONS.grid, 16)}<span>Download all posts</span>` }));
      }
      if (s['account.unfollowers']) {
        const own = await getUserId(username).then((id) => id === myUserId()).catch(() => false);
        if (my !== token) return;
        if (own) items.push(h('button', { class: 'ige-menuitem', type: 'button', role: 'menuitem', onClick: () => (toggle(false), openUnfollowers()), html: `${icon(ICONS.users, 16)}<span>Unfollowers checker</span>` }));
      }
      menu.replaceChildren(...items);
      root.classList.toggle('is-visible', items.length > 0);
    };

    refresh = () => update(currentRoute());
    refresh();
    const off = onRouteChange(update);
    return () => {
      refresh = undefined;
      off();
      document.removeEventListener('click', onDocClick, true);
      root.remove();
    };
  },
  onSettings: () => refresh?.(),
};
