// Accessories for the bean scientists: hats, face gear, neckwear and things
// clipped to the chrono pack. Colours and fabric are always free to change;
// every accessory is unlocked by an achievement (the unlocks are kept in the
// browser profile, so they carry over between expeditions).
//
// Each one is a small hand-built model that rides a bone of the skeleton
// (head, chest or pack), placed from the anchor points the bean design
// exports (D.anim.acc), so it sits right on the hood, face or pack.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// ------------------------------------------------------------------ the catalogue
// ach: the achievement that unlocks it (see journal.js ACH)
export const ACCESSORIES = {
  hat: [
    { id: 'none', name: 'Just the hood' },
    { id: 'hardhat', name: 'Hard Hat', ach: 'tutorial' },
    { id: 'pith', name: 'Explorer Helmet', ach: 'firstTree' },
    { id: 'beanie', name: 'Cosy Beanie', ach: 'nights5' },
    { id: 'cap', name: 'Mechanic Cap', ach: 'oil' },
    { id: 'headphones', name: 'Headphones', ach: 'radio' },
    { id: 'propeller', name: 'Propeller Cap', ach: 'snake' },
    { id: 'skull', name: 'Raptor Skull', ach: 'tame3' },
    { id: 'crown', name: 'Alpha Crown', ach: 'alpha1' },
  ],
  face: [
    { id: 'none', name: 'Nothing' },
    { id: 'goggles', name: 'Lab Goggles', ach: 'scan20' },
    { id: 'specs', name: 'Round Specs', ach: 'dex8' },
    { id: 'moustache', name: 'Fine Moustache', ach: 'coffee' },
    { id: 'visor', name: 'Driving Visor', ach: 'km' },
    { id: 'monocle', name: 'Monocle', ach: 'egg' },
  ],
  neck: [
    { id: 'none', name: 'Nothing' },
    { id: 'scarf', name: 'Striped Scarf', ach: 'storey' },
    { id: 'bowtie', name: 'Bow Tie', ach: 'bonk' },
    { id: 'bandana', name: 'Bandana', ach: 'alphaPet' },
    { id: 'medal', name: 'Explorer Medal', ach: 'alpha3' },
  ],
  back: [
    { id: 'chrono', name: 'Chrono Pack' },
    { id: 'antenna', name: 'Long Antenna', ach: 'rack20' },
    { id: 'plush', name: 'Plush Pal', ach: 'level5' },
    { id: 'jets', name: 'Jet Fins', ach: 'mind' },
    { id: 'flag', name: 'Expedition Flag', ach: 'base' },
  ],
};
export const ACC_SLOTS = ['hat', 'face', 'neck', 'back'];
export const accById = (slot, id) => ACCESSORIES[slot]?.find((a) => a.id === id) ?? null;

