import { DEFAULTS, SECTIONS, type SettingDef, type SettingKey, type Settings } from './settings-schema';

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

// Saves from one page run one after another, so two quick changes can't overwrite each other.
// (Two pages saving in the same instant can still race; storage.sync has no transactions.)
let saving: Promise<unknown> = Promise.resolve();

export function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const run = saving.then(async () => {
    const next = { ...(await loadSettings()), ...patch };
    await chrome.storage.sync.set({ [STORAGE_KEY]: next });
    return next;
  });
  saving = run.catch(() => {});
  return run;
}

/** Choices for settings that are changed outside the generated settings list. */
const EXTRA_CHOICES: Partial<Record<SettingKey, string[]>> = { 'ui.theme': ['system', 'light', 'dark'] };

const DEFS = new Map<SettingKey, SettingDef>(SECTIONS.flatMap((s) => s.items.map((d) => [d.key, d] as const)));

/** Keep only known keys whose values the settings page could have produced (e.g. from an imported file). */
export function sanitizeSettings(raw: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(DEFAULTS) as SettingKey[]) {
    let v = raw[k];
    if (!Object.hasOwn(raw, k) || typeof v !== typeof DEFAULTS[k]) continue;
    const def = DEFS.get(k);
    const choices = def?.type === 'select' ? def.options.map((o) => o.value) : EXTRA_CHOICES[k];
    if (choices && !choices.includes(v as string)) continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) continue;
      if (def?.type === 'number') v = Math.min(def.max, Math.max(def.min, v));
    }
    out[k] = v;
  }
  return out as Partial<Settings>;
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
