// Minimal chrome.* stand-in so the built settings page and popup (dist/) run inside the promo
// composition without being installed as an extension. Only the APIs those pages call exist here.
// The embedding scene can seed settings through `window.parent.PROMO_SETTINGS[frameName]`.
(() => {
  const seed = (() => {
    try {
      return window.parent?.PROMO_SETTINGS?.[window.name] ?? {};
    } catch {
      return {};
    }
  })();
  const sync = { settings: { 'ui.theme': 'dark', ...seed } };
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
      local: area({}),
      onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://www.instagram.com/' }],
      sendMessage: async () => undefined,
      create: async () => undefined,
    },
    runtime: { openOptionsPage: () => {}, getURL: (p) => p, id: 'promo' },
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
