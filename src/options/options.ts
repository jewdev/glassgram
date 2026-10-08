import { renderFilename } from '../content/core/filename';
import { controlFor, switchControl } from '../shared/controls';
import { sectionIcon } from '../shared/icons';
import type { Message } from '../shared/messages';
import { downloadRelease, renderReleaseNotes } from '../shared/release-notes';
import { initTheme, setTheme, THEME_LABEL, THEME_ORDER, themeIcon, type ThemeChoice } from '../shared/theme';
import { loadSettings, onSettingsChanged, resetSettings, saveSettings } from '../shared/settings';
import { DEFAULTS, SECTIONS, type Section, type SectionIcon, type SettingDef, type SettingKey, type Settings } from '../shared/settings-schema';
import { availableUpdate, between, loadUpdateState, newerThan, onUpdateStateChanged, patchUpdateState, RELEASES_URL, type UpdateState } from '../shared/updates';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const BADGE_TEXT = { experimental: 'Experimental', untested: 'Not tested yet', risky: 'Rate-limit risk', account: 'Account risk' } as const;
const HALVES = [
  { id: 'everyday', title: 'Everyday' },
  { id: 'power', title: 'Power tools' },
] as const;

let settings: Settings;

$('version').textContent = `v${chrome.runtime.getManifest().version}`;

// ---------------- saving ----------------
let pending: Partial<Settings> = {};
let saveTimer: number | undefined;
let savedTimer: number | undefined;

function flashSaved() {
  const el = $('saved');
  el.classList.add('is-on');
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => el.classList.remove('is-on'), 1600);
}

/** Debounced save: text inputs fire on every keystroke and storage.sync has write quotas. */
function change(key: SettingKey, value: Settings[SettingKey]) {
  (settings as Record<SettingKey, unknown>)[key] = value;
  (pending as Record<SettingKey, unknown>)[key] = value;
  refreshState();
  if (key === 'download.filename') renderPreview();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const patch = pending;
    pending = {};
    await saveSettings(patch);
    flashSaved();
  }, 250);
}

// ---------------- rendering ----------------
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

const icon = (name: SectionIcon) => sectionIcon(name);

function previewText(): string {
  return renderFilename(
    settings['download.filename'],
    { user: 'natgeo', shortcode: 'C9xYz12AbcD', index: 1, id: '3412345678901234567', takenAt: Date.now() / 1000, type: 'image' },
    'jpg',
  );
}

function renderPreview() {
  const p = document.getElementById('filename-preview');
  if (p) p.textContent = `Downloads/${previewText()}`;
}

function searchText(def: SettingDef): string {
  return `${def.label} ${def.desc ?? ''} ${def.type === 'text' ? def.help ?? '' : ''}`.toLowerCase();
}

/** One setting: label, description, badge, control. Text fields stack their input below. */
function settingRow(def: SettingDef, sub: boolean): HTMLElement {
  const row = el('div', `row row--${def.type}${sub ? ' row--sub' : ''}`);
  row.dataset.key = def.key;
  row.dataset.search = searchText(def);

  const text = el('div', 'row__text');
  const label = el('label', 'row__label', def.label);
  label.htmlFor = `set-${def.key}`;
  const title = el('div', 'row__title');
  title.append(label);
  if (def.badge) {
    const b = el('span', `badge badge--${def.badge}`, BADGE_TEXT[def.badge]);
    title.append(b);
  }
  text.append(title);
  if (def.desc) text.append(el('p', 'row__desc', def.desc));

  const control = controlFor(def, settings, change);
  control.classList.add('row__control');
  row.append(text, control);

  if (def.type === 'text') {
    if (def.help) row.append(el('p', 'row__help', def.help));
    if (def.key === 'download.filename') {
      const prev = el('code', 'preview');
      prev.id = 'filename-preview';
      row.append(prev);
    }
  }
  return row;
}

/** A feature: its main row, plus a warning and sub-options that open while it's on. */
function featureBlock(def: SettingDef, children: SettingDef[]): HTMLElement {
  const block = el('div', 'feature');
  block.dataset.key = def.key;
  block.append(settingRow(def, false));

  const warning = def.type === 'toggle' ? def.warning : undefined;
  if (children.length || warning) {
    block.classList.add('feature--expandable');
    const drawer = el('div', 'feature__drawer');
    const inner = el('div', 'feature__inner');
    if (warning) {
      const w = el('p', 'feature__warning');
      w.innerHTML =
        '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 2.8 19.5h18.4Z"/><path d="M12 10v4M12 17h.01"/></svg>';
      w.append(el('span', '', warning));
      inner.append(w);
    }
    for (const c of children) inner.append(settingRow(c, true));
    drawer.append(inner);
    block.append(drawer);
  }
  return block;
}