// ------------------------------------------------------------------ unlocks (browser profile)
const KEY = 'prehistoric-unlocks';
let _unl = null;
export function unlocks() {
  if (_unl) return _unl;
  try { _unl = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { _unl = new Set(); }
  try { if (new URLSearchParams(location.search).get('unlockall')) for (const s of ACC_SLOTS) for (const a of ACCESSORIES[s]) if (a.ach) _unl.add(a.ach); } catch { /* no location */ }
  return _unl;
}
export function unlock(ach) {
  const u = unlocks();
  if (u.has(ach)) return false;
  u.add(ach);
  try { localStorage.setItem(KEY, JSON.stringify([...u])); } catch { /* private mode */ }
  return true;
}
export const isUnlocked = (slot, id) => { const a = accById(slot, id); return !!a && (!a.ach || unlocks().has(a.ach)); };
// which accessories an achievement unlocks
export const unlockedBy = (ach) => ACC_SLOTS.flatMap((s) => ACCESSORIES[s].filter((a) => a.ach === ach).map((a) => ({ slot: s, ...a })));

// ------------------------------------------------------------------ materials
const _mats = new Map();
const M = (key, o) => { if (!_mats.has(key)) _mats.set(key, new THREE.MeshStandardMaterial(o)); return _mats.get(key); };
const plastic = (c) => M('p' + c, { color: c, roughness: 0.38, metalness: 0 });
const cloth = (c) => M('c' + c, { color: c, roughness: 0.92, metalness: 0 });
const metal = (c, r = 0.32) => M('m' + c + r, { color: c, roughness: r, metalness: 1 });
const glow = (c, k = 2) => M('g' + c + k, { color: 0x101010, emissive: c, emissiveIntensity: k, roughness: 0.3 });
const glass = (c) => M('gl' + c, { color: c, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45, depthWrite: false });
const bone = () => M('bone', { color: 0xe8dcc0, roughness: 0.7 });

// a striped knit canvas texture for the beanie and the scarf
const _tex = new Map();
function stripes(a, b, n = 6, rib = true) {
  const k = `${a}-${b}-${n}`;
  if (_tex.has(k)) return _tex.get(k);
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d');
  const hex = (v) => '#' + v.toString(16).padStart(6, '0');
  for (let i = 0; i < n; i++) { x.fillStyle = hex(i % 2 ? b : a); x.fillRect(0, (i * 64) / n, 64, 64 / n + 1); }
  if (rib) for (let px = 0; px < 64; px += 4) { x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(px, 0, 1, 64); x.fillStyle = 'rgba(255,255,255,0.08)'; x.fillRect(px + 2, 0, 1, 64); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  _tex.set(k, t);
  return t;
}
const knit = (a, b, n, rep = 1) => { const key = `k${a}${b}${n}${rep}`; if (!_mats.has(key)) { const t = stripes(a, b, n).clone(); t.needsUpdate = true; t.repeat.set(rep, 1); _mats.set(key, new THREE.MeshStandardMaterial({ map: t, roughness: 0.95 })); } return _mats.get(key); };

// ------------------------------------------------------------------ geometry helpers
const mesh = (g, m, shadow = true) => { const o = new THREE.Mesh(g, m); o.castShadow = shadow; o.receiveShadow = true; return o; };
const at = (o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
const sph = (r, m, w = 20, h = 14, ph = 0, pl = Math.PI * 2, th = 0, tl = Math.PI) => mesh(new THREE.SphereGeometry(r, w, h, ph, pl, th, tl), m);
const cyl = (rt, rb, hgt, m, seg = 20, open = false) => mesh(new THREE.CylinderGeometry(rt, rb, hgt, seg, 1, open), m);
const box = (w, h, d, m, r = 0.004) => mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
const torus = (r, t, m, arc = Math.PI * 2, rs = 10, ts = 32) => mesh(new THREE.TorusGeometry(r, t, rs, ts, arc), m);
const tube = (pts, r, m, seg = 24) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 8, false), m);
const G = (...k) => { const g = new THREE.Group(); for (const c of k) g.add(c); return g; };

// the hood's radius at height y (it is a round cone: two spheres joined by a cone)
function hoodR(A, y) {
  const { c0, r0, c1, r1 } = A.hood;
  if (y >= c1[1]) return Math.sqrt(Math.max(0, r1 * r1 - (y - c1[1]) ** 2));
  if (y <= c0[1]) return Math.sqrt(Math.max(0, r0 * r0 - (y - c0[1]) ** 2));
  return r0 + ((r1 - r0) * (y - c0[1])) / (c1[1] - c0[1]);
}
const hoodTop = (A) => A.hood.c1[1] + A.hood.r1;

// ------------------------------------------------------------------ the models
// every builder returns { bone, obj } in the bean's rest frame (front is -Z), positions in metres
const HATS = {
  hardhat(A) {
    const y0 = A.hood.c1[1] - 0.02, R = hoodR(A, y0) + 0.018, top = hoodTop(A) + 0.02;
    const yel = plastic(0xf2c230), dark = plastic(0x2a2a2e);
    const dome = sph(R, yel, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale.y = (top - y0) / R;
    const brim = cyl(R + 0.035, R + 0.045, 0.014, yel, 32); brim.scale.z = 1.08; brim.position.set(0, -0.002, -0.012);
    const ridge = box(0.034, 0.03, R * 1.9, yel, 0.01); ridge.position.set(0, (top - y0) - 0.012, 0); ridge.scale.y = 0.8;
    const lampBody = cyl(0.026, 0.03, 0.03, dark, 16); lampBody.rotation.x = Math.PI / 2; lampBody.position.set(0, 0.05, -R - 0.006);
    const lens = cyl(0.02, 0.02, 0.004, glow(0xfff2c0, 2.5), 16); lens.rotation.x = Math.PI / 2; lens.position.set(0, 0.05, -R - 0.023);
    const g = G(dome, brim, ridge, lampBody, lens);
    g.position.set(0, y0, A.hood.c1[2]); g.rotation.x = 0.1;
    return { bone: 'head', obj: g };
  },
  pith(A) {
    const y0 = A.hood.c1[1] - 0.01, R = hoodR(A, y0) + 0.02, top = hoodTop(A) + 0.03;
    const kh = cloth(0xcbb98a), band = cloth(0x5a3a22);
    const dome = sph(R, kh, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale.y = (top - y0) / R;
    const brim = cyl(R + 0.01, R + 0.1, 0.035, kh, 36, true); brim.position.y = -0.012;
    const brimUnder = cyl(R + 0.01, R + 0.1, 0.035, cloth(0x3c6a3a), 36, true); brimUnder.position.y = -0.0135; brimUnder.scale.setScalar(0.995); brimUnder.material.side = THREE.BackSide;
    const b = cyl(R + 0.003, R + 0.006, 0.028, band, 32); b.position.y = 0.012;
    const btn = sph(0.016, kh, 10, 8); btn.position.y = top - y0;
    const g = G(dome, brim, brimUnder, b, btn);
    g.position.set(0, y0, A.hood.c1[2]); g.rotation.x = 0.08;
    return { bone: 'head', obj: g };
  },
  beanie(A) {
    const y0 = A.hood.c1[1] - 0.035, R = hoodR(A, y0) + 0.012, top = hoodTop(A) + 0.04;
    const dome = sph(R, knit(0xd8442a, 0xf2e6c8, 8, 3), 28, 16, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale.y = (top - y0) / R;
    const cuff = cyl(R + 0.012, R + 0.014, 0.06, knit(0xa82a1a, 0xa82a1a, 1, 6), 32); cuff.position.y = 0.022;
    const pom = new THREE.IcosahedronGeometry(0.048, 2);
    const p = pom.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.18; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
    pom.computeVertexNormals();
    const pm = mesh(pom, cloth(0xf2e6c8)); pm.position.y = top - y0 + 0.03;
    const g = G(dome, cuff, pm);
    g.position.set(0, y0, A.hood.c1[2]); g.rotation.set(0.06, 0, 0.08);
    return { bone: 'head', obj: g };
  },
  cap(A) {
    const y0 = A.hood.c1[1] + 0.005, R = hoodR(A, y0) + 0.014, top = hoodTop(A) + 0.018;
    const blue = cloth(0x2a5a9a);
    const dome = sph(R, blue, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale.y = (top - y0) / R;
    const bill = box(R * 1.35, 0.012, 0.13, blue, 0.006); bill.position.set(0, 0.004, -R - 0.03); bill.rotation.x = -0.12; bill.scale.x = 1;
    const patch = box(0.07, 0.04, 0.008, plastic(0xf2f2ea), 0.003); patch.position.set(0, 0.055, -R + 0.006); patch.rotation.x = -0.35;
    const bolt = box(0.03, 0.012, 0.004, plastic(0xf07a2a), 0.002); bolt.position.set(0, 0.057, -R + 0.0005); bolt.rotation.set(-0.35, 0, 0.5);
    const btn = sph(0.014, blue, 10, 8); btn.position.y = top - y0;
    const g = G(dome, bill, patch, bolt, btn);
    g.position.set(0, y0, A.hood.c1[2]); g.rotation.x = 0.06;
    return { bone: 'head', obj: g };
  },
  headphones(A) {
    const y = A.hood.c1[1] - 0.02, R = hoodR(A, y) + 0.012, top = hoodTop(A) + 0.012;
    const band = torus(1, 0.012, plastic(0x2a2a2e), Math.PI, 8, 32);
    band.scale.set(R + 0.03, top - y + 0.01, 1); band.position.y = 0;
    const pad = torus(1, 0.016, cloth(0x4a4a50), Math.PI * 0.5, 8, 16); pad.scale.set(R + 0.026, top - y + 0.006, 1); pad.rotation.z = Math.PI * 0.25;
    const g = G(band, pad);
    for (const sx of [-1, 1]) {
      const cup = cyl(0.058, 0.062, 0.05, plastic(0xe8483a), 24); cup.rotation.z = Math.PI / 2; cup.position.set(sx * (R + 0.03), -0.02, 0);
      const cush = torus(0.046, 0.016, cloth(0x2a2a2e), Math.PI * 2, 8, 20); cush.rotation.y = Math.PI / 2; cush.position.set(sx * (R + 0.006), -0.02, 0);
      const ring = torus(0.05, 0.005, metal(0xd8d8dc), Math.PI * 2, 6, 24); ring.rotation.y = Math.PI / 2; ring.position.set(sx * (R + 0.056), -0.02, 0);
      g.add(cup, cush, ring);
    }
    g.position.set(0, y, A.hood.c1[2]);
    return { bone: 'head', obj: g };
  },
  propeller(A) {
    const y0 = A.hood.c1[1] - 0.005, R = hoodR(A, y0) + 0.014, top = hoodTop(A) + 0.02;
    const g = new THREE.Group();
    const cols = [0xd83a2a, 0xf2c230, 0x2a6ad8, 0x3aa84a];
    for (let i = 0; i < 4; i++) { const q = sph(R, cloth(cols[i]), 8, 16, (i * Math.PI) / 2, Math.PI / 2, 0, Math.PI / 2); q.scale.y = (top - y0) / R; g.add(q); }
    const bill = box(R * 1.2, 0.01, 0.1, cloth(0xd83a2a), 0.005); bill.position.set(0, 0.004, -R - 0.02); bill.rotation.x = -0.1; g.add(bill);
    const post = cyl(0.006, 0.006, 0.05, metal(0xd8d8dc), 8); post.position.y = top - y0 + 0.02; g.add(post);
    const prop = new THREE.Group(); prop.position.y = top - y0 + 0.048; prop.name = 'spin';
    for (const s of [-1, 1]) { const bl = box(0.12, 0.004, 0.03, plastic(s > 0 ? 0xf2c230 : 0x2a6ad8), 0.002); bl.position.x = s * 0.065; bl.rotation.x = s * 0.25; prop.add(bl); }
    prop.add(sph(0.012, plastic(0xd83a2a), 10, 8));
    g.add(prop);
    g.position.set(0, y0, A.hood.c1[2]); g.rotation.set(0.05, 0, -0.06);
    g.userData.spin = prop;
    return { bone: 'head', obj: g };
  },
  skull(A) {
    // a raptor skull worn as a helmet: the cranium over the hood, the upper jaw jutting out over the face
    const y0 = A.hood.c1[1] - 0.01, R = hoodR(A, y0) + 0.02, top = hoodTop(A) + 0.045;
    const B = bone(), dk = M('socket', { color: 0x1a1410, roughness: 1 });
    const cran = sph(R, B, 28, 18, 0, Math.PI * 2, 0, Math.PI * 0.55); cran.scale.set(1, (top - y0) / R, 1.12);
    const snout = new THREE.Group(); snout.position.set(0, 0.0, -R * 0.95);
    const up = mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.2, 14, 1), B); up.rotation.x = -Math.PI / 2 + 0.1; up.scale.set(1, 1, 0.55); up.position.set(0, 0.02, -0.08);
    const ridge = box(0.04, 0.03, 0.2, B, 0.012); ridge.position.set(0, 0.06, -0.06); ridge.rotation.x = 0.12;
    snout.add(up, ridge);
    for (let i = 0; i < 6; i++) for (const sx of [-1, 1]) {
      const t = mesh(new THREE.ConeGeometry(0.008, 0.03, 5), M('tooth', { color: 0xf8f2e2, roughness: 0.5 }));
      t.rotation.x = Math.PI; t.position.set(sx * (0.05 - i * 0.006), -0.02, -0.01 - i * 0.026); snout.add(t);
    }
    const g = G(cran, snout);
    for (const sx of [-1, 1]) {
      const sock = sph(0.04, dk, 12, 10); sock.position.set(sx * 0.1, 0.04, -R * 0.82); sock.scale.set(1, 0.8, 0.6);
      const horn = mesh(new THREE.ConeGeometry(0.02, 0.08, 8), B); horn.position.set(sx * 0.12, top - y0 - 0.02, 0.02); horn.rotation.set(-0.5, 0, -sx * 0.5);
      const eyeGlow = sph(0.012, glow(0xffa030, 2.2), 8, 6); eyeGlow.position.set(sx * 0.1, 0.04, -R * 0.84 - 0.02);
      g.add(sock, horn, eyeGlow);
    }
    g.position.set(0, y0, A.hood.c1[2]); g.rotation.x = 0.06;
    return { bone: 'head', obj: g };
  },
  crown(A) {
    const y = hoodTop(A) - 0.045, R = hoodR(A, y) + 0.006;
    const gold = metal(0xf2c040, 0.25);
    const ring = cyl(R + 0.008, R, 0.06, gold, 32, true); ring.material.side = THREE.DoubleSide;
    const g = G(ring);
    const gems = [0xd82a3a, 0x2a8ad8, 0x3ad86a, 0xa04ad8, 0xd82a3a];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + Math.PI;
      const sp = mesh(new THREE.ConeGeometry(0.022, 0.07, 6), gold); sp.position.set(Math.sin(a) * (R + 0.004), 0.06, Math.cos(a) * (R + 0.004));
      const tip = sph(0.011, gold, 8, 6); tip.position.set(Math.sin(a) * (R + 0.004), 0.1, Math.cos(a) * (R + 0.004));
      const gem = sph(0.013, M('gem' + gems[i], { color: gems[i], roughness: 0.08, metalness: 0.1, emissive: gems[i], emissiveIntensity: 0.25 }), 8, 6);
      gem.position.set(Math.sin(a) * (R + 0.012), 0.0, Math.cos(a) * (R + 0.012)); gem.scale.z = 0.6; gem.lookAt(gem.position.clone().multiplyScalar(2));
      g.add(sp, tip, gem);
    }
    g.position.set(0, y, A.hood.c1[2]); g.rotation.set(0.12, 0, 0.1);
    return { bone: 'head', obj: g };
  },
};

const FACE = {
  goggles(A) {
    // lab goggles pushed up on the forehead of the hood, strap all the way round
    const y = A.hood.c1[1] + 0.07, R = hoodR(A, y) + 0.006;
    const strap = torus(R + 0.003, 0.012, cloth(0x2a2a2e), Math.PI * 2, 6, 40); strap.rotation.x = Math.PI / 2; strap.scale.z = 1;
    const g = G(strap);
    for (const sx of [-1, 1]) {
      const a = sx * 0.36;
      const px = Math.sin(a) * (R + 0.02), pz = -Math.cos(a) * (R + 0.02);
      const rim = cyl(0.046, 0.05, 0.04, metal(0xc89a4a, 0.3), 24); rim.rotation.x = Math.PI / 2; rim.position.set(px, 0, pz); rim.rotation.y = -a; rim.rotation.order = 'YXZ';
      const lens = cyl(0.04, 0.04, 0.006, glass(0x5ef2ff), 24); lens.rotation.order = 'YXZ'; lens.rotation.set(Math.PI / 2, -a, 0);
      lens.position.set(Math.sin(a) * (R + 0.042), 0, -Math.cos(a) * (R + 0.042));
      const shine = sph(0.008, glow(0xe6feff, 1.5), 6, 4); shine.position.set(Math.sin(a) * (R + 0.046) - 0.012, 0.016, -Math.cos(a) * (R + 0.046));
      g.add(rim, lens, shine);
    }
    const bridge = box(0.03, 0.012, 0.016, metal(0xc89a4a, 0.3), 0.004); bridge.position.set(0, 0, -R - 0.02);
    g.add(bridge);
    g.position.set(0, y, A.hood.c1[2]); g.rotation.x = 0.12;
    return { bone: 'head', obj: g };
  },
  specs(A) {
    const g = new THREE.Group();
    const rimM = metal(0x3a2a22, 0.4);
    const eyes = A.eyes;
    for (const e of eyes) {
      const rim = torus(0.062, 0.006, rimM, Math.PI * 2, 8, 32); rim.position.set(e[0], e[1], e[2] - 0.02);
      const lens = mesh(new THREE.CircleGeometry(0.06, 24), glass(0xd8f0ff)); lens.position.set(e[0], e[1], e[2] - 0.021); lens.rotation.y = Math.PI;
      g.add(rim, lens);
      const sx = Math.sign(e[0]);
      g.add(tube([[e[0] + sx * 0.06, e[1] + 0.01, e[2] - 0.02], [e[0] + sx * 0.085, e[1] + 0.016, e[2] + 0.012], [e[0] + sx * 0.092, e[1] + 0.016, e[2] + 0.05]], 0.0045, rimM, 10));
    }
    const [l, r] = eyes;
    g.add(tube([[l[0] + 0.058, l[1] + 0.012, l[2] - 0.022], [0, l[1] + 0.028, Math.min(l[2], r[2]) - 0.028], [r[0] - 0.058, r[1] + 0.012, r[2] - 0.022]], 0.005, rimM, 10));
    return { bone: 'head', obj: g };
  },
  moustache(A) {
    const p = A.lip, g = new THREE.Group();
    const m = M('stache', { color: 0x3a2418, roughness: 0.85 });
    for (const sx of [-1, 1]) g.add(tube([[0, p[1] + 0.006, p[2] - 0.012], [sx * 0.04, p[1] + 0.0, p[2] - 0.004], [sx * 0.075, p[1] - 0.008, p[2] + 0.012], [sx * 0.092, p[1] + 0.012, p[2] + 0.022], [sx * 0.08, p[1] + 0.028, p[2] + 0.018]], 0.011, m, 20));
    g.add(at(sph(0.014, m, 10, 8), 0, p[1] + 0.006, p[2] - 0.012));
    return { bone: 'head', obj: g };
  },
  visor(A) {
    const y = A.eyes[0][1] + 0.005, R = hoodR(A, y) + 0.02;
    const shield = mesh(new THREE.CylinderGeometry(R + 0.012, R + 0.022, 0.085, 32, 1, true, Math.PI * 0.62, Math.PI * 0.76), M('visor', { color: 0xff8a2a, roughness: 0.06, metalness: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, emissive: 0x5a2008, emissiveIntensity: 0.4 }));
    const frameT = torus(R + 0.02, 0.005, plastic(0x2a2a2e), Math.PI * 0.76, 6, 32); frameT.rotation.x = Math.PI / 2; frameT.rotation.z = Math.PI * 0.12 + Math.PI; frameT.position.y = 0.043;
    const frameB = frameT.clone(); frameB.position.y = -0.043;
    const g = G(shield, frameT, frameB);
    for (const sx of [-1, 1]) { const hinge = cyl(0.016, 0.016, 0.02, metal(0xb8b8c0), 12); hinge.rotation.z = Math.PI / 2; hinge.position.set(sx * (R + 0.012), 0, -0.04); g.add(hinge); }
    g.position.set(0, y, A.hood.c1[2]);
    return { bone: 'head', obj: g };
  },
  monocle(A) {
    const e = A.eyes.find((v) => v[0] > 0) ?? A.eyes[0];
    const gold = metal(0xe2b648, 0.25);
    const rim = torus(0.06, 0.0075, gold, Math.PI * 2, 8, 32); rim.position.set(e[0], e[1], e[2] - 0.024);
    const lens = mesh(new THREE.CircleGeometry(0.058, 24), glass(0xe8f8ff)); lens.position.set(e[0], e[1], e[2] - 0.025); lens.rotation.y = Math.PI;
    const chain = tube([[e[0] + 0.04, e[1] - 0.045, e[2] - 0.02], [e[0] + 0.07, e[1] - 0.11, e[2] - 0.0], [e[0] + 0.1, e[1] - 0.15, e[2] + 0.04]], 0.0028, gold, 16);
    return { bone: 'head', obj: G(rim, lens, chain) };
  },
};

const NECK = {
  scarf(A) {
    const n = A.neck;
    const wrap = torus(0.19, 0.045, knit(0x2a8a7a, 0xf2e6c8, 6, 4), Math.PI * 2, 12, 36); wrap.rotation.x = Math.PI / 2; wrap.scale.set(1.04, 1.12, 0.8);
    const tail = box(0.1, 0.24, 0.026, knit(0x2a8a7a, 0xf2e6c8, 8, 1), 0.012); tail.position.set(0.08, -0.12, -0.2); tail.rotation.set(-0.2, 0.25, 0.18);
    const fringe = new THREE.Group(); fringe.position.set(0.105, -0.245, -0.226); fringe.rotation.set(-0.2, 0.25, 0.18);
    for (let i = 0; i < 5; i++) { const f = box(0.006, 0.03, 0.006, cloth(0xf2e6c8), 0); f.position.x = -0.04 + i * 0.02; fringe.add(f); }
    const g = G(wrap, tail, fringe);
    g.position.set(0, n.p[1] - 0.005, 0.01);
    return { bone: 'chest', obj: g };
  },
  bowtie(A) {
    const n = A.neck, red = cloth(0xc8283a);
    const g = new THREE.Group();
    for (const sx of [-1, 1]) { const w = mesh(new THREE.ConeGeometry(0.04, 0.07, 4, 1), red); w.rotation.z = sx * Math.PI / 2; w.scale.set(1, 1, 0.35); w.position.x = sx * 0.036; g.add(w); }
    g.add(box(0.026, 0.03, 0.022, red, 0.008));
    g.position.set(n.p[0], n.p[1] - 0.03, n.p[2] - 0.022);
    return { bone: 'chest', obj: g };
  },
  bandana(A) {
    const n = A.neck, c = cloth(0xd8382a);
    const tri = mesh(new THREE.ConeGeometry(0.15, 0.17, 3, 1), c); tri.rotation.set(-0.15 + Math.PI, Math.PI / 6 + Math.PI, 0); tri.scale.set(1, 1, 0.16); tri.position.set(0, -0.07, -0.18);
    const wrap = torus(0.188, 0.022, c, Math.PI * 2, 8, 36); wrap.rotation.x = Math.PI / 2; wrap.scale.set(1.04, 1.1, 1);
    const dots = new THREE.Group(); for (let i = 0; i < 6; i++) { const d = sph(0.008, cloth(0xf2e6c8), 6, 4); d.position.set(-0.05 + (i % 3) * 0.05, -0.045 - Math.floor(i / 3) * 0.045, -0.198 - Math.floor(i / 3) * 0.004); dots.add(d); }
    const g = G(wrap, tri, dots);
    g.position.set(0, n.p[1] - 0.005, 0.01);
    return { bone: 'chest', obj: g };
  },
  medal(A) {
    const c = A.chest, gold = metal(0xe8b840, 0.25);
    const g = new THREE.Group();
    for (const sx of [-1, 1]) { const r = box(0.02, 0.08, 0.004, cloth(sx > 0 ? 0x2a5ad8 : 0xd8342a), 0.002); r.position.set(sx * 0.012, 0.03, 0); r.rotation.z = sx * 0.3; g.add(r); }
    const disc = cyl(0.03, 0.03, 0.008, gold, 24); disc.rotation.x = Math.PI / 2; disc.position.y = -0.02;
    const star = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.004, 5), metal(0xfff0b0, 0.2)); star.rotation.x = Math.PI / 2; star.position.set(0, -0.02, -0.006);
    g.add(disc, star);
    g.position.set(c.p[0] + c.n[0] * 0.012, c.p[1] + 0.02, c.p[2] + c.n[2] * 0.012);
    g.rotation.y = Math.atan2(c.n[0], c.n[2]) + Math.PI;
    return { bone: 'chest', obj: g };
  },
};

