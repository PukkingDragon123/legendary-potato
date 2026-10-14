// Hand-painted (procedurally) pixel-art ground materials. Each is a 128x128
// tile covering 4 m (32 px per metre), lit from the top-left like classic
// pixel art, and seamless.
import { PixelPainter, ramp, makeArrayTexture, mixRgb, bayer } from './pixel.js';
import { tileFbm, tileNoise } from '../core/rng.js';
import { MAT_NAMES } from '../world/gen.js';

const S = 128;

function grassBlades(p, pal, count, opt = {}) {
  const { minLen = 2, maxLen = 5, lean = 0.5, tipBoost = 1 } = opt;
  p.scatter(count, (x, y, i, r) => {
    const len = Math.floor(minLen + r.next() * (maxLen - minLen + 1));
    const dir = (r.next() - 0.5) * lean;
    const shade = Math.floor(r.next() * (pal.length - 1));
    for (let k = 0; k < len; k++) {
      const c = k === len - 1 ? pal[Math.min(pal.length - 1, shade + 1 + tipBoost)] : pal[Math.min(pal.length - 1, shade + (k > len / 2 ? 1 : 0))];
      p.set(x + dir * k, y - k, c);
    }
    p.set(x, y + 1, pal[0]);
  });
}

function leaf(p, x, y, ang, len, pal, rib) {
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let t = -len; t <= len; t++) {
    const w = Math.round((1 - Math.abs(t) / (len + 0.5)) * len * 0.45);
    for (let s = -w; s <= w; s++) {
      const px = x + ca * t - sa * s, py = y + sa * t + ca * s;
      const lit = s < 0 ? 2 : s === 0 ? 1 : 0;
      p.set(px, py, pal[Math.min(pal.length - 1, lit + (t < 0 ? 1 : 0))]);
    }
    if (rib) p.set(x + ca * t, y + sa * t, rib);
  }
}

function pebbles(p, count, pals, opt = {}) {
  const { minR = 1.2, maxR = 3.2, shadow = null } = opt;
  p.scatter(count, (x, y, i, r) => {
    const rx = minR + r.next() * (maxR - minR);
    const ry = rx * (0.6 + r.next() * 0.35);
    const pal = pals[Math.floor(r.next() * pals.length)];
    if (shadow) p.disc(x + 1, y + 1.2, rx, shadow, { ry });
    p.blob(x, y, rx, ry, pal);
  });
}

