// Painted ground materials. Each is a 256x256 tile covering 4 m (64 px per
// metre) with colour + roughness (alpha) and a normal map + height (alpha)
// built from the painted relief: clods, stones, leaf litter, needles, cracks,
// puddles. A shared 1 m detail tile adds grit up close.
import * as THREE from 'three';
import { GroundPainter, normalFromHeight, hex, mixc, mulc, sst } from './groundPainter.js';
import { MAT_NAMES } from '../world/gen.js';

const S = 256;
const STONES = [0x8c867d, 0x9e9486, 0x6f6a63, 0xa48b6c, 0x857059, 0x5d5853, 0x8f6d5d, 0xb0a596].map(hex);
const STRAW = [0xb39a5c, 0x9c8550, 0x7e6a42, 0xc2ab6c].map(hex);
const pick = (r, a) => a[Math.floor(r.next() * a.length)];
const rnd = (r, a, b) => a + r.next() * (b - a);

function stones(p, n, rMin, rMax, o = {}) {
  const r = p.rng, S = p.S;
  for (let k = 0; k < n; k++) {
    p.blob(r.next() * S, r.next() * S, rnd(r, rMin, rMax), rnd(r, 0.55, 0.95), r.next() * 6.28, {
      col: mulc(pick(r, o.cols ?? STONES), rnd(r, 0.85, 1.1)), h: rnd(r, o.h0 ?? 0.12, o.h1 ?? 0.24), ao: o.ao ?? 0.35, rough: o.rough ?? 0.7, shine: 0.28, lumpy: o.lumpy ?? 0.14,
    });
  }
}
function twigs(p, n, o = {}) {
  const r = p.rng, S = p.S;
  for (let k = 0; k < n; k++) p.stroke(r.next() * S, r.next() * S, rnd(r, o.l0 ?? 10, o.l1 ?? 24), r.next() * 6.28, { c0: hex(o.c0 ?? 0x4e3a28), c1: hex(o.c1 ?? 0x705238), w0: o.w ?? 1.6, w1: (o.w ?? 1.6) * 0.65, h: 0.14, bend: rnd(r, -0.6, 0.6), ao: 0.35, rough: 0.85 });
}
function blades(p, n, cols, o = {}) {
  const r = p.rng, S = p.S;
  for (let k = 0; k < n; k++) {
    const c = pick(r, cols);
    p.stroke(r.next() * S, r.next() * S, rnd(r, o.l0 ?? 3, o.l1 ?? 8), r.next() * 6.28, { c0: mulc(c, o.root ?? 0.7), c1: c, w0: o.w0 ?? 1.2, w1: o.w1 ?? 0.35, h: o.h ?? 0.07, bend: rnd(r, -0.7, 0.7), ao: o.ao ?? 0.12, hTaper: true });
  }
}
function leaves(p, n, cols, o = {}) {
  const r = p.rng, S = p.S;
  for (let k = 0; k < n; k++) {
    const len = rnd(r, o.l0 ?? 3.5, o.l1 ?? 8);
    const c = mulc(pick(r, cols), rnd(r, 0.85, 1.12));
    p.leaf(r.next() * S, r.next() * S, len, len * rnd(r, 0.32, 0.55), r.next() * 6.28, { col: c, rib: mulc(c, 0.72), h: 0.06, ao: o.ao ?? 0.2 });
  }
}

