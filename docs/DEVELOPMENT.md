# Development

Requires Node.js 20 or later. See the [README](../README.md#install) for loading `dist/` in the browser.

```sh
npm run dev        # dev build with hot reload (load dist/ the same way)
npm run build      # typecheck and production build into dist/
npm test           # unit tests
```

| Where | What it does |
| :--- | :--- |
| `src/inject/main-world.ts` | Page script. Runs before Instagram's code: caches posts and users, replays profile queries for bulk download, blocks the story "seen" request, cleans copied links, unwraps `l.instagram.com`, stops DM typing and read requests, tags voice messages with their audio URL |
| `src/content/` | Content script, one file per feature in `features/` |
| `src/content/core/selectors.ts` | Every assumption about Instagram's markup |
| `src/background/` | Queues downloads and builds ZIPs in an offscreen document |
| `src/shared/settings-schema.ts` | Every setting, defined once. The settings page and popup are generated from it |

Glassgram relies on Instagram's private web API, which can change at any time. When something breaks, the fix is usually in `src/content/core/selectors.ts` or `src/inject/main-world.ts`.
