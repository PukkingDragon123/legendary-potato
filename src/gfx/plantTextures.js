// Pixel-art bark (64x128, tiling) and foliage (128x256, alpha-cut) textures
// for the prehistoric flora. Foliage is painted on transparent canvases and
// used with alpha-to-coverage cutouts.
import { PixelPainter, ramp, makeArrayTexture, bayer } from './pixel.js';
import { tileFbm, tileNoise } from '../core/rng.js';

export const BARK = { ARAUCARIA: 0, TREEFERN: 1, CYCAD: 2, GINKGO: 3, REDWOOD: 4, PALM: 5, GIANT: 6, HORSETAIL: 7, DEAD: 8, CHARRED: 9, CYPRESS: 10, CONIFER: 11, RINGS: 12 };
export const LEAF = { ROPE: 0, FERN: 1, CYCAD: 2, GINKGO: 3, SPRAY: 4, PALM: 5, BROAD: 6, WHORL: 7, SWAMP: 8, TWIGS: 9, MOSS: 10, GOLDEN: 11 };

const BW = 64, BH = 128;
const FW = 128, FH = 256;

// ------------------------------------------------------------------ bark
function furrows(p, pal, opt = {}) {
  const { count = 9, wobble = 2, depth = 0, seed = p.seed } = opt;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const xx = x + tileFbm(x / p.w * 2, y / p.h * 4, 2, 2, seed) * wobble * 4;
    const f = Math.abs(((xx / p.w) * count) % 1 - 0.5) * 2; // 0 at furrow centre... 1 at ridge
    const n = tileFbm(x / p.w * 8, y / p.h * 16, 8, 2, seed + 3);
    let v = f * 0.7 + n * 0.4 + (bayer(x, y) - 0.5) * 0.12 - depth;
    p.set(x, y, pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))]);
  }
}
const bark = {
  araucaria(seed) {
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0x7a6650, 5, { light: 0.2 });
    p.fill(pal[1]);
    // overlapping diamond scales
    for (let row = 0; row < BH / 8; row++) for (let col = 0; col < BW / 8; col++) {
      const cx = col * 8 + (row % 2) * 4, cy = row * 8;
      for (let dy = 0; dy < 8; dy++) for (let dx = -4; dx < 4; dx++) {
        const d = Math.abs(dx) / 4 + Math.abs(dy - 4) / 4;
        if (d > 1) continue;
        let c = pal[2];
        if (dy < 2) c = pal[3];
        if (dx < -1 && dy < 5) c = pal[4];
        if (d > 0.82) c = pal[0];
        p.set(cx + dx, cy + dy, c);
      }
    }
    p.scatter(60, (x, y) => p.set(x, y, pal[0]));
    return p;
  },
  treefern(seed) {
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0x4a3524, 5, { light: 0.18 });
    furrows(p, pal, { count: 12, wobble: 1 });
    // leaf-base scars in a spiral
    for (let k = 0; k < 18; k++) {
      const x = (k * 23) % BW, y = (k * 29) % BH;
      p.blob(x, y, 4, 6, ramp(0x6b5034, 4), { outline: 0x241810 });
      p.set(x, y, 0x241810); p.set(x, y + 1, 0x241810);
    }
    // fibrous roots near... (texture is tiling, so sprinkle fibres)
    p.scatter(40, (x, y, i, r) => p.line(x, y, x + r.int(-1, 1), y + 4 + r.int(0, 4), 0x2e2117));
    return p;
  },
  cycad(seed) {
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0x7d6d55, 5, { light: 0.2 });
    p.fill(pal[0]);
    // armour of persistent leaf bases: chunky rhombs
    for (let row = 0; row < BH / 10; row++) for (let col = 0; col < BW / 10; col++) {
      const cx = col * 10 + (row % 2) * 5 + 5, cy = row * 10 + 5;
      for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
        const d = Math.abs(dx) / 5 + Math.abs(dy) / 4.2;
        if (d > 1) continue;
        let c = pal[2];
        if (dx + dy < -3) c = pal[4]; else if (dx + dy < 0) c = pal[3];
        if (dx + dy > 4) c = pal[1];
        if (d > 0.85) c = pal[0];
        p.set(cx + dx, cy + dy, c);
      }
      p.set(cx, cy, pal[0]);
    }
    return p;
  },
  ginkgo(seed) {
    const p = new PixelPainter(BW, BH, seed);
    furrows(p, ramp(0x6f6559, 5, { light: 0.22 }), { count: 7, wobble: 2.5 });
    p.scatter(14, (x, y, i, r) => { const c = r.pick([0xa7a471, 0x8f9a6a]); for (let k = 0; k < 5; k++) p.set(x + r.int(-2, 2), y + r.int(-2, 2), c); });
    return p;
  },
  redwood(seed) {
    const p = new PixelPainter(BW, BH, seed);
    furrows(p, ramp(0x8a4a30, 6, { light: 0.24 }), { count: 6, wobble: 3, seed });
    p.scatter(30, (x, y, i, r) => p.line(x, y, x, y + 6 + r.int(0, 10), 0x4a2416));
    return p;
  },
  palm(seed) {
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0x8a7556, 5, { light: 0.2 });
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const ring = y % 12;
      let c = ring < 2 ? pal[0] : ring < 4 ? pal[3] : pal[2];
      if (tileNoise(x / 2, y / 6, BW / 2, seed) > 0.7 && ring > 3) c = pal[1];
      if (ring === 2 && (x + y) % 3 === 0) c = pal[4];
      p.set(x, y, c);
    }
    p.scatter(50, (x, y) => p.line(x, y, x + 2, y + 1, pal[0]));
    return p;
  },
  giant(seed) {
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0x8c8a80, 5, { light: 0.2 });
    p.noiseFill(pal.slice(1, 4), { scale: 4, octaves: 2, dither: 0.5, stretchY: 2 });
    p.scatter(40, (x, y) => { p.set(x, y, pal[0]); p.set(x + 1, y, pal[0]); p.set(x, y - 1, pal[4]); });
    const lich = [ramp(0xb2b06a, 3), ramp(0x8fb07a, 3), ramp(0xd0d0c0, 3)];
    p.scatter(12, (x, y, i, r) => { const c = r.pick(lich); for (let k = 0; k < 8; k++) p.blob(x + r.int(-3, 3), y + r.int(-3, 3), 1.3, 1.1, c); });
    return p;
  },
  horsetail(seed) {
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0x6e9a3c, 5, { light: 0.22 });
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const g = x % 4;
      let c = g === 0 ? pal[1] : g === 1 ? pal[3] : pal[2];
      const node = y % 32;
      if (node < 3) c = node === 1 ? 0x2a2a1c : 0x4a4428;
      if (node === 3) c = pal[4];
      p.set(x, y, c);
    }
    return p;
  },
  dead(seed) {
    const p = new PixelPainter(BW, BH, seed);
    furrows(p, ramp(0x9a9284, 5, { light: 0.24 }), { count: 5, wobble: 3 });
    p.scatter(8, (x, y, i, r) => p.crack(x, y, 10 + r.next() * 14, 0x4a443c, null, { angle: Math.PI / 2, wiggle: 0.3 }));
    return p;
  },
  charred(seed) {
    const p = new PixelPainter(BW, BH, seed);
    furrows(p, ramp(0x2a2624, 4, { light: 0.12 }), { count: 8, wobble: 2 });
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if ((x * 7 + y * 3) % 23 === 0 && tileNoise(x / 4, y / 4, 16, seed) > 0.6) p.set(x, y, 0x8a2a10);
    return p;
  },
  cypress(seed) {
    const p = new PixelPainter(BW, BH, seed);
    furrows(p, ramp(0x6a5a48, 5, { light: 0.2 }), { count: 9, wobble: 2 });
    const moss = ramp(0x5a7a34, 4);
    p.scatter(16, (x, y, i, r) => { for (let k = 0; k < 9; k++) p.blob(x + r.int(-3, 3), y + r.int(-4, 4), 1.4, 1.2, moss); });
    return p;
  },
  conifer(seed) {
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0x8e5a36, 5, { light: 0.2 });
    p.fill(pal[0]);
    // irregular plates
    for (let k = 0; k < 70; k++) {
      const x = p.rng.next() * BW, y = p.rng.next() * BH;
      const w = 4 + p.rng.next() * 6, h = 6 + p.rng.next() * 10;
      for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) {
        const c = dx === 0 || dy === 0 ? pal[3] : dx > w - 2 ? pal[1] : pal[2];
        p.set(x + dx, y + dy, c);
      }
    }
    return p;
  },
  rings(seed) {
    // end grain for stumps / log caps (centre at middle of the 64x64 top half)
    const p = new PixelPainter(BW, BH, seed);
    const pal = ramp(0xc9a46c, 5, { light: 0.18 });
    for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) {
      const cx = 32, cy = y < 64 ? 32 : 96;
      const d = Math.hypot(x - cx, y - cy) + tileNoise(x / 4, y / 4, 16, seed) * 2;
      let c = Math.floor(d) % 5 === 0 ? pal[1] : pal[3];
      if (d > 29) c = 0x5a4030;
      if (d > 31) c = 0x3a2a1e;
      if (d < 2) c = pal[0];
      p.set(x, y, c);
    }
    p.scatter(4, (x, y) => p.line(32, 32, x % 64, y % 64, pal[0]));
    return p;
  },
};

