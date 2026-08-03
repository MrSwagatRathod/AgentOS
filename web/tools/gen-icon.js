#!/usr/bin/env node
/* Arrow Escape — generate app icons (pure Node: zlib + manual PNG encoding, no deps)
 * Usage: node tools/gen-icon.js   -> writes assets/icon-192.png & assets/icon-512.png
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- PNG encoding ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(size * (1 + size * 4));
  let o = 0;
  for (let y = 0; y < size; y++) {
    raw[o++] = 0;
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------- icon drawing ---------- */
function hex(c) { return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
/* minimalist: white background, black arrow, red heart accent */
const C_BG = hex('#ffffff');
const C_ARROW = hex('#141414');
const C_HEART = hex('#ff3b30');
const WHITE = hex('#ffffff');

/* signed distance helpers (negative inside) */
function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
}

function sdTriangle(px, py, a, b, c) {
  // 2D signed distance to triangle (sign by orientation)
  const e0 = [b[0] - a[0], b[1] - a[1]];
  const e1 = [c[0] - b[0], c[1] - b[1]];
  const e2 = [a[0] - c[0], a[1] - c[1]];
  const v0 = [px - a[0], py - a[1]];
  const v1 = [px - b[0], py - b[1]];
  const v2 = [px - c[0], py - c[1]];
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  const pa = [px - a[0], py - a[1]];
  const pb = [px - b[0], py - b[1]];
  const pc = [px - c[0], py - c[1]];
  const d = (p, e, v) => {
    const t = Math.max(0, Math.min(1, (p[0] * e[0] + p[1] * e[1]) / (e[0] * e[0] + e[1] * e[1])));
    return Math.hypot(p[0] - e[0] * t, p[1] - e[1] * t);
  };
  const s = Math.sign(cross(e0, e2));
  const dist = Math.min(
    d(v0, e0, v1), d(v1, e1, v2), d(v2, e2, v0)
  );
  return s * dist;
}

/* arrow pointing right, in unit space 0..1 (kept inside maskable safe zone) */
function arrowDist(px, py) {
  const tail = sdRoundRect(px, py, 0.36, 0.5, 0.18, 0.14, 0.06);
  const head = sdTriangle(
    px, py,
    [0.52, 0.30], [0.80, 0.5], [0.52, 0.70]
  );
  return Math.min(tail, head);
}

/* small heart in the top-right corner */
function heartDist(px, py) {
  /* heart centered at (0.78, 0.24), size ~0.16 */
  const u = (px - 0.78) / 0.09;
  const v = (0.24 - py) / 0.09;
  const val = Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v;
  return val; /* <= 0 is inside */
}

function renderIcon(size) {
  const rgba = new Uint8Array(size * size * 4);
  const SS = 3; // supersampling
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) / size;
          const uy = (y + (sy + 0.5) / SS) / size;
          // rounded-square mask (radius 22%)
          const r = sdRoundRect(ux, uy, 0.5, 0.5, 0.5, 0.5, 0.22);
          if (r > 0.004) continue;
          let coverage = 1;
          if (r > -0.004) coverage = 0.5 + (0.004 + r) / 0.008;
          acc += coverage;
        }
      }
      const a = acc / (SS * SS);
      const i = (y * size + x) * 4;
      if (a <= 0) { rgba[i + 3] = 0; continue; }
      const ux = (x + 0.5) / size;
      const uy = (y + 0.5) / size;
      const inArrow = arrowDist(ux, uy) <= 0;
      const inHeart = heartDist(ux, uy) <= 0;
      let col;
      if (inArrow) col = C_ARROW;
      else if (inHeart) col = C_HEART;
      else col = C_BG;
      rgba[i] = col[0];
      rgba[i + 1] = col[1];
      rgba[i + 2] = col[2];
      rgba[i + 3] = Math.round(255 * a);
    }
  }
  return rgba;
}

/* ---------- main ---------- */
const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [192, 512]) {
  const png = encodePNG(size, renderIcon(size));
  const file = path.join(outDir, `icon-${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`wrote ${file} (${png.length} bytes)`);
}
