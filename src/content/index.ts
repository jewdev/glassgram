import type { Message } from '../shared/messages';
import type { Settings } from '../shared/settings-schema';
import { loadSettings, onSettingsChanged } from '../shared/settings';
import { connectPage, sendPageSettings } from './core/bridge';
import { setSettings } from './core/state';
import { contextDownload, contextMenu } from './features/context-menu';
import { declutter } from './features/declutter';
import { dmArchive, openUnsentMessages } from './features/dm-archive';
import { voiceDownload } from './features/dm-tools';
import { commentMedia } from './features/comment-media';
import { copyComment } from './features/copy-comment';
import { followBadge } from './features/follow-badge';
import { followingFeed } from './features/following-feed';
import { cleanLinks, directLinks } from './features/links';
import { noAutoplay } from './features/no-autoplay';
import { noDoubleTap } from './features/no-double-tap';
import { mediaToolbar } from './features/media-toolbar';
import { profileTools } from './features/profile-tools';
import { shortcuts } from './features/shortcuts';
import { storyNoAdvance } from './features/story-no-advance';
import { timestamps } from './features/timestamps';
import type { Feature } from './features/types';
import { openUnfollowers } from './features/unfollowers';
import { videoControls } from './features/video-controls';
import { setMotion, setTheme } from './ui/dom';

// The channel to the page script must exist before Instagram's scripts do (see shared/page-channel.ts).
connectPage();

const FEATURES: Feature[] = [
  declutter,
  mediaToolbar,
  videoControls,
  timestamps,
  shortcuts,
  contextMenu,
  profileTools,
  followBadge,
  followingFeed,
  noDoubleTap,
  noAutoplay,
  copyComment,
  commentMedia,
  storyNoAdvance,
  cleanLinks,
  directLinks,
  voiceDownload,
  dmArchive,
];
const running = new Map<string, () => void>();

function sync(s: Settings) {
  setSettings(s);
  // Anonymous stories, DM privacy and link cleaning run in the page script.
  sendPageSettings(s);
  setTheme(s['ui.theme']);
  setMotion(s['ui.animations']);
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
  // The page script patches what these settings need right away: anonymous stories must be armed
  // before Instagram's first request, the DM archive before the chat socket's first messages.
  sendPageSettings(settings);
  await whenBody();
  sync(settings);
  onSettingsChanged(sync);

  chrome.runtime.onMessage.addListener((msg: Message) => {
    if (msg.type === 'openUnfollowers') openUnfollowers();
    else if (msg.type === 'openUnsent') openUnsentMessages();
    else if (msg.type === 'contextDownload') contextDownload();
  });
}

boot().catch((e) => console.warn('[IGE] boot failed', e));
