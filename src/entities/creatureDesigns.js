// Sculpting scripts for every species. Each one places an armature (bones in
// the rest pose, -Z forward, +Y up, metres at size b.size) and then blends
// shapes over it: ellipsoids, round cones and lumps, carved sockets and
// mouths, painted patches. Shapes name the bones that carry them, so the
// skin bends where the bones bend. Roles tell the rig which bones are the
// hips, neck, head, jaw, tail, ears and legs.

export const DESIGNS = {};

// ---------------------------------------------------------------- shared bits
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);
const mx = (p, sd) => [sd * p[0], p[1], p[2]];
// a three-bone leg (upper, lower, foot) plus its IK registration
function leg(b, n, side, parent, hip, knee, ankle, toe, front, opt = {}) {
  b.bone('up' + n, parent, hip); b.bone('lo' + n, 'up' + n, knee); b.bone('ft' + n, 'lo' + n, ankle);
  b.leg({ bones: ['up' + n, 'lo' + n, 'ft' + n], toe, side, front, ...opt });
}
const legOf = (b, n) => b.legs.find((l) => l.bones[0] === 'up' + n);
// skin over a leg chain: radii at hip, knee, ankle, toe
function legSkin(b, n, radii, o = {}) {
  const L = legOf(b, n);
  const up = b.P('up' + n), lo = b.P('lo' + n), ft = b.P('ft' + n), toe = L.toe;
  const tip = [toe[0], toe[1] + radii[3], toe[2]];
  b.chain([up, lo, ft, tip], radii, { b: ['up' + n, 'lo' + n, 'ft' + n, 'ft' + n], k: o.k ?? radii[1] * 0.6, col: o.col ?? 'body', mat: o.mat, belly: o.belly });
}
const FUR = (f = 0.6) => ({ fur: f });
// the usual armature: root, hips, a spine chain, chest, neck chain, head, jaw and tail chain
function torso(b, o) {
  b.bone('root', null, [0, 0, 0]);
  b.bone('hips', 'root', o.hips);
  const spine = [], neck = [], tail = [];
  let prev = 'hips';
  (o.spine ?? []).forEach((p, i) => { const n = 'spine' + (i + 1); b.bone(n, prev, p); spine.push(n); prev = n; });
  b.bone('chest', prev, o.chest); prev = 'chest';
  (o.neck ?? []).forEach((p, i) => { const n = 'neck' + (i + 1); b.bone(n, prev, p); neck.push(n); prev = n; });
  b.bone('head', prev, o.head);
  if (o.jaw) b.bone('jaw', 'head', o.jaw);
  prev = 'hips';
  (o.tail ?? []).forEach((p, i) => { const n = 'tail' + (i + 1); b.bone(n, prev, p); tail.push(n); prev = n; });
  b.roles = { hips: 'hips', spine, chest: 'chest', neck, head: 'head', jaw: o.jaw ? 'jaw' : null, tail, ears: [], arms: [], wings: [] };
}
// a mouth: carve a cavity under the snout and tuck a jaw into it that can drop open
function mouth(b, o) {
  const k = o.k ?? o.cav.r[1] * 0.35;
  b.ell(o.cav.c, o.cav.r, { op: 'sub', k, col: 'mouth', cf: -0.4, rot: o.cav.rot });
  b.ell(o.jaw.c, o.jaw.r, { g: 'jaw', b: 'jaw', wf: o.jaw.r[1] * 0.3, col: o.col ?? 'body', mat: o.mat, rot: o.jaw.rot, belly: o.belly ?? 0 });
  b.ell([o.jaw.c[0], o.jaw.c[1] + o.jaw.r[1] * 0.92, o.jaw.c[2]], [o.jaw.r[0] * 0.86, o.jaw.r[1] * 0.42, o.jaw.r[2] * 0.9], { g: 'jaw', op: 'paint', col: 'mouth', cf: -0.5, rot: o.jaw.rot });
  if (o.tongue !== false) b.tongue = { b: 'jaw', p: [0, o.jaw.c[1] + o.jaw.r[1] * 0.7, o.jaw.c[2] + o.jaw.r[2] * 0.55], r: [o.jaw.r[0] * 0.5, o.jaw.r[1] * 0.35, o.jaw.r[2] * 0.42] };
}
// two eyes in carved sockets, with optional brows
function eyePair(b, o) {
  b.mirror((sd) => {
    const c = mx(o.c, sd);
    b.sph(add3(c, [0, 0, o.r * (o.sink ?? 0.1)]), o.r * (o.socket ?? 0.88), { op: 'sub', k: o.r * 0.28, col: o.lid ?? 'body', cf: -0.6 });
    b.eye({ c, r: o.r, dir: mx(o.dir, sd), side: sd, depth: o.depth ?? 0.62, b: o.b ?? 'head', sy: o.sy });
    if (o.brow) b.ell([sd * (o.c[0] + (o.brow.dx ?? 0)), o.c[1] + o.r * (o.brow.dy ?? 1.0), o.c[2] + o.r * (o.brow.dz ?? 0.25)], o.brow.r, { b: o.b ?? 'head', k: o.brow.k ?? o.r * 0.5, col: o.brow.col ?? 'body', mat: o.mat, rot: [0, 0, -sd * (o.brow.tilt ?? 0)] });
  });
}
// a pair of ears on spring bones: 'ell' flaps or 'tri' points, with a carved inner ear
function earPair(b, o) {
  b.mirror((sd, n) => {
    const root = mx(o.root, sd), tip = mx(o.tip, sd), face = mx(o.face ?? [0.2, 0, -1], sd);
    const bn = 'ear' + n;
    b.bone(bn, o.parent ?? 'head', root);
    const dir = sub3(tip, root), L = len3(dir);
    const base = { b: bn, k: o.k ?? o.t * 1.6, col: o.col ?? 'body', mat: o.mat };
    if (o.kind === 'tri') {
      b.tri(root, [o.w, L, o.t], o.round ?? o.t * 0.7, { ...base, dir, up: face });
      if (o.inner) b.tri(add3(add3(root, mul3(face, o.t * 1.3)), mul3(dir, 0.12)), [o.w * 0.62, L * 0.72, o.t * 0.6], o.t * 0.3, { op: 'sub', dir, up: face, k: o.t * 0.5, col: o.inner, cf: -0.4 });
    } else {
      b.ell(add3(root, mul3(dir, 0.5)), [o.w, o.t, L / 2], { ...base, dir, up: face });
      if (o.inner) b.ell(add3(add3(root, mul3(dir, 0.52)), mul3(face, o.t * 1.1)), [o.w * 0.7, o.t * 0.6, L * 0.36], { op: 'sub', dir, up: face, k: o.t * 0.5, col: o.inner, cf: -0.4 });
    }
    b.roles.ears.push({ b: bn, side: sd, up: o.up ?? [0, 0, 0.45], down: o.down ?? [0.7, -0.3, -0.3], droop: o.droop ?? -0.3, jig: o.jig ?? 1 });
  });
}
// a mirrored leg pair with skin and a foot: J = [hip, knee, ankle, toe] for the right side
function limbs(b, n, parent, J, R, o = {}) {
  b.mirror((sd, s) => {
    const nm = n + s;
    leg(b, nm, sd, parent, mx(J[0], sd), mx(J[1], sd), mx(J[2], sd), mx(J[3], sd), !!o.front, { bend: o.bend, pole: o.pole ? mx(o.pole, sd) : undefined });
    legSkin(b, nm, R, { col: o.col, mat: o.mat, belly: o.belly, k: o.k });
    const t = mx(J[3], sd), r = R[3];
    const fwd = o.footDir ?? [0, 0, -1];
    if (o.foot === 'paw' || o.foot === 'hoof' || o.foot === 'pad') {
      b.ell([t[0], r * 0.9, t[2] + fwd[2] * r * 0.45], [r * (o.foot === 'hoof' ? 1.08 : 1.28), r * 0.9, r * (o.foot === 'hoof' ? 1.15 : 1.55)], { b: 'ft' + nm, k: r * 0.6, col: o.foot === 'hoof' ? 'hoof' : o.footCol ?? o.col ?? 'body', cf: o.foot === 'hoof' ? -0.4 : undefined, cp: o.foot === 'hoof' ? 2 : 1, mat: o.foot === 'hoof' ? { gloss: 0.6, fur: 0 } : o.mat });
    }
    if (o.toes) for (let i = 0; i < o.toes; i++) {
      const a = (i - (o.toes - 1) / 2) * (o.toeSpread ?? 0.45);
      const d = [Math.sin(a) * sd * (o.toeOut ?? 1), 0, -Math.cos(a)];
      const p0 = [t[0] + d[0] * r * 0.4, r * 0.55, t[2] + d[2] * r * 0.4];
      const p1 = [t[0] + d[0] * r * (o.toeLen ?? 1.9), r * 0.35, t[2] + d[2] * r * (o.toeLen ?? 1.9)];
      b.cone(p0, p1, r * 0.42, r * 0.3, { b: 'ft' + nm, k: r * 0.3, col: o.footCol ?? o.col ?? 'body', mat: o.mat });
      if (o.claws) b.cone(p1, [p1[0] + d[0] * r * 0.7, r * 0.12, p1[2] + d[2] * r * 0.7], r * 0.24, r * 0.04, { b: 'ft' + nm, k: r * 0.12, col: 'claw', cf: -0.4, cp: 2, mat: { gloss: 0.6, fur: 0 } });
    }
  });
}
// a flat tuft/fan of triangles along a line (manes, spikes, plumes, frills)
function spikes(b, pts, o) {
  for (const [i, p] of pts.entries()) {
    const dir = o.dirAt ? o.dirAt(i, p) : o.dir;
    b.tri(p.c ?? p, [o.w * (p.k ?? 1), o.h * (p.k ?? 1), o.t], o.round ?? o.t * 0.6, { b: p.b ?? o.b, dir, up: o.up ?? [1, 0, 0], k: o.k ?? o.t * 2, col: o.col ?? 'accent', mat: o.mat, cf: o.cf, g: o.g });
  }
}
// ======================================================================== MUTTON CHOPS
// A round cloud of a sheep with a charcoal face, floppy ears, goat eyes and
// two magnificent woolly sideburns. Puffs up like a dandelion when scared.
DESIGNS.mutton = (b, L) => {
  b.size = 1.2; b.br = 0.32; b.res = 66;
  b.pal = { dark: L.dark ?? 0x7a6052, light: 0xb39482, nose: L.nose ?? 0xd88a92, hoof: 0x2b2326, wool: L.color };
  b.eyeStyle = { iris: 0xe0a848, iris2: 0x8a5418, pupil: 'bar', irisR: 0.52, lid: 'dark' };
  b.anim = { stride: 0.62, lift: 0.26, bob: 0.06, pronk: true, jaw: 0.42, chew: 'side', stabilize: 0.7, tailUp: 0.3 };
  b.blush = [0.088, 0.83, -0.69, 0.045];
  b.sheen = 0.55;
  // ---- armature
  b.bone('root', null, [0, 0, 0]);
  b.bone('hips', 'root', [0, 0.5, 0.24]);
  b.bone('spine', 'hips', [0, 0.54, 0.0]);
  b.bone('chest', 'spine', [0, 0.55, -0.22]);
  b.bone('neck', 'chest', [0, 0.68, -0.38]);
  b.bone('head', 'neck', [0, 0.86, -0.52]);
  b.bone('jaw', 'head', [0, 0.782, -0.612]);
  b.bone('fleece', 'spine', [0, 0.56, 0.08]);
  b.bone('tail1', 'hips', [0, 0.62, 0.45]); b.bone('tail2', 'tail1', [0, 0.61, 0.53]);
  b.mirror((sd, n) => {
    b.bone('ear' + n, 'head', [sd * 0.12, 0.925, -0.53]);
    b.bone('cheek' + n, 'head', [sd * 0.105, 0.84, -0.59]);
    leg(b, 'H' + n, sd, 'hips', [sd * 0.15, 0.4, 0.3], [sd * 0.15, 0.25, 0.32], [sd * 0.15, 0.1, 0.335], [sd * 0.15, 0.0, 0.318], false);
    leg(b, 'F' + n, sd, 'chest', [sd * 0.15, 0.4, -0.22], [sd * 0.15, 0.25, -0.226], [sd * 0.15, 0.1, -0.226], [sd * 0.15, 0.0, -0.246], true);
  });
  b.roles = {
    hips: 'hips', spine: ['spine'], chest: 'chest', neck: ['neck'], head: 'head', jaw: 'jaw', tail: ['tail1', 'tail2'], fleece: 'fleece',
    ears: [
      { b: 'earR', side: 1, up: [0, 0.1, 0.55], down: [0.25, -0.5, -0.75], droop: -0.4 },
      { b: 'earL', side: -1, up: [0, 0.1, 0.55], down: [0.25, -0.5, -0.75], droop: -0.4 },
    ],
  };
  b.springs = [{ b: 'cheekR', side: 1, gain: 1.4 }, { b: 'cheekL', side: -1, gain: 1.4 }];
  b.group('main', { hideIn: ['wool'] });
  const dk = { col: 'dark', mat: FUR(0.3) };
  // ---- the cocoa body under the wool
  b.ell([0, 0.55, 0.02], [0.2, 0.19, 0.31], { b: ['hips', 'spine', 'chest'], k: 0.05, ...dk });
  b.cone([0, 0.6, -0.26], [0, 0.84, -0.52], 0.11, 0.09, { b: ['chest', 'neck', 'head'], k: 0.05, ...dk });
  // ---- head: round skull, soft muzzle, pink nose
  b.ell([0, 0.892, -0.56], [0.128, 0.12, 0.13], { b: 'head', k: 0.05, ...dk });
  b.ell([0, 0.83, -0.662], [0.088, 0.078, 0.094], { b: 'head', k: 0.07, ...dk });
  b.ell([0, 0.815, -0.7], [0.075, 0.06, 0.06], { op: 'paint', col: 'light', cf: 0.03 });
  b.ell([0, 0.858, -0.742], [0.032, 0.021, 0.014], { b: 'head', k: 0.02, col: 'nose', cf: 0.005, cp: 2, mat: { gloss: 0.45 } });
  b.mirror((sd) => b.sph([sd * 0.014, 0.856, -0.757], 0.0075, { op: 'sub', k: 0.005, col: 'mouth', cf: 0.004 }));
  // mouth: a cavity under the muzzle that the jaw tucks into
  b.ell([0, 0.766, -0.68], [0.063, 0.03, 0.076], { op: 'sub', k: 0.01, col: 'mouth', cf: 0.004 });
  // eye sockets, a soft brow and the eyes themselves
  b.mirror((sd) => {
    b.sph([sd * 0.07, 0.912, -0.662], 0.05, { op: 'sub', k: 0.012, col: 'dark' });
    b.ell([sd * 0.072, 0.97, -0.645], [0.05, 0.016, 0.026], { b: 'head', k: 0.025, ...dk });
    b.eye({ c: [sd * 0.07, 0.914, -0.657], r: 0.058, dir: [sd * 0.4, 0.06, -1], side: sd, depth: 0.6 });
  });
  // big floppy ears with pink insides
  b.mirror((sd, n) => {
    b.ell([sd * 0.215, 0.912, -0.53], [0.11, 0.048, 0.022], { b: 'ear' + n, rot: [0, 0, sd * -0.3], k: 0.025, ...dk });
    b.ell([sd * 0.222, 0.909, -0.548], [0.08, 0.03, 0.013], { op: 'sub', rot: [0, 0, sd * -0.3], k: 0.008, col: 'nose', cf: 0.004 });
  });
  // stubby legs and glossy hooves
  for (const n of ['FR', 'FL', 'HR', 'HL']) {
    legSkin(b, n, [0.066, 0.05, 0.044, 0.042], { col: 'dark', mat: FUR(0.25) });
    const t = legOf(b, n).toe;
    b.ell([t[0], 0.036, t[2] - 0.004], [0.048, 0.04, 0.055], { b: 'ft' + n, k: 0.014, col: 'hoof', cf: 0.005, cp: 2, mat: { gloss: 0.6, fur: 0 } });
    b.box([t[0], 0.03, t[2] - 0.05], [0.004, 0.032, 0.022], 0.002, { op: 'sub', k: 0.004, col: 'hoof' });
  }
  // ---- the jaw (its own surface so it can drop open)
  b.ell([0, 0.756, -0.679], [0.064, 0.031, 0.077], { g: 'jaw', b: 'jaw', k: 0, wf: 0.01, ...dk });
  b.ell([0, 0.785, -0.682], [0.055, 0.012, 0.068], { g: 'jaw', op: 'paint', col: 'mouth', cf: 0.004 });
  b.tongue = { b: 'jaw', p: [0, 0.782, -0.628], r: [0.034, 0.011, 0.03] };
  // ---- wool: a fleece of curls, a woolly collar, a forelock, the mutton chops and a pom-pom tail
  const wl = { g: 'wool', col: 'body', mat: FUR(1) };
  const fleece = (c, r, n, lump, bone, o = {}) => {
    b.ell(c, r, { b: bone, ...wl, ...o, rot: o.rot });
    b.scatter(c, r, n, lump, { b: bone, k: lump * 0.32, ...wl, inset: 0.97, ...o });
  };
  fleece([0, 0.56, 0.06], [0.32, 0.33, 0.41], 320, 0.06, 'fleece', { seed: 5 });
  fleece([0, 0.67, -0.34], [0.2, 0.21, 0.15], 60, 0.052, ['chest', 'neck'], { seed: 9, filter: (x, y, z) => z < 0.5 });
  fleece([0, 0.99, -0.55], [0.1, 0.055, 0.09], 26, 0.04, 'head', { seed: 2, filter: (x, y) => y > -0.4 });
  b.mirror((sd, n) => fleece([sd * 0.118, 0.808, -0.616], [0.05, 0.086, 0.066], 20, 0.032, 'cheek' + n, { rot: [0.3, 0, sd * 0.15], seed: 7 + sd, filter: (x) => x * sd > -0.35 }));
  fleece([0, 0.61, 0.53], [0.068, 0.068, 0.068], 14, 0.034, 'tail2', { seed: 11 });
};

