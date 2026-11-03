import { Mp3Encoder } from '@breezystack/lamejs';

/** MP3 output: 44.1 kHz at 192 kbps, about 1.4 MB a minute. */
export const MP3_RATE = 44100;
export const MP3_KBPS = 192;
/** Samples per MP3 frame; the encoder is fed whole frames. */
const FRAME = 1152;
/** Frames encoded between two yields, so a cancel or another job's message gets through. */
const FRAMES_PER_SLICE = 200;
/** Peaks below this are treated as silence: some videos carry a sound track with nothing in it. */
const SILENCE = 1e-4;

export class NoSoundError extends Error {
  constructor() {
    super('This video has no sound');
  }
}

/** Float samples (-1 to 1) to 16-bit PCM, clipped. */
export function toInt16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function isSilent(channels: Float32Array[]): boolean {
  for (const c of channels) for (let i = 0; i < c.length; i++) if (Math.abs(c[i]) > SILENCE) return false;
  return true;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Encodes one or two channels of float PCM. Rejects with an AbortError once `signal` aborts. */
export async function encodeMp3(channels: Float32Array[], sampleRate: number, signal?: AbortSignal, kbps = MP3_KBPS): Promise<Blob> {
  if (!channels.length) throw new NoSoundError();
  const pcm = channels.slice(0, 2).map(toInt16);
  const encoder = new Mp3Encoder(pcm.length, sampleRate, kbps);
  const parts: Uint8Array[] = [];
  const step = FRAME * FRAMES_PER_SLICE;
  for (let at = 0; at < pcm[0].length; at += step) {
    signal?.throwIfAborted();
    const left = pcm[0].subarray(at, at + step);
    const right = pcm[1]?.subarray(at, at + step);
    const out = right ? encoder.encodeBuffer(left, right) : encoder.encodeBuffer(left);
    if (out.length) parts.push(out.slice());
    await tick();
  }
  const end = encoder.flush();
  if (end.length) parts.push(end.slice());
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' });
}

/** Fetches a video, decodes its sound track and returns it as an MP3 blob URL. */
export async function videoToMp3(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', signal });
  if (!res.ok) throw new Error(`Could not fetch the video (${res.status})`);
  const data = await res.arrayBuffer();
  // decodeAudioData resamples to the context's rate and keeps the track's channels.
  let audio: AudioBuffer;
  try {
    audio = await new OfflineAudioContext(1, 1, MP3_RATE).decodeAudioData(data);
  } catch {
    throw new NoSoundError(); // no sound track in the file
  }
  const channels = Array.from({ length: Math.min(2, audio.numberOfChannels) }, (_, i) => audio.getChannelData(i));
  if (isSilent(channels)) throw new NoSoundError();
  return URL.createObjectURL(await encodeMp3(channels, audio.sampleRate, signal));
}
