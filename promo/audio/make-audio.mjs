// Procedural soundtrack for the promo: a 120 BPM electronic bed plus UI sound effects, all synthesized here
// (no samples, no licensing questions) and timed from src/timeline.js. Writes a 48 kHz stereo WAV.
//
//   node audio/make-audio.mjs [out.wav]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { DURATION, BPM, CUES, CT } from '../src/timeline.js';

const SR = 48000;
const N = Math.ceil(DURATION * SR);
const TAU = Math.PI * 2;
const beat = 60 / BPM;
const bar = beat * 4;
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);

// deterministic noise
let seed = 0x9e3779b9;
const rnd = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) / 4294967296) * 2 - 1;
};

function bus() {
  return { L: new Float32Array(N), R: new Float32Array(N) };
}
const music = bus();
const drums = bus();
const sfx = bus();
const verbSend = bus();
const delaySend = bus();
const kickEnv = new Float32Array(N); // for sidechain ducking

const smooth = (x) => x * x * (3 - 2 * x);
/** Piecewise-linear automation over [[t, v], ...]. */
const auto = (keys) => (t) => {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [t0, v0] = keys[i - 1];
    const [t1, v1] = keys[i];
    return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
  }
  return keys[keys.length - 1][1];
};

/** Topology-preserving state-variable filter (Simper); stable at any cutoff. Returns a per-sample processor. */
function svf() {
  let ic1 = 0, ic2 = 0;
  const out = { lp: 0, bp: 0, hp: 0 };
  return (x, fc, q = 0.7) => {
    const g = Math.tan((Math.PI * Math.min(fc, SR * 0.45)) / SR);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k));
    const a2 = g * a1;
    const a3 = g * a2;
    const v3 = x - ic2;
    const v1 = a1 * ic1 + a2 * v3;
    const v2 = ic2 + a2 * ic1 + a3 * v3;
    ic1 = 2 * v1 - ic1;
    ic2 = 2 * v2 - ic2;
    out.lp = v2;
    out.bp = v1;
    out.hp = x - k * v1 - v2;
    return out;
  };
}

function put(b, i, l, r = l) {
  if (i >= 0 && i < N) {
    b.L[i] += l;
    b.R[i] += r;
  }
}

// ---------------- harmony ----------------
// vi – IV – I – V in C major, one chord per bar
const CHORDS = [
  { root: 45, tones: [57, 60, 64, 67, 71] }, // Am9
  { root: 41, tones: [53, 57, 60, 64, 67] }, // Fmaj9
  { root: 36, tones: [55, 60, 64, 67, 71] }, // Cmaj7
  { root: 43, tones: [55, 59, 62, 64, 69] }, // G6/9
];
const chordAt = (t) => CHORDS[Math.floor(t / bar) % 4];

// section automation
const padGain = auto([[0, 0], [0.6, 0.5], [5.5, 0.55], [6.0, 0.42], [61.5, 0.42], [62, 0.55], [66.5, 0.6], [CT.brand, 0.75], [DURATION - 1.4, 0.6], [DURATION, 0]]);
const padCut = auto([[0, 380], [5.8, 1600], [6.05, 2600], [55.5, 2600], [56, 1400], [60, 3000], [61.5, 2400], [66.5, 1100], [CT.brand - 0.05, 2200], [CT.brand + 0.1, 4200], [DURATION, 1800]]);
const drumGain = auto([[0, 0], [5.98, 0], [6.0, 1], [61.2, 1], [61.6, 0], [DURATION, 0]]);
const hatGain = auto([[0, 0], [7.9, 0], [8.0, 0.8], [61.2, 0.8], [61.6, 0], [CT.brand, 0], [CT.brand + 0.1, 0]]);
const clapOn = (t) => t >= 11 && t < 61.5;
const bassGain = auto([[0, 0], [5.99, 0], [6.0, 0.9], [61.4, 0.9], [62, 0.5], [66.4, 0.5], [66.6, 0], [CT.brand, 0], [CT.brand + 0.02, 0.8], [DURATION - 1.5, 0.4], [DURATION, 0]]);
const arpGain = auto([[0, 0], [10.9, 0], [11.1, 0.5], [61.5, 0.5], [62, 0.38], [66.4, 0.38], [66.8, 0.22], [CT.brand, 0.22], [CT.brand + 0.2, 0.4], [DURATION - 1, 0.25], [DURATION, 0]]);

