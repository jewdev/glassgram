import { loadSettings, onSettingsChanged, saveSettings } from './settings';
import type { Settings } from './settings-schema';

export type ThemeChoice = Settings['ui.theme'];

// localStorage mirrors the synced setting so a page can apply it before storage answers (no flash).
const CACHE_KEY = 'ige-theme';

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'light' || choice === 'dark') root.dataset.theme = choice;
  else delete root.dataset.theme;
  try {
    localStorage.setItem(CACHE_KEY, choice);
  } catch {
    /* storage unavailable: the synced setting still applies after load */
  }
}

/** Apply the cached theme now, then the synced setting, and follow later changes. */
export function initTheme(onChange?: (choice: ThemeChoice) => void) {
  try {
    const cached = localStorage.getItem(CACHE_KEY) as ThemeChoice | null;
    if (cached) applyTheme(cached);
  } catch {
    /* ignore */
  }
  loadSettings().then((s) => {
    applyTheme(s['ui.theme']);
    onChange?.(s['ui.theme']);
  });
  onSettingsChanged((s) => {
    applyTheme(s['ui.theme']);
    onChange?.(s['ui.theme']);
  });
}

export function setTheme(choice: ThemeChoice) {
  applyTheme(choice);
  return saveSettings({ 'ui.theme': choice });
}

export const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

export const THEME_LABEL: Record<ThemeChoice, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export const THEME_ICON: Record<ThemeChoice, string> = {
  system: '<rect x="3" y="4.5" width="18" height="12" rx="2.5"/><path d="M9 20h6M12 16.5V20"/>',
  light: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  dark: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
};

export function themeIcon(choice: ThemeChoice, size = 16): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${THEME_ICON[choice]}</svg>`;
}
