// Pixel-art fabric textures for the chunky cartoon explorers. High texel density
// (about 128 px per metre) so prints, stitching, zips, quilting and wear read
// clearly. Painted top-down (row 0 = top of the garment) and flipped on export
// so they map onto lathe/sphere UVs.
import { PixelPainter, ramp, bayer } from './pixel.js';
import { tileFbm } from '../core/rng.js';

function flipRows(p) {
  const w = p.w * 4, tmp = new Uint8ClampedArray(w);
  for (let y = 0; y < p.h / 2; y++) {
    const a = y * w, b = (p.h - 1 - y) * w;
    tmp.set(p.data.subarray(a, a + w)); p.data.copyWithin(a, b, b + w); p.data.set(tmp, b);
  }
  return p;
}
function weave(p, base, amt = 0.07, seed = 1) {
  // subtle plain/twill weave: near-flat colour with a 1px thread pattern,
  // gentle large-scale fading and a few slub threads. Returns the palette.
  const pal = ramp(base, 5, { light: 0.12 });
  const b = pal[2];
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    let f = 1;
    if ((x + y) % 2 === 0) f *= 0.965;
    if ((x + 2 * y) % 5 === 0) f *= 1.035; // twill diagonal
    f *= 1 + (tileFbm((x / p.w) * 3, (y / p.h) * 3, 3, 2, seed) - 0.5) * amt * 1.4;
    p.set(x, y, [b[0] * f, b[1] * f, b[2] * f]);
  }
  // slub threads
  for (let k = 0; k < p.h / 8; k++) {
    const y = Math.floor(p.rng.next() * p.h), x0 = Math.floor(p.rng.next() * p.w), len = 4 + Math.floor(p.rng.next() * 10);
    for (let x = x0; x < x0 + len; x++) p.mul(x, y, p.rng.next() < 0.5 ? 1.06 : 0.94);
  }
  return pal;
}
function dashedH(p, y, x0, x1, c, gap = 2) { for (let x = x0; x < x1; x++) if (Math.floor(x / gap) % 2 === 0) p.set(x, y, c); }
function dashedV(p, x, y0, y1, c, gap = 2) { for (let y = y0; y < y1; y++) if (Math.floor(y / gap) % 2 === 0) p.set(x, y, c); }
function wrinkles(p, xs, shade = 0.86) {
  for (const x0 of xs) for (let k = 0; k < 5; k++) {
    let x = x0 + (Math.random() - 0.5) * 10, y = 10 + Math.random() * 90;
    const len = 10 + Math.random() * 20;
    for (let i = 0; i < len; i++) { p.mul(x, y, shade); x += (Math.random() - 0.5) * 0.8 + 0.25; y += 1; }
  }
}
function hibiscus(p, cx, cy, s = 1) {
  const petal = [[255, 246, 240], [248, 214, 222], [236, 180, 196]];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 - 0.3;
    const px = cx + Math.cos(a) * 3.4 * s, py = cy + Math.sin(a) * 3.4 * s;
    p.blob(px, py, 2.6 * s, 2.3 * s, petal, { lx: -0.6, ly: -0.7 });
  }
  p.disc(cx, cy, 1.4 * s, [200, 40, 70]);
  p.set(cx + 1, cy - 1, [255, 220, 90]); p.set(cx + 2, cy - 2, [255, 220, 90]);
}
function leafPrint(p, cx, cy, a, len) {
  const pal = [[40, 110, 70], [60, 140, 80], [90, 170, 90]];
  for (let t = -len; t <= len; t++) {
    const w = Math.round((1 - Math.abs(t) / (len + 1)) * 2.2);
    for (let s = -w; s <= w; s++) p.set(cx + Math.cos(a) * t - Math.sin(a) * s, cy + Math.sin(a) * t + Math.cos(a) * s, pal[s < 0 ? 2 : s === 0 ? 1 : 0]);
  }
}
function buttons(p, x, y0, y1, step, c = [245, 240, 230]) {
  for (let y = y0; y < y1; y += step) { p.disc(x, y, 1.3, c); p.set(x - 1, y - 1, [255, 255, 255]); p.set(x + 1, y + 1, [150, 140, 130]); }
}
function zipper(p, x, y0, y1) {
  for (let y = y0; y < y1; y++) { p.set(x, y, [70, 70, 75]); p.set(x + 1, y, y % 2 ? [190, 190, 196] : [110, 110, 116]); p.set(x - 1, y, y % 2 ? [110, 110, 116] : [190, 190, 196]); }
  p.rect(x - 1, y0 + 2, 3, 4, [210, 210, 216]);
}