/** Top-level toggles in a section, used for the "3 of 7 on" count. */
function mainToggles(sec: Section): SettingDef[] {
  return sec.items.filter((d) => d.type === 'toggle' && !d.dependsOn);
}

function sectionPanel(sec: Section): HTMLElement {
  const panel = el('section', 'panel glass');
  panel.id = sec.id;
  panel.setAttribute('aria-labelledby', `${sec.id}-title`);

  const head = el('header', 'panel__head');
  const ic = el('span', 'panel__icon');
  ic.innerHTML = icon(sec.icon);
  const h2 = el('h2', '', sec.title);
  h2.id = `${sec.id}-title`;
  const count = el('span', 'count');
  count.dataset.count = sec.id;
  head.append(ic, h2, count);
  panel.append(head);
  if (sec.intro) panel.append(el('p', 'panel__intro', sec.intro));

  const list = el('div', 'panel__list');
  for (const def of sec.items) {
    if (def.dependsOn && sec.items.some((p) => p.key === def.dependsOn)) continue; // rendered inside its parent
    const children = sec.items.filter((c) => c.dependsOn === def.key);
    list.append(featureBlock(def, children));
  }
  panel.append(list);
  return panel;
}

function navItem(sec: Section): HTMLElement {
  const a = el('a', 'nav__item');
  a.href = `#${sec.id}`;
  a.dataset.target = sec.id;
  a.innerHTML = icon(sec.icon);
  a.append(el('span', 'nav__label', sec.title));
  const c = el('span', 'nav__count');
  c.dataset.count = sec.id;
  a.append(c);
  return a;
}

function render() {
  const nav = $('nav');
  const main = $('sections');
  const scrollY = window.scrollY;
  nav.replaceChildren();
  main.replaceChildren();

  for (const half of HALVES) {
    const secs = SECTIONS.filter((s) => s.half === half.id);
    const group = el('div', 'nav__group');
    group.append(el('p', 'nav__heading', half.title));
    secs.forEach((s) => group.append(navItem(s)));
    nav.append(group);

    const zone = el('div', `half half--${half.id}`);
    const h = el('h2', 'half__title', half.title);
    if (half.id === 'power') zone.append(h, el('p', 'half__sub', 'Risky, experimental or account-level features. Off by default.'));
    else zone.append(h);
    secs.forEach((s) => zone.append(sectionPanel(s)));
    main.append(zone);
  }

  renderPreview();
  renderAutoCheck();
  refreshState();
  applySearch(($('search') as HTMLInputElement).value);
  observeNav();
  window.scrollTo(0, scrollY);
}

/** Sync open/closed drawers, disabled sub-options and on-counts with current settings. */
function refreshState() {
  document.querySelectorAll<HTMLElement>('.feature').forEach((f) => {
    const on = settings[f.dataset.key as SettingKey] === true;
    f.classList.toggle('is-on', on);
    f.querySelectorAll<HTMLElement>('.row--sub').forEach((r) => {
      r.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((c) => (c.disabled = !on));
    });
    const drawer = f.querySelector('.feature__drawer');
    if (drawer) drawer.toggleAttribute('inert', !on && !f.classList.contains('is-match'));
  });
  for (const sec of SECTIONS) {
    const toggles = mainToggles(sec);
    const n = toggles.filter((d) => settings[d.key] === true).length;
    document.querySelectorAll<HTMLElement>(`[data-count="${sec.id}"]`).forEach((c) => {
      c.textContent = c.classList.contains('nav__count') ? `${n}/${toggles.length}` : `${n} of ${toggles.length} on`;
    });
  }
}

// ---------------- search ----------------
function applySearch(q: string) {
  const query = q.trim().toLowerCase();
  let any = false;
  document.querySelectorAll<HTMLElement>('.panel').forEach((panel) => {
    let panelHit = false;
    panel.querySelectorAll<HTMLElement>('.feature').forEach((f) => {
      const main = f.querySelector<HTMLElement>(':scope > .row')!;
      const subs = [...f.querySelectorAll<HTMLElement>('.row--sub')];
      const mainHit = !query || main.dataset.search!.includes(query);
      const subHit = !!query && subs.some((s) => s.dataset.search!.includes(query));
      const hit = mainHit || subHit;
      f.hidden = !hit;
      f.classList.toggle('is-match', subHit); // open the drawer to show the matching sub-option
      panelHit ||= hit;
    });
    panel.hidden = !panelHit;
    any ||= panelHit;
  });
  document.querySelectorAll<HTMLElement>('.half').forEach((h) => (h.hidden = ![...h.querySelectorAll('.panel')].some((p) => !(p as HTMLElement).hidden)));
  document.querySelectorAll<HTMLElement>('.nav__item').forEach((a) => (a.hidden = !!document.getElementById(a.dataset.target!)?.hidden));
  document.querySelectorAll<HTMLElement>('.nav__group').forEach((g) => (g.hidden = ![...g.querySelectorAll<HTMLElement>('.nav__item')].some((a) => !a.hidden)));
  $('empty').hidden = any;
  refreshState();
}

