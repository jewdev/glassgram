// RPC to the MAIN-world script (src/inject/main-world.ts), which caches data
// Instagram already loaded and can replay Instagram's own GraphQL queries.

let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }>();

window.addEventListener('message', (e) => {
  const d = e.data;
  if (e.source !== window || !d || d.__ige !== 'rpc-reply') return;
  const p = pending.get(d.id);
  if (!p) return;
  pending.delete(d.id);
  clearTimeout(p.timer);
  if (d.ok) p.resolve(d.result);
  else p.reject(new Error(d.error));
});

export function bridge<T>(op: string, args: Record<string, unknown> = {}, timeoutMs = 20000): Promise<T> {
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(id);
      reject(new Error('Page bridge timed out — reload Instagram.'));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    window.postMessage({ __ige: 'rpc', id, op, args }, location.origin);
  });
}

/** Like bridge(), but resolves to `fallback` on any error (cache lookups). */
export function bridgeSafe<T>(op: string, args: Record<string, unknown>, fallback: T): Promise<T> {
  return bridge<T>(op, args, 3000).catch(() => fallback);
}