// soft low-frequency base: 3 close shades, crisp borders with a thin dithered seam
function softBase(p, pal, scale, seed, opt = {}) {
  const { t1 = 0.42, t2 = 0.6, octaves = 3 } = opt;
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const n = tileFbm((x / p.w) * scale, (y / p.h) * scale, scale, octaves, seed);
    const d = (bayer(x, y) - 0.5) * 0.04;
    p.set(x, y, n + d < t1 ? pal[0] : n + d < t2 ? pal[1] : pal[2]);
  }
}
function tuft(p, x, y, pal, h) {
  // three blades fanning out, dark root, light tips (lit from top-left)
  const blades = [[-1, h - 1], [0, h], [1, h - 1]];
  for (const [dir, len] of blades) {
    for (let k = 0; k < len; k++) {
      const px = x + Math.round(dir * k * 0.5), py = y - k;
      p.set(px, py, k === len - 1 ? pal[3] : k === 0 ? pal[0] : dir < 0 ? pal[2] : pal[1]);
    }
  }
}
const near = (c, f) => { const [r, g, b] = Array.isArray(c) ? c : [(c >> 16) & 255, (c >> 8) & 255, c & 255]; return [Math.min(255, r * f), Math.min(255, g * f), Math.min(255, b * f)]; };
function speckle(p, n, cols) { p.scatter(n, (x, y, i, r) => p.set(x, y, r.pick(cols))); }
function crackNet(p, n, dark, light, opt = {}) {
  p.scatter(n, (x, y, i, r) => {
    let a = opt.angle !== undefined ? opt.angle + (r.next() - 0.5) * (opt.spread ?? 0.6) : r.next() * Math.PI * 2;
    const len = (opt.min ?? 8) + r.next() * ((opt.max ?? 20) - (opt.min ?? 8));
    let cx = x, cy = y;
    for (let k = 0; k < len; k++) {
      p.set(cx, cy, dark);
      if (light) p.set(cx - Math.round(Math.sin(a)), cy + Math.round(Math.cos(a)) * -1, light);
      a += (r.next() - 0.5) * (opt.wiggle ?? 0.7);
      cx += Math.cos(a); cy += Math.sin(a);
      if (opt.branch && r.next() < opt.branch) {
        let b = a + (r.next() < 0.5 ? 1 : -1) * 1.1, bx = cx, by = cy;
        for (let m = 0; m < len * 0.35; m++) { p.set(bx, by, dark); b += (r.next() - 0.5) * 0.6; bx += Math.cos(b); by += Math.sin(b); }
      }
    }
  });
}
function voronoi(p, count, seed, fn) {
  const pts = [];
  for (let i = 0; i < count; i++) pts.push([p.rng.next() * p.w, p.rng.next() * p.h, p.rng.next()]);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
    for (let k = 0; k < pts.length; k++) for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const dx = x - (pts[k][0] + ox * p.w), dy = y - (pts[k][1] + oy * p.h);
      const d = dx * dx + dy * dy;
      if (d < d1) { d2 = d1; d1 = d; best = k; bx = dx; by = dy; } else if (d < d2) d2 = d;
    }
    fn(x, y, Math.sqrt(d2) - Math.sqrt(d1), pts[best][2], bx, by);
  }
}

