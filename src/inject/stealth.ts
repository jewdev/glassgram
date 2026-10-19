// Helpers that keep the page script's patches looking like the natives they replace.
//
// What this buys: checks like `fetch.toString().includes('[native code]')`, `fetch.name`,
// `fetch.length`, `'prototype' in fetch` or `new fetch()` see what they would see without
// Glassgram. What it doesn't: comparing against a fresh realm (an about:blank iframe's
// Function.prototype.toString), stack traces through a patched function, or timing.
// Function.prototype.toString is only patched once the first hook is installed, so with every
// page-level feature off nothing on the page is patched at all.
//
// Natives the hooks call later are captured here, at document_start, before Instagram's code can
// wrap them and watch what we do.

export const { apply } = Reflect;
const { defineProperty, getOwnPropertyDescriptor } = Object;
export { defineProperty };

export const natives = {
  fetch: window.fetch,
  setTimeout: window.setTimeout,
  bind: Function.prototype.bind,
  dispatchEvent: EventTarget.prototype.dispatchEvent,
  portPost: MessagePort.prototype.postMessage,
  CustomEvent: window.CustomEvent,
  stringify: JSON.stringify,
  parse: JSON.parse,
};

const fnToString = Function.prototype.toString;
/** Patched function → the source text its original reports. */
const sources = new WeakMap<object, string>();

/** Give `fake` the name, length and toString() of `real`. */
export function disguise<F extends (...args: never[]) => unknown>(fake: F, real: (...args: never[]) => unknown): F {
  defineProperty(fake, 'name', { value: real.name, configurable: true });
  defineProperty(fake, 'length', { value: real.length, configurable: true });
  sources.set(fake, apply(fnToString, real, []));
  maskToString();
  return fake;
}

/** Swap a method, keeping the property's writable/enumerable/configurable flags. */
export function replace(obj: object, key: PropertyKey, value: unknown) {
  const d = getOwnPropertyDescriptor(obj, key);
  defineProperty(obj, key, d && 'value' in d ? { ...d, value } : { value, writable: true, enumerable: false, configurable: true });
}

let masked = false;
function maskToString() {
  if (masked) return;
  masked = true;
  // Method shorthand: no .prototype and not constructible, like the native.
  const toString = {
    toString(this: unknown) {
      return (typeof this === 'function' && sources.get(this)) || apply(fnToString, this, []);
    },
  }.toString;
  sources.set(toString, apply(fnToString, fnToString, []));
  replace(Function.prototype, 'toString', toString);
}

/** setTimeout and fetch throw "Illegal invocation" unless called on window. */
export const later = (fn: () => void, ms = 0) => apply(natives.setTimeout, window, [fn, ms]) as number;
export const nativeFetch = (input: RequestInfo | URL, init?: RequestInit) => apply(natives.fetch, window, [input, init]) as Promise<Response>;

/**
 * Dispatches `event` on `target` from a timer through a bound native: the page's handlers then run
 * with no frame of ours under them, so their stack traces don't name the extension.
 */
export const dispatchLater = (target: EventTarget, event: Event) => later(apply(natives.bind, natives.dispatchEvent, [target, event]) as () => void);
