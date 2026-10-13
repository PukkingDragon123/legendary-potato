// Procedural prehistoric flora. Each builder returns { bark, leaf } geometries
// (GeoBuilder layout) for a near and a far LOD plus gameplay info.
import * as THREE from 'three';
import { GeoBuilder, curvePoints } from '../gfx/geo.js';
import { RNG } from '../core/rng.js';
import { BARK, LEAF } from '../gfx/plantTextures.js';

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function randUnit(r, flatten = 1) {
  const a = r.next() * Math.PI * 2, z = r.next() * 2 - 1, s = Math.sqrt(1 - z * z);
  return V(Math.cos(a) * s, z * flatten, Math.sin(a) * s).normalize();
}

function frond(L, origin, az, elev, length, width, droop, layer, segs, r, opt = {}) {
  const dir = V(Math.cos(az), 0, Math.sin(az));
  const side = V(-Math.sin(az), 0, Math.cos(az));
  const tilt = opt.tilt ?? 0.25;
  const pts = [], sides = [], widths = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs, s = t * length;
    const h = Math.sin(elev) * s - droop * s * s / length;
    const rr = Math.cos(elev) * s;
    pts.push(origin.clone().addScaledVector(dir, rr).addScaledVector(UP, h));
    // slight V-fold: tilt the side vector up toward the midrib
    sides.push(side.clone().addScaledVector(UP, tilt * (opt.foldSign ?? 1)).normalize());
    const prof = t < 0.85 ? 1 : 1 - (t - 0.85) / 0.15 * 0.6;
    widths.push(width * prof * (opt.baseNarrow ? Math.min(1, 0.35 + t * 2.5) : 1));
  }
  const bw = opt.baseWind ?? 0.2;
  L.ribbon(pts, sides, widths, {
    layer, uvRect: opt.uvRect ?? [0, 0, 1, 1],
    wind: (t) => bw + t * t * (opt.windAmt ?? 0.9),
    normalBias: UP, normalBiasAmt: 0.55,
    ao: (t) => (opt.ao0 ?? 0.7) + 0.3 * t,
    color: opt.color,
  });
}

function cluster(L, center, radius, count, size, layer, r, opt = {}) {
  const flat = opt.flatten ?? 0.65;
  for (let k = 0; k < count; k++) {
    const d = randUnit(r, flat);
    const pos = center.clone().addScaledVector(d, radius * (0.35 + 0.65 * r.next()));
    const n = pos.clone().sub(center).addScaledVector(UP, 0.35 * radius).normalize();
    const f = randUnit(r, 0.8);
    const ax = new THREE.Vector3().crossVectors(f, UP);
    if (ax.lengthSq() < 1e-3) ax.set(1, 0, 0);
    ax.normalize();
    const ay = new THREE.Vector3().crossVectors(ax, f).normalize();
    const s = size * (0.75 + r.next() * 0.5);
    const yT = (pos.y - (center.y - radius)) / (2 * radius);
    L.card(pos, ax.multiplyScalar(s * 0.5), ay.multiplyScalar(s * 0.5), n, {
      layer, uvRect: r.next() < 0.5 ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1],
      wind: (opt.baseWind ?? 0.4) + 0.25, ao: 0.62 + 0.38 * Math.min(1, Math.max(0, yT)), color: opt.color,
    });
  }
}

function branch(B, from, to, r0, r1, layer, segs = 5, opt = {}) {
  const pts = [];
  const n = opt.n ?? 4;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const p = from.clone().lerp(to, t);
    p.y += Math.sin(t * Math.PI) * (opt.arc ?? 0) + (opt.tipUp ?? 0) * t * t;
    pts.push(p);
  }
  const radii = pts.map((_, i) => r0 + (r1 - r0) * (i / (n - 1)));
  B.tube(pts, radii, { segs, layer, vScale: 2, uRepeat: 1, wind: (t) => (opt.w0 ?? 0.2) + t * (opt.w1 ?? 0.2), ao: () => opt.ao ?? 0.85 });
  return pts;
}

