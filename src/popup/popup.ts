import { switchControl } from '../shared/controls';
import { sectionIcon } from '../shared/icons';
import type { Message } from '../shared/messages';
import { loadSettings, saveSettings } from '../shared/settings';
import { SECTIONS, type SettingKey, type Settings } from '../shared/settings-schema';

const $ = (id: string) => document.getElementById(id)!;
const IG_URL = 'https://www.instagram.com/';

async function activeIgTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith(IG_URL) ? tab : undefined;
}

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

  const unf = $('unfollowers') as HTMLButtonElement;
  unf.hidden = !settings['account.unfollowers'];
  unf.addEventListener('click', async () => {
    const t = await activeIgTab();
    if (t?.id !== undefined) {
      await chrome.tabs.sendMessage(t.id, { type: 'openUnfollowers' } satisfies Message).catch(() => {});
    } else {
      await chrome.tabs.create({ url: IG_URL });
    }
    window.close();
  });
}

init();
