import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

const IG = ['https://www.instagram.com/*'];

export default defineManifest({
  manifest_version: 3,
  name: 'Instagram Enhanced',
  version: pkg.version,
  description: 'Download posts, reels, stories & HD profile pictures, plus video controls, declutter and more for Instagram.',
  icons: { 16: 'icons/16.png', 32: 'icons/32.png', 48: 'icons/48.png', 128: 'icons/128.png' },
  action: { default_popup: 'src/popup/index.html', default_icon: { 16: 'icons/16.png', 32: 'icons/32.png' } },
  options_ui: { page: 'src/options/index.html', open_in_tab: true },
  background: { service_worker: 'src/background/index.ts', type: 'module' },
  permissions: ['downloads', 'storage', 'contextMenus', 'offscreen', 'declarativeNetRequest'],
  host_permissions: ['https://*.instagram.com/*', 'https://*.cdninstagram.com/*', 'https://*.fbcdn.net/*'],
  content_scripts: [
    { matches: IG, js: ['src/inject/main-world.ts'], run_at: 'document_start', world: 'MAIN' },
    { matches: IG, js: ['src/content/index.ts'], run_at: 'document_start' },
  ],
});
