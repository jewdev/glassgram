import type { Settings } from '../../shared/settings-schema';

export interface Feature {
  id: string;
  isEnabled(s: Settings): boolean;
  /** Start the feature; returns a cleanup function. Features read live settings via getSettings(). */
  start(): () => void;
  /** Optional: react to settings changes while running (without restart). */
  onSettings?(s: Settings): void;
}
