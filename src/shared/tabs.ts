// Tabs helpers for the extension's own pages and the background worker.

export const IG_URL = 'https://www.instagram.com/';

/** Resolves once the tab finished loading (or after `ms`). */
export function tabLoaded(tabId: number, ms = 20000): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };
    const onUpdated = (id: number, info: { status?: string }) => id === tabId && info.status === 'complete' && done();
    const timer = setTimeout(done, ms);
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

/** An Instagram tab to use: the active one, else one in the current window, else any. */
export async function findIgTab(): Promise<chrome.tabs.Tab | undefined> {
  const [active] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (active?.url?.startsWith(IG_URL)) return active;
  const tabs = await chrome.tabs.query({ url: `${IG_URL}*` });
  return tabs.find((t) => t.windowId === active?.windowId) ?? tabs[0];
}
