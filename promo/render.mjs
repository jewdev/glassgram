// Renders the Glassgram promo: HTML scenes → frames (headless Chromium) → H.264/VP9 with synthesized audio.
//
//   node render.mjs                 full render → ../docs/glassgram-promo.mp4 (+ .webm, poster)
//   node render.mjs --no-webm       skip the WebM
//   node render.mjs --reencode      re-encode from the frames already in out/segments (no re-render)
//   node render.mjs --stills 3,12.5 just PNG stills into out/stills (for review)
//   node render.mjs --from 10 --to 20 --out out/part.mp4   render a slice
//   node render.mjs --workers 6     parallel browser pages (default: half the CPU threads, max 6)
//   node render.mjs --audio my.wav  use your own soundtrack instead of the synthesized one
import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';
import { makeAudio } from './audio/make-audio.mjs';
import { DURATION, FPS, SCENES } from './src/timeline.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = resolve(HERE, '..');
const OUT = join(HERE, 'out');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? def : args[i + 1];
};
const flag = (name) => args.includes(`--${name}`);

function run(cmd, argv, opts = {}) {
  const r = spawnSync(cmd, argv, { stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'npm', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${argv.join(' ')} failed (${r.status})`);
}

// 1. the real extension pages come from dist/
if (!existsSync(join(REPO, 'dist/src/options/index.html')) || flag('build')) {
  console.log('Building the extension (npm run build)…');
  run('npm', ['run', 'build'], { cwd: REPO });
}
mkdirSync(OUT, { recursive: true });

const { server, port } = await startServer();
const url = `http://127.0.0.1:${port}/promo/index.html?render`;
const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--hide-scrollbars', '--disable-lcd-text', '--font-render-hinting=none'] });

async function openPage() {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, colorScheme: 'dark' });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  page.on('console', (m) => m.type() === 'error' && console.error('[console]', m.text()));
  await page.goto(url);
  await page.waitForFunction(() => window.promoReady === true, null, { timeout: 60_000 });
  return page;
}

try {
  const stills = opt('stills');
  if (stills) {
    const dir = join(OUT, 'stills');
    mkdirSync(dir, { recursive: true });
    const page = await openPage();
    for (const t of stills.split(',').map(Number)) {
      await page.evaluate((t) => window.seek(t), t);
      const file = join(dir, `t${t.toFixed(2).padStart(6, '0')}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
  } else {
    const from = Number(opt('from', 0));
    const to = Math.min(DURATION, Number(opt('to', DURATION)));
    const first = Math.round(from * FPS);
    const total = Math.round(to * FPS) - first;
    const workers = Math.max(1, Math.min(Number(opt('workers', Math.min(6, Math.floor(cpus().length / 2)))), total));
    const segDir = join(OUT, 'segments');
    const list = join(segDir, 'list.txt');
    const reuse = flag('reencode') && existsSync(list);
    if (!reuse) {
    rmSync(segDir, { recursive: true, force: true });
    mkdirSync(segDir, { recursive: true });

    console.log(`Rendering ${total} frames at ${FPS} fps with ${workers} workers…`);
    const started = Date.now();
    let done = 0;
    const per = Math.ceil(total / workers);
    const segs = [];
    await Promise.all(
      Array.from({ length: workers }, async (_, w) => {
        const a = first + w * per;
        const b = Math.min(first + total, a + per);
        if (a >= b) return;
        const seg = join(segDir, `seg${String(w).padStart(2, '0')}.mp4`);
        segs[w] = seg;
        const page = await openPage();
        const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-c:v', 'libx264', '-preset', 'fast', '-crf', '10', '-pix_fmt', 'yuv420p', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
        const closed = new Promise((ok, fail) => ff.on('close', (c) => (c === 0 ? ok() : fail(new Error(`ffmpeg segment ${w} exited ${c}`)))));
        for (let i = a; i < b; i++) {
          await page.evaluate((t) => window.seek(t), i / FPS);
          const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
          if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
          if (++done % 60 === 0) {
            const el = (Date.now() - started) / 1000;
            process.stdout.write(`\r  ${done}/${total} frames · ${(done / el).toFixed(1)} fps · ~${Math.round(((total - done) * el) / done)}s left   `);
          }
        }
        ff.stdin.end();
        await closed;
        await page.close();
      }),
    );
    console.log(`\nFrames done in ${((Date.now() - started) / 1000).toFixed(0)}s.`);
    writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
    } else console.log('Reusing rendered frames from out/segments.');
    let wav = opt('audio') && resolve(process.cwd(), opt('audio'));
    if (!wav) {
      wav = join(OUT, 'audio.wav');
      console.log('Synthesizing music and sound effects…');
      makeAudio(wav);
    }

    const mp4 = resolve(HERE, opt('out', join(REPO, 'docs', 'glassgram-promo.mp4')));
    const audioArgs = ['-ss', String(from), '-t', String(to - from), '-i', wav];
    // GitHub only plays videos under ~10 MB in its file viewer, so the MP4 is encoded to a size budget
    // (two-pass, ~9.3 MB by default; --mp4-mb to change it).
    const seconds = to - from;
    const audioKbps = 128;
    const videoKbps = Math.floor((Number(opt('mp4-mb', 9.3)) * 8e6) / seconds / 1000 - audioKbps - 8);
    const passlog = join(OUT, 'x264pass');
    const vArgs = ['-c:v', 'libx264', '-preset', 'slower', '-tune', 'animation', '-b:v', `${videoKbps}k`, '-maxrate', `${videoKbps * 2}k`, '-bufsize', `${videoKbps * 4}k`, '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-passlogfile', passlog];
    console.log(`Encoding ${mp4} (${videoKbps} kbps video, two-pass)…`);
    run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...vArgs, '-pass', '1', '-an', '-f', 'mp4', process.platform === 'win32' ? 'NUL' : '/dev/null']);
    run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...audioArgs, '-map', '0:v', '-map', '1:a', ...vArgs, '-pass', '2', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'aac', '-b:a', `${audioKbps}k`, '-movflags', '+faststart', '-shortest', mp4]);

    if (!opt('out')) {
      run('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(SCENES.cta[0] + 5), '-i', mp4, '-frames:v', '1', '-q:v', '3', join(REPO, 'docs', 'glassgram-promo-poster.jpg')]);
      if (!flag('no-webm')) {
        const webm = join(REPO, 'docs', 'glassgram-promo.webm');
        console.log(`Encoding ${webm}…`);
        run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, ...audioArgs, '-map', '0:v', '-map', '1:a', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '36', '-row-mt', '1', '-cpu-used', '2', '-af', 'loudnorm=I=-15:TP=-1.5:LRA=11', '-c:a', 'libopus', '-b:a', '128k', '-shortest', webm]);
      }
    }
    console.log('Done.');
  }
} finally {
  await browser.close();
  server.close();
}
