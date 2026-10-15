// The bean scientists: a sculpt like the creatures', on a humanoid skeleton.
// A jelly-bean body (head and torso in one) in a padded space-time suit with
// a hood, a metal neck ring, a glowing chrono core on the chest, a belt with
// pouches, a chrono pack on the back and a wrist gadget on the left arm;
// arms and legs with real joints, boots, and gloves with a thumb and four
// fingers that curl around whatever they hold. The hood is a padded shell
// over the bean with an opening for the face (the bean itself), which has
// the creatures' shader eyes; the mouth is drawn by the skin shader.
//
// Colours are not baked: every shape paints slot weights instead (vertex
// colour = suit, trim, skin; aMat = fabric, metal, gear, glow) and the skin
// shader mixes the outfit's colours from them, so one mesh dresses everyone.
// Front is -Z, feet at y = 0, metres.
import { DESIGNS } from './creatureDesigns.js';
import { prepShape, shapeDist } from './sculpt.js';

const SUIT = [1, 0, 0], TRIM = [0, 1, 0], SKIN = [0, 0, 1], NONE = [0, 0, 0];
// [fabric, metal, gear, glow]
const M_FAB = [1, 0, 0, 0], M_SKIN = [0, 0, 0, 0], M_GEAR = [0, 0, 1, 0], M_DARK = [0.15, 0, 0, 0], M_METAL = [0, 1, 0, 0], M_GLOW = [0, 0, 0, 1], M_GUN = [0, 0.55, 0, 0];

// where things are, shared with the rig and the shader
export const BEAN = {
  armAngle: 0.7, // rest A-pose of the arms (radians out from straight down)
  opening: { c: [0, 0.936, -0.2], r: [0.148, 0.14, 0.15] }, // the hood's face opening
  mouth: [0, 0.858],
  eyeY: 0.958, eyeX: 0.061, eyeR: 0.05,
  browY: 1.026,
  cheek: [0.094, 0.876],
  core: [0, 0.6],
  height: 1.15,
};