// ---------------- pad ----------------
{
  const voices = [];
  for (let v = 0; v < 5; v++) for (const det of [-0.11, 0, 0.12]) voices.push({ v, det, ph: Math.random() * 0, pan: det < 0 ? 0.25 : det > 0 ? 0.75 : 0.5 });
  const fL = svf(), fR = svf();
  let prevChord = null, chordStart = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const ch = chordAt(t);
    if (ch !== prevChord) {
      prevChord = ch;
      chordStart = t;
    }
    let l = 0, r = 0;
    for (const vo of voices) {
      const f = mtof(ch.tones[vo.v]) * 2 ** (vo.det / 12);
      vo.ph = (vo.ph + f / SR) % 1;
      const saw = 2 * vo.ph - 1;
      l += saw * (1 - vo.pan);
      r += saw * vo.pan;
    }
    // soft re-attack per chord
    const env = 0.75 + 0.25 * Math.min(1, (t - chordStart) / 0.25);
    const cut = padCut(t) * (1 + 0.15 * Math.sin(TAU * 0.11 * t));
    const g = (padGain(t) * env) / voices.length;
    const yl = fL(l * g, cut, 0.9).lp;
    const yr = fR(r * g, cut, 0.9).lp;
    put(music, i, yl, yr);
    put(verbSend, i, yl * 0.5, yr * 0.5);
  }
}

// ---------------- drums ----------------
function kick(t0, amp = 1) {
  const i0 = Math.round(t0 * SR);
  let ph = 0;
  for (let k = 0; k < SR * 0.5; k++) {
    const t = k / SR;
    const f = 44 + 110 * Math.exp(-t * 32);
    ph += f / SR;
    const e = Math.exp(-t * 7.5) * amp;
    const click = k < 120 ? rnd() * 0.25 * (1 - k / 120) : 0;
    const s = Math.tanh(Math.sin(TAU * ph) * 1.6) * e * 0.9 + click * amp;
    put(drums, i0 + k, s);
    if (i0 + k < N) kickEnv[i0 + k] = Math.max(kickEnv[i0 + k], Math.exp(-t * 9) * amp);
  }
}
function hat(t0, amp, open = false) {
  const i0 = Math.round(t0 * SR);
  const f = svf();
  const len = SR * (open ? 0.22 : 0.06);
  for (let k = 0; k < len; k++) {
    const t = k / SR;
    const y = f(rnd(), 9000, 0.6).hp * Math.exp(-t * (open ? 18 : 70)) * amp;
    put(drums, i0 + k, y * 0.85, y);
  }
}
function clap(t0, amp) {
  const i0 = Math.round(t0 * SR);
  const f = svf();
  for (let k = 0; k < SR * 0.35; k++) {
    const t = k / SR;
    const bursts = Math.max(Math.exp(-Math.max(0, t) * 120) * (t < 0.01 ? 1 : 0), t >= 0.012 ? Math.exp(-(t - 0.012) * 90) * (t < 0.024 ? 1 : 0) : 0, t >= 0.024 ? Math.exp(-(t - 0.024) * 16) : 0);
    const y = f(rnd(), 1500, 1.4).bp * bursts * amp;
    put(drums, i0 + k, y, y * 0.92);
    put(verbSend, i0 + k, y * 0.3);
  }
}
for (let t = 0; t < DURATION; t += beat / 4) {
  const step = Math.round(t / (beat / 4)) % 16;
  const dg = drumGain(t);
  if (dg > 0.01 && step % 4 === 0) kick(t, dg);
  const hg = hatGain(t);
  if (hg > 0.01) {
    if (step % 4 === 2) hat(t, 0.32 * hg, step === 14);
    else if (t > 19 && step % 2 === 1) hat(t, 0.1 * hg);
  }
  if (clapOn(t) && (step === 4 || step === 12)) clap(t, 0.55);
}
// impacts get a kick + sub
kick(6.0, 1.1);
kick(CT.brand, 1.2);

