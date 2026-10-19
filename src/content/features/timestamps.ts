import { onDomChange } from '../core/observer';
import { SEL } from '../core/selectors';
import { getSettings } from '../core/state';
import type { Feature } from './types';

/** <time> elements we rewrote → the text Instagram rendered last. Kept here, not on the element. */
const originals = new Map<HTMLTimeElement, string>();

function format(d: Date): string {
  const f = getSettings()['info.timestampFormat'];
  const date = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  if (f === 'date') return date;
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: f !== 'datetime24' });
  return `${date}, ${time}`;
}

function apply(t: HTMLTimeElement) {
  const d = new Date(t.dateTime);
  if (Number.isNaN(d.getTime())) return;
  const text = format(d);
  if (t.textContent === text) return;
  // React may re-render the relative text; remember whatever it wrote last.
  const original = t.textContent ?? '';
  originals.set(t, original);
  t.title = original || t.title;
  t.textContent = text;
  t.style.whiteSpace = 'nowrap';
}

function restoreAll() {
  for (const [t, original] of originals) {
    t.textContent = original;
    t.style.removeProperty('white-space');
  }
  originals.clear();
}

function scan() {
  for (const t of originals.keys()) if (!t.isConnected) originals.delete(t);
  document.querySelectorAll<HTMLTimeElement>(SEL.time).forEach(apply);
}

export const timestamps: Feature = {
  id: 'timestamps',
  isEnabled: (s) => s['info.timestamps'],
  start() {
    const off = onDomChange(scan);
    return () => {
      off();
      restoreAll();
    };
  },
  onSettings: () => scan(),
};
