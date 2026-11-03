# Settings reference

Every Glassgram setting and its default. Open the settings page from the extension icon, then the gear (or **Details → Extension options**). Changes apply immediately; the one exception is anonymous story viewing, which needs Instagram refreshed. **Reset to defaults**, **Export settings** and **Import settings** are at the bottom of the page.

<details>
<summary><b>⬇️ Media downloads</b></summary>

| Setting | Default | Notes |
| :--- | :---: | :--- |
| Download toolbar on posts & reels | On | The hover toolbar on photos and videos |
| "Download all" for carousels | On | Shown when a post has several items |
| "Copy media URL" button | On | |
| "Copy caption" button | On | |
| "View full size" button on photos | On | Opens the photo in the zoom viewer. Story photos always have it |
| Video or sound choice on downloads | On | The download button on videos asks: video, or sound only as MP3 (192 kbps, made on your computer). The `D` shortcut always saves the video |
| Filename template | `Glassgram/{user}/{user}_{date}_{shortcode}_{index}` | Tokens: `{user}` `{shortcode}` `{index}` `{id}` `{date}` `{time}` `{type}` |
| Saving several files | ZIP | One ZIP, or separate files in a folder |

</details>
<details>
<summary><b>📖 Stories and profile</b></summary>

| Setting | Default | Notes |
| :--- | :---: | :--- |
| Download stories & highlights | On | Current story or the whole tray |
| Story mentions & stickers | On | The **@** button and its panel |
| HD profile picture | On | Zoom, download, copy URL |
| Follow status badge | On | Next to the username. Click it for details |
| Don't auto-advance stories | Off | Each story stops at its end |
| Bulk download profile posts | Off | The floating button on profiles |
| Bulk delay between requests | 1.5 to 3.5 s | Spacing for bulk download |

</details>
<details>
<summary><b>📰 Feed and video</b></summary>

| Setting | Default | Notes |
| :--- | :---: | :--- |
| Following-only feed | Off | Home opens the Following feed |
| Disable double-click like | On | |
| Video control bar | On | Seek, speed, volume, loop |
| Disable video autoplay | Off | Stories still play |
| Default playback speed | 1× | 0.5× to 3× |
| Remember volume | On | |
| Loop videos | On | |

</details>
<details>
<summary><b>🧘 Focus</b></summary>

| Setting | Default | Notes |
| :--- | :---: | :--- |
| Focus mode | Off | A daily time budget for the Reels feed and Explore. Shared reels, your feed and DMs aren't limited |
| Daily limit | 30 min | 5 to 240 min. Resets at midnight. **5 more minutes** adds time when it runs out |
| Show time left | On | A timer at the bottom of Reels and Explore |
| Grayscale | Off | On Reels & Explore, or everywhere |
| Reel counter | Off | A counter on each reel that goes up with every new reel you watch. Counts each reel once a day, resets at midnight. Works without focus mode |

</details>
<details>
<summary><b>🧹 Declutter</b></summary>

| Setting | Default |
| :--- | :---: |
| Hide sponsored posts | On |
| Hide "Suggested for you" posts | Off |
| Hide suggested accounts sidebar | Off |
| Hide stories tray on home | Off |
| Hide Reels tab | Off |
| Hide Explore tab | Off |
| Hide Threads banners & links | On |

</details>
<details>
<summary><b>🔗 Links, info and shortcuts</b></summary>

| Setting | Default | Notes |
| :--- | :---: | :--- |
| Exact timestamps | On | Date + time (12h or 24h), or date only |
| Right-click "Download Instagram media" | On | |
| Copy comment button | On | |
| Save GIFs from comments | On | |
| Clean share links | On | Strips tracking from copied links |
| Share domain | Empty | Replaces `instagram.com` in copied links, e.g. `kkinstagram.com` |
| Open links directly | On | Skips `l.instagram.com` |
| Enable keyboard shortcuts | On | Keys are listed [in the README](../README.md#keyboard-shortcuts) |

</details>
<details>
<summary><b>🔒 Privacy, messages and account tools</b></summary>

| Setting | Default | Notes |
| :--- | :---: | :--- |
| Anonymous story viewing | Off | Blocks the story "seen" request |
| Anonymous live viewing | Off | Not tested yet |
| Block analytics | Off | Blocks `/ajax/bz`, `/ajax/qm`, `/logging`. Instagram can tell its logs never arrive |
| Download voice messages | Off | A download button on each voice message |
| Hide typing indicator | Off | |
| Hide "Seen" | Off | Opening a chat doesn't mark it as read |
| Keep unsent messages | Off | Shown in the chat with an unsent mark, and listed in the popup |
| Remember received messages for | 30 days | 1 day to forever. Unsent messages stay until you clear them |
| Unfollowers checker | Off | Opened from the popup or your own profile |
| Wait between pages | 1 s | Spacing for the scan, plus up to 30% and a random 0.3 to 1 s |
| Safety pause every 15 pages | 10 s | Give or take 5 s |

</details>

The settings sidebar also has **Check for updates automatically** (on). Glassgram asks GitHub for new
releases twice a day and shows a **NEW** badge on its icon when one is out. **Check now** checks right away.

The sidebar also has **Animations** (on). Turn it off to stop the fades and slides on Glassgram's toolbars,
menus and dialogs, and on the settings page and popup. Glassgram also skips them when your system asks for
reduced motion.
