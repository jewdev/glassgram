// The elements we put into Instagram's DOM. Each is a plain element with no class or attribute and
// a closed shadow root holding our UI (see dom.ts), so we keep track of them here instead of
// marking them.

const hosts = new WeakSet<Element>();

export function addHost(el: Element) {
  hosts.add(el);
}

/** True for our own UI, also for elements inside it (events from our UI are retargeted to the host). */
export function isOwnUi(el: Node | null): boolean {
  for (let n: Node | null = el; n; n = n instanceof ShadowRoot ? n.host : n.parentNode) {
    if (n instanceof Element && hosts.has(n)) return true;
  }
  return false;
}
