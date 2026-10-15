// The pure half of the creature pipeline (no three.js, runs on a worker):
// run a species' sculpting script, scale it to the species' size, resolve
// colours, mesh both levels of detail and measure the result.
import { sculpt, prepShape, eulerToLocal, basisFromDir } from './sculpt.js';
import { DESIGNS } from './creatureDesigns.js';
import './humanDesign.js'; // registers the bean scientists

const lin = (hex) => {
  const f = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [f(((hex >> 16) & 255) / 255), f(((hex >> 8) & 255) / 255), f((hex & 255) / 255)];
};
const ELEMENT_GLOW = { fire: 0xff5a14, water: 0x2ac8ff, electric: 0xffd02a, grass: 0x9aff4a, crystal: 0x5ad8ff, earth: 0xff9a20, toxic: 0x9aff1a, wind: 0x7af0d8 };
// colour slots every design can use; species looks (and alphas) override them
export const PAL0 = { body: 0x8a8a7a, belly: 0xeee6d0, accent: 0xd0a040, pat: 0x4a4038, horn: 0xe8dcc0, claw: 0x2a2420, hoof: 0x2c2624, nose: 0x3a2c2c, mouth: 0x5a1a24, tongue: 0xe0607a, dark: 0x2c262a, light: 0xf6f0e4, wool: 0xf4ecdc, pad: 0x4a3a3a, glow: 0xffd040, eye: 0x6a4020, sclera: 0xfbf7ee, lid: null };

// ======================================================================== design builder
export class Builder {
  constructor(sp) {
    this.sp = sp; this.L = sp.look ?? {};
    this.size = sp.size;
    this.bones = []; this.bi = {};
    this.shapes = [];
    this.eyes = []; this.teeth = []; this.attach = []; this.legs = []; this.springs = []; this.tongue = null;
    this.roles = { spine: [], neck: [], tail: [], ears: [], arms: [], wings: [] };
    this.groupOpts = {};
    this.res = 84;
    this.anim = {};
    this.mouth = null;
    this.def = { mat: [0.4, 0, 0, 0] };
  }
  bone(name, parent, p) { this.bi[name] = this.bones.length; this.bones.push({ name, parent: parent ?? null, pos: p.slice() }); return name; }
  P(name) { const b = this.bones[this.bi[name]]; if (!b) throw new Error('no bone ' + name); return b.pos; }
  group(name, opt) { this.groupOpts[name] = { ...(this.groupOpts[name] ?? {}), ...opt }; }
  mirror(fn) { fn(1, 'R'); fn(-1, 'L'); }
  _add(s, o) {
    s.g = o.g ?? 'main';
    s.op = o.op ?? 'add';
    s.k = o.k ?? 0;
    if (o.amp) { s.amp = o.amp; s.nf = o.nf ?? 8; s.seed = o.seed ?? 1; s.oct = o.oct; s.ridge = o.ridge; }
    s.bspec = o.b ?? null;
    s.colSlot = o.col ?? (s.op === 'add' ? 'body' : null);
    if (o.cf !== undefined) s.cf = o.cf;
    if (o.cp !== undefined) s.cp = o.cp;
    if (o.wf !== undefined) s.wf = o.wf;
    s.matSpec = o.mat ?? null;
    s.belly = o.belly ?? 0;
    if (s.t === 'ell' || s.t === 'box' || s.t === 'tri' || s.t === 'cyl') s.m = o.dir ? basisFromDir(o.dir[0], o.dir[1], o.dir[2], ...(o.up ?? [0, 1, 0]), o.roll ?? 0) : eulerToLocal(...(o.rot ?? [0, 0, 0]));
    this.shapes.push(s);
    return s;
  }
  sph(c, r, o = {}) { return this._add({ t: 'sph', c: c.slice(), r }, o); }
  ell(c, r, o = {}) { return this._add({ t: 'ell', c: c.slice(), r: r.slice() }, o); }
  cone(a, b, ra, rb, o = {}) { return this._add({ t: 'cone', a: a.slice(), b: b.slice(), ra, rb }, o); }
  box(c, r, round, o = {}) { return this._add({ t: 'box', c: c.slice(), r: r.slice(), round }, o); }
  // a capped cylinder: centre, radius, half length, rim rounding; o.dir is its axis
  cyl(c, r, hh, round, o = {}) { return this._add({ t: 'cyl', c: c.slice(), r: [r, hh], round }, o); }
  // flat rounded triangle (ears, fins, spikes, sails): base centre c, r = [half width, height, half thickness];
  // o.dir points the apex, o.up is the flat face's normal
  tri(c, r, round, o = {}) {
    if (o.dir) { const f = o.up ?? [0, 0, 1]; o = { ...o, dir: f, up: o.dir }; }
    return this._add({ t: 'tri', c: c.slice(), r: r.slice(), round }, o);
  }
  // a smooth tube through points with per-point radii; o.b is one bone or one bone per point
  chain(pts, radii, o = {}) {
    const per = Array.isArray(o.b) && o.b.length === pts.length;
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(this.cone(pts[i], pts[i + 1], radii[i], radii[i + 1], { ...o, b: per ? [[o.b[i], 0], [o.b[i + 1], 1]] : o.b }));
    return out;
  }
  // scatter little lumps over an ellipsoid (wool, fluff, moss, pebbles)
  scatter(c, r, n, lump, o = {}) {
    const out = [];
    const ga = Math.PI * (3 - Math.sqrt(5));
    const seed = o.seed ?? 3;
    const m = o.rot ? eulerToLocal(...o.rot) : null;
    for (let i = 0; i < n; i++) {
      const y = 1 - (i + 0.5) / n * 2, rr = Math.sqrt(1 - y * y), th = ga * i + seed;
      let lx = Math.cos(th) * rr, ly = y, lz = Math.sin(th) * rr;
      if (o.filter && !o.filter(lx, ly, lz)) continue;
      const j = 0.8 + 0.4 * Math.abs(Math.sin(i * 12.9898 + seed * 78.233));
      let px = lx * r[0] * (o.inset ?? 0.92), py = ly * r[1] * (o.inset ?? 0.92), pz = lz * r[2] * (o.inset ?? 0.92);
      if (m) { const wx = m[0] * px + m[3] * py + m[6] * pz, wy = m[1] * px + m[4] * py + m[7] * pz, wz = m[2] * px + m[5] * py + m[8] * pz; px = wx; py = wy; pz = wz; }
      const sh = this.sph([c[0] + px, c[1] + py, c[2] + pz], lump * j, o);
      // lumps take their bones and colours from the shape they sit on
      if (!o.attr) sh.noAttr = true;
      out.push(sh);
    }
    return out;
  }
  eye(o) { this.eyes.push(o); }
  tooth(o) { this.teeth.push(o); }
  add(o) { this.attach.push(o); }
  leg(o) { this.legs.push(o); }
  spring(o) { this.springs.push(o); }
}

