import type { SectionIcon, SettingKey } from './settings-schema';

/** Section icons for the settings page and popup: one 24px grid, 1.8 stroke, round caps. */
export const SECTION_ICON_PATHS: Record<SectionIcon, string> = {
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  feed: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/>',
  focus: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.5 1.5M10 3h4"/>',
  play: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5Z"/>',
  message: '<path d="M4.5 18.5 5.6 15A7.5 7.5 0 1 1 9 18.4Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  keyboard: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6Z"/>',
  tools: '<path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4.6L4.5 16.5l3 3 5.4-5.4a3.5 3.5 0 0 0 4.6-4.6L15 12l-3-3Z"/>',
};

/** Icons for single features (popup tiles), on the same grid. A feature without one uses its section's. */
const FEATURE_ICON_PATHS: Partial<Record<SettingKey, string>> = {
  'download.enabled': SECTION_ICON_PATHS.download,
  // a story ring with a download arrow
  'stories.download': '<circle cx="12" cy="12" r="8.5" stroke-dasharray="3.2 2.2"/><path d="M12 8v7.5"/><path d="m8.8 12.5 3.2 3.2 3.2-3.2"/>',
  // a portrait in a frame
  'profile.hdPic': '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="12" cy="10" r="3"/><path d="M6.8 20.5a5.5 5.5 0 0 1 10.4 0"/>',
  // a person with a check mark
  'profile.followBadge': '<circle cx="9" cy="8" r="3.8"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="m16.5 11 2 2 3.5-3.5"/>',
  // a list with a check mark
  'feed.followingOnly': '<path d="M4 6h14M4 12h14M4 18h8"/><path d="m15 18 2 2 4-4"/>',
  // a crossed-out megaphone
  'declutter.ads': '<path d="M4 10v4h3l7 4V6l-7 4Z"/><path d="M17.5 9.5a3.5 3.5 0 0 1 0 5"/><path d="M3 3l18 18"/>',
  'focus.enabled': SECTION_ICON_PATHS.focus,
  // tally marks
  'focus.reelCounter': '<path d="M6 5v14M10 5v14M14 5v14M18 5v14M4 16 20 8"/>',
  // a player with a seek bar
  'video.enabled': '<rect x="3.5" y="3.5" width="17" height="12" rx="2.5"/><path d="m10.5 7 3.5 2.5-3.5 2.5Z"/><path d="M4 20h16"/><circle cx="9" cy="20" r="1.6" fill="currentColor"/>',
  'shortcuts.enabled': SECTION_ICON_PATHS.keyboard,
  // a crossed-out eye
  'privacy.anonStories': '<path d="M3 3l18 18"/><path d="M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.7M6.6 6.6A17 17 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
};

const svg = (paths: string, size: number) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

export function sectionIcon(name: SectionIcon, size = 18): string {
  return svg(SECTION_ICON_PATHS[name], size);
}

export function featureIcon(key: SettingKey, fallback: SectionIcon, size = 18): string {
  return svg(FEATURE_ICON_PATHS[key] ?? SECTION_ICON_PATHS[fallback], size);
}
