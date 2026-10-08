import type { DownloadResult, Message } from '../shared/messages';
import { loadSettings, onSettingsChanged } from '../shared/settings';
import type { Settings } from '../shared/settings-schema';
import type { DownloadJob } from '../shared/types';
import { availableUpdate, loadUpdateState, onUpdateStateChanged, parseReleases, patchUpdateState, RELEASES_API, type UpdateState } from '../shared/updates';

// ---------------- download queue ----------------
const MAX_CONCURRENT = 3;
const queue: DownloadJob[] = [];
const active = new Set<number>();
/** Blob-URL downloads (ZIPs) → cleanup once finished. */
const blobDownloads = new Map<number, () => void>();
let pumping = false;

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length && active.size < MAX_CONCURRENT) {
      const job = queue.shift()!;
      try {
        const id = await chrome.downloads.download({ url: job.url, filename: job.filename, conflictAction: 'uniquify' });
        if (id !== undefined) active.add(id);
      } catch (e) {
        console.warn('[IGE] download failed', job.filename, e);
      }
    }
  } finally {
    pumping = false;
  }
}

chrome.downloads.onChanged.addListener((delta) => {
  const state = delta.state?.current;
  if (state !== 'complete' && state !== 'interrupted') return;
  active.delete(delta.id);
  blobDownloads.get(delta.id)?.();
  blobDownloads.delete(delta.id);
  pump();
});

// ---------------- ZIP via offscreen document ----------------
const OFFSCREEN_URL = 'src/offscreen/offscreen.html';

async function ensureOffscreen() {
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Bundle downloaded Instagram media into a ZIP file',
  });
}

type ZipReply = { ok: true; url: string; count: number } | { ok: false; error: string };

async function zipAndDownload(jobs: DownloadJob[], zipName: string, tabId?: number): Promise<DownloadResult> {
  await ensureOffscreen();
  // Forward progress from the offscreen document to the requesting tab.
  const onProgress = (msg: Message) => {
    if (msg.type === 'zipProgress' && tabId !== undefined) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
  };
  chrome.runtime.onMessage.addListener(onProgress);
  try {
    const res = (await chrome.runtime.sendMessage({ type: 'offscreen:zip', target: 'offscreen', jobs } satisfies Message)) as ZipReply;
    if (!res?.ok) return { ok: false, error: res?.error ?? 'ZIP failed' };
    const id = await chrome.downloads.download({ url: res.url, filename: zipName, conflictAction: 'uniquify' });
    blobDownloads.set(id, () => {
      chrome.runtime.sendMessage({ type: 'offscreen:revoke', target: 'offscreen', url: res.url } satisfies Message).catch(() => {});
    });
    return { ok: true, count: res.count };
  } finally {
    chrome.runtime.onMessage.removeListener(onProgress);
  }
}

// ---------------- messages ----------------
chrome.runtime.onMessage.addListener((msg: Message, sender, reply) => {
  if ('target' in msg) return false; // meant for the offscreen document
  if (msg.type === 'download') {
    queue.push(...msg.jobs);
    pump();
    reply({ ok: true, count: msg.jobs.length } satisfies DownloadResult);
    return false;
  }
  if (msg.type === 'zip') {
    zipAndDownload(msg.jobs, msg.zipName, sender.tab?.id)
      .then(reply)
      .catch((e) => reply({ ok: false, error: String(e?.message ?? e) } satisfies DownloadResult));
    return true; // async reply
  }
  if (msg.type === 'checkUpdates') {
    checkForUpdates().then(reply);
    return true;
  }
  return false;
});

// ---------------- update check (GitHub Releases) ----------------
const UPDATE_ALARM = 'update-check';
const CHECK_EVERY_MIN = 12 * 60;
const CURRENT_VERSION = chrome.runtime.getManifest().version;

async function checkForUpdates(): Promise<UpdateState> {
  try {
    const res = await fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!res.ok) {
      throw new Error(res.status === 403 || res.status === 429 ? 'GitHub is limiting update checks. Try again in an hour.' : `GitHub answered with an error (${res.status}).`);
    }
    return await patchUpdateState({ releases: parseReleases(await res.json()), checkedAt: Date.now(), error: undefined });
  } catch (e) {
    const error = e instanceof TypeError ? "Couldn't reach GitHub. Check your connection." : (e as Error).message;
    return await patchUpdateState({ checkedAt: Date.now(), error });
  }
}

