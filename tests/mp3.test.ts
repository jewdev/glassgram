import { describe, expect, it } from 'vitest';
import { encodeMp3, isSilent, MP3_RATE, toInt16 } from '../src/offscreen/mp3';

const tone = (seconds: number, hz = 440) =>
  Float32Array.from({ length: Math.round(seconds * MP3_RATE) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / MP3_RATE));

describe('toInt16', () => {
  it('scales to 16-bit and clips out-of-range samples', () => {
    expect([...toInt16(Float32Array.from([0, 1, -1, 2, -2, 0.5]))]).toEqual([0, 32767, -32768, 32767, -32768, 16383]);
  });
});

describe('isSilent', () => {
  it('tells an empty track from one with sound', () => {
    expect(isSilent([new Float32Array(1000)])).toBe(true);
    expect(isSilent([new Float32Array(1000), tone(0.1)])).toBe(false);
  });
});

describe('encodeMp3', () => {
  it('writes MP3 frames for stereo and mono', async () => {
    for (const channels of [[tone(2), tone(2, 660)], [tone(2)]]) {
      const blob = await encodeMp3(channels, MP3_RATE);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      expect(blob.type).toBe('audio/mpeg');
      // Frame sync: 11 set bits. 2 s at 192 kbps is about 48 KB.
      expect(bytes[0]).toBe(0xff);
      expect(bytes[1] & 0xe0).toBe(0xe0);
      expect(bytes.length).toBeGreaterThan(40_000);
      expect(bytes.length).toBeLessThan(60_000);
    }
  });

  it('stops when cancelled', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(encodeMp3([tone(1)], MP3_RATE, abort.signal)).rejects.toThrow();
  });
});
