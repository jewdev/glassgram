import { comboFromEvent, prettyCombo } from './keys';
import type { SettingDef, SettingKey, Settings } from './settings-schema';

type Change = (key: SettingKey, value: Settings[SettingKey]) => void;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids);
  return e;
}

export function switchControl(id: string, checked: boolean, label: string, onChange: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox', id, role: 'switch', 'aria-label': label });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('span', { class: 'switch' }, input, el('span', { class: 'switch__track' }));
}

/** Build the input element for a setting definition. */
export function controlFor(def: SettingDef, s: Settings, onChange: Change): HTMLElement {
  const id = `set-${def.key}`;
  const value = s[def.key];
  switch (def.type) {
    case 'toggle':
      return switchControl(id, !!value, def.label, (v) => onChange(def.key, v));
    case 'select': {
      const sel = el('select', { id, class: 'control' }, ...def.options.map((o) => el('option', { value: o.value }, o.label)));
      sel.value = String(value);
      sel.addEventListener('change', () => onChange(def.key, sel.value));
      return sel;
    }
    case 'number': {
      const input = el('input', { id, class: 'control control--num', type: 'number', min: String(def.min), max: String(def.max), step: String(def.step) });
      input.value = String(value);
      input.addEventListener('change', () => {
        const n = Math.min(def.max, Math.max(def.min, Number(input.value) || def.min));
        input.value = String(n);
        onChange(def.key, n);
      });
      return def.unit ? el('span', { class: 'num-wrap' }, input, el('span', { class: 'unit' }, def.unit)) : input;
    }
    case 'text': {
      const input = el('input', { id, class: 'control control--text', type: 'text', placeholder: def.placeholder ?? '', spellcheck: 'false' });
      input.value = String(value);
      input.addEventListener('input', () => onChange(def.key, input.value));
      return input;
    }
    case 'shortcut': {
      let current = String(value);
      const btn = el('button', { id, class: 'control kbd-btn', type: 'button', title: 'Click, then press a key combination. Backspace clears.' }, prettyCombo(current));
      let listening = false;
      const stop = () => {
        listening = false;
        btn.classList.remove('is-listening');
        document.removeEventListener('keydown', onKey, true);
      };
      const onKey = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        if (e.key === 'Escape') {
          btn.textContent = prettyCombo(current);
          return stop();
        }
        current = e.key === 'Backspace' || e.key === 'Delete' ? '' : comboFromEvent(e);
        btn.textContent = prettyCombo(current);
        onChange(def.key, current);
        stop();
      };
      btn.addEventListener('click', () => {
        if (listening) return stop();
        listening = true;
        btn.classList.add('is-listening');
        btn.textContent = 'Press keys…';
        document.addEventListener('keydown', onKey, true);
      });
      btn.addEventListener('blur', () => {
        if (!listening) return;
        btn.textContent = prettyCombo(current);
        stop();
      });
      return btn;
    }
  }
}