function palette(b, sp) {
  const L = sp.look ?? {};
  const P = { ...PAL0, ...(b.pal ?? {}) };
  if (L.color !== undefined) P.body = L.color;
  if (L.belly !== undefined) P.belly = L.belly;
  if (L.accent !== undefined) P.accent = L.accent;
  if (L.pcolor !== undefined) P.pat = L.pcolor;
  // colour overrides from the look (numbers only: old looks also carry shape parameters)
  for (const k of Object.keys(PAL0)) if (typeof L[k] === 'number' && !['body', 'belly', 'accent', 'pat'].includes(k)) P[k] = L[k];
  P.glow = L.glow ?? b.pal?.glow ?? ELEMENT_GLOW[sp.element] ?? P.glow;
  if (P.lid === null) P.lid = P.body;
  return P;
}
function resolveMat(spec, def) {
  if (!spec) return def.slice();
  if (Array.isArray(spec)) return spec.slice();
  return [spec.fur ?? def[0], spec.gloss ?? 0, spec.pat ?? 0, spec.glow ?? 0];
}
export function sculptSpecies(sp) {
  const script = DESIGNS[sp.design ?? sp.id] ?? DESIGNS._fallback;
  const b = new Builder(sp);
  script(b, sp.look ?? {}, sp);
  const s = sp.size / b.size;
  const P = palette(b, sp);
  const linP = Object.fromEntries(Object.entries(P).map(([k, v]) => [k, lin(v)]));
  const colOf = (c) => (c === null || c === undefined ? null : Array.isArray(c) ? c : typeof c === 'number' ? lin(c) : linP[c] ?? lin(0xff00ff));
  // ---- bones
  const bones = b.bones.map((x) => ({ name: x.name, parent: x.parent === null ? -1 : b.bi[x.parent], pos: x.pos.map((v) => v * s) }));
  const bidx = (n) => { const i = b.bi[n]; if (i === undefined) throw new Error(`${sp.id}: no bone ${n}`); return i; };
  const bwOf = (spec) => {
    if (!spec) return null;
    if (typeof spec === 'string') return [[bidx(spec), 0]];
    if (spec.length && typeof spec[0] === 'string') return spec.length === 1 ? [[bidx(spec[0]), 0]] : spec.map((n, i) => [bidx(n), i / (spec.length - 1)]);
    return spec.map(([n, t]) => [bidx(n), t]);
  };
  // ---- shapes
  const groups = {};
  for (const sh0 of b.shapes) {
    const sh = { ...sh0 };
    if (sh.c) sh.c = sh.c.map((v) => v * s);
    if (sh.a) { sh.a = sh.a.map((v) => v * s); sh.b = sh.b.map((v) => v * s); sh.ra *= s; sh.rb *= s; }
    if (sh.t === 'sph') sh.r *= s; else if (sh.r && sh.t !== 'cone') sh.r = sh.r.map((v) => v * s);
    if (sh.round) sh.round *= s;
    sh.k *= s;
    if (sh.amp) { sh.amp *= s; sh.nf /= s; }
    if (sh.cf !== undefined && sh.cf > 0) sh.cf *= s;
    if (sh.wf !== undefined) sh.wf *= s;
    sh.col = colOf(sh.colSlot);
    sh.mat = resolveMat(sh.matSpec, b.def.mat);
    if (sh.op === 'add') {
      sh.bw = bwOf(sh.bspec);
      if (!sh.bw) throw new Error(`${sp.id}: shape without bone`);
    }
    prepShape(sh);
    (groups[sh.g] ??= { shapes: [], hideIn: b.groupOpts[sh.g]?.hideIn, hk: b.groupOpts[sh.g]?.hk }).shapes.push(sh);
  }
  // ---- voxel size from the size of the whole sculpt
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const [gn, g] of Object.entries(groups)) if (gn === 'main' || !groups.main) for (const sh of g.shapes) if (sh.op === 'add') for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], sh.lo[i]); hi[i] = Math.max(hi[i], sh.hi[i]); }
  const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  const h0 = ext / b.res;
  const design = { groups, bones, pal: linP };
  const R0 = sculpt({ ...design, h: h0 });
  const R1 = sculpt({ ...design, h: h0 * 2.1 });
  // ---- measurements from the main skin
  let ymax = 0, zmin = Infinity, zmax = -Infinity;
  const mg = R0.groups.find((g) => g.name === 'main') ?? R0.groups[0];
  for (let v = mg.v0; v < mg.v0 + mg.nv; v++) { ymax = Math.max(ymax, R0.pos[v * 3 + 1]); zmin = Math.min(zmin, R0.pos[v * 3 + 2]); zmax = Math.max(zmax, R0.pos[v * 3 + 2]); }
  for (const g of R0.groups) if (g.name !== 'main') for (let v = g.v0; v < g.v0 + g.nv; v++) ymax = Math.max(ymax, R0.pos[v * 3 + 1]);
  const scaleV = (v) => (v ? v.map((x) => x * s) : v);
  const strip = (R) => ({ pos: R.pos, nrm: R.nrm, col: R.col, mat: R.mat, ao: R.ao, skinI: R.skinI, skinW: R.skinW, idx: R.idx, nv: R.nv, nt: R.nt, groups: R.groups });
  const D = {
    id: sp.id, key: sp.matKey ?? sp.id, s, P, linP, h: h0,
    lods: [strip(R0), strip(R1)], stats: { nv: R0.nv, nt: R0.nt, ms: Math.round(R0.ms + R1.ms), nv1: R1.nv },
    bones, bi: b.bi,
    roles: b.roles,
    eyes: b.eyes.map((e) => ({ ...e, c: scaleV(e.c), r: e.r * s })),
    teeth: b.teeth.map((t) => ({ ...t, p: scaleV(t.p), len: t.len * s, r: t.r * s })),
    tongue: b.tongue ? { ...b.tongue, p: scaleV(b.tongue.p), r: scaleV(b.tongue.r) } : null,
    attach: b.attach.map((a) => ({ ...a, p: scaleV(a.p), s: (a.s ?? 1) * s })),
    legs: b.legs.map((l) => ({ ...l, toe: scaleV(l.toe) })),
    springs: b.springs,
    anim: { ...b.anim },
    mouth: b.mouth,
    height: ymax, len: zmax - zmin, br: (b.br ?? 0.3) * s,
    quad: b.legs.filter((l) => l.front).length >= 2,
    pat: b.pattern ?? null, glowPat: !!b.glowPattern, rim: b.rim ?? null, sheen: b.sheen ?? 0.35,
    eyeStyle: b.eyeStyle ?? {}, faceBias: b.faceBias ?? null, glowK: b.glowK ?? 1,
    blush: b.blush ? scaleV(b.blush) : null,
  };
  return D;
}
// typed arrays to hand over from a worker
export function transferables(D) { const out = []; for (const R of D.lods) for (const k of ['pos', 'nrm', 'col', 'mat', 'ao', 'skinI', 'skinW', 'idx']) out.push(R[k].buffer); return out; }