const painters = {
  grass(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x5c8f36, 6, { light: 0.21 });
    softBase(p, [near(pal[2], 0.9), pal[2], near(pal[2], 1.04)], 3, seed);
    // dense tufts, darker under-layer first then lighter tufts on top
    p.scatter(520, (x, y, i, r) => tuft(p, x, y, [pal[0], pal[1], pal[2], pal[3]], 2 + r.int(0, 1)));
    p.scatter(380, (x, y, i, r) => tuft(p, x, y, [pal[1], pal[2], pal[3], pal[4]], 2 + r.int(0, 2)));
    p.scatter(60, (x, y, i, r) => tuft(p, x, y, [pal[2], pal[3], pal[4], pal[5]], 3));
    // tiny clover + daisies
    p.scatter(8, (x, y, i, r) => { for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0]]) p.set(x + dx, y + dy, pal[1]); p.set(x, y, pal[3]); });
    p.scatter(6, (x, y, i, r) => { const c = r.next() < 0.5 ? 0xf4f1d6 : 0xf3cf45; p.set(x, y, c); p.set(x + 1, y, c); p.set(x, y - 1, c); p.set(x + 1, y + 1, 0x2f5a20); });
    return p;
  },
  jungle(seed) {
    const p = new PixelPainter(S, S, seed);
    const soil = ramp(0x553b27, 5, { light: 0.16 });
    softBase(p, [near(soil[2], 0.9), soil[2], near(soil[2], 1.06)], 4, seed);
    speckle(p, 300, [soil[0], soil[3]]);
    const greens = ramp(0x557f2c, 4), yel = ramp(0xa2822f, 4), reds = ramp(0x83402a, 4), dead = ramp(0x75603b, 4), dark = ramp(0x3e3022, 4);
    // big leaf litter (5-9 px leaves with midribs)
    p.scatter(70, (x, y, i, r) => {
      const pal = r.pick([dead, dead, yel, reds, dark, greens]);
      leaf(p, x, y, r.next() * Math.PI, 3 + r.int(0, 2), pal, pal[0]);
    });
    p.scatter(50, (x, y, i, r) => { const pal = r.pick([dead, yel, dark]); leaf(p, x, y, r.next() * Math.PI, 2, pal, null); });
    // twigs
    p.scatter(12, (x, y, i, r) => { const a = r.next() * Math.PI; const l = 6 + r.next() * 9; p.line(x, y + 1, x + Math.cos(a) * l, y + Math.sin(a) * l + 1, 0x2a1d12); p.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 0x7a5a38); });
    // small moss cushions + seedlings
    const moss = ramp(0x4f8a2a, 4);
    p.scatter(14, (x, y, i, r) => { for (let k = 0; k < 7; k++) { const rr = 1 + r.next(); p.blob(x + r.int(-3, 3), y + r.int(-2, 2), rr, rr * 0.8, moss); } });
    p.scatter(30, (x, y, i, r) => tuft(p, x, y, [greens[0], greens[1], greens[2], greens[3]], 2));
    p.scatter(4, (x, y) => { p.set(x, y, 0xb8302a); p.set(x + 1, y, 0xe0503a); p.set(x, y + 1, 0x6e1a16); });
    return p;
  },
  dirt(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x8c6745, 5, { light: 0.16 });
    softBase(p, [near(pal[2], 0.93), pal[2], near(pal[2], 1.06)], 3, seed, { t1: 0.4, t2: 0.62 });
    speckle(p, 420, [pal[1], pal[3], pal[4]]);
    pebbles(p, 70, [ramp(0x8d857a, 4), ramp(0xa38262, 4), ramp(0x75695c, 4)], { minR: 0.9, maxR: 2.2, shadow: pal[0] });
    crackNet(p, 6, pal[0], pal[4], { min: 5, max: 11, wiggle: 0.8 });
    return p;
  },
  rock(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x84817b, 6, { light: 0.24, hueShift: 0.1 });
    softBase(p, [pal[2], pal[3], pal[2]], 2, seed, { t1: 0.38, t2: 0.62 });
    // chiseled facets: only some Voronoi edges become ridges (light) or cracks (dark)
    voronoi(p, 14, seed, (x, y, edge, rnd, bx, by) => {
      const t = tileFbm(x / S * 6, y / S * 6, 6, 2, seed + 7);
      if (edge < 1.0 && rnd > 0.25) p.set(x, y, pal[0]);
      else if (edge < 2.0 && rnd > 0.25 && (bx + by) < 0) p.set(x, y, pal[4]);
      else if (rnd < 0.3 && t > 0.6) p.set(x, y, pal[3]);
      else if (t < 0.3) p.set(x, y, pal[1]);
    });
    crackNet(p, 9, pal[0], pal[4], { min: 10, max: 26, wiggle: 0.6, branch: 0.08 });
    speckle(p, 260, [pal[1], pal[4], pal[5]]);
    const lich = [ramp(0xb9b56c, 3), ramp(0xd59443, 3), ramp(0x9db36f, 3)];
    p.scatter(9, (x, y, i, r) => { const c = r.pick(lich); for (let k = 0; k < 7; k++) p.blob(x + r.int(-3, 3), y + r.int(-2, 2), 1.2, 1, c); });
    return p;
  },
  sand(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0xdcc591, 5, { light: 0.12, hueShift: 0.1 });
    softBase(p, [near(pal[2], 0.97), pal[2], near(pal[2], 1.03)], 3, seed);
    // subtle wind ripples: thin dashed shadow lines with a lit edge above
    for (let k = 0; k < 11; k++) {
      const y0 = (k / 11) * S + p.rng.next() * 4;
      for (let x = 0; x < S; x++) {
        const y = y0 + Math.sin((x / S) * Math.PI * 2 * 2 + k) * 2.5 + tileFbm(x / S * 4, k, 4, 2, seed) * 3;
        if (tileNoise(x / 6, k * 3, Math.ceil(S / 6), seed) > 0.42) { p.set(x, y, pal[1]); p.set(x, y - 1, pal[4]); }
      }
    }
    speckle(p, 700, [pal[1], pal[4], pal[0]]);
    p.scatter(9, (x, y, i, r) => { const c = r.pick([0xf6efe4, 0xeab9a2, 0xd8cbb6]); p.set(x, y, c); p.set(x + 1, y, c); p.set(x + 1, y + 1, pal[0]); });
    return p;
  },
  mud(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x4c3b29, 5, { light: 0.16 });
    softBase(p, [near(pal[2], 0.92), pal[2], near(pal[2], 1.05)], 3, seed);
    speckle(p, 300, [pal[0], pal[3]]);
    // wet puddles with sky glint
    p.scatter(12, (x, y, i, r) => {
      const rx = 3 + r.next() * 6;
      p.disc(x, y, rx, 0x2c2218, { ry: rx * 0.5 });
      p.line(x - rx * 0.55, y - rx * 0.22, x + rx * 0.1, y - rx * 0.28, 0x8f8a86);
      p.set(x + rx * 0.3, y, 0x5a4a38);
    });
    // footprint-ish dimples
    p.scatter(20, (x, y) => { p.set(x, y, pal[0]); p.set(x + 1, y, pal[0]); p.set(x, y - 1, pal[3]); });
    return p;
  },
  snow(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = [[184, 202, 228], [210, 222, 240], [232, 239, 248], [246, 249, 253], [255, 255, 255]];
    softBase(p, [pal[2], pal[3], pal[3]], 3, seed);
    for (let k = 0; k < 9; k++) {
      const y0 = (k / 9) * S;
      for (let x = 0; x < S; x++) { const y = y0 + Math.sin(x / S * Math.PI * 4 + k * 2) * 3; if (tileNoise(x / 8, k, 16, seed) > 0.5) { p.set(x, y, pal[1]); p.set(x, y - 1, pal[4]); } }
    }
    speckle(p, 120, [pal[4], pal[1]]);
    return p;
  },
  ash(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x48423f, 5, { light: 0.14, hueShift: 0.15 });
    softBase(p, [pal[1], pal[2], pal[1]], 3, seed);
    speckle(p, 500, [pal[0], pal[3], pal[4]]);
    pebbles(p, 34, [ramp(0x2c292b, 4), ramp(0x5c4c46, 4)], { minR: 0.9, maxR: 2.2, shadow: pal[0] });
    return p;
  },
  sandstone(seed) {
    const p = new PixelPainter(S, S, seed);
    const cols = [0xb9583b, 0xd27d4b, 0xe6a86d, 0xc76c45, 0xab4c36, 0xdd9c64, 0xf0c48c, 0xc0623f];
    // horizontal strata of varying thickness
    const bounds = [];
    let yy = 0;
    while (yy < S) { const t = 4 + Math.floor(p.rng.next() * 10); bounds.push([yy, Math.min(S, yy + t), cols[bounds.length % cols.length]]); yy += t; }
    for (let x = 0; x < S; x++) {
      const wav = Math.round(Math.sin((x / S) * Math.PI * 2) * 1.5 + (tileFbm(x / S * 4, 0.5, 4, 2, seed) - 0.5) * 3);
      for (let y = 0; y < S; y++) {
        const yw = (y + wav + S) % S;
        let band = bounds[0];
        for (const b of bounds) if (yw >= b[0] && yw < b[1]) band = b;
        const pal = ramp(band[2], 4, { light: 0.12 });
        const streak = tileNoise(x / 7, y / 1.5, Math.ceil(S / 7), seed + 3);
        let c = streak > 0.68 ? pal[3] : streak < 0.3 ? pal[1] : pal[2];
        if (yw === band[0]) c = pal[3]; // lit top edge of each layer
        if (yw === band[1] - 1) c = pal[0]; // shadowed underside
        p.set(x, y, c);
      }
    }
    // vertical joints + erosion pockets
    crackNet(p, 10, 0x6a2c1e, null, { angle: Math.PI / 2, spread: 0.3, min: 4, max: 12, wiggle: 0.3 });
    p.scatter(14, (x, y, i, r) => { const rr = 1 + r.next() * 1.5; p.disc(x, y, rr, 0x7a3423, { ry: rr * 0.7 }); p.set(x - 1, y - 1, 0xf3c38c); });
    return p;
  },
  moss(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x4f8f2c, 6, { light: 0.22 });
    softBase(p, [pal[0], pal[1], pal[1]], 4, seed);
    p.scatter(330, (x, y, i, r) => { const rr = 1.2 + r.next() * 1.8; p.blob(x, y, rr, rr * 0.8, pal.slice(1, 5)); });
    p.scatter(20, (x, y) => { p.set(x, y, 0xcfe07a); p.set(x, y - 1, 0x7aa83b); });
    return p;
  },
  gravel(seed) {
    const p = new PixelPainter(S, S, seed);
    const base = ramp(0x6c6357, 4);
    softBase(p, [base[1], base[1], base[2]], 4, seed);
    pebbles(p, 380, [ramp(0x908b84, 4), ramp(0x9c8870, 4), ramp(0x737679, 4), ramp(0xb3a58e, 4)], { minR: 1.5, maxR: 3.6, shadow: 0x3d3934 });
    return p;
  },
  drygrass(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0xa79a4f, 6, { light: 0.2 });
    softBase(p, [pal[1], pal[2], pal[1]], 3, seed);
    p.scatter(500, (x, y, i, r) => tuft(p, x, y, [pal[0], pal[1], pal[2], pal[3]], 2 + r.int(0, 2)));
    p.scatter(300, (x, y, i, r) => tuft(p, x, y, [pal[1], pal[3], pal[4], pal[5]], 3 + r.int(0, 1)));
    speckle(p, 40, [0x6b5a2e]);
    return p;
  },
  needles(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x6b4329, 5, { light: 0.15 });
    softBase(p, [pal[1], pal[2], pal[1]], 3, seed);
    const nc = [0x9c5b2f, 0xba763e, 0x7e4b27, 0xcb8f51, 0x5c3820];
    p.scatter(560, (x, y, i, r) => { const a = r.next() * Math.PI; const l = 3 + r.next() * 3; p.line(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, r.pick(nc)); });
    p.scatter(5, (x, y, i, r) => { p.blob(x, y, 2.6, 3.4, ramp(0x7a5230, 4), { outline: 0x3a2414 }); });
    return p;
  },
  redsand(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0xc87747, 5, { light: 0.14 });
    softBase(p, [near(pal[2], 0.96), pal[2], near(pal[2], 1.04)], 3, seed);
    for (let k = 0; k < 10; k++) {
      const y0 = (k / 10) * S + p.rng.next() * 4;
      for (let x = 0; x < S; x++) {
        const y = y0 + Math.sin((x / S) * Math.PI * 2 * 2 + k * 1.7) * 3 + tileFbm(x / S * 4, k, 4, 2, seed) * 3;
        if (tileNoise(x / 5, k * 3, Math.ceil(S / 5), seed) > 0.45) { p.set(x, y, pal[1]); p.set(x, y - 1, pal[4]); }
      }
    }
    speckle(p, 600, [pal[1], pal[4], pal[0]]);
    pebbles(p, 14, [ramp(0x9e4d32, 4), ramp(0xd99a6a, 4)], { minR: 0.9, maxR: 1.8, shadow: pal[0] });
    return p;
  },
  basalt(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x3d393b, 6, { light: 0.18, hueShift: 0.2 });
    voronoi(p, 18, seed, (x, y, edge, rnd, bx, by) => {
      const shade = 1 + Math.floor(rnd * 3);
      let c = pal[shade];
      if (edge < 1.3) c = pal[0];
      else if (edge < 2.4 && bx + by < 0) c = pal[Math.min(5, shade + 2)];
      else if (tileNoise(x / 3, y / 3, Math.ceil(S / 3), seed) > 0.8) c = pal[shade + 1];
      p.set(x, y, c);
    });
    speckle(p, 160, [pal[4], pal[1]]);
    p.scatter(10, (x, y) => { p.set(x, y, 0x93422a); p.set(x + 1, y, 0x5a2a20); });
    return p;
  },
  clay(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0xa38d74, 5, { light: 0.14 });
    softBase(p, [pal[2], pal[3], pal[2]], 3, seed);
    voronoi(p, 26, seed, (x, y, edge, rnd, bx, by) => {
      if (edge < 1.1) p.set(x, y, pal[0]);
      else if (edge < 2.1 && bx + by < 0) p.set(x, y, pal[4]);
    });
    speckle(p, 220, [pal[1], pal[4]]);
    p.scatter(22, (x, y) => { p.set(x, y, 0x5b5f66); p.set(x - 1, y - 1, 0xc9ced6); });
    return p;
  },
  // side-projection cliff: wavy bedding planes, sparse slanted joints,
  // weathered patches, water stains and moss on the ledges (tiles in x and y)
  cliff(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x837f78, 6, { light: 0.24, hueShift: 0.1 });
    const r = p.rng;
    const bounds = [];
    let y = 0;
    while (y < S - 8) {
      bounds.push({ y, amp: y === 0 ? 0 : 1 + r.next() * 2.6, cyc: 1 + Math.floor(r.next() * 3), ph: r.next() * 6.283, shade: 1 + Math.floor(r.next() * 3), joints: r.next() < 0.6 });
      y += 10 + Math.floor(r.next() * 32);
    }
    bounds.push({ y: S, amp: 0, cyc: 1, ph: 0 });
    const by = (b, x) => b.y + Math.round(Math.sin((x / S) * Math.PI * 2 * b.cyc + b.ph) * b.amp);
    for (const b of bounds) {
      b.js = [];
      if (!b.joints) continue;
      let x = Math.floor(r.next() * 24);
      while (x < S - 6) { b.js.push({ x, slant: (r.next() - 0.5) * 0.7 }); x += 20 + Math.floor(r.next() * 40); }
    }
    for (let x = 0; x < S; x++) {
      for (let k = 0; k < bounds.length - 1; k++) {
        const b = bounds[k], y0 = by(b, x), y1 = by(bounds[k + 1], x);
        for (let yy = y0; yy < y1; yy++) {
          const n = tileFbm((x / S) * 8, (yy / S) * 8, 8, 2, seed);
          const big = tileFbm((x / S) * 2, (yy / S) * 2, 2, 3, seed + 7);
          let c = pal[Math.max(0, Math.min(5, b.shade + (n > 0.62 ? 1 : n < 0.36 ? -1 : 0) + (big < 0.32 ? -1 : 0)))];
          if (yy === y0) c = pal[Math.min(5, b.shade + 2)];
          else if (yy === y0 + 1 && n > 0.4) c = pal[Math.min(5, b.shade + 1)];
          if (yy >= y1 - 2) c = pal[0];
          for (const j of b.js) {
            const jx = Math.round(j.x + (yy - y0) * j.slant + Math.sin(yy * 0.5 + j.x) * 0.7);
            if (x === jx) c = pal[0];
            else if (x === jx + 1) c = pal[Math.min(5, b.shade + 1)];
          }
          p.set(x, yy, c);
        }
      }
    }
    // moss and grass along the ledge lips
    const g = ramp(0x5a8a33, 4);
    for (let k = 1; k < bounds.length - 1; k++) {
      const b = bounds[k];
      for (let x = 0; x < S; x++) {
        if (tileNoise(x / 6, k * 3.1, Math.ceil(S / 6), seed + k) < 0.58) continue;
        const yy = by(b, x);
        p.set(x, yy, g[2]);
        if (r.next() < 0.55) p.set(x, yy - 1, g[3]);
        if (r.next() < 0.3) p.set(x, yy + 1, g[0]);
      }
    }
    // dark water stains running down
    p.scatter(7, (sx, sy, i, rr) => { const len = 20 + rr.next() * 50; for (let k = 0; k < len; k++) p.mul(sx + Math.round(Math.sin(k * 0.2) * 0.6), sy + k, 0.82); });
    speckle(p, 200, [pal[1], pal[4]]);
    const lich = [ramp(0xb9b56c, 3), ramp(0xd59443, 3)];
    p.scatter(6, (x, yy, i, rr) => { const c = rr.pick(lich); for (let k = 0; k < 6; k++) p.blob(x + rr.int(-3, 3), yy + rr.int(-2, 2), 1.2, 1, c); });
    return p;
  },
  basaltcols(seed) {
    const p = new PixelPainter(S, S, seed);
    const pal = ramp(0x3e3a3c, 6, { light: 0.2, hueShift: 0.2 });
    let x = 0;
    while (x < S) {
      const w = 7 + Math.floor(p.rng.next() * 8);
      const shade = 1 + Math.floor(p.rng.next() * 3);
      const breaks = [];
      for (let k = 0; k < 4; k++) breaks.push(Math.floor(p.rng.next() * S));
      for (let xx = x; xx < Math.min(S, x + w); xx++) for (let y = 0; y < S; y++) {
        let c = pal[shade];
        if (xx === x) c = pal[0];
        else if (xx === x + 1) c = pal[Math.min(5, shade + 2)];
        else if (xx === x + w - 1) c = pal[Math.max(0, shade - 1)];
        if (breaks.some((b) => Math.abs(y - b) < 1)) c = pal[0];
        else if (breaks.some((b) => y - b === 1)) c = pal[Math.min(5, shade + 1)];
        if (tileNoise(xx / 3, y / 3, Math.ceil(S / 3), seed) > 0.82) c = pal[shade + 1];
        p.set(xx, y, c);
      }
      x += w;
    }
    p.scatter(10, (sx, sy) => { p.set(sx, sy, 0x93422a); });
    return p;
  },
};