const BACK = {
  antenna(A) {
    const p = A.pack.top;
    const g = new THREE.Group();
    const base = cyl(0.018, 0.024, 0.03, metal(0x6a6e78), 12);
    const rod = cyl(0.004, 0.006, 0.42, metal(0xd8d8e0, 0.25), 8); rod.position.y = 0.22;
    const bulb = sph(0.016, glow(0xff3a2a, 3), 10, 8); bulb.position.y = 0.44; bulb.name = 'blink';
    const dish = mesh(new THREE.SphereGeometry(0.06, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.35), metal(0xe8e8f0, 0.3)); dish.material.side = THREE.DoubleSide;
    dish.rotation.x = -Math.PI / 2 - 0.4; dish.position.set(0.06, 0.14, 0.03);
    g.add(base, rod, bulb, dish);
    g.position.set(p[0] + 0.05, p[1] - 0.01, p[2]);
    g.rotation.z = -0.12;
    g.userData.blink = bulb;
    return { bone: 'pack', obj: g };
  },
  plush(A) {
    // a little green dino plushie riding in the top of the pack, peeking over your shoulder
    const p = A.pack.top;
    const fur = cloth(0x6ac85a), belly = cloth(0xf2e6a8);
    const body = sph(0.06, fur, 16, 12); body.scale.set(1, 1.1, 0.9);
    const tummy = sph(0.045, belly, 12, 10); tummy.position.set(0, -0.005, 0.03); tummy.scale.set(1, 1.1, 0.6);
    const head = sph(0.05, fur, 16, 12); head.position.set(0, 0.08, -0.02); head.scale.set(1, 0.9, 1.15);
    const g = G(body, tummy, head);
    for (const sx of [-1, 1]) {
      const eye = sph(0.012, M('plusheye', { color: 0x101010, roughness: 0.2 }), 8, 6); eye.position.set(sx * 0.024, 0.095, -0.065);
      const hi = sph(0.004, glow(0xffffff, 1), 4, 3); hi.position.set(sx * 0.024 - 0.004, 0.1, -0.075);
      const arm = sph(0.018, fur, 8, 6); arm.position.set(sx * 0.058, 0.02, -0.03); arm.scale.set(0.8, 1.4, 0.8);
      g.add(eye, hi, arm);
    }
    for (let i = 0; i < 3; i++) { const sp = mesh(new THREE.ConeGeometry(0.012, 0.025, 4), cloth(0xf2a83a)); sp.position.set(0, 0.13 - i * 0.04, 0.03 + i * 0.025); sp.rotation.x = -0.6 - i * 0.3; g.add(sp); }
    g.position.set(p[0] - 0.02, p[1] + 0.04, p[2] - 0.01);
    g.rotation.set(0, Math.PI, 0.15);
    g.userData.bob = g;
    return { bone: 'pack', obj: g };
  },
  jets(A) {
    const c = A.pack.c;
    const g = new THREE.Group();
    for (const sx of [-1, 1]) {
      const noz = cyl(0.026, 0.036, 0.07, metal(0x8a8e98, 0.3), 16); noz.position.set(sx * 0.07, -0.14, 0.04);
      const ring = torus(0.033, 0.005, metal(0xf07a2a, 0.35), Math.PI * 2, 6, 18); ring.rotation.x = Math.PI / 2; ring.position.set(sx * 0.07, -0.12, 0.04);
      const fin = box(0.012, 0.09, 0.07, plastic(0xf07a2a), 0.004); fin.position.set(sx * 0.12, -0.1, 0.05); fin.rotation.z = sx * 0.4;
      const flame = mesh(new THREE.ConeGeometry(0.024, 0.09, 12, 1, true), M('jetflame', { color: 0x000000, emissive: 0x5ef2ff, emissiveIntensity: 3, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }), false);
      flame.rotation.x = Math.PI; flame.position.set(sx * 0.07, -0.22, 0.04); flame.name = 'flame';
      g.add(noz, ring, fin, flame);
    }
    g.position.set(c[0], c[1], c[2]);
    g.userData.flames = g.children.filter((o) => o.name === 'flame');
    return { bone: 'pack', obj: g };
  },
  flag(A) {
    const p = A.pack.top;
    const pole = cyl(0.006, 0.006, 0.6, metal(0xd8d8e0, 0.3), 8); pole.position.y = 0.3;
    const knob = sph(0.014, metal(0xf2c040, 0.25), 8, 6); knob.position.y = 0.61;
    const geo = new THREE.PlaneGeometry(0.24, 0.14, 8, 2); geo.translate(0.12, 0, 0);
    const cv = document.createElement('canvas'); cv.width = 48; cv.height = 28;
    const x = cv.getContext('2d');
    x.fillStyle = '#f07a2a'; x.fillRect(0, 0, 48, 28); x.fillStyle = '#f2e6c8'; x.fillRect(0, 10, 48, 8);
    x.fillStyle = '#2a3440'; x.beginPath(); x.arc(24, 14, 7, 0, 7); x.fill(); x.fillStyle = '#5ef2ff'; x.fillRect(22, 8, 4, 12); x.fillRect(18, 12, 12, 4);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    const cloth2 = mesh(geo, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, side: THREE.DoubleSide })); cloth2.position.y = 0.52;
    const g = G(pole, knob, cloth2);
    g.position.set(p[0] - 0.06, p[1] - 0.02, p[2] + 0.01);
    g.rotation.z = 0.12;
    g.userData.flag = cloth2;
    return { bone: 'pack', obj: g };
  },
};
const BUILDERS = { hat: HATS, face: FACE, neck: NECK, back: BACK };