// ---------------------------------------------------------------- tiny vector helpers
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const norm3 = (a) => mul3(a, 1 / (len3(a) || 1));
const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smin = (a, b, k) => { if (k <= 0) return Math.min(a, b); const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

// a distance field over a few shapes, to find the surface while placing details
function fieldOf(list) {
  const P = list.map((s) => prepShape({ t: s.t, c: s.c?.slice(), r: Array.isArray(s.r) ? s.r.slice() : s.r, a: s.a?.slice(), b: s.b?.slice(), ra: s.ra, rb: s.rb, m: s.m?.slice(), round: s.round, k: s.k, op: s.op }));
  return (x, y, z) => {
    let f = 1e4;
    for (const s of P) if (s.op === 'add') f = smin(f, shapeDist(s, x, y, z), s.k);
    for (const s of P) if (s.op === 'sub') f = smax(f, -shapeDist(s, x, y, z), s.k);
    return f;
  };
}
function gradOf(F, p) {
  const e = 0.0015;
  return norm3([F(p[0] + e, p[1], p[2]) - F(p[0] - e, p[1], p[2]), F(p[0], p[1] + e, p[2]) - F(p[0], p[1] - e, p[2]), F(p[0], p[1], p[2] + e) - F(p[0], p[1], p[2] - e)]);
}
// first surface crossing along a ray from outside
function rayHit(F, o, d, tmax = 0.9) {
  const step = 0.004;
  let prev = 0;
  for (let t = step; t <= tmax; t += step) {
    if (F(o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t) <= 0) {
      let a = prev, b = t;
      for (let i = 0; i < 26; i++) { const m = (a + b) / 2; if (F(o[0] + d[0] * m, o[1] + d[1] * m, o[2] + d[2] * m) > 0) a = m; else b = m; }
      const p = add3(o, mul3(d, (a + b) / 2));
      return { p, n: gradOf(F, p) };
    }
    prev = t;
  }
  return null;
}
// the body surface at an angle around the bean (0 = front, +PI/2 = the right side) and a height
const around = (F, phi, y) => rayHit(F, [Math.sin(phi) * 0.7, y, -Math.cos(phi) * 0.7], [-Math.sin(phi), 0, Math.cos(phi)]);
// the body seen straight on from the front at (x, y)
const front = (F, x, y) => rayHit(F, [x, y, -0.7], [0, 0, 1]);
// a closed tube through points
function ring(b, pts, r, o) { for (let i = 0; i < pts.length; i++) b.cone(pts[i], pts[(i + 1) % pts.length], r, r, o); }

// ======================================================================== the design
DESIGNS.bean_scientist = (b) => {
  b.size = 1; b.res = 100; b.br = 0.24;
  b.def.mat = [0, 0, 0, 0];
  b.eyeStyle = { iris: 0x4a7ab0, iris2: 0x1a2e52, irisR: 0.6, glow: 0.12, lid: 0xf0c8a0 };
  // ---- skeleton
  b.bone('root', null, [0, 0, 0]);
  b.bone('hips', 'root', [0, 0.47, 0]);
  b.bone('spine', 'hips', [0, 0.6, 0]);
  b.bone('chest', 'spine', [0, 0.72, 0]);
  b.bone('head', 'chest', [0, 0.8, 0]);
  b.bone('pack', 'chest', [0, 0.62, 0.26]);
  const A = BEAN.armAngle, cA = Math.cos(A), sA = Math.sin(A);
  const J = {};
  b.mirror((sd, n) => {
    const sh = [sd * 0.2, 0.735, 0.004];
    const el = add3(sh, [sd * sA * 0.165, -cA * 0.165, 0]);
    const wr = add3(el, [sd * sA * 0.15, -cA * 0.15, 0]);
    J[n] = { sh, el, wr };
    b.bone('upperArm' + n, 'chest', sh);
    b.bone('forearm' + n, 'upperArm' + n, el);
    b.bone('hand' + n, 'forearm' + n, wr);
    b.bone('thigh' + n, 'hips', [sd * 0.104, 0.42, 0.0]);
    b.bone('shin' + n, 'thigh' + n, [sd * 0.11, 0.245, -0.004]);
    b.bone('foot' + n, 'shin' + n, [sd * 0.112, 0.075, 0.008]);
  });
  // the hand frame: canonical right hand (wrist at 0, fingers down -Y, palm facing -X, thumb forward -Z)
  // rotated into the A-pose and mirrored for the left
  const H = (sd, n, p) => {
    const th = sd * A, c = Math.cos(th), s = Math.sin(th);
    const x = sd * p[0], y = p[1];
    return add3(J[n].wr, [x * c - y * s, x * s + y * c, p[2]]);
  };
  const KN = -0.064, F1 = 0.026, F2 = 0.03; // knuckles, finger segment lengths
  b.mirror((sd, n) => {
    b.bone('idx1' + n, 'hand' + n, H(sd, n, [0.002, KN, -0.024]));
    b.bone('idx2' + n, 'idx1' + n, H(sd, n, [0.002, KN - F1, -0.024]));
    b.bone('fng1' + n, 'hand' + n, H(sd, n, [0.002, KN, -0.008]));
    b.bone('fng2' + n, 'fng1' + n, H(sd, n, [0.002, KN - F1, -0.008]));
    b.bone('thb1' + n, 'hand' + n, H(sd, n, [-0.004, -0.02, -0.03]));
    b.bone('thb2' + n, 'thb1' + n, H(sd, n, [-0.011, -0.047, -0.05]));
  });
  b.roles = { hips: 'hips', spine: ['spine'], chest: 'chest', neck: [], head: 'head', jaw: null, tail: [], ears: [], arms: [], wings: [] };

  // ---- the bean (head and torso in one), weighted up the spine
  const axis = [[0, 0.3, 0], [0, 1.16, 0]];
  const T = (y) => (y - 0.3) / 0.86;
  const spineW = [['hips', T(0.47)], ['spine', T(0.6)], ['chest', T(0.745)], ['head', T(0.8)]];
  const body = [];
  const bod = (s) => { s.axis = axis; body.push(s); return s; };
  bod(b.cone([0, 0.585, 0.004], [0, 0.7, 0], 0.226, 0.226, { b: spineW, col: SUIT, mat: M_FAB, k: 0.04 }));
  bod(b.cone([0, 0.7, 0], [0, 0.93, 0.01], 0.226, 0.205, { b: spineW, col: SUIT, mat: M_FAB, k: 0.05 }));
  bod(b.ell([0, 0.555, -0.03], [0.212, 0.165, 0.2], { b: spineW, col: SUIT, mat: M_FAB, k: 0.08 }));
  const F = fieldOf(body);
  const op = BEAN.opening;
  // the face is the bean itself, showing through the hood's opening
  b.ell(op.c, [op.r[0] + 0.012, op.r[1] + 0.012, op.r[2]], { op: 'paint', col: SKIN, mat: M_SKIN, cf: 0.004 });
  const eyeAt = [];
  b.mirror((sd) => {
    const r = BEAN.eyeR;
    const e = front(F, sd * BEAN.eyeX, BEAN.eyeY);
    const c = add3(e.p, mul3(e.n, -0.36 * r));
    b.sph(add3(c, mul3(e.n, -0.12 * r)), r * 0.97, { op: 'sub', k: r * 0.34, col: SKIN });
    const dir = norm3(add3(lerp3(e.n, [0, 0, -1], 0.4), [sd * 0.05, 0.02, 0]));
    b.eye({ c, r, dir, side: sd, depth: 0.6, b: 'head' });
    eyeAt.push(e);
  });
  // ---- the hood: a padded shell over the head, cut off at the neck ring, open at the face
  const hoodW = [['chest', T(0.745)], ['head', T(0.8)]];
  b.cone([0, 0.7, 0], [0, 0.93, 0.01], 0.226 + 0.014, 0.205 + 0.014, { g: 'hood', b: hoodW, col: SUIT, mat: M_FAB, k: 0.04 }).axis = axis;
  b.box([0, 0.5, 0], [0.5, 0.265, 0.5], 0.01, { g: 'hood', op: 'sub', k: 0.012, col: SUIT, cf: 0.02 });
  b.ell(op.c, op.r, { g: 'hood', op: 'sub', k: 0.014, col: TRIM, cf: 0.004 });
  // piping around the opening, and a stripe over the top and down the back
  b.ell(op.c, [op.r[0] + 0.022, op.r[1] + 0.022, op.r[2] + 0.03], { g: 'hood', op: 'paint', col: TRIM, mat: M_FAB, cf: 0.003 });
  b.box([0, 1.12, 0.03], [0.019, 0.24, 0.3], 0.01, { g: 'hood', op: 'paint', col: TRIM, mat: M_FAB, cf: 0.003 });
  b.group('hood', { hk: 0.75, hideIn: ['main'] });
  // ---- legs
  b.mirror((sd, n) => {
    const hip = b.P('thigh' + n), knee = b.P('shin' + n), ank = b.P('foot' + n);
    b.cone(add3(hip, [0, 0.04, 0]), knee, 0.068, 0.056, { b: [['hips', -0.25], ['thigh' + n, 0.22], ['thigh' + n, 0.74], ['shin' + n, 1.26]], col: SUIT, mat: M_FAB, k: 0.05 });
    b.cone(knee, add3(ank, [0, 0.03, 0]), 0.054, 0.047, { b: [['thigh' + n, -0.26], ['shin' + n, 0.26], ['shin' + n, 0.9], ['foot' + n, 1.3]], col: SUIT, mat: M_FAB, k: 0.02 });
    // a piped stripe down the outside of each leg
    b.cone(add3(hip, [sd * 0.066, -0.02, 0]), add3(knee, [sd * 0.057, 0.0, 0]), 0.012, 0.011, { op: 'paint', col: TRIM, mat: M_FAB, cf: 0.003 });
    b.cone(add3(knee, [sd * 0.055, 0.0, 0]), add3(ank, [sd * 0.047, 0.05, 0]), 0.011, 0.01, { op: 'paint', col: TRIM, mat: M_FAB, cf: 0.003 });
  });
  b.group('main', { hideIn: ['hood', 'gearU', 'gearL', 'boots'] });

  // ---- arms (their own surfaces; shoulder pads hide the joins)
  b.mirror((sd, n) => {
    const { sh, el, wr } = J[n];
    const dir = norm3(sub3(wr, el));
    const g = 'arm' + n;
    b.cone(sh, el, 0.051, 0.044, { g, b: [['upperArm' + n, 0], ['upperArm' + n, 0.75], ['forearm' + n, 1.25]], col: SUIT, mat: M_FAB, k: 0.012 });
    b.cone(el, add3(wr, mul3(dir, 0.014)), 0.044, 0.039, { g, b: [['upperArm' + n, -0.25], ['forearm' + n, 0.25], ['forearm' + n, 0.86], ['hand' + n, 1.1]], col: SUIT, mat: M_FAB, k: 0.012 });
    // a padded fold at the elbow and the piped stripe down the outside of the sleeve
    b.sph(el, 0.045, { g, b: [['upperArm' + n, 0], ['forearm' + n, 1]], col: SUIT, mat: M_FAB, k: 0.012 }).axis = [sh, wr];
    const out = [sd * Math.cos(A), Math.sin(A), 0];
    b.cone(add3(sh, mul3(out, 0.046)), add3(el, mul3(out, 0.04)), 0.011, 0.01, { g, op: 'paint', col: TRIM, mat: M_FAB, cf: 0.0025 });
    b.cone(add3(el, mul3(out, 0.04)), add3(wr, mul3(out, 0.036)), 0.01, 0.009, { g, op: 'paint', col: TRIM, mat: M_FAB, cf: 0.0025 });
    if (sd < 0) {
      // the chrono gadget on the left wrist: a dark slab with a glowing screen
      const up = norm3([sd * Math.cos(A), Math.sin(A), 0]); // the back of the wrist, away from the body
      const mid = lerp3(el, wr, 0.55);
      const c = add3(mid, mul3(up, 0.036));
      b.box(c, [0.031, 0.044, 0.013], 0.007, { g, b: 'forearm' + n, dir: up, up: dir, col: NONE, mat: M_GUN, k: 0.003, cf: -0.4, cp: 4 });
      b.box(add3(c, mul3(up, 0.011)), [0.022, 0.032, 0.004], 0.003, { g, b: 'forearm' + n, dir: up, up: dir, col: NONE, mat: M_GLOW, k: 0.0015, cf: -0.3, cp: 6 });
      b.cyl(add3(c, add3(mul3(up, 0.004), mul3(dir, -0.047))), 0.007, 0.003, 0.0015, { g, b: 'forearm' + n, dir, col: NONE, mat: M_METAL, k: 0.002, cf: -0.3, cp: 5 });
    }
    b.group(g, { hk: 0.75, hideIn: ['main', 'gearU'] });
  });

  // ---- gloves: palm, four fingers and a thumb on their own bones
  b.mirror((sd, n) => {
    const g = 'hand' + n, h = (p) => H(sd, n, p);
    const hb = 'hand' + n;
    const glove = { g, col: NONE, mat: M_GEAR };
    // cuff over the sleeve, with a trim band
    const along = norm3(sub3(h([0, -1, 0]), h([0, 0, 0])));
    b.cyl(h([0, 0.007, 0]), 0.048, 0.019, 0.009, { ...glove, b: hb, dir: along, k: 0.006 });
    b.cyl(h([0, 0.014, 0]), 0.053, 0.0045, 0.001, { g, op: 'paint', dir: along, col: TRIM, mat: [0.6, 0, 0, 0], cf: 0.002 });
    // palm and the thumb's muscle
    b.box(h([0.001, -0.042, 0]), [0.0165, 0.026, 0.033], 0.013, { ...glove, b: hb, k: 0.012, rot: [0, 0, sd * A] });
    b.ell(h([-0.009, -0.034, -0.017]), [0.012, 0.022, 0.016], { ...glove, b: hb, k: 0.01 });
    // grippy palm pad and knuckle guard
    b.box(h([-0.02, -0.046, 0.002]), [0.008, 0.022, 0.028], 0.008, { g, op: 'paint', col: NONE, mat: M_DARK, cf: 0.0025 });
    b.box(h([0.017, -0.058, 0.0]), [0.006, 0.01, 0.029], 0.005, { g, b: hb, col: NONE, mat: M_DARK, k: 0.004, cf: -0.4, cp: 3, rot: [0, 0, sd * A] });
    // fingers: index on its own bones, the other three share a pair (they curl together)
    const fing = [[-0.024, 'idx', 1.0, 1.0], [-0.008, 'fng', 1.08, 1.06], [0.008, 'fng', 1.0, 1.0], [0.0235, 'fng', 0.84, 0.82]];
    for (const [z, nm, k1, k2] of fing) {
      const p0 = h([0.002, KN + 0.008, z]), p1 = h([0.002, KN - F1 * k1, z]), p2 = h([0.002, KN - F1 * k1 - F2 * k2, z]);
      const r0 = z > 0.02 ? 0.0088 : 0.0098;
      b.cone(p0, p1, r0, r0 * 0.92, { ...glove, b: [[hb, 0], [nm + '1' + n, 0.47], [nm + '1' + n, 0.75], [nm + '2' + n, 1.25]], k: 0.005 });
      b.cone(p1, p2, r0 * 0.92, r0 * 0.84, { ...glove, b: [[nm + '1' + n, -0.28], [nm + '2' + n, 0.28]], k: 0.004 });
      // grippy pads on the finger tips
      b.sph(add3(lerp3(p1, p2, 0.7), mul3(norm3(sub3(h([-0.02, 0, z]), h([0, 0, z]))), 0.005)), r0 * 0.7, { g, op: 'paint', col: NONE, mat: M_DARK, cf: 0.0025 });
    }
    // thumb
    const t0 = h([-0.004, -0.014, -0.026]), t1 = h([-0.011, -0.047, -0.05]), t2 = h([-0.015, -0.073, -0.056]);
    b.cone(t0, t1, 0.0125, 0.0112, { ...glove, b: [[hb, 0.1], ['thb1' + n, 0.5], ['thb1' + n, 0.74], ['thb2' + n, 1.26]], k: 0.008 });
    b.cone(t1, t2, 0.0112, 0.0098, { ...glove, b: [['thb1' + n, -0.28], ['thb2' + n, 0.28]], k: 0.004 });
    b.group(g, { hk: 0.38, hideIn: ['arm' + n] });
  });

  // ---- upper gear: neck ring, chest core, shoulder pads, chrono pack (crisp, on its own surface)
  {
    const gU = { g: 'gearU' };
    const pts = [];
    for (let i = 0; i < 40; i++) { const h = around(F, (i / 40) * Math.PI * 2, 0.766); pts.push(add3(h.p, mul3(h.n, 0.005))); }
    ring(b, pts, 0.02, { ...gU, b: 'chest', col: NONE, mat: M_METAL, k: 0.004 });
    // a glowing seam along the top of the ring
    const pts2 = pts.map((p) => add3(p, [0, 0.015, 0]));
    ring(b, pts2, 0.0062, { ...gU, b: 'chest', col: NONE, mat: M_GLOW, k: 0.002, cf: -0.3, cp: 3 });
    // chest core: a metal housing, a dark bezel and a glowing lens
    const cc = around(F, 0, BEAN.core[1]);
    const P0 = cc.p, N0 = cc.n;
    b.cyl(add3(P0, mul3(N0, 0.004)), 0.054, 0.011, 0.005, { ...gU, b: 'chest', dir: N0, col: NONE, mat: M_METAL, k: 0.004 });
    b.cyl(add3(P0, mul3(N0, 0.016)), 0.044, 0.0035, 0.0018, { ...gU, b: 'chest', dir: N0, col: TRIM, mat: [0.2, 0, 0, 0], k: 0.002, cf: -0.3, cp: 3 });
    b.ell(add3(P0, mul3(N0, 0.019)), [0.034, 0.034, 0.01], { ...gU, b: 'chest', dir: N0, col: NONE, mat: M_GLOW, k: 0.002, cf: -0.3, cp: 6 });
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + (i * Math.PI) / 2;
      const q = add3(P0, add3(mul3(N0, 0.016), [Math.cos(a) * 0.046, Math.sin(a) * 0.046, 0]));
      b.sph(q, 0.0055, { ...gU, b: 'chest', col: NONE, mat: M_METAL, k: 0.002, cf: -0.3, cp: 4 });
    }
    // shoulder pads ride the upper arms
    b.mirror((sd, n) => {
      const { sh } = J[n];
      const out = [sd * Math.cos(A), Math.sin(A), 0];
      const c = add3(sh, add3(mul3(out, 0.034), [0, 0.006, 0]));
      b.ell(c, [0.066, 0.068, 0.04], { ...gU, b: 'upperArm' + n, dir: out, up: [0, 0, 1], col: TRIM, mat: M_FAB, k: 0.006 });
    });
    // the chrono pack: a gunmetal case with two glowing flux tubes, a dial and an antenna
    const pk = around(F, Math.PI, 0.615);
    const pc = add3(pk.p, mul3(pk.n, 0.048));
    const pg = { ...gU, b: 'pack' };
    b.box(pc, [0.112, 0.118, 0.046], 0.034, { ...pg, dir: pk.n, col: NONE, mat: M_GUN, k: 0.004 });
    b.box(add3(pc, add3(mul3(pk.n, 0.012), [0, 0.098, 0])), [0.1, 0.03, 0.04], 0.022, { ...pg, dir: pk.n, col: TRIM, mat: M_FAB, k: 0.004, cf: -0.4, cp: 3 });
    for (const sx of [-1, 1]) {
      const tb = add3(pc, add3(mul3(pk.n, 0.03), [sx * 0.104, 0, 0]));
      b.cone(add3(tb, [0, -0.07, 0]), add3(tb, [0, 0.07, 0]), 0.021, 0.021, { ...pg, col: NONE, mat: M_GLOW, k: 0.003, cf: -0.3, cp: 5 });
      for (const sy of [-1, 1]) b.cyl(add3(tb, [0, sy * 0.074, 0]), 0.025, 0.01, 0.004, { ...pg, dir: [0, 1, 0], col: NONE, mat: M_METAL, k: 0.003, cf: -0.3, cp: 6 });
    }
    const dial = add3(pc, mul3(pk.n, 0.044));
    b.cyl(add3(dial, mul3(pk.n, 0.001)), 0.045, 0.007, 0.004, { ...pg, dir: pk.n, col: NONE, mat: M_METAL, k: 0.003, cf: -0.3, cp: 4 });
    b.ell(add3(dial, mul3(pk.n, 0.008)), [0.028, 0.028, 0.008], { ...pg, dir: pk.n, col: NONE, mat: M_GLOW, k: 0.002, cf: -0.3, cp: 6 });
    const at = add3(pc, [-0.07, 0.11, 0.0]);
    b.cone(at, add3(at, [-0.012, 0.13, 0.01]), 0.0055, 0.0035, { ...pg, col: NONE, mat: M_METAL, k: 0.002 });
    b.sph(add3(at, [-0.013, 0.138, 0.011]), 0.0095, { ...pg, col: NONE, mat: M_GLOW, k: 0.002, cf: -0.3, cp: 5 });
    b.group('gearU', { hk: 0.6, hideIn: ['main'] });
  }

  // ---- lower gear: belt with a glowing buckle, pouches, knee pads
  {
    const gL = { g: 'gearL' };
    const N = 40, y = 0.45;
    for (let i = 0; i < N; i++) {
      const h = around(F, (i / N) * Math.PI * 2, y);
      const R = Math.hypot(h.p[0], h.p[2]);
      b.box(add3(h.p, mul3(h.n, 0.003)), [((Math.PI * 2 * R) / N) * 0.62, 0.023, 0.0075], 0.004, { ...gL, b: 'hips', dir: h.n, col: NONE, mat: M_DARK, k: 0.004 });
    }
    const bk = around(F, 0, y);
    b.box(add3(bk.p, mul3(bk.n, 0.011)), [0.036, 0.028, 0.008], 0.007, { ...gL, b: 'hips', dir: bk.n, col: NONE, mat: M_METAL, k: 0.003, cf: -0.3, cp: 3 });
    b.ell(add3(bk.p, mul3(bk.n, 0.019)), [0.018, 0.014, 0.004], { ...gL, b: 'hips', dir: bk.n, col: NONE, mat: M_GLOW, k: 0.002, cf: -0.3, cp: 6 });
    for (const sd of [-1, 1]) {
      const h = around(F, sd * 1.12, y - 0.012);
      const pc = add3(h.p, mul3(h.n, 0.02));
      b.box(pc, [0.034, 0.038, 0.019], 0.012, { ...gL, b: 'hips', dir: h.n, col: TRIM, mat: M_FAB, k: 0.004 });
      b.box(add3(pc, add3(mul3(h.n, 0.004), [0, 0.026, 0])), [0.036, 0.015, 0.02], 0.008, { ...gL, b: 'hips', dir: h.n, col: NONE, mat: M_DARK, k: 0.003, cf: -0.4, cp: 3 });
      b.sph(add3(pc, add3(mul3(h.n, 0.024), [0, 0.016, 0])), 0.0055, { ...gL, b: 'hips', col: NONE, mat: M_METAL, k: 0.002, cf: -0.3, cp: 4 });
    }
    b.mirror((sd, n) => {
      const knee = b.P('shin' + n);
      b.ell(add3(knee, [0, 0.006, -0.048]), [0.047, 0.05, 0.023], { ...gL, b: 'shin' + n, dir: [0, 0.12, -1], col: TRIM, mat: M_FAB, k: 0.006 });
      b.ell(add3(knee, [0, 0.006, -0.068]), [0.026, 0.012, 0.006], { ...gL, op: 'paint', col: NONE, mat: M_DARK, cf: 0.003 });
    });
    b.group('gearL', { hk: 0.6, hideIn: ['main'] });
  }

  // ---- boots: shaft, toe, a thick sole and a buckle strap
  b.mirror((sd, n) => {
    const ank = b.P('foot' + n), fb = 'foot' + n;
    const bt = { g: 'boots', col: NONE, mat: M_GEAR };
    b.cyl(add3(ank, [0, 0.032, -0.004]), 0.064, 0.04, 0.014, { ...bt, b: [['shin' + n, 0.2], [fb, 0.8]], dir: [0, 1, 0], k: 0.012 }).axis = [add3(ank, [0, 0.072, 0]), add3(ank, [0, -0.008, 0])];
    b.cyl(add3(ank, [0, 0.066, -0.004]), 0.069, 0.008, 0.004, { ...bt, b: 'shin' + n, dir: [0, 1, 0], col: TRIM, mat: M_FAB, k: 0.004, cf: -0.4, cp: 2 });
    b.ell(add3(ank, [0, -0.026, -0.04]), [0.061, 0.044, 0.094], { ...bt, b: fb, k: 0.03 });
    b.ell(add3(ank, [0, -0.034, -0.096]), [0.05, 0.034, 0.042], { ...bt, b: fb, k: 0.02 });
    b.box(add3(ank, [0, -0.06, -0.038]), [0.064, 0.0125, 0.106], 0.011, { ...bt, b: fb, col: NONE, mat: M_DARK, k: 0.004, cf: -0.4, cp: 3 });
    // glowing strip around the sole, and a strap with a buckle across the top
    b.box(add3(ank, [0, -0.056, -0.038]), [0.066, 0.0025, 0.108], 0.002, { g: 'boots', op: 'paint', col: NONE, mat: M_GLOW, cf: 0.0015 });
    b.ell(add3(ank, [0, -0.005, -0.06]), [0.066, 0.012, 0.03], { ...bt, b: fb, rot: [0.5, 0, 0], col: NONE, mat: M_DARK, k: 0.003, cf: -0.4, cp: 3 });
    b.box(add3(ank, [sd * 0.056, -0.012, -0.055]), [0.005, 0.012, 0.012], 0.003, { ...bt, b: fb, col: NONE, mat: M_METAL, k: 0.002, cf: -0.3, cp: 4 });
    b.group('boots', { hk: 0.7 });
  });

  // what the rig and the shader need to know
  b.mouth = { c: BEAN.mouth.slice(), z: front(F, BEAN.mouth[0], BEAN.mouth[1]).p[2] };
  b.anim = {
    human: true,
    brows: [-1, 1].map((sd) => { const f = front(F, sd * 0.064, BEAN.browY); return { side: sd, p: f.p, n: f.n }; }),
    cheek: BEAN.cheek, core: around(F, 0, BEAN.core[1]).p, eyes: eyeAt.map((e) => e.p),
  };
};

export const BEAN_SPECIES = { id: 'bean_scientist', design: 'bean_scientist', size: 1, matKey: 'bean_scientist' };
