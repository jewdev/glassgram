import { onDomChange } from '../core/observer';
import { SEL } from '../core/selectors';
import { getSettings } from '../core/state';
import type { Feature } from './types';

const ORIGINAL = 'igeOriginal';

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
  t.dataset[ORIGINAL] = t.textContent ?? '';
  t.title = t.dataset[ORIGINAL] || t.title;
  t.textContent = text;
  t.classList.add('ige-time');
}

function restoreAll() {
  document.querySelectorAll<HTMLTimeElement>('time.ige-time').forEach((t) => {
    if (t.dataset[ORIGINAL] != null) t.textContent = t.dataset[ORIGINAL]!;
    t.classList.remove('ige-time');
    delete t.dataset[ORIGINAL];
  });
}

function scan() {
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