// ======================================================================== SNATCHET (compy)
// A pocket-sized leaf-eared hopper with chubby cheeks, buck teeth and a
// bushy leaf tail. Steals your lunch with its tiny grabby hands.
DESIGNS.compy = (b, L) => {
  b.size = 0.55; b.br = 0.09; b.res = 72;
  b.pal = { light: 0xf4f0d0, nose: 0xe8708a, inner: 0xb8f078, claw: 0x4a3a2a };
  b.eyeStyle = { iris: 0x3a8a2a, iris2: 0x1a4a12, irisR: 0.6, lid: 'body' };
  b.anim = { stride: 0.7, lift: 0.5, hop: true, jaw: 0.5, stabilize: 0.8, tailUp: 0.5 };
  b.blush = [0.06, 0.36, -0.16, 0.03];
  b.pattern = { type: 'stripes', scale: 9, th: 0.55 };
  torso(b, { hips: [0, 0.19, 0.05], spine: [[0, 0.235, 0.0]], chest: [0, 0.275, -0.045], neck: [[0, 0.315, -0.07]], head: [0, 0.37, -0.09], jaw: [0, 0.342, -0.13],
    tail: [[0, 0.2, 0.12], [0, 0.25, 0.2], [0, 0.32, 0.25]] });
  const fur = { mat: FUR(0.7) };
  // pear body and a big round head
  b.ell([0, 0.225, 0.015], [0.082, 0.098, 0.092], { b: ['hips', 'spine1', 'chest'], k: 0.03, belly: 1, mat: { fur: 0.7, pat: 1 } });
  b.ell([0, 0.285, -0.05], [0.07, 0.07, 0.064], { b: 'chest', k: 0.03, belly: 1, ...fur });
  b.sph([0, 0.4, -0.1], 0.108, { b: 'head', k: 0.03, ...fur });
  b.mirror((sd) => b.ell([sd * 0.056, 0.36, -0.135], [0.058, 0.05, 0.052], { b: 'head', k: 0.04, ...fur }));
  b.ell([0, 0.362, -0.185], [0.046, 0.036, 0.036], { b: 'head', k: 0.03, col: 'light', ...fur });
  b.ell([0, 0.384, -0.217], [0.017, 0.012, 0.01], { b: 'head', k: 0.01, col: 'nose', cf: -0.4, cp: 2, mat: { gloss: 0.5 } });
  mouth(b, { cav: { c: [0, 0.343, -0.18], r: [0.034, 0.014, 0.032] }, jaw: { c: [0, 0.336, -0.176], r: [0.035, 0.016, 0.034] }, col: 'light', mat: FUR(0.4) });
  b.mirror((sd) => b.tooth({ b: 'head', p: [sd * 0.008, 0.352, -0.212], len: 0.022, r: 0.0075, flat: true, dir: [0, -1, -0.15] }));
  eyePair(b, { c: [0.05, 0.418, -0.186], r: 0.037, dir: [0.42, 0.08, -1] });
  // leaf ears
  earPair(b, { root: [0.042, 0.47, -0.1], tip: [0.12, 0.66, -0.06], w: 0.045, t: 0.011, col: 'accent', inner: 'inner', face: [0.25, 0.1, -1], up: [0, 0, 0.35], down: [0.9, 0, -0.6], mat: { fur: 0.1 } });
  // bushy leaf tail
  b.chain([[0, 0.2, 0.1], [0, 0.25, 0.19], [0, 0.32, 0.245], [0, 0.39, 0.24]], [0.035, 0.05, 0.045, 0.02], { b: ['tail1', 'tail2', 'tail3', 'tail3'], k: 0.03, col: 'accent', mat: FUR(0.9) });
  b.scatter([0, 0.3, 0.23], [0.045, 0.07, 0.045], 16, 0.024, { b: 'tail3', k: 0.012, col: 'accent', g: 'main', mat: FUR(0.9), seed: 4 });
  // big hopping feet, tiny grabby arms
  limbs(b, 'H', 'hips', [[0.055, 0.17, 0.06], [0.07, 0.11, 0.0], [0.07, 0.04, 0.075], [0.07, 0.0, -0.01]], [0.04, 0.03, 0.022, 0.02], { col: 'body', mat: FUR(0.6), foot: 'pad' });
  b.mirror((sd, n) => {
    b.bone('arm' + n, 'chest', [sd * 0.062, 0.275, -0.085]); b.bone('fore' + n, 'arm' + n, [sd * 0.078, 0.23, -0.115]); b.bone('hand' + n, 'fore' + n, [sd * 0.08, 0.195, -0.135]);
    b.chain([[sd * 0.062, 0.275, -0.085], [sd * 0.078, 0.23, -0.115], [sd * 0.08, 0.2, -0.135]], [0.02, 0.016, 0.014], { b: ['arm' + n, 'fore' + n, 'hand' + n], k: 0.012, ...fur });
    b.sph([sd * 0.08, 0.19, -0.14], 0.018, { b: 'hand' + n, k: 0.01, col: 'light', ...fur });
    b.roles.arms.push({ b: 'arm' + n, lower: 'fore' + n, side: sd, rest: [0.5, 0, 0.15], bendRest: -0.7 });
  });
  b.springs = [{ b: 'tail3', side: 1, gain: 0.6 }];
};

// ======================================================================== ZAPPIT (microraptor)
// A sugar-glider of static: huge night eyes, round ears, glowing cheek
// pouches, gliding flaps along its sides and a lightning-bolt tail.
DESIGNS.microraptor = (b, L) => {
  b.size = 0.5; b.br = 0.07; b.res = 74;
  b.pal = { light: 0xfff4d0, nose: 0xf08aa0, inner: 0xf0a8b8, glow: L.glow ?? 0x8ae8ff };
  b.eyeStyle = { iris: 0x2a2a3a, iris2: 0x080810, irisR: 0.72, glow: 0.3 };
  b.anim = { stride: 0.6, lift: 0.25, bob: 0.06, jaw: 0.5, stabilize: 0.7, tailUp: 0.6 };
  b.blush = [0.05, 0.18, -0.19, 0.02];
  b.pattern = { type: 'stripes', scale: 7, th: 0.72 };
  torso(b, { hips: [0, 0.115, 0.08], spine: [[0, 0.13, 0.0]], chest: [0, 0.135, -0.07], neck: [[0, 0.155, -0.11]], head: [0, 0.185, -0.14], jaw: [0, 0.163, -0.18],
    tail: [[0, 0.13, 0.15], [0, 0.17, 0.21], [0, 0.23, 0.25]] });
  const fur = { mat: FUR(0.8) };
  b.ell([0, 0.125, 0.0], [0.06, 0.055, 0.1], { b: ['hips', 'spine1', 'chest'], k: 0.02, belly: 1, mat: { fur: 0.8, pat: 1 } });
  b.sph([0, 0.2, -0.15], 0.066, { b: 'head', k: 0.03, ...fur });
  b.ell([0, 0.178, -0.2], [0.032, 0.026, 0.026], { b: 'head', k: 0.025, col: 'light', ...fur });
  b.ell([0, 0.19, -0.226], [0.01, 0.007, 0.006], { b: 'head', k: 0.006, col: 'nose', cf: -0.4, cp: 2 });
  mouth(b, { cav: { c: [0, 0.167, -0.196], r: [0.02, 0.008, 0.02] }, jaw: { c: [0, 0.163, -0.194], r: [0.021, 0.0095, 0.021] }, col: 'light', mat: FUR(0.4) });
  // glowing cheek pouches
  b.mirror((sd) => { b.ell([sd * 0.044, 0.178, -0.186], [0.022, 0.02, 0.02], { b: 'head', k: 0.016, ...fur }); b.ell([sd * 0.05, 0.178, -0.192], [0.016, 0.014, 0.012], { op: 'paint', col: 'glow', mat: { glow: 1 }, cf: -0.6 }); });
  eyePair(b, { c: [0.032, 0.214, -0.195], r: 0.03, dir: [0.48, 0.12, -1], socket: 0.85 });
  earPair(b, { root: [0.035, 0.245, -0.14], tip: [0.075, 0.29, -0.13], w: 0.032, t: 0.008, inner: 'inner', face: [0.4, 0.2, -1], up: [0, 0, 0.3], down: [0.7, 0, -0.5] });
  // gliding flaps from wrist to ankle
  b.mirror((sd, n) => b.ell([sd * 0.075, 0.1, 0.0], [0.05, 0.008, 0.095], { b: [['upF' + n, 0], ['upH' + n, 1]], k: 0.02, mat: { fur: 0.6, pat: 1 }, belly: 0.6 }));
  // lightning-bolt tail
  b.chain([[0, 0.13, 0.13], [0, 0.19, 0.2], [0, 0.18, 0.24], [0, 0.26, 0.3], [0, 0.25, 0.33], [0, 0.33, 0.38]], [0.022, 0.02, 0.018, 0.016, 0.013, 0.006], { b: ['tail1', 'tail2', 'tail2', 'tail3', 'tail3', 'tail3'], k: 0.006, col: 'accent', mat: { fur: 0.3, glow: 0.08 } });
  limbs(b, 'H', 'hips', [[0.048, 0.1, 0.09], [0.058, 0.06, 0.065], [0.058, 0.025, 0.1], [0.058, 0.0, 0.075]], [0.02, 0.015, 0.012, 0.011], { col: 'body', mat: FUR(0.6), foot: 'pad' });
  limbs(b, 'F', 'chest', [[0.048, 0.11, -0.07], [0.054, 0.065, -0.07], [0.054, 0.025, -0.075], [0.054, 0.0, -0.092]], [0.018, 0.014, 0.011, 0.01], { col: 'body', mat: FUR(0.6), foot: 'pad', front: true });
};