const painters = {
  // short meadow turf seen from above: blades in every direction over dark soil
  grass(p) {
    const r = p.rng;
    const f2 = p.fbm(2, 4, 1), f6 = p.fbm(6, 4, 2), f20 = p.fbm(20, 3, 3), f48 = p.fbm(48, 2, 4);
    const soil = hex(0x4a3a26), dark = hex(0x2b4419), mid = hex(0x426a26), lite = hex(0x6c9636), yel = hex(0x93a23e);
    p.base((x, y, i) => {
      let c = mixc(dark, mid, sst(0.3, 0.72, f6[i]));
      c = mixc(c, soil, sst(0.66, 0.8, f20[i]) * 0.55);
      c = mulc(c, 0.9 + (f48[i] - 0.5) * 0.2);
      return { c, h: 0.25 + f6[i] * 0.1 + f48[i] * 0.04, r: 0.88 };
    });
    // the tint of the blades drifts in patches: lush, yellowed, bluish
    const S = p.S;
    for (let k = 0; k < 2600; k++) {
      const x = r.next() * S, y = r.next() * S, i = p.at(x, y);
      const patch = f2[i];
      const c = mixc(mixc(mid, lite, r.next()), yel, sst(0.62, 0.8, patch) * r.next());
      p.stroke(x, y, rnd(r, 3, 8), r.next() * 6.28, { c0: mulc(c, 0.62), c1: mulc(c, rnd(r, 0.92, 1.15)), w0: 1.3, w1: 0.35, h: 0.07, bend: rnd(r, -0.8, 0.8), ao: 0.1, hTaper: true });
    }
    // clover and tiny flowers
    for (let k = 0; k < 26; k++) {
      const x = r.next() * S, y = r.next() * S;
      for (let q = 0; q < 3; q++) { const a = q * 2.09 + r.next(); p.blob(x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, 1.4, 0.9, a, { col: hex(0x5e9a34), h: 0.08, ao: 0.15, lumpy: 0 }); }
    }
    for (let k = 0; k < 12; k++) p.blob(r.next() * S, r.next() * S, 1.1, 1, 0, { col: hex(r.next() < 0.6 ? 0xf2efe0 : 0xf2cf4a), h: 0.1, ao: 0.1, lumpy: 0 });
    return p;
  },
  // forest floor: dark humus buried in leaf litter, twigs, roots and moss
  jungle(p) {
    const r = p.rng, S = p.S;
    const f3 = p.fbm(3, 4, 1), f12 = p.fbm(12, 4, 2), f40 = p.fbm(40, 2, 3);
    const A = hex(0x46331f), B = hex(0x5a412a), C = hex(0x35271a);
    p.base((x, y, i) => {
      let c = mixc(A, B, sst(0.3, 0.7, f3[i]));
      c = mixc(c, C, sst(0.6, 0.8, f12[i]) * 0.6);
      return { c: mulc(c, 0.9 + (f40[i] - 0.5) * 0.25), h: 0.22 + f12[i] * 0.1 + f40[i] * 0.05, r: 0.9 };
    });
    // roots snaking across
    for (let k = 0; k < 3; k++) p.stroke(r.next() * S, r.next() * S, rnd(r, 50, 90), r.next() * 6.28, { c0: hex(0x553d2a), c1: hex(0x6a4c33), w0: 3, w1: 1.4, h: 0.3, bend: rnd(r, -2, 2), ao: 0.45, rough: 0.8 });
    const litter = [0x6e4e2e, 0x8c6c34, 0x6e3a22, 0x4e5e2a, 0x3d2c1a, 0x9a7e3a, 0x5e4228, 0x7a5228].map(hex);
    leaves(p, 300, litter, { l0: 4, l1: 9 });
    twigs(p, 16);
    leaves(p, 160, litter, { l0: 3, l1: 6.5 });
    // moss cushions and seedlings
    for (let k = 0; k < 12; k++) {
      const x = r.next() * S, y = r.next() * S;
      for (let q = 0; q < 8; q++) p.blob(x + rnd(r, -5, 5), y + rnd(r, -4, 4), rnd(r, 1.4, 3), 0.8, r.next() * 6, { col: mulc(hex(0x4c7a2a), rnd(r, 0.8, 1.2)), h: 0.12, ao: 0.25, lumpy: 0.25 });
    }
    for (let k = 0; k < 10; k++) {
      const x = r.next() * S, y = r.next() * S;
      for (let q = 0; q < 3; q++) p.leaf(x + rnd(r, -1, 1), y + rnd(r, -1, 1), 2.6, 1.3, q * 2.1 + r.next(), { col: hex(0x6aa03a), h: 0.08, ao: 0.15 });
    }
    return p;
  },
  // bare earth: clods, grit, stones, cracks, damp patches, straw and twigs
  dirt(p) {
    const r = p.rng, S = p.S;
    const f3 = p.fbm(3, 5, 1), f8 = p.fbm(8, 4, 2), f24 = p.fbm(24, 3, 3), f64 = p.fbm(64, 2, 4), damp = p.fbm(2, 4, 5);
    const A = hex(0x6f5137), B = hex(0x553c2b), C = hex(0x83603f), G = hex(0x7d7262), D = hex(0x3a291e);
    const dust = p.fbm(3, 4, 6);
    p.base((x, y, i) => {
      let c = mixc(A, C, sst(0.35, 0.7, f3[i]));
      c = mixc(c, G, sst(0.5, 0.75, dust[i]) * 0.65);
      c = mixc(c, B, sst(0.6, 0.85, f24[i]) * 0.6);
      c = mulc(c, 0.86 + 0.28 * f24[i] + (f64[i] - 0.5) * 0.2);
      const wet = sst(0.58, 0.72, damp[i]);
      c = mixc(c, D, wet * 0.5);
      return { c, h: 0.3 + f8[i] * 0.14 + f24[i] * 0.08 + f64[i] * 0.05, r: 0.95 - wet * 0.25 };
    });
    for (let k = 0; k < 160; k++) {
      const x = r.next() * S, y = r.next() * S;
      p.blob(x, y, rnd(r, 2.5, 8), rnd(r, 0.6, 0.95), r.next() * 6.28, { col: mulc(p.getCol(p.at(x, y)), rnd(r, 0.92, 1.18)), h: rnd(r, 0.1, 0.24), ao: 0.3, lumpy: 0.32, shine: 0.16, vary: 0.14 });
    }
    for (let k = 0; k < 10; k++) p.crack(r.next() * S, r.next() * S, rnd(r, 18, 56), r.next() * 6.28, { w: 0.8, depth: 0.14, col: D, wiggle: 0.32, branch: 0.05, lip: 0.08 });
    stones(p, 320, 0.8, 2.6);
    stones(p, 18, 3.5, 7.5, { h0: 0.28, h1: 0.4, ao: 0.42 });
    for (let k = 0; k < 70; k++) { const c = pick(r, STRAW); p.stroke(r.next() * S, r.next() * S, rnd(r, 4, 11), r.next() * 6.28, { c0: mulc(c, 0.78), c1: c, w0: 0.9, w1: 0.5, h: 0.06, bend: rnd(r, -0.5, 0.5), ao: 0.25 }); }
    twigs(p, 8);
    // trodden dimples
    for (let k = 0; k < 10; k++) p.puddle(r.next() * S, r.next() * S, rnd(r, 2, 4), { col: mulc(A, 0.7), level: 0.22, rough: 0.8 });
    return p;
  },
  // weathered bedrock seen from above: big slabs, joints only partly open,
  // soil and grit lodged in them, pits, lichen
  rock(p) {
    const r = p.rng, S = p.S;
    const W = p.worley(3, 1, 1.6), W2 = p.worley(9, 2, 1.2), f4 = p.fbm(4, 4, 2), f16 = p.fbm(16, 3, 3), f60 = p.fbm(60, 2, 4), open = p.fbm(5, 3, 5);
    const greys = [0x8a8680, 0x96907f, 0x7c7d80, 0x8e8577].map(hex);
    const soil = hex(0x4c3a2a);
    p.base((x, y, i) => {
      const e = W.f2[i] - W.f1[i], e2 = W2.f2[i] - W2.f1[i];
      const g = Math.floor(W.id[i] * 3.999);
      let c = mixc(greys[g], greys[(g + 1) % 4], f4[i] * 0.7);
      c = mulc(c, 0.82 + 0.3 * f16[i] + (f60[i] - 0.5) * 0.16);
      const gap = (1 - sst(0.015, 0.06, e)) * sst(0.4, 0.55, open[i]);
      const hair = (1 - sst(0.0, 0.02, e2)) * sst(0.55, 0.7, f16[i]);
      c = mixc(c, soil, gap * 0.9);
      c = mulc(c, 1 - hair * 0.35);
      const edge = sst(0.04, 0.25, e);
      return { c, h: 0.25 + (0.18 + edge * 0.18) * (1 - gap) + f16[i] * 0.12 + f60[i] * 0.03 - hair * 0.05, r: 0.82 + gap * 0.12 };
    });
    for (let k = 0; k < 30; k++) p.puddle(r.next() * S, r.next() * S, rnd(r, 0.8, 2), { col: hex(0x5a5650), level: 0.3, rough: 0.9 });
    const lich = [0xbdb67a, 0xcf8f48, 0xd9d7c9, 0x9aad6a].map(hex);
    for (let k = 0; k < 10; k++) {
      const x = r.next() * S, y = r.next() * S, c = pick(r, lich);
      for (let q = 0; q < 6; q++) p.blob(x + rnd(r, -4, 4), y + rnd(r, -3, 3), rnd(r, 1.2, 2.6), 0.85, 0, { col: c, h: 0.02, ao: 0, alpha: 0.6, lumpy: 0.35 });
    }
    stones(p, 70, 0.8, 2.4);
    return p;
  },
  sand(p) {
    const r = p.rng, S = p.S;
    const f3 = p.fbm(3, 4, 1), f10 = p.fbm(10, 3, 2), f80 = p.fbm(80, 2, 3), wetN = p.fbm(2, 4, 4);
    const A = hex(0xd9c38f), B = hex(0xc9ad78), Wt = hex(0xa88e62);
    p.base((x, y, i) => {
      const warp = (f10[i] - 0.5) * 18;
      const ripA = Math.sin(((y + warp) / S) * Math.PI * 2 * 11 + f3[i] * 3);
      // asymmetric ripples: long gentle backs, short steep fronts
      const rip = ripA > 0 ? ripA * 0.6 : ripA;
      let c = mixc(A, B, sst(0.35, 0.7, f3[i]));
      c = mulc(c, 0.95 + (f80[i] - 0.5) * 0.14 - rip * 0.05);
      const wet = sst(0.6, 0.75, wetN[i]);
      c = mixc(c, Wt, wet * 0.6);
      return { c, h: 0.3 + rip * 0.05 + f10[i] * 0.06 + f80[i] * 0.02, r: 0.92 - wet * 0.3 };
    });
    // seaweed scraps and driftwood splinters
    for (let k = 0; k < 4; k++) p.stroke(r.next() * S, r.next() * S, rnd(r, 5, 10), r.next() * 6.28, { c0: hex(0x4a5a2e), c1: hex(0x66733a), w0: 1.2, w1: 0.6, h: 0.05, bend: rnd(r, -1.5, 1.5), ao: 0.12, rough: 0.4 });
    twigs(p, 4, { c0: 0x8a7a64, c1: 0xa89a82, l0: 8, l1: 18 });
    for (let k = 0; k < 22; k++) p.blob(r.next() * S, r.next() * S, rnd(r, 0.8, 1.7), 0.7, r.next() * 6, { col: hex(r.next() < 0.5 ? 0xf3ece0 : 0xe8c4ae), h: 0.05, ao: 0.15, rough: 0.5, lumpy: 0.3 });
    stones(p, 30, 0.8, 1.8, { h0: 0.05, h1: 0.1, ao: 0.2 });
    return p;
  },
  // wet trampled mud: dried crust at the edges, ruts with raised lips, glassy
  // puddles, three-toed critter prints, sunk pebbles, dead leaves
  mud(p) {
    const r = p.rng, S = p.S;
    const f3 = p.fbm(3, 4, 1), f10 = p.fbm(10, 4, 2), f40 = p.fbm(40, 2, 3), dry = p.fbm(2, 4, 4);
    const A = hex(0x3e2d20), B = hex(0x50392a), C = hex(0x2c2118), Dr = hex(0x6a5440);
    p.base((x, y, i) => {
      let c = mixc(A, B, sst(0.3, 0.7, f3[i]));
      c = mixc(c, C, sst(0.6, 0.8, f10[i]) * 0.5);
      const crust = sst(0.6, 0.72, dry[i]);
      c = mixc(c, Dr, crust * 0.65);
      return { c: mulc(c, 0.92 + (f40[i] - 0.5) * 0.16), h: 0.3 + f10[i] * 0.16 + f40[i] * 0.04 + crust * 0.05, r: 0.35 + f10[i] * 0.15 + crust * 0.45 };
    });
    for (let k = 0; k < 8; k++) p.puddle(r.next() * S, r.next() * S, rnd(r, 5, 15), { col: hex(0x2a2a2c), level: 0.2, rough: 0.03 });
    // critter tracks: a pad and three toes pressed in
    for (let k = 0; k < 4; k++) {
      let x = r.next() * S, y = r.next() * S;
      const a = r.next() * 6.28;
      for (let st = 0; st < 5; st++) {
        const side = st % 2 ? 1 : -1;
        const px = x + Math.cos(a + 1.57) * 4 * side, py = y + Math.sin(a + 1.57) * 4 * side;
        p.puddle(px, py, 2.8, { col: mulc(C, 0.85), level: 0.18, rough: 0.12 });
        for (const t of [-0.55, 0, 0.55]) p.puddle(px + Math.cos(a + t) * 5.2, py + Math.sin(a + t) * 5.2, 1.4, { col: mulc(C, 0.85), level: 0.18, rough: 0.12 });
        x += Math.cos(a) * 14; y += Math.sin(a) * 14;
      }
    }
    stones(p, 90, 0.8, 2.2, { h0: 0.05, h1: 0.12, ao: 0.25, rough: 0.3 });
    leaves(p, 14, [0x4a3420, 0x5a4026, 0x3a2a1a].map(hex), { l0: 3.5, l1: 7 });
    twigs(p, 4, { c0: 0x3a2a1e, c1: 0x4e3a28 });
    return p;
  },
  snow(p) {
    const r = p.rng, S = p.S;
    const f3 = p.fbm(3, 4, 1), f9 = p.fbm(9, 4, 2), f50 = p.fbm(50, 2, 3);
    const A = hex(0xeef3fa), B = hex(0xd6e0ee), Bl = hex(0xbccbe2);
    p.base((x, y, i) => {
      const rip = Math.sin(((y + (f9[i] - 0.5) * 30) / S) * Math.PI * 2 * 6);
      let c = mixc(A, B, sst(0.4, 0.75, f3[i]) * 0.7 + rip * 0.08);
      c = mixc(c, Bl, sst(0.68, 0.85, f9[i]) * 0.4);
      return { c: mulc(c, 0.97 + (f50[i] - 0.5) * 0.06), h: 0.3 + f9[i] * 0.2 + rip * 0.03, r: 0.62 };
    });
    // glints
    for (let k = 0; k < 500; k++) { const i = p.at(r.next() * S, r.next() * S); p.blend(i, [1, 1, 1], 0.8); p.rough[i] = 0.2; }
    return p;
  },
  ash(p) {
    const f3 = p.fbm(3, 4, 1), f12 = p.fbm(12, 3, 2), f70 = p.fbm(70, 2, 3);
    const A = hex(0x4a4644), B = hex(0x3a3634), C = hex(0x5a5450);
    p.base((x, y, i) => {
      let c = mixc(A, B, sst(0.35, 0.7, f3[i]));
      c = mixc(c, C, sst(0.62, 0.82, f12[i]) * 0.5);
      return { c: mulc(c, 0.92 + (f70[i] - 0.5) * 0.2), h: 0.3 + f12[i] * 0.12 + f70[i] * 0.04, r: 0.96 };
    });
    stones(p, 300, 0.8, 3, { cols: [0x252224, 0x2e2a2b, 0x5a3a30, 0x3a3436].map(hex), h0: 0.1, h1: 0.22, rough: 0.85, lumpy: 0.3 });
    stones(p, 24, 3, 6, { cols: [0x1e1b1d, 0x2a2527, 0x4a2e28].map(hex), h0: 0.25, h1: 0.4, rough: 0.8, lumpy: 0.45 });
    return p;
  },
  // layered red rock (also the badland cliff faces)
  // sandstone grain only: the layers themselves are drawn by the terrain shader
  // from world height, so they stay level on every slope and from every angle
  sandstone(p) {
    const r = p.rng, S = p.S;
    const mean = hex(0xc47a4e);
    const f4 = p.fbm(4, 3, 1), f20 = p.fbm(20, 3, 2), f80 = p.fbm(80, 2, 3);
    p.base((x, y, i) => {
      // faint fine laminations inside a bed, wind-scoured patches
      const lam = Math.sin(((y + (f4[i] - 0.5) * 10) / S) * Math.PI * 2 * 18) * 0.5 + 0.5;
      const c = mulc(mean, 0.9 + 0.16 * f20[i] + (f80[i] - 0.5) * 0.12 + (lam - 0.5) * 0.05);
      return { c, h: 0.3 + f20[i] * 0.12 + f80[i] * 0.04 + lam * 0.02, r: 0.88 };
    });
    for (let k = 0; k < 9; k++) p.crack(r.next() * S, r.next() * S, rnd(r, 8, 22), Math.PI / 2 + rnd(r, -0.3, 0.3), { w: 0.8, depth: 0.15, col: hex(0x6a2c1e), wiggle: 0.25 });
    for (let k = 0; k < 16; k++) { const x = r.next() * S, y = r.next() * S; p.puddle(x, y, rnd(r, 1.5, 3), { col: hex(0x7a3423), level: 0.2, rough: 0.9 }); }
    return p;
  },
  // cushion moss: clumps of every size, soft dark hollows, bright sunlit tips
  moss(p) {
    const r = p.rng, S = p.S;
    const W = p.worley(9, 1, 1.4), W2 = p.worley(23, 2, 1.0), f5 = p.fbm(5, 4, 2), f60 = p.fbm(60, 2, 3);
    const D = hex(0x26381a), M = hex(0x41632a), L = hex(0x62823a), Y = hex(0x82913e);
    p.base((x, y, i) => {
      const d1 = Math.max(0, 1 - W.f1[i] * 0.95), d2 = Math.max(0, 1 - W2.f1[i] * 1.05);
      const dome = Math.min(1, d1 * 0.6 + d2 * 0.55 + f5[i] * 0.2);
      let c = mixc(D, M, sst(0.15, 0.55, dome));
      c = mixc(c, L, sst(0.5, 0.9, dome) * (0.4 + 0.6 * f5[i]));
      c = mixc(c, Y, sst(0.62, 0.8, f5[i]) * sst(0.6, 0.95, dome) * 0.45);
      return { c: mulc(c, 0.92 + (f60[i] - 0.5) * 0.2 + W.id[i] * 0.08), h: 0.2 + dome * 0.32 + f60[i] * 0.04, r: 0.92 };
    });
    for (let k = 0; k < 600; k++) p.stroke(r.next() * S, r.next() * S, rnd(r, 1.5, 3), r.next() * 6.28, { c0: L, c1: Y, w0: 0.8, w1: 0.4, h: 0.04, alpha: 0.6 });
    leaves(p, 12, [0x6a4a2a, 0x8a6a34].map(hex), { l0: 3, l1: 6 });
    return p;
  },
  gravel(p) {
    const f6 = p.fbm(6, 3, 1);
    p.base((x, y, i) => ({ c: mulc(hex(0x4c4239), 0.9 + f6[i] * 0.2), h: 0.2, r: 0.9 }));
    stones(p, 1300, 2.4, 5, { h0: 0.22, h1: 0.38, ao: 0.42 });
    stones(p, 900, 1.2, 2.6, { h0: 0.12, h1: 0.22, ao: 0.35 });
    return p;
  },
  // dry tussock grass over dusty soil
  drygrass(p) {
    const f3 = p.fbm(3, 4, 1), f12 = p.fbm(12, 3, 2), f40 = p.fbm(40, 2, 3);
    const soil = hex(0x7a6440), A = hex(0x8c7c44), B = hex(0x6e6232);
    p.base((x, y, i) => {
      let c = mixc(B, A, sst(0.3, 0.7, f3[i]));
      c = mixc(c, soil, sst(0.6, 0.8, f12[i]) * 0.6);
      return { c: mulc(c, 0.9 + (f40[i] - 0.5) * 0.2), h: 0.25 + f12[i] * 0.1, r: 0.93 };
    });
    blades(p, 2300, [0xb8a35a, 0xa08c48, 0xc9b66c, 0x8c8a44, 0x9aa04a].map(hex), { l0: 4, l1: 10, root: 0.65 });
    stones(p, 40, 0.8, 2);
    return p;
  },
  // pine needle litter with cones and twigs
  needles(p) {
    const r = p.rng, S = p.S;
    const f3 = p.fbm(3, 4, 1), f20 = p.fbm(20, 3, 2);
    p.base((x, y, i) => ({ c: mulc(mixc(hex(0x4e3220), hex(0x684530), sst(0.3, 0.7, f3[i])), 0.9 + f20[i] * 0.2), h: 0.25 + f20[i] * 0.1, r: 0.92 }));
    const nc = [0x9c5b2f, 0xb06a36, 0x7e4b27, 0xc0874a, 0x5c3820, 0xa47448].map(hex);
    for (let k = 0; k < 2600; k++) { const c = pick(r, nc); p.stroke(r.next() * S, r.next() * S, rnd(r, 4, 9), r.next() * 6.28, { c0: c, c1: mulc(c, 1.1), w0: 0.9, w1: 0.6, h: 0.05, bend: rnd(r, -0.2, 0.2), ao: 0.1 }); }
    twigs(p, 10, { c0: 0x3e2a1a, c1: 0x5a3c26 });
    for (let k = 0; k < 7; k++) p.blob(r.next() * S, r.next() * S, rnd(r, 3, 4.5), 0.65, r.next() * 6, { col: hex(0x6a4628), h: 0.32, ao: 0.4, lumpy: 0.4, shine: 0.3, vary: 0.3 });
    return p;
  },
  redsand(p) {
    const r = p.rng, S = p.S;
    const f3 = p.fbm(3, 4, 1), f10 = p.fbm(10, 3, 2), f80 = p.fbm(80, 2, 3);
    const A = hex(0xc87747), B = hex(0xb3643a);
    p.base((x, y, i) => {
      const ripA = Math.sin(((y + (f10[i] - 0.5) * 22) / S) * Math.PI * 2 * 10 + f3[i] * 3);
      const rip = ripA > 0 ? ripA * 0.6 : ripA;
      let c = mulc(mixc(A, B, sst(0.35, 0.7, f3[i])), 0.95 + (f80[i] - 0.5) * 0.16 - rip * 0.06);
      c = mixc(c, hex(0x8e4a2c), sst(0.66, 0.8, f10[i]) * 0.5);
      return { c, h: 0.3 + rip * 0.05 + f10[i] * 0.06, r: 0.94 };
    });
    for (let k = 0; k < 4; k++) p.crack(r.next() * S, r.next() * S, rnd(r, 14, 30), r.next() * 6.28, { w: 0.5, depth: 0.08, col: hex(0x8a4428), wiggle: 0.25 });
    stones(p, 70, 0.8, 2.6, { cols: [0x9e4d32, 0xd99a6a, 0x7a3a26, 0x5e4a40].map(hex) });
    return p;
  },
  basalt(p) {
    const r = p.rng, S = p.S;
    const W = p.worley(5, 1, 1.5), f8 = p.fbm(8, 3, 2), f50 = p.fbm(50, 2, 3), wide = p.fbm(4, 3, 4);
    p.base((x, y, i) => {
      const e = W.f2[i] - W.f1[i];
      let c = mulc(hex(0x48434a), 0.82 + W.id[i] * 0.3 + (f50[i] - 0.5) * 0.2);
      c = mixc(c, hex(0x5a3a30), sst(0.66, 0.82, f8[i]) * 0.35);
      const seam = (1 - sst(0.01, 0.03 + wide[i] * 0.06, e)) * sst(0.3, 0.45, wide[i]);
      c = mulc(c, 1 - seam * 0.55);
      return { c, h: 0.3 + sst(0.02, 0.15, e) * 0.3 + f8[i] * 0.08, r: 0.72 };
    });
    for (let k = 0; k < 220; k++) p.puddle(r.next() * S, r.next() * S, rnd(r, 0.6, 1.4), { col: hex(0x1c1a1e), level: 0.25, rough: 0.9 });
    return p;
  },
  // sun-baked clay: curled plates split by deep cracks
  clay(p) {
    const W = p.worley(5, 1, 1.3), W2 = p.worley(13, 2, 1.1), f4 = p.fbm(4, 3, 2), f40 = p.fbm(40, 2, 3);
    const A = hex(0xa58f74), B = hex(0x94806a), crackC = hex(0x5a4a3a);
    p.base((x, y, i) => {
      const e = W.f2[i] - W.f1[i], e2 = W2.f2[i] - W2.f1[i];
      let c = mulc(mixc(A, B, f4[i]), 0.9 + W.id[i] * 0.14 + (f40[i] - 0.5) * 0.12);
      const crack = Math.max(1 - sst(0.012, 0.045, e), (1 - sst(0.006, 0.025, e2)) * sst(0.45, 0.6, f4[i]) * 0.8);
      c = mixc(c, crackC, crack);
      // plate edges curl up a little
      const curl = sst(0.12, 0.04, e) * (1 - crack);
      return { c: mulc(c, 1 + curl * 0.06), h: 0.3 - crack * 0.25 + curl * 0.1 + f40[i] * 0.03, r: 0.92 };
    });
    stones(p, 40, 0.8, 2);
    return p;
  },
  // side-projection cliff: wavy bedding planes, joints, ledges with moss and water stains
  cliff(p) {
    const r = p.rng;
    const pal = [0x5c5852, 0x6e6a63, 0x807b73, 0x938d84, 0xa59f95, 0xb8b2a6].map(hex);
    const bounds = [];
    let y = 0;
    while (y < S - 14) {
      bounds.push({ y, amp: y === 0 ? 0 : 2 + r.next() * 5, cyc: 1 + Math.floor(r.next() * 3), ph: r.next() * 6.283, shade: 1 + Math.floor(r.next() * 3), joints: r.next() < 0.6, out: r.next() });
      y += 18 + Math.floor(r.next() * 56);
    }
    bounds.push({ y: S, amp: 0, cyc: 1, ph: 0, shade: 2, out: 0.5 });
    for (const b of bounds) {
      b.js = [];
      if (!b.joints) continue;
      let x = Math.floor(r.next() * 40);
      while (x < S - 10) { b.js.push({ x, slant: (r.next() - 0.5) * 0.6 }); x += 36 + Math.floor(r.next() * 80); }
    }
    const by = (b, x) => b.y + Math.sin((x / S) * Math.PI * 2 * b.cyc + b.ph) * b.amp;
    const f8 = p.fbm(8, 3, 1), f2 = p.fbm(2, 3, 2), f40 = p.fbm(40, 2, 3);
    p.base((x, yy, i) => {
      let k = 0;
      while (k < bounds.length - 2 && yy >= by(bounds[k + 1], x)) k++;
      const b = bounds[k], y0 = by(b, x), y1 = by(bounds[k + 1], x);
      const t = (yy - y0) / Math.max(1, y1 - y0);
      let sh = b.shade + (f8[i] > 0.62 ? 0.6 : f8[i] < 0.36 ? -0.6 : 0) + (f2[i] < 0.32 ? -0.8 : 0);
      if (t < 0.06) sh += 1.4; else if (t > 0.9) sh -= 1.4;
      let jd = 99;
      for (const j of b.js) jd = Math.min(jd, Math.abs(x - (j.x + (yy - y0) * j.slant)));
      if (jd < 1.2) sh -= 1.6; else if (jd < 2.4) sh += 0.6;
      const si = Math.max(0, Math.min(5, sh));
      const c = mulc(mixc(pal[Math.floor(si)], pal[Math.min(5, Math.floor(si) + 1)], si % 1), 0.94 + (f40[i] - 0.5) * 0.12);
      // each bed bulges out, recessed at its seams and joints
      const hh = 0.3 + b.out * 0.15 + Math.sin(Math.min(1, t) * Math.PI) * 0.12 - (jd < 1.5 ? 0.15 : 0) + f8[i] * 0.06;
      return { c, h: hh, r: 0.85 };
    });
    // moss and grass along the ledge lips, water stains below them
    const g = [0x34502a, 0x46663a, 0x5a7a40].map(hex);
    const f6 = p.fbm(6, 2, 7), f24 = p.fbm(24, 2, 8);
    for (let k = 1; k < bounds.length - 1; k++) {
      const b = bounds[k];
      for (let x = 0; x < S; x++) {
        const i0 = p.at(x, by(b, x));
        if (f6[i0] < 0.6) continue;
        const depth = 1 + Math.floor(f24[i0] * 4);
        for (let d = -1; d < depth; d++) { const i = p.at(x, by(b, x) + d); p.blend(i, g[Math.min(2, Math.max(0, 2 - d))], 0.55 * sst(0.6, 0.7, f6[i0])); }
      }
    }
    for (let k = 0; k < 8; k++) {
      const sx = r.next() * S, sy = r.next() * S, len = 30 + r.next() * 90;
      for (let q = 0; q < len; q++) for (let w = -1; w <= 1; w++) { const i = p.at(sx + w + Math.sin(q * 0.2) * 0.8, sy + q); p.shade(i, 0.9 + Math.abs(w) * 0.05); }
    }
    return p;
  },
  basaltcols(p) {
    const r = p.rng;
    const pal = [0x2e2a2c, 0x3c383a, 0x4a4648, 0x58534f, 0x666059].map(hex);
    const cols = [];
    for (let x = 0; x < S;) { const w = Math.min(S - x, 12 + Math.floor(r.next() * 18)); cols.push({ x, w, shade: 1.5 + r.next() * 1.5, ph: r.next() * 6.28, breaks: [0, 1, 2].map(() => ({ y: Math.floor(r.next() * S), tilt: (r.next() - 0.5) * 0.5 })) }); x += w; }
    const f2 = p.fbm(2, 3, 1), f30 = p.fbm(30, 2, 2);
    p.base((x, y, i) => {
      let c0 = cols[0];
      for (const c of cols) if (x >= c.x) c0 = c;
      const lx = x - c0.x + Math.sin((y / S) * Math.PI * 2 + c0.ph) * 0.8;
      const u = lx / c0.w;
      let sh = c0.shade + (f2[i] < 0.35 ? -0.6 : f2[i] > 0.68 ? 0.6 : 0);
      if (u < 0.08) sh -= 1.5; else if (u < 0.18) sh += 1; else if (u > 0.92) sh -= 0.8;
      let br = 99;
      for (const b of c0.breaks) br = Math.min(br, Math.abs(y - (b.y + lx * b.tilt)));
      if (br < 1.1) sh -= 1.5; else if (br < 2.2) sh += 0.7;
      const si = Math.max(0, Math.min(4, sh));
      const c = mulc(mixc(pal[Math.floor(si)], pal[Math.min(4, Math.floor(si) + 1)], si % 1), 0.95 + (f30[i] - 0.5) * 0.12);
      return { c, h: 0.3 + Math.sin(Math.max(0, Math.min(1, u)) * Math.PI) * 0.25 - (br < 1.2 ? 0.12 : 0), r: 0.7 };
    });
    return p;
  },
};