export const TERRAIN_ROUGHNESS = {
  grass: 0.92, jungle: 0.9, dirt: 0.95, rock: 0.82, sand: 0.95, mud: 0.45, snow: 0.6, ash: 0.95,
  sandstone: 0.88, moss: 0.9, gravel: 0.8, drygrass: 0.95, needles: 0.95, redsand: 0.95, basalt: 0.7, clay: 0.9, cliff: 0.85, basaltcols: 0.7,
};

export function buildTerrainTextures() {
  const ps = MAT_NAMES.map((name, i) => painters[name](1000 + i * 37));
  const albedo = makeArrayTexture(ps);
  // normal maps from luminance
  const normals = ps.map((p) => {
    const n = new PixelPainter(S, S);
    const w = S, h = S;
    const lum = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = p.get(x, y); lum[y * w + x] = (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
    const L = (x, y) => lum[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * 2.2, dy = (L(x, y + 1) - L(x, y - 1)) * 2.2;
      const len = Math.hypot(dx, dy, 1);
      n.set(x, y, [(-dx / len * 0.5 + 0.5) * 255, (-dy / len * 0.5 + 0.5) * 255, (1 / len * 0.5 + 0.5) * 255]);
    }
    return n;
  });
  const normal = makeArrayTexture(normals, { srgb: false });
  const rough = MAT_NAMES.map((n) => TERRAIN_ROUGHNESS[n]);
  return { albedo, normal, rough, painters: ps };
}

export { painters as terrainPainters, mixRgb, tileNoise };