// ======================================================================== VOLTFANG (raptor)
// A lean thunder-wolf: tall ears, a crackling spiked mane, glowing bolt
// stripes, slit eyes and a long grin full of teeth. Hunts in packs at night.
DESIGNS.raptor = (b, L) => {
  b.size = 1.9; b.br = 0.26; b.res = 112;
  b.pal = { light: 0xdfe6f8, nose: 0x14141c, inner: 0x1a1a2a, claw: 0x1a1a22, mouth: 0x4a1424 };
  b.eyeStyle = { iris: L.accent ?? 0xffd83a, iris2: 0xff8a10, pupil: 'slit', irisR: 0.66, glow: 0.9 };
  b.anim = { stride: 0.75, lift: 0.22, bob: 0.04, jaw: 0.5, stabilize: 0.75, tailUp: 0.2 };
  b.pattern = { type: 'zigzag', scale: 1.5, th: 0.07 };
  b.glowPattern = true;
  torso(b, { hips: [0, 0.76, 0.46], spine: [[0, 0.82, 0.05]], chest: [0, 0.86, -0.3], neck: [[0, 0.98, -0.55]], head: [0, 1.12, -0.74], jaw: [0, 1.03, -0.86],
    tail: [[0, 0.82, 0.7], [0, 0.88, 0.98], [0, 0.93, 1.26]] });
  const fur = { mat: FUR(0.8) };
  const ruff = { col: 'light', mat: FUR(1) };
  // deep fluffy chest, tucked waist
  b.ell([0, 0.86, -0.26], [0.25, 0.3, 0.32], { b: ['spine1', 'chest'], k: 0.1, belly: 1, mat: { fur: 0.8, pat: 1 } });
  b.ell([0, 0.8, 0.25], [0.19, 0.2, 0.3], { b: ['hips', 'spine1'], k: 0.1, belly: 1, mat: { fur: 0.8, pat: 1 } });
  b.cone([0, 0.9, -0.4], [0, 1.08, -0.7], 0.17, 0.14, { b: ['chest', 'neck1', 'head'], k: 0.08, belly: 1, ...fur });
  // a big white ruff around the neck and chest
  b.ell([0, 0.9, -0.48], [0.24, 0.26, 0.2], { b: ['chest', 'neck1'], k: 0.06, ...ruff });
  b.scatter([0, 0.9, -0.48], [0.24, 0.26, 0.2], 70, 0.07, { b: 'neck1', k: 0.03, ...ruff, filter: (x, y, z) => z < 0.4, seed: 5 });
  // round head, short muzzle, fluffy cheeks
  b.ell([0, 1.14, -0.78], [0.2, 0.185, 0.2], { b: 'head', k: 0.06, ...fur });
  b.ell([0, 1.07, -0.98], [0.1, 0.085, 0.13], { b: 'head', k: 0.07, ...fur });
  b.ell([0, 1.06, -0.99], [0.095, 0.07, 0.12], { op: 'paint', col: 'light', cf: 0.03 });
  b.mirror((sd) => { b.ell([sd * 0.15, 1.06, -0.82], [0.09, 0.08, 0.09], { b: 'head', k: 0.06, ...ruff }); b.scatter([sd * 0.15, 1.06, -0.82], [0.09, 0.08, 0.09], 14, 0.035, { b: 'head', k: 0.015, ...ruff, filter: (x) => x * sd > 0, seed: 3 + sd }); });
  b.ell([0, 1.11, -1.1], [0.036, 0.026, 0.024], { b: 'head', k: 0.02, col: 'nose', cf: -0.4, cp: 2, mat: { gloss: 0.6 } });
  mouth(b, { cav: { c: [0, 1.025, -0.98], r: [0.075, 0.03, 0.12] }, jaw: { c: [0, 1.017, -0.97], r: [0.078, 0.033, 0.125] }, col: 'light', mat: FUR(0.4) });
  b.mirror((sd) => {
    b.tooth({ b: 'head', p: [sd * 0.05, 1.045, -1.05], len: 0.05, r: 0.012, dir: [0, -1, -0.1] });
    for (let i = 0; i < 2; i++) b.tooth({ b: 'head', p: [sd * 0.062, 1.045, -0.98 + i * 0.05], len: 0.022, r: 0.008 });
    b.tooth({ b: 'jaw', p: [sd * 0.045, 1.04, -1.06], len: 0.03, r: 0.009, dir: [0, 1, -0.1] });
  });
  eyePair(b, { c: [0.088, 1.18, -0.92], r: 0.054, dir: [0.5, 0.1, -1], brow: { r: [0.055, 0.017, 0.03], tilt: 0.3, dy: 0.95 } });
  earPair(b, { kind: 'tri', root: [0.1, 1.25, -0.74], tip: [0.18, 1.52, -0.7], w: 0.085, t: 0.022, inner: 'light', face: [0.35, 0, -1], up: [0, 0, 0.25], down: [0.9, 0, -0.35], mat: FUR(0.6) });
  // crackling crest of spikes from crown to shoulders
  const mane = [];
  for (let i = 0; i < 8; i++) { const t = i / 7; mane.push({ c: [0, 1.25 - t * 0.3, -0.74 + t * 0.6], k: 1.15 - Math.abs(t - 0.3) * 0.9, b: t < 0.25 ? 'head' : t < 0.6 ? 'neck1' : 'chest' }); }
  spikes(b, mane, { w: 0.06, h: 0.24, t: 0.02, col: 'accent', dirAt: (i) => [0, 1, 0.5 + i * 0.12], up: [1, 0, 0], mat: { fur: 0.2, glow: 0.8 } });
  // a big bushy tail with a bolt tip
  b.chain([[0, 0.82, 0.64], [0, 0.88, 0.94], [0, 0.94, 1.24], [0, 0.99, 1.42]], [0.08, 0.14, 0.12, 0.04], { b: ['tail1', 'tail2', 'tail3', 'tail3'], k: 0.06, mat: { fur: 1, pat: 1 } });
  b.scatter([0, 0.9, 1.08], [0.12, 0.13, 0.26], 34, 0.06, { b: 'tail2', k: 0.025, mat: { fur: 1, pat: 1 }, seed: 7 });
  spikes(b, [{ c: [0, 0.98, 1.36] }], { b: 'tail3', w: 0.07, h: 0.24, t: 0.02, col: 'accent', dir: [0, 0.6, 1], up: [1, 0, 0], mat: { glow: 0.8 } });
  limbs(b, 'H', 'hips', [[0.15, 0.7, 0.46], [0.17, 0.47, 0.34], [0.16, 0.2, 0.54], [0.16, 0.0, 0.47]], [0.12, 0.075, 0.055, 0.05], { col: 'body', mat: { fur: 0.8, pat: 1 }, foot: 'paw', toes: 3, claws: true, toeLen: 1.1 });
  limbs(b, 'F', 'chest', [[0.16, 0.74, -0.3], [0.17, 0.44, -0.28], [0.165, 0.12, -0.32], [0.165, 0.0, -0.38]], [0.11, 0.07, 0.055, 0.05], { col: 'body', mat: { fur: 0.8, pat: 1 }, foot: 'paw', toes: 3, claws: true, toeLen: 1.1, front: true });
};

// ======================================================================== GRUMBLET (proto)
// A grumpy pig-armadillo with a stone face shield, banded stone back, tiny
// tusks and permanently disappointed eyes.
DESIGNS.proto = (b, L) => {
  b.size = 1.6; b.br = 0.34; b.res = 80;
  b.pal = { light: 0xf0d8b8, nose: 0xe89a90, horn: L.horn ?? 0x8f877a, glow: L.glow ?? 0xffa030, claw: 0x3a3028 };
  b.eyeStyle = { iris: 0x6a4a2a, iris2: 0x2a1a0a, irisR: 0.58, lid: 'body' };
  b.faceBias = { top: -0.3, tilt: 0.22, curve: -0.1 };
  b.anim = { stride: 0.55, lift: 0.18, bob: 0.06, jaw: 0.4, stabilize: 0.6, tailUp: 0.2 };
  torso(b, { hips: [0, 0.55, 0.32], spine: [[0, 0.6, 0.0]], chest: [0, 0.6, -0.3], neck: [[0, 0.6, -0.46]], head: [0, 0.6, -0.6], jaw: [0, 0.48, -0.72],
    tail: [[0, 0.6, 0.62], [0, 0.55, 0.74]] });
  const skin = { mat: FUR(0.25) };
  b.ell([0, 0.58, 0.0], [0.36, 0.34, 0.52], { b: ['hips', 'spine1', 'chest'], k: 0.06, belly: 1, ...skin });
  // stone bands across the back
  for (const [i, z] of [-0.32, -0.12, 0.08, 0.28].entries()) b.ell([0, 0.6, z], [0.378, 0.36, 0.11], { b: i < 2 ? 'chest' : 'hips', k: 0.03, col: 'horn', belly: 1, mat: { gloss: 0.15, glow: 0.0, pat: 1 } });
  b.pattern = { type: 'cracks', scale: 5, th: 0.06, col: 'glow' };
  b.glowPattern = true;
  // head, pig snout, face shield, tusks
  b.ell([0, 0.6, -0.68], [0.24, 0.22, 0.24], { b: 'head', k: 0.06, ...skin });
  b.ell([0, 0.52, -0.87], [0.14, 0.12, 0.12], { b: 'head', k: 0.06, col: 'light', ...skin });
  b.ell([0, 0.53, -0.97], [0.09, 0.075, 0.028], { b: 'head', k: 0.03, col: 'nose', cf: -0.4, cp: 2, mat: { gloss: 0.4 } });
  b.mirror((sd) => b.ell([sd * 0.035, 0.53, -1.0], [0.02, 0.028, 0.02], { op: 'sub', k: 0.01, col: 'mouth', cf: -0.4 }));
  b.box([0, 0.78, -0.62], [0.3, 0.2, 0.045], 0.04, { b: 'head', rot: [-0.55, 0, 0], k: 0.05, col: 'horn', mat: { gloss: 0.2, pat: 1 } });
  mouth(b, { cav: { c: [0, 0.47, -0.85], r: [0.1, 0.035, 0.11] }, jaw: { c: [0, 0.462, -0.845], r: [0.105, 0.04, 0.115] }, col: 'light', mat: FUR(0.2) });
  b.mirror((sd) => b.cone([sd * 0.08, 0.47, -0.92], [sd * 0.12, 0.6, -0.97], 0.024, 0.006, { g: 'jaw', b: 'jaw', k: 0.01, col: 'horn', cf: -0.4, mat: { gloss: 0.5 } }));
  eyePair(b, { c: [0.13, 0.66, -0.86], r: 0.06, dir: [0.6, 0.05, -1], brow: { r: [0.07, 0.025, 0.04], tilt: 0.4, dy: 0.9 } });
  earPair(b, { root: [0.16, 0.74, -0.62], tip: [0.3, 0.78, -0.58], w: 0.06, t: 0.02, inner: 'nose', face: [0.3, 0.3, -1], up: [0, 0, 0.3], down: [0.4, 0, -0.6] });
  b.chain([[0, 0.6, 0.5], [0, 0.56, 0.68], [0, 0.5, 0.78]], [0.06, 0.04, 0.015], { b: ['tail1', 'tail2', 'tail2'], k: 0.04, ...skin });
  limbs(b, 'H', 'hips', [[0.24, 0.45, 0.34], [0.26, 0.26, 0.38], [0.26, 0.1, 0.36], [0.26, 0.0, 0.33]], [0.11, 0.08, 0.07, 0.065], { col: 'body', mat: FUR(0.25), foot: 'hoof' });
  limbs(b, 'F', 'chest', [[0.24, 0.45, -0.3], [0.25, 0.26, -0.3], [0.25, 0.1, -0.31], [0.25, 0.0, -0.35]], [0.11, 0.08, 0.07, 0.065], { col: 'body', mat: FUR(0.25), foot: 'hoof', front: true });
};

