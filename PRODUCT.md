# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Instagram users on desktop who browse instagram.com in a Chromium browser (Brave, Chrome, Edge) and
want the tools the official web app leaves out. Intended for public release (GitHub, possibly the
Chrome Web Store), so a first-time user must understand every option without outside explanation.
They open the settings page occasionally: right after installing, and when they want to turn a
feature on or off.

## Product Purpose

A browser extension that adds tweaks to instagram.com: downloading posts, reels, stories and voice
messages; HD profile pictures; story mentions; follow-status badges; feed cleanup; video controls;
link cleanup; and privacy options. Every feature can be switched on or off. Success means users find
and configure what they want quickly and trust what each switch does.

## Positioning

Runs entirely in the user's browser with their own Instagram session, no server and no account. It
reuses data Instagram already loaded where it can instead of sending extra requests, and it says
plainly which features are experimental or untested.

## Operating Context

- Settings page opens in a browser tab (extension options page); a popup offers quick toggles.
- Changes apply instantly to open Instagram tabs; there is no save button.
- Settings sync through the browser account; export/import JSON exists.

## Capabilities and Constraints

- All settings are defined once in `src/shared/settings-schema.ts`; the options page and popup are
  generated from it. Setting types: toggle, select, text, number, shortcut; `dependsOn` links a
  sub-option to its parent toggle; toggles can carry a warning.
- Some features carry account risk (bulk download, unfollowers checker) or are experimental /
  untested (DM typing indicator, DM "Seen"); this must stay visible.
- Extension pages may load only local assets (no remote fonts or scripts).
- English only. Text should stay easy to translate later only if requested; not required now.

## Brand Commitments

- Name: "Glassgram" (renamed from "Instagram Enhanced" to keep Meta's trademark out of the name).
- Always presented as unofficial: README and settings page state it is not affiliated with Instagram or Meta.
- The extension has its own identity: it must not look like or imply it is an official Instagram or
  Meta product, and must not use Instagram's logo.

## Evidence on Hand

- No screenshots, user counts, reviews or store listing exist yet. Do not invent any.

## Product Principles

1. Honest switches: every option says what it does, and risks or experimental status are shown, not hidden.
2. Fast to scan: users should find a feature in seconds.
3. Nothing surprising: defaults are safe; risky or experimental features start off.
4. Local and private: no claims beyond what the code does.