// ------------------------------------------------------------------ tops (128 x 128, front centre at x = 64)
export const TOPS = {
  hawaiian(seed = 3) {
    const p = new PixelPainter(128, 128, seed);
    weave(p, 0xe2668e, 0.07, seed);
    const r = p.rng;
    for (let i = 0; i < 22; i++) {
      const x = r.next() * 128, y = 10 + r.next() * 110;
      leafPrint(p, x + 5, y + 3, r.next() * 3, 4); leafPrint(p, x - 4, y + 4, r.next() * 3, 3);
    }
    for (let i = 0; i < 16; i++) hibiscus(p, r.next() * 128, 8 + r.next() * 112, 0.9 + r.next() * 0.35);
    // placket + buttons + collar
    for (let y = 0; y < 128; y++) { p.mul(61, y, 0.8); p.mul(67, y, 0.8); }
    buttons(p, 64, 22, 120, 18);
    for (let x = 0; x < 128; x++) { p.mul(x, 0, 0.6); p.mul(x, 1, 0.75); p.mul(x, 2, 0.88); }
    dashedH(p, 124, 0, 128, [250, 200, 214]);
    wrinkles(p, [30, 98]);
    return flipRows(p);
  },
  hivis(seed = 4) {
    const p = new PixelPainter(128, 128, seed);
    weave(p, 0xff6a1c, 0.06, seed);
    const tape = (y0) => {
      for (let y = y0; y < y0 + 8; y++) for (let x = 0; x < 128; x++) {
        const sparkle = (x * 7 + y * 13) % 17 === 0;
        p.set(x, y, sparkle ? [255, 255, 255] : y === y0 || y === y0 + 7 ? [150, 154, 160] : ((x + y) % 4 < 2 ? [206, 210, 216] : [186, 190, 196]));
      }
      dashedH(p, y0 - 1, 0, 128, [255, 170, 110]); dashedH(p, y0 + 8, 0, 128, [255, 170, 110]);
    };
    tape(52); tape(84);
    zipper(p, 64, 0, 128);
    // pocket flaps
    for (const px of [34, 94]) { p.rect(px - 10, 98, 20, 2, [200, 80, 20]); dashedH(p, 101, px - 10, px + 10, [255, 170, 110]); }
    // collar + grime
    for (let x = 0; x < 128; x++) { p.mul(x, 0, 0.6); p.mul(x, 1, 0.7); }
    p.scatter(9, (x, y) => { for (let k = 0; k < 6; k++) p.mul(x + Math.random() * 4, y + Math.random() * 3, 0.85); });
    wrinkles(p, [30, 98], 0.9);
    return flipRows(p);
  },
  fleece(seed = 5) {
    // open front vest worn over a shirt (mapped onto a partial lathe, so edges are the front)
    const p = new PixelPainter(128, 128, seed);
    const pal = ramp(0xc89c3e, 5, { light: 0.14 });
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const r = p.rng.next();
      const n = tileFbm(x / 128 * 6, y / 128 * 6, 6, 2, seed);
      let k = 2 + (n > 0.7 ? 1 : 0);
      if (r < 0.2) k += 1; else if (r > 0.9) k -= 1;
      p.set(x, y, pal[Math.max(0, Math.min(4, k))]);
    }
    // binding at the open front edges
    for (let y = 0; y < 128; y++) for (const x of [0, 1, 2, 125, 126, 127]) p.set(x, y, [110, 80, 40]);
    dashedV(p, 4, 0, 128, [230, 200, 140]); dashedV(p, 123, 0, 128, [230, 200, 140]);
    dashedH(p, 125, 0, 128, [230, 200, 140]);
    for (let x = 0; x < 128; x++) p.set(x, 127, [110, 80, 40]);
    // chest patch: little dino logo
    p.rect(92, 30, 14, 10, [70, 60, 40]); p.rect(93, 31, 12, 8, [230, 220, 190]);
    for (const [dx, dy] of [[2, 5], [3, 4], [4, 4], [5, 3], [6, 3], [7, 4], [8, 4], [9, 5], [6, 5], [5, 6], [8, 6]]) p.set(93 + dx, 31 + dy, [60, 120, 70]);
    return flipRows(p);
  },
  puffer(seed = 6) {
    const p = new PixelPainter(128, 128, seed);
    const pal = ramp(0x2c3c62, 5, { light: 0.2 });
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const q = y % 14;
      const puff = Math.sin((q / 14) * Math.PI);
      let k = Math.round(1 + puff * 2.4 + (bayer(x, y) - 0.5) * 0.6);
      if (q === 0) k = 0;
      p.set(x, y, pal[Math.max(0, Math.min(4, k))]);
    }
    zipper(p, 64, 0, 128);
    for (let x = 0; x < 128; x++) { p.set(x, 0, [20, 26, 40]); p.set(x, 1, [40, 50, 80]); }
    p.rect(26, 60, 2, 16, [20, 26, 40]); p.rect(100, 60, 2, 16, [20, 26, 40]);
    return flipRows(p);
  },
  labcoat(seed = 7) {
    const p = new PixelPainter(128, 128, seed);
    weave(p, 0xe9ece6, 0.04, seed);
    // lapels V
    for (let y = 0; y < 40; y++) { p.set(64 - y * 0.6, y, [170, 175, 170]); p.set(64 + y * 0.6, y, [170, 175, 170]); }
    for (let y = 40; y < 128; y++) p.set(64, y, [180, 184, 178]);
    buttons(p, 60, 48, 120, 20, [200, 204, 198]);
    // breast pocket with pens
    p.rect(80, 46, 18, 2, [180, 184, 178]); dashedV(p, 80, 46, 62, [180, 184, 178]); dashedV(p, 97, 46, 62, [180, 184, 178]); dashedH(p, 62, 80, 98, [180, 184, 178]);
    p.rect(84, 40, 2, 7, [200, 40, 40]); p.rect(88, 41, 2, 6, [40, 80, 200]); p.rect(92, 39, 2, 8, [30, 30, 30]);
    // coffee stain + scorch from the time machine
    p.disc(40, 92, 4, [200, 170, 120]); p.disc(40, 92, 2.5, [215, 190, 145]);
    p.scatter(8, (x, y) => { p.set(x % 30 + 20, y % 20 + 104, [90, 80, 70]); });
    wrinkles(p, [30, 98], 0.92);
    return flipRows(p);
  },
  flannel(seed = 8) {
    const p = new PixelPainter(128, 128, seed);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
      const vx = x % 16 < 6, hy = y % 16 < 6;
      let c = [176, 46, 42];
      if (vx && hy) c = [52, 28, 30]; else if (vx || hy) c = [118, 34, 34];
      if (x % 16 === 9 || y % 16 === 9) c = [214, 170, 120];
      if ((x + y) % 3 === 0) c = c.map((v) => v * 0.9);
      p.set(x, y, c);
    }
    buttons(p, 64, 18, 120, 18, [230, 220, 200]);
    for (let x = 0; x < 128; x++) { p.mul(x, 0, 0.6); p.mul(x, 1, 0.75); }
    wrinkles(p, [30, 98]);
    return flipRows(p);
  },
  safari(seed = 9) {
    const p = new PixelPainter(128, 128, seed);
    weave(p, 0xbfa77a, 0.06, seed);
    for (const px of [44, 84]) {
      p.rect(px - 9, 34, 18, 3, [150, 128, 90]); dashedH(p, 37, px - 9, px + 9, [220, 205, 170]);
      dashedV(p, px - 9, 37, 54, [150, 128, 90]); dashedV(p, px + 9, 37, 54, [150, 128, 90]); dashedH(p, 54, px - 9, px + 9, [150, 128, 90]);
      p.disc(px, 36, 1.2, [100, 80, 60]);
    }
    buttons(p, 64, 14, 124, 16, [120, 100, 70]);
    p.scatter(14, (x, y) => { p.mul(x, y, 0.82); p.mul(x + 1, y, 0.82); });
    wrinkles(p, [30, 98]);
    return flipRows(p);
  },
  hoodie(seed = 10) {
    const p = new PixelPainter(128, 128, seed);
    weave(p, 0x2f9a8e, 0.05, seed);
    for (let x = 42; x <= 86; x++) { p.set(x, 74, [30, 100, 92]); p.set(x, 75, [80, 190, 175]); }
    dashedV(p, 42, 74, 104, [30, 100, 92]); dashedV(p, 86, 74, 104, [30, 100, 92]);
    for (let y = 0; y < 22; y++) { p.set(58, y, [240, 240, 235]); p.set(70, y, [240, 240, 235]); }
    p.disc(58, 22, 1.4, [200, 200, 195]); p.disc(70, 22, 1.4, [200, 200, 195]);
    for (let y = 112; y < 128; y++) for (let x = 0; x < 128; x++) if (x % 2 === 0) p.mul(x, y, 0.85);
    return flipRows(p);
  },
};