// ------------------------------------------------------------------ a lone model (wardrobe icons)
export function buildAccessoryModel(slot, id, D) {
  const fn = BUILDERS[slot]?.[id];
  const A = D?.anim?.acc;
  if (!fn || !A) return null;
  const { obj } = fn({ ...A, eyes: D.anim.eyes });
  const g = new THREE.Group(); g.add(obj);
  return g;
}

// ------------------------------------------------------------------ on a character
// builds the outfit's accessories onto a human (from buildHuman) and returns a handle that can be
// updated each frame (spinning propellers, blinking bulbs, waving flags) and disposed
export function dressAccessories(H, outfit, prev = null) {
  if (prev) for (const o of prev.parts) o.removeFromParent();
  const A = H.D.anim.acc;
  const parts = [];
  if (!A) return { parts, update() {} };
  const bp = (n) => H.D.bones[H.D.bi[n]].pos;
  const live = [];
  for (const slot of ACC_SLOTS) {
    const id = outfit?.[slot];
    const fn = id && BUILDERS[slot][id];
    if (!fn) continue;
    let made;
    try { made = fn({ ...A, eyes: H.D.anim.eyes }); } catch (e) { console.warn('accessory', slot, id, e); continue; }
    const { bone: bn, obj } = made;
    const q = bp(bn);
    obj.position.x -= q[0]; obj.position.y -= q[1]; obj.position.z -= q[2];
    obj.traverse((o) => { if (o.isMesh) o.userData.charPart = true; });
    H.bones[bn].add(obj);
    parts.push(obj);
    if (obj.userData.spin || obj.userData.blink || obj.userData.flag || obj.userData.flames) live.push(obj);
  }
  return {
    parts,
    update(dt, t, k = {}) {
      for (const o of live) {
        if (o.userData.spin) o.userData.spin.rotation.y += dt * (6 + (k.speed ?? 0) * 6);
        if (o.userData.blink) o.userData.blink.visible = Math.sin(t * 5) > -0.3;
        if (o.userData.flag) { const f = o.userData.flag; f.rotation.y = Math.sin(t * 3.1) * 0.35 + (k.speed ?? 0) * 0.1; f.rotation.x = Math.sin(t * 4.3) * 0.08; }
        if (o.userData.flames) for (const f of o.userData.flames) { const on = (k.air ?? 0) > 0 ? 1 : 0.25; f.scale.set(on, on * (0.8 + Math.sin(t * 40) * 0.2), on); }
      }
    },
  };
}
