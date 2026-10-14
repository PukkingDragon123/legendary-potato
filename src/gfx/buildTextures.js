// Hand-painted pixel textures for player-built structures: thatch, log, plank,
// stone, brick and scrap metal, plus prop textures (cloth, straw, soil, hide).
// 64 px tiles that map to 2 m (32 px / m) like the rest of the world.
import * as THREE from 'three';
import { PixelPainter, ramp, bayer } from './pixel.js';
import { tileFbm } from '../core/rng.js';

const cache = {};
const once = (k, f) => cache[k] ?? (cache[k] = f());

function thatch(seed = 61) {
  const p = new PixelPainter(64, 64, seed);
  const pal = ramp(0xc8a050, 6, { light: 0.2, hueShift: 0.12 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const row = Math.floor(y / 8);
    const sx = x + (row % 2) * 5;
    const strand = (sx * 7 + Math.floor(sx / 3) * 13) % 5;
    const v = (y % 8) / 8;
    let k = 2 + (strand > 2 ? 1 : 0) - (v > 0.8 ? 1 : 0) + (v < 0.15 ? 1 : 0);
    k += tileFbm(x / 64 * 4, y / 64 * 4, 4, 2, seed) > 0.6 ? 1 : 0;
    if ((sx + y * 3) % 11 === 0) k -= 1;
    p.set(x, y, pal[Math.max(0, Math.min(5, k))]);
  }
  // binding cords every 16 px
  for (let x = 0; x < 64; x++) for (const y of [15, 47]) { p.set(x, y, [110, 70, 40]); if (x % 4 === 0) p.set(x, y - 1, [150, 100, 55]); }
  return p;
}
function logs(seed = 62) {
  const p = new PixelPainter(64, 64, seed);
  const pal = ramp(0x8a5a34, 6, { light: 0.2 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const ly = y % 16, row = Math.floor(y / 16);
    const r = Math.abs(ly - 7.5) / 8; // round profile
    let k = r < 0.35 ? 4 : r < 0.6 ? 3 : r < 0.85 ? 2 : 1;
    if (ly === 0 || ly === 15) k = 0;
    const n = tileFbm(x / 64 * 2 + row, y / 64 * 16, 2, 2, seed + row);
    if (n > 0.66) k = Math.max(1, k - 1);
    if ((x * 5 + row * 7) % 23 === 0 && r < 0.7) k = 1; // knots
    p.set(x, y, pal[k]);
  }
  // log ends at the seams
  for (let row = 0; row < 4; row++) { const x0 = (row * 23) % 64; for (let ly = 2; ly < 14; ly++) p.set(x0, row * 16 + ly, pal[0]); }
  p.scatter(30, (x, y) => p.set(x, y, pal[5]));
  return p;
}
function planks(seed = 63, vertical = false) {
  const p = new PixelPainter(64, 64, seed);
  const pal = ramp(0xb08050, 6, { light: 0.18 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const a = vertical ? x : y, b = vertical ? y : x;
    const plank = Math.floor(a / 16), off = (plank * 29) % 64;
    const la = a % 16;
    const grain = tileFbm((b + off) / 64 * 2, la / 16 * 1.2 + plank, 2, 3, seed + plank);
    let k = 2 + Math.floor(grain * 2.4);
    if (la === 0) k = 0; else if (la === 1) k = 4; else if (la === 15) k = 1;
    if (((b + off) % 64) === 0 && la > 1 && la < 15) k = 0; // butt joint
    p.set(vertical ? x : y, vertical ? y : x, pal[Math.min(5, k)]);
  }
  // nails
  for (let pl = 0; pl < 4; pl++) for (const b of [6, 38]) { const a = pl * 16 + 4, bb = (b + pl * 29) % 64; const [x, y] = vertical ? [a, bb] : [bb, a]; p.set(x, y, [70, 66, 62]); p.set(x + 1, y, [190, 186, 180]); const [x2, y2] = vertical ? [a + 7, bb] : [bb, a + 7]; p.set(x2, y2, [70, 66, 62]); }
  return p;
}
function stone(seed = 64) {
  const p = new PixelPainter(64, 64, seed);
  const pal = ramp(0x9a968c, 6, { light: 0.2, hueShift: 0.1 });
  const mortar = [86, 80, 70];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const row = Math.floor(y / 12.8);
    const bw = 21.33, sx = x + (row % 2) * 10.66;
    const bx = Math.floor(sx / bw), lx = sx - bx * bw, ly = y - row * 12.8;
    const edge = Math.min(lx, bw - lx, ly, 12.8 - ly);
    const id = (bx * 7 + row * 13) % 5;
    const n = tileFbm(x / 64 * 6, y / 64 * 6, 6, 3, seed);
    let k = 2 + (id % 3 === 0 ? 1 : 0) + (n > 0.6 ? 1 : n < 0.35 ? -1 : 0);
    if (edge < 1.2) { p.set(x, y, mortar); continue; }
    if (edge < 2.2 && (ly < 2.2 || lx < 2.2)) k += 1; // top-left highlight
    if (edge < 2.2 && (ly > 10.6 || lx > bw - 2.2)) k -= 1;
    p.set(x, y, pal[Math.max(0, Math.min(5, k))]);
  }
  // moss creeping in the lower mortar
  p.scatter(70, (x, y) => { if (y > 40 && bayer(x, y) > 0.5) p.set(x, y, [78, 112, 52]); });
  return p;
}
function brick(seed = 65) {
  const p = new PixelPainter(64, 64, seed);
  const pal = ramp(0xb0583a, 6, { light: 0.18 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const row = Math.floor(y / 8), sx = x + (row % 2) * 8, bx = Math.floor(sx / 16);
    const lx = sx % 16, ly = y % 8;
    if (ly === 7 || lx === 15) { p.set(x, y, [150, 136, 118]); continue; }
    let k = 2 + ((bx * 5 + row * 3) % 3 === 0 ? 1 : 0) + (tileFbm(x / 64 * 8, y / 64 * 8, 8, 2, seed) > 0.62 ? -1 : 0);
    if (ly === 0) k += 1;
    p.set(x, y, pal[Math.max(0, Math.min(5, k))]);
  }
  return p;
}
function metal(seed = 66) {
  const p = new PixelPainter(64, 64, seed);
  const pal = ramp(0x8a9096, 6, { light: 0.22 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
    const c = Math.sin((x / 64) * Math.PI * 16); // corrugation
    let k = c > 0.6 ? 4 : c > 0 ? 3 : c > -0.6 ? 2 : 1;
    const panel = Math.floor(y / 32);
    if (y % 32 === 0) k = 0;
    if (tileFbm(x / 64 * 3 + panel, y / 64 * 3, 3, 3, seed) > 0.68) k = Math.max(0, k - 1);
    p.set(x, y, pal[k]);
  }
  // rust patches + rivets
  const rust = ramp(0x9a5030, 4, { light: 0.15 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const n = tileFbm(x / 64 * 5, y / 64 * 5, 5, 3, seed + 3); if (n > 0.7) p.set(x, y, rust[Math.min(3, Math.floor((n - 0.7) * 12 + bayer(x, y)))]); }
  for (let x = 2; x < 64; x += 8) for (const y of [2, 30, 34, 62]) { p.set(x, y, [210, 214, 220]); p.set(x + 1, y + 1, [60, 62, 66]); }
  return p;
}
function cloth(base, seed, stripes = false) {
  const p = new PixelPainter(32, 32, seed);
  const pal = ramp(base, 4, { light: 0.14 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    let k = ((x + y) % 2) + 1;
    if (stripes && Math.floor(y / 4) % 2) k = Math.max(0, k - 1);
    if ((x * 3 + y * 7) % 13 === 0) k = 3;
    p.set(x, y, pal[k]);
  }
  return p;
}
function straw(seed = 67) {
  const p = new PixelPainter(32, 32, seed);
  const pal = ramp(0xd8b860, 5, { light: 0.2 });
  p.fill(pal[1]);
  for (let i = 0; i < 90; i++) { let x = p.rng.next() * 32, y = p.rng.next() * 32; const a = p.rng.next() * Math.PI, len = 3 + p.rng.next() * 6, c = pal[2 + Math.floor(p.rng.next() * 3)]; for (let k = 0; k < len; k++) { p.set(x, y, c); x += Math.cos(a); y += Math.sin(a); } }
  return p;
}
function soil(seed = 68) {
  const p = new PixelPainter(32, 32, seed);
  const pal = ramp(0x5a3e28, 5, { light: 0.16 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const furrow = Math.abs(Math.sin((y / 32) * Math.PI * 4));
    const n = tileFbm(x / 32 * 4, y / 32 * 4, 4, 2, seed);
    p.set(x, y, pal[Math.min(4, Math.floor(furrow * 2.2 + n * 1.6))]);
  }
  p.scatter(14, (x, y) => p.set(x, y, [150, 140, 120]));
  return p;
}
function hide(seed = 69) {
  const p = new PixelPainter(32, 32, seed);
  const pal = ramp(0x9a7048, 5, { light: 0.16 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const n = tileFbm(x / 32 * 3, y / 32 * 3, 3, 3, seed); p.set(x, y, pal[1 + Math.floor(n * 3)]); }
  for (let x = 0; x < 32; x += 3) { p.set(x, 0, [70, 46, 28]); p.set(x, 31, [70, 46, 28]); }
  return p;
}
function patchwork(seed = 70) {
  const p = new PixelPainter(32, 32, seed);
  const cols = [[200, 80, 60], [70, 120, 170], [220, 180, 80], [100, 150, 90], [180, 110, 160], [230, 220, 200]];
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const c = cols[(Math.floor(x / 8) * 3 + Math.floor(y / 8) * 5) % cols.length];
    const seam = x % 8 === 0 || y % 8 === 0;
    p.set(x, y, seam ? [80, 60, 50] : c.map((v) => v * ((x + y) % 2 ? 0.92 : 1)));
  }
  for (let y = 2; y < 32; y += 8) for (let x = 0; x < 32; x += 2) p.set(x, y, [240, 236, 220]);
  return p;
}

function bark(seed = 74) {
  const p = new PixelPainter(32, 64, seed);
  const pal = ramp(0x7a5034, 5, { light: 0.18 });
  for (let y = 0; y < 64; y++) for (let x = 0; x < 32; x++) {
    const n = tileFbm(x / 32 * 6, y / 64 * 1.5, 6, 2, seed);
    let k = 1 + Math.floor(n * 3);
    if ((x + Math.floor(y / 9)) % 6 === 0) k = 0;
    p.set(x, y, pal[Math.min(4, k)]);
  }
  return p;
}
function endgrain(seed = 75) {
  const p = new PixelPainter(32, 32, seed);
  const pal = ramp(0xc8a070, 4, { light: 0.16 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const d = Math.hypot(x - 15.5, y - 15.5); p.set(x, y, d > 14 ? [90, 60, 36] : pal[Math.floor(d / 2.2) % 2 ? 2 : 1]); }
  return p;
}

export const BTEX = {
  bark: () => once('bark', () => bark().texture()),
  endgrain: () => once('endgrain', () => endgrain().texture()),
  thatch: () => once('thatch', () => thatch().texture()),
  logs: () => once('logs', () => logs().texture()),
  plank: () => once('plank', () => planks().texture()),
  plankV: () => once('plankV', () => planks(71, true).texture()),
  stone: () => once('stone', () => stone().texture()),
  brick: () => once('brick', () => brick().texture()),
  metal: () => once('metal', () => metal().texture()),
  canvas: () => once('canvas', () => cloth(0xd8ccaa, 72).texture()),
  red: () => once('redcloth', () => cloth(0xc84a3a, 73, true).texture()),
  straw: () => once('straw', () => straw().texture()),
  soil: () => once('soil', () => soil().texture()),
  hide: () => once('hide', () => hide().texture()),
  patch: () => once('patch', () => patchwork().texture()),
};
export function bTex(key) { const t = BTEX[key](); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
