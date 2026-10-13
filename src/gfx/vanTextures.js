// Pixel-art materials for the Chrono-Van: worn two-tone paint, rust, cracked
// glass, 70s carpet, wood panelling, plaid upholstery, stickers, plates, PCBs,
// tyres and dashboard bits. Text is rendered with the pixel UI font.
import * as THREE from 'three';
import { PixelPainter, ramp, bayer } from './pixel.js';
import { tileFbm } from '../core/rng.js';

const cache = {};
const once = (k, f) => cache[k] ?? (cache[k] = f());

export function paintWear(base, seed = 1) {
  // tiling paint with scratches, chips, dirt streaks and faded patches (128px = 2 m)
  const p = new PixelPainter(128, 128, seed);
  const pal = ramp(base, 5, { light: 0.12, hueShift: 0.08 });
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const n = tileFbm(x / 128 * 4, y / 128 * 4, 4, 3, seed);
    let k = n > 0.66 ? 3 : n < 0.34 ? 1 : 2;
    if ((x + y * 3) % 7 === 0 && n > 0.5) k = Math.min(4, k + 1);
    p.set(x, y, pal[k]);
  }
  // scratches
  for (let i = 0; i < 18; i++) {
    let x = p.rng.next() * 128, y = p.rng.next() * 128;
    const a = (p.rng.next() - 0.5) * 0.6, len = 6 + p.rng.next() * 22;
    for (let k = 0; k < len; k++) { p.set(x, y, pal[4]); if (k % 3 === 0) p.set(x, y + 1, pal[0]); x += Math.cos(a); y += Math.sin(a); }
  }
  // paint chips showing primer/metal
  for (let i = 0; i < 10; i++) { const x = p.rng.next() * 128, y = p.rng.next() * 128; const r = 1 + p.rng.next() * 2; p.disc(x, y, r, [150, 150, 150]); p.set(x - 1, y - 1, [200, 200, 200]); }
  // dirt streaks running down
  for (let i = 0; i < 12; i++) { const x = Math.floor(p.rng.next() * 128); const y0 = Math.floor(p.rng.next() * 128); for (let k = 0; k < 30; k++) p.mul(x, y0 + k, 0.9); }
  return p;
}

