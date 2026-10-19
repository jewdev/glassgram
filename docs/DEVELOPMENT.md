# Development

Requires Node.js 20 or later. See the [README](../README.md#install) for loading `dist/` in the browser. Releases are built by `.github/workflows/release.yml` when you push a tag matching the `package.json` version (e.g. `git tag v1.0.0 && git push origin v1.0.0`).

Release notes come from the Conventional Commit subjects since the previous tag (`scripts/release-notes.mjs`): `feat` goes under **New**, `fix` under **Fixes**, `perf` under **Improvements**, and `!` or `BREAKING CHANGE:` under **Breaking changes**. Other types are left out. The extension shows these notes to users in its update cards, so write subjects for them. Preview with `git tag vX.Y.Z && node scripts/release-notes.mjs vX.Y.Z`.

**Update now** (`src/options/self-update.ts`) installs the release's `.zip` asset only if GitHub lists a `sha256:` digest for it, the ZIP has `manifest.json` at its root, and that manifest's name and version match the release. Keep the workflow's `cd dist && zip -r` layout. Each update removes the old build's leftover files under `assets/` and nothing else.

```sh
npm run dev        # dev build with hot reload (load dist/ the same way)
npm run build      # typecheck and production build into dist/
npm test           # unit tests
```

| Where | What it does |
| :--- | :--- |
| `src/inject/main-world.ts` | Page script. Runs before Instagram's code: reads posts and users from Instagram's Relay store, replays profile queries for bulk download, blocks the story "seen" request, cleans copied links, unwraps `l.instagram.com`, stops DM typing and read requests, finds voice messages and chat rows |
| `src/shared/page-channel.ts` | The private channel between the content script and the page script |
| `src/content/` | Content script, one file per feature in `features/` |
| `src/content/core/selectors.ts` | Every assumption about Instagram's markup |
| `src/background/` | Queues downloads and builds ZIPs in an offscreen document |
| `src/shared/settings-schema.ts` | Every setting, defined once. The settings page and popup are generated from it |

Glassgram relies on Instagram's private web API, which can change at any time. When something breaks, the fix is usually in `src/content/core/selectors.ts` or `src/inject/main-world.ts`.

## Staying out of sight

Instagram's own code shares the page with us. Keep it from seeing Glassgram:

- **Instagram's DOM:** don't write attributes, classes or `<style>` tags to it. Remember elements in a `WeakMap` or `WeakSet`. Put UI inside `shadowHost()` (`src/content/ui/dom.ts`): a plain element with a closed shadow root that holds the styles.
- **Talking to the page script:** use the bridge (`src/content/core/bridge.ts`). Never use `window.postMessage` or DOM attributes, which the page can read and fake.
- **Patching in the page script:** patch a native only when a setting needs it (`hooksFor` in `page-channel.ts`). Wrap it with `disguise()` (`src/inject/stealth.ts`), and don't log to the console.
- **Requests:**
  - Anything that runs by itself (hover, badges) uses only data Instagram already loaded (`offline` in `src/content/core/api.ts`).
  - REST calls send Instagram's own header set (`src/content/core/headers.ts`).
- **Build:** content scripts are built as standalone files, so the build has no `web_accessible_resources` a page could probe.
