// Parametric chunky dinosaurs. One smooth skinned "spine" mesh (tail -> body
// -> neck) with a bone chain, plus rigid toy-like parts on the bones: heads
// with tiny dot eyes, jaws and teeth, drumstick legs, arms, horns, frills,
// plates, sails, armour, feathers and wings. Pixel-art scale textures with
// countershading per species. DinoRig animates everything procedurally.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { PixelPainter, ramp } from '../gfx/pixel.js';
import { tileFbm, RNG } from '../core/rng.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
const texCache = new Map(), matCache = new Map();

// ------------------------------------------------------------------ textures
const mixCol = (a, b) => [(a[0] + b[0]) >> 1, (a[1] + b[1]) >> 1, (a[2] + b[2]) >> 1];
function bodyPainter(L, seed) {
  const W = 128, H = 64;
  const p = new PixelPainter(W, H, seed);
  const back = ramp(L.color, 5, { light: 0.14, hueShift: 0.1 });
  const bel = ramp(L.belly, 4, { light: 0.1 });
  const pat = ramp(L.pcolor, 3, { light: 0.1 });
  const r = new RNG(seed);
  const spots = [];
  for (let i = 0; i < 26; i++) spots.push([r.next() * W, r.next() * H, 2 + r.next() * 4]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H; // u around (0 = spine top), v along body
    const side = Math.cos(u * Math.PI * 2); // 1 at the top, -1 at the belly
    const n = tileFbm(u * 6, v * 3, 6, 3, seed);
    // scales: offset rows of small bumps
    const sx = (x + (Math.floor(y / 3) % 2) * 2) % 4, sy = y % 3;
    const scaleHi = sx === 1 && sy === 0, scaleLo = sx === 3 && sy === 2;
    let col;
    const bellyK = THREE.MathUtils.smoothstep(-side, 0.15, 0.55);
    let k = 2 + (n > 0.62 ? 1 : n < 0.38 ? -1 : 0) + (scaleHi ? 1 : scaleLo ? -1 : 0);
    if (side > 0.85) k -= 1; // darker dorsal line
    col = back[Math.max(0, Math.min(4, k))];
    // pattern on back + flanks
    const onBack = side > -0.15;
    let pk = 0;
    switch (L.pattern) {
      case 'stripes': pk = onBack && Math.sin(v * 50 + Math.sin(u * 12) * 1.5) > 0.55 && side > 0.05 ? 1 : 0; break;
      case 'bands': pk = onBack && Math.sin(v * 24) > 0.5 ? 1 : 0; break;
      case 'saddle': pk = side > 0.25 && v > 0.35 && v < 0.75 ? 1 : 0; break;
      case 'spots': for (const [sx2, sy2, sr] of spots) { const dx = Math.min(Math.abs(x - sx2), W - Math.abs(x - sx2)); if (dx * dx + (y - sy2) ** 2 < sr * sr && side > -0.2) { pk = 1; break; } } break;
      case 'mottle': pk = onBack && n > 0.58 ? 1 : 0; break;
      case 'scutes': pk = onBack && (x % 8 < 2 || y % 6 < 1) ? 1 : 0; break;
      case 'iridescent': pk = side > 0.3 && ((x + y) % 7 === 0 || n > 0.66) ? 1 : 0; break;
      case 'tips': pk = 0; break;
      default: break;
    }
    if (pk) col = pat[Math.max(0, Math.min(2, 1 + (scaleHi ? 1 : 0) - (n < 0.4 ? 1 : 0)))];
    if (bellyK > 0) {
      const bk = bel[Math.max(0, Math.min(3, 2 + (sy === 0 && sx < 2 ? 1 : 0) - (y % 4 === 0 ? 1 : 0)))];
      col = bellyK > 0.62 ? bk : bellyK > 0.38 ? mixCol(bk, col) : col;
    }
    p.set(x, y, col);
  }
  return p;
}
function partPainter(L, seed) {
  // limbs/heads: vertical gradient back -> belly with scales (v: 0 bottom, 1 top)
  const p = new PixelPainter(32, 32, seed);
  const back = ramp(L.color, 5, { light: 0.14, hueShift: 0.1 });
  const bel = ramp(L.belly, 4, { light: 0.1 });
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    const v = y / 32;
    const sx = (x + (Math.floor(y / 3) % 2) * 2) % 4, sy = y % 3;
    const k = 2 + (sx === 1 && sy === 0 ? 1 : sx === 3 && sy === 2 ? -1 : 0);
    p.set(x, y, v < 0.3 ? bel[Math.min(3, k)] : v < 0.36 ? mixCol(bel[2], back[k]) : back[k]);
  }
  return p;
}
function speciesMats(sp) {
  const key = sp.matKey ?? sp.id;
  if (matCache.has(key)) return matCache.get(key);
  const L = sp.look;
  const seed = [...sp.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) >>> 0;
  const bp = bodyPainter(L, seed), pp = partPainter(L, seed + 1);
  const mk = (painter, rough = 0.72) => {
    const map = painter.texture({ anisotropy: 4 });
    const m = new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0, normalMap: painter.normalTexture(1.4) });
    m.normalScale.set(0.55, 0.55);
    patchMaterial(m, { wet: true });
    return m;
  };
  const M = {
    body: mk(bp), part: mk(pp),
    accent: patchMaterial(new THREE.MeshStandardMaterial({ color: L.accent, roughness: 0.6 }), {}),
    pat: patchMaterial(new THREE.MeshStandardMaterial({ color: L.pcolor, roughness: 0.7 }), {}),
    belly: patchMaterial(new THREE.MeshStandardMaterial({ color: L.belly, roughness: 0.75 }), {}),
    eye: patchMaterial(new THREE.MeshStandardMaterial({ color: 0x0c0a0a, roughness: 0.12, metalness: 0.1 }), {}),
    tooth: patchMaterial(new THREE.MeshStandardMaterial({ color: 0xf2ecd8, roughness: 0.4 }), {}),
    claw: patchMaterial(new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.45 }), {}),
    mouth: patchMaterial(new THREE.MeshStandardMaterial({ color: 0x8a2a30, roughness: 0.6 }), {}),
    horn: patchMaterial(new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.5 }), {}),
  };
  M.part.userData.painter = pp;
  matCache.set(key, M);
  return M;
}

// ------------------------------------------------------------------ small geometry helpers
const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };
function capsule(r, len, mat, seg = 8) { const g = new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, seg); g.translate(0, -len / 2 - r * 0.2, 0); return mesh(g, mat); }
function taperCapsule(r0, r1, len, mat, seg = 9) {
  // a drumstick: fat at the top, thin at the bottom (local -Y)
  const pts = [];
  const n = 8;
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.sin(a) * r0, Math.cos(a) * r0 * 0.8)); }
  for (let i = 1; i <= n; i++) { const t = i / n; const r = r0 + (r1 - r0) * t; pts.push(new THREE.Vector2(r, -len * t)); }
  for (let i = 1; i <= n; i++) { const a = (i / n) * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, -len - Math.sin(a) * r1 * 0.9)); }
  pts.push(new THREE.Vector2(0.0001, -len - r1 * 0.9));
  return mesh(new THREE.LatheGeometry(pts.reverse(), seg), mat);
}
function sphere(r, mat, sx = 1, sy = 1, sz = 1, seg = 12) { const m = mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 3)), mat); m.scale.set(sx, sy, sz); return m; }
function cone(r, h, mat, seg = 8) { return mesh(new THREE.ConeGeometry(r, h, seg), mat); }
function rbox(w, h, d, r, mat) { return mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2, h / 2, d / 2) * 0.999), mat); }
function at(o, x, y, z, rx = 0, ry = 0, rz = 0) { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; }

