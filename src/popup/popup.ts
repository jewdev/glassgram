import { switchControl } from '../shared/controls';
import { sectionIcon } from '../shared/icons';
import { initTheme, setTheme, THEME_LABEL, THEME_ORDER, themeIcon, type ThemeChoice } from '../shared/theme';
import type { Message } from '../shared/messages';
import { loadSettings, saveSettings } from '../shared/settings';
import { renderReleaseNotes } from '../shared/release-notes';
import { SECTIONS, type SettingKey, type Settings } from '../shared/settings-schema';
import { availableUpdate, loadUpdateState, newerThan, onUpdateStateChanged, patchUpdateState, type UpdateState } from '../shared/updates';

const $ = (id: string) => document.getElementById(id)!;
const IG_URL = 'https://www.instagram.com/';

async function activeIgTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith(IG_URL) ? tab : undefined;
}

function renderThemeButton(current: ThemeChoice) {
  const btn = $('theme') as HTMLButtonElement;
  const next = THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
  btn.innerHTML = themeIcon(current, 17);
  btn.title = `Appearance: ${THEME_LABEL[current]} (click for ${THEME_LABEL[next]})`;
  btn.setAttribute('aria-label', btn.title);
  btn.onclick = () => {
    renderThemeButton(next);
    setTheme(next);
  };
}

initTheme(renderThemeButton);

async function init() {
  const settings: Settings = await loadSettings();
  const list = $('toggles');
  const quick = SECTIONS.flatMap((sec) => sec.items.filter((d) => d.quick && d.type === 'toggle').map((def) => ({ def, sec })));

  const updateCount = () => {
    const on = quick.filter(({ def }) => settings[def.key] === true).length;
    $('count').textContent = `${on} of ${quick.length} on`;
  };

  for (const { def, sec } of quick) {
    const li = document.createElement('li');
    li.className = `toggle${sec.half === 'power' ? ' toggle--power' : ''}`;
    const ic = document.createElement('span');
    ic.className = 'toggle__icon';
    ic.innerHTML = sectionIcon(sec.icon, 16);
    const label = document.createElement('label');
    label.className = 'toggle__label';
    label.htmlFor = `set-${def.key}`;
    label.textContent = def.label;
    li.append(
      ic,
      label,
      switchControl(`set-${def.key}`, !!settings[def.key], def.label, (v) => {
        (settings as Record<SettingKey, unknown>)[def.key] = v;
        updateCount();
        saveSettings({ [def.key]: v } as Partial<Settings>);
      }),
    );
    list.append(li);
  }
  updateCount();

  const openSettings = () => chrome.runtime.openOptionsPage();
  $('settings').addEventListener('click', openSettings);
  $('open-settings').addEventListener('click', openSettings);

  const tab = await activeIgTab();
  $('status').classList.toggle('is-active', !!tab);
  $('status-text').textContent = tab ? 'Active on this tab' : 'Open Instagram to use';

  const tool = (id: string, enabled: boolean, msg: Message) => {
    const btn = $(id) as HTMLButtonElement;
    btn.hidden = !enabled;
    btn.addEventListener('click', async () => {
      const t = await activeIgTab();
      if (t?.id !== undefined) {
        await chrome.tabs.sendMessage(t.id, msg).catch(() => {});
      } else {
        await chrome.tabs.create({ url: IG_URL });
      }
      window.close();
    });
  };
  tool('unfollowers', settings['account.unfollowers'], { type: 'openUnfollowers' });
  tool('unsent', settings['dm.keepUnsent'], { type: 'openUnsent' });

  renderUpdate(await loadUpdateState());
  onUpdateStateChanged(renderUpdate);
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