// ---------------- nav highlight ----------------
let io: IntersectionObserver | undefined;
function observeNav() {
  io?.disconnect();
  const items = new Map([...document.querySelectorAll<HTMLAnchorElement>('.nav__item')].map((a) => [a.dataset.target!, a]));
  io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        items.forEach((a) => a.removeAttribute('aria-current'));
        items.get(e.target.id)?.setAttribute('aria-current', 'true');
      }
    },
    { rootMargin: '-25% 0px -65% 0px' },
  );
  document.querySelectorAll('.panel').forEach((p) => io!.observe(p));
}

// ---------------- footer actions ----------------
function wireActions() {
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'glassgram-settings.json' });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });

  const file = $<HTMLInputElement>('import-file');
  $('import').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    file.value = '';
    if (!f) return;
    try {
      const raw = JSON.parse(await f.text()) as Record<string, unknown>;
      // Only accept known keys with matching value types.
      const patch: Partial<Settings> = {};
      for (const k of Object.keys(DEFAULTS) as SettingKey[]) {
        if (k in raw && typeof raw[k] === typeof DEFAULTS[k]) (patch as Record<string, unknown>)[k] = raw[k];
      }
      settings = await saveSettings(patch);
      render();
      flashSaved();
    } catch {
      showNotice("That file isn't a valid settings export.");
    }
  });

  const dialog = $<HTMLDialogElement>('confirm');
  $('reset').addEventListener('click', () => dialog.showModal());
  dialog.addEventListener('close', async () => {
    if (dialog.returnValue !== 'reset') return;
    settings = await resetSettings();
    render();
    flashSaved();
  });
}

function showNotice(text: string) {
  const s = $('saved');
  s.querySelector('span')!.textContent = text;
  s.classList.add('is-on', 'is-error');
  setTimeout(() => {
    s.classList.remove('is-on', 'is-error');
    s.querySelector('span')!.textContent = 'Saved';
  }, 3000);
}

// ---------------- appearance ----------------
function renderThemeControl(current: ThemeChoice) {
  const group = $('theme');
  group.replaceChildren(
    ...THEME_ORDER.map((choice) => {
      const b = el('button', 'segmented__opt');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(choice === current));
      b.tabIndex = choice === current ? 0 : -1;
      b.title = THEME_LABEL[choice];
      b.innerHTML = themeIcon(choice);
      b.append(el('span', 'segmented__label', THEME_LABEL[choice]));
      b.addEventListener('click', async () => {
        renderThemeControl(choice);
        settings['ui.theme'] = choice;
        await setTheme(choice);
        flashSaved();
      });
      return b;
    }),
  );
  // Arrow keys move between options, as in a native radio group.
  group.onkeydown = (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    e.preventDefault();
    const i = THEME_ORDER.indexOf(current) + (e.key === 'ArrowRight' ? 1 : -1);
    const next = THEME_ORDER[(i + THEME_ORDER.length) % THEME_ORDER.length];
    (group.children[THEME_ORDER.indexOf(next)] as HTMLButtonElement).click();
    requestAnimationFrame(() => (group.children[THEME_ORDER.indexOf(next)] as HTMLButtonElement).focus());
  };
}

// ---------------- updates ----------------
const CURRENT_VERSION = chrome.runtime.getManifest().version;
let checking = false;
let downloadId: number | undefined;

