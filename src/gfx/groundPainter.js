// GroundPainter: paints seamless ground tiles (soil, litter, stones, cracks,
// puddles) into colour, height and roughness buffers. Everything wraps
// around the tile edges, so the result tiles without seams. The height is
// what the normal map and the height-blend between ground types are made from.
import { RNG, tileFbm } from '../core/rng.js';
import { cell } from './paint.js';

export const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sst = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };

export class GroundPainter {
  constructor(S, seed) {
    this.S = S;
    this.w = S; this.h = S;
    this.seed = seed;
    this.rng = new RNG(seed);
    this.col = new Float32Array(S * S * 3);
    this.hgt = new Float32Array(S * S).fill(0.3);
    this.rough = new Float32Array(S * S).fill(0.9);
    this._cache = new Map();
  }
  wrap(v) { const S = this.S; return ((v % S) + S) % S; }
  at(x, y) { return this.wrap(Math.round(y)) * this.S + this.wrap(Math.round(x)); }
  // tileable fractal noise over the tile (period = features across the tile), cached
  fbm(period, oct = 4, seed = 0) {
    const key = `f${period}:${oct}:${seed}`;
    let a = this._cache.get(key);
    if (a) return a;
    const S = this.S;
    a = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) a[y * S + x] = tileFbm((x / S) * period, (y / S) * period, period, oct, this.seed * 7 + seed);
    this._cache.set(key, a);
    return a;
  }
  // tileable cellular noise: f1, f2 (in cell units) and the nearest cell's id.
  // warp (in cells) bends the cell borders so they never look like paving.
  worley(n, seed = 0, warp = 0) {
    const key = `w${n}:${seed}:${warp}`;
    let w = this._cache.get(key);
    if (w) return w;
    const S = this.S;
    const wa = warp ? this.fbm(4, 3, seed + 501) : null, wb = warp ? this.fbm(4, 3, seed + 502) : null;
    w = { f1: new Float32Array(S * S), f2: new Float32Array(S * S), id: new Float32Array(S * S) };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let u = x / S, v = y / S;
      if (warp) { u += ((wa[i] - 0.5) * warp) / n; v += ((wb[i] - 0.5) * warp) / n; u -= Math.floor(u); v -= Math.floor(v); }
      const c = cell(u, v, n, n, this.seed * 13 + seed);
      w.f1[i] = c.f1; w.f2[i] = c.f2; w.id[i] = c.id;
    }
    this._cache.set(key, w);
    return w;
  }
  // per-pixel base pass: fn(x, y, i) -> { c: [r,g,b], h, r }
  base(fn) {
    const S = this.S;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x, o = fn(x, y, i);
      this.col[i * 3] = o.c[0]; this.col[i * 3 + 1] = o.c[1]; this.col[i * 3 + 2] = o.c[2];
      if (o.h !== undefined) this.hgt[i] = o.h;
      if (o.r !== undefined) this.rough[i] = o.r;
    }
  }
  getCol(i) { return [this.col[i * 3], this.col[i * 3 + 1], this.col[i * 3 + 2]]; }
  blend(i, c, a) {
    if (a <= 0) return;
    const k = i * 3;
    this.col[k] += (c[0] - this.col[k]) * a; this.col[k + 1] += (c[1] - this.col[k + 1]) * a; this.col[k + 2] += (c[2] - this.col[k + 2]) * a;
  }
  shade(i, f) { const k = i * 3; this.col[k] *= f; this.col[k + 1] *= f; this.col[k + 2] *= f; }

  // A rounded lump lying on the ground: stone, clod, pebble, cushion.
  // r: radius px, sq: ry/rx, rot: radians. o: { col, h (dome height), rough,
  //   ao (contact shadow), lumpy (outline wobble), shine (top lighter), sink (blend into base height) }
  blob(cx, cy, r, sq, rot, o) {
    const ry = r * sq, R = Math.max(r, ry) * 1.45 + 2;
    const ca = Math.cos(rot), sa = Math.sin(rot);
    const lumpy = o.lumpy ?? 0.15, ph = this.rng.next() * 6.28, ph2 = this.rng.next() * 6.28;
    const h = o.h ?? 0.2, ao = o.ao ?? 0.3, shine = o.shine ?? 0.12, alpha = o.alpha ?? 1;
    const base = o.sink !== undefined ? o.sink : null;
    const vary = o.vary ?? 0.08;
    const col = o.col;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x - cx, dy = y - cy;
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      const ang = Math.atan2(ly, lx);
      const wob = 1 + lumpy * (Math.sin(ang * 3 + ph) * 0.6 + Math.sin(ang * 5 + ph2) * 0.4);
      const d = Math.hypot(lx / r, ly / ry) / wob;
      const i = this.at(x, y);
      if (d < 1) {
        const cov = clamp01((1 - d) * Math.min(r, ry) * 1.2) * alpha;
        const dome = Math.sqrt(Math.max(0, 1 - d * d));
        // light from the top-left a touch, darker underside, small grain
        const lit = 1 + shine * (dome - 0.5) - shine * 0.6 * (lx * 0.5 + ly * 0.7) / Math.max(r, 1) * 0.5;
        const g = 1 + (this.rng.next() - 0.5) * vary;
        this.blend(i, mulc(col, lit * g), cov);
        const hh = (base ?? this.hgt[i]) + h * dome;
        if (hh > this.hgt[i]) this.hgt[i] = this.hgt[i] + (hh - this.hgt[i]) * cov;
        if (o.rough !== undefined) this.rough[i] += (o.rough - this.rough[i]) * cov;
      } else if (ao > 0 && d < 1.45) {
        // contact shadow ring
        const t = (d - 1) / 0.45;
        this.shade(i, 1 - ao * (1 - t) * (1 - t) * alpha);
      }
    }
  }
  // A tapered stroke: grass blade, pine needle, twig, root. o: { c0, c1 (tip), w0, w1 (px), h, rough, bend, ao }
  stroke(x, y, len, ang, o) {
    const steps = Math.max(2, Math.ceil(len * 1.5));
    const bend = o.bend ?? 0;
    let px = x, py = y, a = ang;
    const w0 = o.w0 ?? 1, w1 = o.w1 ?? 0.4, h = o.h ?? 0.15;
    // soft shadow beside the stroke first (light from the top-left)
    if (o.ao) this.stroke(x + 1.2, y + 1.2, len, ang, { c0: [0, 0, 0], w0: w0 + 1, w1: w1 + 1, h: 0, alpha: o.ao, bend, hBase: -1 });
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const w = w0 + (w1 - w0) * t;
      const c = o.c1 ? mixc(o.c0, o.c1, t) : o.c0;
      const R = w * 0.5 + 1;
      for (let yy = Math.floor(py - R); yy <= Math.ceil(py + R); yy++) for (let xx = Math.floor(px - R); xx <= Math.ceil(px + R); xx++) {
        const d = Math.hypot(xx - px, yy - py);
        const cov = clamp01(w * 0.5 + 0.5 - d);
        if (cov <= 0) continue;
        const i = this.at(xx, yy);
        this.blend(i, c, cov * (o.alpha ?? 1));
        const hh = (o.hBase ?? this.hgt[i]) + h * (1 - d / (w * 0.5 + 0.5)) * (o.hTaper ? 1 - t * 0.6 : 1);
        if (hh > this.hgt[i]) this.hgt[i] += (hh - this.hgt[i]) * cov;
        if (o.rough !== undefined) this.rough[i] += (o.rough - this.rough[i]) * cov;
      }
      a += bend / steps;
      px += Math.cos(a) * (len / steps); py += Math.sin(a) * (len / steps);
    }
  }
  // A fallen leaf: pointed ellipse with a midrib, curled edges a little higher.
  leaf(cx, cy, len, wid, ang, o) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const R = len + 2;
    const col = o.col, rib = o.rib ?? mulc(col, 0.8), h = o.h ?? 0.08;
    const g = 1 + (this.rng.next() - 0.5) * 0.2;
    const curl = this.rng.next() < 0.5;
    // shadow edge under the leaf
    if (o.ao !== 0) this.blobShadow(cx + 1, cy + 1.2, len * 0.9, wid * 1.1, ang, o.ao ?? 0.18);
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x - cx, dy = y - cy;
      const u = (dx * ca + dy * sa) / len, v = (-dx * sa + dy * ca) / wid;
      if (Math.abs(u) > 1) continue;
      const half = Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.25 * u); // fuller near the stem end
      const e = Math.abs(v) / Math.max(1e-3, half);
      if (e > 1.15) continue;
      const cov = clamp01((1 - e) * wid * 1.2 + 0.4);
      if (cov <= 0) continue;
      const i = this.at(x, y);
      const ribK = Math.abs(v) < 0.18 ? 0.7 : 0;
      let c = mulc(col, g * (0.92 + 0.12 * (v < 0 ? 1 : 0)));
      if (ribK) c = mixc(c, rib, ribK);
      this.blend(i, c, cov * (o.alpha ?? 1));
      const hh = this.hgt[i] + h * (curl ? 0.6 + 0.6 * e : 1 - 0.3 * e);
      this.hgt[i] += (hh - this.hgt[i]) * cov;
      if (o.rough !== undefined) this.rough[i] += (o.rough - this.rough[i]) * cov;
    }
  }
  blobShadow(cx, cy, rx, ry, ang, k) {
    const ca = Math.cos(ang), sa = Math.sin(ang), R = Math.max(rx, ry) + 2;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x - cx, dy = y - cy;
      const d = Math.hypot((dx * ca + dy * sa) / rx, (-dx * sa + dy * ca) / ry);
      if (d > 1.2 || d < 0.85) continue;
      const i = this.at(x, y);
      this.shade(i, 1 - k * (1 - Math.abs(d - 1) / 0.2));
    }
  }
  // A crack: wandering line pressed into the ground. o: { w, depth, col, wiggle, branch, lip }
  // The line is rasterised into a coverage mask first and applied once, so
  // overlapping steps never darken twice.
  crack(x, y, len, ang, o = {}) {
    const S = this.S;
    if (!this._cm) { this._cm = new Float32Array(S * S); this._lm = new Float32Array(S * S); }
    const cm = this._cm, lm = this._lm, touched = [];
    const r = this.rng;
    const walk = (x0, y0, len0, a0, w) => {
      let a = a0, px = x0, py = y0;
      const wig = o.wiggle ?? 0.5;
      for (let s = 0; s < len0; s++) {
        const t = s / len0, ww = w * (1 - Math.abs(t - 0.5) * 1.2) + 0.35;
        const R = ww + 2;
        for (let yy = Math.floor(py - R); yy <= Math.ceil(py + R); yy++) for (let xx = Math.floor(px - R); xx <= Math.ceil(px + R); xx++) {
          const d = Math.hypot(xx - px, yy - py), i = this.at(xx, yy);
          const cov = clamp01(ww + 0.5 - d);
          const lip = o.lip ? clamp01(1 - (d - ww - 0.5) / 1.3) * (d > ww + 0.5 ? 1 : 0) : 0;
          if (cov <= 0 && lip <= 0) continue;
          if (cm[i] === 0 && lm[i] === 0) touched.push(i);
          if (cov > cm[i]) cm[i] = cov;
          if (lip > lm[i]) lm[i] = lip;
        }
        a += (r.next() - 0.5) * wig;
        px += Math.cos(a); py += Math.sin(a);
        if (o.branch && r.next() < o.branch) walk(px, py, len0 * (0.25 + r.next() * 0.3), a + (r.next() < 0.5 ? 1 : -1) * (0.7 + r.next() * 0.6), w * 0.6);
      }
    };
    walk(x, y, len, ang, o.w ?? 1);
    const depth = o.depth ?? 0.25;
    for (const i of touched) {
      const c = cm[i];
      if (c > 0) {
        if (o.col) this.blend(i, o.col, c * 0.85); else this.shade(i, 1 - 0.45 * c);
        this.hgt[i] -= depth * c;
      }
      if (o.lip && lm[i] > 0) this.shade(i, 1 + o.lip * lm[i] * (1 - c));
      cm[i] = 0; lm[i] = 0;
    }
  }
  // A puddle: flattened, darker, glassy. o: { col, level (height of the water), rough }
  puddle(cx, cy, r, o = {}) {
    const R = r * 1.6 + 2, ph = this.rng.next() * 6.28;
    const lvl = o.level ?? 0.18;
    for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x - cx, dy = (y - cy) * 1.4;
      const ang = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy) / (r * (1 + 0.25 * Math.sin(ang * 3 + ph) + 0.12 * Math.sin(ang * 7 + ph * 2)));
      if (d > 1.25) continue;
      const i = this.at(x, y);
      if (d < 1) {
        const cov = clamp01((1 - d) * r * 0.6);
        const deep = sst(1, 0.3, d);
        this.blend(i, o.col ?? [0.16, 0.14, 0.12], cov * (0.55 + 0.4 * deep));
        this.hgt[i] += (Math.min(this.hgt[i], lvl) - this.hgt[i]) * cov;
        this.rough[i] += ((o.rough ?? 0.06) - this.rough[i]) * cov;
      } else {
        // wet muddy rim
        const t = (d - 1) / 0.25;
        this.shade(i, 0.82 + 0.18 * t);
        this.rough[i] = Math.min(this.rough[i], 0.4 + 0.5 * t);
      }
    }
  }
  // Packs colour + roughness (alpha) for the albedo array and keeps the height.
  finish() {
    const S = this.S, data = new Uint8Array(S * S * 4);
    for (let i = 0; i < S * S; i++) {
      data[i * 4] = clamp01(this.col[i * 3]) * 255;
      data[i * 4 + 1] = clamp01(this.col[i * 3 + 1]) * 255;
      data[i * 4 + 2] = clamp01(this.col[i * 3 + 2]) * 255;
      data[i * 4 + 3] = clamp01(this.rough[i]) * 255;
    }
    this.data = data;
    return this;
  }
}

// normal map (rgb) + height (a) from a painter's height buffer
export function normalFromHeight(p, strength = 3) {
  const S = p.S, h = p.hgt, out = new Uint8Array(S * S * 4);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < S * S; i++) { if (h[i] < lo) lo = h[i]; if (h[i] > hi) hi = h[i]; }
  const span = Math.max(1e-4, hi - lo);
  const H = (x, y) => h[(((y % S) + S) % S) * S + (((x % S) + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // Sobel for smoother normals
    const tl = H(x - 1, y - 1), t = H(x, y - 1), tr = H(x + 1, y - 1), l = H(x - 1, y), r = H(x + 1, y), bl = H(x - 1, y + 1), b = H(x, y + 1), br = H(x + 1, y + 1);
    const dx = ((tr + 2 * r + br) - (tl + 2 * l + bl)) * strength * 0.25;
    const dy = ((bl + 2 * b + br) - (tl + 2 * t + tr)) * strength * 0.25;
    const len = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    out[i] = (-dx / len * 0.5 + 0.5) * 255;
    out[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
    out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
    out[i + 3] = ((h[y * S + x] - lo) / span) * 255;
  }
  return { w: S, h: S, data: out };
}
