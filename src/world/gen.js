// Island generator. Pure JS (no three.js) so it runs inside a Web Worker and
// in Node for tests. Deterministic from the seed: every co-op client builds the
// identical island and only edits are networked.
//
// Layout (x = east, z = south, north = -z):
//   north: snowy mountains + pteranodon cliffs | north-east: volcano
//   north-west: red badlands mesas | middle-north: highland plains + source lake
//   ----- the Great Escarpment cliff (river plunges over it: Thunder Falls) -----
//   west: fern prairie (+ meteor crater, tar pits) | south-west: redwood forest
//   centre: dense jungle with the crash site | east: swamp | south-east: rex nesting grounds
//   south: beaches and the open sea
import { Simplex, RNG, clamp, lerp, smoothstep, hash2i } from '../core/rng.js';

export const WORLD = {
  SIZE: 2048, // metres, square
  HALF: 1024,
  N: 2049, // height samples per side (1 m)
  M: 1024, // splat/biome/water samples per side (2 m)
  SEA: 0,
};

export const BIOME = {
  OCEAN: 0, BEACH: 1, JUNGLE: 2, PRAIRIE: 3, REDWOOD: 4, SWAMP: 5, NESTING: 6,
  HIGHLAND: 7, BADLANDS: 8, MOUNTAIN: 9, SNOW: 10, VOLCANIC: 11, RIVER: 12, CRATER: 13,
};
export const BIOME_NAMES = ['Open Sea', 'Sunny Beach', 'Crash Jungle', 'Fern Prairie', 'Redwood Forest', 'Stinky Swamp', 'Rex Nesting Grounds',
  'Highland Plains', 'Red Badlands', 'Frostbite Peaks', 'Frostbite Peaks', 'Volcano', 'River Valley', 'Meteor Crater'];

// terrain material layers (indices into the terrain texture array)
export const MAT = {
  GRASS: 0, JUNGLE: 1, DIRT: 2, ROCK: 3, SAND: 4, MUD: 5, SNOW: 6, ASH: 7, SANDSTONE: 8, MOSS: 9, GRAVEL: 10, DRYGRASS: 11, NEEDLES: 12, REDSAND: 13, BASALT: 14, CLAY: 15,
};
export const MAT_NAMES = ['grass', 'jungle', 'dirt', 'rock', 'sand', 'mud', 'snow', 'ash', 'sandstone', 'moss', 'gravel', 'drygrass', 'needles', 'redsand', 'basalt', 'clay', 'cliff', 'basaltcols'];

const LOW = ['jungle', 'prairie', 'redwood', 'swamp', 'nesting'];
const HIGH = ['highland', 'badlands', 'mountain'];