// ======================================================================== EMBERSTRUT (gallimimus)
// A long-legged fire bird: a fluffy plumage ball on stilts, a candle-flame
// crest and an ember-tipped tail fan. Panics at full sprint.
DESIGNS.gallimimus = (b, L) => {
  b.size = 1.9; b.br = 0.26; b.res = 100;
  b.pal = { light: 0xfff0d0, horn: L.horn ?? 0xf0b040, claw: 0x4a2a1a, glow: 0xff8a20, inner: 0xffd080 };
  b.eyeStyle = { iris: 0xffc040, iris2: 0xc05010, irisR: 0.6, glow: 0.5 };
  b.anim = { stride: 0.85, lift: 0.3, bob: 0.05, jaw: 0.5, stabilize: 0.9, tailUp: 0.4 };
  torso(b, { hips: [0, 1.02, 0.12], spine: [[0, 1.06, 0.0]], chest: [0, 1.12, -0.16], neck: [[0, 1.3, -0.3], [0, 1.5, -0.36], [0, 1.66, -0.4]], head: [0, 1.77, -0.44], jaw: [0, 1.755, -0.52],
    tail: [[0, 1.1, 0.34], [0, 1.22, 0.5]] });
  const plume = { mat: FUR(1) };
  b.ell([0, 1.06, 0.06], [0.25, 0.27, 0.35], { b: ['hips', 'spine1', 'chest'], k: 0.05, belly: 0.35, ...plume });
  b.scatter([0, 1.06, 0.06], [0.25, 0.27, 0.35], 110, 0.06, { b: 'spine1', k: 0.025, ...plume, filter: (x, y) => y > -0.7, seed: 3 });
  b.chain([[0, 1.14, -0.2], [0, 1.3, -0.3], [0, 1.5, -0.36], [0, 1.66, -0.41], [0, 1.77, -0.45]], [0.14, 0.095, 0.08, 0.075, 0.08], { b: ['chest', 'neck1', 'neck2', 'neck3', 'head'], k: 0.05, belly: 1, mat: FUR(0.8) });
  b.scatter([0, 1.22, -0.26], [0.13, 0.12, 0.12], 36, 0.045, { b: 'neck1', k: 0.02, ...plume, seed: 8 });
  b.scatter([0, 1.5, -0.36], [0.085, 0.12, 0.085], 24, 0.035, { b: 'neck2', k: 0.015, ...plume, seed: 9 });
  // head and beak
  b.sph([0, 1.81, -0.47], 0.12, { b: 'head', k: 0.05, mat: FUR(0.7) });
  b.scatter([0, 1.81, -0.47], [0.12, 0.12, 0.12], 26, 0.035, { b: 'head', k: 0.015, mat: FUR(0.9), filter: (x, y, z) => z > -0.3, seed: 12 });
  b.mirror((sd) => b.ell([sd * 0.06, 1.77, -0.52], [0.065, 0.055, 0.06], { b: 'head', k: 0.03, col: 'light', mat: FUR(0.5) }));
  b.cone([0, 1.795, -0.57], [0, 1.77, -0.68], 0.05, 0.012, { b: 'head', k: 0.02, col: 'horn', cf: -0.4, cp: 2, mat: { gloss: 0.5, fur: 0 } });
  b.cone([0, 1.76, -0.56], [0, 1.755, -0.65], 0.036, 0.009, { g: 'jaw', b: 'jaw', col: 'horn', mat: { gloss: 0.5, fur: 0 } });
  eyePair(b, { c: [0.068, 1.845, -0.55], r: 0.048, dir: [0.55, 0.12, -0.85], socket: 0.85 });
  // flame crest and little wing tufts
  b.add({ kind: 'flame', b: 'head', p: [0, 1.92, -0.44], s: 0.1, rot: [-0.3, 0, 0] });
  spikes(b, [{ c: [0, 1.86, -0.45], k: 1 }, { c: [0, 1.85, -0.41], k: 0.8 }, { c: [0, 1.84, -0.49], k: 0.6 }], { b: 'head', w: 0.03, h: 0.14, t: 0.01, col: 'accent', dir: [0, 1, 0.5], up: [1, 0, 0], mat: { glow: 0.5 } });
  b.mirror((sd) => spikes(b, [0, 1, 2].map((i) => ({ c: [sd * 0.22, 1.12 - i * 0.04, -0.05 + i * 0.07], k: 1 - i * 0.18 })), { b: 'chest', w: 0.06, h: 0.24, t: 0.016, col: 'pat', dir: [sd * 0.4, -0.3, 1], up: [sd, 0.3, 0], mat: FUR(0.4) }));
  // ember tail fan
  spikes(b, [-2, -1, 0, 1, 2].map((i) => ({ c: [i * 0.03, 1.2, 0.48], k: 1 - Math.abs(i) * 0.12 })), { b: 'tail2', w: 0.06, h: 0.42, t: 0.014, col: 'accent', dirAt: (i) => [(i - 2) * 0.35, 0.75, 1], up: [0, 0.3, -1], mat: { fur: 0.3, glow: 0.45 } });
  // stilts: fluffy thighs, scaly shins, three toes
  b.mirror((sd, n) => b.ell([sd * 0.14, 0.93, 0.04], [0.1, 0.16, 0.12], { b: 'upH' + n, k: 0.05, ...plume }));
  limbs(b, 'H', 'hips', [[0.13, 1.0, 0.1], [0.15, 0.8, -0.08], [0.14, 0.36, 0.1], [0.14, 0.0, 0.04]], [0.09, 0.055, 0.04, 0.036], { col: 'horn', mat: { fur: 0, gloss: 0.2 }, toes: 3, claws: true, toeLen: 2.4, toeSpread: 0.55 });
};

// ======================================================================== KNOCKLE (pachy)
// A kangaroo with a crystal geode for a forehead: huge hopping legs, a
// tripod tail, little boxing arms and a dome that rings when it headbutts.
DESIGNS.pachy = (b, L) => {
  b.size = 2.6; b.br = 0.36; b.res = 96;
  b.pal = { light: 0xf4f0ff, nose: 0x3a2a4a, claw: 0x2a2030, inner: 0xd0a8f0, glow: 0x9ae8ff, horn: 0x9a92a8 };
  b.eyeStyle = { iris: 0x9a6aff, iris2: 0x3a1a8a, irisR: 0.6, glow: 0.5 };
  b.anim = { stride: 0.9, lift: 0.4, hop: true, jaw: 0.4, stabilize: 0.85, tailUp: 0.05 };
  b.pattern = { type: 'stripes', scale: 2.2, th: 0.6 };
  torso(b, { hips: [0, 1.0, 0.22], spine: [[0, 1.28, 0.06]], chest: [0, 1.55, -0.08], neck: [[0, 1.78, -0.16]], head: [0, 1.98, -0.24], jaw: [0, 1.875, -0.4],
    tail: [[0, 0.92, 0.48], [0, 0.7, 0.82], [0, 0.46, 1.12], [0, 0.24, 1.38]] });
  const fur = { mat: FUR(0.7) };
  b.ell([0, 1.25, 0.08], [0.36, 0.5, 0.36], { b: ['hips', 'spine1', 'chest'], k: 0.08, belly: 1, rot: [-0.25, 0, 0], mat: { fur: 0.7, pat: 1 } });
  b.ell([0, 1.62, -0.1], [0.27, 0.26, 0.24], { b: 'chest', k: 0.08, belly: 1, ...fur });
  b.ell([0, 2.02, -0.3], [0.24, 0.23, 0.25], { b: 'head', k: 0.06, ...fur });
  b.ell([0, 1.92, -0.52], [0.14, 0.12, 0.14], { b: 'head', k: 0.07, col: 'light', ...fur });
  b.ell([0, 1.975, -0.645], [0.05, 0.034, 0.025], { b: 'head', k: 0.02, col: 'nose', cf: -0.4, cp: 2, mat: { gloss: 0.5 } });
  mouth(b, { cav: { c: [0, 1.86, -0.53], r: [0.1, 0.034, 0.11] }, jaw: { c: [0, 1.852, -0.525], r: [0.105, 0.04, 0.115] }, col: 'light', mat: FUR(0.4) });
  // the geode dome
  b.ell([0, 2.2, -0.27], [0.25, 0.14, 0.26], { b: 'head', k: 0.07, col: 'horn', cf: -0.6, cp: 2, mat: { gloss: 0.2, fur: 0 }, amp: 0.03, nf: 9 });
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.add({ kind: 'crystal', b: 'head', p: [Math.cos(a) * 0.15, 2.27 - (i % 2) * 0.02, -0.27 + Math.sin(a) * 0.15], s: 0.17 + (i % 3) * 0.04, rot: [Math.sin(a) * 0.6, a, -Math.cos(a) * 0.6] }); }
  b.add({ kind: 'crystal', b: 'head', p: [0, 2.3, -0.27], s: 0.3 }); b.add({ kind: 'crystal', b: 'head', p: [0.05, 2.3, -0.33], s: 0.22, rot: [0.3, 1, 0.3] });
  eyePair(b, { c: [0.11, 2.05, -0.5], r: 0.07, dir: [0.42, 0.06, -1], brow: { r: [0.075, 0.025, 0.04], tilt: 0.25, dy: 0.95 } });
  earPair(b, { root: [0.19, 2.12, -0.22], tip: [0.36, 2.2, -0.12], w: 0.075, t: 0.022, inner: 'inner', face: [0.4, 0.4, -1], up: [0, 0, 0.4], down: [0.3, -0.4, -0.7] });
  b.chain([[0, 0.95, 0.4], [0, 0.7, 0.82], [0, 0.46, 1.12], [0, 0.24, 1.38], [0, 0.12, 1.5]], [0.24, 0.18, 0.12, 0.07, 0.03], { b: ['tail1', 'tail2', 'tail3', 'tail4', 'tail4'], k: 0.08, belly: 1, mat: { fur: 0.7, pat: 1 } });
  limbs(b, 'H', 'hips', [[0.22, 0.98, 0.22], [0.27, 0.6, -0.06], [0.25, 0.13, 0.34], [0.25, 0.0, -0.1]], [0.2, 0.12, 0.08, 0.07], { col: 'body', mat: { fur: 0.7, pat: 1 }, foot: 'pad', toes: 3, claws: true, toeLen: 1.4 });
  b.mirror((sd, n) => {
    b.bone('arm' + n, 'chest', [sd * 0.22, 1.56, -0.2]); b.bone('fore' + n, 'arm' + n, [sd * 0.28, 1.32, -0.34]); b.bone('hand' + n, 'fore' + n, [sd * 0.28, 1.17, -0.42]);
    b.chain([[sd * 0.22, 1.56, -0.2], [sd * 0.28, 1.32, -0.34], [sd * 0.28, 1.18, -0.42]], [0.08, 0.06, 0.05], { b: ['arm' + n, 'fore' + n, 'hand' + n], k: 0.04, ...fur });
    b.sph([sd * 0.28, 1.14, -0.44], 0.065, { b: 'hand' + n, k: 0.03, col: 'light', ...fur });
    b.roles.arms.push({ b: 'arm' + n, lower: 'fore' + n, side: sd, rest: [0.35, 0, 0.1], bendRest: -0.8 });
  });
};

// ======================================================================== SPITFRILL (dilo)
// A frog-faced salamander with bulging eyes, a wide grin and a neck frill like
// a satellite dish that flares when it is angry. Glowing poison spots.
DESIGNS.dilo = (b, L) => {
  b.size = 4; b.br = 0.32; b.res = 100;
  b.pal = { light: 0xf0e0ff, nose: 0x2a1a3a, claw: 0x2a1a3a, inner: 0xd8ff8a, mouth: 0x6a1a5a, tongue: 0xb8ff6a };
  b.eyeStyle = { iris: 0xd8ff3a, iris2: 0x5aa010, pupil: 'slit', irisR: 0.7, glow: 0.7 };
  b.anim = { stride: 0.7, lift: 0.18, bob: 0.03, jaw: 0.55, stabilize: 0.5, tailUp: 0.0 };
  b.pattern = { type: 'spots', scale: 2.4, th: 0.22 };
  b.glowPattern = true;
  torso(b, { hips: [0, 0.6, 0.8], spine: [[0, 0.64, 0.1]], chest: [0, 0.64, -0.55], neck: [[0, 0.68, -0.95]], head: [0, 0.72, -1.3], jaw: [0, 0.62, -1.3],
    tail: [[0, 0.6, 1.35], [0, 0.52, 1.95], [0, 0.42, 2.45], [0, 0.32, 2.85]] });
  b.bone('frill', 'neck1', [0, 0.78, -1.02]);
  b.roles.frill = 'frill';
  const skin = { mat: { fur: 0.1, pat: 1, gloss: 0.25 } };
  b.ell([0, 0.6, 0.1], [0.42, 0.3, 0.85], { b: ['hips', 'spine1', 'chest'], k: 0.1, belly: 1, ...skin });
  b.cone([0, 0.64, -0.6], [0, 0.7, -1.15], 0.3, 0.24, { b: ['chest', 'neck1', 'head'], k: 0.08, belly: 1, ...skin });
  // wide flat frog head with eye bumps
  b.ell([0, 0.72, -1.4], [0.36, 0.2, 0.32], { b: 'head', k: 0.08, ...skin });
  b.ell([0, 0.68, -1.62], [0.27, 0.14, 0.17], { b: 'head', k: 0.08, ...skin });
  b.mirror((sd) => b.ell([sd * 0.18, 0.86, -1.4], [0.13, 0.11, 0.12], { b: 'head', k: 0.07, ...skin }));
  eyePair(b, { c: [0.19, 0.91, -1.47], r: 0.1, dir: [0.5, 0.45, -0.85], socket: 0.85 });
  b.mirror((sd) => b.sph([sd * 0.07, 0.76, -1.78], 0.016, { op: 'sub', k: 0.01, col: 'nose', cf: -0.4 }));
  mouth(b, { cav: { c: [0, 0.6, -1.5], r: [0.3, 0.05, 0.25] }, jaw: { c: [0, 0.592, -1.49], r: [0.31, 0.055, 0.26] }, col: 'light', mat: { gloss: 0.2 } });
  // the frill: a dish of skin with glowing ribs
  b.group('frill', { hk: 0.6 });
  b.ell([0, 0.8, -1.02], [0.8, 0.64, 0.045], { g: 'frill', b: 'frill', col: 'accent', mat: { fur: 0, glow: 0.12, pat: 0.6 }, rot: [0.25, 0, 0] });
  const ribs = [];
  for (let i = 0; i < 9; i++) { const a = -1.75 + (i / 8) * 3.5; ribs.push({ c: [0, 0.8, -1.0], dir: [Math.sin(a), Math.cos(a), 0.25] }); }
  for (const r of ribs) b.tri(r.c, [0.05, 0.72, 0.035], 0.015, { g: 'frill', b: 'frill', dir: r.dir, up: [0, -0.25, -1], k: 0.04, col: 'pat', mat: { glow: 0.6 } });
  b.chain([[0, 0.6, 1.2], [0, 0.52, 1.95], [0, 0.42, 2.45], [0, 0.32, 2.85], [0, 0.26, 3.1]], [0.25, 0.17, 0.11, 0.06, 0.02], { b: ['tail1', 'tail2', 'tail3', 'tail4', 'tail4'], k: 0.08, belly: 1, ...skin });
  limbs(b, 'H', 'hips', [[0.36, 0.55, 0.85], [0.66, 0.5, 0.95], [0.72, 0.14, 0.9], [0.74, 0.0, 0.75]], [0.14, 0.1, 0.075, 0.07], { col: 'body', ...skin, pole: [1, 0.3, -0.3], foot: 'pad', toes: 4, toeLen: 1.6, toeSpread: 0.5 });
  limbs(b, 'F', 'chest', [[0.33, 0.55, -0.58], [0.62, 0.48, -0.64], [0.66, 0.14, -0.7], [0.68, 0.0, -0.86]], [0.13, 0.09, 0.07, 0.065], { col: 'body', ...skin, pole: [1, 0.3, 0.3], foot: 'pad', toes: 4, toeLen: 1.6, toeSpread: 0.5, front: true });
};

