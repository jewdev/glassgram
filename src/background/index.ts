import type { DownloadResult, Message } from '../shared/messages';
import { loadSettings, onSettingsChanged } from '../shared/settings';
import type { Settings } from '../shared/settings-schema';
import type { DownloadJob } from '../shared/types';

// ---------------- download queue ----------------
const MAX_CONCURRENT = 3;
const queue: { job: DownloadJob; saveAs: boolean }[] = [];
const active = new Set<number>();
/** Blob-URL downloads (ZIPs) → cleanup once finished. */
const blobDownloads = new Map<number, () => void>();
let pumping = false;

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length && active.size < MAX_CONCURRENT) {
      const { job, saveAs } = queue.shift()!;
      try {
        const id = await chrome.downloads.download({ url: job.url, filename: job.filename, saveAs, conflictAction: 'uniquify' });
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
    for (const job of msg.jobs) queue.push({ job, saveAs: !!msg.saveAs });
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
  return false;
});

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

async function syncDnr(s: Settings) {
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
}

chrome.runtime.onInstalled.addListener(async (details) => {
  applySettings(await loadSettings());
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});
chrome.runtime.onStartup.addListener(async () => applySettings(await loadSettings()));
onSettingsChanged(applySettings);
