// Tiny static server for the promo composition.
//   /promo/*  → this folder (the scenes)
//   /repo/*   → the repository root (real Glassgram CSS, icons and source read by the scenes)
//   /*        → dist/ (the built extension), with a chrome.* shim injected into its HTML pages
// so the real settings page and popup run inside the video without being installed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');
const DIST = join(REPO, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.ts': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

const SHIM = '<script src="/promo/shim/chrome-shim.js"></script>';

function pick(pathname) {
  if (pathname.startsWith('/promo/')) return { root: HERE, rel: pathname.slice('/promo/'.length) };
  if (pathname.startsWith('/repo/')) return { root: REPO, rel: pathname.slice('/repo/'.length) };
  return { root: DIST, rel: pathname.slice(1), dist: true };
}

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let { root, rel, dist } = pick(decodeURIComponent(url.pathname));
      if (!rel || rel.endsWith('/')) rel += 'index.html';
      const file = normalize(join(root, rel));
      if (!file.startsWith(root)) throw Object.assign(new Error('forbidden'), { code: 'EACCES' });
      let body = await readFile(file);
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      if (dist && extname(file) === '.html') body = Buffer.from(body.toString().replace('<head>', `<head>${SHIM}`));
      res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 'EACCES' ? 403 : 404);
      res.end(String(e.message));
    }
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port })));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(Number(process.env.PORT) || 5178);
  console.log(`Promo preview: http://127.0.0.1:${port}/promo/index.html  (add ?t=12.5 to jump, ?play to play)`);
}