export const VAN_TEX = {
  cream: () => once('cream', () => paintWear(0xe8dcc0, 11).texture()),
  teal: () => once('teal', () => paintWear(0x3a9a96, 12).texture()),
  stripe: () => once('stripe', () => paintWear(0xf2a63a, 13).texture()),
  rust: () => once('rust', () => {
    const p = new PixelPainter(64, 64, 21).clear();
    const pal = ramp(0x8a4a2a, 5, { light: 0.2 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - 32, y - 32) / 30 + (tileFbm(x / 64 * 6, y / 64 * 6, 6, 3, 21) - 0.5) * 0.9;
      if (d < 0.75) p.set(x, y, pal[Math.min(4, Math.floor((0.75 - d) * 6 + bayer(x, y) * 1.5))]);
      else if (d < 0.85 && (x + y) % 2 === 0) p.set(x, y, pal[0]);
    }
    return p.texture({ wrap: THREE.ClampToEdgeWrapping });
  }),
  mud: () => once('mud', () => {
    const p = new PixelPainter(128, 32, 22).clear();
    const pal = ramp(0x5a4128, 4, { light: 0.15 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 128; x++) {
      const v = (y / 32) + (tileFbm(x / 128 * 8, y / 32 * 2, 8, 3, 22) - 0.5) * 0.9;
      if (v > 0.45) p.set(x, y, pal[Math.min(3, Math.floor((v - 0.45) * 6))]);
    }
    p.scatter(40, (x, y) => { if (y < 16) p.disc(x, y, 1.2, pal[1]); });
    return p.texture();
  }),
  glass: () => once('glass', () => {
    const p = new PixelPainter(64, 64, 23);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const n = tileFbm(x / 64 * 4, y / 64 * 4, 4, 2, 23); p.set(x, y, [130 + n * 40, 170 + n * 40, 190 + n * 30], 255); }
    p.scatter(30, (x, y) => p.set(x, y, [230, 240, 245]));
    for (let k = 0; k < 4; k++) p.line(10 + k * 14, 0, 0, 10 + k * 14, [210, 225, 235], { blend: 0.4 });
    return p.texture();
  }),
  crack: () => once('crack', () => {
    const p = new PixelPainter(128, 128, 24).clear();
    const cx = 92, cy = 40;
    for (let k = 0; k < 11; k++) {
      let a = (k / 11) * Math.PI * 2 + p.rng.next() * 0.3, x = cx, y = cy;
      const len = 30 + p.rng.next() * 60;
      for (let i = 0; i < len; i++) { p.setc(x, y, [240, 248, 255]); if (i % 2) p.setc(x + 1, y, [180, 200, 210]); a += (p.rng.next() - 0.5) * 0.3; x += Math.cos(a); y += Math.sin(a); }
    }
    for (let r = 6; r < 24; r += 7) for (let a = 0; a < 6.28; a += 0.05) if (p.rng.next() < 0.5) p.setc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, [220, 235, 245]);
    return p.texture({ wrap: THREE.ClampToEdgeWrapping });
  }),
  carpet: () => once('carpet', () => {
    const p = new PixelPainter(64, 64, 25);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const ring = Math.floor(Math.hypot(((x + 16) % 32) - 16, ((y + 16) % 32) - 16) / 4) % 3;
      const c = [[200, 110, 40], [150, 70, 30], [230, 160, 60]][ring];
      const f = (x * 7 + y * 13) % 5 === 0 ? 0.85 : 1;
      p.set(x, y, c.map((v) => v * f));
    }
    p.scatter(40, (x, y) => p.mul(x, y, 0.75));
    return p.texture();
  }),
  panel: () => once('panel', () => {
    const p = new PixelPainter(64, 64, 26);
    const pal = ramp(0x8a5a34, 5, { light: 0.16 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const plank = Math.floor(x / 16);
      const grain = tileFbm(x / 64 * 2 + plank * 1.7, y / 64 * 12, 2, 2, 26 + plank);
      let k = 1 + Math.floor(grain * 3);
      if (x % 16 === 0) k = 0;
      if (x % 16 === 1) k = 4;
      p.set(x, y, pal[k]);
    }
    return p.texture();
  }),
  upholstery: () => once('uph', () => {
    const p = new PixelPainter(32, 32, 27);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const a = Math.floor(x / 4) % 2, b = Math.floor(y / 4) % 2;
      let c = a && b ? [120, 60, 40] : a || b ? [180, 110, 60] : [220, 170, 100];
      if ((x + y) % 8 === 0) c = [90, 140, 140];
      p.set(x, y, c);
    }
    return p.texture();
  }),
  tire: () => once('tire', () => {
    const p = new PixelPainter(64, 16, 28);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
      let c = [34, 32, 30];
      if ((x + (y < 8 ? 0 : 4)) % 8 < 3 && y > 2 && y < 14) c = [20, 18, 18];
      if (y === 0 || y === 15) c = [50, 46, 42];
      p.set(x, y, c);
    }
    return p.texture();
  }),
  pcb: () => once('pcb', () => {
    const p = new PixelPainter(64, 64, 29);
    p.fill([30, 100, 50]);
    for (let i = 0; i < 40; i++) { let x = Math.floor(p.rng.next() * 64), y = Math.floor(p.rng.next() * 64); const len = 4 + p.rng.next() * 16; const dir = p.rng.next() < 0.5; for (let k = 0; k < len; k++) { p.set(x, y, [200, 170, 70]); dir ? x++ : y++; } }
    for (let i = 0; i < 10; i++) { const x = Math.floor(p.rng.next() * 56), y = Math.floor(p.rng.next() * 56); p.rect(x, y, 6, 4, [30, 30, 30]); for (let k = 0; k < 6; k += 2) { p.set(x + k, y - 1, [210, 210, 210]); p.set(x + k, y + 4, [210, 210, 210]); } }
    return p.texture();
  }),
  metal: () => once('metal', () => {
    const p = new PixelPainter(32, 32, 30);
    const pal = ramp(0x9aa0a6, 4, { light: 0.15 });
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, pal[1 + Math.floor(tileFbm(x / 32 * 2, y / 32 * 8, 2, 2, 30) * 2.5)]);
    return p.texture();
  }),
  copper: () => once('copper', () => {
    const p = new PixelPainter(16, 16, 31);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, y % 4 === 0 ? [120, 60, 30] : y % 4 === 1 ? [240, 160, 90] : [200, 110, 50]);
    return p.texture();
  }),
};

// text decal (sticker / plate / label) rendered with the UI pixel font
export function textTexture(lines, opt = {}) {
  const { w = 256, h = 64, bg = '#f2efe6', fg = '#17130e', border = '#17130e', font = 'Pixelify Sans', size = 22, round = true, emblem } = opt;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  if (bg) { x.fillStyle = border; x.fillRect(0, 0, w, h); x.fillStyle = bg; x.fillRect(3, 3, w - 6, h - 6); }
  if (emblem) emblem(x, w, h);
  x.fillStyle = fg;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((line, i) => {
    let s = size;
    x.font = `${s}px "${font}"`;
    while (x.measureText(line).width > w - 14 && s > 8) { s -= 1; x.font = `${s}px "${font}"`; }
    x.fillText(line, w / 2, h / 2 + (i - (L.length - 1) / 2) * (s + 2));
  });
  void round;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  return t;
}

export const STICKERS = [
  { text: ['MY OTHER CAR IS', 'A TIME MACHINE'], bg: '#f2efe6', fg: '#2a50a0', w: 256, h: 64 },
  { text: ['HONK IF YOU\'RE', 'FROM THE FUTURE'], bg: '#f2b630', fg: '#17130e', w: 256, h: 64 },
  { text: ['I ♥ 1987'], bg: '#ffffff', fg: '#e04a3a', w: 160, h: 64, size: 30 },
  { text: ['THE PARADOXES', 'WORLD TOUR'], bg: '#17130e', fg: '#e8614f', w: 256, h: 64 },
  { text: ['WARNING:', 'TEMPORAL PAYLOAD'], bg: '#f2d040', fg: '#17130e', w: 256, h: 64 },
  { text: ['STUDENT DRIVER'], bg: '#e04a3a', fg: '#ffffff', w: 256, h: 48 },
  { text: [':)'], bg: '#f2d040', fg: '#17130e', w: 64, h: 64, size: 34 },
  { text: ['NASA', '(NOT AFFILIATED)'], bg: '#ffffff', fg: '#2a50a0', w: 200, h: 64 },
];
