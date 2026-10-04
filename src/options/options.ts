import { renderFilename } from '../content/core/filename';
import { controlFor } from '../shared/controls';
import { loadSettings, onSettingsChanged, resetSettings, saveSettings } from '../shared/settings';
import { DEFAULTS, SECTIONS, type SettingDef, type SettingKey, type Settings } from '../shared/settings-schema';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

let settings: Settings;
let savedTimer: number | undefined;

function flashSaved() {
  const el = $('saved');
  el.textContent = 'Saved';
  el.classList.add('is-on');
  clearTimeout(savedTimer);
  savedTimer = window.setTimeout(() => el.classList.remove('is-on'), 1400);
}

let pending: Partial<Settings> = {};
let saveTimer: number | undefined;

/** Debounced save — text inputs fire on every keystroke, and storage.sync has write quotas. */
function change(key: SettingKey, value: Settings[SettingKey]) {
  (settings as Record<SettingKey, unknown>)[key] = value;
  (pending as Record<SettingKey, unknown>)[key] = value;
  refreshDependencies();
  if (key === 'download.filename') renderPreview();
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    const patch = pending;
    pending = {};
    await saveSettings(patch);
    flashSaved();
  }, 300);
}

function previewText(): string {
  const now = Date.now() / 1000;
  return renderFilename(settings['download.filename'], { user: 'natgeo', shortcode: 'C9xYz12AbcD', index: 1, id: '3412345678901234567', takenAt: now, type: 'image' }, 'jpg');
}

function renderPreview() {
  const el = document.getElementById('filename-preview');
  if (el) el.textContent = `Downloads/${previewText()}`;
}

function row(def: SettingDef): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = `row row--${def.type}`;
  wrap.dataset.key = def.key;
  if (def.dependsOn) wrap.dataset.dependsOn = def.dependsOn;
  wrap.dataset.search = `${def.label} ${def.desc ?? ''}`.toLowerCase();

  const text = document.createElement('div');
  text.className = 'row__text';
  const label = document.createElement('label');
  label.className = 'row__label';
  label.htmlFor = `set-${def.key}`;
  label.textContent = def.label;
  text.append(label);
  if (def.desc) {
    const d = document.createElement('p');
    d.className = 'row__desc';
    d.textContent = def.desc;
    text.append(d);
  }

  const control = controlFor(def, settings, change);
  control.classList.add('row__control');
  wrap.append(text, control);

  if (def.type === 'text') {
    const help = document.createElement('div');
    help.className = 'row__extra';
    if (def.help) help.append(Object.assign(document.createElement('p'), { className: 'row__desc', textContent: def.help }));
    if (def.key === 'download.filename') {
      const prev = document.createElement('code');
      prev.id = 'filename-preview';
      prev.className = 'preview';
      help.append(prev);
    }
    wrap.append(help);
  }
  if (def.type === 'toggle' && def.warning) {
    const w = document.createElement('p');
    w.className = 'row__warning';
    w.textContent = def.warning;
    wrap.append(w);
  }
  return wrap;
}

function renderSections() {
  const nav = $('nav');
  const main = $('sections');
  nav.replaceChildren();
  main.replaceChildren();

  for (const sec of SECTIONS) {
    const a = document.createElement('a');
    a.href = `#${sec.id}`;
    a.className = 'nav__item';
    a.innerHTML = `<span class="nav__icon" aria-hidden="true">${sec.icon}</span><span></span>`;
    a.lastElementChild!.textContent = sec.title;
    nav.append(a);

    const card = document.createElement('section');
    card.className = 'card';
    card.id = sec.id;
    const h2 = document.createElement('h2');
    h2.textContent = sec.title;
    card.append(h2);
    if (sec.intro) card.append(Object.assign(document.createElement('p'), { className: 'card__intro', textContent: sec.intro }));
    for (const def of sec.items) card.append(row(def));
    main.append(card);
  }
  renderPreview();
  refreshDependencies();
  observeNav();
}

function refreshDependencies() {
  document.querySelectorAll<HTMLElement>('.row').forEach((r) => {
    const dep = r.dataset.dependsOn as SettingKey | undefined;
    const off = !!dep && !settings[dep];
    r.classList.toggle('is-disabled', off);
    r.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button').forEach((c) => (c.disabled = off));
    const key = r.dataset.key as SettingKey;
    r.classList.toggle('is-on', settings[key] === true);
  });
}

function observeNav() {
  const items = new Map([...document.querySelectorAll<HTMLAnchorElement>('.nav__item')].map((a) => [a.hash.slice(1), a]));
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        items.forEach((a) => a.classList.remove('is-active'));
        items.get(e.target.id)?.classList.add('is-active');
      }
    },
    { rootMargin: '-30% 0px -60% 0px' },
  );
  document.querySelectorAll('.card').forEach((c) => io.observe(c));
}

function applySearch(q: string) {
  const query = q.trim().toLowerCase();
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    let any = false;
    card.querySelectorAll<HTMLElement>('.row').forEach((r) => {
      const hit = !query || r.dataset.search!.includes(query);
      r.hidden = !hit;
      any ||= hit;
    });
    card.hidden = !any;
  });
}

function wireFooter() {
  $('export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'instagram-enhanced-settings.json' });
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
      renderSections();
      flashSaved();
    } catch {
      alert('That file is not a valid settings export.');
    }
  });
  $('reset').addEventListener('click', async () => {
    if (!confirm('Reset all Instagram Enhanced settings to their defaults?')) return;
    settings = await resetSettings();
    renderSections();
    flashSaved();
  });
}

async function init() {
  settings = await loadSettings();
  renderSections();
  wireFooter();
  $<HTMLInputElement>('search').addEventListener('input', (e) => applySearch((e.target as HTMLInputElement).value));
  // Keep in sync with changes made from the popup.
  onSettingsChanged((s) => {
    const changedElsewhere = (Object.keys(s) as SettingKey[]).some((k) => s[k] !== settings[k] && !(k in pending));
    if (!changedElsewhere) return;
    settings = s;
    renderSections();
  });
}

init();
