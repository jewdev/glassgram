import { defineConfig } from 'vitest/config';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

// `--mode firefox` builds the Firefox add-on into dist-firefox/; anything else the Chrome one into dist/.
export default defineConfig(({ mode }) => {
  const firefox = mode === 'firefox';
  return {
    plugins: [
      crx({
        manifest,
        browser: firefox ? 'firefox' : 'chrome',
        // Self-contained IIFEs: no loader that import()s chunks, so no web_accessible_resources a page
        // could probe for.
        contentScripts: { standaloneFiles: ['src/inject/main-world.ts', 'src/content/index.ts'] },
      }),
    ],
    build: {
      outDir: firefox ? 'dist-firefox' : 'dist',
      // Firefox 128 is the oldest the add-on allows (see manifest.config.ts).
      target: firefox ? 'firefox128' : 'chrome120',
      cssTarget: firefox ? 'firefox128' : 'chrome123', // keep native light-dark() (Chrome 123+, Firefox 120+)
      rollupOptions: {
        // Firefox has no offscreen documents: its background page runs the jobs itself.
        input: firefox ? undefined : { offscreen: 'src/offscreen/offscreen.html' },
      },
    },
    server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
    test: { include: ['tests/**/*.test.ts'] },
  };
});
