<p align="center">
  <img src="docs/icon.svg" width="128" alt="Glassgram">
</p>

<h1 align="center">Glassgram</h1>

<p align="center">
  <b>The tools Instagram's website leaves out.</b><br>
  Download media, zoom profile pictures, see who's mentioned in a story, and clean up your feed.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-4c8bf5?style=flat-square">
  <img alt="Chromium browsers" src="https://img.shields.io/badge/Brave%20%C2%B7%20Chrome%20%C2%B7%20Edge-supported-2ea44f?style=flat-square">
  <a href="LICENSE"><img alt="GPL-3.0 license" src="https://img.shields.io/badge/license-GPL--3.0-blue?style=flat-square"></a>
</p>

<p align="center">
  <a href="#install">Install</a> ·
  <a href="#what-you-get">What you get</a> ·
  <a href="docs/SETTINGS.md">Settings</a> ·
  <a href="#keyboard-shortcuts">Shortcuts</a> ·
  <a href="#privacy">Privacy</a> ·
  <a href="#disclaimer">Disclaimer</a>
</p>

<p align="center">
  <sub>An unofficial project. Not affiliated with, endorsed by, or sponsored by Instagram or Meta.</sub>
</p>

---

## See Glassgram in action

[![Watch the Glassgram demo (90 s)](docs/glassgram-promo-poster.jpg)](https://files.catbox.moe/5fhxnn.mp4)

<sub>The Instagram pages in the video are a recreation with fictional accounts. The Glassgram pages are real.</sub>

## Install

Glassgram isn't in a web store yet, so you load it by hand. It takes about a minute and needs no
coding tools.

1. Download **[glassgram.zip](https://github.com/jewdev/glassgram/releases/latest/download/glassgram.zip)**
   and unzip it. On Windows, right-click it and pick **Extract All**.
2. In your browser, open `brave://extensions` (or `chrome://extensions`, `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the unzipped folder, the one that contains `manifest.json`.

Open Instagram and hover over a post. Pin Glassgram from the puzzle-piece menu to get quick access to its popup.

> [!IMPORTANT]
> Keep the unzipped folder where it is. The browser reads the extension from it, so moving or
> deleting it disables Glassgram.

**To update**, wait for the **NEW** badge on Glassgram's icon, or press **Check now** in the settings sidebar.
The settings page shows what changed and walks you through it: download the ZIP, unzip it over the old
folder, and press **Reload Glassgram**. You can also grab the ZIP from the
[Releases](https://github.com/jewdev/glassgram/releases/latest) page yourself.

Works in any Chromium browser with Manifest V3 (Brave, Chrome, Edge, Opera, Vivaldi) on Windows,
macOS and Linux.

<details>
<summary>🛠️ Build from source</summary>

You need [Node.js](https://nodejs.org) 20+ and [Git](https://git-scm.com/downloads)
(on macOS: `xcode-select --install`).

```sh
git clone https://github.com/jewdev/glassgram
cd glassgram
npm install
npm run build
```

Then load the `dist` folder with **Load unpacked** as above. To update, `git pull`, rebuild, and
press reload on the extension's card.

</details>

## What you get

### ⬇️ Downloads

- **Hover toolbar** on posts, reels and stories: download one or all, copy media URL or caption. Always the highest resolution.
- **Filename templates** with folders, e.g. `Glassgram/{user}/{user}_{date}_{shortcode}_{index}`.
- **ZIP or separate files** for carousels and story trays.
- **Bulk profile download** of the latest N posts. Off by default.
- **Right-click download** and **voice message download** in chats.
- **Keep unsent messages**: when someone unsends a message, it stays visible with an unsent mark. Off by default.

### 👤 Profiles and stories

- **HD profile pictures** in a zoomable viewer.
- **Story mentions & stickers**, including hidden mentions, hashtags, locations, links and music.
- **Follow status badge**: *Follows you*, *Doesn't follow you back*, and more on click.
- **Unfollowers checker** with search and CSV export. Off by default.
- **No story auto-advance**. Off by default.

### 🧹 Feed and video

- **Declutter**: hide ads, suggested posts and accounts, stories tray, Reels and Explore tabs, Threads links.
- **Following-only feed**, **no double-click likes**.
- **Video controls**: seek, speed, volume, loop, autoplay off.

### 🔒 Privacy and links

- **Clean share links** without tracking parameters, with an optional domain swap (e.g. `kkinstagram.com`).
- **Direct links** that skip `l.instagram.com`, and **analytics blocking**.
- **Anonymous story viewing**, **hidden typing indicator and "Seen"** in DMs. Off by default.

### ✨ Small extras

Exact timestamps, copy comment, save GIFs from comments, a searchable settings page with
export/import, and a popup with quick toggles. Every feature can be switched off;
see the [settings reference](docs/SETTINGS.md) for all options and defaults.

## Keyboard shortcuts

Act on the hovered media, or the most visible post. Rebindable in settings.

| Key | What it does |
| :---: | :--- |
| `D` | Download current photo, video or story |
| `Shift` + `D` | Download all (carousel or story tray) |
| `Z` | Open profile picture full size |
| `Shift` + `C` | Copy media URL |

In the image viewer: wheel to zoom, drag to pan, `0` to reset, `Esc` to close.

## Privacy

Everything runs in your browser: no server, no analytics, nothing sent anywhere but Instagram. Requests
use your logged-in session; the extension never sees your password. The one exception is the update
check: twice a day it asks GitHub's public API for Glassgram's releases, sending nothing about you. Turn
off **Check for updates automatically** in the settings sidebar to stop it. Settings sync via
`chrome.storage.sync`; scan data and unsent messages stay local.

<details>
<summary>Permissions it asks for</summary>

| Permission | Why |
| :--- | :--- |
| `downloads` | Saving files |
| `storage` | Your settings |
| `contextMenus` | The right-click entry |
| `offscreen` | Building ZIPs |
| `declarativeNetRequest` | Blocking the story "seen" request |
| `alarms` | Checking for updates twice a day |
| `instagram.com`, `cdninstagram.com`, `fbcdn.net` | Working on Instagram and loading its media |
| `api.github.com` | Reading Glassgram's releases for the update check |

</details>

## Limitations

- Uses Instagram's private web API, which can change and break things at any time.
- Heavy use (bulk downloads, large unfollower scans) can get you rate-limited. Keep the default delays.
- Ads and suggestions are detected by label text, in English and a few other languages.
- Unsent messages are only caught while Instagram is open in this browser.

## Disclaimer

Glassgram is an independent, unofficial project, not affiliated with, endorsed by, or sponsored by
Instagram or Meta Platforms, Inc. "Instagram" is a trademark of Meta Platforms, Inc. Using it may go
against Instagram's Terms of Use; you use it at your own risk. Downloaded content belongs to its
creators: don't republish it without permission.

## Contributing

See [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

## License

[GNU GPL v3.0](LICENSE)