// ======================================================================== GUSTAIL (ptera)
// A great white sky-owl: round fluffy body, a heart-shaped face with huge
// eyes, ear tufts, broad feathered wings and two ribbon tail streamers.
DESIGNS.ptera = (b, L) => {
  b.size = 3.2; b.br = 0.42; b.res = 96;
  b.pal = { light: 0xffffff, horn: 0xf0c060, claw: 0x3a3a3a, inner: 0xd0fff4 };
  b.eyeStyle = { iris: 0x40e0c8, iris2: 0x107060, irisR: 0.64, glow: 0.4 };
  b.anim = { stride: 0.6, lift: 0.2, bob: 0.06, jaw: 0.35, stabilize: 0.9, tailUp: 0.2 };
  b.group('wing', { hk: 1.6 });
  torso(b, { hips: [0, 0.75, 0.25], spine: [[0, 0.86, 0.06]], chest: [0, 0.96, -0.14], neck: [[0, 1.12, -0.24]], head: [0, 1.28, -0.3], jaw: [0, 1.21, -0.6],
    tail: [[0, 0.78, 0.55], [0, 0.74, 0.95], [0, 0.7, 1.35]] });
  const plume = { mat: FUR(1) };
  b.ell([0, 0.92, 0.1], [0.4, 0.46, 0.46], { b: ['hips', 'spine1', 'chest'], k: 0.06, belly: 1, ...plume });
  b.scatter([0, 0.92, 0.1], [0.4, 0.46, 0.46], 120, 0.08, { b: 'spine1', k: 0.035, ...plume, seed: 2 });
  b.sph([0, 1.32, -0.38], 0.3, { b: 'head', k: 0.08, ...plume });
  b.ell([0, 1.3, -0.6], [0.25, 0.21, 0.09], { op: 'paint', col: 'light', cf: 0.04 });
  b.cone([0, 1.27, -0.66], [0, 1.18, -0.76], 0.055, 0.012, { b: 'head', k: 0.02, col: 'horn', cf: -0.4, cp: 2, mat: { gloss: 0.5, fur: 0 } });
  b.cone([0, 1.215, -0.64], [0, 1.185, -0.7], 0.036, 0.01, { g: 'jaw', b: 'jaw', col: 'horn', mat: { gloss: 0.5, fur: 0 } });
  eyePair(b, { c: [0.12, 1.36, -0.62], r: 0.085, dir: [0.28, 0.05, -1], socket: 0.86 });
  earPair(b, { kind: 'tri', root: [0.15, 1.54, -0.36], tip: [0.25, 1.75, -0.32], w: 0.06, t: 0.02, col: 'pat', face: [0.3, 0, -1], up: [0, 0, 0.2], down: [0.6, 0, -0.3], mat: FUR(0.6) });
  // wings: three bones each, feathers along the trailing edge
  b.mirror((sd, n) => {
    b.bone('wa' + n, 'chest', [sd * 0.3, 1.05, -0.12]); b.bone('wb' + n, 'wa' + n, [sd * 1.0, 1.1, -0.05]); b.bone('wc' + n, 'wb' + n, [sd * 1.8, 1.1, 0.08]);
    const wg = { g: 'wing', mat: FUR(0.7) };
    b.ell([sd * 0.62, 1.07, 0.18], [0.42, 0.085, 0.4], { ...wg, b: [['wa' + n, 0], ['wb' + n, 1]], dir: [sd, 0, 0], up: [0, 1, 0] });
    b.ell([sd * 1.38, 1.09, 0.24], [0.48, 0.075, 0.36], { ...wg, b: [['wb' + n, 0], ['wc' + n, 1]], dir: [sd, 0, 0], up: [0, 1, 0] });
    b.ell([sd * 2.1, 1.09, 0.24], [0.46, 0.065, 0.26], { ...wg, b: 'wc' + n, dir: [sd, 0, 0], up: [0, 1, 0] });
    for (let i = 0; i < 9; i++) {
      const x = 0.45 + i * 0.27, bn = i < 2 ? 'wa' + n : i < 5 ? 'wb' + n : 'wc' + n;
      b.tri([sd * x, 1.08, 0.42 + (i < 5 ? 0.08 : -0.02)], [0.17, 0.55 - Math.abs(i - 4) * 0.03, 0.06], 0.03, { g: 'wing', b: bn, dir: [sd * (i - 2) * 0.1, 0, 1], up: [0, 1, 0], k: 0.06, col: i > 5 ? 'pat' : 'body', mat: FUR(0.5) });
    }
    b.roles.wings.push({ b: 'wa' + n, side: sd, fold: [-1.3, -1.4, 0.15] }, { b: 'wb' + n, side: sd, fold: [0, 2.9, 0], lag: 0.4 }, { b: 'wc' + n, side: sd, fold: [0, -2.8, 0], lag: 0.8 });
  });
  // ribbon streamers
  b.mirror((sd) => b.tri([sd * 0.08, 0.76, 0.6], [0.07, 1.4, 0.016], 0.01, { b: [['tail1', 0], ['tail3', 1]], dir: [sd * 0.15, -0.1, 1], up: [0, 1, 0], k: 0.03, col: 'accent', mat: { glow: 0.3 } }));
  spikes(b, [-1, 0, 1].map((i) => ({ c: [i * 0.08, 0.8, 0.5] })), { b: 'tail1', w: 0.1, h: 0.45, t: 0.025, col: 'body', dirAt: (i) => [(i - 1) * 0.4, 0.1, 1], up: [0, 1, 0], mat: FUR(0.7) });
  limbs(b, 'H', 'hips', [[0.13, 0.72, 0.18], [0.15, 0.5, 0.04], [0.14, 0.26, 0.16], [0.14, 0.0, 0.08]], [0.09, 0.05, 0.035, 0.03], { col: 'horn', mat: { fur: 0, gloss: 0.2 }, toes: 3, claws: true, toeLen: 2.2, toeSpread: 0.6 });
  b.mirror((sd, n) => b.ell([sd * 0.14, 0.62, 0.12], [0.1, 0.14, 0.11], { b: 'upH' + n, k: 0.05, ...plume }));
};

// ======================================================================== HORNPIPE (parasaur)
// A big soft river beast with a trumpet horn sweeping back from its brow,
// fin ears, sleepy kind eyes and a paddle tail. Honks at sunrise.
DESIGNS.parasaur = (b, L) => {
  b.size = 3.2; b.br = 0.62; b.res = 92;
  b.pal = { light: 0xe8f6ff, nose: 0x2a3a5a, hoof: 0x2a3040, inner: 0x9ae8ff, mouth: 0x5a2a3a };
  b.eyeStyle = { iris: 0x2a6ab0, iris2: 0x10305a, irisR: 0.6 };
  b.faceBias = { top: -0.18 };
  b.anim = { stride: 0.6, lift: 0.16, bob: 0.05, jaw: 0.4, chew: 'side', stabilize: 0.6, tailUp: 0.05 };
  b.pattern = { type: 'stripes', scale: 1.4, th: 0.55 };
  b.glowPattern = true;
  torso(b, { hips: [0, 1.3, 0.55], spine: [[0, 1.38, 0.05]], chest: [0, 1.4, -0.5], neck: [[0, 1.6, -0.85]], head: [0, 1.85, -1.08], jaw: [0, 1.7, -1.3],
    tail: [[0, 1.3, 1.0], [0, 1.15, 1.35], [0, 1.0, 1.62]] });
  const skin = { mat: { fur: 0.3, pat: 1 } };
  b.ell([0, 1.35, 0.02], [0.62, 0.62, 0.95], { b: ['hips', 'spine1', 'chest'], k: 0.1, belly: 1, ...skin });
  b.cone([0, 1.45, -0.6], [0, 1.82, -1.05], 0.4, 0.28, { b: ['chest', 'neck1', 'head'], k: 0.1, belly: 1, ...skin });
  b.ell([0, 1.9, -1.2], [0.3, 0.29, 0.36], { b: 'head', k: 0.08, mat: FUR(0.3) });
  b.ell([0, 1.76, -1.48], [0.25, 0.2, 0.22], { b: 'head', k: 0.1, col: 'light', mat: FUR(0.3) });
  b.mirror((sd) => b.ell([sd * 0.08, 1.86, -1.66], [0.035, 0.022, 0.03], { op: 'sub', k: 0.015, col: 'nose', cf: -0.4 }));
  mouth(b, { cav: { c: [0, 1.66, -1.47], r: [0.18, 0.05, 0.18] }, jaw: { c: [0, 1.652, -1.46], r: [0.19, 0.055, 0.19] }, col: 'light', mat: FUR(0.3) });
  // the trumpet horn
  b.chain([[0, 2.05, -1.22], [0, 2.4, -0.98], [0, 2.56, -0.6], [0, 2.5, -0.26]], [0.13, 0.15, 0.14, 0.12], { b: 'head', k: 0.08, col: 'accent', cf: -0.6, cp: 2, mat: { gloss: 0.5, fur: 0, glow: 0.2 } });
  b.sph([0, 2.46, -0.15], 0.18, { b: 'head', k: 0.06, col: 'accent', cf: -0.6, cp: 2, mat: { gloss: 0.5, fur: 0, glow: 0.2 } });
  b.sph([0, 2.45, -0.06], 0.13, { op: 'sub', k: 0.03, col: 'mouth', cf: -0.4 });
  eyePair(b, { c: [0.2, 1.98, -1.4], r: 0.09, dir: [0.55, 0.1, -1], brow: { r: [0.1, 0.03, 0.05], tilt: -0.15, dy: 0.95 } });
  earPair(b, { kind: 'tri', root: [0.26, 2.02, -1.1], tip: [0.52, 2.1, -0.94], w: 0.11, t: 0.025, col: 'accent', inner: 'inner', face: [0.2, 0.5, -1], up: [0, 0, 0.35], down: [0.4, -0.3, -0.6], mat: { glow: 0.15 } });
  // a paddle tail
  b.chain([[0, 1.32, 0.9], [0, 1.15, 1.35], [0, 1.0, 1.62]], [0.32, 0.2, 0.12], { b: ['tail1', 'tail2', 'tail3'], k: 0.1, belly: 1, ...skin });
  b.tri([0, 1.0, 1.55], [0.36, 0.5, 0.045], 0.03, { b: 'tail3', dir: [0, -0.35, 1], up: [0, 1, 0.3], k: 0.08, col: 'accent', mat: { glow: 0.15 } });
  limbs(b, 'H', 'hips', [[0.42, 1.15, 0.6], [0.45, 0.65, 0.68], [0.45, 0.28, 0.62], [0.45, 0.0, 0.58]], [0.26, 0.19, 0.15, 0.14], { col: 'body', ...skin, foot: 'pad', toes: 3, toeLen: 1.0, toeSpread: 0.5 });
  limbs(b, 'F', 'chest', [[0.4, 1.15, -0.5], [0.42, 0.66, -0.52], [0.42, 0.28, -0.52], [0.42, 0.0, -0.58]], [0.25, 0.18, 0.14, 0.13], { col: 'body', ...skin, foot: 'pad', toes: 3, toeLen: 1.0, toeSpread: 0.5, front: true });
};