// ------------------------------------------------------------------ bottoms (64 x 64 per leg)
export const BOTTOMS = {
  shorts(seed = 11) { const p = new PixelPainter(64, 64, seed); weave(p, 0xc9b38a, 0.05, seed); dashedH(p, 60, 0, 64, [240, 225, 190]); for (let x = 0; x < 64; x++) { p.mul(x, 62, 0.8); p.mul(x, 63, 0.7); } dashedV(p, 16, 0, 60, [160, 140, 105], 3); return flipRows(p); },
  cargo(seed = 12) { const p = new PixelPainter(64, 64, seed); weave(p, 0x5e6a3c, 0.05, seed); p.rect(8, 20, 16, 2, [40, 46, 24]); dashedV(p, 8, 22, 40, [40, 46, 24]); dashedV(p, 23, 22, 40, [40, 46, 24]); dashedH(p, 40, 8, 24, [40, 46, 24]); return flipRows(p); },
  jeans(seed = 13) { const p = new PixelPainter(64, 64, seed); weave(p, 0x3d5a8a, 0.06, seed); dashedV(p, 16, 0, 64, [214, 160, 80], 3); dashedV(p, 48, 0, 64, [214, 160, 80], 3); p.scatter(30, (x, y) => p.mul(x, y, 1.25)); return flipRows(p); },
};