// ------------------------------------------------------------------ foliage
function newLeafCanvas(seed) { return new PixelPainter(FW, FH, seed).clear(); }

function pinnateFrond(p, pal, opt = {}) {
  const { pinnaLen = 54, spacing = 5, angle = 0.95, droop = 0, width = 2, notch = true, tipWide = 0.18, baseWide = 0.6, curl = 0 } = opt;
  const cx = FW / 2;
  // midrib
  for (let y = 0; y < FH; y++) {
    const x = cx + Math.sin(y / FH * Math.PI) * curl;
    p.set(x, y, pal[0]); p.set(x + 1, y, pal[1]);
  }
  for (let y = 4; y < FH - 2; y += spacing) {
    const t = 1 - y / FH; // 0 tip .. 1 base
    const prof = t < 0.3 ? tipWide + (t / 0.3) * (1 - tipWide) : 1 - (t - 0.3) / 0.7 * (1 - baseWide);
    const len = Math.max(3, pinnaLen * prof);
    const rx = cx + Math.sin(y / FH * Math.PI) * curl;
    for (const side of [-1, 1]) {
      for (let k = 1; k < len; k++) {
        const fx = rx + side * k * Math.sin(angle);
        const fy = y - k * Math.cos(angle) + droop * (k / len) * (k / len) * 8;
        const tip = k > len - 3;
        for (let w = 0; w < width; w++) {
          const shade = w === 0 ? (side < 0 ? 3 : 2) : 1;
          p.set(fx, fy + w, tip ? pal[Math.min(pal.length - 1, shade + 1)] : pal[shade]);
        }
        if (notch && k % 3 === 0 && !tip) p.set(fx, fy + width, pal[2]);
      }
    }
  }
}