// ------------------------------------------------------------------ the spine body
function spineCurve(L, scale) {
  const S = scale;
  const [blen, br] = L.body;
  const quad = L.legs === 'quad' || L.legs === 'semi' || L.legs === 'quadwing';
  const hipY = L.hip * S;
  const chestY = (quad ? ((L.fore ?? L.hind) + br * 0.4) : L.hip - br * 0.15) * S;
  const hipZ = blen * 0.45 * S, chestZ = -blen * 0.55 * S;
  const [nlen, , nang] = L.neck;
  const [tlen, , droop] = L.tail;
  const neckBase = new THREE.Vector3(0, chestY + br * 0.15 * S, chestZ - br * 0.25 * S);
  const neckDir = new THREE.Vector3(0, Math.sin(nang), -Math.cos(nang));
  const neckEnd = neckBase.clone().addScaledVector(neckDir, nlen * S);
  const neckMid = neckBase.clone().addScaledVector(neckDir, nlen * 0.5 * S).add(new THREE.Vector3(0, nlen * 0.06 * S, 0));
  const tailBase = new THREE.Vector3(0, hipY - br * 0.05 * S, hipZ + br * 0.4 * S);
  const tailMid = new THREE.Vector3(0, hipY - droop * tlen * 0.35 * S, hipZ + tlen * 0.5 * S);
  const tailTip = new THREE.Vector3(0, hipY - droop * tlen * S, hipZ + tlen * S);
  const pts = [tailTip, tailMid, tailBase, new THREE.Vector3(0, hipY, hipZ), new THREE.Vector3(0, (hipY + chestY) / 2 + br * 0.05 * S, (hipZ + chestZ) / 2), new THREE.Vector3(0, chestY, chestZ), neckBase, neckMid, neckEnd];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const len = curve.getLength();
  const lens = curve.getLengths(400);
  const fracOf = (p) => { let best = 0, bd = Infinity; for (let i = 0; i <= 200; i++) { const d = curve.getPointAt(i / 200).distanceToSquared(p); if (d < bd) { bd = d; best = i / 200; } } return best; };
  return { curve, len, lens, hipY, chestY, hipZ, chestZ, neckBase, neckEnd, neckDir, tailTip, fracs: { tailTip: 0, tailBase: fracOf(tailBase), hips: fracOf(pts[3]), mid: fracOf(pts[4]), chest: fracOf(pts[5]), neckBase: fracOf(neckBase), neckEnd: 1 } };
}
function radiusAt(f, F, L, S) {
  const [, br] = L.body, [, nr] = L.neck, [, tr] = L.tail;
  const keys = [[0, Math.max(0.012, tr * 0.12)], [F.tailBase, tr], [F.hips, br * 0.86], [F.mid, br], [F.chest, br * 0.9], [F.neckBase, Math.max(nr * 1.3, br * 0.52)], [1, nr]];
  for (let i = 0; i < keys.length - 1; i++) {
    const [f0, r0] = keys[i], [f1, r1] = keys[i + 1];
    if (f <= f1) { const t = (f - f0) / Math.max(1e-4, f1 - f0); const s = t * t * (3 - 2 * t); return (r0 + (r1 - r0) * s) * S; }
  }
  return nr * S;
}

