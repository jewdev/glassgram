import { describe, expect, it } from 'vitest';
import { collectDmEvents, decodeGatewayFrame, jsonInProtobuf } from '../src/shared/slide';

function varint(n: number): number[] {
  const out: number[] = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}
const bytesField = (field: number, data: Uint8Array | number[]) => [...varint((field << 3) | 2), ...varint(data.length), ...data];
const intField = (field: number, v: number) => [...varint(field << 3), ...varint(v)];
const enc = (s: string) => [...new TextEncoder().encode(s)];

/** Same nesting Instagram uses: 1:b 2:{3:{1:v 2:<json> 3:v}} 3:{...}. */
function frameFor(doc: unknown): Uint8Array {
  const inner = [...intField(1, 223), ...bytesField(2, enc(JSON.stringify(doc))), ...intField(3, 312227)];
  const pb = [...bytesField(1, [6, 0]), ...bytesField(2, bytesField(3, inner)), ...bytesField(3, [...intField(1, 1), ...bytesField(4, enc('{"seq_id":1}'))])];
  const b64 = btoa(String.fromCharCode(...pb));
  return new Uint8Array([0x0d, 0, 0, 0xbb, 0x0a, 0, 1, 0x80, ...enc(JSON.stringify({ request_id: null, payload: b64 }))]);
}

const newMessage = {
  data: {
    slide_delta_processor: [
      {
        __typename: 'SlideUQPPNewMessage',
        message: {
          thread_fbid: '111',
          message_id: 'mid.abc',
          sender_fbid: '222',
          text_body: 'hello',
          timestamp_ms: '1759750000000',
          content_type: 'TEXT',
          content: { __typename: 'SlideMessageText', text_body: 'hello' },
          replied_to_message: { message_id: 'mid.old', thread_fbid: '111', sender_fbid: '9', timestamp_ms: '1' },
          sender: { name: 'Some One', id: '222', igid: '333', user_dict: { username: 'someone', profile_pic_url: 'https://scontent.cdninstagram.com/p.jpg' } },
        },
      },
    ],
  },
};
const unsend = { data: { slide_delta_processor: [{ __typename: 'SlideUQPPDeleteMessage', thread_fbid: '111', message_id: 'mid.abc' }] } };

describe('slide DM deltas', () => {
  it('finds JSON nested in protobuf', () => {
    const docs = jsonInProtobuf(new Uint8Array(bytesField(2, bytesField(3, bytesField(2, enc('[1,2]'))))));
    expect(docs).toEqual([[1, 2]]);
  });

  it('decodes a new message from a gateway frame', () => {
    const events = decodeGatewayFrame(frameFor([newMessage])).flatMap(collectDmEvents);
    expect(events).toEqual([
      {
        type: 'message',
        message: { id: 'mid.abc', thread: '111', senderId: '333', username: 'someone', name: 'Some One', text: 'hello', kind: 'TEXT', media: [], ts: 1759750000000 },
      },
    ]);
  });

  it('decodes an unsend', () => {
    expect(decodeGatewayFrame(frameFor([unsend])).flatMap(collectDmEvents)).toEqual([{ type: 'unsend', thread: '111', id: 'mid.abc' }]);
  });

  it('collects media URLs but not profile pictures', () => {
    const msg = structuredClone(newMessage);
    const m = msg.data.slide_delta_processor[0].message as Record<string, any>;
    m.content = { __typename: 'SlideMessageImage', image: { url: 'https://scontent.fbcdn.net/v/photo.jpg' } };
    m.content_type = 'IMAGE';
    const [e] = collectDmEvents(msg);
    expect(e.type === 'message' && e.message.media).toEqual(['https://scontent.fbcdn.net/v/photo.jpg']);
  });

  it('ignores keepalives and junk', () => {
    expect(decodeGatewayFrame(new Uint8Array([0x0a]))).toEqual([]);
    expect(decodeGatewayFrame(new Uint8Array([0x0d, 0, 0, 3, ...enc('{"payload":"!!!"}')]))).toEqual([]);
  });
});
