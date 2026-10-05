// Decoding of Instagram's realtime DM deltas ("Slide" sync).
//
// The DM client receives frames on wss://gateway.instagram.com/ws/lightspeed. Each frame is a short
// binary header followed by JSON: { request_id, payload: "<base64 protobuf>" }. Somewhere inside the
// protobuf is a JSON document like
//   [{ data: { slide_delta_processor: [ { __typename: 'SlideUQPPNewMessage', message: {...} },
//                                       { __typename: 'SlideUQPPDeleteMessage', thread_fbid, message_id } ] } }]
// We don't rely on the protobuf schema: we walk every length-delimited field and keep the ones that
// parse as JSON. Thread history loaded over HTTP carries the same message objects.

export interface DmMessage {
  id: string;
  thread: string;
  senderId: string;
  username?: string;
  name?: string;
  text?: string;
  /** Instagram's content type, e.g. TEXT, IMAGE, VIDEO, SHARE. */
  kind: string;
  /** Media URLs found in the message content (they expire after a while). */
  media: string[];
  ts: number;
}

export type DmEvent = { type: 'message'; message: DmMessage } | { type: 'unsend'; thread: string; id: string };

function readVarint(b: Uint8Array, at: number): [value: number, next: number] | null {
  let value = 0;
  let mul = 1;
  for (let i = at; i < b.length && i < at + 10; i++) {
    value += (b[i] & 0x7f) * mul;
    if (!(b[i] & 0x80)) return [value, i + 1];
    mul *= 128;
  }
  return null;
}

const utf8 = new TextDecoder('utf-8', { fatal: true });

function tryJson(bytes: Uint8Array): unknown {
  const first = bytes[0];
  if (first !== 0x7b && first !== 0x5b) return undefined; // { or [
  try {
    return JSON.parse(utf8.decode(bytes));
  } catch {
    return undefined;
  }
}

/** Every JSON document embedded in a protobuf message, at any depth. */
export function jsonInProtobuf(bytes: Uint8Array, depth = 0, out: unknown[] = []): unknown[] {
  if (depth > 6) return out;
  let p = 0;
  while (p < bytes.length) {
    const key = readVarint(bytes, p);
    if (!key) return out;
    const [k, next] = key;
    p = next;
    const wire = k & 7;
    if (k >>> 3 === 0) return out;
    if (wire === 0) {
      const v = readVarint(bytes, p);
      if (!v) return out;
      p = v[1];
    } else if (wire === 1) p += 8;
    else if (wire === 5) p += 4;
    else if (wire === 2) {
      const len = readVarint(bytes, p);
      if (!len || len[1] + len[0] > bytes.length) return out;
      const sub = bytes.subarray(len[1], len[1] + len[0]);
      p = len[1] + len[0];
      const json = tryJson(sub);
      if (json !== undefined) out.push(json);
      else if (sub.length > 1) jsonInProtobuf(sub, depth + 1, out);
    } else return out;
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** JSON documents carried by one gateway frame (empty for keepalives and unknown frames). */
export function decodeGatewayFrame(frame: Uint8Array): unknown[] {
  const start = frame.indexOf(0x7b);
  if (start < 0 || start > 32) return [];
  let outer: { payload?: unknown };
  try {
    outer = JSON.parse(new TextDecoder().decode(frame.subarray(start)));
  } catch {
    return [];
  }
  if (typeof outer?.payload !== 'string') return [outer];
  const trimmed = outer.payload.trimStart();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return [JSON.parse(trimmed)];
    } catch {
      return [];
    }
  }
  const bytes = base64ToBytes(outer.payload);
  return bytes ? jsonInProtobuf(bytes) : [];
}

const MEDIA_URL_RE = /^https:\/\/[^/]*(fbcdn\.net|cdninstagram\.com|fbsbx\.com)\//;

function mediaUrls(content: unknown): string[] {
  const found: string[] = [];
  const stack = [content];
  while (stack.length && found.length < 6) {
    const v = stack.pop();
    if (typeof v === 'string') {
      if (MEDIA_URL_RE.test(v) && !found.includes(v)) found.push(v);
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!/profile_pic/i.test(k)) stack.push(x);
    }
  }
  return found;
}

function toMessage(m: Record<string, any>): DmMessage | null {
  const id = m.message_id ?? m.id;
  const thread = m.thread_fbid;
  const sender = m.sender ?? {};
  const senderId = sender.igid ?? sender.user_dict?.id ?? m.sender_fbid;
  if (typeof id !== 'string' || thread == null || senderId == null) return null;
  const text = m.text_body ?? m.content?.text_body ?? undefined;
  return {
    id,
    thread: String(thread),
    senderId: String(senderId),
    username: sender.user_dict?.username ?? undefined,
    name: sender.name ?? sender.user_dict?.full_name ?? undefined,
    text: typeof text === 'string' && text ? text : undefined,
    kind: String(m.content_type ?? m.content?.__typename ?? 'UNKNOWN'),
    media: mediaUrls(m.content),
    ts: Number(m.timestamp_ms) || Date.now(),
  };
}

/** New messages and unsends found anywhere in a decoded document. */
export function collectDmEvents(root: unknown): DmEvent[] {
  const events: DmEvent[] = [];
  const stack: unknown[] = [root];
  let budget = 50000;
  while (stack.length && budget-- > 0) {
    const v = stack.pop();
    if (!v || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (const x of v) stack.push(x);
      continue;
    }
    const o = v as Record<string, any>;
    if (o.__typename === 'SlideUQPPDeleteMessage' && typeof o.message_id === 'string') {
      events.push({ type: 'unsend', thread: String(o.thread_fbid ?? ''), id: o.message_id });
      continue;
    }
    if (typeof o.message_id === 'string' && o.thread_fbid != null && (o.sender || o.sender_fbid) && 'timestamp_ms' in o) {
      const msg = toMessage(o);
      if (msg) events.push({ type: 'message', message: msg });
      continue; // nested replied_to_message is a copy of an older message, not a new one
    }
    for (const k in o) {
      const x = o[k];
      if (x && typeof x === 'object') stack.push(x);
    }
  }
  return events;
}