// how strongly each ground type's relief shows in its normal map
const RELIEF = {
  grass: 2.2, jungle: 3, dirt: 4, rock: 4, sand: 2.5, mud: 3, snow: 2, ash: 3, sandstone: 3.5, moss: 3.5,
  gravel: 4.5, drygrass: 2.5, needles: 2.5, redsand: 2.5, basalt: 4, clay: 4, cliff: 4.5, basaltcols: 4,
};
// per-material roughness scale (the painted alpha carries the detail)
export const TERRAIN_ROUGHNESS = {
  grass: 0.95, jungle: 0.95, dirt: 1, rock: 0.95, sand: 1, mud: 1, snow: 1, ash: 1,
  sandstone: 1, moss: 1, gravel: 1, drygrass: 1, needles: 1, redsand: 1, basalt: 1, clay: 1, cliff: 1, basaltcols: 1,
};
// close-up grit: how much of the shared detail tile's soil (x) and fibre (y) relief each type gets
export const TERRAIN_DETAIL = {
  grass: [0.5, 0.8], jungle: [0.6, 0.5], dirt: [1, 0.3], rock: [0.7, 0.15], sand: [0.35, 0], mud: [0.55, 0.15], snow: [0.2, 0], ash: [0.8, 0],
  sandstone: [0.6, 0.15], moss: [0.3, 0.6], gravel: [1, 0], drygrass: [0.4, 0.9], needles: [0.4, 0.9], redsand: [0.4, 0], basalt: [0.8, 0.15], clay: [0.5, 0.4], cliff: [0.7, 0.25], basaltcols: [0.7, 0.15],
};

