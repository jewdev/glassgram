import { DEFAULTS, type Settings } from '../../shared/settings-schema';

let current: Settings = { ...DEFAULTS };

export const getSettings = (): Settings => current;
export function setSettings(next: Settings) {
  current = next;
}
