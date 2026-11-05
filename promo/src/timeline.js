// Single source of timing for the video and its sound. Pure data: imported by the scenes (browser)
// and by audio/make-audio.mjs (Node). Times are in seconds. Music runs at 120 BPM (one bar = 2 s).

export const FPS = 30;
export const BPM = 120;

export const SCENES = {
  problem: [0, 5.5],
  hero: [5.5, 11],
  download: [11, 19],
  sound: [19, 23.5],
  avatar: [23.5, 29],
  story: [29, 34.5],
  follow: [34.5, 39],
  unfollowers: [39, 47.5],
  feed: [47.5, 55.5],
  video: [55.5, 61],
  focus: [61, 67],
  privacy: [67, 73],
  messages: [73, 79.5],
  extras: [79.5, 84],
  settings: [84, 93],
  local: [93, 97.5],
  cta: [97.5, 104.5],
};

export const DURATION = SCENES.cta[1];

/** How long scenes overlap at a cut. */
export const XFADE = 0.5;

/** Absolute time of an offset into a scene. */
const at = (scene, dt) => SCENES[scene][0] + dt;
const all = (scene, dts) => dts.map((dt) => at(scene, dt));

// Interaction beats per scene (absolute seconds). Scenes read these, and so does the sound design.
export const DL = { hover: at('download', 1.2), allReveal: at('download', 1.6), click1: at('download', 2.5), panel: at('download', 2.9), click2: at('download', 4.4), zipDone: at('download', 5.5), chips: at('download', 5.9) };
export const SO = { hover: at('sound', 0.55), click: at('sound', 1.25), item: at('sound', 1.75), pick: at('sound', 2.05), saved: at('sound', 2.85) };
export const AV = { hover: at('avatar', 0.6), click: at('avatar', 1.35), open: at('avatar', 1.45), zoomFrom: at('avatar', 2.2), zoomTo: at('avatar', 3.5), panFrom: at('avatar', 3.75), panTo: at('avatar', 5.0) };
export const ST = { reveal: at('story', 0.85), click: at('story', 1.55), open: at('story', 1.65), highlight: at('story', 3.3) };
export const FO = { loading: at('follow', 0.75), badge: at('follow', 1.3), legend: at('follow', 1.9) };
export const UF = {
  open: at('unfollowers', 0.35),
  scan: at('unfollowers', 0.9),
  loaded: at('unfollowers', 1.95),
  changes: at('unfollowers', 2.55),
  back: at('unfollowers', 4.3),
  keep: at('unfollowers', 4.7),
  picks: all('unfollowers', [5.05, 5.3, 5.55]),
  unfollow: at('unfollowers', 6.0),
  go: at('unfollowers', 6.75),
};
export const FE = { toggles: all('feed', [1.0, 1.85, 2.7, 3.55, 4.3, 5.05]) };
export const VI = { hover: at('video', 0.5), seekFrom: at('video', 1.0), seekTo: at('video', 1.8), speed: all('video', [2.3, 2.85]), volFrom: at('video', 3.4), volTo: at('video', 4.1), loop: at('video', 4.6) };
export const FC = { swipes: all('focus', [0.95, 1.75, 2.55]), low: at('focus', 3.0), block: at('focus', 3.85) };
export const PR = { copy: at('privacy', 0.8), clean: at('privacy', 1.9), cut: at('privacy', 3.1), toggle: at('privacy', 4.4) };
export const MS = { msg1: at('messages', 0.5), msg2: at('messages', 1.1), unsend: at('messages', 2.0), ghost: at('messages', 2.55), popup: at('messages', 3.85), click: at('messages', 4.55), panel: at('messages', 4.75) };
export const XT = { cards: at('extras', 0.35), fire: all('extras', [1.2, 1.6, 2.0, 2.4, 2.8, 3.2]) };
export const SE = { swap: at('settings', 3.1), popup: at('settings', 3.7), popupToggle: at('settings', 4.8), popupClose: at('settings', 5.55), back: at('settings', 5.65), health: at('settings', 6.6), update: at('settings', 7.75) };
export const LO = { lines: all('local', [1.1, 1.7, 2.3]) };
export const CT = { line: at('cta', 0.4), brand: at('cta', 2.7) };