// the shared 1 m detail tile: rg = soil/grit normal, ba = fibre/crack normal
function detailTile() {
  const soil = new GroundPainter(S, 7001);
  const f32 = soil.fbm(32, 3, 1), f96 = soil.fbm(96, 2, 2);
  soil.base((x, y, i) => ({ c: [0.5, 0.5, 0.5], h: 0.3 + f32[i] * 0.15 + f96[i] * 0.08 }));
  stones(soil, 900, 0.8, 2.6, { h0: 0.08, h1: 0.2, ao: 0 });
  stones(soil, 60, 3, 6, { h0: 0.2, h1: 0.3, ao: 0 });
  const fib = new GroundPainter(S, 7002);
  const g32 = fib.fbm(32, 3, 1);
  fib.base((x, y, i) => ({ c: [0.5, 0.5, 0.5], h: 0.3 + g32[i] * 0.08 }));
  const r = fib.rng;
  for (let k = 0; k < 1400; k++) fib.stroke(r.next() * S, r.next() * S, 6 + r.next() * 12, r.next() * 6.28, { c0: [0.5, 0.5, 0.5], w0: 1.6, w1: 0.6, h: 0.12, bend: (r.next() - 0.5) * 0.8 });
  for (let k = 0; k < 14; k++) fib.crack(r.next() * S, r.next() * S, 20 + r.next() * 40, r.next() * 6.28, { w: 0.8, depth: 0.15, wiggle: 0.6 });
  const a = normalFromHeight(soil, 5), b = normalFromHeight(fib, 4);
  const data = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) { data[i * 4] = a.data[i * 4]; data[i * 4 + 1] = a.data[i * 4 + 1]; data[i * 4 + 2] = b.data[i * 4]; data[i * 4 + 3] = b.data[i * 4 + 1]; }
  return data;
}