// ======================================================================== THORNBACK (trike)
// A walking hill: shaggy shoulder hump, a mossy back sprouting flowers,
// three bramble horns and a broad soft nose. Gentle until it is not.
DESIGNS.trike = (b, L) => {
  b.size = 7.5; b.br = 1.15; b.res = 100;
  b.pal = { light: 0xe8dcc0, nose: 0x3a2a24, hoof: 0x3a2e28, horn: L.horn ?? 0xdcc8a0, inner: 0xc8a888 };
  b.eyeStyle = { iris: 0x6a8a2a, iris2: 0x2a3a10, irisR: 0.58 };
  b.faceBias = { top: -0.12 };
  b.anim = { stride: 0.5, lift: 0.14, bob: 0.04, jaw: 0.35, chew: 'side', stabilize: 0.5, tailUp: 0 };
  torso(b, { hips: [0, 1.9, 1.7], spine: [[0, 2.25, 0.4]], chest: [0, 2.3, -0.9], neck: [[0, 2.0, -1.8]], head: [0, 1.75, -2.4], jaw: [0, 1.38, -2.75],
    tail: [[0, 1.95, 2.7], [0, 1.6, 3.2]] });
  const hide = { mat: FUR(0.4) };
  b.ell([0, 2.0, 0.35], [1.15, 1.15, 1.8], { b: ['hips', 'spine1', 'chest'], k: 0.2, belly: 1, ...hide });
  b.ell([0, 2.6, -0.75], [1.05, 0.85, 0.95], { b: ['spine1', 'chest'], k: 0.3, belly: 0.6, col: 'pat', mat: FUR(1) });
  b.scatter([0, 2.6, -0.75], [1.05, 0.85, 0.95], 70, 0.26, { b: 'chest', k: 0.12, col: 'pat', mat: FUR(1), filter: (x, y, z) => y > -0.2 && z < 0.6, seed: 4 });
  // moss and flowers on the back
  b.scatter([0, 2.05, 0.6], [1.12, 1.12, 1.4], 90, 0.22, { b: 'spine1', k: 0.1, col: 'accent', mat: FUR(1), filter: (x, y) => y > 0.45, seed: 9, attr: true });
  for (let i = 0; i < 9; i++) { const a = i * 2.1, r = 0.35 + (i % 3) * 0.25; b.add({ kind: 'flower', b: 'spine1', p: [Math.cos(a) * r, 3.12 - r * 0.25, 0.6 + Math.sin(a) * r * 1.4], s: 0.16 + (i % 2) * 0.05, col: [0xf0a0c0, 0xffe070, 0xffffff][i % 3] }); }
  b.cone([0, 2.2, -1.3], [0, 1.9, -2.2], 0.75, 0.55, { b: ['chest', 'neck1', 'head'], k: 0.2, belly: 1, ...hide });
  b.ell([0, 1.75, -2.55], [0.7, 0.62, 0.75], { b: 'head', k: 0.15, ...hide });
  b.ell([0, 1.42, -3.1], [0.5, 0.42, 0.42], { b: 'head', k: 0.2, col: 'light', ...hide });
  b.mirror((sd) => b.ell([sd * 0.17, 1.52, -3.5], [0.08, 0.06, 0.06], { op: 'sub', k: 0.04, col: 'nose', cf: -0.4 }));
  mouth(b, { cav: { c: [0, 1.22, -3.05], r: [0.36, 0.1, 0.36] }, jaw: { c: [0, 1.2, -3.04], r: [0.37, 0.11, 0.37] }, col: 'light', mat: FUR(0.3) });
  // bramble horns
  const horn = { col: 'horn', cf: -0.6, cp: 2, mat: { gloss: 0.25, fur: 0 }, amp: 0.04, nf: 4, ridge: true };
  b.chain([[0, 1.72, -3.2], [0, 2.2, -3.38], [0, 2.75, -3.3]], [0.24, 0.13, 0.03], { b: 'head', k: 0.12, ...horn });
  b.mirror((sd) => b.chain([[sd * 0.42, 2.2, -2.55], [sd * 0.75, 2.6, -2.85], [sd * 0.9, 2.95, -3.25]], [0.16, 0.09, 0.02], { b: 'head', k: 0.1, ...horn }));
  eyePair(b, { c: [0.4, 1.92, -3.0], r: 0.16, dir: [0.6, 0.1, -1], brow: { r: [0.2, 0.06, 0.1], tilt: 0.1, dy: 0.95 } });
  earPair(b, { root: [0.6, 2.1, -2.35], tip: [0.95, 2.05, -2.25], w: 0.2, t: 0.06, inner: 'inner', face: [0.3, 0.3, -1], up: [0, 0, 0.3], down: [0.3, -0.3, -0.5] });
  b.chain([[0, 2.0, 2.4], [0, 1.6, 3.2], [0, 1.25, 3.45]], [0.4, 0.2, 0.08], { b: ['tail1', 'tail2', 'tail2'], k: 0.15, ...hide });
  b.scatter([0, 1.25, 3.45], [0.2, 0.25, 0.2], 10, 0.12, { b: 'tail2', k: 0.06, col: 'pat', mat: FUR(1) });
  limbs(b, 'H', 'hips', [[0.85, 1.6, 1.8], [0.9, 0.9, 1.95], [0.9, 0.35, 1.85], [0.9, 0.0, 1.75]], [0.5, 0.4, 0.36, 0.34], { col: 'body', ...hide, foot: 'hoof' });
  limbs(b, 'F', 'chest', [[0.85, 1.7, -1.0], [0.9, 0.95, -1.0], [0.9, 0.35, -1.0], [0.9, 0.0, -1.15]], [0.52, 0.42, 0.37, 0.35], { col: 'body', ...hide, foot: 'hoof', front: true });
};

// ======================================================================== PRISMBACK (stego)
// A crystal pangolin: an arched back of overlapping scales sprouting tall
// glowing crystals, a long snout, a heavy crystal-spiked tail.
DESIGNS.stego = (b, L) => {
  b.size = 7; b.br = 0.95; b.res = 100;
  b.pal = { light: 0xd8e0ff, nose: 0x1a1a2a, claw: 0x1a1a2a, glow: 0x7ae8ff };
  b.eyeStyle = { iris: 0x7ae8ff, iris2: 0x1a5a9a, irisR: 0.62, glow: 0.7 };
  b.anim = { stride: 0.5, lift: 0.14, bob: 0.04, jaw: 0.3, stabilize: 0.5, tailUp: 0.1 };
  b.pattern = { type: 'cracks', scale: 2.2, th: 0.08 };
  torso(b, { hips: [0, 1.9, 1.3], spine: [[0, 2.1, 0.2]], chest: [0, 1.85, -0.9], neck: [[0, 1.55, -1.6]], head: [0, 1.32, -2.1], jaw: [0, 1.12, -2.55],
    tail: [[0, 1.9, 2.2], [0, 1.7, 3.0], [0, 1.4, 3.7], [0, 1.1, 4.3]] });
  const scale = { mat: { fur: 0.1, gloss: 0.3, pat: 1 } };
  b.ell([0, 1.85, 0.2], [0.95, 0.95, 1.6], { b: ['hips', 'spine1', 'chest'], k: 0.2, belly: 1, ...scale });
  // overlapping scale ridges
  for (let i = 0; i < 6; i++) b.ell([0, 1.88 + Math.sin(i * 0.55) * 0.1, -0.9 + i * 0.45], [0.98, 0.98, 0.32], { b: i < 2 ? 'chest' : i < 4 ? 'spine1' : 'hips', k: 0.1, belly: 1, ...scale });
  b.cone([0, 1.7, -1.2], [0, 1.4, -1.95], 0.6, 0.42, { b: ['chest', 'neck1', 'head'], k: 0.2, belly: 1, ...scale });
  b.ell([0, 1.32, -2.2], [0.42, 0.38, 0.5], { b: 'head', k: 0.15, ...scale });
  b.cone([0, 1.2, -2.55], [0, 1.05, -3.15], 0.26, 0.13, { b: 'head', k: 0.12, col: 'light', ...scale });
  b.mirror((sd) => b.sph([sd * 0.05, 1.08, -3.26], 0.03, { op: 'sub', k: 0.02, col: 'nose', cf: -0.4 }));
  mouth(b, { cav: { c: [0, 1.0, -2.85], r: [0.12, 0.05, 0.3] }, jaw: { c: [0, 0.99, -2.83], r: [0.125, 0.055, 0.3] }, col: 'light', mat: { gloss: 0.2 } });
  eyePair(b, { c: [0.25, 1.45, -2.55], r: 0.13, dir: [0.6, 0.12, -1], brow: { r: [0.14, 0.05, 0.08], tilt: 0.2, dy: 0.95 } });
  earPair(b, { root: [0.32, 1.6, -2.1], tip: [0.55, 1.7, -2.0], w: 0.12, t: 0.04, inner: 'light', face: [0.3, 0.3, -1] });
  // the crystal cathedral on its back
  const rows = [[-0.6, 0.55], [-0.2, 0.75], [0.2, 0.9], [0.6, 0.95], [1.0, 0.85], [1.45, 0.7], [1.9, 0.55]];
  for (const [i, [z, k]] of rows.entries()) {
    const bn = z < -0.3 ? 'chest' : z < 1.0 ? 'spine1' : 'hips';
    for (const sd of [-1, 1]) b.add({ kind: 'crystal', b: bn, p: [sd * 0.34, 2.6 + k * 0.1, z + (sd > 0 ? 0.1 : -0.1)], s: 1.15 * k, rot: [0.2, i, sd * -0.4] });
    b.add({ kind: 'crystal', b: bn, p: [0, 2.7, z], s: 1.5 * k, rot: [0.15, i * 0.7, 0] });
  }
  b.chain([[0, 1.95, 1.9], [0, 1.7, 3.0], [0, 1.4, 3.7], [0, 1.1, 4.3], [0, 0.95, 4.65]], [0.6, 0.42, 0.3, 0.2, 0.12], { b: ['tail1', 'tail2', 'tail3', 'tail4', 'tail4'], k: 0.15, belly: 1, ...scale });
  for (const [i, a] of [0, 1.6, 3.2, 4.8].entries()) b.add({ kind: 'crystal', b: 'tail4', p: [Math.cos(a) * 0.18, 1.12 + Math.sin(a) * 0.12, 4.45 + i * 0.05], s: 0.42, rot: [Math.sin(a) * 1.3, 0, -Math.cos(a) * 1.3] });
  limbs(b, 'H', 'hips', [[0.7, 1.7, 1.4], [0.75, 0.95, 1.55], [0.75, 0.35, 1.45], [0.75, 0.0, 1.35]], [0.42, 0.32, 0.27, 0.26], { col: 'body', ...scale, foot: 'paw', toes: 3, claws: true, toeLen: 1.2 });
  limbs(b, 'F', 'chest', [[0.65, 1.4, -0.9], [0.7, 0.8, -0.95], [0.7, 0.3, -0.95], [0.7, 0.0, -1.1]], [0.36, 0.28, 0.24, 0.23], { col: 'body', ...scale, foot: 'paw', toes: 3, claws: true, toeLen: 1.3, front: true });
};

// ======================================================================== CLUBBERT (ankylo)
// A turtle that swallowed a quarry: a boulder shell, a beaky grumpy face,
// elephant feet and a tail club the size of a wheelbarrow.
DESIGNS.ankylo = (b, L) => {
  b.size = 6; b.br = 1.0; b.res = 96;
  b.pal = { light: 0xeadcb8, nose: 0x2a2420, claw: 0x2a2420, horn: L.horn ?? 0x847a70, beak: 0x4a4038, glow: 0xffa030 };
  b.eyeStyle = { iris: 0xc89040, iris2: 0x5a3a10, irisR: 0.58 };
  b.faceBias = { top: -0.28, tilt: 0.2 };
  b.anim = { stride: 0.45, lift: 0.14, bob: 0.03, jaw: 0.35, stabilize: 0.5, tailUp: 0.1 };
  b.pattern = { type: 'cracks', scale: 1.6, th: 0.05, col: 'glow' };
  b.glowPattern = true;
  torso(b, { hips: [0, 1.0, 1.0], spine: [[0, 1.1, 0.0]], chest: [0, 1.0, -0.9], neck: [[0, 0.95, -1.5]], head: [0, 0.95, -1.95], jaw: [0, 0.78, -2.2],
    tail: [[0, 0.95, 1.8], [0, 0.85, 2.6], [0, 0.75, 3.3]] });
  b.group('main', { hideIn: ['shell'] });
  const skin = { mat: FUR(0.2) };
  b.ell([0, 1.0, 0.05], [1.0, 0.6, 1.3], { b: ['hips', 'spine1', 'chest'], k: 0.1, belly: 1, ...skin });
  // the boulder shell (its own surface, rocky and glowing in the cracks)
  const rock = { g: 'shell', col: 'horn', mat: { gloss: 0.15, pat: 1 } };
  b.ell([0, 1.3, 0.05], [1.28, 0.88, 1.58], { b: ['hips', 'spine1', 'chest'], ...rock, amp: 0.12, nf: 1.6, oct: true });
  b.scatter([0, 1.3, 0.05], [1.28, 0.88, 1.58], 46, 0.34, { b: 'spine1', k: 0.15, ...rock, filter: (x, y) => y > -0.25, seed: 6, amp: 0.05, nf: 3 });
  b.cone([0, 1.0, -1.25], [0, 0.95, -1.9], 0.42, 0.36, { b: ['chest', 'neck1', 'head'], k: 0.15, belly: 1, ...skin });
  b.ell([0, 1.0, -2.05], [0.42, 0.36, 0.45], { b: 'head', k: 0.12, ...skin });
  b.cone([0, 0.98, -2.35], [0, 0.88, -2.66], 0.25, 0.07, { b: 'head', k: 0.1, col: 'beak', cf: -0.6, cp: 2, mat: { gloss: 0.4, fur: 0 } });
  b.cone([0, 0.8, -2.3], [0, 0.82, -2.58], 0.2, 0.06, { g: 'jaw', b: 'jaw', col: 'beak', mat: { gloss: 0.4, fur: 0 } });
  eyePair(b, { c: [0.24, 1.1, -2.32], r: 0.11, dir: [0.6, 0.1, -1], brow: { r: [0.15, 0.06, 0.09], tilt: 0.45, dy: 0.85, col: 'horn' } });
  // the club
  const club = { col: 'horn', cf: -0.6, mat: { gloss: 0.15, pat: 1 } };
  b.chain([[0, 0.98, 1.4], [0, 0.85, 2.6], [0, 0.75, 3.35]], [0.42, 0.24, 0.16], { b: ['tail1', 'tail2', 'tail3'], k: 0.12, belly: 1, ...skin });
  b.sph([0, 0.75, 3.6], 0.55, { b: 'tail3', k: 0.12, ...club, amp: 0.1, nf: 2.2, oct: true });
  b.mirror((sd) => b.sph([sd * 0.42, 0.78, 3.6], 0.3, { b: 'tail3', k: 0.12, ...club, amp: 0.06, nf: 3 }));
  limbs(b, 'H', 'hips', [[0.85, 0.85, 1.1], [0.95, 0.5, 1.15], [0.95, 0.2, 1.1], [0.95, 0.0, 1.0]], [0.36, 0.32, 0.3, 0.3], { col: 'body', ...skin, foot: 'pad', toes: 3, claws: true, toeLen: 0.8 });
  limbs(b, 'F', 'chest', [[0.85, 0.85, -0.9], [0.95, 0.5, -0.95], [0.95, 0.2, -0.95], [0.95, 0.0, -1.1]], [0.36, 0.32, 0.3, 0.3], { col: 'body', ...skin, foot: 'pad', toes: 3, claws: true, toeLen: 0.8, front: true });
};

