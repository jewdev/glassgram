import { defineConfig } from 'vitest/config';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [
    crx({
      manifest,
      contentScripts: { standaloneFiles: ['src/inject/main-world.ts'] },
    }),
  ],
  build: {
    target: 'chrome120',
    cssTarget: 'chrome123', // keep native light-dark() (Chrome 123+)
    rollupOptions: {
      input: { offscreen: 'src/offscreen/offscreen.html' },
    },
  },
  server: { port: 5173, strictPort: true, hmr: { port: 5173 } },
  test: { include: ['tests/**/*.test.ts'] },
});
