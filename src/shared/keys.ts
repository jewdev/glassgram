/** Normalise a KeyboardEvent to e.g. "shift+d", "ctrl+alt+k". */
export function comboFromEvent(e: KeyboardEvent): string {
  const mods = [e.ctrlKey && 'ctrl', e.altKey && 'alt', e.shiftKey && 'shift', e.metaKey && 'meta'].filter(Boolean);
  return [...mods, e.key.toLowerCase()].join('+');
}

export function prettyCombo(combo: string): string {
  if (!combo) return 'Not set';
  return combo
    .split('+')
    .map((p) => (p === ' ' ? 'Space' : p.length === 1 ? p.toUpperCase() : p[0].toUpperCase() + p.slice(1)))
    .join(' + ');
}
