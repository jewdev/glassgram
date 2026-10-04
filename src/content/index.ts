import './ui/styles.css';
import type { Message } from '../shared/messages';
import type { Settings } from '../shared/settings-schema';
import { loadSettings, onSettingsChanged } from '../shared/settings';
import { setSettings } from './core/state';
import { anonStories } from './features/anon-stories';
import { contextDownload, contextMenu } from './features/context-menu';
import { declutter } from './features/declutter';
import { followBadge } from './features/follow-badge';
import { mediaToolbar } from './features/media-toolbar';
import { profileTools } from './features/profile-tools';
import { shortcuts } from './features/shortcuts';
import { timestamps } from './features/timestamps';
import type { Feature } from './features/types';
import { openUnfollowers } from './features/unfollowers';
import { videoControls } from './features/video-controls';

const FEATURES: Feature[] = [anonStories, declutter, mediaToolbar, videoControls, timestamps, shortcuts, contextMenu, profileTools, followBadge];
const running = new Map<string, () => void>();

function sync(s: Settings) {
  setSettings(s);
  for (const f of FEATURES) {
    const on = f.isEnabled(s);
    const stop = running.get(f.id);
    try {
      if (on && !stop) running.set(f.id, f.start());
      else if (!on && stop) {
        stop();
        running.delete(f.id);
      }
      if (on) f.onSettings?.(s);
    } catch (e) {
      console.warn(`[IGE] feature ${f.id} failed`, e);
    }
  }
}

function whenBody(): Promise<void> {
  return document.body ? Promise.resolve() : new Promise((r) => document.addEventListener('DOMContentLoaded', () => r(), { once: true }));
}

async function boot() {
  const settings = await loadSettings();
  // Anonymous stories must be armed before Instagram sends its first request.
  if (settings['privacy.anonStories']) document.documentElement.setAttribute('data-ige-anon', '1');
  await whenBody();
  sync(settings);
  onSettingsChanged(sync);

  chrome.runtime.onMessage.addListener((msg: Message) => {
    if (msg.type === 'openUnfollowers') openUnfollowers();
    else if (msg.type === 'contextDownload') contextDownload();
  });
}

boot().catch((e) => console.warn('[IGE] boot failed', e));