export function generateWorld(seed = 'prehistoric', onProgress = () => {}) {
  const t0 = Date.now();
  const rng = new RNG(seed + ':layout');
  const nA = new Simplex(seed + ':a');
  const nB = new Simplex(seed + ':b');
  const nC = new Simplex(seed + ':c');
  const nD = new Simplex(seed + ':d');
  const { N, M, HALF } = WORLD;

  // ------------------------------------------------------------------ layout
  const J = (a) => rng.range(-a, a);
  const L = {
    escZ: -150, escH: 34,
    volcano: { x: 590 + J(25), z: -560 + J(25), r: 330, h: 205, crater: 62 },
    lake: { x: -150 + J(20), z: -560 + J(15), r: 74 },
    crater: { x: -570 + J(25), z: 150 + J(25), r: 58 },
    tarpits: { x: -380 + J(20), z: 430 + J(20) },
    crash: { x: 0, z: 40 },
    passes: [{ x: -440, w: 110 }, { x: 360, w: 120 }],
    waterfallX: -62,
    low: { jungle: [0, 230], prairie: [-590, 170], redwood: [-470, 660], swamp: [580, 120], nesting: [520, 650] },
    high: { highland: [-40, -430], badlands: [-570, -430], mountain: [-80, -880] },
  };

  const escarpZ = (x) => L.escZ + 50 * nA.fbm2(x * 0.0022, 3.3, 3) + 14 * nB.noise2(x * 0.011, 1.7);

  // Land mask: organic coastline with bays and capes. >0 = land.
  const landness = (x, z) => {
    const r = Math.hypot(x * 0.97, z * 1.03);
    let v = 1 - r / 905;
    v += 0.16 * nA.fbm2(x * 0.0021 + 40, z * 0.0021 - 13, 4);
    v += 0.05 * nB.fbm2(x * 0.007, z * 0.007, 2);
    // keep key regions solid
    v += 0.1 * Math.exp(-((x - L.volcano.x) ** 2 + (z - L.volcano.z) ** 2) / (300 * 300));
    v += 0.08 * Math.exp(-((x - L.low.nesting[0]) ** 2 + (z - L.low.nesting[1] + 30) ** 2) / (240 * 240));
    v += 0.06 * Math.exp(-((x + 250) ** 2 + (z + 820) ** 2) / (260 * 260));
    return v;
  };

  // Soft Voronoi region weights on warped coordinates (organic borders).
  const warp = (x, z) => [x + 150 * nA.fbm2(x * 0.0021 + 20, z * 0.0021, 3), z + 150 * nA.fbm2(x * 0.0021, z * 0.0021 + 20, 3)];
  const softRegions = (bx, bz, centers, names, sharp = 1 / 26) => {
    let dmin = 1e9;
    const d = names.map((k) => { const c = centers[k]; const v = Math.hypot(bx - c[0], bz - c[1]); if (v < dmin) dmin = v; return v; });
    let sum = 0;
    const w = d.map((v) => { const e = Math.exp(-(v - dmin) * sharp); sum += e; return e; });
    const out = {};
    names.forEach((k, i) => (out[k] = w[i] / sum));
    return out;
  };

  // ------------------------------------------------------------------ macro terrain (4 m)
  const MS = 4;
  const MN = Math.floor(WORLD.SIZE / MS) + 1; // 513
  const macro = new Float32Array(MN * MN);
  const landF = new Float32Array(MN * MN);
  const lowF = LOW.map(() => new Float32Array(MN * MN));
  const highF = HIGH.map(() => new Float32Array(MN * MN));
  const wx = (i) => -HALF + i * MS;
  let _mk = 0;

  function macroHeight(x, z) {
    const land = landness(x, z);
    landF[_mk] = land;
    const coast = smoothstep(-0.02, 0.09, land); // 0 sea .. 1 inland
    const [qx, qz] = warp(x, z);

    // ---- lowlands per region
    const lw = softRegions(qx, qz, L.low, LOW);
    for (let r = 0; r < LOW.length; r++) lowF[r][_mk] = lw[LOW[r]];
    const base = 13 + 6 * nA.fbm2(qx * 0.0035, qz * 0.0035, 4) + 3 * nC.fbm2(qx * 0.012, qz * 0.012, 3);
    let low = 0;
    // jungle: lumpy with ravines and steep little hills (vistas!)
    const hills = Math.max(0, nD.fbm2(qx * 0.0055, qz * 0.0055, 3) + 0.1);
    low += lw.jungle * (base + hills * hills * 38 - 3 * Math.abs(nB.noise2(qx * 0.01, qz * 0.01)));
    // prairie: wide rolling hills
    low += lw.prairie * (13 + 8 * nA.fbm2(qx * 0.0042 + 3, qz * 0.0042, 3));
    // redwood: undulating ridges
    low += lw.redwood * (12 + 11 * nC.ridged2(qx * 0.005, qz * 0.005, 3));
    // swamp: flat, barely above sea
    low += lw.swamp * (1.25 + 1.4 * nA.fbm2(qx * 0.012, qz * 0.012, 3));
    // nesting grounds: dry open plateau with low mounds
    low += lw.nesting * (10 + 4 * nA.fbm2(qx * 0.006, qz * 0.006, 3));

    // ---- highlands
    const hw = softRegions(qx, qz, L.high, HIGH, 1 / 40);
    for (let r = 0; r < HIGH.length; r++) highF[r][_mk] = hw[HIGH[r]];
    let high = L.escH + 16 + 12 * nA.fbm2(qx * 0.003 + 11, qz * 0.003, 4) + 4 * nC.fbm2(qx * 0.015, qz * 0.015, 2);
    if (hw.badlands > 0.02) {
      const m = nD.fbm2(qx * 0.0065, qz * 0.0065, 3) * 0.5 + 0.5;
      const mesa = smoothstep(0.5, 0.56, m) * 26 + smoothstep(0.68, 0.72, m) * 15;
      const hh = high + mesa;
      const terr = Math.floor(hh / 6) * 6 + smoothstep(0.75, 1, (hh % 6) / 6) * 6;
      high = lerp(high, lerp(terr, hh, 0.12), hw.badlands);
    }
    if (hw.mountain > 0.02) {
      const rid = nC.ridged2(qx * 0.0031, qz * 0.0031, 5);
      high += hw.mountain * (rid * 175 + 30 * nA.fbm2(qx * 0.01, qz * 0.01, 3) + 25);
    }
    const v = L.volcano;
    const vd = Math.hypot(x - v.x, z - v.z) * (1 + 0.08 * nB.noise2(x * 0.01, z * 0.01));
    if (vd < v.r) {
      const t = 1 - vd / v.r;
      let cone = v.h * Math.pow(t, 1.55) + 8 * nC.noise2(x * 0.02, z * 0.02) * t;
      const ga = Math.atan2(z - v.z, x - v.x);
      cone -= Math.pow(Math.abs(Math.sin(ga * 7 + nB.noise2(vd * 0.02, 0) * 1.5)), 6) * 9 * t;
      // summit crater: a bowl sunk below the rim (the lava lake sits in it)
      const rimH = v.h * Math.pow(1 - v.crater / v.r, 1.55);
      const bowl = rimH + 3 - 40 * (1 - Math.min(1, (vd / v.crater) ** 2));
      cone = lerp(cone, Math.min(cone, bowl), smoothstep(v.crater + 12, v.crater - 8, vd));
      high = Math.max(high, high * (1 - t) + cone + 10 * t);
    }
    // ---- escarpment blend
    const ez = escarpZ(x);
    let cliffW = 7;
    for (const p of L.passes) cliffW = lerp(cliffW, 150, smoothstep(p.w, p.w * 0.25, Math.abs(x - p.x)));
    const hiW = smoothstep(cliffW * 0.5, -cliffW * 0.5, z - ez);
    let h = lerp(low, high, hiW);
    h += hiW * (1 - hiW) * 20 * nD.noise2(x * 0.05, z * 0.05);
    // ---- sea + beaches
    const shoreLow = lerp(1.0 + 1.6 * smoothstep(0.0, 0.08, land), h, smoothstep(0.05, 0.2, land));
    h = lerp(-26 + 7 * nA.noise2(x * 0.004, z * 0.004), shoreLow, coast);
    return h;
  }

  for (let j = 0; j < MN; j++) {
    for (let i = 0; i < MN; i++) { _mk = j * MN + i; macro[_mk] = macroHeight(wx(i), wx(j)); }
    if ((j & 31) === 0) onProgress(0.03 + 0.25 * (j / MN), 'Sculpting the island');
  }
  const bilin = (f, n, s, x, z) => {
    const fx = clamp((x + HALF) / s, 0, n - 1.001), fz = clamp((z + HALF) / s, 0, n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = f[j * n + i], b = f[j * n + i + 1], c = f[(j + 1) * n + i], d = f[(j + 1) * n + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const macroAt = (x, z) => bilin(macro, MN, MS, x, z);

  // ------------------------------------------------------------------ source lake (rim-contained)
  {
    let rimMin = Infinity, rimAng = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 48) {
      const h = macroAt(L.lake.x + Math.cos(a) * (L.lake.r + 18), L.lake.z + Math.sin(a) * (L.lake.r + 18));
      const southBias = Math.sin(a) > 0.2 ? -4 : 0; // prefer draining south toward the falls
      if (h + southBias < rimMin) { rimMin = h + southBias; rimAng = a; }
    }
    L.lake.level = Math.min(macroAt(L.lake.x, L.lake.z) - 2, rimMin + 4 - 1.2);
    L.lake.outAng = rimAng;
  }

  // ------------------------------------------------------------------ river path
  const ez0 = escarpZ(L.waterfallX);
  const outX = L.lake.x + Math.cos(L.lake.outAng) * (L.lake.r - 6), outZ = L.lake.z + Math.sin(L.lake.outAng) * (L.lake.r - 6);
  const ctrl = [
    [L.lake.x, L.lake.z],
    [outX, outZ],
    [lerp(outX, L.waterfallX, 0.3) + 45, lerp(outZ, ez0 - 60, 0.35)],
    [lerp(outX, L.waterfallX, 0.65) - 30, lerp(outZ, ez0 - 60, 0.7)],
    [L.waterfallX + 8, ez0 - 50],
    [L.waterfallX, ez0 - 6],
    [L.waterfallX - 1, ez0 + 12],
    [L.waterfallX - 4, ez0 + 45],
    [-58 + J(6), -40],
    [-46 + J(6), 40],
    [-80 + J(10), 120],
    [-20 + J(15), 190],
    [-90 + J(20), 290],
    [-10 + J(20), 380],
    [90 + J(20), 470],
    [40 + J(20), 590],
    [120 + J(20), 690],
    [80 + J(20), 800],
    [150, 900],
    [180, 1000],
  ];
  const cr = (p0, p1, p2, p3, t) => {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
  let riverPts = [];
  for (let s = 0; s < ctrl.length - 1; s++) {
    const p0 = ctrl[Math.max(0, s - 1)], p1 = ctrl[s], p2 = ctrl[s + 1], p3 = ctrl[Math.min(ctrl.length - 1, s + 2)];
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(2, Math.ceil(segLen / 2.5));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      let x = cr(p0[0], p1[0], p2[0], p3[0], t);
      const z = cr(p0[1], p1[1], p2[1], p3[1], t);
      const along = riverPts.length;
      x += 9 * nB.noise2(along * 0.012, 4.4) * smoothstep(escarpZ(x) + 60, escarpZ(x) + 140, z);
      riverPts.push({ x, z });
    }
  }
  // truncate at the river mouth (a little past the shoreline)
  {
    let cut = riverPts.length;
    for (let i = 20; i < riverPts.length; i++) if (macroAt(riverPts[i].x, riverPts[i].z) < -2.5) { cut = i + 1; break; }
    riverPts = riverPts.slice(0, cut);
  }
  let dist = 0;
  for (let i = 0; i < riverPts.length; i++) {
    const p = riverPts[i];
    if (i > 0) dist += Math.hypot(p.x - riverPts[i - 1].x, p.z - riverPts[i - 1].z);
    p.s = dist;
    const lowland = p.z > escarpZ(p.x) + 8;
    p.w = lowland ? 10 + 5 * smoothstep(0, 800, p.z) + 2 * nC.noise2(i * 0.03, 2) : 6.5 + 1.5 * nC.noise2(i * 0.03, 7);
    p.terrain = macroAt(p.x, p.z);
  }
  let level = L.lake.level;
  for (let i = 0; i < riverPts.length; i++) {
    const p = riverPts[i];
    const inLake = Math.hypot(p.x - L.lake.x, p.z - L.lake.z) < L.lake.r - 4;
    const target = inLake ? L.lake.level : Math.min(p.terrain - 1.5, level - 0.0035 * (i > 0 ? p.s - riverPts[i - 1].s : 0));
    level = Math.max(WORLD.SEA + 0.2, Math.min(level, target));
    p.level = level;
  }
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 1; i < riverPts.length - 1; i++) {
      const a = riverPts[i - 1].level, b = riverPts[i].level, c = riverPts[i + 1].level;
      if (a - c < 2.5) riverPts[i].level = Math.min(a, Math.max(c, (a + 2 * b + c) / 4));
    }
  }
  const waterfalls = [];
  for (let i = 1; i < riverPts.length; i++) {
    const drop = riverPts[i - 1].level - riverPts[i].level;
    if (drop > 2.0) {
      riverPts[i].fall = true; riverPts[i - 1].fallTop = true;
      const last = waterfalls[waterfalls.length - 1];
      if (last && i - last.i1 <= 3) { last.i1 = i; last.bottom = riverPts[i].level; last.x1 = riverPts[i].x; last.z1 = riverPts[i].z; }
      else waterfalls.push({ i0: i - 1, i1: i, top: riverPts[i - 1].level, bottom: riverPts[i].level, x0: riverPts[i - 1].x, z0: riverPts[i - 1].z, x1: riverPts[i].x, z1: riverPts[i].z });
    }
  }
  const mainFall = waterfalls.reduce((a, b) => (!a || b.top - b.bottom > a.top - a.bottom ? b : a), null);

  // ------------------------------------------------------------------ river distance field (4 m)
  const rDist = new Float32Array(MN * MN).fill(1e9);
  const rIdx = new Float32Array(MN * MN).fill(-1);
  const REACH = 140;
  for (let i = 0; i < riverPts.length - 1; i++) {
    const a = riverPts[i], b = riverPts[i + 1];
    const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - REACH + HALF) / MS)), i1 = Math.min(MN - 1, Math.ceil((Math.max(a.x, b.x) + REACH + HALF) / MS));
    const j0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - REACH + HALF) / MS)), j1 = Math.min(MN - 1, Math.ceil((Math.max(a.z, b.z) + REACH + HALF) / MS));
    const dx = b.x - a.x, dz = b.z - a.z, ll = dx * dx + dz * dz || 1;
    for (let jj = j0; jj <= j1; jj++) {
      const z = wx(jj);
      for (let ii = i0; ii <= i1; ii++) {
        const x = wx(ii);
        let t = ((x - a.x) * dx + (z - a.z) * dz) / ll;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
        const k = jj * MN + ii;
        if (d < rDist[k]) { rDist[k] = d; rIdx[k] = i + t; }
      }
    }
  }
  const riverAt = (idx) => {
    const i = clamp(Math.floor(idx), 0, riverPts.length - 2);
    const t = clamp(idx - i, 0, 1);
    const a = riverPts[i], b = riverPts[i + 1];
    return { level: lerp(a.level, b.level, t), w: lerp(a.w, b.w, t), fall: !!(a.fall || b.fall || a.fallTop) };
  };

  // ------------------------------------------------------------------ trails
  const trails = buildTrails(L, rng, escarpZ);
  const trailField = rasterTrails(trails, MN, MS, HALF);

  // ------------------------------------------------------------------ fine height (1 m)
  const height = new Float32Array(N * N);
  const crashBase = macroAt(L.crash.x, L.crash.z) + 0.2;
  const poolX = mainFall ? mainFall.x1 : 0, poolZ = mainFall ? mainFall.z1 + 8 : 0, poolLevel = mainFall ? mainFall.bottom : 0;
  for (let j = 0; j < N; j++) {
    const z = -HALF + j;
    for (let i = 0; i < N; i++) {
      const x = -HALF + i;
      let h = macroAt(x, z);
      h += (nC.noise2(x * 0.045, z * 0.045) * 0.85 + nD.noise2(x * 0.11, z * 0.11) * 0.3) * (h > 1 ? 1 : 0.3);
      // river carve
      const rd = bilin(rDist, MN, MS, x, z);
      if (rd < REACH) {
        const r = riverAt(bilin(rIdx, MN, MS, x, z));
        const hw = r.w * 0.5;
        if (rd < hw) {
          const t = rd / hw;
          const depth = r.fall ? 3.2 : 1.3 + r.w * 0.07;
          h = Math.min(h, r.level - 0.25 - depth * (1 - t * t));
        } else {
          // broad natural valley: cut the terrain down toward a concave profile
          const hi = r.level > 30;
          const vw = hi ? 45 : 120;
          const dd = rd - hw;
          if (dd < vw) {
            const prof = r.level + 0.55 + dd * (hi ? 0.2 : 0.1) + (dd / 38) * (dd / 38) * (hi ? 9 : 6);
            const w = 1 - smoothstep(0, vw, dd);
            if (h > prof) h = lerp(h, prof, w);
            const minBank = r.level + 0.3 + dd * 0.15;
            if (h < minBank && dd < 10 && !r.fall) h = lerp(minBank, h, smoothstep(4, 10, dd));
            if (dd < 2.5) h = Math.min(h, lerp(r.level - 0.35, Math.max(h, r.level + 0.3), dd / 2.5));
          }
        }
      }
      // waterfall plunge pool
      if (mainFall) {
        const pd = Math.hypot(x - poolX, (z - poolZ) * 1.2);
        if (pd < 34) {
          const t = pd / 18;
          if (t < 1) h = Math.min(h, poolLevel - 0.3 - 3.5 * (1 - t * t));
          else if (h < poolLevel + 0.6 && z > poolZ - 6) h = lerp(poolLevel + 0.6, h, smoothstep(18, 34, pd));
        }
      }
      // lake basin
      const ld = Math.hypot(x - L.lake.x, z - L.lake.z) + 7 * nB.noise2(x * 0.03, z * 0.03);
      if (ld < L.lake.r + 36) {
        const t = ld / L.lake.r;
        if (t < 1) h = Math.min(h, L.lake.level - 0.3 - 7 * (1 - t * t));
        else h = Math.max(h, lerp(L.lake.level + 0.5, h, smoothstep(1, 1 + 36 / L.lake.r, t)));
      }
      // meteor crater
      const cd = Math.hypot(x - L.crater.x, z - L.crater.z);
      if (cd < L.crater.r * 1.8) {
        const t = cd / L.crater.r;
        const bowl = t < 1 ? -9 * (1 - t * t) + 3 * t * t * t : 0;
        const rim = 6 * Math.exp(-((t - 1) * (t - 1)) / 0.035);
        h += bowl + rim;
      }
      // crash site clearing
      const kd = Math.hypot(x - L.crash.x, z - L.crash.z);
      if (kd < 60) h = lerp(crashBase + (h - crashBase) * 0.12, h, smoothstep(16, 60, kd));
      // skid trench (van came in from the north-east)
      {
        const sx = L.crash.x + 5, sz = L.crash.z - 3, ex = L.crash.x + 50, ez = L.crash.z - 44;
        const dx = ex - sx, dz = ez - sz, ll = dx * dx + dz * dz;
        const tt = ((x - sx) * dx + (z - sz) * dz) / ll;
        if (tt > -0.05 && tt < 1.05) {
          const t = clamp(tt, 0, 1);
          const d = Math.hypot(x - (sx + dx * t), z - (sz + dz * t));
          if (d < 3.4) h -= (1 - d / 3.4) * 0.6 * (1 - t * 0.6);
        }
      }
      const tr = bilin(trailField, MN, MS, x, z);
      if (tr > 0) h -= tr * 0.3;
      height[j * N + i] = h;
    }
    if ((j & 63) === 0) onProgress(0.3 + 0.38 * (j / N), 'Carving rivers and valleys');
  }
  const hAt = (x, z) => bilin(height, N, 1, x + 0, z + 0);

  // ------------------------------------------------------------------ ocean flood fill (2 m)
  const SS = WORLD.SIZE / M; // 2
  const hCell = new Float32Array(M * M);
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) hCell[j * M + i] = hAt(-HALF + (i + 0.5) * SS, -HALF + (j + 0.5) * SS);
  const ocean = new Uint8Array(M * M);
  {
    const q = new Int32Array(M * M);
    let qh = 0, qt = 0;
    const push = (k) => { if (!ocean[k] && hCell[k] < WORLD.SEA) { ocean[k] = 1; q[qt++] = k; } };
    for (let i = 0; i < M; i++) { push(i); push((M - 1) * M + i); push(i * M); push(i * M + M - 1); }
    while (qh < qt) {
      const k = q[qh++], i = k % M, j = (k / M) | 0;
      if (i > 0) push(k - 1); if (i < M - 1) push(k + 1); if (j > 0) push(k - M); if (j < M - 1) push(k + M);
    }
  }
  onProgress(0.72, 'Filling the sea');

  // ------------------------------------------------------------------ biome / splat / water (2 m)
  const biome = new Uint8Array(M * M);
  const splat = new Uint8Array(M * M * 4); // id1, id2, blend, grassDensity
  const water = new Float32Array(M * M).fill(-1000);
  const v = L.volcano;
  for (let j = 0; j < M; j++) {
    const z = -HALF + (j + 0.5) * SS;
    for (let i = 0; i < M; i++) {
      const x = -HALF + (i + 0.5) * SS;
      const k = j * M + i;
      const h = hCell[k];
      const hx = hAt(x + 1.5, z) - hAt(x - 1.5, z), hz = hAt(x, z + 1.5) - hAt(x, z - 1.5);
      const slope = Math.hypot(hx, hz) / 3;
      const north = z < escarpZ(x) - 4;
      const n1 = nA.noise2(x * 0.02, z * 0.02);
      const n2 = nB.noise2(x * 0.05 + 3, z * 0.05);
      const land = bilin(landF, MN, MS, x, z);

      // water surfaces
      let wl = ocean[k] ? WORLD.SEA : -1000;
      const rd = bilin(rDist, MN, MS, x, z);
      let nearRiver = 0;
      if (rd < 70) {
        const rr = riverAt(bilin(rIdx, MN, MS, x, z));
        if (rd < rr.w * 0.5 + 3 && h < rr.level + 0.15) wl = Math.max(wl, rr.level);
        if (rd < rr.w * 0.5 + 5) nearRiver = 2; else nearRiver = 1;
      }
      if (mainFall && Math.hypot(x - poolX, (z - poolZ) * 1.2) < 22 && h < poolLevel) wl = Math.max(wl, poolLevel);
      if (Math.hypot(x - L.lake.x, z - L.lake.z) < L.lake.r + 30 && h < L.lake.level) wl = Math.max(wl, L.lake.level);

      // biome
      let b;
      if (ocean[k] && h < -0.4) b = BIOME.OCEAN;
      else if (north) {
        const vd = Math.hypot(x - v.x, z - v.z);
        if (vd < v.r * 1.02 + 30 * n1) b = BIOME.VOLCANIC;
        else if (bilin(highF[1], MN, MS, x, z) > 0.5) b = BIOME.BADLANDS;
        else if (bilin(highF[2], MN, MS, x, z) > 0.5) b = h > 140 + 25 * n2 ? BIOME.SNOW : BIOME.MOUNTAIN;
        else b = BIOME.HIGHLAND;
      } else {
        let best = 'jungle', bw = -1;
        for (let r = 0; r < LOW.length; r++) { const w = bilin(lowF[r], MN, MS, x, z); if (w > bw) { bw = w; best = LOW[r]; } }
        b = { jungle: BIOME.JUNGLE, prairie: BIOME.PRAIRIE, redwood: BIOME.REDWOOD, swamp: BIOME.SWAMP, nesting: BIOME.NESTING }[best];
      }
      const beachy = b !== BIOME.OCEAN && b !== BIOME.SWAMP && h < 3.4 + 1.2 * n2 && land < 0.2 && !north;
      if (beachy) b = BIOME.BEACH;
      if (Math.hypot(x - L.crater.x, z - L.crater.z) < L.crater.r * 1.12) b = BIOME.CRATER;
      if (nearRiver === 2 && b !== BIOME.OCEAN && b !== BIOME.BEACH) b = BIOME.RIVER;
      // swamp pools (only inland)
      if (b === BIOME.SWAMP && !ocean[k] && h < 1.3 && n1 > 0.05) wl = Math.max(wl, 1.1);
      water[k] = wl;
      biome[k] = b;

      // materials
      let m1 = MAT.GRASS, m2 = MAT.GRASS, bl = 0, grass = 0;
      const steep = slope > 1.05, mid = slope > 0.55;
      switch (b) {
        case BIOME.OCEAN: m1 = MAT.SAND; m2 = MAT.GRAVEL; bl = 0.3 + 0.3 * n2; break;
        case BIOME.BEACH: m1 = MAT.SAND; m2 = h < 0.7 ? MAT.GRAVEL : MAT.GRASS; bl = h < 0.7 ? 0.2 + 0.2 * n2 : smoothstep(1.8, 3.2, h) * 0.85; grass = h > 2.0 ? 80 : 0; break;
        case BIOME.JUNGLE: m1 = MAT.JUNGLE; m2 = n1 > 0.1 ? MAT.MOSS : n1 < -0.35 ? MAT.GRASS : MAT.DIRT; bl = 0.18 + 0.3 * Math.abs(n2); grass = 150 + 80 * n1; break;
        case BIOME.RIVER: {
          const above = h - (wl > -999 ? wl : h - 1);
          m1 = above < 0.5 ? MAT.GRAVEL : MAT.GRASS; m2 = above < 0.5 ? MAT.MUD : MAT.GRAVEL; bl = 0.3 + 0.3 * n2; grass = above > 0.6 ? 120 : 0; break;
        }
        case BIOME.PRAIRIE: m1 = MAT.GRASS; m2 = n1 > 0.3 ? MAT.DRYGRASS : MAT.GRASS; bl = 0.45; grass = 230; break;
        case BIOME.REDWOOD: m1 = MAT.NEEDLES; m2 = MAT.MOSS; bl = 0.25 + 0.25 * n2; grass = 60; break;
        case BIOME.SWAMP: m1 = MAT.MUD; m2 = MAT.MOSS; bl = 0.4 + 0.3 * n1; grass = 130; break;
        case BIOME.NESTING: m1 = MAT.DRYGRASS; m2 = MAT.DIRT; bl = 0.35 + 0.3 * n2; grass = 140; break;
        case BIOME.HIGHLAND: m1 = MAT.GRASS; m2 = MAT.DRYGRASS; bl = 0.3 + 0.4 * n1; grass = 200; break;
        case BIOME.BADLANDS: m1 = MAT.REDSAND; m2 = MAT.SANDSTONE; bl = mid ? 0.9 : 0.12 + 0.2 * n2; grass = 12; break;
        case BIOME.MOUNTAIN: m1 = MAT.ROCK; m2 = MAT.GRASS; bl = smoothstep(0.9, 0.3, slope) * 0.75; grass = bl > 0.45 ? 110 : 0; break;
        case BIOME.SNOW: m1 = MAT.SNOW; m2 = MAT.ROCK; bl = smoothstep(0.45, 1.0, slope); grass = 0; break;
        case BIOME.VOLCANIC: { const vd = Math.hypot(x - v.x, z - v.z); m1 = MAT.ASH; m2 = MAT.BASALT; bl = 0.3 + 0.4 * n1; grass = vd > v.r * 0.85 ? 40 : 0; break; }
        case BIOME.CRATER: m1 = MAT.CLAY; m2 = MAT.GRAVEL; bl = 0.3 + 0.3 * n2; grass = 20; break;
      }
      if (b !== BIOME.OCEAN) {
        if (steep) {
          const rockMat = b === BIOME.BADLANDS ? MAT.SANDSTONE : b === BIOME.VOLCANIC ? MAT.BASALT : MAT.ROCK;
          m2 = m1 === rockMat ? MAT.ROCK : m1; m1 = rockMat; bl = smoothstep(1.6, 1.05, slope) * 0.45; grass = 0;
        } else if (mid && b !== BIOME.BADLANDS && b !== BIOME.SNOW) {
          m2 = b === BIOME.VOLCANIC ? MAT.BASALT : MAT.ROCK; bl = smoothstep(0.55, 1.05, slope) * 0.65; grass *= 0.4;
        }
      }
      const tr = bilin(trailField, MN, MS, x, z);
      if (tr > 0.12 && !steep && b !== BIOME.OCEAN && b !== BIOME.SNOW && wl < h) {
        m2 = m1; m1 = b === BIOME.BADLANDS ? MAT.REDSAND : MAT.DIRT; bl = smoothstep(0.85, 0.12, tr) * 0.75; grass *= 1 - tr;
      }
      const kd = Math.hypot(x - L.crash.x, z - L.crash.z);
      if (kd < 10) { m1 = MAT.DIRT; m2 = MAT.JUNGLE; bl = smoothstep(4, 10, kd) * 0.8; grass *= smoothstep(5, 11, kd); }
      if (wl > h + 0.05 && b !== BIOME.SWAMP) grass = 0;
      splat[k * 4] = m1;
      splat[k * 4 + 1] = m2;
      splat[k * 4 + 2] = Math.round(clamp(bl, 0, 1) * 255);
      splat[k * 4 + 3] = Math.round(clamp(grass, 0, 255));
    }
    if ((j & 31) === 0) onProgress(0.74 + 0.24 * (j / M), 'Painting biomes');
  }

  // ------------------------------------------------------------------ POIs
  const onLand = (x, z) => hAt(x, z) > 1.5 && !ocean[clamp(Math.floor((z + HALF) / SS), 0, M - 1) * M + clamp(Math.floor((x + HALF) / SS), 0, M - 1)];
  const pois = buildPOIs(L, hAt, onLand, rng, mainFall);

  onProgress(1, 'Done');
  return {
    seed, N, M, size: WORLD.SIZE, half: HALF,
    height, splat, biome, water,
    river: riverPts.map((p) => [p.x, p.z, p.level, p.w, p.fall ? 1 : 0]),
    waterfalls,
    pool: mainFall ? { x: poolX, z: poolZ, level: poolLevel, r: 20 } : null,
    lake: { x: L.lake.x, z: L.lake.z, r: L.lake.r, level: L.lake.level },
    layout: { escZ: L.escZ, volcano: L.volcano, crater: L.crater, crash: L.crash, passes: L.passes, tarpits: L.tarpits, low: L.low, high: L.high },
    trails,
    pois,
    genMs: Date.now() - t0,
  };
}