// chunky toy proportions: fatter bodies, bigger heads, stubbier legs
const TOY = { body: 1.35, neck: 1.25, tail: 1.3, tailLen: 0.85, head: 1.5, hip: 0.93 };
function toyLook(L0) {
  const L = { ...L0, body: [L0.body[0], L0.body[1] * TOY.body], neck: [L0.neck[0], L0.neck[1] * TOY.neck, L0.neck[2]], tail: [L0.tail[0] * TOY.tailLen, L0.tail[1] * TOY.tail, L0.tail[2]], head: { ...L0.head, len: L0.head.len * TOY.head, w: L0.head.w * TOY.head, h: L0.head.h * TOY.head }, hip: L0.hip * (L0.legs === 'biped' ? TOY.hip : 1) };
  return L;
}
export function buildDino(sp, opt = {}) {
  const L = toyLook(sp.look);
  const baby = !!opt.baby;
  const S = (sp.size / sizeRef(L)) * (opt.scale ?? 1);
  const M = speciesMats(sp);
  const root = new THREE.Group(); root.name = 'dino:' + sp.id;
  const sc = spineCurve(L, S);
  const F = sc.fracs;
  // ---- bones along the spine
  const boneSpec = [];
  const tailN = Math.max(3, Math.min(6, Math.round(L.tail[0] * S / Math.max(0.15, L.body[0] * S * 0.35))));
  for (let i = 0; i < tailN; i++) boneSpec.push({ name: 'tail' + (tailN - i), f: F.tailBase * (i / tailN) * 0.98 + 0.01 });
  boneSpec.push({ name: 'tail0', f: F.tailBase });
  boneSpec.push({ name: 'hips', f: F.hips });
  boneSpec.push({ name: 'chest', f: F.chest });
  const neckN = L.neck[0] / L.body[0] > 1 ? 4 : 2;
  for (let i = 1; i <= neckN; i++) boneSpec.push({ name: 'neck' + i, f: F.neckBase + (1 - F.neckBase) * ((i - 1) / neckN) });
  boneSpec.push({ name: 'head', f: 1 });
  boneSpec.sort((a, b) => a.f - b.f);
  const bonePos = boneSpec.map((b) => sc.curve.getPointAt(Math.min(1, Math.max(0, b.f))));
  const bones = boneSpec.map((b) => { const bn = new THREE.Bone(); bn.name = b.name; return bn; });
  const B = Object.fromEntries(bones.map((b) => [b.name, b]));
  const idx = Object.fromEntries(boneSpec.map((b, i) => [b.name, i]));
  // hierarchy: hips is root; tail chain goes backward, chest + neck chain forward
  const hipsI = idx.hips;
  const link = (child, parent) => { bones[parent].add(bones[child]); bones[child].position.copy(bonePos[child]).sub(bonePos[parent]); };
  for (let i = hipsI - 1; i >= 0; i--) link(i, i + 1);
  for (let i = hipsI + 1; i < bones.length; i++) link(i, i - 1);
  bones[hipsI].position.copy(bonePos[hipsI]);
  // ---- skinned tube
  const RINGS = 40, SEG = 14;
  const pos = [], nrm = [], uv = [], si = [], sw = [], index = [];
  const frame = { t: new THREE.Vector3(), n: new THREE.Vector3(), b: new THREE.Vector3() };
  let prevN = null;
  for (let i = 0; i <= RINGS; i++) {
    const f = i / RINGS;
    const c = sc.curve.getPointAt(f);
    sc.curve.getTangentAt(f, frame.t);
    // keep "up" stable: normal = component of world up orthogonal to the tangent
    frame.n.set(0, 1, 0).addScaledVector(frame.t, -frame.t.y).normalize();
    if (prevN && frame.n.dot(prevN) < 0) frame.n.negate();
    prevN = frame.n.clone();
    frame.b.crossVectors(frame.t, frame.n).normalize();
    let r = radiusAt(f, F, L, S);
    if (baby && f > F.neckBase) r *= 1.12;
    // bone weights
    let j = 0; while (j < boneSpec.length - 1 && boneSpec[j + 1].f < f) j++;
    const j1 = Math.min(boneSpec.length - 1, j + 1);
    const span = Math.max(1e-4, boneSpec[j1].f - boneSpec[j].f);
    let w1 = Math.min(1, Math.max(0, (f - boneSpec[j].f) / span));
    if (j1 === j) w1 = 0;
    const bodyness = THREE.MathUtils.smoothstep(f, F.tailBase, F.hips) * (1 - THREE.MathUtils.smoothstep(f, F.chest, F.neckBase));
    for (let k = 0; k <= SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      // pear-shaped cross-section: a bit taller, belly sags on the body
      const ry = r * (1.06 + bodyness * 0.08), rx = r * 0.94;
      const sag = cs < 0 ? -cs * r * 0.1 * bodyness : 0;
      _v.copy(c).addScaledVector(frame.n, cs * ry - sag).addScaledVector(frame.b, sn * rx);
      pos.push(_v.x, _v.y, _v.z);
      const nn = new THREE.Vector3().addScaledVector(frame.n, cs / ry).addScaledVector(frame.b, sn / rx).normalize();
      nrm.push(nn.x, nn.y, nn.z);
      uv.push(k / SEG, f);
      si.push(j, j1, 0, 0); sw.push(1 - w1, w1, 0, 0);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let k = 0; k < SEG; k++) { const a = i * (SEG + 1) + k, b = a + SEG + 1; index.push(a, a + 1, b, a + 1, b + 1, b); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.setIndex(index);
  geo.computeBoundingSphere(); geo.boundingSphere.radius *= 1.5;
  const body = new THREE.SkinnedMesh(geo, M.body);
  body.castShadow = true; body.receiveShadow = true; body.frustumCulled = false;
  root.add(body);
  body.add(bones[hipsI]);
  root.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));
  const parts = { eyes: [], lids: [], feathers: [], plates: [], wings: [] };
  // helper: attach a part to a bone at a model-space position
  const onBone = (bn, obj, mx, my, mz) => { const bi = idx[bn]; const bp = bonePos[bi]; obj.position.set(mx - bp.x, my - bp.y, mz - bp.z); B[bn].add(obj); return obj; };
  const rAt = (f) => radiusAt(f, F, L, S);
  // ---- head
  const H = L.head;
  const hs = S * (baby ? 1.35 : 1);
  const head = new THREE.Group();
  const hb = bonePos[idx.head];
  head.position.set(0, 0, 0);
  B.head.add(head);
  buildHead(head, H, hs, M, parts, sp, sc);
  // ---- legs + arms
  parts.legs = [];
  const quad = L.legs === 'quad' || L.legs === 'semi' || L.legs === 'quadwing';
  const hipP = bonePos[idx.hips], chestP = bonePos[idx.chest];
  const br = L.body[1] * S;
  const hindJointY = hipP.y - br * 0.28;
  const hindLen = Math.max(0.1, hindJointY);
  for (const side of [-1, 1]) {
    const leg = buildLeg(quad && L.legs !== 'semi' ? 'column' : 'biped', hindLen, br, M, side, sp, S, true);
    onBone('hips', leg.root, side * br * 0.62, hindJointY, hipP.z + br * 0.08);
    parts.legs.push({ ...leg, side, hind: true, len: hindLen });
  }
  if (quad) {
    const foreJointY = chestP.y - br * 0.3;
    for (const side of [-1, 1]) {
      const leg = buildLeg(L.legs === 'quadwing' ? 'wingarm' : 'column', Math.max(0.1, foreJointY), br, M, side, sp, S, false);
      onBone('chest', leg.root, side * br * 0.6, foreJointY, chestP.z + br * 0.05);
      parts.legs.push({ ...leg, side, hind: false, len: foreJointY });
    }
  } else if (L.arms) {
    parts.arms = [];
    for (const side of [-1, 1]) {
      const arm = buildArm(L.arms * S, M, side, sp, S);
      onBone('chest', arm.root, side * br * 0.62, chestP.y - br * 0.25, chestP.z - br * 0.25);
      parts.arms.push({ ...arm, side });
    }
  }
  // ---- extras along the spine
  if (L.plates) {
    // two staggered rows of plates from neck to tail
    const n = 15;
    for (let i = 0; i < n; i++) {
      const f = F.tailBase * 0.35 + (F.neckBase - F.tailBase * 0.35) * (i / (n - 1));
      const c = sc.curve.getPointAt(f);
      const r = rAt(f);
      const hgt = r * (0.32 + Math.sin((i / (n - 1)) * Math.PI) * 0.5);
      const shape = new THREE.Shape([new THREE.Vector2(-hgt * 0.5, 0), new THREE.Vector2(-hgt * 0.42, hgt * 0.55), new THREE.Vector2(0, hgt), new THREE.Vector2(hgt * 0.42, hgt * 0.55), new THREE.Vector2(hgt * 0.5, 0)]);
      const g = new THREE.ExtrudeGeometry(shape, { depth: hgt * 0.08, bevelEnabled: true, bevelThickness: hgt * 0.03, bevelSize: hgt * 0.03, bevelSegments: 1 });
      g.rotateY(Math.PI / 2); g.translate(-hgt * 0.04, 0, 0);
      const pl = mesh(g, i % 2 ? M.accent : M.pat);
      const bn = nearestBone(boneSpec, f);
      const side = i % 2 ? 1 : -1;
      onBone(bn, pl, side * r * 0.18, c.y + r * 0.9, c.z);
      pl.rotation.z = side * 0.12;
      parts.plates.push(pl);
    }
  }
  if (L.thag) {
    const tipBone = bones[1] ?? bones[0];
    const tr = Math.max(0.05, radiusAt(boneSpec[1]?.f ?? 0.05, F, L, S));
    for (const [sx, sz] of [[-1, -0.6], [1, -0.6], [-1, 0.6], [1, 0.6]]) { const sp2 = cone(tr * 0.32, tr * 3.2, M.horn); sp2.position.set(sx * tr * 0.8, tr * 0.6, sz * tr * 2.2); sp2.rotation.z = sx * -1.0; sp2.rotation.x = 0.35; tipBone.add(sp2); }
  }
  if (L.club) { const c = sphere(L.tail[1] * S * 1.5, M.part, 1.4, 0.75, 1.15); bones[0].add(c); for (const sx of [-1, 1]) { const k = sphere(L.tail[1] * S * 0.7, M.horn, 1, 0.7, 1, 8); k.position.set(sx * L.tail[1] * S * 1.2, 0, 0); bones[0].add(k); } }
  if (L.armor) {
    for (let i = 0; i < 26; i++) {
      const f = F.tailBase * 0.7 + (F.chest - F.tailBase * 0.7) * ((i % 13) / 12);
      const c = sc.curve.getPointAt(f); const r = rAt(f);
      const side = i < 13 ? -1 : 1;
      const k = sphere(r * 0.16, M.horn, 1, 0.7, 1, 6);
      onBone(nearestBone(boneSpec, f), k, side * r * (0.35 + (i % 2) * 0.3), c.y + r * (0.95 - (i % 2) * 0.12), c.z);
      if (i % 3 === 0) { const sp2 = cone(r * 0.1, r * 0.45, M.horn, 6); onBone(nearestBone(boneSpec, f), sp2, side * r * 0.95, c.y + r * 0.1, c.z); sp2.rotation.z = side * -1.4; }
    }
  }
  if (L.sail) {
    const f0 = F.hips - (F.hips - F.tailBase) * 0.2, f1 = F.chest + (F.neckBase - F.chest) * 0.3;
    const pts = [];
    const n = 12;
    for (let i = 0; i <= n; i++) { const f = f0 + (f1 - f0) * (i / n); const c = sc.curve.getPointAt(f); pts.push([c.z, c.y + rAt(f) * 0.8, Math.pow(Math.sin((i / n) * Math.PI), 0.7) * L.sail * S * 1.25 * (0.85 + 0.15 * Math.sin((i / n) * Math.PI * 4))]); }
    const shape = new THREE.Shape();
    shape.moveTo(-pts[0][0], pts[0][1]);
    for (const [z, y, h] of pts) shape.lineTo(-z, y + h);
    for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
    const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2);
    const sail = mesh(g, patchMaterial(new THREE.MeshStandardMaterial({ color: L.accent, roughness: 0.6, side: THREE.DoubleSide }), {}));
    const bp = bonePos[idx.hips]; sail.position.set(-bp.x, -bp.y, -bp.z); B.hips.add(sail);
    for (const [z, y, h] of pts) { const sp2 = mesh(new THREE.CylinderGeometry(0.02 * S * 4, 0.03 * S * 4, h, 4), M.pat); sp2.position.set(0, y + h / 2 - bp.y, z - bp.z); B.hips.add(sp2); }
    parts.sail = sail;
  }
  if (L.feathers) {
    const fm = patchMaterial(new THREE.MeshStandardMaterial({ color: L.accent, roughness: 0.8, side: THREE.DoubleSide }), {});
    const fm2 = patchMaterial(new THREE.MeshStandardMaterial({ color: L.pcolor, roughness: 0.8, side: THREE.DoubleSide }), {});
    // crest + back tufts + tail fan
    for (let i = 0; i < 14; i++) {
      // soft mane over the neck and shoulders, layered and swept back
      const f = F.chest + (1 - F.chest) * (i / 13) * 0.85;
      const c = sc.curve.getPointAt(Math.min(1, f)); const r = rAt(Math.min(1, f));
      const len = r * 0.75;
      const g = new THREE.PlaneGeometry(len * 0.7, len); g.translate(0, len / 2, 0);
      for (const side of [-1, 0, 1]) {
        const fe = mesh(g, (i + side) % 3 ? fm2 : fm, false);
        onBone(nearestBone(boneSpec, f), fe, side * r * 0.55, c.y + r * (side ? 0.75 : 0.95), c.z);
        fe.rotation.set(1.25, side * 0.5, side * -0.4);
        parts.feathers.push(fe);
      }
    }
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      const f = 0.02 + i * 0.03; const c = sc.curve.getPointAt(f); const r = rAt(f);
      const len = L.tail[1] * S * 3.2;
      const g = new THREE.PlaneGeometry(len * 0.3, len); g.translate(0, len / 2, 0);
      const fe = mesh(g, fm2, false);
      onBone(nearestBone(boneSpec, f), fe, side * r, c.y, c.z);
      fe.rotation.set(Math.PI / 2, 0, side * 0.5);
    }
  }
  if (L.wingspan) parts.wings = buildWings(B, idx, bonePos, L, S, M);
  if (L.wings4) {
    const fm = patchMaterial(new THREE.MeshStandardMaterial({ color: L.accent, roughness: 0.7, side: THREE.DoubleSide }), {});
    for (const side of [-1, 1]) {
      const g = new THREE.PlaneGeometry(0.35 * S * 4, 0.12 * S * 4); g.translate(side * 0.17 * S * 4, 0, 0);
      const w = mesh(g, fm, false);
      onBone('hips', w, side * br * 0.5, hindJointY - br * 0.2, hipP.z);
      w.rotation.x = -Math.PI / 2;
      parts.wings.push(w);
    }
  }
  root.userData.dino = true;
  const rig = { root, body, bones: B, boneSpec, bonePos, idx, parts, scale: S, sc, M, quad, baby, height: sc.neckEnd.y + H.h * hs, len: (L.tail[0] + L.body[0]) * S, br };
  return rig;
}
function sizeRef(L) { return Math.max(0.1, L.body[0] + L.tail[0] + L.neck[0] * Math.cos(L.neck[2]) + (L.head?.len ?? 0.2)); }
function nearestBone(spec, f) { let best = spec[0].name, bd = Infinity; for (const b of spec) { const d = Math.abs(b.f - f); if (d < bd) { bd = d; best = b.name; } } return best; }

