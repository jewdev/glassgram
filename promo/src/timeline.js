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
  feed: [35.5, 44],
  video: [44, 49.5],
  privacy: [49.5, 55.5],
  settings: [55.5, 61.5],
  local: [61.5, 66.5],
  cta: [66.5, 74],
};

export const DURATION = SCENES.cta[1];

/** How long scenes overlap at a cut. */
export const XFADE = 0.5;

// Interaction beats per scene (absolute seconds). Scenes read these, and so does the sound design.
export const DL = { hover: 12.2, allReveal: 12.6, click1: 13.5, panel: 13.9, click2: 15.4, zipDone: 16.5, chips: 16.9 };
export const AV = { hover: 19.6, click: 20.35, open: 20.45, zoomFrom: 21.2, zoomTo: 22.6, panFrom: 22.9, panTo: 24.2 };
export const ST = { reveal: 25.85, click: 26.55, open: 26.65, highlight: 28.4 };
export const FO = { loading: 31.75, badge: 32.3, legend: 32.9 };
export const FE = { toggles: [36.5, 37.35, 38.2, 39.05, 39.8, 40.55] };
export const VI = { hover: 44.5, seekFrom: 45.0, seekTo: 45.8, speed: [46.3, 46.85], volFrom: 47.4, volTo: 48.1, loop: 48.6 };
export const PR = { copy: 50.3, clean: 51.4, cut: 52.6, toggle: 53.9 };
export const SE = { swap: 58.6, popup: 59.2, popupToggle: 60.3 };
export const LO = { lines: [62.6, 63.3] };
export const CT = { line: 66.9, brand: 69.2 };

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
  ...[0, 1, 2, 3].map((i) => ({ t: FO.legend + i * 0.14, sfx: 'tick', v: 0.25 })),
  ...FE.toggles.flatMap((t) => [{ t, sfx: 'click', v: 0.55 }, { t: t + 0.08, sfx: 'toggle', v: 0.6 }]),
  { t: VI.seekFrom, sfx: 'tick', v: 0.4 },
  ...VI.speed.map((t) => ({ t, sfx: 'click', v: 0.6 })),
  { t: VI.loop, sfx: 'tick', v: 0.4 },
  { t: PR.copy, sfx: 'click', v: 0.7 },
  { t: PR.clean, sfx: 'swish', v: 0.5 },
  { t: PR.toggle, sfx: 'click', v: 0.55 },
  { t: PR.toggle + 0.08, sfx: 'toggle', v: 0.6 },
  { t: SE.popup, sfx: 'swish', v: 0.5 },
  { t: SE.popupToggle, sfx: 'toggle', v: 0.6 },
  ...LO.lines.map((t) => ({ t, sfx: 'tick', v: 0.4 })),
  { t: SCENES.cta[0] - 0.1, sfx: 'whoosh', v: 0.7 },
  { t: CT.brand, sfx: 'impact', v: 0.85 },
  // transitions between feature scenes
  ...['download', 'avatar', 'story', 'follow', 'feed', 'video', 'privacy', 'settings', 'local'].map((k) => ({ t: SCENES[k][0] - 0.12, sfx: 'swish', v: 0.32 })),
].sort((a, b) => a.t - b.t);