export function socksTexture(c1 = 0xff7a2a, c2 = 0xf2efe6, seed = 14) {
  const p = new PixelPainter(32, 32, seed);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const band = Math.floor(y / 5) % 2 === 0;
    let c = band ? ramp(c1, 3)[1] : ramp(c2, 3)[1];
    if (x % 2 === 0) c = c.map((v) => v * 0.92);
    p.set(x, y, c);
  }
  return flipRows(p);
}
export function bootTexture(seed = 15) {
  const p = new PixelPainter(64, 32, seed);
  weave(p, 0x6b4a30, 0.06, seed);
  for (let x = 0; x < 64; x++) for (let y = 24; y < 32; y++) p.set(x, y, y === 24 ? [190, 170, 140] : [40, 34, 30]);
  for (let k = 0; k < 4; k++) { const y = 6 + k * 4; p.line(26, y, 38, y + 2, [230, 220, 200]); p.line(26, y + 2, 38, y, [230, 220, 200]); }
  dashedH(p, 22, 0, 64, [200, 170, 120]);
  return flipRows(p);
}

// ------------------------------------------------------------------ skin (head sphere 128 x 64, face centre at u = 0.25)
export function skinTexture(tone = 0xe8b48a, seed = 16, opt = {}) {
  // soft felt: near-flat tone, fine fibre speckle, gentle cheek blush
  const p = new PixelPainter(128, 64, seed);
  const pal = ramp(tone, 5, { light: 0.06, hueShift: 0.05, sat: 0.05 });
  const b = pal[2];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
    let f = 1 + (tileFbm(x / 128 * 4, y / 64 * 2, 4, 2, seed) - 0.5) * 0.05;
    const r = p.rng.next();
    if (r < 0.08) f *= 1.04; else if (r > 0.94) f *= 0.965;
    p.set(x, y, [b[0] * f, b[1] * f, b[2] * f]);
  }
  if (opt.blush !== false) for (const cx of [32 - 15, 32 + 15]) for (let dy = -3; dy <= 3; dy++) for (let dx = -5; dx <= 5; dx++) {
    const d = (dx * dx) / 25 + (dy * dy) / 9;
    if (d > 1) continue;
    if (d < 0.45 || (dx + dy) % 2 === 0) p.blend(cx + dx, 37 + dy, [236, 132, 120], 0.32);
  }
  if (opt.freckles) for (let k = 0; k < 10; k++) p.set(32 + (k * 7 % 22) - 11, 34 + (k * 5) % 6, pal[0]);
  return flipRows(p);
}