function ago(ts: number): string {
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function renderAutoCheck() {
  $('update-auto').replaceChildren(
    switchControl('set-updates.check', settings['updates.check'], 'Check for updates automatically', (v) => change('updates.check', v)),
  );
}

function renderUpdates(state: UpdateState) {
  const pending = newerThan(state.releases, CURRENT_VERSION);
  const update = availableUpdate(state, CURRENT_VERSION);

  // Sidebar status line.
  const status = $('update-status');
  status.classList.toggle('is-new', !checking && !!pending.length);
  status.classList.toggle('is-error', !checking && !pending.length && !!state.error);
  if (checking) status.textContent = 'Checking…';
  else if (pending.length) {
    const link = el('a', '', `Version ${pending[0].version} is available`);
    link.href = '#update';
    // A skipped version stays reachable from here.
    link.addEventListener('click', () => state.skipped && patchUpdateState({ skipped: undefined }));
    status.replaceChildren(link);
  } else if (state.error) status.textContent = state.error;
  else status.textContent = state.checkedAt ? `Up to date · checked ${ago(state.checkedAt)}` : 'Not checked yet';

  // "Update available" card, with the notes of every version since the installed one.
  $('update').hidden = !update;
  if (update) {
    $('update-card-title').textContent = `Glassgram ${update.version} is available`;
    $('update-card-sub').textContent = `You have ${CURRENT_VERSION}.${pending.length > 1 ? ` Changes from ${pending.length} new versions below.` : ' Here is what changed.'}`;
    $('update-card-notes').replaceChildren(renderReleaseNotes(pending));
    const dl = $<HTMLButtonElement>('update-download');
    dl.onclick = async () => {
      dl.disabled = true;
      dl.textContent = 'Downloading…';
      try {
        downloadId = await downloadRelease(update);
      } catch {
        dl.disabled = false;
        dl.textContent = 'Download ZIP';
        showNotice("Couldn't start the download.");
      }
    };
    $('update-skip').onclick = () => patchUpdateState({ skipped: update.version });
  }

  // "What's new" card after an update was installed.
  const from = state.updatedFrom;
  $('whats-new').hidden = !from;
  if (from) {
    $('whats-new-title').textContent = `Updated to ${CURRENT_VERSION}`;
    $('whats-new-sub').textContent = `You were on ${from}. Here is what changed.`;
    const changed = between(state.releases, from, CURRENT_VERSION);
    const notes = $('whats-new-notes');
    if (changed.length) notes.replaceChildren(renderReleaseNotes(changed));
    else {
      const p = el('p', 'update-card__sub', state.error ? "Release notes couldn't load. " : 'Loading release notes…');
      if (state.error) {
        const a = el('a', '', 'See them on GitHub');
        a.href = RELEASES_URL;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        p.append(a);
      }
      notes.replaceChildren(p);
    }
  }
}

async function checkNow() {
  const btn = $<HTMLButtonElement>('update-check');
  checking = true;
  btn.disabled = true;
  renderUpdates(await loadUpdateState());
  try {
    await chrome.runtime.sendMessage({ type: 'checkUpdates' } satisfies Message);
  } finally {
    checking = false;
    btn.disabled = false;
    renderUpdates(await loadUpdateState());
  }
}

function wireUpdates() {
  $('update-check').addEventListener('click', checkNow);
  $('update-reload').addEventListener('click', () => chrome.runtime.reload());
  $('update-show').addEventListener('click', () => downloadId !== undefined && chrome.downloads.show(downloadId));
  $('whats-new-close').addEventListener('click', () => patchUpdateState({ updatedFrom: undefined }));
  chrome.downloads.onChanged.addListener((d) => {
    if (d.id !== downloadId || !d.state) return;
    const dl = $<HTMLButtonElement>('update-download');
    const done = d.state.current === 'complete';
    dl.textContent = done ? 'Downloaded' : d.state.current === 'interrupted' ? 'Download ZIP' : dl.textContent;
    dl.disabled = d.state.current !== 'interrupted';
    $('update-show').hidden = !done;
  });
  onUpdateStateChanged((s) => !checking && renderUpdates(s));
}

// ---------------- init ----------------
initTheme((choice) => renderThemeControl(choice));

async function init() {
  settings = await loadSettings();
  renderThemeControl(settings['ui.theme']);
  render();
  wireActions();
  wireUpdates();
  renderUpdates(await loadUpdateState());
  if (location.hash === '#update') $('update').scrollIntoView();

  const search = $<HTMLInputElement>('search');
  search.addEventListener('input', () => applySearch(search.value));
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) && !t.closest('.kbd-btn')) {
      e.preventDefault();
      search.focus();
    } else if (e.key === 'Escape' && t === search && search.value) {
      search.value = '';
      applySearch('');
    }
  });

  // Keep in sync with changes made from the popup.
  onSettingsChanged((s) => {
    const changedElsewhere = (Object.keys(s) as SettingKey[]).some((k) => s[k] !== settings[k] && !(k in pending));
    if (!changedElsewhere) return;
    settings = s;
    render();
  });
}

init();
