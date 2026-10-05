import type { SectionIcon } from './settings-schema';

/** Section icons for the settings page and popup: one 24px grid, 1.8 stroke, round caps. */
export const SECTION_ICON_PATHS: Record<SectionIcon, string> = {
  download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  feed: '<rect x="4" y="4" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/>',
  play: '<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="m10.5 9.5 4 2.5-4 2.5Z"/>',
  message: '<path d="M4.5 18.5 5.6 15A7.5 7.5 0 1 1 9 18.4Z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  keyboard: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M8 14h8"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6Z"/>',
  tools: '<path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4.6L4.5 16.5l3 3 5.4-5.4a3.5 3.5 0 0 0 4.6-4.6L15 12l-3-3Z"/>',
};

export function sectionIcon(name: SectionIcon, size = 18): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SECTION_ICON_PATHS[name]}</svg>`;
}