// ------------------------------------------------------------------ hats
export const HATS = {
  bucket(seed = 20) {
    const p = new PixelPainter(128, 64, seed);
    weave(p, 0xd9c79e, 0.06, seed);
    for (let k = 0; k < 4; k++) dashedH(p, 8 + k * 6, 0, 128, [170, 150, 110]);
    // sun patch on the front (u = 0.25)
    p.disc(32, 34, 7, [120, 90, 50]); p.disc(32, 34, 6, [244, 180, 60]); p.disc(32, 34, 3.5, [250, 220, 90]);
    for (let a = 0; a < 8; a++) p.line(32 + Math.cos(a) * 4, 34 + Math.sin(a) * 4, 32 + Math.cos(a) * 6, 34 + Math.sin(a) * 6, [230, 140, 40]);
    // a blue scribble patch on the side
    p.rect(84, 30, 10, 8, [80, 120, 170]); p.rect(85, 31, 8, 6, [110, 160, 210]); dashedH(p, 29, 84, 94, [240, 240, 240]);
    return flipRows(p);
  },
  beanie(seed = 21) {
    const p = new PixelPainter(128, 64, seed);
    const pal = ramp(0x2b2b30, 5, { light: 0.18 });
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const col = x % 6;
      const knit = (y + (col < 3 ? 0 : 2)) % 4 < 2;
      let k = knit ? 2 : 1;
      if (col === 0) k = 0;
      if (y > 40) k = x % 3 === 0 ? 0 : 3; // ribbed cuff
      p.set(x, y, pal[k]);
    }
    return flipRows(p);
  },
  hardhat(seed = 22) {
    const p = new PixelPainter(128, 64, seed);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) {
      const stripe = Math.floor((x + y * 0.6) / 10) % 2 === 0;
      let c = stripe ? [246, 196, 40] : [36, 30, 28];
      if ((x * 3 + y * 7) % 23 === 0) c = c.map((v) => v * 0.8);
      p.set(x, y, c);
    }
    p.rect(26, 26, 12, 9, [240, 240, 240]); p.rect(27, 27, 10, 7, [200, 40, 40]); // sticker
    p.scatter(30, (x, y) => p.mul(x, y, 0.85));
    return flipRows(p);
  },
  cap(seed = 23) {
    const p = new PixelPainter(128, 64, seed);
    weave(p, 0x3a6ea8, 0.06, seed);
    for (let a = 0; a < 6; a++) dashedV(p, a * 21, 0, 50, [30, 50, 90]);
    p.disc(32, 30, 6, [250, 250, 250]); p.disc(32, 30, 4.5, [220, 60, 50]);
    return flipRows(p);
  },
  pith(seed = 24) {
    const p = new PixelPainter(128, 64, seed);
    weave(p, 0xe4d8b4, 0.04, seed);
    for (let y = 40; y < 46; y++) for (let x = 0; x < 128; x++) p.set(x, y, [110, 80, 50]);
    return flipRows(p);
  },
  goggles(seed = 25) {
    // headband strap
    const p = new PixelPainter(128, 64, seed);
    weave(p, 0x6b4a30, 0.06, seed);
    dashedH(p, 4, 0, 128, [200, 170, 120]); dashedH(p, 59, 0, 128, [200, 170, 120]);
    return flipRows(p);
  },
};

export function pompomTexture(c = 0xd94040, seed = 26) {
  const p = new PixelPainter(32, 32, seed);
  const pal = ramp(c, 4, { light: 0.25 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) p.set(x, y, pal[(x * 7 + y * 11 + (x * y) % 5) % 4]);
  return p;
}

export function backpackTexture(base = 0x4f6b3a, seed = 27) {
  const p = new PixelPainter(64, 64, seed);
  weave(p, base, 0.06, seed);
  dashedH(p, 6, 0, 64, [220, 210, 170]); dashedH(p, 58, 0, 64, [220, 210, 170]);
  p.rect(18, 24, 28, 2, [40, 50, 30]); dashedV(p, 18, 26, 44, [40, 50, 30]); dashedV(p, 45, 26, 44, [40, 50, 30]); dashedH(p, 44, 18, 46, [40, 50, 30]);
  p.rect(30, 20, 4, 6, [200, 200, 205]);
  // patches
  p.rect(6, 34, 8, 8, [220, 80, 60]); p.rect(7, 35, 6, 6, [250, 210, 80]);
  return flipRows(p);
}
export function fannyTexture(seed = 28) {
  const p = new PixelPainter(64, 16, seed);
  weave(p, 0x2a3646, 0.06, seed);
  for (let x = 0; x < 64; x++) { p.set(x, 0, [20, 24, 30]); p.set(x, 15, [20, 24, 30]); }
  zipper(p, 32, 2, 14);
  p.rect(10, 4, 8, 6, [210, 70, 160]); p.rect(11, 5, 6, 4, [90, 220, 210]);
  return p;
}
export function scarfTexture(seed = 29) {
  const p = new PixelPainter(64, 16, seed);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 64; x++) {
    const a = Math.floor(x / 6) % 2, b = Math.floor(y / 6) % 2;
    p.set(x, y, a && b ? [30, 30, 40] : a || b ? [70, 80, 110] : [200, 200, 210]);
  }
  return p;
}