export function paintTerrainMaterial(name, seed) {
  return painters[name](new GroundPainter(S, seed)).finish();
}

// Paints every ground type into plain arrays (works in a worker):
// albedo (rgb + roughness) and normal (xyz + height) layers back to back, and the detail tile.
export function paintTerrainData() {
  const n = MAT_NAMES.length, L = S * S * 4;
  const albedo = new Uint8Array(L * n), normal = new Uint8Array(L * n);
  MAT_NAMES.forEach((name, i) => {
    const p = paintTerrainMaterial(name, 1000 + i * 37);
    albedo.set(p.data, i * L);
    normal.set(normalFromHeight(p, RELIEF[name] ?? 3).data, i * L);
  });
  return { S, albedo, normal, detail: detailTile() };
}

// Starts painting in a worker; resolves to the data, or null if workers fail
// (then the textures are painted on the main thread).
export function paintTerrainInWorker() {
  return new Promise((res) => {
    try {
      const wk = new Worker(new URL('./terrainTextures.worker.js', import.meta.url), { type: 'module' });
      wk.onmessage = (e) => { wk.terminate(); res(e.data); };
      wk.onerror = () => { wk.terminate(); res(null); };
      wk.postMessage(0);
    } catch { res(null); }
  });
}

function arrayTex(data, layers, srgb) {
  const tex = new THREE.DataArrayTexture(data, S, S, layers);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildTerrainTextures(data = null) {
  const d = data ?? paintTerrainData();
  const n = MAT_NAMES.length;
  const albedo = arrayTex(d.albedo, n, true);
  const normal = arrayTex(d.normal, n, false);
  const detail = new THREE.DataTexture(d.detail, S, S, THREE.RGBAFormat);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  detail.magFilter = THREE.LinearFilter; detail.minFilter = THREE.LinearMipmapLinearFilter;
  detail.generateMipmaps = true; detail.anisotropy = 8;
  detail.needsUpdate = true;
  const rough = MAT_NAMES.map((nm) => TERRAIN_ROUGHNESS[nm] ?? 1);
  const detailK = MAT_NAMES.map((nm) => new THREE.Vector2(...(TERRAIN_DETAIL[nm] ?? [0.5, 0.2])));
  return { albedo, normal, rough, detail, detailK };
}

export { painters as terrainPainters, sst };
