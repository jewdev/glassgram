<p align="center">
  <img src="docs/icon.svg" width="128" alt="Glassgram">
</p>

<h1 align="center">Glassgram</h1>

<p align="center">
  Downloads, HD profile pictures, story mentions, follow badges and a cleaner feed for instagram.com.<br>
  An unofficial browser extension for Brave, Chrome, Edge and other Chromium browsers. Every feature has its own switch.<br>
  <sub>Not affiliated with, endorsed by, or sponsored by Instagram or Meta.</sub>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#features">Features</a> ·
  <a href="#settings">Settings</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#disclaimer">Disclaimer</a> ·
  <a href="LICENSE">License</a>
</p>

## Install

Build it, then load the `dist` folder as an unpacked extension:

```sh
git clone https://github.com/jewdev/glassgram
cd glassgram
npm install
npm run build
```

1. Open `brave://extensions` (or `chrome://extensions`, `edge://extensions`).
2. Turn on **Developer mode**, top right.
3. Click **Load unpacked** and pick the `dist` folder.

The settings page opens on first install. Later, open it from the extension's icon → gear, or from
**Details → Extension options**. After pulling changes, run `npm run build` again, press reload on
the extension's card, and refresh Instagram.

Node.js 20 or later to build. Works on Windows, macOS and Linux.

## Features

Instagram's web app is built to be looked at, not kept. This extension adds the tools it leaves out,
and where it can, it reuses data the page already loaded instead of sending its own requests.

- **A download toolbar on every post, reel and story** — hover the media for: download this item,
  download all (carousel or story tray), copy media URL, copy caption. Always the highest resolution
  Instagram serves. Files are named from a template you choose, and several files can go into one ZIP.
- **HD profile pictures** — hover a profile picture to open it full size (wheel to zoom, drag to pan),
  download it, or copy its URL.
- **Story mentions & stickers** — an **@** button on stories lists everyone mentioned, including
  mentions the poster hid (shrunk to nothing, flagged hidden, or pushed outside the frame), plus
  hashtags, location, link stickers, music and shared posts.
- **Follow status badge** — next to the username on any profile: *Follow each other*,
  *Follows you*, *Doesn't follow you back* or *Doesn't follow you*. It re-checks after you press
  Follow or Unfollow.
- **Bulk profile download** — a floating button on profiles downloads the latest N posts, photos
  and/or videos, as separate files or one ZIP. It pages through posts the same way Instagram's own
  grid does, with a delay between requests.
- **Unfollowers checker** — who doesn't follow you back and who you don't follow back, with search
  and CSV export. Long scans save their progress and resume later.
- **Video controls** — a bar with seek, speed, volume and loop on every video and reel. Speed and
  volume are remembered.
- **A cleaner feed** — hide sponsored posts, suggested posts, the suggestions sidebar, the stories
  tray, the Reels and Explore tabs, and Threads links. Each one separately.
- **Following-only feed** — Home always opens Instagram's chronological feed of accounts you follow.
- **No accidental likes, no autoplay** — double-clicking a photo no longer likes it, and videos wait
  until you click them. Both optional.
- **Copy comment** — a *Copy* button next to every comment.
- **Clean share links** — "Copy link" gives you the link without `utm_source`, `stkn` or `igsh`
  tracking, optionally on another domain (for example `kkinstagram.com`, for previews in Discord or
  Telegram).
- **Direct links** — outbound links skip Instagram's `l.instagram.com` redirect page.
- **Voice messages** — a download button on every voice message in your chats, without playing it.
- **DM privacy** — hide the typing indicator (experimental) and the "Seen" receipt (not tested yet).
  Only typing or read requests are stopped, so sending messages keeps working.
- **Block analytics** — blocks Instagram's event-logging requests.
- **Anonymous story viewing** — blocks the request that marks a story as seen, so you don't appear in
  its viewer list. Off by default.
- **Exact timestamps** — "3d" becomes the real date and time; hover for the original.
- **Right-click download** — *Download Instagram media* in the context menu.
- **Keyboard shortcuts** — download, download all, zoom a profile picture, copy URL. Rebindable.
- **One settings page** — every option grouped, searchable, with export and import. A popup holds
  quick toggles for the ones you change most.

## Requirements

- A Chromium-based browser that supports Manifest V3: Brave, Chrome, Edge, Opera, Vivaldi
- Logged in to instagram.com. Every request goes through your own session
- Node.js 20 or later, to build

## Settings

Open the settings page from the extension's icon → gear. Changes apply immediately, with no reload,
except anonymous story viewing, which needs Instagram refreshed.

