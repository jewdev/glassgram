import { describe, expect, it } from 'vitest';
import { filterLightspeedRequest, filterMqttFrame, mqttPubAck } from '../src/shared/lightspeed';

const typing = JSON.stringify({ request_id: 1, type: 4, payload: JSON.stringify({ label: '3', payload: JSON.stringify({ thread_key: 1, is_typing: 1 }), version: '1' }) });
const tasks = (...labels: string[]) =>
  JSON.stringify({ request_id: 2, type: 3, payload: JSON.stringify({ epoch_id: 9, tasks: labels.map((label, i) => ({ label, payload: '{}', queue_name: String(i), task_id: i })) }) });

const ON = { typing: true, seen: true };

describe('filterLightspeedRequest', () => {
  it('drops typing indicators', () => {
    expect(filterLightspeedRequest(typing, ON)).toBeNull();
    expect(filterLightspeedRequest(typing, { typing: false, seen: true })).toBe(typing);
  });

  it('drops a request that only marks a thread read', () => {
    expect(filterLightspeedRequest(tasks('21'), ON)).toBeNull();
  });

  it('keeps other tasks in a batch and removes only the read task', () => {
    const out = filterLightspeedRequest(tasks('46', '21'), ON)!;
    const inner = JSON.parse(JSON.parse(out).payload);
    expect(inner.tasks.map((t: { label: string }) => t.label)).toEqual(['46']);
    expect(inner.epoch_id).toBe(9);
  });

  it('leaves unrelated requests untouched', () => {
    const send = tasks('46');
    expect(filterLightspeedRequest(send, ON)).toBe(send);
    expect(filterLightspeedRequest('not json', ON)).toBe('not json');
    expect(filterLightspeedRequest(tasks('21'), { typing: true, seen: false })).toBe(tasks('21'));
  });
});

function publish(topic: string, payload: string, qos = 1): Uint8Array {
  const t = new TextEncoder().encode(topic);
  const p = new TextEncoder().encode(payload);
  const body = [t.length >> 8, t.length & 0xff, ...t, ...(qos ? [0, 7] : []), ...p];
  const len: number[] = [];
  let n = body.length;
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n) b |= 0x80;
    len.push(b);
  } while (n);
  return new Uint8Array([0x30 | (qos << 1), ...len, ...body]);
}

describe('filterMqttFrame', () => {
  it('drops a typing PUBLISH on /ls_req', () => {
    expect(filterMqttFrame(publish('/ls_req', typing), ON)).toBeNull();
  });

  it('rewrites a mixed batch and keeps a valid packet', () => {
    const out = filterMqttFrame(publish('/ls_req', tasks('46', '21')), ON)!;
    const expected = publish('/ls_req', filterLightspeedRequest(tasks('46', '21'), ON)!);
    expect([...out]).toEqual([...expected]);
  });

  it('ignores other topics and packet types', () => {
    const other = publish('/t_fs', typing);
    expect(filterMqttFrame(other, ON)).toBe(other);
    const ping = new Uint8Array([0xc0, 0]);
    expect(filterMqttFrame(ping, ON)).toBe(ping);
  });

  it('rewrites QoS 0 frames without a packet id', () => {
    const out = filterMqttFrame(publish('/ls_req', tasks('46', '21'), 0), ON)!;
    expect([...out]).toEqual([...publish('/ls_req', filterLightspeedRequest(tasks('46', '21'), ON)!, 0)]);
  });

  it('re-encodes a multi-byte remaining length', () => {
    const big = tasks('46', '21', ...Array.from({ length: 6 }, () => '46'));
    const frame = publish('/ls_req', big);
    expect(frame[1] & 0x80).toBeTruthy(); // multi-byte remaining length
    const out = filterMqttFrame(frame, ON)!;
    expect([...out]).toEqual([...publish('/ls_req', filterLightspeedRequest(big, ON)!)]);
  });

  it('never drops a QoS 2 publish', () => {
    const frame = publish('/ls_req', typing, 2);
    expect(filterMqttFrame(frame, ON)).toBe(frame);
  });
});

describe('mqttPubAck', () => {
  it('acknowledges a QoS 1 publish with its packet id', () => {
    expect([...mqttPubAck(publish('/ls_req', typing))!]).toEqual([0x40, 2, 0, 7]);
  });

  it('ignores QoS 0 publishes and other packets', () => {
    expect(mqttPubAck(publish('/ls_req', typing, 0))).toBeNull();
    expect(mqttPubAck(new Uint8Array([0xc0, 0]))).toBeNull();
  });
});