// ------------------------------------------------------------------ heads
function buildHead(head, H, s, M, parts, sp, sc) {
  const len = H.len * s, w = H.w * s, h = H.h * s;
  const type = H.type;
  // skull block with the snout forward (-Z)
  const skull = new THREE.Group(); head.add(skull);
  skull.rotation.x = -sc.neckDir.y * 0.6 + 0.15; // level the head regardless of neck angle
  parts.skull = skull;
  const jaw = new THREE.Group(); parts.jaw = jaw;
  const eyeR = Math.max(0.014, h * 0.095);
  let eyeY = h * 0.22, eyeZ = -len * 0.18, eyeX = w * 0.5;
  const teeth = (n, x0, z0, z1, y, down = true) => { for (let i = 0; i < n; i++) { const t = cone(len * 0.025, len * 0.07, M.tooth, 5); t.position.set(x0, y, z0 + (z1 - z0) * (i / Math.max(1, n - 1))); t.rotation.x = down ? Math.PI : 0; skull.add(t); } };
  switch (type) {
    case 'thero': case 'rex': case 'croc': {
      const big = type === 'rex';
      const snoutL = type === 'croc' ? len * 0.85 : len * 0.55;
      const cran = rbox(w, h, len * 0.55, Math.min(w, h) * 0.35, M.part); cran.position.set(0, 0, -len * 0.12); skull.add(cran);
      const snout = rbox(w * (type === 'croc' ? 0.5 : 0.8), h * 0.62, snoutL, Math.min(w, h) * 0.25, M.part); snout.position.set(0, -h * 0.12, -len * 0.3 - snoutL / 2 + len * 0.1); skull.add(snout);
      jaw.position.set(0, -h * 0.3, -len * 0.05); skull.add(jaw);
      const lj = rbox(w * (type === 'croc' ? 0.45 : 0.72), h * 0.26, snoutL + len * 0.3, h * 0.1, M.belly); lj.position.set(0, -h * 0.1, -(snoutL + len * 0.3) / 2 + len * 0.05); jaw.add(lj);
      const mouth = rbox(w * 0.6, h * 0.08, snoutL, h * 0.03, M.mouth); mouth.position.set(0, -h * 0.03, -snoutL / 2); jaw.add(mouth);
      const nT = big ? 7 : type === 'croc' ? 9 : 5;
      for (const sx of [-1, 1]) teeth(nT, sx * w * (type === 'croc' ? 0.2 : 0.33), -len * 0.22, -len * 0.22 - snoutL * 0.85, -h * 0.42);
      if (big) { for (const sx of [-1, 1]) { const brow = rbox(w * 0.28, h * 0.16, len * 0.2, h * 0.06, M.pat); brow.position.set(sx * w * 0.34, h * 0.42, -len * 0.18); brow.rotation.z = sx * 0.25; skull.add(brow); } }
      if (H.crests) for (const sx of [-1, 1]) { const g = new THREE.CircleGeometry(len * 0.32, 10, 0, Math.PI); const c = mesh(g, M.accent); c.material = M.accent; c.rotation.y = Math.PI / 2; c.position.set(sx * w * 0.18, h * 0.42, -len * 0.25); c.scale.set(1, 0.7, 1); skull.add(c); const c2 = c.clone(); c2.rotation.y = -Math.PI / 2; skull.add(c2); }
      if (H.frillNeck) { const g = new THREE.CircleGeometry(h * 1.3, 14, Math.PI * 0.15, Math.PI * 1.7); const fr = mesh(g, patchMaterial(new THREE.MeshStandardMaterial({ color: sp.look.accent, roughness: 0.6, side: THREE.DoubleSide }), {})); fr.position.set(0, -h * 0.05, len * 0.25); fr.scale.setScalar(0.15); skull.add(fr); parts.neckFrill = fr; }
      eyeY = h * 0.28; eyeZ = -len * 0.2; eyeX = w * 0.5;
      if (sp.alpha) {
        // alphas wear a crown of horns and old claw scars on the snout
        for (let i = 0; i < 5; i++) { const t = i / 4 - 0.5; const hrn = cone(w * 0.09, h * (0.55 - Math.abs(t) * 0.3), M.horn, 5); hrn.position.set(t * w * 0.82, h * 0.62, -len * 0.06 + Math.abs(t) * len * 0.05); hrn.rotation.set(0.45, 0, -t * 0.9); skull.add(hrn); }
        for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const scar = rbox(w * 0.03, h * 0.34, len * 0.022, w * 0.008, M.horn); scar.position.set(sx * w * (type === 'croc' ? 0.26 : 0.41), -h * 0.06, -len * (0.36 + k * 0.05)); scar.rotation.x = 0.55; skull.add(scar); }
      }
      if (sp.look.feathers) { const fm = patchMaterial(new THREE.MeshStandardMaterial({ color: sp.look.accent, roughness: 0.8, side: THREE.DoubleSide }), {}); for (let i = 0; i < 4; i++) { const g = new THREE.PlaneGeometry(h * 0.3, h * 0.8); g.translate(0, h * 0.4, 0); const f = mesh(g, fm, false); f.position.set(0, h * 0.45, len * 0.05 + i * h * 0.12); f.rotation.set(-0.9 - i * 0.15, Math.PI / 2, 0); skull.add(f); } }
      break;
    }
    case 'beak': case 'small': case 'sauro': {
      const cran = sphere(Math.max(w, h) * 0.55, M.part, w / Math.max(w, h), h / Math.max(w, h), 1.2); cran.position.set(0, 0, -len * 0.1); skull.add(cran);
      const sn = rbox(w * 0.6, h * 0.5, len * 0.55, h * 0.18, M.part); sn.position.set(0, -h * 0.1, -len * 0.45); skull.add(sn);
      if (type === 'beak' || type === 'small') { const bk = cone(w * 0.28, len * 0.35, M.claw, 6); bk.rotation.x = -Math.PI / 2; bk.position.set(0, -h * 0.12, -len * 0.82); skull.add(bk); }
      if (type === 'sauro') { const bump = sphere(h * 0.3, M.part, 1, 0.8, 1.2); bump.position.set(0, h * 0.35, -len * 0.22); skull.add(bump); }
      jaw.position.set(0, -h * 0.28, -len * 0.15); skull.add(jaw);
      const lj = rbox(w * 0.55, h * 0.2, len * 0.6, h * 0.08, M.belly); lj.position.set(0, -h * 0.05, -len * 0.3); jaw.add(lj);
      eyeY = h * 0.18; eyeZ = -len * 0.12; eyeX = w * 0.48;
      break;
    }
    case 'duck': {
      const cran = sphere(Math.max(w, h) * 0.55, M.part, w / Math.max(w, h), 1, 1.15); cran.position.set(0, 0, -len * 0.05); skull.add(cran);
      const bill = rbox(w * 0.95, h * 0.32, len * 0.6, h * 0.14, M.belly); bill.position.set(0, -h * 0.18, -len * 0.5); skull.add(bill);
      jaw.position.set(0, -h * 0.32, -len * 0.2); skull.add(jaw);
      const lj = rbox(w * 0.85, h * 0.14, len * 0.5, h * 0.06, M.belly); lj.position.set(0, 0, -len * 0.25); jaw.add(lj);
      if (H.crest) { const pts = [new THREE.Vector3(0, h * 0.25, -len * 0.05), new THREE.Vector3(0, h * 0.7, len * 0.3), new THREE.Vector3(0, h * 0.95, len * 0.75), new THREE.Vector3(0, h * 1.0, H.crest * s)]; const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, h * 0.16, 8); const crest = mesh(g, M.accent); skull.add(crest); const cap = sphere(h * 0.16, M.accent); cap.position.copy(pts[3]); skull.add(cap); parts.crest = crest; }
      eyeY = h * 0.2; eyeZ = -len * 0.08; eyeX = w * 0.5;
      break;
    }
    case 'cera': {
      const cran = rbox(w, h, len * 0.6, Math.min(w, h) * 0.3, M.part); cran.position.set(0, 0, -len * 0.1); skull.add(cran);
      const snout = rbox(w * 0.7, h * 0.7, len * 0.45, h * 0.2, M.part); snout.position.set(0, -h * 0.08, -len * 0.5); skull.add(snout);
      const beak = cone(w * 0.32, len * 0.35, M.claw, 6); beak.rotation.x = -Math.PI / 2 - 0.5; beak.position.set(0, -h * 0.28, -len * 0.78); skull.add(beak);
      jaw.position.set(0, -h * 0.35, -len * 0.25); skull.add(jaw);
      const lj = rbox(w * 0.6, h * 0.2, len * 0.45, h * 0.08, M.belly); lj.position.set(0, -h * 0.02, -len * 0.25); jaw.add(lj);
      if (H.frill) {
        const fr = H.frill * s;
        const g = new THREE.CircleGeometry(fr, 18, 0, Math.PI); const fM = M.accent;
        const frill = mesh(g, fM); frill.rotation.x = -0.35; frill.position.set(0, h * 0.25, len * 0.15); skull.add(frill);
        const back = mesh(g.clone(), M.part); back.rotation.x = -0.35; back.rotation.y = Math.PI; back.position.copy(frill.position).add(new THREE.Vector3(0, 0, 0.01)); skull.add(back);
        for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; const k = sphere(fr * 0.09, M.horn, 1, 1, 0.6, 6); k.position.set(Math.cos(a) * fr * 0.97, h * 0.25 + Math.sin(a) * fr * 0.92, len * 0.15 + Math.sin(a) * fr * 0.33); skull.add(k); }
        parts.frill = frill;
      }
      if (H.horns) {
        for (const sx of [-1, 1]) { const hr = cone(h * 0.11, h * 1.05, M.horn, 7); hr.position.set(sx * w * 0.3, h * 0.65, -len * 0.25); hr.rotation.set(-1.0, 0, sx * -0.2); skull.add(hr); }
        const nh = cone(h * 0.1, h * 0.42, M.horn, 7); nh.position.set(0, h * 0.22, -len * 0.62); nh.rotation.x = -0.5; skull.add(nh);
      }
      eyeY = h * 0.25; eyeZ = -len * 0.2; eyeX = w * 0.5;
      break;
    }
    case 'dome': {
      const cran = rbox(w * 0.9, h * 0.75, len * 0.7, h * 0.25, M.part); cran.position.set(0, -h * 0.1, -len * 0.15); skull.add(cran);
      const dome = sphere(w * 0.6, M.horn, 1, 0.85, 1.05); dome.position.set(0, h * 0.32, -len * 0.05); skull.add(dome);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const k = cone(h * 0.06, h * 0.16, M.pat, 5); k.position.set(Math.cos(a) * w * 0.55, h * 0.12, -len * 0.05 + Math.sin(a) * w * 0.55); k.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2); skull.add(k); }
      const bk = cone(w * 0.22, len * 0.25, M.claw, 6); bk.rotation.x = -Math.PI / 2; bk.position.set(0, -h * 0.2, -len * 0.62); skull.add(bk);
      jaw.position.set(0, -h * 0.42, -len * 0.2); skull.add(jaw);
      jaw.add(at(rbox(w * 0.5, h * 0.15, len * 0.4, h * 0.05, M.belly), 0, 0, -len * 0.2));
      eyeY = h * 0.05; eyeZ = -len * 0.28; eyeX = w * 0.46;
      break;
    }
    case 'ankylo': {
      const cran = rbox(w, h, len, Math.min(w, h) * 0.3, M.part); cran.position.set(0, 0, -len * 0.35); skull.add(cran);
      for (const sx of [-1, 1]) for (const z of [-0.05, -0.55]) { const hr = cone(h * 0.12, h * 0.4, M.horn, 6); hr.position.set(sx * w * 0.52, h * 0.15, -len * 0.35 + z * len * 0.5); hr.rotation.z = sx * -1.2; skull.add(hr); }
      const bk = rbox(w * 0.6, h * 0.35, len * 0.2, h * 0.1, M.claw); bk.position.set(0, -h * 0.2, -len * 0.9); skull.add(bk);
      jaw.position.set(0, -h * 0.45, -len * 0.4); skull.add(jaw);
      jaw.add(at(rbox(w * 0.7, h * 0.16, len * 0.7, h * 0.05, M.belly), 0, 0, -len * 0.25));
      eyeY = h * 0.2; eyeZ = -len * 0.5; eyeX = w * 0.5;
      break;
    }
    case 'ptera': {
      const cran = sphere(h * 0.6, M.part, 1, 1, 1.3); skull.add(cran);
      const beak = cone(h * 0.3, len, M.horn, 8); beak.rotation.x = -Math.PI / 2; beak.position.set(0, -h * 0.05, -len * 0.55); skull.add(beak);
      jaw.position.set(0, -h * 0.2, -h * 0.2); skull.add(jaw);
      const lb = cone(h * 0.2, len * 0.85, M.horn, 6); lb.rotation.x = -Math.PI / 2; lb.position.set(0, 0, -len * 0.45); jaw.add(lb);
      if (H.crest) { const c = cone(h * 0.25, H.crest * s, M.accent, 6); c.rotation.x = Math.PI / 2 + 0.35; c.position.set(0, h * 0.45, H.crest * s * 0.45); c.scale.set(0.35, 1, 1); skull.add(c); }
      eyeY = h * 0.18; eyeZ = -h * 0.1; eyeX = h * 0.45;
      break;
    }
    default: skull.add(sphere(h * 0.6, M.part));
  }
  // tiny dot eyes (+ lids for blinking, brows for moods)
  for (const sx of [-1, 1]) {
    const e = sphere(eyeR, M.eye, 1, 1, 1, 10);
    e.position.set(sx * eyeX * 0.98, eyeY, eyeZ);
    skull.add(e);
    const hl = sphere(eyeR * 0.32, M.tooth, 1, 1, 1, 6); hl.position.set(sx * eyeR * 0.45, eyeR * 0.45, -eyeR * 0.5); e.add(hl);
    parts.eyes.push(e);
    const brow = rbox(eyeR * 3.2, eyeR * 0.9, eyeR * 1.6, eyeR * 0.4, M.pat);
    brow.position.set(sx * eyeX * 0.95, eyeY + eyeR * 1.7, eyeZ + eyeR * 0.2); skull.add(brow);
    parts.lids.push(brow);
  }
  // nostrils
  for (const sx of [-1, 1]) { const n = sphere(eyeR * 0.5, M.claw, 1, 0.6, 1, 6); n.position.set(sx * w * 0.18, eyeY * 0.2, -len * (type === 'croc' ? 1.0 : 0.72)); skull.add(n); }
}

