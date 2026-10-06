// Single source of timing for the video and its sound. Pure data: imported by the scenes (browser)
// and by audio/make-audio.mjs (Node). Times are in seconds. Music runs at 120 BPM (one bar = 2 s).

export const FPS = 30;
export const BPM = 120;

export const SCENES = {
  problem: [0, 5.5],
  hero: [5.5, 11],
  download: [11, 19],
  avatar: [19, 25],
  story: [25, 31],
  follow: [31, 35.5],
  unfollowers: [35.5, 41],
  feed: [41, 49.5],
  video: [49.5, 55],
  privacy: [55, 61],
  messages: [61, 67.5],
  extras: [67.5, 72],
  settings: [72, 78],
  local: [78, 83],
  cta: [83, 90],
};

export const DURATION = SCENES.cta[1];

/** How long scenes overlap at a cut. */
export const XFADE = 0.5;

/** Absolute time of an offset into a scene. */
const at = (scene, dt) => SCENES[scene][0] + dt;
const all = (scene, dts) => dts.map((dt) => at(scene, dt));

// Interaction beats per scene (absolute seconds). Scenes read these, and so does the sound design.
export const DL = { hover: 12.2, allReveal: 12.6, click1: 13.5, panel: 13.9, click2: 15.4, zipDone: 16.5, chips: 16.9 };
export const AV = { hover: 19.6, click: 20.35, open: 20.45, zoomFrom: 21.2, zoomTo: 22.6, panFrom: 22.9, panTo: 24.2 };
export const ST = { reveal: 25.85, click: 26.55, open: 26.65, highlight: 28.4 };
export const FO = { loading: 31.75, badge: 32.3, legend: 32.9 };
export const UF = { open: at('unfollowers', 0.35), scan: at('unfollowers', 0.95), loaded: at('unfollowers', 2.2), type: at('unfollowers', 2.9), export: at('unfollowers', 4.05) };
export const FE = { toggles: all('feed', [1.0, 1.85, 2.7, 3.55, 4.3, 5.05]) };
export const VI = { hover: at('video', 0.5), seekFrom: at('video', 1.0), seekTo: at('video', 1.8), speed: all('video', [2.3, 2.85]), volFrom: at('video', 3.4), volTo: at('video', 4.1), loop: at('video', 4.6) };
export const PR = { copy: at('privacy', 0.8), clean: at('privacy', 1.9), cut: at('privacy', 3.1), toggle: at('privacy', 4.4) };
export const MS = { msg1: at('messages', 0.5), msg2: at('messages', 1.1), unsend: at('messages', 2.0), ghost: at('messages', 2.55), popup: at('messages', 3.85), click: at('messages', 4.55), panel: at('messages', 4.75) };
export const XT = { cards: at('extras', 0.35), fire: all('extras', [1.2, 1.6, 2.0, 2.4, 2.8, 3.2]) };
export const SE = { swap: at('settings', 3.1), popup: at('settings', 3.7), popupToggle: at('settings', 4.8) };
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
  { t: AV.click, sfx: 'click', v: 0.8 },
  { t: AV.open, sfx: 'swish', v: 0.5 },
  { t: ST.click, sfx: 'click', v: 0.8 },
  { t: ST.open, sfx: 'pop', v: 0.5 },
  { t: ST.highlight, sfx: 'shimmer', v: 0.45 },
  { t: FO.badge, sfx: 'pop', v: 0.6 },
  { t: UF.open, sfx: 'swish', v: 0.45 },
  { t: UF.scan, sfx: 'click', v: 0.8 },
  { t: UF.loaded, sfx: 'success', v: 0.5 },
  ...[0, 1].map((i) => ({ t: UF.type + i * 0.16, sfx: 'tick', v: 0.3 })),
  { t: UF.export, sfx: 'click', v: 0.75 },
  { t: UF.export + 0.25, sfx: 'success', v: 0.45 },
  ...[0, 1, 2, 3].map((i) => ({ t: FO.legend + i * 0.14, sfx: 'tick', v: 0.25 })),
  ...FE.toggles.flatMap((t) => [{ t, sfx: 'click', v: 0.55 }, { t: t + 0.08, sfx: 'toggle', v: 0.6 }]),
  { t: VI.seekFrom, sfx: 'tick', v: 0.4 },
  ...VI.speed.map((t) => ({ t, sfx: 'click', v: 0.6 })),
  { t: VI.loop, sfx: 'tick', v: 0.4 },
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
  ...LO.lines.map((t) => ({ t, sfx: 'tick', v: 0.4 })),
  { t: SCENES.cta[0] - 0.1, sfx: 'whoosh', v: 0.7 },
  { t: CT.brand, sfx: 'impact', v: 0.85 },
  // transitions between feature scenes
  ...['download', 'avatar', 'story', 'follow', 'unfollowers', 'feed', 'video', 'privacy', 'messages', 'extras', 'settings', 'local'].map((k) => ({ t: SCENES[k][0] - 0.12, sfx: 'swish', v: 0.32 })),
].sort((a, b) => a.t - b.t);