// ---------------- bass ----------------
{
  const f = svf();
  let ph = 0;
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    const g = bassGain(t);
    if (g < 0.001) continue;
    const ch = chordAt(t);
    // eighth-note pulse, octave jump on the "and" of 4
    const pos = (t % beat) / beat;
    const eighth = Math.floor(t / (beat / 2));
    const oct = eighth % 8 === 7 ? 12 : 0;
    const fr = mtof(ch.root + oct);
    ph = (ph + fr / SR) % 1;
    const raw = 0.6 * Math.sin(TAU * ph) + 0.4 * (2 * ph - 1);
    const local = (t % (beat / 2)) / (beat / 2);
    const env = t >= CT.brand ? Math.exp(-(t - CT.brand) * 0.6) : Math.exp(-local * 2.2) * 0.8 + 0.2;
    void pos;
    const duck = 1 - 0.75 * kickEnv[i];
    const y = f(raw, 420 + 500 * env, 1.1).lp * g * env * duck * 0.55;
    put(music, i, y);
  }
}

// ---------------- arp pluck (with stereo delay) ----------------
function pluck(t0, midi, amp, pan = 0.5) {
  const i0 = Math.round(t0 * SR);
  const fr = mtof(midi);
  for (let k = 0; k < SR * 0.6; k++) {
    const t = k / SR;
    const e = Math.exp(-t * 9) * (k < 96 ? k / 96 : 1);
    const s = (Math.sin(TAU * fr * t) + 0.35 * Math.sin(TAU * fr * 2 * t) * Math.exp(-t * 16) + 0.15 * Math.sin(TAU * fr * 3 * t) * Math.exp(-t * 26)) * e * amp;
    put(music, i0 + k, s * (1 - pan) * 1.4, s * pan * 1.4);
    put(delaySend, i0 + k, s * 0.5);
    put(verbSend, i0 + k, s * 0.25);
  }
}
{
  const pattern = [0, 2, 4, 2, 1, 3, 4, 3];
  for (let t = 0; t < DURATION; t += beat / 2) {
    const g = arpGain(t);
    if (g < 0.01) continue;
    const step = Math.round(t / (beat / 2));
    const ch = chordAt(t);
    pluck(t, ch.tones[pattern[step % 8]] + 12, 0.16 * g, step % 2 ? 0.35 : 0.65);
  }
  // final bell chord
  CHORDS[2].tones.forEach((m, j) => pluck(CT.brand + j * 0.06, m + 12, 0.14, 0.3 + j * 0.1));
}

// ---------------- risers & impacts ----------------
function riser(t0, t1, amp) {
  const f = svf();
  for (let i = Math.round(t0 * SR); i < Math.round(t1 * SR) && i < N; i++) {
    const p = (i / SR - t0) / (t1 - t0);
    const y = f(rnd(), 300 + 4200 * p * p, 2.5).bp * amp * p * p;
    const tone = Math.sin(TAU * (200 + 600 * p * p) * (i / SR)) * 0.15 * amp * p * p;
    put(music, i, y + tone * 0.6, y * 0.9 + tone * 0.6);
    put(verbSend, i, y * 0.5);
  }
}
function impact(t0, amp) {
  const i0 = Math.round(t0 * SR);
  const f = svf();
  let ph = 0;
  for (let k = 0; k < SR * 2.5; k++) {
    const t = k / SR;
    ph += (30 + 50 * Math.exp(-t * 6)) / SR;
    const sub = Math.sin(TAU * ph) * Math.exp(-t * 1.8) * 0.8;
    const nz = f(rnd(), 900 + 3000 * Math.exp(-t * 4), 0.8).lp * Math.exp(-t * 5) * 0.6;
    put(music, i0 + k, (sub + nz) * amp);
    put(verbSend, i0 + k, nz * amp * 0.8);
  }
}
riser(3.9, 6.0, 0.4);
riser(67.5, CT.brand, 0.32);

