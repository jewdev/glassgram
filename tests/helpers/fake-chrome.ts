import { vi } from 'vitest';

type Listener = (...args: any[]) => any;

function event() {
  const listeners: Listener[] = [];
  return {
    listeners,
    addListener: (l: Listener) => void listeners.push(l),
    removeListener: (l: Listener) => {
      const i = listeners.indexOf(l);
      if (i >= 0) listeners.splice(i, 1);
    },
    fire: (...args: unknown[]) => listeners.map((l) => l(...args)),
  };
}

function area(data: Record<string, unknown> = {}) {
  return {
    data,
    get: vi.fn(async (keys?: string | string[] | null) => {
      if (keys == null) return structuredClone(data);
      return Object.fromEntries([keys].flat().filter((k) => k in data).map((k) => [k, structuredClone(data[k])]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => void Object.assign(data, structuredClone(items))),
    remove: vi.fn(async (keys: string | string[]) => [keys].flat().forEach((k) => delete data[k])),
  };
}

export interface FakeDownload {
  id: number;
  url: string;
  filename?: string;
  state: 'in_progress' | 'complete' | 'interrupted';
}

/**
 * Enough of the extension APIs to load the background worker and offscreen document in Node.
 * `downloads` and `session` can be passed in to simulate a worker restart that keeps browser state.
 */
export function fakeChrome(opts: { downloads?: FakeDownload[]; session?: Record<string, unknown> } = {}) {
  const downloads = opts.downloads ?? [];
  const onMessage = event();
  const c = {
    downloads: {
      list: downloads,
      download: vi.fn(async ({ url, filename }: { url: string; filename?: string }) => {
        const d: FakeDownload = { id: downloads.length + 1, url, filename, state: 'in_progress' };
        downloads.push(d);
        return d.id;
      }),
      search: vi.fn(async ({ id }: { id: number }) => downloads.filter((d) => d.id === id)),
      onChanged: event(),
      /** Mark a download finished and fire the event Chrome would. */
      finish(id: number) {
        downloads.find((d) => d.id === id)!.state = 'complete';
        return Promise.all(c.downloads.onChanged.fire({ id, state: { current: 'complete' } }));
      },
    },
    storage: {
      local: area(),
      sync: area(),
      session: area(opts.session),
      onChanged: event(),
    },
    runtime: {
      onMessage,
      onInstalled: event(),
      onStartup: event(),
      getManifest: () => ({ version: '1.1.0' }),
      getContexts: vi.fn(async () => [] as unknown[]),
      sendMessage: vi.fn(async (_msg: any): Promise<any> => undefined),
      openOptionsPage: vi.fn(),
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      /** Deliver a message the way Chrome would, resolving with the async reply if there is one. */
      deliver(msg: unknown, sender: unknown = {}) {
        return new Promise((resolve) => {
          let async = false;
          for (const l of onMessage.listeners) if (l(msg, sender, resolve) === true) async = true;
          if (!async) setTimeout(() => resolve(undefined));
        });
      },
    },
    offscreen: { createDocument: vi.fn(async () => {}), Reason: { BLOBS: 'BLOBS' } },
    tabs: { sendMessage: vi.fn(async (..._args: any[]) => {}) },
    action: { setBadgeText: vi.fn(), setTitle: vi.fn(), setBadgeBackgroundColor: vi.fn(), setBadgeTextColor: vi.fn() },
    alarms: { get: vi.fn(async () => undefined), create: vi.fn(), clear: vi.fn(async () => true), onAlarm: event() },
    contextMenus: { removeAll: vi.fn(), create: vi.fn(), onClicked: event() },
    declarativeNetRequest: {
      RuleActionType: { BLOCK: 'block' },
      ResourceType: { XMLHTTPREQUEST: 'xmlhttprequest', PING: 'ping', OTHER: 'other' },
      updateSessionRules: vi.fn(async () => {}),
    },
  };
  return c;
}

export type FakeChrome = ReturnType<typeof fakeChrome>;
