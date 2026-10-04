// Generates public/icons/{16,32,48,128}.png — gradient tile with a camera glyph.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const stops = [[0, [254, 218, 117]], [0.3, [250, 126, 30]], [0.55, [214, 41, 118]], [0.8, [150, 47, 191]], [1, [79, 91, 213]]];
function grad(t) {
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, a] = stops[i - 1], [t1, b] = stops[i];
      const k = (t - t0) / (t1 - t0);
      return a.map((v, j) => v + (b[j] - v) * k);
    }
  }
  return stops.at(-1)[1];
}
// signed distance to rounded square centered at .5 with half-size h and radius r
function sdRoundRect(x, y, h, r) {
  const qx = Math.abs(x - 0.5) - h + r, qy = Math.abs(y - 0.5) - h + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}
function sample(x, y) {
  if (sdRoundRect(x, y, 0.5, 0.23) > 0) return null;
  const t = Math.min(1, Math.max(0, (1 - y) * 0.75 + x * 0.25));
  // download arrow + tray
  const shaft = Math.abs(x - 0.5) < 0.055 && y > 0.2 && y < 0.56;
  const head = y >= 0.4 && y <= 0.64 && Math.abs(x - 0.5) < (0.64 - y) * 0.95;
  const tray = (y > 0.7 && y < 0.79 && x > 0.24 && x < 0.76) || (Math.abs(x - 0.285) < 0.045 && y > 0.58 && y < 0.79) || (Math.abs(x - 0.715) < 0.045 && y > 0.58 && y < 0.79);
  return shaft || head || tray ? [255, 255, 255] : grad(1 - t);
}
mkdirSync('public/icons', { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (py * size + px) * 4;
    if (a) { buf[i] = r / a; buf[i + 1] = g / a; buf[i + 2] = b / a; buf[i + 3] = (a / (ss * ss)) * 255; }
  }
  writeFileSync(`public/icons/${size}.png`, png(size, buf));
}
console.log('icons written');