// ------------------------------------------------------------------ dino trails
function buildTrails(L, rng, escarpZ) {
  const C = L.crash;
  const nodes = {
    crash: [C.x + 18, C.z + 12],
    jungleN: [60, escarpZ(60) + 50],
    prairie: [-500, 250],
    crater: [L.crater.x + 75, L.crater.z],
    tar: [L.tarpits.x, L.tarpits.z],
    redwood: [-430, 620],
    beach: [-10, 760],
    swamp: [500, 160],
    nest: [520, 600],
    westPass: [L.passes[0].x, escarpZ(L.passes[0].x) + 30],
    westPassTop: [L.passes[0].x - 10, escarpZ(L.passes[0].x) - 130],
    eastPass: [L.passes[1].x, escarpZ(L.passes[1].x) + 30],
    eastPassTop: [L.passes[1].x + 10, escarpZ(L.passes[1].x) - 130],
    highland: [-20, -420],
    lake: [L.lake.x + 120, L.lake.z + 30],
    badlands: [L.high.badlands[0] + 80, L.high.badlands[1] + 60],
    volcano: [L.volcano.x - 260, L.volcano.z + 150],
    mountains: [-80, -700],
  };
  const links = [
    ['crash', 'jungleN'], ['crash', 'prairie'], ['prairie', 'crater'], ['prairie', 'tar'], ['tar', 'redwood'], ['crash', 'beach'],
    ['beach', 'nest'], ['crash', 'swamp'], ['swamp', 'nest'], ['prairie', 'westPass'], ['westPass', 'westPassTop'], ['westPassTop', 'badlands'],
    ['westPassTop', 'highland'], ['swamp', 'eastPass'], ['eastPass', 'eastPassTop'], ['eastPassTop', 'volcano'], ['eastPassTop', 'highland'],
    ['highland', 'lake'], ['highland', 'mountains'], ['lake', 'badlands'],
  ];
  const trails = [];
  for (const [a, b] of links) {
    const A = nodes[a], B = nodes[b];
    const pts = [];
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const steps = Math.ceil(len / 8);
    const px = -(B[1] - A[1]) / len, pz = (B[0] - A[0]) / len;
    const wob1 = rng.range(-1, 1) * len * 0.12, wob2 = rng.range(-1, 1) * len * 0.05;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const off = Math.sin(t * Math.PI) * wob1 + Math.sin(t * Math.PI * 3) * wob2;
      pts.push([A[0] + (B[0] - A[0]) * t + px * off, A[1] + (B[1] - A[1]) * t + pz * off]);
    }
    trails.push({ a, b, pts, w: 2.2 + rng.range(0, 1.2) });
  }
  return trails;
}

