// Rasterizes docs/icon.svg (the single source of truth for the logo) into public/icons/*.png
// and keeps public/icons/icon.svg (used by the settings page and popup) in sync.
// Needs a one-off SVG renderer:  npm i --no-save @resvg/resvg-js
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';

const svg = readFileSync('docs/icon.svg');
mkdirSync('public/icons', { recursive: true });
copyFileSync('docs/icon.svg', 'public/icons/icon.svg');
for (const size of [16, 32, 48, 128]) {
  writeFileSync(`public/icons/${size}.png`, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
}