const foliage = {
  rope(seed) {
    // Araucaria branch: rope of overlapping spiky scale-leaves (vertical, centred)
    const p = newLeafCanvas(seed);
    const pal = ramp(0x2f6a2a, 5, { light: 0.22 });
    for (let y = FH - 4; y > 2; y -= 4) {
      for (let k = -3; k <= 3; k++) {
        const bx = FW / 2 + k * 7 + ((y / 4) % 2) * 3;
        const h = 12 - Math.abs(k) * 1.2;
        for (let dy = 0; dy < h; dy++) {
          const w = Math.max(0, Math.round((1 - dy / h) * 3));
          for (let dx = -w; dx <= w; dx++) {
            const c = dx < 0 ? pal[3] : dx === 0 ? pal[2] : pal[1];
            p.set(bx + dx + k * dy * 0.25, y - dy, dy > h - 2 ? pal[4] : c);
          }
        }
      }
    }
    p.innerOutline(pal[0], 128, true);
    return p;
  },
  fern(seed) {
    const p = newLeafCanvas(seed);
    pinnateFrond(p, ramp(0x4f8c2f, 5, { light: 0.24 }), { pinnaLen: 56, spacing: 5, angle: 1.05, droop: 1.5, width: 3, curl: 2 });
    return p;
  },
  cycad(seed) {
    const p = newLeafCanvas(seed);
    pinnateFrond(p, ramp(0x2f6b30, 5, { light: 0.26 }), { pinnaLen: 50, spacing: 4, angle: 0.75, width: 2, notch: false, baseWide: 0.85, tipWide: 0.3 });
    return p;
  },
  ginkgo(seed) {
    const p = newLeafCanvas(seed);
    const pal = ramp(0x6f9a32, 5, { light: 0.24 });
    clusterOfFans(p, pal, seed);
    return p;
  },
  golden(seed) {
    const p = newLeafCanvas(seed);
    clusterOfFans(p, ramp(0xd9a93a, 5, { light: 0.22 }), seed);
    return p;
  },
  spray(seed) {
    // conifer / redwood needle spray, two sprays stacked
    const p = newLeafCanvas(seed);
    const pal = ramp(0x2e5a2c, 5, { light: 0.22 });
    for (const oy of [0, 128]) {
      const twig = (x, y, ang, len, depth) => {
        for (let k = 0; k < len; k++) {
          const px = x + Math.cos(ang) * k, py = y + Math.sin(ang) * k;
          p.set(px, py, 0x4a3420);
          // needles
          if (k % 2 === 0) {
            for (const s of [-1, 1]) {
              const na = ang + s * 1.0;
              for (let m = 1; m < 5; m++) p.set(px + Math.cos(na) * m, py + Math.sin(na) * m, pal[m < 2 ? 1 : s < 0 ? 3 : 2]);
            }
          }
          if (depth > 0 && k > 6 && k % 9 === 0) twig(px, py, ang + (k % 18 === 0 ? 0.7 : -0.7), len * 0.45, depth - 1);
        }
      };
      twig(FW / 2, oy + 124, -Math.PI / 2, 110, 2);
    }
    return p;
  },
  palm(seed) {
    const p = newLeafCanvas(seed);
    pinnateFrond(p, ramp(0x4e8a34, 5, { light: 0.22 }), { pinnaLen: 60, spacing: 4, angle: 1.35, droop: 5, width: 2, notch: false, baseWide: 0.75, tipWide: 0.25 });
    return p;
  },
  broad(seed) {
    const p = newLeafCanvas(seed);
    const pals = [ramp(0x3f7a2c, 5, { light: 0.24 }), ramp(0x4a8a30, 5, { light: 0.24 }), ramp(0x356a2a, 5, { light: 0.22 })];
    for (const oy of [0, 128]) {
      for (let i = 0; i < 150; i++) {
        const a = p.rng.next() * Math.PI * 2;
        const r = Math.sqrt(p.rng.next()) * 54;
        const x = 64 + Math.cos(a) * r, y = oy + 64 + Math.sin(a) * r * 0.9;
        const pal = p.rng.pick(pals);
        const ang = a + (p.rng.next() - 0.5) * 1.2;
        leafShape(p, x, y, ang, 6 + p.rng.next() * 3, 3.2, pal);
      }
    }
    p.innerOutline(0x1e3a18, 128, true);
    return p;
  },
  whorl(seed) {
    // horsetail node whorl: starburst of thin green needles
    const p = newLeafCanvas(seed);
    const pal = ramp(0x6e9a3c, 4, { light: 0.2 });
    for (const oy of [64, 192]) {
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2 + p.rng.next() * 0.1;
        const len = 40 + p.rng.next() * 18;
        for (let m = 2; m < len; m++) {
          const x = 64 + Math.cos(a) * m, y = oy + Math.sin(a) * m * 0.9 + (m / len) * (m / len) * 10;
          p.set(x, y, pal[m % 9 === 0 ? 0 : m > len - 4 ? 3 : 2]);
        }
      }
    }
    return p;
  },
  swamp(seed) {
    // bald cypress feathery needles + hanging spanish moss strands
    const p = newLeafCanvas(seed);
    const pal = ramp(0x6a9a42, 5, { light: 0.22 });
    for (let i = 0; i < 28; i++) {
      const x = 10 + p.rng.next() * 108, y = 10 + p.rng.next() * 110;
      const a = -Math.PI / 2 + (p.rng.next() - 0.5) * 1.4;
      for (let k = 0; k < 18; k++) {
        const px = x + Math.cos(a) * k, py = y + Math.sin(a) * k;
        p.set(px, py, 0x4a4028);
        for (const s of [-1, 1]) for (let m = 1; m < 4; m++) p.set(px + Math.cos(a + s * 1.3) * m, py + Math.sin(a + s * 1.3) * m, pal[s < 0 ? 3 : 2]);
      }
    }
    const moss = [0x8a9a78, 0x9fae8a, 0x6e7e60];
    for (let i = 0; i < 16; i++) {
      const x = 8 + p.rng.next() * 112;
      const len = 40 + p.rng.next() * 80;
      for (let k = 0; k < len; k++) p.set(x + Math.sin(k * 0.15 + i) * 2, 128 + k * 0.95, p.rng.pick(moss));
    }
    return p;
  },
  twigs(seed) {
    const p = newLeafCanvas(seed);
    const br = (x, y, a, len, d) => {
      let px = x, py = y;
      for (let k = 0; k < len; k++) {
        px += Math.cos(a); py += Math.sin(a);
        p.set(px, py, 0x5a4c3e); p.set(px + 1, py, 0x8a7a66);
        a += (p.rng.next() - 0.5) * 0.25;
        if (d > 0 && k % 12 === 6) br(px, py, a + (p.rng.next() < 0.5 ? 0.8 : -0.8), len * 0.5, d - 1);
      }
    };
    br(64, 250, -Math.PI / 2, 120, 3);
    return p;
  },
  moss(seed) {
    // hanging vines with small leaves (vertical strips)
    const p = newLeafCanvas(seed);
    const pal = ramp(0x3f7a2c, 5, { light: 0.24 });
    for (let i = 0; i < 9; i++) {
      const x0 = 8 + i * 14 + p.rng.next() * 6;
      const len = 120 + p.rng.next() * 130;
      for (let k = 0; k < len; k++) {
        const x = x0 + Math.sin(k * 0.06 + i) * 3;
        p.set(x, k, 0x3a5a24);
        if (k % 7 === 0) leafShape(p, x + (k % 14 === 0 ? 3 : -3), k + 2, k % 14 === 0 ? 0.6 : 2.5, 4, 2.2, pal);
      }
    }
    return p;
  },
};