function rasterTrails(trails, MN, MS, HALF) {
  const f = new Float32Array(MN * MN);
  for (const tr of trails) {
    for (let k = 0; k < tr.pts.length - 1; k++) {
      const [ax, az] = tr.pts[k], [bx, bz] = tr.pts[k + 1];
      const R = tr.w + 4;
      const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - R + HALF) / MS)), i1 = Math.min(MN - 1, Math.ceil((Math.max(ax, bx) + R + HALF) / MS));
      const j0 = Math.max(0, Math.floor((Math.min(az, bz) - R + HALF) / MS)), j1 = Math.min(MN - 1, Math.ceil((Math.max(az, bz) + R + HALF) / MS));
      const dx = bx - ax, dz = bz - az, ll = dx * dx + dz * dz || 1;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -HALF + i * MS, z = -HALF + j * MS;
        let t = ((x - ax) * dx + (z - az) * dz) / ll;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
        const vv = clamp(1 - d / tr.w, 0, 1);
        const idx = j * MN + i;
        if (vv > f[idx]) f[idx] = vv;
      }
    }
  }
  return f;
}

// ------------------------------------------------------------------ points of interest
function buildPOIs(L, hAt, onLand, rng, mainFall) {
  const pois = [];
  const add = (id, name, x, z, extra = {}) => {
    // nudge toward the island centre until it is on land
    let k = 0;
    while (!onLand(x, z) && k++ < 60) { x *= 0.97; z *= 0.97; }
    pois.push({ id, name, x, z, y: hAt(x, z), ...extra });
  };
  add('crash', 'Crash Site', L.crash.x, L.crash.z, { radius: 28 });
  if (mainFall) {
    add('waterfall', 'Thunder Falls', mainFall.x1, mainFall.z1 + 8, { radius: 30, top: mainFall.top, bottom: mainFall.bottom, fallX0: mainFall.x0, fallZ0: mainFall.z0, fallX1: mainFall.x1, fallZ1: mainFall.z1 });
    pois.push({ id: 'fallcave', name: 'Cave Behind the Falls', x: mainFall.x1 + 1, z: mainFall.z1 + 1.5, y: mainFall.bottom + 0.5, radius: 8, secret: true });
  }
  add('lake', 'Mirror Lake', L.lake.x, L.lake.z, { radius: L.lake.r });
  add('crater', 'Meteor Crater', L.crater.x, L.crater.z, { radius: L.crater.r });
  add('tarpits', 'Tar Pits', L.tarpits.x, L.tarpits.z, { radius: 30 });
  add('raptorden', 'Raptor Den', 220 + rng.range(-20, 20), -70 + rng.range(-20, 20), { radius: 22 });
  add('skeleton', 'Big Bones', L.high.badlands[0] + 100, L.high.badlands[1] + 130, { radius: 26 });
  add('petrified', 'Petrified Forest', L.high.badlands[0] - 70, L.high.badlands[1] - 50, { radius: 40 });
  add('ptera', 'Pteranodon Cliffs', -250 + rng.range(-40, 40), -770, { radius: 40 });
  add('caldera', 'Volcano Caldera', L.volcano.x, L.volcano.z, { radius: L.volcano.crater });
  add('rexnest', 'Rex Nesting Grounds', 540, 600, { radius: 45 });
  add('deadtree', 'The Old Dead Tree', 560, 110, { radius: 18 });
  add('camp', 'Abandoned Camp', -420, 540, { radius: 14 });
  add('crystalcave', 'Crystal Grotto', 250, -640, { radius: 12 });
  add('tidepools', 'Tide Pools', -200, 790, { radius: 30 });
  add('hotsprings', 'Hot Springs', L.volcano.x - 250, L.volcano.z + 230, { radius: 18 });
  add('grove', 'Monkey Puzzle Grove', 150, 250, { radius: 35 });
  return pois;
}