// ------------------------------------------------------------------ legs / arms / wings
function buildLeg(kind, len, br, M, side, sp, S, hind) {
  const root = new THREE.Group();
  const j = { root };
  if (kind === 'biped') {
    const k = len / 0.881;
    const l1 = 0.4 * k, l2 = 0.4 * k, l3 = 0.2 * k;
    const thighR = Math.max(br * 0.5, 0.02), shinR = Math.max(br * 0.24, 0.012);
    const hip = new THREE.Group(); root.add(hip);
    hip.add(taperCapsule(thighR, thighR * 0.55, l1, M.part));
    const knee = new THREE.Group(); knee.position.y = -l1; hip.add(knee);
    knee.add(taperCapsule(shinR * 1.3, shinR, l2, M.part));
    const ankle = new THREE.Group(); ankle.position.y = -l2; knee.add(ankle);
    ankle.add(taperCapsule(shinR, shinR * 0.8, l3, M.part));
    const foot = new THREE.Group(); foot.position.y = -l3; ankle.add(foot);
    for (const [tx, ty] of [[-0.6, 0.35], [0, 0], [0.6, 0.35]]) {
      const toeL = l3 * 0.85;
      const toe = capsule(shinR * 0.55, toeL * 0.7, M.part, 6); toe.rotation.x = -Math.PI / 2 - 0.05; toe.position.set(tx * shinR * 1.4, -shinR * 0.3, -shinR * 0.2); toe.rotation.y = tx * ty * 0.6; foot.add(toe);
      const claw = cone(shinR * 0.32, toeL * 0.32, M.claw, 5); claw.rotation.x = -Math.PI / 2 - 0.4; claw.position.set(tx * shinR * 1.4 + Math.sin(tx * ty * 0.6) * -toeL * 0.75, -shinR * 0.45, -toeL * 0.85); foot.add(claw);
    }
    if (sp.look.sickle) { const c = cone(shinR * 0.4, l3 * 0.7, M.claw, 5); c.position.set(side * shinR * 0.4, shinR * 0.4, -shinR * 0.3); c.rotation.x = -0.6; foot.add(c); }
    Object.assign(j, { hip, knee, ankle, foot, l1, l2, l3, type: 'biped' });
  } else if (kind === 'wingarm') {
    const hip = new THREE.Group(); root.add(hip);
    hip.add(taperCapsule(br * 0.25, br * 0.15, len * 0.5, M.part));
    const knee = new THREE.Group(); knee.position.y = -len * 0.5; hip.add(knee);
    knee.add(taperCapsule(br * 0.15, br * 0.1, len * 0.5, M.part));
    const foot = new THREE.Group(); foot.position.y = -len; hip.add(foot);
    Object.assign(j, { hip, knee, foot, l1: len * 0.5, l2: len * 0.5, type: 'column' });
  } else {
    // pillar legs with a slight knee
    const l1 = len * 0.55, l2 = len * 0.45;
    const r1 = Math.max(br * (hind ? 0.42 : 0.34), 0.02), r2 = r1 * 0.78;
    const hip = new THREE.Group(); root.add(hip);
    hip.add(taperCapsule(r1, r1 * 0.8, l1, M.part));
    const knee = new THREE.Group(); knee.position.y = -l1; hip.add(knee);
    knee.add(taperCapsule(r2, r2 * 0.95, l2 - r2 * 0.3, M.part));
    const foot = new THREE.Group(); foot.position.y = -l2; knee.add(foot);
    const pad = mesh(new THREE.CylinderGeometry(r2 * 1.05, r2 * 1.2, r2 * 0.5, 10), M.part); pad.position.y = r2 * 0.12; foot.add(pad);
    for (let k = 0; k < 3; k++) { const n = sphere(r2 * 0.22, M.horn, 1, 0.7, 1, 6); n.position.set((k - 1) * r2 * 0.55, -r2 * 0.02, -r2 * 0.95); foot.add(n); }
    Object.assign(j, { hip, knee, foot, l1, l2, type: 'column' });
  }
  return j;
}
function buildArm(len, M, side, sp, S) {
  const root = new THREE.Group();
  const r = Math.max(0.01, len * 0.16);
  const sh = new THREE.Group(); root.add(sh);
  sh.add(taperCapsule(r, r * 0.8, len * 0.5, M.part));
  const el = new THREE.Group(); el.position.y = -len * 0.5; sh.add(el);
  el.add(taperCapsule(r * 0.8, r * 0.6, len * 0.4, M.part));
  const hand = new THREE.Group(); hand.position.y = -len * 0.42; el.add(hand);
  for (let k = 0; k < (sp.id === 'rex' ? 2 : 3); k++) { const c = cone(r * 0.35, len * 0.22, M.claw, 5); c.position.set((k - 1) * r * 0.5, -len * 0.06, -r * 0.2); c.rotation.x = 0.5; hand.add(c); }
  if (sp.look.feathers) { const fm = patchMaterial(new THREE.MeshStandardMaterial({ color: sp.look.pcolor, roughness: 0.8, side: THREE.DoubleSide }), {}); const g = new THREE.PlaneGeometry(len * 0.25, len * 0.55); g.translate(0, -len * 0.3, 0); const f = mesh(g, fm, false); f.position.set(side * r * 0.6, 0, r * 0.5); f.rotation.set(0.3, Math.PI / 2, 0); el.add(f); }
  sh.rotation.x = 0.6; el.rotation.x = -1.0;
  return { root, sh, el, hand, len };
}
function buildWings(B, idx, bonePos, L, S, M) {
  const wings = [];
  const span = L.wingspan * S / 2;
  const chest = bonePos[idx.chest];
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ color: L.color, roughness: 0.65, side: THREE.DoubleSide, map: M.part.map }), {});
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.0); shape.lineTo(span * 0.45, span * 0.06); shape.lineTo(span, -span * 0.02); shape.quadraticCurveTo(span * 0.6, -span * 0.16, span * 0.35, -span * 0.22); shape.quadraticCurveTo(span * 0.12, -span * 0.3, 0, -span * 0.32);
    const g = new THREE.ShapeGeometry(shape, 6); g.rotateX(-Math.PI / 2);
    if (side < 0) g.scale(-1, 1, 1);
    const w = new THREE.Mesh(g, mat); w.castShadow = true; w.receiveShadow = true;
    const grp = new THREE.Group(); grp.position.set(side * L.body[1] * S * 0.5, L.body[1] * S * 0.4, 0); grp.add(w);
    // dark wing tips
    const tip = new THREE.Mesh(new THREE.CircleGeometry(span * 0.12, 6), patchMaterial(new THREE.MeshStandardMaterial({ color: L.pcolor, roughness: 0.7, side: THREE.DoubleSide }), {}));
    tip.rotation.x = -Math.PI / 2; tip.position.set(side * span * 0.9, 0.002, 0); grp.add(tip);
    B.chest.add(grp);
    void chest;
    wings.push(grp);
  }
  return wings;
}

