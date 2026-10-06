# Glassgram promo video

Source for `docs/glassgram-promo.mp4` (and `.webm`): a 90 second, 1920×1080 product video.

Every frame is rendered from HTML in headless Chromium, then encoded with FFmpeg. The soundtrack and
sound effects are synthesized in code, so no stock footage, music, or samples are involved.

## Render

Needs Node.js 20+, FFmpeg on `PATH`, and the Playwright Chromium build.

```sh
cd promo
npm install
npx playwright install chromium   # first time only
npm run render                    # → ../docs/glassgram-promo.mp4, .webm and -poster.jpg
```

The render builds the extension first (`npm run build` in the repo root) if `dist/` is missing.
A full render takes a few minutes. Useful flags:

| Command | What it does |
| :--- | :--- |
| `node render.mjs --stills 6.5,38,63` | PNG stills into `out/stills/` for quick review |
| `node render.mjs --from 41 --to 49.5 --out out/feed.mp4` | Render one slice |
| `node render.mjs --no-webm` | Skip the VP9 encode |
| `node render.mjs --reencode` | Re-encode from the frames already in `out/segments` (no re-render) |
| `node render.mjs --mp4-mb 9.3` | Size budget for the MP4. GitHub only plays files under ~10 MB in its file viewer |
| `node render.mjs --workers 8` | More parallel browser pages |
| `node render.mjs --audio track.wav` | Use your own soundtrack instead of the synthesized one |
| `node render.mjs --build` | Rebuild the extension before rendering |
| `npm run preview` | Serve the composition at `http://127.0.0.1:5178/promo/index.html` (`?t=12` to jump, `?play` to play, arrow keys step frames) |
| `npm run audio` | Write only the soundtrack to `out/audio.wav` |

## What's real and what's recreated

- **Real:** the settings page and the toolbar popup are the built extension pages from `dist/`,
  running in iframes. A small `chrome.*` stand-in (`shim/chrome-shim.js`) replaces the extension
  APIs, and the scenes flip the real switches. Glassgram's in-page UI (download toolbar, video bar,
  image viewer, story panel, follow badge, unfollowers dialog, unsent-message mark and panel, voice
  download button, toasts) uses the extension's own stylesheet
  (`src/content/ui/styles.css`), class names and icons. The icons are parsed from
  `src/content/ui/dom.ts` and `src/shared/icons.ts` at render time. Labels, toast texts, filename
  format, toolbar placement and button order follow the source code. The manifest snippet is read from
  `manifest.config.ts`.
- **Recreated:** Instagram itself. Automating the live site isn't reliable or appropriate for a
  promo, so the Instagram pages are a static dark-mode recreation with fictional accounts and
  generated artwork (`src/art.js`). The interactions shown are the ones the code performs on the
  real site. No Instagram logo or wordmark is drawn.

## Layout

| Path | Purpose |
| :--- | :--- |
| `index.html` | The 1920×1080 stage |
| `src/timeline.js` | Scene timings, interaction beats and sound cues, shared by picture and sound |
| `src/scenes/*.js` | One function per scene (`account.js`: unfollowers, unsent messages, small extras). Each one returns `{ root, update(t) }`, a pure function of time |
| `src/ig.js` | Instagram UI recreation and the browser window frame |
| `src/kit.js` | Captions, cursor, Glassgram UI helpers |
| `src/art.js` | Procedural SVG artwork (landscapes, city, reel animation, avatars) |
| `audio/make-audio.mjs` | Music (120 BPM) and UI sound effects → 48 kHz WAV |
| `render.mjs` | Frame capture with parallel pages → H.264 segments → final MP4/WebM with loudness-normalized audio |
| `serve.mjs` | Static server: `/promo`, `/repo` (the source tree) and `/` (`dist/`, with the shim injected) |

To retime the video, edit `src/timeline.js`. The sound effects follow automatically.

## Scene order

Problem → Glassgram → Downloads → HD profile pictures → Story mentions → Follow badge → Unfollowers
checker → Declutter + following-only feed → Video controls → Clean links + privacy settings → Keep
unsent messages → Small extras (timestamps, copy comment, Save GIF, voice download, right-click,
shortcuts) → Settings page + popup → Runs in your browser / open source → Call to action.

Features the README marks as not tested yet (Hide "Seen", anonymous live viewing) are not
demonstrated; they only appear, with their *Not tested yet* tag, on the real settings page.