// ======================================================================== TREENECK (brachio)
// A gentle skyscraper: a fluffy alpaca body on tree-trunk legs, a long neck,
// a sleepy face with floppy ears and leafy antlers, and a forest on its back.
DESIGNS.brachio = (b, L) => {
  b.size = 22; b.br = 3.0; b.res = 104;
  b.pal = { light: 0xfff8e8, nose: 0x5a4a3a, hoof: 0x4a3a2a, inner: 0xe8c8a8, horn: 0x8a6a48 };
  b.eyeStyle = { iris: 0x5a8a3a, iris2: 0x2a4a1a, irisR: 0.6 };
  b.faceBias = { top: -0.25, curve: 0.1 };
  b.anim = { stride: 0.45, lift: 0.12, bob: 0.03, jaw: 0.3, chew: 'side', stabilize: 0.4, tailUp: 0 };
  b.pattern = { type: 'patches', scale: 0.22, th: 0.58 };
  b.group('head', { hk: 0.5 });
  torso(b, { hips: [0, 8.5, 3.5], spine: [[0, 9.2, 0.5]], chest: [0, 9.6, -2.5], neck: [[0, 11.5, -4.0], [0, 14.0, -5.2], [0, 16.5, -6.0]], head: [0, 18.6, -6.6], jaw: [0, 17.9, -7.6],
    tail: [[0, 8.8, 6.2], [0, 7.4, 7.6]] });
  const fluff = { mat: { fur: 1, pat: 1 } };
  b.ell([0, 9.0, 0.5], [3.0, 3.0, 4.6], { b: ['hips', 'spine1', 'chest'], k: 0.6, belly: 1, ...fluff });
  b.scatter([0, 9.0, 0.5], [3.0, 3.0, 4.6], 130, 0.75, { b: 'spine1', k: 0.32, ...fluff, filter: (x, y) => y < 0.5, seed: 3 });
  b.chain([[0, 9.8, -2.6], [0, 11.5, -4.0], [0, 14.0, -5.2], [0, 16.5, -6.0], [0, 18.0, -6.4]], [2.1, 1.65, 1.35, 1.12, 0.95], { b: ['chest', 'neck1', 'neck2', 'neck3', 'head'], k: 0.5, belly: 1, ...fluff });
  // moss, trees and flowers on the back
  b.scatter([0, 9.2, 0.6], [2.95, 2.95, 4.4], 80, 0.6, { b: 'spine1', k: 0.3, col: 'accent', mat: FUR(1), filter: (x, y) => y > 0.55, seed: 8, attr: true });
  for (const [i, [x, z, h]] of [[-0.9, -0.6, 2.2], [1.0, 0.8, 2.8], [-0.3, 2.0, 1.8], [0.6, -1.8, 1.6], [-1.3, 1.2, 1.4]].entries()) {
    b.cone([x, 11.6, z], [x * 1.1, 11.6 + h, z], 0.18, 0.08, { b: 'spine1', k: 0.2, col: 'horn', mat: { fur: 0 } });
    for (let j = 0; j < 7; j++) { const a = j * 0.9 + i; b.add({ kind: 'leaf', b: 'spine1', p: [x * 1.1 + Math.cos(a) * 0.15, 11.6 + h - 0.1, z + Math.sin(a) * 0.15], s: 0.9 + (j % 3) * 0.2, rot: [Math.sin(a) * 1.1, a, Math.cos(a) * 1.1] }); }
  }
  for (let i = 0; i < 8; i++) { const a = i * 2.3; b.add({ kind: 'flower', b: 'spine1', p: [Math.cos(a) * 1.5, 11.75, 0.5 + Math.sin(a) * 2.6], s: 0.35, col: [0xf0a0c0, 0xffe070, 0xffffff][i % 3] }); }
  // head (finer surface), floppy ears, leafy antlers
  const hd = { g: 'head', mat: FUR(0.8) };
  b.cone([0, 17.2, -6.25], [0, 18.4, -6.55], 1.05, 0.96, { ...hd, b: ['neck3', 'head'], k: 0.3, belly: 1 });
  b.ell([0, 18.9, -6.9], [1.0, 0.95, 1.2], { ...hd, b: 'head', k: 0.3 });
  b.ell([0, 18.35, -7.95], [0.68, 0.58, 0.62], { ...hd, b: 'head', k: 0.35, col: 'light' });
  b.mirror((sd) => b.ell([sd * 0.22, 18.55, -8.52], [0.09, 0.07, 0.07], { g: 'head', op: 'sub', k: 0.05, col: 'nose', cf: -0.4 }));
  b.ell([0, 17.92, -7.96], [0.45, 0.13, 0.45], { g: 'head', op: 'sub', k: 0.06, col: 'mouth', cf: -0.4 });
  b.ell([0, 17.9, -7.95], [0.46, 0.14, 0.46], { g: 'jaw', b: 'jaw', col: 'light', mat: FUR(0.5), wf: 0.05 });
  b.ell([0, 18.02, -7.97], [0.38, 0.06, 0.4], { g: 'jaw', op: 'paint', col: 'mouth', cf: -0.5 });
  b.tongue = { b: 'jaw', p: [0, 18.0, -7.7], r: [0.22, 0.07, 0.2] };
  b.mirror((sd) => {
    b.sph([sd * 0.48, 19.15, -7.7], 0.3, { g: 'head', op: 'sub', k: 0.08, col: 'body', cf: -0.6 });
    b.eye({ c: [sd * 0.48, 19.15, -7.68], r: 0.34, dir: [sd * 0.5, 0.05, -1], side: sd, depth: 0.62 });
  });
  b.mirror((sd, n) => {
    b.bone('ear' + n, 'head', [sd * 0.8, 19.4, -6.8]);
    b.ell([sd * 1.4, 19.1, -6.75], [0.75, 0.16, 0.32], { g: 'head', b: 'ear' + n, dir: [sd, -0.5, 0.1], up: [0.3, 0.2, -1], k: 0.2, mat: FUR(0.7) });
    b.roles.ears.push({ b: 'ear' + n, side: sd, up: [0, 0, 0.5], down: [0.3, -0.2, -0.5], droop: -0.3 });
    b.chain([[sd * 0.4, 19.7, -6.7], [sd * 0.75, 20.6, -6.6], [sd * 1.25, 21.2, -6.4]], [0.12, 0.08, 0.05], { g: 'head', b: 'head', k: 0.1, col: 'horn', mat: { fur: 0 } });
    for (let j = 0; j < 5; j++) b.add({ kind: 'leaf', b: 'head', p: [sd * (0.75 + j * 0.12), 20.6 + j * 0.12, -6.6], s: 0.5, rot: [0.3 * j, sd * j, sd * (0.6 + j * 0.2)] });
  });
  b.chain([[0, 9.0, 4.8], [0, 7.6, 7.4], [0, 6.6, 7.9]], [1.0, 0.55, 0.3], { b: ['tail1', 'tail2', 'tail2'], k: 0.4, ...fluff });
  limbs(b, 'H', 'hips', [[2.2, 7.5, 3.5], [2.3, 4.2, 3.9], [2.3, 1.2, 3.6], [2.3, 0.0, 3.3]], [1.5, 1.05, 0.9, 0.88], { col: 'body', ...fluff, foot: 'hoof' });
  limbs(b, 'F', 'chest', [[2.1, 8.0, -2.5], [2.2, 4.5, -2.5], [2.2, 1.2, -2.6], [2.2, 0.0, -3.0]], [1.4, 1.0, 0.86, 0.85], { col: 'body', ...fluff, foot: 'hoof', front: true });
};

// ======================================================================== RIPTIDE (spino)
// An otter the size of a bus with a shark fin, a fluke tail, webbed paws and
// a long grin full of teeth. Lurks in deep water.
DESIGNS.spino = (b, L) => {
  b.size = 13; b.br = 1.6; b.res = 100;
  b.pal = { light: 0xe8f2f8, nose: 0x14202a, claw: 0x14202a, mouth: 0x5a1a2a, inner: 0x9ad8ff };
  b.eyeStyle = { iris: 0x40c8ff, iris2: 0x10406a, pupil: 'slit', irisR: 0.64, glow: 0.4 };
  b.anim = { stride: 0.55, lift: 0.14, bob: 0.04, jaw: 0.5, stabilize: 0.5, tailUp: 0 };
  b.pattern = { type: 'stripes', scale: 0.5, th: 0.6 };
  b.glowPattern = true;
  torso(b, { hips: [0, 3.0, 3.0], spine: [[0, 3.4, 0.5]], chest: [0, 3.5, -2.0], neck: [[0, 3.8, -3.6]], head: [0, 4.0, -4.6], jaw: [0, 3.45, -5.0],
    tail: [[0, 3.0, 4.8], [0, 2.8, 6.4], [0, 2.5, 7.8]] });
  const sleek = { mat: { fur: 0.35, gloss: 0.15, pat: 1 } };
  b.ell([0, 3.3, 0.5], [1.7, 1.6, 3.4], { b: ['hips', 'spine1', 'chest'], k: 0.4, belly: 1, ...sleek });
  b.cone([0, 3.6, -2.6], [0, 3.95, -4.4], 1.35, 1.0, { b: ['chest', 'neck1', 'head'], k: 0.4, belly: 1, ...sleek });
  b.ell([0, 4.1, -4.8], [1.0, 0.85, 1.2], { b: 'head', k: 0.3, ...sleek });
  b.ell([0, 3.75, -6.0], [0.62, 0.46, 1.05], { b: 'head', k: 0.35, ...sleek });
  b.mirror((sd) => b.ell([sd * 0.55, 3.7, -4.9], [0.45, 0.4, 0.5], { b: 'head', k: 0.3, col: 'light', ...sleek }));
  b.ell([0, 3.95, -6.98], [0.2, 0.12, 0.1], { b: 'head', k: 0.08, col: 'nose', cf: -0.4, cp: 2, mat: { gloss: 0.6 } });
  mouth(b, { cav: { c: [0, 3.42, -5.85], r: [0.5, 0.14, 0.95] }, jaw: { c: [0, 3.4, -5.82], r: [0.52, 0.16, 0.98] }, col: 'light', mat: { gloss: 0.2 } });
  b.mirror((sd) => {
    for (let i = 0; i < 6; i++) b.tooth({ b: 'head', p: [sd * 0.42 * (1 - i * 0.06), 3.52, -6.75 + i * 0.25], len: i === 1 ? 0.32 : 0.18, r: 0.06 });
    for (let i = 0; i < 4; i++) b.tooth({ b: 'jaw', p: [sd * 0.38, 3.53, -6.5 + i * 0.3], len: 0.15, r: 0.05, dir: [0, 1, 0] });
  });
  eyePair(b, { c: [0.55, 4.45, -5.65], r: 0.24, dir: [0.6, 0.15, -1], brow: { r: [0.28, 0.08, 0.14], tilt: 0.3, dy: 0.95 } });
  earPair(b, { root: [0.72, 4.75, -4.6], tip: [1.0, 4.95, -4.45], w: 0.22, t: 0.07, inner: 'inner', face: [0.5, 0.3, -1] });
  // shark fin and a whale fluke
  b.tri([0, 4.55, 0.2], [1.2, 2.8, 0.14], 0.08, { b: [['chest', 0], ['spine1', 0.5], ['hips', 1]], dir: [0, 1, 0.55], up: [1, 0, 0], k: 0.35, col: 'accent', mat: { glow: 0.2 } });
  b.chain([[0, 3.2, 3.6], [0, 2.8, 6.4], [0, 2.5, 7.8], [0, 2.4, 8.6]], [1.2, 0.7, 0.4, 0.2], { b: ['tail1', 'tail2', 'tail3', 'tail3'], k: 0.35, belly: 1, ...sleek });
  b.mirror((sd) => b.tri([sd * 0.2, 2.4, 8.4], [0.7, 1.9, 0.12], 0.08, { b: 'tail3', dir: [sd, 0, 0.7], up: [0, 1, 0], k: 0.25, col: 'accent', mat: { glow: 0.2 } }));
  limbs(b, 'H', 'hips', [[1.3, 2.6, 3.1], [1.4, 1.5, 3.4], [1.4, 0.5, 3.2], [1.4, 0.0, 2.9]], [0.75, 0.55, 0.42, 0.4], { col: 'body', ...sleek, foot: 'pad', toes: 4, claws: true, toeLen: 1.3, toeSpread: 0.45 });
  limbs(b, 'F', 'chest', [[1.2, 2.8, -2.0], [1.3, 1.6, -2.1], [1.3, 0.5, -2.1], [1.3, 0.0, -2.5]], [0.7, 0.5, 0.4, 0.38], { col: 'body', ...sleek, foot: 'pad', toes: 4, claws: true, toeLen: 1.3, toeSpread: 0.45, front: true });
};

