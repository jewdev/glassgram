import { featureIcon } from '../shared/icons';
import { initTheme, setTheme, THEME_LABEL, THEME_ORDER, themeIcon, type ThemeChoice } from '../shared/theme';
import type { Message } from '../shared/messages';
import { IG_URL } from '../shared/tabs';
import { loadSettings, saveSettings } from '../shared/settings';
import { dayKey, FOCUS_KEY, formatLeft, REELS_KEY, reelsText, reelTally, today } from '../shared/focus';
import { renderReleaseNotes } from '../shared/release-notes';
import { SECTIONS, type Section, type SettingDef, type SettingKey, type Settings } from '../shared/settings-schema';
import { availableUpdate, loadUpdateState, newerThan, onUpdateStateChanged, patchUpdateState, type UpdateState } from '../shared/updates';

const $ = (id: string) => document.getElementById(id)!;

async function activeIgTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith(IG_URL) ? tab : undefined;
}

function renderThemeButton(current: ThemeChoice) {
  const btn = $('theme') as HTMLButtonElement;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
  btn.innerHTML = themeIcon(current, 18);
  btn.append(Object.assign(document.createElement('span'), { textContent: THEME_LABEL[current] }));
  btn.title = `Appearance: ${THEME_LABEL[current]} (click for ${THEME_LABEL[next]})`;
  btn.setAttribute('aria-label', btn.title);
  btn.onclick = () => {
    renderThemeButton(next);
    setTheme(next);
  };
}

const RISK_TEXT = { experimental: 'experimental', untested: 'not tested yet', risky: 'rate-limit risk', account: 'account risk' } as const;

/** One quick toggle as a tap tile: icon, short label and On/Off. Power tools are drawn in red. */
function tile(def: SettingDef, sec: Section, on: boolean, onChange: (on: boolean) => void): HTMLButtonElement {
  const power = sec.half === 'power';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `tile${power ? ' tile--risk' : ''}`;
  btn.title = def.desc ? `${def.label}: ${def.desc}` : def.label;
  const ic = document.createElement('span');
  ic.className = 'tile__icon';
  ic.innerHTML = featureIcon(def.key, sec.icon, 17);
  const text = document.createElement('span');
  text.className = 'tile__text';
  const label = document.createElement('span');
  label.className = 'tile__label';
  // Power tiles span the row, so they have room for the full name.
  label.textContent = power ? def.label : (def.short ?? def.label);
  const state = document.createElement('span');
  state.className = 'tile__state';
  text.append(label, state);
  btn.append(ic, text);
  const render = (v: boolean) => {
    btn.setAttribute('aria-pressed', String(v));
    state.textContent = (v ? 'On' : 'Off') + (def.badge ? ` · ${RISK_TEXT[def.badge]}` : '');
  };
  render(on);
  btn.addEventListener('click', () => {
    on = !on;
    render(on);
    onChange(on);
  });
  return btn;
}

initTheme(renderThemeButton);

async function init() {
  const settings: Settings = await loadSettings();
  const quick = SECTIONS.flatMap((sec) => sec.items.filter((d) => d.quick && d.type === 'toggle').map((def) => ({ def, sec })));
  const everyday = quick.filter(({ sec }) => sec.half !== 'power');

  const updateCount = () => {
    const on = everyday.filter(({ def }) => settings[def.key] === true).length;
    $('count').textContent = `· ${on} on`;
  };

  for (const { def, sec } of quick) {
    const t = tile(def, sec, !!settings[def.key], (v) => {
      (settings as Record<SettingKey, unknown>)[def.key] = v;
      updateCount();
      saveSettings({ [def.key]: v } as Partial<Settings>);
    });
    $(sec.half === 'power' ? 'power-tiles' : 'tiles').append(t);
  }
  $('power').hidden = !quick.some(({ sec }) => sec.half === 'power');
  updateCount();

  $('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());

  const tab = await activeIgTab();
  $('status').classList.toggle('is-active', !!tab);
  $('status-text').textContent = tab ? 'Active' : 'Not on Instagram';

  const tool = (id: string, enabled: boolean, panel: 'openUnfollowers' | 'openUnsent') => {
    const btn = $(id) as HTMLButtonElement;
    btn.hidden = !enabled;
    btn.addEventListener('click', () => {
      // The background opens or focuses Instagram and shows the panel; this popup closes meanwhile.
      chrome.runtime.sendMessage({ type: 'openOnInstagram', panel } satisfies Message).catch(() => {});
      window.close();
    });
  };
  tool('unfollowers', settings['account.unfollowers'], 'openUnfollowers');
  tool('unsent', settings['dm.keepUnsent'], 'openUnsent');

  if (settings['focus.enabled'] || settings['focus.reelCounter']) renderToday(settings);
  renderUpdate(await loadUpdateState());
  onUpdateStateChanged(renderUpdate);
}

// ---------------- focus: today's reels and time ----------------
async function renderToday(settings: Settings) {
  const stored = await chrome.storage.local.get([FOCUS_KEY, REELS_KEY]).catch(() => ({}) as Record<string, unknown>);
  const strong = (text: string) => Object.assign(document.createElement('strong'), { textContent: text });
  const parts: (string | Node)[] = ['Today: '];
  if (settings['focus.reelCounter']) parts.push(strong(reelsText(reelTally(stored[REELS_KEY], dayKey()).count)), ' watched');
  if (settings['focus.enabled']) {
    const used = today(stored[FOCUS_KEY], dayKey()).usedMs;
    if (parts.length > 1) parts.push(', ');
    parts.push(strong(used >= 60_000 ? formatLeft(used) : 'under a minute'), ' on Reels and Explore');
  }
  const box = $('focus-today');
  box.replaceChildren(...parts);
  box.hidden = false;
}

// ---------------- update banner ----------------
const CURRENT_VERSION = chrome.runtime.getManifest().version;

/** Shows the newest release with the notes of every version since the installed one. */
function renderUpdate(state: UpdateState) {
  const box = $('update');
  const update = availableUpdate(state, CURRENT_VERSION);
  box.hidden = !update;
  if (!update) return;
  $('update-title').textContent = `Version ${update.version} is available`;
  $('update-sub').textContent = `You have ${CURRENT_VERSION}`;
  $('update-notes').replaceChildren(renderReleaseNotes(newerThan(state.releases, CURRENT_VERSION)));
  $('update-get').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/index.html#update') });
    window.close();
  };
  $('update-skip').onclick = () => patchUpdateState({ skipped: update.version });
}

init();
