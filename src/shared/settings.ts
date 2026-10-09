import { DEFAULTS, type Settings } from './settings-schema';

const STORAGE_KEY = 'settings';
/** Default template before the root folder was renamed; anyone still on it moves to the new default. */
const OLD_DEFAULT_FILENAME = 'Instagram/{user}/{user}_{date}_{shortcode}_{index}';

function withDefaults(stored: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULTS, ...(stored ?? {}) };
  if (s['download.filename'] === OLD_DEFAULT_FILENAME) s['download.filename'] = DEFAULTS['download.filename'];
  return s;
}

export async function loadSettings(): Promise<Settings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  return withDefaults(stored[STORAGE_KEY] as Partial<Settings> | undefined);
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await loadSettings()), ...patch };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

export async function resetSettings(): Promise<Settings> {
  await chrome.storage.sync.set({ [STORAGE_KEY]: { ...DEFAULTS } });
  return { ...DEFAULTS };
}

/** Calls `cb` with the full new settings whenever they change anywhere. */
export function onSettingsChanged(cb: (s: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync' || !changes[STORAGE_KEY]) return;
    cb(withDefaults(changes[STORAGE_KEY].newValue as Partial<Settings> | undefined));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
