// Filtering of Instagram DM ("LightSpeed") requests sent over the chat socket.
// Requests are JSON: { request_id, type, payload: "<json>" } where the inner payload either is a
// single task-like object (typing indicator: type 4, contains is_typing) or holds { tasks: [{ label, ... }] }.
// Task label "21" marks a thread as read. We remove only the unwanted part and keep everything else,
// so a batch that also sends a message still goes out.

export interface DmFilter {
  typing: boolean;
  seen: boolean;
}

export const READ_TASK_LABEL = '21';

/** Returns the request unchanged, a rewritten request, or null to drop it entirely. */
export function filterLightspeedRequest(json: string, f: DmFilter): string | null {
  if (!f.typing && !f.seen) return json;
  if (!/is_typing|"label\\?"\s*:\s*\\?"?21|last_read_watermark/.test(json)) return json;
  let req: { type?: number; payload?: unknown };
  try {
    req = JSON.parse(json);
  } catch {
    return json;
  }
  if (typeof req.payload !== 'string') return json;
  let inner: { tasks?: { label?: string | number }[]; [k: string]: unknown };
  try {
    inner = JSON.parse(req.payload);
  } catch {
    return json;
  }

  if (f.typing && req.payload.includes('is_typing') && !Array.isArray(inner.tasks)) return null;

  if (f.seen && Array.isArray(inner.tasks)) {
    const kept = inner.tasks.filter((t) => String(t.label) !== READ_TASK_LABEL);
    if (kept.length === inner.tasks.length) return json;
    if (!kept.length) return null;
    return JSON.stringify({ ...req, payload: JSON.stringify({ ...inner, tasks: kept }) });
  }
  return json;
}

// ---------------- MQTT (edge-chat.instagram.com) ----------------

function readVarint(b: Uint8Array, at: number): { value: number; next: number } | null {
  let value = 0;
  let mul = 1;
  for (let i = at; i < Math.min(b.length, at + 4); i++) {
    value += (b[i] & 0x7f) * mul;
    if (!(b[i] & 0x80)) return { value, next: i + 1 };
    mul *= 128;
  }
  return null;
}

function writeVarint(n: number): number[] {
  const out: number[] = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
}

/**
 * Filter an MQTT PUBLISH to /ls_req. Returns the original bytes, new bytes, or null to drop.
 * Anything that isn't a well-formed single PUBLISH to /ls_req is returned untouched.
 */
export function filterMqttFrame(bytes: Uint8Array, f: DmFilter): Uint8Array | null {
  if ((bytes[0] >> 4) !== 3) return bytes; // not PUBLISH
  const qos = (bytes[0] >> 1) & 3;
  const len = readVarint(bytes, 1);
  if (!len || len.next + len.value !== bytes.length) return bytes;
  let p = len.next;
  const topicLen = (bytes[p] << 8) | bytes[p + 1];
  const topic = new TextDecoder().decode(bytes.subarray(p + 2, p + 2 + topicLen));
  if (topic !== '/ls_req') return bytes;
  p += 2 + topicLen + (qos > 0 ? 2 : 0);
  const header = bytes.subarray(len.next, p);
  const payload = new TextDecoder().decode(bytes.subarray(p));
  const filtered = filterLightspeedRequest(payload, f);
  if (filtered === null) return null;
  if (filtered === payload) return bytes;
  const body = new TextEncoder().encode(filtered);
  const rest = header.length + body.length;
  const out = new Uint8Array(1 + writeVarint(rest).length + rest);
  out[0] = bytes[0];
  out.set(writeVarint(rest), 1);
  out.set(header, 1 + writeVarint(rest).length);
  out.set(body, 1 + writeVarint(rest).length + header.length);
  return out;
}