function trunkTube(B, pts, r0, r1, layer, opt = {}) {
  const n = pts.length;
  const flare = opt.flare ?? 0;
  const radii = pts.map((p, i) => {
    const t = i / (n - 1);
    let rr = r0 + (r1 - r0) * Math.pow(t, opt.taperPow ?? 1);
    if (flare) rr += flare * Math.exp(-t * (opt.flareSharp ?? 14));
    return rr;
  });
  const H = pts[n - 1].y - pts[0].y;
  B.tube(pts, radii, {
    segs: opt.segs ?? 7, layer, uRepeat: Math.max(1, Math.round((2 * Math.PI * r0) / (opt.uMeters ?? 1.0))), vScale: opt.vScale ?? 2,
    wind: (t) => t * t * (opt.windTop ?? 0.12), ao: (t, c) => Math.min(1, 0.68 + (c.y - pts[0].y) * 0.25) * (opt.aoTop && t > 0.8 ? 0.85 : 1),
    jitter: opt.jitter ?? 0.08, rnd: opt.rnd, capTop: opt.capTop, capLayer: BARK.RINGS,
    ringNoise: opt.ringNoise,
  });
  return { H };
}

// ------------------------------------------------------------------ species
export const SPECIES = {
  araucaria: {
    name: 'Monkey Puzzle Tree', wood: 'log', yield: { log: 4, resin: 2 }, hp: 160, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 17 + r.next() * 9, r0 = 0.45 + r.next() * 0.15;
      const pts = curvePoints(V(0, -0.4, 0), H + 0.4, far ? 4 : 10, { leanX: (r.next() - 0.5) * 0.06, leanZ: (r.next() - 0.5) * 0.06, wobble: 0.25, rnd: () => r.next() });
      trunkTube(B, pts, r0, 0.1, BARK.ARAUCARIA, { flare: 0.25, segs: far ? 5 : 8, rnd: () => r.next() });
      const whorls = far ? 4 : 7;
      for (let w = 0; w < whorls; w++) {
        const t = 0.6 + (w / whorls) * 0.38;
        const y = H * t;
        const nb = far ? 4 : 5 + r.int(0, 2);
        const len = (5.2 - w * (far ? 1.0 : 0.6)) * (0.8 + r.next() * 0.3);
        for (let b = 0; b < nb; b++) {
          const az = (b / nb) * Math.PI * 2 + w * 0.7 + r.next() * 0.3;
          const from = V(pts[0].x, y, pts[0].z);
          const to = from.clone().add(V(Math.cos(az) * len, -len * 0.08, Math.sin(az) * len));
          const bp = far ? [from, to] : branch(B, from, to, 0.09, 0.04, BARK.ARAUCARIA, 4, { tipUp: 0.9, arc: -0.2, w0: 0.1 + t * 0.1, w1: 0.3 });
          // rope foliage: crossed ribbons along the branch, upturned at the tip
          const p0 = bp[0], p1 = bp[bp.length - 1];
          const steps = far ? 2 : 5;
          const cps = [], sideH = [], sideV = [], ws = [];
          for (let k = 0; k <= steps; k++) {
            const tt = k / steps;
            const p = p0.clone().lerp(p1, 0.25 + tt * 0.75);
            p.y += tt * tt * 1.0;
            cps.push(p);
            sideH.push(V(-Math.sin(az), 0.15, Math.cos(az)).normalize());
            sideV.push(UP.clone());
            ws.push(0.85 - tt * 0.2);
          }
          const wind = (tt) => 0.25 + tt * 0.5;
          L.ribbon(cps, sideH, ws, { layer: LEAF.ROPE, wind, normalBias: UP, normalBiasAmt: 0.6, ao: (tt) => 0.75 + tt * 0.25 });
          if (!far) L.ribbon(cps, sideV, ws.map((x) => x * 0.8), { layer: LEAF.ROPE, wind, normalBias: V(Math.cos(az), 0.5, Math.sin(az)).normalize(), normalBiasAmt: 0.7, ao: (tt) => 0.7 + tt * 0.3 });
        }
      }
      // top tuft
      cluster(L, V(pts[pts.length - 1].x, H + 0.4, pts[pts.length - 1].z), 0.9, far ? 2 : 5, 1.6, LEAF.ROPE, r, { baseWind: 0.4 });
      return { bark: B, leaf: L, height: H, radius: r0 + 0.1, canopy: 5 };
    },
  },
  treefern: {
    name: 'Tree Fern', yield: { fiber: 4, stick: 2, fern: 2 }, hp: 50, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 3 + r.next() * 3.2, r0 = 0.16 + r.next() * 0.05;
      const pts = curvePoints(V(0, -0.3, 0), H + 0.3, far ? 3 : 7, { leanX: (r.next() - 0.5) * 0.35, leanZ: (r.next() - 0.5) * 0.35, curve: 2, wobble: 0.15, rnd: () => r.next() });
      trunkTube(B, pts, r0, r0 * 0.85, BARK.TREEFERN, { flare: 0.22, flareSharp: 9, segs: far ? 5 : 7, windTop: 0.25, rnd: () => r.next(), uMeters: 0.7 });
      const top = pts[pts.length - 1];
      const n = far ? 7 : 12 + r.int(0, 3);
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + r.next() * 0.4;
        const elev = 0.55 - r.next() * 0.55;
        frond(L, top.clone().add(V(0, 0.1, 0)), az, elev, 2.4 + r.next() * 1.1, 0.95, 0.55 + r.next() * 0.25, LEAF.FERN, far ? 3 : 6, r, { baseWind: 0.3, windAmt: 0.9, baseNarrow: true });
      }
      if (!far) {
        // a few brown dead fronds hanging under the crown
        for (let i = 0; i < 3; i++) frond(L, top.clone().add(V(0, -0.15, 0)), r.next() * 6.28, -0.9, 1.6, 0.7, 0.2, LEAF.FERN, 4, r, { color: [0.62, 0.42, 0.24], baseWind: 0.3, baseNarrow: true });
        // fiddleheads: tiny curled young fronds
        for (let i = 0; i < 3; i++) {
          const az = r.next() * 6.28;
          const c = [];
          for (let k = 0; k < 7; k++) { const a = k * 0.7; c.push(top.clone().add(V(Math.cos(az) * (0.1 + Math.sin(a) * 0.12), 0.15 + k * 0.05 + (1 - Math.cos(a)) * 0.08, Math.sin(az) * (0.1 + Math.sin(a) * 0.12)))); }
          B.tube(c, c.map((_, k) => 0.035 - k * 0.003), { segs: 4, layer: BARK.HORSETAIL, wind: () => 0.3, color: [0.75, 0.95, 0.6] });
        }
      }
      return { bark: B, leaf: L, height: H, radius: r0 + 0.05, canopy: 2.6 };
    },
  },
  cycad: {
    name: 'Cycad', yield: { fiber: 2, cycadcone: 1, stick: 1 }, hp: 40, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 0.7 + r.next() * 1.4, r0 = 0.32 + r.next() * 0.12;
      const pts = curvePoints(V(0, -0.3, 0), H + 0.3, far ? 3 : 5, { leanX: (r.next() - 0.5) * 0.2, leanZ: (r.next() - 0.5) * 0.2, rnd: () => r.next() });
      trunkTube(B, pts, r0, r0 * 0.85, BARK.CYCAD, { segs: far ? 5 : 8, windTop: 0.05, rnd: () => r.next(), jitter: 0.12, uMeters: 0.8 });
      const top = pts[pts.length - 1];
      // central cone
      if (!far) {
        const cone = [];
        for (let k = 0; k < 5; k++) cone.push(top.clone().add(V(0, 0.05 + k * 0.12, 0)));
        B.tube(cone, [0.16, 0.2, 0.18, 0.12, 0.02], { segs: 7, layer: BARK.CYCAD, color: [1.25, 0.95, 0.45], wind: () => 0.05 });
      }
      const n = far ? 8 : 15 + r.int(0, 4);
      for (let i = 0; i < n; i++) {
        const az = (i / n) * Math.PI * 2 + r.next() * 0.3;
        frond(L, top, az, 0.95 - r.next() * 0.6, 1.5 + r.next() * 0.7, 0.62, 0.28, LEAF.CYCAD, far ? 2 : 4, r, { baseWind: 0.15, windAmt: 0.5, tilt: 0.45 });
      }
      return { bark: B, leaf: L, height: H + 1.2, radius: r0, canopy: 1.8 };
    },
  },
  ginkgo: {
    name: 'Ginkgo', yield: { log: 3, ginkgonut: 2 }, hp: 120, tool: 'axe',
    build(r, far, golden = false) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 9 + r.next() * 5, r0 = 0.32 + r.next() * 0.12;
      const pts = curvePoints(V(0, -0.3, 0), H + 0.3, far ? 4 : 8, { leanX: (r.next() - 0.5) * 0.15, leanZ: (r.next() - 0.5) * 0.15, wobble: 0.3, rnd: () => r.next() });
      trunkTube(B, pts, r0, 0.08, BARK.GINKGO, { flare: 0.15, segs: far ? 5 : 7, rnd: () => r.next() });
      const layer = golden ? LEAF.GOLDEN : LEAF.GINKGO;
      const nb = far ? 3 : 4 + r.int(0, 2);
      for (let b = 0; b < nb; b++) {
        const t = 0.38 + r.next() * 0.35;
        const from = pts[Math.floor(t * (pts.length - 1))].clone();
        const az = r.next() * Math.PI * 2;
        const len = 2.5 + r.next() * 2.5;
        const to = from.clone().add(V(Math.cos(az) * len * 0.75, len * 0.75, Math.sin(az) * len * 0.75));
        if (!far) branch(B, from, to, 0.13, 0.05, BARK.GINKGO, 5, { w0: 0.1, w1: 0.25 });
        cluster(L, to, 1.4 + r.next() * 0.6, far ? 3 : 7, 2.0, layer, r, { baseWind: 0.35 });
      }
      cluster(L, pts[pts.length - 1], 1.8, far ? 3 : 7, 2.2, layer, r, { baseWind: 0.4 });
      return { bark: B, leaf: L, height: H, radius: r0 + 0.05, canopy: 3.5 };
    },
  },
  redwood: {
    name: 'Giant Redwood', yield: { log: 8, resin: 3 }, hp: 320, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 28 + r.next() * 12, r0 = 1.1 + r.next() * 0.5;
      const pts = curvePoints(V(0, -0.5, 0), H + 0.5, far ? 4 : 12, { wobble: 0.3, rnd: () => r.next() });
      trunkTube(B, pts, r0, 0.15, BARK.REDWOOD, { flare: 0.9, flareSharp: 10, segs: far ? 6 : 11, rnd: () => r.next(), taperPow: 0.8, uMeters: 1.4 });
      const tiers = far ? 5 : 11;
      for (let k = 0; k < tiers; k++) {
        const t = 0.33 + (k / tiers) * 0.67;
        const y = H * t;
        const len = (1 - (k / tiers)) * 6.5 + 1.2;
        const nn = far ? 4 : 7;
        for (let j = 0; j < nn; j++) {
          const az = (j / nn) * Math.PI * 2 + k * 0.9 + r.next() * 0.4;
          const dir = V(Math.cos(az), -0.35, Math.sin(az)).normalize();
          const c = V(0, y, 0).addScaledVector(dir, len * 0.5 + r0 * (1 - t) * 0.8);
          const ax = V(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(len * 0.45);
          const ay = dir.clone().multiplyScalar(len * 0.5);
          L.card(c, ax, ay, V(Math.cos(az) * 0.4, 1, Math.sin(az) * 0.4).normalize(), { layer: LEAF.SPRAY, uvRect: j % 2 ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1], windTop: 0.3 + t * 0.3, windBottom: 0.15 + t * 0.2, ao: 0.6 + t * 0.4 });
        }
      }
      return { bark: B, leaf: L, height: H, radius: r0 + 0.3, canopy: 7 };
    },
  },
  giant: {
    name: 'Jungle Giant', yield: { log: 6, fiber: 2, vine: 2 }, hp: 260, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 15 + r.next() * 8, r0 = 0.6 + r.next() * 0.3;
      const pts = curvePoints(V(0, -0.4, 0), H * 0.75, far ? 4 : 9, { leanX: (r.next() - 0.5) * 0.2, leanZ: (r.next() - 0.5) * 0.2, wobble: 0.4, rnd: () => r.next() });
      trunkTube(B, pts, r0, r0 * 0.45, BARK.GIANT, { flare: 0.5, segs: far ? 6 : 9, rnd: () => r.next() });
      if (!far) {
        // buttress roots
        const nf = 4 + r.int(0, 2);
        for (let f = 0; f < nf; f++) {
          const az = (f / nf) * Math.PI * 2 + r.next() * 0.5;
          const out = V(Math.cos(az), 0, Math.sin(az));
          const fin = [];
          for (let k = 0; k < 4; k++) { const t = k / 3; fin.push(out.clone().multiplyScalar(r0 * 0.6 + t * 1.6).add(V(0, 2.4 * (1 - t) - 0.3, 0))); }
          B.tube(fin, [0.35, 0.28, 0.18, 0.08], { segs: 5, layer: BARK.GIANT, ao: () => 0.7, ringNoise: (t, j) => (j % 5 < 2 ? 1.0 : 0.45) });
        }
      }
      const top = pts[pts.length - 1];
      const nb = far ? 3 : 4 + r.int(0, 2);
      for (let b = 0; b < nb; b++) {
        const az = (b / nb) * Math.PI * 2 + r.next() * 0.6;
        const len = 3.5 + r.next() * 3;
        const to = top.clone().add(V(Math.cos(az) * len, len * 0.55 + r.next() * 1.5, Math.sin(az) * len));
        if (!far) branch(B, top, to, r0 * 0.38, 0.1, BARK.GIANT, 6, { w0: 0.12, w1: 0.25, arc: 0.4 });
        cluster(L, to, 3.0 + r.next() * 1.0, far ? 6 : 14, far ? 4.2 : 3.4, LEAF.BROAD, r, { baseWind: 0.3, flatten: 0.5 });
        if (!far && r.next() < 0.7) {
          // hanging vine strip
          const vlen = 3 + r.next() * 5;
          const vp = [], vs = [], vw = [];
          for (let k = 0; k <= 4; k++) { vp.push(to.clone().add(V(0, -k / 4 * vlen - 0.5, 0))); vs.push(V(Math.cos(az + 1.57), 0, Math.sin(az + 1.57))); vw.push(0.8); }
          L.ribbon(vp, vs, vw, { layer: LEAF.MOSS, uvRect: [0, 0, 0.5, 1], flipV: true, wind: (t) => 0.4 + t * 0.6, ao: () => 0.85 });
        }
      }
      cluster(L, top.clone().add(V(0, 2.5, 0)), 3.8, far ? 6 : 14, far ? 4.6 : 3.6, LEAF.BROAD, r, { baseWind: 0.3, flatten: 0.5 });
      return { bark: B, leaf: L, height: H, radius: r0 + 0.2, canopy: 7 };
    },
  },
  palm: {
    name: 'Palm', yield: { log: 2, fiber: 3, palmfruit: 2 }, hp: 70, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 6 + r.next() * 4, r0 = 0.24 + r.next() * 0.06;
      const lean = 0.18 + r.next() * 0.2, la = r.next() * Math.PI * 2;
      const pts = curvePoints(V(0, -0.3, 0), H + 0.3, far ? 4 : 9, { leanX: Math.cos(la) * lean, leanZ: Math.sin(la) * lean, curve: 1.8, rnd: () => r.next() });
      trunkTube(B, pts, r0, r0 * 0.75, BARK.PALM, { flare: 0.15, segs: far ? 5 : 7, windTop: 0.3, rnd: () => r.next(), uMeters: 0.6, vScale: 1.2 });
      const top = pts[pts.length - 1];
      const n = far ? 6 : 10;
      for (let i = 0; i < n; i++) frond(L, top, (i / n) * Math.PI * 2 + r.next() * 0.3, 0.45 - r.next() * 0.3, 3.2 + r.next() * 1, 1.25, 0.6, LEAF.PALM, far ? 3 : 6, r, { baseWind: 0.4, windAmt: 1.0, tilt: 0.2 });
      if (!far) for (let k = 0; k < 4; k++) { const a = r.next() * 6.28; const c = top.clone().add(V(Math.cos(a) * 0.25, -0.25, Math.sin(a) * 0.25)); B.tube([c, c.clone().add(V(0, -0.22, 0))], [0.13, 0.11], { segs: 6, layer: BARK.PALM, color: [0.9, 0.6, 0.3], wind: () => 0.3, capTop: false }); }
      return { bark: B, leaf: L, height: H, radius: r0, canopy: 3.5 };
    },
  },
  horsetail: {
    name: 'Giant Horsetail', yield: { stick: 4, fiber: 1 }, hp: 20, tool: 'any',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const n = far ? 4 : 6 + r.int(0, 5);
      let maxH = 0;
      for (let s = 0; s < n; s++) {
        const a = r.next() * Math.PI * 2, d = r.next() * 0.6;
        const H = 1.8 + r.next() * 1.8;
        maxH = Math.max(maxH, H);
        const base = V(Math.cos(a) * d, -0.2, Math.sin(a) * d);
        const pts = curvePoints(base, H, far ? 3 : 6, { leanX: Math.cos(a) * 0.12, leanZ: Math.sin(a) * 0.12, rnd: () => r.next() });
        B.tube(pts, pts.map((_, i) => 0.06 - i * 0.006), { segs: far ? 4 : 5, layer: BARK.HORSETAIL, vScale: 2, wind: (t) => t * t * 0.7, ao: (t) => 0.6 + t * 0.4 });
        if (!far) {
          for (let k = 2; k < pts.length; k++) {
            const p = pts[k];
            const sz = 0.55 - k * 0.05;
            L.card(p, V(sz, 0, 0), V(0, 0, sz), V(0, 1, 0), { layer: LEAF.WHORL, uvRect: k % 2 ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1], wind: 0.35 + (k / pts.length) * 0.5 });
          }
        }
      }
      return { bark: B, leaf: L, height: maxH, radius: 0.45, canopy: 0.8, small: true };
    },
  },
  conifer: {
    name: 'Podocarp Conifer', yield: { log: 3, resin: 2 }, hp: 110, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 9 + r.next() * 8, r0 = 0.3 + r.next() * 0.12;
      const pts = curvePoints(V(0, -0.3, 0), H + 0.3, far ? 4 : 8, { wobble: 0.2, rnd: () => r.next() });
      trunkTube(B, pts, r0, 0.06, BARK.CONIFER, { flare: 0.15, segs: far ? 5 : 7, rnd: () => r.next() });
      const tiers = far ? 4 : 8;
      for (let k = 0; k < tiers; k++) {
        const t = 0.25 + (k / tiers) * 0.75;
        const y = H * t;
        const len = (1 - k / tiers) * 3.4 + 0.8;
        const nn = far ? 4 : 6;
        for (let j = 0; j < nn; j++) {
          const az = (j / nn) * Math.PI * 2 + k * 1.1 + r.next() * 0.3;
          const dir = V(Math.cos(az), -0.3, Math.sin(az)).normalize();
          const c = V(0, y, 0).addScaledVector(dir, len * 0.5);
          L.card(c, V(-Math.sin(az), 0, Math.cos(az)).multiplyScalar(len * 0.42), dir.clone().multiplyScalar(len * 0.5), V(Math.cos(az) * 0.5, 1, Math.sin(az) * 0.5).normalize(), { layer: LEAF.SPRAY, uvRect: j % 2 ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1], windTop: 0.35 + t * 0.3, windBottom: 0.2 + t * 0.2, ao: 0.6 + t * 0.4 });
        }
      }
      L.card(V(0, H + 0.4, 0), V(0.6, 0, 0), V(0, 0.9, 0), V(0, 1, 0.3).normalize(), { layer: LEAF.SPRAY, uvRect: [0, 0, 1, 0.5], wind: 0.6 });
      return { bark: B, leaf: L, height: H, radius: r0 + 0.05, canopy: 3.5 };
    },
  },
  cypress: {
    name: 'Swamp Cypress', yield: { log: 4, vine: 1 }, hp: 140, tool: 'axe',
    build(r, far) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 10 + r.next() * 6, r0 = 0.45 + r.next() * 0.15;
      const pts = curvePoints(V(0, -0.5, 0), H, far ? 4 : 9, { wobble: 0.3, leanX: (r.next() - 0.5) * 0.1, rnd: () => r.next() });
      trunkTube(B, pts, r0, 0.12, BARK.CYPRESS, { flare: 0.8, flareSharp: 7, segs: far ? 5 : 8, rnd: () => r.next() });
      if (!far) for (let k = 0; k < 5; k++) { const a = r.next() * 6.28, d = 1.2 + r.next() * 1.4; const b = V(Math.cos(a) * d, -0.3, Math.sin(a) * d); B.tube([b, b.clone().add(V(0, 0.4 + r.next() * 0.4, 0))], [0.12, 0.03], { segs: 5, layer: BARK.CYPRESS, ao: () => 0.8 }); }
      const top = pts[pts.length - 1];
      for (let b = 0; b < (far ? 3 : 5); b++) {
        const az = r.next() * 6.28, len = 2 + r.next() * 2.5;
        const from = pts[Math.floor((0.55 + r.next() * 0.35) * (pts.length - 1))];
        const to = from.clone().add(V(Math.cos(az) * len, len * 0.3, Math.sin(az) * len));
        if (!far) branch(B, from, to, 0.1, 0.04, BARK.CYPRESS, 4);
        cluster(L, to, 1.4, far ? 2 : 5, 2.0, LEAF.SWAMP, r, { baseWind: 0.4 });
        if (!far) { const vp = [to.clone(), to.clone().add(V(0, -2.5, 0)), to.clone().add(V(0, -4, 0))]; L.ribbon(vp, vp.map(() => V(Math.cos(az + 1.57), 0, Math.sin(az + 1.57))), [0.9, 0.9, 0.7], { layer: LEAF.SWAMP, uvRect: [0, 0.5, 1, 1], flipV: true, wind: (t) => 0.4 + t * 0.5 }); }
      }
      cluster(L, top, 1.6, far ? 2 : 5, 2.2, LEAF.SWAMP, r, { baseWind: 0.4 });
      return { bark: B, leaf: L, height: H, radius: r0 + 0.2, canopy: 3.5 };
    },
  },
  dead: {
    name: 'Dead Tree', yield: { log: 2, stick: 3 }, hp: 60, tool: 'axe',
    build(r, far, charred = false) {
      const B = new GeoBuilder(), L = new GeoBuilder();
      const H = 5 + r.next() * 7, r0 = 0.3 + r.next() * 0.2;
      const layer = charred ? BARK.CHARRED : BARK.DEAD;
      const pts = curvePoints(V(0, -0.3, 0), H, far ? 3 : 6, { wobble: 0.4, leanX: (r.next() - 0.5) * 0.3, leanZ: (r.next() - 0.5) * 0.3, rnd: () => r.next() });
      trunkTube(B, pts, r0, 0.1, layer, { flare: 0.2, segs: far ? 5 : 7, rnd: () => r.next(), capTop: true, windTop: 0.03 });
      for (let b = 0; b < (far ? 2 : 4); b++) {
        const from = pts[Math.floor((0.4 + r.next() * 0.5) * (pts.length - 1))];
        const az = r.next() * 6.28, len = 1 + r.next() * 2.5;
        const to = from.clone().add(V(Math.cos(az) * len, len * (0.2 + r.next() * 0.6), Math.sin(az) * len));
        branch(B, from, to, 0.09, 0.03, layer, 4, { w0: 0.02, w1: 0.05 });
        if (!far && !charred && r.next() < 0.6) L.card(to, V(0.8, 0, 0), V(0, 1.2, 0), UP, { layer: LEAF.TWIGS, uvRect: [0, 0, 1, 1], wind: 0.1 });
      }
      return { bark: B, leaf: L, height: H, radius: r0 + 0.05, canopy: 2 };
    },
  },
};

// Build N variants x 2 LODs for each species (deterministic).
export function buildFloraLibrary(seed = 'flora') {
  const lib = {};
  for (const [key, sp] of Object.entries(SPECIES)) {
    const variants = [];
    const nv = key === 'redwood' || key === 'giant' ? 3 : 4;
    for (let v = 0; v < nv; v++) {
      const extra = key === 'ginkgo' ? v === 3 : key === 'dead' ? v === 3 : false;
      const near = sp.build(new RNG(`${seed}:${key}:${v}`), false, extra);
      const far = sp.build(new RNG(`${seed}:${key}:${v}`), true, extra);
      variants.push({
        near: { bark: near.bark.build(), leaf: near.leaf.build() },
        far: { bark: far.bark.build(), leaf: far.leaf.build() },
        height: near.height, radius: near.radius, canopy: near.canopy, small: !!near.small,
      });
    }
    lib[key] = { ...sp, variants };
  }
  return lib;
}