// ========================================================================== procedural animation
export class DinoRig {
  constructor(rig, sp) {
    this.r = rig; this.sp = sp;
    this.phase = Math.random() * 6.28; this.t = Math.random() * 10;
    this.blink = 0; this.nextBlink = 1 + Math.random() * 4;
    this.tailV = 0; this.tailA = 0; this.lookYaw = 0; this.lookPitch = 0; this.jawOpen = 0; this.lie = 0; this.ko = 0; this.flap = 0;
    this.prevYaw = null; this.turn = 0;
    this.base = {};
    for (const [k, b] of Object.entries(rig.bones)) this.base[k] = b.position.clone();
  }
  // s: { speed, yaw, state, action:{name,t}, look:{yaw,pitch}, alert, happy, swim, fly, airborne, mood }
  update(dt, s) {
    const R = this.r, sp = this.sp, B = R.bones, P = R.parts;
    this.t += dt;
    const t = this.t;
    const L = sp.look;
    const speed = s.speed ?? 0;
    const run = speed > (sp.stats.speed * 1.4);
    const stride = Math.max(0.25, R.len * (R.quad ? 0.32 : 0.26) * (run ? 1.6 : 1));
    this.phase += (speed / stride) * dt * Math.PI;
    const ph = this.phase;
    const ease = (cur, tgt, k) => cur + (tgt - cur) * Math.min(1, dt * k);
    // turn rate for tail lag
    if (this.prevYaw === null) this.prevYaw = s.yaw ?? 0;
    let dy = (s.yaw ?? 0) - this.prevYaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.prevYaw = s.yaw ?? 0;
    this.turn = ease(this.turn, dy / Math.max(dt, 1e-3), 6);
    const st = s.state ?? 'idle';
    const sleeping = st === 'sleep', ko = st === 'ko', dead = st === 'dead';
    this.lie = ease(this.lie, sleeping || ko || dead ? 1 : 0, 3);
    this.ko = ease(this.ko, ko || dead ? 1 : 0, 3);
    // ---- body bob / roll / breathing
    const amp = Math.min(1, speed / Math.max(0.5, sp.stats.run));
    const bob = Math.abs(Math.sin(ph)) * 0.06 * amp * R.br * 4 * (R.quad ? 0.5 : 1);
    const breathe = Math.sin(t * (sleeping ? 1.2 : 2.2)) * 0.025;
    const hips = B.hips;
    hips.position.copy(this.base.hips);
    hips.position.y += -bob - this.lie * this.lieDrop() + (s.swim ? -R.br * 0.6 : 0);
    hips.rotation.set(0, 0, 0);
    hips.rotation.z = Math.sin(ph) * 0.05 * amp + this.ko * 1.35 * (this.koSide ?? 1);
    hips.rotation.x = (s.pitch ?? 0) * 0.5 - this.lie * 0.04;
    if (B.chest) { B.chest.scale.setScalar(1 + breathe); B.chest.rotation.x = Math.sin(ph * 2) * 0.03 * amp; }
    // ---- action overrides
    const act = s.action;
    let headPitch = 0, headYaw = 0, neckLift = 0, jaw = 0, tailLift = 0;
    if (act) {
      const p = act.t ?? 0, k = Math.sin(Math.min(1, p) * Math.PI);
      switch (act.name) {
        case 'eat': neckLift = -0.9 * k; headPitch = 0.6 * k; jaw = Math.abs(Math.sin(t * 9)) * 0.35 * k; break;
        case 'drink': neckLift = -1.0 * k; headPitch = 0.7 * k; jaw = Math.abs(Math.sin(t * 6)) * 0.15 * k; break;
        case 'roar': neckLift = 0.45 * k; headPitch = -0.5 * k; jaw = 0.9 * k; tailLift = 0.2 * k; break;
        case 'bite': headPitch = 0.35 * k; jaw = p < 0.5 ? p * 2 * 0.8 : (1 - p) * 2 * 0.8; neckLift = -0.1 * k; break;
        case 'headbutt': neckLift = -0.45 * k; headPitch = 0.8 * k; break;
        case 'tailwhip': this.tailA += Math.sin(p * Math.PI * 2) * 0.25; break;
        case 'call': neckLift = 0.4 * k; headPitch = -0.6 * k; jaw = 0.5 * k; break;
        case 'sniff': neckLift = -0.5 * k; headPitch = 0.3 * k + Math.sin(t * 14) * 0.05; break;
        case 'shake': hips.rotation.z += Math.sin(t * 30) * 0.12 * k; break;
        case 'happy': hips.position.y += Math.abs(Math.sin(t * 10)) * 0.08 * R.br * 2 * k; headPitch = -0.2 * k; jaw = 0.25 * k; break;
        case 'spit': neckLift = 0.2 * k; headPitch = -0.2 * k; jaw = 0.7 * k; if (P.neckFrill) P.neckFrill.scale.setScalar(0.15 + 0.85 * k); break;
        case 'stomp': {
          // rear up, then slam the front down
          const up = p < 0.55 ? Math.sin((p / 0.55) * Math.PI / 2) : Math.max(0, 1 - (p - 0.55) / 0.12);
          hips.position.y += up * R.br * 0.8; hips.rotation.x += up * 0.32;
          neckLift = 0.35 * k; headPitch = -0.3 * up; jaw = 0.7 * k; tailLift = -0.3 * up;
          break;
        }
        case 'pounce': {
          // crouch, then spring forward claws first
          const c = p < 0.35 ? Math.sin((p / 0.35) * Math.PI / 2) : 0;
          hips.position.y -= c * R.br * 0.55; hips.rotation.x += -c * 0.18 + (p > 0.35 ? 0.25 * k : 0);
          headPitch = 0.15 * k; jaw = p > 0.35 ? 0.85 * k : 0; tailLift = 0.35 * k;
          break;
        }
        default: break;
      }
    }
    if (P.neckFrill && act?.name !== 'spit') P.neckFrill.scale.setScalar(ease(P.neckFrill.scale.x, s.alert > 0.5 && sp.predator ? 1 : 0.15, 6));
    if (sleeping) { neckLift = -0.7; headPitch = 0.4; }
    if (s.alert > 0.5 && !act) { neckLift += 0.25; headPitch -= 0.15; }
    // ---- neck + head look
    const lookYaw = Math.max(-1.2, Math.min(1.2, s.look?.yaw ?? 0)) * (sleeping || ko ? 0 : 1);
    const lookPitch = Math.max(-0.8, Math.min(0.8, s.look?.pitch ?? 0));
    this.lookYaw = ease(this.lookYaw, lookYaw, 5); this.lookPitch = ease(this.lookPitch, lookPitch + headPitch, 6);
    const necks = R.boneSpec.filter((b) => b.name.startsWith('neck')).map((b) => B[b.name]);
    const nN = Math.max(1, necks.length);
    for (const [i, nb] of necks.entries()) {
      nb.rotation.set(0, 0, 0);
      nb.rotation.x = (-neckLift / nN) * (1 + i * 0.3) + Math.sin(ph * 2 + i) * 0.04 * amp - (sleeping ? Math.sin(t * 1.2) * 0.02 : 0);
      nb.rotation.y = this.lookYaw / (nN + 1) + (sleeping ? 0.25 : 0);
    }
    B.head.rotation.set(-this.lookPitch * 0.6 + (necks.length ? 0 : -neckLift), this.lookYaw / (nN + 1), (this.ko > 0.5 ? 0.6 : 0));
    // head stabilisation against body bob
    B.head.position.copy(this.base.head); B.head.position.y += bob * 0.6;
    // jaw
    this.jawOpen = ease(this.jawOpen, jaw + (this.ko > 0.5 ? 0.25 : 0), 14);
    if (P.jaw) P.jaw.rotation.x = this.jawOpen * 0.6;
    // ---- tail: sway + lag + lift (spring)
    const tails = R.boneSpec.filter((b) => b.name.startsWith('tail')).map((b) => B[b.name]);
    const target = -this.turn * 0.25 + Math.sin(t * 1.3 + this.phase * 0.5) * 0.06 + Math.sin(ph) * 0.08 * amp;
    this.tailV += (target - this.tailA) * 40 * dt - this.tailV * 7 * dt;
    this.tailA += this.tailV * dt;
    for (const [i, tb] of tails.entries()) {
      const k2 = 1 - i / Math.max(1, tails.length);
      tb.rotation.y = this.tailA * (0.6 + k2 * 0.6) + (sleeping ? 0.35 : 0) * k2;
      tb.rotation.x = -tailLift * 0.3 + (sleeping ? 0.08 : 0) + (s.swim ? -0.1 : 0) + this.lie * 0.05;
    }
    // ---- legs
    for (const lg of P.legs ?? []) {
      const off = lg.hind ? (lg.side < 0 ? 0 : Math.PI) : (lg.side < 0 ? Math.PI * 0.5 : Math.PI * 1.5);
      const a = ph + off;
      const sw = Math.sin(a) * (run ? 0.75 : 0.45) * amp;
      const lift = Math.max(0, Math.cos(a)) * amp;
      if (lg.type === 'biped') {
        const fold = this.lie;
        lg.hip.rotation.x = 0.5 + sw + fold * 0.9 + (s.airborne ? 0.4 : 0);
        lg.knee.rotation.x = -1.1 - lift * 0.9 - fold * 1.2;
        lg.ankle.rotation.x = -(lg.hip.rotation.x + lg.knee.rotation.x) + 0.0 + fold * 0.3;
        lg.foot.rotation.x = lift * 0.3;
      } else {
        const fold = this.lie;
        lg.hip.rotation.x = sw * 0.8 + (lg.hind ? 0.05 : -0.05) - fold * (lg.hind ? -1.1 : 1.1);
        lg.knee.rotation.x = (lg.hind ? -1 : 1) * (0.12 + lift * 0.5 + fold * 1.6);
        lg.foot.rotation.x = -lg.hip.rotation.x - lg.knee.rotation.x;
      }
      lg.root.rotation.z = this.lie * lg.side * 0.25;
    }
    for (const arm of P.arms ?? []) { arm.sh.rotation.x = 0.6 + Math.sin(ph + (arm.side < 0 ? 0 : Math.PI)) * 0.1 * amp + (act?.name === 'happy' ? Math.sin(t * 14) * 0.4 : 0); arm.el.rotation.x = -1.0 - this.lie * 0.4; }
    // ---- wings (pteranodon flap, microraptor glide)
    if (P.wings?.length) {
      const flying = s.fly;
      this.flap += dt * (flying ? (s.glide ? 2 : 7) : 0);
      for (const [i, w] of P.wings.entries()) {
        const side = i % 2 ? 1 : -1;
        if (L.wingspan) { const fold = flying ? 0 : 1; this.fold = ease(this.fold ?? 1, fold, 4); w.rotation.set(0, side * 1.25 * this.fold, flying ? side * Math.sin(this.flap) * 0.6 * (s.glide ? 0.2 : 1) : side * (-0.25 - this.lie * 0.2)); w.scale.set(1 - this.fold * 0.55, 1, 1); }
        else w.rotation.z = side * (flying ? 0.1 : -0.9);
      }
    }
    // ---- eyes: blinking, sleep, ko, mood
    this.nextBlink -= dt;
    if (this.nextBlink <= 0) { this.blink = 0.14; this.nextBlink = 2 + Math.random() * 4; }
    this.blink = Math.max(0, this.blink - dt);
    const closed = sleeping || this.blink > 0;
    for (const e of P.eyes) {
      const ty = closed ? 0.12 : this.ko > 0.5 ? 0.45 : s.mood === 'angry' ? 0.65 : s.mood === 'happy' ? 0.5 : 1;
      e.scale.y = ease(e.scale.y, ty, 25); e.scale.x = ease(e.scale.x, this.ko > 0.5 ? 1.4 : 1, 10);
    }
    for (const [i, lid] of P.lids.entries()) { const side = i ? 1 : -1; lid.rotation.z = ease(lid.rotation.z, s.mood === 'angry' || s.alert > 0.7 ? side * 0.45 : s.mood === 'happy' ? side * -0.2 : 0, 8); }
  }
  lieDrop() { const r = this.r; return r.quad ? (r.bonePos[r.idx.hips].y - r.br * 1.05) : r.bonePos[r.idx.hips].y - r.br * 1.0; }
}

// a tiny preview icon of a species (for the PDA / Dino-Dex)
export function dinoColorCss(sp) { return '#' + sp.look.color.toString(16).padStart(6, '0'); }
void _q;