function syncBadge(s: UpdateState) {
  const update = availableUpdate(s, CURRENT_VERSION);
  chrome.action.setBadgeText({ text: update ? 'NEW' : '' });
  chrome.action.setTitle({ title: update ? `Glassgram: v${update.version} is available` : 'Glassgram' });
  if (update) {
    chrome.action.setBadgeBackgroundColor({ color: '#4b48e0' });
    chrome.action.setBadgeTextColor({ color: '#ffffff' });
  }
}

async function syncUpdateAlarm(s: Settings) {
  if (!s['updates.check']) {
    await chrome.alarms.clear(UPDATE_ALARM);
    return;
  }
  // A short first delay so a fresh install or re-enable checks soon, then twice a day.
  if (!(await chrome.alarms.get(UPDATE_ALARM))) chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: CHECK_EVERY_MIN });
}

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === UPDATE_ALARM) checkForUpdates();
});
onUpdateStateChanged(syncBadge);
loadUpdateState().then(syncBadge);

// ---------------- context menu ----------------
const MENU_ID = 'ige-download';

function syncContextMenu(s: Settings) {
  chrome.contextMenus.removeAll(() => {
    if (!s['info.contextMenu']) return;
    chrome.contextMenus.create({
      id: MENU_ID,
      title: 'Download Instagram media',
      contexts: ['page', 'image', 'video', 'link'],
      documentUrlPatterns: ['https://www.instagram.com/*'],
    });
  });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: 'contextDownload' } satisfies Message).catch(() => {});
  }
});

// ---------------- anonymous stories: backup network rule for the REST endpoint ----------------
const DNR_RULE_ID = 1;
const ANALYTICS_RULE_IDS = [2, 3];
const { RuleActionType, ResourceType } = chrome.declarativeNetRequest;
const BEACON_TYPES = [ResourceType.XMLHTTPREQUEST, ResourceType.PING, ResourceType.OTHER];

function analyticsRules(): chrome.declarativeNetRequest.Rule[] {
  return [
    {
      id: ANALYTICS_RULE_IDS[0],
      priority: 1,
      action: { type: RuleActionType.BLOCK },
      condition: { regexFilter: '^https://www\\.instagram\\.com/(ajax/bz|ajax/qm/|logging/)', resourceTypes: BEACON_TYPES },
    },
    {
      id: ANALYTICS_RULE_IDS[1],
      priority: 1,
      action: { type: RuleActionType.BLOCK },
      condition: { regexFilter: '^https://graph\\.instagram\\.com/logging_client_events', resourceTypes: BEACON_TYPES },
    },
  ];
}

async function syncDnr(s: Settings) {
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: ANALYTICS_RULE_IDS,
    addRules: s['privacy.blockAnalytics'] ? analyticsRules() : [],
  });
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [DNR_RULE_ID],
    addRules: s['privacy.anonStories']
      ? [
          {
            id: DNR_RULE_ID,
            priority: 1,
            action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
            condition: {
              regexFilter: '^https://(www\\.|i\\.)?instagram\\.com/api/v[12]/(stories/reel/seen|media/seen)',
              resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST, chrome.declarativeNetRequest.ResourceType.OTHER],
            },
          },
        ]
      : [],
  });
}

function applySettings(s: Settings) {
  syncContextMenu(s);
  syncDnr(s).catch((e) => console.warn('[IGE] DNR', e));
  syncUpdateAlarm(s).catch((e) => console.warn('[IGE] update alarm', e));
}

chrome.runtime.onInstalled.addListener(async (details) => {
  applySettings(await loadSettings());
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
  // A real version change (not a reload of the same build): remember it for the "What's new" card.
  if (details.reason === 'update' && details.previousVersion && details.previousVersion !== CURRENT_VERSION) {
    await patchUpdateState({ updatedFrom: details.previousVersion, skipped: undefined });
    checkForUpdates(); // fetch notes for the version just installed
  }
});
chrome.runtime.onStartup.addListener(async () => applySettings(await loadSettings()));
onSettingsChanged(applySettings);