// intro pulse: a muted root note on every beat keeps the problem scene moving
{
  const f = svf();
  for (let t = 0.75; t < 5.9; t += beat) {
    const i0 = Math.round(t * SR);
    const fr = mtof(chordAt(t).root);
    for (let k = 0; k < SR * 0.4; k++) {
      const tt = k / SR;
      const s = f(Math.sin(TAU * fr * tt) + 0.5 * Math.sin(TAU * fr * 2 * tt), 260, 0.8).lp * Math.exp(-tt * 9) * 0.5 * Math.min(1, t / 2.5);
      put(music, i0 + k, s);
    }
  }
}

// ---------------- sound effects ----------------
function blip(i0, fr, dur, amp, decay = 60, sweep = 0) {
  for (let k = 0; k < SR * dur; k++) {
    const t = k / SR;
    const s = Math.sin(TAU * (fr * t + 0.5 * sweep * t * t)) * Math.exp(-t * decay) * Math.min(1, k / 24) * amp;
    put(sfx, i0 + k, s);
    put(verbSend, i0 + k, s * 0.15);
  }
}
function noiseSweep(i0, dur, f0, f1, amp, q = 1.2) {
  const f = svf();
  const len = SR * dur;
  for (let k = 0; k < len; k++) {
    const p = k / len;
    const env = Math.sin(Math.PI * p) ** 1.5;
    const y = f(rnd(), f0 + (f1 - f0) * p, q).bp * env * amp;
    put(sfx, i0 + k, y * (1 - p * 0.4), y * (0.6 + p * 0.4));
    put(verbSend, i0 + k, y * 0.3);
  }
}
const SFX = {
  click(i, v) {
    const f = svf();
    for (let k = 0; k < SR * 0.012; k++) put(sfx, i + k, f(rnd(), 3500, 1).bp * Math.exp(-k / (SR * 0.002)) * v * 0.9);
    blip(i, 1700, 0.03, v * 0.22, 140);
  },
  tick(i, v) {
    blip(i, 2600, 0.04, v * 0.3, 110);
  },
  toggle(i, v) {
    blip(i, 1250, 0.05, v * 0.28, 80);
    blip(i + SR * 0.045, 1870, 0.07, v * 0.24, 60);
  },
  success(i, v) {
    blip(i, mtof(88), 0.6, v * 0.22, 7);
    blip(i + SR * 0.09, mtof(95), 0.8, v * 0.2, 6);
  },
  pop(i, v) {
    blip(i, 420, 0.12, v * 0.5, 30, 6000);
  },
  swish(i, v) {
    noiseSweep(i, 0.32, 500, 3600, v * 0.5, 1.5);
  },
  whoosh(i, v) {
    noiseSweep(i - SR * 0.6, 0.8, 250, 3800, v * 0.55, 1.1);
  },
  shimmer(i, v) {
    [96, 100, 103].forEach((m, j) => blip(i + j * SR * 0.05, mtof(m), 0.7, v * 0.08, 5));
  },
  impact(i, v) {
    impact(i / SR, v * 0.9);
  },
};
for (const c of CUES) SFX[c.sfx](Math.round(c.t * SR), c.v);

