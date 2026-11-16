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
import { focusMode } from './features/focus';
import { followingFeed } from './features/following-feed';
import { cleanLinks, directLinks } from './features/links';
import { noAutoplay } from './features/no-autoplay';
import { noDoubleTap } from './features/no-double-tap';
import { mediaToolbar } from './features/media-toolbar';
import { profileTools } from './features/profile-tools';
import { reelCounter } from './features/reel-counter';
import { reelAds } from './features/reel-ads';
import { reelsAutoScroll } from './features/reels-autoscroll';
import { shortcuts } from './features/shortcuts';
import { storyNoAdvance } from './features/story-no-advance';
import { timestamps } from './features/timestamps';
import type { Feature } from './features/types';
import { openUnfollowers } from './features/unfollowers';
import { videoControls } from './features/video-controls';
import { runHealthCheck } from './health';
import { setMotion, setTheme } from './ui/dom';

// The channel to the page script must exist before Instagram's scripts do (see shared/page-channel.ts).
connectPage();

const FEATURES: Feature[] = [
  declutter,
  focusMode,
  reelCounter,
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
  reelsAutoScroll,
  reelAds,
  copyComment,
  commentMedia,
  storyNoAdvance,
  cleanLinks,
  directLinks,
  voiceDownload,
  dmArchive,
];
const running = new Map<string, () => void>();

/**
 * In the tab the health check opens, features that keep a daily tally stay off: the check's visit to
 * Reels and Explore isn't the user's time or reels.
 */
const OFF_IN_HEALTH_TAB = new Set([focusMode.id, reelCounter.id]);
let healthTab = false;

/** Asked once at start, before any feature runs. A worker that doesn't answer means no. */
function askHealthTab(): Promise<boolean> {
  const answer = chrome.runtime.sendMessage({ type: 'isHealthTab' } satisfies Message).then((r) => r === true, () => false);
  return Promise.race([answer, new Promise<boolean>((r) => setTimeout(() => r(false), 2000))]);
}

function sync(s: Settings) {
  setSettings(s);
  // Anonymous stories, DM privacy and link cleaning run in the page script.
  sendPageSettings(s);
  setTheme(s['ui.theme']);
  setMotion(s['ui.animations']);
  for (const f of FEATURES) {
    const on = f.isEnabled(s) && !(healthTab && OFF_IN_HEALTH_TAB.has(f.id));
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
  const [settings, inHealthTab] = await Promise.all([loadSettings(), askHealthTab()]);
  healthTab = inHealthTab;
  // The page script patches what these settings need right away: anonymous stories must be armed
  // before Instagram's first request, the DM archive before the chat socket's first messages.
  sendPageSettings(settings);
  await whenBody();
  sync(settings);
  onSettingsChanged(sync);

  chrome.runtime.onMessage.addListener((msg: Message, _sender, reply) => {
    if (msg.type === 'healthCheck') {
      runHealthCheck(msg.step).then(reply, (e) => reply({ error: String(e?.message ?? e) }));
      return true; // async reply
    }
    // Answered, so the background knows the panel opened and stops retrying.
    if (msg.type === 'openUnfollowers') {
      openUnfollowers();
      reply({ ok: true });
    } else if (msg.type === 'openUnsent') {
      openUnsentMessages();
      reply({ ok: true });
    } else if (msg.type === 'contextDownload') contextDownload();
    return false;
  });
}

boot().catch((e) => console.warn('[IGE] boot failed', e));
