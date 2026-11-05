import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

const IG = ['https://www.instagram.com/*'];

/** Never change it: Firefox and addons.mozilla.org know the add-on by this ID. */
export const GECKO_ID = 'glassgram@jewdev';
/** Firefox checks this for new signed versions (written to every GitHub release by CI). */
const FIREFOX_UPDATES = 'https://github.com/jewdev/glassgram/releases/latest/download/updates.json';

// `vite build --mode firefox` builds for Firefox, anything else for Chrome.
export default defineManifest(({ mode }) => {
  const firefox = mode === 'firefox';
  return {
    manifest_version: 3,
    name: 'Glassgram',
    version: pkg.version,
    description: 'Unofficial tweaks for Instagram: download posts, reels and stories, HD profile pictures, video controls and more. Not affiliated with Meta.',
    icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
    action: { default_popup: 'src/popup/index.html', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
    options_ui: { page: 'src/options/index.html', open_in_tab: true },
    // Firefox has no extension service workers: the background runs as an event page, and does the
    // ZIP and MP3 work Chrome hands to an offscreen document.
    background: firefox ? { scripts: ['src/background/index.ts'], type: 'module' } : { service_worker: 'src/background/index.ts', type: 'module' },
    permissions: ['downloads', 'storage', 'contextMenus', ...(firefox ? [] : ['offscreen']), 'declarativeNetRequest', 'unlimitedStorage', 'alarms'],
    host_permissions: ['https://*.instagram.com/*', 'https://*.cdninstagram.com/*', 'https://*.fbcdn.net/*', 'https://api.github.com/*', 'https://github.com/*', 'https://release-assets.githubusercontent.com/*', 'https://objects.githubusercontent.com/*'],
    content_scripts: [
      { matches: IG, js: ['src/inject/main-world.ts'], run_at: 'document_start', world: 'MAIN' },
      { matches: IG, js: ['src/content/index.ts'], run_at: 'document_start' },
    ],
    ...(firefox && {
      browser_specific_settings: {
        // 128: first Firefox with `world: 'MAIN'` content scripts.
        gecko: { id: GECKO_ID, strict_min_version: '128.0', update_url: FIREFOX_UPDATES, data_collection_permissions: { required: ['none'] } },
      },
    }),
  };
});