// ---------------- effects: stereo delay + reverb ----------------
{
  const dL = Math.round(beat * 0.75 * SR);
  const dR = Math.round(beat * 0.5 * SR);
  const L = delaySend.L, R = delaySend.R;
  const fb = 0.38;
  const outL = new Float32Array(N), outR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    outL[i] = L[i] + (i >= dL ? outR[i - dL] * fb : 0);
    outR[i] = R[i] + (i >= dR ? outL[i - dR] * fb : 0);
    music.L[i] += (i >= dL ? outL[i - dL] : 0) * 0.5;
    music.R[i] += (i >= dR ? outR[i - dR] : 0) * 0.5;
  }
}
function reverb(src) {
  // Schroeder/Freeverb-style: parallel damped combs into series allpasses, per channel.
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((n) => Math.round((n * SR) / 44100));
  const aps = [556, 441, 341, 225].map((n) => Math.round((n * SR) / 44100));
  const run = (x, spread) => {
    const out = new Float32Array(N);
    for (const c of combs) {
      const len = c + spread;
      const buf = new Float32Array(len);
      let idx = 0, filt = 0;
      for (let i = 0; i < N; i++) {
        const y = buf[idx];
        filt = y * 0.75 + filt * 0.25;
        buf[idx] = x[i] * 0.015 + filt * 0.86;
        out[i] += y;
        idx = (idx + 1) % len;
      }
    }
    for (const a of aps) {
      const len = a + spread;
      const buf = new Float32Array(len);
      let idx = 0;
      for (let i = 0; i < N; i++) {
        const b = buf[idx];
        const y = -out[i] + b;
        buf[idx] = out[i] + b * 0.5;
        out[i] = y;
        idx = (idx + 1) % len;
      }
    }
    return out;
  };
  return { L: run(src.L, 0), R: run(src.R, 23) };
}
const verb = reverb(verbSend);

// ---------------- mix & master ----------------
const outL = new Float32Array(N);
const outR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  const fadeIn = Math.min(1, t / 0.4);
  const fadeOut = Math.min(1, (DURATION - t) / 1.2);
  const l = music.L[i] * 0.9 + drums.L[i] * 0.75 + sfx.L[i] * 0.9 + verb.L[i] * 0.55;
  const r = music.R[i] * 0.9 + drums.R[i] * 0.75 + sfx.R[i] * 0.9 + verb.R[i] * 0.55;
  outL[i] = l * fadeIn * fadeOut;
  outR[i] = r * fadeIn * fadeOut;
}
{
  const a = 1 - Math.exp((-TAU * 13000) / SR);
  let yl = 0, yr = 0;
  for (let i = 0; i < N; i++) {
    yl += a * (outL[i] - yl);
    yr += a * (outR[i] - yr);
    outL[i] = yl;
    outR[i] = yr;
  }
}
let peak = 0;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(outL[i]), Math.abs(outR[i]));
const gain = 0.95 / Math.max(peak, 1e-6);

export function makeAudio(file) {
  const data = Buffer.alloc(44 + N * 4);
  data.write('RIFF', 0);
  data.writeUInt32LE(36 + N * 4, 4);
  data.write('WAVEfmt ', 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(2, 22);
  data.writeUInt32LE(SR, 24);
  data.writeUInt32LE(SR * 4, 28);
  data.writeUInt16LE(4, 32);
  data.writeUInt16LE(16, 34);
  data.write('data', 36);
  data.writeUInt32LE(N * 4, 40);
  // gentle saturation keeps transients from spiking after the gain stage
  const sat = (x) => Math.tanh(x * 1.2) / Math.tanh(1.2);
  for (let i = 0; i < N; i++) {
    data.writeInt16LE(Math.round(sat(outL[i] * gain) * 32000), 44 + i * 4);
    data.writeInt16LE(Math.round(sat(outR[i] * gain) * 32000), 46 + i * 4);
  }
  writeFileSync(file, data);
  return file;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = resolve(process.argv[2] ?? 'out/audio.wav');
  makeAudio(out);
  console.log(`Wrote ${out} (${DURATION}s, ${SR} Hz stereo)`);
}
