// Minimal chrome.* stand-in so the built settings page and popup (dist/) run inside the promo
// composition without being installed as an extension. Only the APIs those pages call exist here.
// The embedding scene can seed settings through `window.parent.PROMO_SETTINGS[frameName]`,
// extension-local storage through `PROMO_LOCAL[frameName]`, and the installed version through
// `PROMO_VERSION[frameName]` (to show the update card for a release that is already out). The
// health check answers with the checks in `PROMO_HEALTH`.
(() => {
  const fromParent = (key) => {
    try {
      return window.parent?.[key]?.[window.name];
    } catch {
      return undefined;
    }
  };
  const seed = fromParent('PROMO_SETTINGS') ?? {};
  const sync = { settings: { 'ui.theme': 'dark', ...seed } };
  const local = structuredClone(fromParent('PROMO_LOCAL') ?? {});

  // The built manifest from dist/, read once, synchronously, like chrome.runtime.getManifest().
  const manifest = (() => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', '/manifest.json', false);
      xhr.send();
      return JSON.parse(xhr.responseText);
    } catch {
      return { version: '0.0.0' };
    }
  })();
  const version = fromParent('PROMO_VERSION');
  if (version) manifest.version = version;

  // An Instagram tab whose content script answers the health check (see src/content/health.ts).
  const IG_TAB = { id: 1, windowId: 1, active: true, url: 'https://www.instagram.com/', lastAccessed: 1 };
  const health = () => ({
    version: manifest.version,
    page: 'home',
    at: Date.now(),
    checks: (() => {
      try {
        return structuredClone(window.parent?.PROMO_HEALTH ?? []);
      } catch {
        return [];
      }
    })(),
  });
  const listeners = new Set();

  const area = (store) => ({
    async get(key) {
      if (key == null) return { ...store };
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.filter((k) => k in store).map((k) => [k, structuredClone(store[k])]));
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: store[k], newValue: v };
        store[k] = structuredClone(v);
      }
      listeners.forEach((fn) => fn(changes, store === sync ? 'sync' : 'local'));
    },
    async remove(keys) {
      for (const k of [].concat(keys)) delete store[k];
    },
  });

  window.chrome = {
    storage: {
      sync: area(sync),
      local: area(local),
      onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
    },
    tabs: {
      query: async () => [{ ...IG_TAB }],
      sendMessage: async (_id, msg) => (msg?.type === 'healthCheck' ? health() : undefined),
      create: async () => undefined,
      reload: async () => undefined,
      onUpdated: { addListener: () => {}, removeListener: () => {} },
    },
    windows: { getLastFocused: async () => ({ id: 1 }) },
    downloads: { download: async () => 1, show: () => {}, onChanged: { addListener: () => {} } },
    runtime: {
      openOptionsPage: () => {},
      getURL: (p) => p,
      id: 'promo',
      getManifest: () => structuredClone(manifest),
      reload: () => {},
      sendMessage: async (msg) => (msg?.type === 'ping' ? { ok: true } : undefined),
    },
  };

  // Deterministic rendering: the scene drives every change frame by frame, so no CSS motion of its own.
  // Switches follow a --p (0..1) progress variable the scene sets, so a flip animates on the video's clock.
  const css = `
    *, *::before, *::after { transition: none !important; animation: none !important; }
    html { scroll-behavior: auto !important; }
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
    .switch[style*="--p"] .switch__track { background: color-mix(in srgb, var(--accent) calc(var(--p) * 100%), var(--switch-off)) !important; }
    .switch[style*="--p"] .switch__track::after {
      transform: translateX(calc(var(--p) * 20px)) scaleX(calc(1 + var(--press, 0) * 0.24)) !important;
      transform-origin: calc(var(--p) * 100%) center !important;
    }
    #saved { opacity: var(--saved, 0) !important; transform: none !important; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.addEventListener('DOMContentLoaded', () => document.head.append(style));
})();
