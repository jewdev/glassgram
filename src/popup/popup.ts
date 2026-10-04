import { switchControl } from '../shared/controls';
import type { Message } from '../shared/messages';
import { loadSettings, saveSettings } from '../shared/settings';
import { SECTIONS, type Settings } from '../shared/settings-schema';

const $ = (id: string) => document.getElementById(id)!;
const IG_URL = 'https://www.instagram.com/';

async function activeIgTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url?.startsWith(IG_URL) ? tab : undefined;
}

async function init() {
  const settings: Settings = await loadSettings();
  const list = $('toggles');

  for (const def of SECTIONS.flatMap((s) => s.items).filter((d) => d.quick && d.type === 'toggle')) {
    const li = document.createElement('li');
    li.className = 'toggle';
    const label = document.createElement('label');
    label.htmlFor = `set-${def.key}`;
    label.textContent = def.label;
    li.append(
      label,
      switchControl(`set-${def.key}`, !!settings[def.key], def.label, (v) => saveSettings({ [def.key]: v } as Partial<Settings>)),
    );
    list.append(li);
  }

  const openSettings = () => chrome.runtime.openOptionsPage();
  $('settings').addEventListener('click', openSettings);
  $('open-settings').addEventListener('click', openSettings);

  const tab = await activeIgTab();
  $('status').textContent = tab ? 'Active on this tab' : 'Open Instagram to use';

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