function leafShape(p, x, y, ang, len, wid, pal) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let t = -len; t <= len; t++) {
    const w = Math.round(Math.sqrt(Math.max(0, 1 - (t / len) ** 2)) * wid);
    for (let s = -w; s <= w; s++) {
      const px = x + ca * t - sa * s, py = y + sa * t + ca * s;
      const shade = s < 0 ? 3 : s === 0 ? 2 : 1;
      p.set(px, py, pal[t > len * 0.5 && s < 0 ? 4 : shade]);
    }
  }
  for (let t = -len + 1; t < len; t++) p.set(x + ca * t, y + sa * t, pal[1]);
}

function clusterOfFans(p, pal, seed) {
  for (const oy of [0, 128]) {
    for (let i = 0; i < 70; i++) {
      const a = p.rng.next() * Math.PI * 2;
      const r = Math.sqrt(p.rng.next()) * 50;
      const x = 64 + Math.cos(a) * r, y = oy + 64 + Math.sin(a) * r * 0.9;
      const dir = a + Math.PI + (p.rng.next() - 0.5);
      const R = 6 + p.rng.next() * 3;
      // fan: half disc opening away from the stalk with a central notch
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > R) continue;
        const ang = Math.atan2(dy, dx) - dir;
        const aa = Math.atan2(Math.sin(ang), Math.cos(ang));
        if (Math.abs(aa) > 1.25) continue;
        if (Math.abs(aa) < 0.12 && d > R * 0.55) continue; // notch
        const shade = aa < -0.3 ? 3 : aa > 0.6 ? 1 : 2;
        p.set(x + dx, y + dy, pal[d > R - 1.2 ? Math.min(4, shade + 1) : shade]);
      }
      // stalk
      for (let k = 0; k < 5; k++) p.set(x - Math.cos(dir) * k, y - Math.sin(dir) * k, pal[0]);
    }
  }
  p.innerOutline(pal[0], 128, true);
}

export function buildPlantTextures() {
  const barkOrder = ['araucaria', 'treefern', 'cycad', 'ginkgo', 'redwood', 'palm', 'giant', 'horsetail', 'dead', 'charred', 'cypress', 'conifer', 'rings'];
  const leafOrder = ['rope', 'fern', 'cycad', 'ginkgo', 'spray', 'palm', 'broad', 'whorl', 'swamp', 'twigs', 'moss', 'golden'];
  const bp = barkOrder.map((n, i) => bark[n](500 + i * 13));
  const lp = leafOrder.map((n, i) => foliage[n](700 + i * 17));
  return { bark: makeArrayTexture(bp), leaves: makeArrayTexture(lp), barkPainters: bp, leafPainters: lp };
}
export { bark as barkPainters, foliage as foliagePainters };