/** Sound effects, in time order. `v` is relative loudness. */
export const CUES = [
  { t: SCENES.hero[0] - 0.05, sfx: 'whoosh', v: 0.9 },
  { t: 6.0, sfx: 'impact', v: 1 },
  { t: DL.hover + 0.05, sfx: 'tick', v: 0.35 },
  { t: DL.click1, sfx: 'click', v: 0.8 },
  { t: DL.panel, sfx: 'success', v: 0.55 },
  { t: DL.click2, sfx: 'click', v: 0.8 },
  { t: DL.zipDone, sfx: 'success', v: 0.6 },
  ...[0, 1, 2, 3, 4].map((i) => ({ t: DL.chips + i * 0.12, sfx: 'tick', v: 0.28 })),
  { t: SO.hover + 0.05, sfx: 'tick', v: 0.35 },
  { t: SO.click, sfx: 'click', v: 0.8 },
  { t: SO.click + 0.05, sfx: 'pop', v: 0.4 },
  { t: SO.item, sfx: 'tick', v: 0.3 },
  { t: SO.pick, sfx: 'click', v: 0.8 },
  { t: SO.saved, sfx: 'success', v: 0.6 },
  { t: AV.click, sfx: 'click', v: 0.8 },
  { t: AV.open, sfx: 'swish', v: 0.5 },
  { t: ST.click, sfx: 'click', v: 0.8 },
  { t: ST.open, sfx: 'pop', v: 0.5 },
  { t: ST.highlight, sfx: 'shimmer', v: 0.45 },
  { t: FO.badge, sfx: 'pop', v: 0.6 },
  ...[0, 1, 2, 3].map((i) => ({ t: FO.legend + i * 0.14, sfx: 'tick', v: 0.25 })),
  { t: UF.open, sfx: 'swish', v: 0.45 },
  { t: UF.scan, sfx: 'click', v: 0.8 },
  { t: UF.loaded, sfx: 'success', v: 0.5 },
  { t: UF.changes, sfx: 'click', v: 0.7 },
  { t: UF.changes + 0.2, sfx: 'shimmer', v: 0.35 },
  { t: UF.back, sfx: 'click', v: 0.7 },
  { t: UF.keep, sfx: 'click', v: 0.6 },
  ...UF.picks.map((t) => ({ t, sfx: 'tick', v: 0.45 })),
  { t: UF.unfollow, sfx: 'click', v: 0.75 },
  { t: UF.go, sfx: 'click', v: 0.8 },
  { t: UF.go + 0.55, sfx: 'pop', v: 0.4 },
  { t: UF.go + 1.15, sfx: 'pop', v: 0.4 },
  ...FE.toggles.flatMap((t) => [{ t, sfx: 'click', v: 0.55 }, { t: t + 0.08, sfx: 'toggle', v: 0.6 }]),
  { t: VI.seekFrom, sfx: 'tick', v: 0.4 },
  ...VI.speed.map((t) => ({ t, sfx: 'click', v: 0.6 })),
  { t: VI.loop, sfx: 'tick', v: 0.4 },
  ...FC.swipes.flatMap((t) => [{ t, sfx: 'swish', v: 0.35 }, { t: t + 0.3, sfx: 'tick', v: 0.4 }]),
  { t: FC.low, sfx: 'tick', v: 0.45 },
  { t: FC.block, sfx: 'impact', v: 0.45 },
  { t: PR.copy, sfx: 'click', v: 0.7 },
  { t: PR.clean, sfx: 'swish', v: 0.5 },
  { t: PR.toggle, sfx: 'click', v: 0.55 },
  { t: PR.toggle + 0.08, sfx: 'toggle', v: 0.6 },
  { t: MS.msg1, sfx: 'pop', v: 0.4 },
  { t: MS.msg2, sfx: 'pop', v: 0.4 },
  { t: MS.unsend, sfx: 'swish', v: 0.4 },
  { t: MS.ghost, sfx: 'shimmer', v: 0.45 },
  { t: MS.popup - 0.05, sfx: 'click', v: 0.7 },
  { t: MS.click, sfx: 'click', v: 0.75 },
  { t: MS.panel, sfx: 'pop', v: 0.5 },
  { t: XT.cards, sfx: 'swish', v: 0.4 },
  ...XT.fire.map((t) => ({ t, sfx: 'tick', v: 0.38 })),
  { t: SE.popup, sfx: 'swish', v: 0.5 },
  { t: SE.popupToggle, sfx: 'toggle', v: 0.6 },
  { t: SE.back, sfx: 'swish', v: 0.4 },
  { t: SE.health, sfx: 'click', v: 0.7 },
  { t: SE.health + 0.15, sfx: 'success', v: 0.5 },
  { t: SE.update, sfx: 'tick', v: 0.4 },
  ...LO.lines.map((t) => ({ t, sfx: 'tick', v: 0.4 })),
  { t: SCENES.cta[0] - 0.1, sfx: 'whoosh', v: 0.7 },
  { t: CT.brand, sfx: 'impact', v: 0.85 },
  // transitions between feature scenes
  ...['download', 'sound', 'avatar', 'story', 'follow', 'unfollowers', 'feed', 'video', 'focus', 'privacy', 'messages', 'extras', 'settings', 'local'].map((k) => ({ t: SCENES[k][0] - 0.12, sfx: 'swish', v: 0.32 })),
].sort((a, b) => a.t - b.t);