// shared sampling helpers (used by the main thread after transfer)
export function makeSampler(world) {
  const { N, M, half, height, water, biome, splat } = world;
  const hAt = (x, z) => {
    const fx = Math.min(Math.max(x + half, 0), N - 1.001), fz = Math.min(Math.max(z + half, 0), N - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = height[j * N + i], b = height[j * N + i + 1], c = height[(j + 1) * N + i], d = height[(j + 1) * N + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const cell = (x, z) => {
    const i = Math.min(M - 1, Math.max(0, Math.floor((x + half) / 2)));
    const j = Math.min(M - 1, Math.max(0, Math.floor((z + half) / 2)));
    return j * M + i;
  };
  return {
    heightAt: hAt,
    normalAt(x, z, out) {
      const e = 0.75;
      const nx = hAt(x - e, z) - hAt(x + e, z), nz = hAt(x, z - e) - hAt(x, z + e);
      const ny = 2 * e;
      const l = Math.hypot(nx, ny, nz);
      out.x = nx / l; out.y = ny / l; out.z = nz / l;
      return out;
    },
    slopeAt(x, z) {
      const e = 1;
      return Math.hypot(hAt(x + e, z) - hAt(x - e, z), hAt(x, z + e) - hAt(x, z - e)) / (2 * e);
    },
    waterAt(x, z) { return water[cell(x, z)]; },
    biomeAt(x, z) { return biome[cell(x, z)]; },
    matAt(x, z) { const k = cell(x, z) * 4; return splat[k + 2] > 140 ? splat[k + 1] : splat[k]; },
    grassAt(x, z) { return splat[cell(x, z) * 4 + 3] / 255; },
    hash: (x, z, s) => hash2i(Math.floor(x), Math.floor(z), s),
  };
}