| Group | Setting | Default | What it does |
| --- | --- | --- | --- |
| Media downloads | Download toolbar on posts & reels | on | The hover toolbar on photos and videos |
| | "Download all" for carousels | on | Shown when a post has several items |
| | "Copy media URL" button | on | |
| | "Copy caption" button | on | |
| | Filename template | `Instagram/{user}/{user}_{date}_{shortcode}_{index}` | Tokens: `{user}` `{shortcode}` `{index}` `{id}` `{date}` `{time}` `{type}`. `/` makes folders inside Downloads |
| | Multiple files | separate files | Separate files in a folder, or a single ZIP |
| | Ask where to save each file | off | The "Save as" dialog for single downloads |
| Stories | Download stories & highlights | on | Current story or the whole tray |
| | Story mentions & stickers | on | The **@** button and its panel |
| Profile | HD profile picture | on | Zoom, download, copy URL |
| | Follow status badge | on | The badge next to the username |
| | Bulk download profile posts | on | The floating button on profiles |
| | Min / max delay between requests | 1.5 s / 3.5 s | Spacing for bulk download |
| Feed | Following-only feed | off | Home opens the Following feed |
| | Disable double-click like | off | |
| Video | Video control bar | on | Seek, speed, volume, loop |
| | Disable video autoplay | off | Stories still play |
| | Default playback speed | 1× | 0.5× to 3× |
| | Remember volume | on | |
| | Loop videos | on | |
| Declutter | Hide sponsored posts | on | |
| | Hide "Suggested for you" posts | off | |
| | Hide suggested accounts sidebar | off | |
| | Hide stories tray on home | off | |
| | Hide Reels tab · Hide Explore tab | off | |
| | Hide Threads banners & links | on | |
| Shortcuts | Enable keyboard shortcuts | on | Keys are set in the next section |
| Info extras | Exact timestamps | on | Date + time (12h or 24h), or date only |
| | Right-click "Download Instagram media" | on | |
| | Copy comment button | on | |
| Links | Clean share links | on | Strip tracking from copied links |
| | Share domain | empty | Replace `instagram.com` in copied links, e.g. `kkinstagram.com` |
| | Open links directly | on | Skip `l.instagram.com` |
| Privacy | Anonymous story viewing | off | Blocks the story "seen" request |
| | Block analytics | off | Blocks `/ajax/bz`, `/ajax/qm`, `/logging` |
| Direct messages | Download voice messages | on | A download button on each voice message |
| | Hide typing indicator | off | Experimental |
| | Hide "Seen" | off | Not tested yet |
| Account tools | Unfollowers checker | on | Opened from the popup or your own profile |
| | Min / max delay between requests | 2 s / 4 s | Spacing for the scan |

**Reset to defaults**, **Export settings** and **Import settings** are at the bottom of the page.

## Keyboard shortcuts

Shortcuts act on the media under the mouse, or the most visible post when nothing is hovered. They
don't fire while you're typing.

| Key | What it does |
| --- | --- |
| `D` | Download the current photo, video or story |
| `Shift` + `D` | Download all: every carousel item, or the whole story tray |
| `Z` | Open the profile picture full size (on a profile) |
| `Shift` + `C` | Copy the media URL |

In the image viewer: wheel to zoom, drag to pan, double-click or `0` to reset, `Esc` to close.

## Privacy and security

- Everything runs in your browser. The extension has no server, no analytics, and sends nothing
  anywhere except Instagram and its image servers.
- Requests use your logged-in Instagram session, the same way the Instagram website does. The
  extension never sees your password. It reads two cookies, the CSRF token (sent back to Instagram
  with requests) and your user ID (to tell your own profile apart), and stores neither.
- Settings sync through your browser account (`chrome.storage.sync`). The unfollowers scan and the
  remembered volume stay on this device (`chrome.storage.local`).
- Permissions: `downloads` (saving files), `storage` (settings), `contextMenus` (the right-click
  entry), `offscreen` (building ZIPs), `declarativeNetRequest` (blocking the story "seen" request),
  and access to `instagram.com`, `cdninstagram.com` and `fbcdn.net`.

## Limitations

- It uses Instagram's private web API, which Instagram can change at any time. When something
  breaks, the fix is usually in `src/content/core/selectors.ts` or `src/inject/main-world.ts`.
- Heavy use, such as bulk-downloading large profiles or scanning accounts with many followers, can
  get your account temporarily rate-limited. Keep the default delays.
- Bulk download pages through posts with the request Instagram's own profile grid sends. If you
  open a profile and the extension hasn't seen that request yet, reload the profile once.
- Ads and suggestions are recognised by their label text, in English and a few other languages.
- Hide typing indicator is experimental and Hide "Seen" isn't tested yet: confirming them means
  someone else has to watch the result. Try them with a friend before relying on them.
- Block analytics stops Instagram's logging requests, but some analytics also travel over its live
  connection, mixed with other traffic, and are left alone.
- Downloading someone else's content doesn't give you the right to reuse it. Respect the creators
  and Instagram's terms.

## Development

```sh
npm run dev        # dev build with hot reload (load dist/ the same way)
npm run build      # typecheck and production build into dist/
npm test           # unit tests
```

The page script is `src/inject/main-world.ts`: it runs before Instagram's own code, caches the
posts and users Instagram loads, replays Instagram's profile queries for bulk download, blocks the
story "seen" request, cleans copied links, unwraps `l.instagram.com`, stops DM typing and read
requests, and tags voice-message bubbles with their audio URL. The content script lives in `src/content/`, one file per feature in
`features/`, and every assumption about Instagram's markup in `core/selectors.ts`. The background
worker (`src/background/`) queues downloads and builds ZIPs in an offscreen document. Every setting
is defined once in `src/shared/settings-schema.ts`; the settings page and popup are generated from it.

## Disclaimer

Glassgram is an independent, unofficial project. It is not affiliated with, endorsed by, or
sponsored by Instagram or Meta Platforms, Inc. "Instagram" is a trademark of Meta Platforms, Inc.,
used here only to describe what the extension works with.

The extension runs in your browser with your own Instagram session and uses Instagram's private web
interface, which can change at any time. Using it may go against Instagram's Terms of Use, and heavy
use of features such as bulk download or the unfollowers checker can get your account temporarily
rate-limited. You use it at your own risk.

Downloaded photos, videos and voice messages belong to the people who posted or sent them. Only
download what you have the right to keep, and don't republish other people's content without their
permission.

## License

MIT