// ======================================================================== MAGMAW (rex)
// A volcano with legs: a hulking two-legged brute with molten cracks in its
// rock hide, horns of black glass, a huge underbite and a fiery mane.
DESIGNS.rex = (b, L) => {
  b.size = 12; b.br = 1.7; b.res = 100; b.glowK = 0.55;
  b.pal = { light: 0x8a5a3a, nose: 0x0e0a0a, claw: 0x141012, horn: L.horn ?? 0x1c1618, mouth: 0x6a1a10, tongue: 0xff7a40, glow: L.glow ?? 0xff5a14 };
  b.eyeStyle = { iris: 0xffb020, iris2: 0xff3a00, pupil: 'slit', irisR: 0.62, glow: 1.2 };
  b.faceBias = { top: -0.2, tilt: 0.3 };
  b.anim = { stride: 0.55, lift: 0.18, bob: 0.06, jaw: 0.55, stabilize: 0.6, tailUp: 0.1 };
  b.pattern = { type: 'cracks', scale: 0.55, th: 0.07 };
  b.glowPattern = true;
  // an upright lava brute: massive shoulders, knuckle-dragging arms, stubby tail
  torso(b, { hips: [0, 3.8, 0.6], spine: [[0, 5.0, 0.3]], chest: [0, 6.1, -0.2], neck: [[0, 6.9, -0.6]], head: [0, 7.3, -1.1], jaw: [0, 6.75, -1.55],
    tail: [[0, 3.6, 1.6], [0, 3.15, 2.25]] });
  const rock = { mat: { fur: 0.25, pat: 1 } };
  b.ell([0, 5.9, -0.15], [1.9, 1.7, 1.45], { b: ['spine1', 'chest'], k: 0.6, belly: 1, ...rock });
  b.ell([0, 4.4, 0.45], [1.35, 1.3, 1.25], { b: ['hips', 'spine1'], k: 0.6, belly: 1, ...rock });
  b.mirror((sd) => b.ell([sd * 1.25, 6.7, -0.2], [0.85, 0.7, 0.85], { b: 'chest', k: 0.5, ...rock }));
  b.cone([0, 6.6, -0.4], [0, 7.2, -1.0], 1.05, 0.9, { b: ['chest', 'neck1', 'head'], k: 0.45, belly: 1, ...rock });
  b.ell([0, 7.4, -1.3], [0.95, 0.85, 0.95], { b: 'head', k: 0.35, ...rock });
  b.ell([0, 7.0, -2.05], [0.75, 0.56, 0.62], { b: 'head', k: 0.4, ...rock });
  b.ell([0, 7.22, -2.63], [0.26, 0.14, 0.1], { b: 'head', k: 0.1, col: 'nose', cf: -0.4, cp: 2 });
  mouth(b, { cav: { c: [0, 6.62, -1.95], r: [0.72, 0.24, 0.66] }, jaw: { c: [0, 6.55, -1.98], r: [0.8, 0.3, 0.7] }, col: 'light', mat: { fur: 0.2, pat: 1 } });
  b.mirror((sd) => {
    b.tooth({ b: 'jaw', p: [sd * 0.55, 6.8, -2.5], len: 0.55, r: 0.13, dir: [sd * 0.1, 1, -0.2] });
    for (let i = 0; i < 4; i++) b.tooth({ b: 'head', p: [sd * (0.55 - i * 0.05), 6.78, -2.42 + i * 0.24], len: 0.25, r: 0.07 });
  });
  eyePair(b, { c: [0.5, 7.68, -2.02], r: 0.21, dir: [0.5, 0.05, -1], brow: { r: [0.34, 0.11, 0.17], tilt: 0.5, dy: 0.85, col: 'horn' } });
  // obsidian horns and a fiery mane over the shoulders
  const horn = { col: 'horn', cf: -0.6, cp: 2, mat: { gloss: 0.85, fur: 0, glow: 0.12 } };
  b.mirror((sd) => b.chain([[sd * 0.55, 8.05, -1.2], [sd * 1.1, 8.65, -1.05], [sd * 1.4, 9.05, -1.6]], [0.3, 0.19, 0.03], { b: 'head', k: 0.15, ...horn }));
  for (let i = 0; i < 7; i++) { const sd = i % 2 ? 1 : -1; b.add({ kind: 'flame', b: i < 3 ? 'neck1' : 'chest', p: [sd * (i < 3 ? 0.3 : 0.9), 8.0 - i * 0.22, -0.7 + i * 0.2], s: 0.42 - i * 0.02, rot: [-0.3, 0, sd * 0.2] }); }
  b.chain([[0, 3.8, 1.3], [0, 3.6, 1.7], [0, 3.15, 2.3], [0, 2.9, 2.55]], [0.75, 0.55, 0.32, 0.12], { b: ['hips', 'tail1', 'tail2', 'tail2'], k: 0.35, belly: 1, ...rock });
  limbs(b, 'H', 'hips', [[1.0, 3.6, 0.6], [1.2, 2.0, 0.0], [1.1, 0.7, 0.8], [1.1, 0.0, 0.1]], [0.9, 0.65, 0.5, 0.45], { col: 'body', ...rock, foot: 'paw', toes: 3, claws: true, toeLen: 1.3 });
  b.mirror((sd, n) => {
    b.bone('arm' + n, 'chest', [sd * 1.7, 6.3, -0.4]); b.bone('fore' + n, 'arm' + n, [sd * 2.1, 4.6, -0.9]); b.bone('hand' + n, 'fore' + n, [sd * 2.0, 3.0, -1.2]);
    b.chain([[sd * 1.7, 6.3, -0.4], [sd * 2.1, 4.6, -0.9], [sd * 2.0, 3.1, -1.2]], [0.78, 0.62, 0.52], { b: ['arm' + n, 'fore' + n, 'hand' + n], k: 0.35, ...rock });
    b.sph([sd * 2.0, 2.75, -1.3], 0.66, { b: 'hand' + n, k: 0.25, ...rock });
    for (let i = -1; i <= 1; i++) b.cone([sd * (2.0 + i * 0.25), 2.35, -1.75], [sd * (2.0 + i * 0.28), 2.1, -2.15], 0.13, 0.02, { b: 'hand' + n, k: 0.06, col: 'claw', cf: -0.4, cp: 2, mat: { gloss: 0.6 } });
    b.roles.arms.push({ b: 'arm' + n, lower: 'fore' + n, side: sd, rest: [0.1, 0, 0.08], bendRest: -0.35 });
  });
};

// ======================================================================== fallback
// A plain soft quadruped for any species still waiting for its sculpt.
// ======================================================================== SCALYDODO
// A plump pear of a bird in teal scales with a cream tummy, a huge hooked
// beak, round curious eyes, stubby wings, a curly tail tuft and short yellow
// legs. Licks everything it meets, which is how the intro starts.
DESIGNS.dodo = (b, L) => {
  b.size = 0.8; b.br = 0.24; b.res = 110;
  b.pal = { light: 0xfff4d8, horn: L.horn ?? 0xf2cf6a, claw: 0x4a3a2a, mouth: 0x7a2a34, tongue: 0xff7a9a, inner: 0xffd8a0 };
  b.eyeStyle = { iris: 0x3a2a1a, iris2: 0x8a5a2a, irisR: 0.55, glow: 0 };
  b.anim = { stride: 0.55, lift: 0.22, bob: 0.09, jaw: 0.7, stabilize: 0.5, tailUp: 0.6 };
  torso(b, { hips: [0, 0.4, 0.1], spine: [[0, 0.44, 0.0]], chest: [0, 0.47, -0.1], neck: [[0, 0.57, -0.15]], head: [0, 0.67, -0.19], jaw: [0, 0.635, -0.29],
    tail: [[0, 0.45, 0.3], [0, 0.52, 0.38]] });
  const scales = { mat: { fur: 0, gloss: 0.35 } };
  // the pear: a big round bottom and a cream tummy
  b.ell([0, 0.41, 0.03], [0.25, 0.25, 0.29], { b: ['hips', 'spine1', 'chest'], k: 0.06, belly: 0.55, ...scales });
  b.ell([0, 0.33, -0.05], [0.2, 0.16, 0.2], { b: ['hips', 'chest'], k: 0.06, belly: 1, ...scales });
  // overlapping scale plates over the back and flanks
  b.scatter([0, 0.43, 0.03], [0.25, 0.25, 0.29], 150, 0.05, { b: 'spine1', k: 0.012, col: 'pat', mat: { fur: 0, gloss: 0.45 }, filter: (x, y) => y > -0.15, seed: 21 });
  // neck and a big round head
  b.chain([[0, 0.5, -0.11], [0, 0.57, -0.15], [0, 0.66, -0.19]], [0.15, 0.12, 0.115], { b: ['chest', 'neck1', 'head'], k: 0.05, belly: 0.8, ...scales });
  b.sph([0, 0.7, -0.21], 0.125, { b: 'head', k: 0.05, ...scales });
  b.scatter([0, 0.72, -0.19], [0.12, 0.11, 0.12], 40, 0.03, { b: 'head', k: 0.008, col: 'pat', mat: { fur: 0, gloss: 0.45 }, filter: (x, y, z) => y > 0.1 && z > -0.4, seed: 22 });
  // the beak: a banana with a hooked orange tip, and the lower half on the jaw
  b.cone([0, 0.705, -0.31], [0, 0.665, -0.5], 0.072, 0.034, { b: 'head', k: 0.03, col: 'horn', cf: -0.4, cp: 2, mat: { gloss: 0.55, fur: 0 } });
  b.cone([0, 0.665, -0.5], [0, 0.615, -0.525], 0.034, 0.012, { b: 'head', k: 0.02, col: 'accent', cf: -0.4, cp: 3, mat: { gloss: 0.6, fur: 0 } });
  b.mirror((sd) => b.sph([sd * 0.024, 0.705, -0.45], 0.008, { b: 'head', op: 'sub', k: 0.004, col: 'mouth', cf: -0.4 }));
  b.ell([0, 0.638, -0.31], [0.05, 0.022, 0.08], { op: 'sub', k: 0.01, col: 'mouth', cf: -0.4 });
  b.cone([0, 0.632, -0.31], [0, 0.622, -0.45], 0.05, 0.02, { g: 'jaw', b: 'jaw', col: 'horn', mat: { gloss: 0.5, fur: 0 } });
  b.tongue = { b: 'jaw', p: [0, 0.64, -0.36], r: [0.028, 0.012, 0.05] };
  // big friendly eyes with heavy brows
  eyePair(b, { c: [0.083, 0.745, -0.27], r: 0.046, dir: [0.62, 0.12, -0.78], socket: 0.86, brow: { r: [0.04, 0.013, 0.03], dy: 0.95, tilt: -0.25, col: 'pat' } });
  // stubby wings and a curly tail tuft
  b.mirror((sd) => spikes(b, [0, 1, 2].map((i) => ({ c: [sd * 0.24, 0.47 - i * 0.03, -0.02 + i * 0.05], k: 1 - i * 0.2 })), { b: 'chest', w: 0.07, h: 0.17, t: 0.018, col: 'pat', dir: [sd * 0.3, -0.5, 1], up: [sd, 0.2, 0], mat: { fur: 0.2, gloss: 0.3 } }));
  spikes(b, [-1, 0, 1].map((i) => ({ c: [i * 0.035, 0.53, 0.38], k: 1 - Math.abs(i) * 0.15 })), { b: 'tail2', w: 0.05, h: 0.2, t: 0.014, col: 'accent', dirAt: (i) => [(i - 1) * 0.4, 1, 0.6], up: [0, 0.3, -1], mat: { fur: 0.4 } });
  // short yellow legs, three toes
  limbs(b, 'H', 'hips', [[0.1, 0.3, 0.08], [0.11, 0.2, 0.02], [0.1, 0.07, 0.06], [0.1, 0.0, 0.02]], [0.065, 0.045, 0.035, 0.032], { col: 'horn', mat: { fur: 0, gloss: 0.25 }, toes: 3, claws: true, toeLen: 2.1, toeSpread: 0.55 });
};

DESIGNS._fallback = (b, L, sp) => {
  b.size = 1; b.br = 0.2;
  b.bone('root', null, [0, 0, 0]);
  b.bone('hips', 'root', [0, 0.45, 0.2]);
  b.bone('spine', 'hips', [0, 0.48, 0]);
  b.bone('chest', 'spine', [0, 0.48, -0.2]);
  b.bone('neck', 'chest', [0, 0.55, -0.32]);
  b.bone('head', 'neck', [0, 0.65, -0.42]);
  b.bone('jaw', 'head', [0, 0.6, -0.45]);
  b.bone('tail1', 'hips', [0, 0.48, 0.38]); b.bone('tail2', 'tail1', [0, 0.45, 0.55]);
  b.mirror((sd, n) => {
    leg(b, 'H' + n, sd, 'hips', [sd * 0.12, 0.38, 0.22], [sd * 0.12, 0.24, 0.24], [sd * 0.12, 0.1, 0.25], [sd * 0.12, 0, 0.23], false);
    leg(b, 'F' + n, sd, 'chest', [sd * 0.12, 0.38, -0.2], [sd * 0.12, 0.24, -0.2], [sd * 0.12, 0.1, -0.2], [sd * 0.12, 0, -0.22], true);
  });
  b.roles = { hips: 'hips', spine: ['spine'], chest: 'chest', neck: ['neck'], head: 'head', jaw: 'jaw', tail: ['tail1', 'tail2'], ears: [] };
  b.ell([0, 0.48, 0], [0.17, 0.17, 0.28], { b: ['hips', 'spine', 'chest'], k: 0.05, belly: 1, mat: FUR(0.5) });
  b.cone([0, 0.5, -0.22], [0, 0.63, -0.4], 0.1, 0.08, { b: ['chest', 'neck', 'head'], k: 0.05 });
  b.ell([0, 0.66, -0.45], [0.1, 0.09, 0.11], { b: 'head', k: 0.04 });
  b.ell([0, 0.6, -0.48], [0.07, 0.03, 0.08], { g: 'jaw', b: 'jaw' });
  b.cone([0, 0.48, 0.3], [0, 0.42, 0.58], 0.07, 0.02, { b: ['tail1', 'tail2'], k: 0.04 });
  for (const n of ['FR', 'FL', 'HR', 'HL']) legSkin(b, n, [0.06, 0.04, 0.035, 0.03]);
  b.mirror((sd) => b.eye({ c: [sd * 0.055, 0.68, -0.535], r: 0.035, dir: [sd * 0.4, 0.1, -1], side: sd }));
};
