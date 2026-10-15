// The explorers are stitched leather jelly beans: one soft bean body with
// googly eyes whose pupils roll around with real physics, a huge stretchy
// mouth (teeth, tongue and all) and little noodle limbs. The body wobbles
// like jelly: a vertex shader leans, squashes and ripples it from spring
// physics driven by how the bean moves, and the face, hat and gear ride the
// same deformation. A springy expression library makes every face goofy.
// Front is -Z, feet at y = 0.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { HATS, backpackTexture, fannyTexture, scarfTexture, pompomTexture, socksTexture } from '../gfx/clothTextures.js';
import { PixelPainter } from '../gfx/pixel.js';
import { paintSet, sstep, rgb, mix3, mul3, cell } from '../gfx/paint.js';
import { tileFbm } from '../core/rng.js';

// ------------------------------------------------------------------ outfit catalogue
// outfit.skin = leather colour, outfit.top = leather pattern, outfit.overlay =
// eyes, outfit.bottom = feet, outfit.nose = mouth (teeth) style
export const SKIN_TONES = [0xc8925a, 0x9a6438, 0x5e3a22, 0x8a3028, 0x6e7a3e, 0x34507a, 0xd0a848, 0x34302c];
export const LEATHER_NAMES = ['Saddle', 'Chestnut', 'Espresso', 'Oxblood', 'Olive', 'Denim', 'Mustard', 'Midnight'];
export const NOSE_COLORS = [0xe8614f, 0xd98a6a, 0xf08080, 0xc86a50];
export const MOUTHS = ['Grin', 'Buck teeth', 'Gap tooth', 'Fangs'];
export const OPTIONS = {
  hat: ['bucket', 'beanie', 'hardhat', 'cap', 'pith', 'goggles', 'none'],
  top: ['plain', 'patches', 'racing', 'tooled', 'spots'],
  overlay: ['googly', 'huge', 'tiny', 'wonky'],
  bottom: ['boots', 'sneakers', 'socks', 'bare'],
  pack: ['hiker', 'daypack', 'none'],
  extra: ['kerchief', 'sash', 'fanny', 'scarf', 'glasses', 'none'],
};
export const PRESETS = [
  { name: 'Doug', hat: 'bucket', top: 'patches', overlay: 'googly', bottom: 'boots', pack: 'hiker', extra: 'fanny', skin: 0, nose: 1, socks: [0xff7a2a, 0xf2efe6] },
  { name: 'Kev', hat: 'hardhat', top: 'racing', overlay: 'huge', bottom: 'sneakers', pack: 'daypack', extra: 'kerchief', skin: 3, nose: 2, socks: [0x333333, 0x666666], kerchief: 0xe8b830 },
  { name: 'Pip', hat: 'beanie', top: 'spots', overlay: 'wonky', bottom: 'socks', pack: 'hiker', extra: 'sash', skin: 5, nose: 0, socks: [0xd94040, 0xffffff], pompom: 0xd94040 },
  { name: 'Dr. Wanda', hat: 'goggles', top: 'tooled', overlay: 'tiny', bottom: 'boots', pack: 'none', extra: 'glasses', skin: 4, nose: 3, socks: [0x4a8ad0, 0xffffff] },
];
// old saves carry clothes from before the beans: map anything unknown onto the catalogue
export function normalizeOutfit(o = {}) {
  const out = { ...PRESETS[0], ...o };
  for (const [k, list] of Object.entries(OPTIONS)) if (!list.includes(out[k])) out[k] = list[0];
  out.skin = Math.max(0, Math.min(SKIN_TONES.length - 1, out.skin | 0));
  out.nose = Math.max(0, Math.min(MOUTHS.length - 1, out.nose | 0));
  return out;
}

// ------------------------------------------------------------------ the bean shape
// (radius, height) profile from the bottom tip to the top; a little belly
// bulges forward and the centre line bows like a real jelly bean.
const PROF = [[0.0001, 0.105], [0.11, 0.115], [0.19, 0.145], [0.245, 0.195], [0.275, 0.26], [0.29, 0.35], [0.292, 0.45], [0.286, 0.56], [0.272, 0.67], [0.25, 0.77], [0.22, 0.855], [0.175, 0.925], [0.115, 0.975], [0.05, 1.005], [0.0001, 1.015]];
const Y0 = 0.105, Y1 = 1.015, BH = Y1 - Y0;
const EYE_Y = 0.762, MOUTH_Y = 0.585, HAT_Y = 0.885;
const RLUT = (() => {
  const curve = new THREE.SplineCurve(PROF.map(([r, y]) => new THREE.Vector2(r, y)));
  const pts = curve.getSpacedPoints(400);
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const y = Y0 + (i / 255) * BH;
    let best = 0, bd = 9;
    for (const p of pts) { const d = Math.abs(p.y - y); if (d < bd) { bd = d; best = p.x; } }
    lut[i] = best;
  }
  return lut;
})();
function radiusAt(y) {
  const f = Math.max(0, Math.min(1, (y - Y0) / BH)) * 255;
  const i = Math.floor(f), k = f - i;
  return RLUT[Math.min(255, i)] * (1 - k) + RLUT[Math.min(255, i + 1)] * k;
}
const bow = (y) => -0.022 * Math.sin(Math.PI * Math.max(0, Math.min(1, (y - Y0) / BH)));
const belly = (phi, y) => 1 + 0.055 * Math.max(0, Math.cos(phi)) ** 2 * Math.exp(-(((y - 0.38) / 0.17) ** 2));
// rest-pose surface point at angle phi (0 = front / -Z, +PI/2 = +X) and height y
export function beanSurface(phi, y, push = 0, out = new THREE.Vector3()) {
  const r = radiusAt(y) * belly(phi, y) + push;
  return out.set(Math.sin(phi) * r, y, bow(y) - Math.cos(phi) * r);
}
const _s0 = new THREE.Vector3(), _s1 = new THREE.Vector3(), _s2 = new THREE.Vector3(), _s3 = new THREE.Vector3();
function surfaceNormal(phi, y, out = new THREE.Vector3()) {
  beanSurface(phi + 0.01, y, 0, _s0); beanSurface(phi - 0.01, y, 0, _s1);
  beanSurface(phi, y + 0.005, 0, _s2); beanSurface(phi, y - 0.005, 0, _s3);
  const du = _s0.sub(_s1), dv = _s2.sub(_s3);
  return out.crossVectors(dv, du).normalize();
}
function beanGeometry() {
  const RINGS = 52, SEG = 44;
  const pos = [], nrm = [], uv = [], idx = [];
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= RINGS; i++) {
    const t = i / RINGS;
    // more rings near the round ends
    const y = Y0 + (0.5 - 0.5 * Math.cos(t * Math.PI)) * BH;
    for (let k = 0; k <= SEG; k++) {
      const phi = (k / SEG) * Math.PI * 2;
      beanSurface(phi, y, 0, p);
      if (i === 0) n.set(0, -1, 0); else if (i === RINGS) n.set(0, 1, 0); else surfaceNormal(phi, y, n);
      pos.push(p.x, p.y, p.z); nrm.push(n.x, n.y, n.z); uv.push(k / SEG, (y - Y0) / BH);
    }
  }
  for (let i = 0; i < RINGS; i++) for (let k = 0; k < SEG; k++) { const a = i * (SEG + 1) + k, b = a + SEG + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere(); g.boundingSphere.radius += 0.2;
  return g;
}
let _beanGeo = null;
const beanGeo = () => (_beanGeo ??= beanGeometry());

// ------------------------------------------------------------------ leather
// u runs around the bean (0 = front centre, seams at the sides), v up.
const texCache = new Map();
function leatherSet(color, pattern) {
  const key = color + ':' + pattern;
  if (texCache.has(key)) return texCache.get(key);
  const base = rgb(color), thread = rgb(0xeee2c6);
  const lum = 0.3 * base[0] + 0.59 * base[1] + 0.11 * base[2];
  const accent = lum > 0.45 ? mul3(base, 0.55) : mix3(base, [0.95, 0.9, 0.8], 0.55);
  const W = 512, H = 256;
  const set = paintSet(W, H, (u, v) => {
    const n = tileFbm(u * 8, v * 4, 8, 4, 11), n2 = tileFbm(u * 32, v * 16, 32, 2, 13);
    const gr = cell(u, v, 150, 75, 21);
    const pebble = 1 - sstep(0.2, 0.75, gr.f1);
    let c = mul3(base, 0.84 + (n - 0.5) * 0.32 + (n2 - 0.5) * 0.08);
    c = mul3(c, 0.95 + pebble * 0.07);
    let h = pebble * 0.22 + n * 0.3, r = 0.6 - pebble * 0.06;
    // creases near the bottom where the bean squashes when it lands
    if (v < 0.3) { const cr = 1 - sstep(0, 0.12, Math.abs(Math.sin(v * 60 + Math.sin(u * 37.7) * 1.4))); const k = cr * (1 - v / 0.3) * 0.6; c = mul3(c, 1 - k * 0.25); h -= k * 0.25; }
    // decoration
    const px = u * W, py = v * H;
    const stitchBox = (cx, cy, hw, hh) => {
      // a stitched rectangle (in pixels) around a patch / inlay
      const dx = Math.abs(((px - cx + W * 1.5) % W) - W / 2), dy = Math.abs(py - cy);
      const e = Math.max(dx - hw, dy - hh);
      return { inside: e < 0, edge: e, along: dx > hw - 3 ? py : px };
    };
    let inlay = 0, stitch = 0;
    if (pattern === 'patches') {
      for (const [cx, cy, hw, hh, tint] of [[40, 70, 34, 26, [0.95, 0.85, 0.62]], [300, 160, 28, 34, [0.55, 0.45, 0.35]], [430, 60, 22, 20, [0.85, 0.35, 0.3]]]) {
        const b = stitchBox(cx, cy, hw, hh);
        if (b.inside) { inlay = 1; c = mix3(mul3(c, 0.92), mul3(tint, 0.85 + n * 0.25), 0.6); h += 0.12; }
        if (Math.abs(b.edge + 4) < 1.4 && Math.floor(b.along / 4) % 2 === 0) stitch = 1;
      }
    } else if (pattern === 'racing') {
      const du = Math.min(px, W - px);
      for (const [a, b] of [[10, 24], [-24, -10]]) {
        void b;
        const d = Math.abs(((px - (a < 0 ? W + a + 7 : a + 7)) + W * 1.5) % W - W / 2);
        if (d < 7) { inlay = 1; c = mix3(c, accent, 0.85); h += 0.08; }
        if (Math.abs(d - 8.5) < 1.2 && Math.floor(py / 4) % 2 === 0) stitch = 1;
      }
      void du;
    } else if (pattern === 'tooled') {
      const cc = cell(u, v, 14, 7, 31);
      const ring = 1 - sstep(0.05, 0.14, Math.abs(Math.sin(cc.f1 * 16)));
      if (cc.f1 < 0.42) { c = mul3(c, 1 - ring * 0.28); h -= ring * 0.35; }
    } else if (pattern === 'spots') {
      const cc = cell(u, v, 12, 6, 41);
      if (cc.f1 < 0.3 && cc.id > 0.35) { inlay = 1; c = mix3(c, accent, 0.8 * sstep(0.3, 0.24, cc.f1)); h += 0.06; }
    }
    // the two side seams: a pinched groove with saddle stitches either side
    for (const su of [0.25, 0.75]) {
      const d = Math.abs(u - su) * W;
      if (d < 12) {
        const groove = 1 - sstep(0, 3, d);
        h -= groove * 0.55; c = mul3(c, 1 - groove * 0.5);
        c = mul3(c, 0.86 + 0.14 * sstep(2, 12, d)); // burnished near the seam
        for (const side of [-1, 1]) {
          const sd = (u - su) * W - side * 6;
          const m = (((py + sd * 1.2) % 7) + 7) % 7;
          if (Math.abs(sd) < 1.5 && m < 4.2) stitch = 1;
        }
      }
    }
    if (stitch) { c = mul3(thread, 0.92 + n2 * 0.1); h += 0.3; r = 0.85; }
    void inlay;
    // scuffs
    if (n2 > 0.72) c = mix3(c, [0.85, 0.8, 0.72], (n2 - 0.72) * 0.6);
    return { c, h, r };
  }, { normal: 2.4, rough: 0.6 });
  texCache.set(key, set);
  return set;
}

// The jelly hook: lean (top shifts more than the bottom), squash and stretch
// around the base, and travelling ripples after a bump. Bean-local space.
const JELLY = {
  uniforms: null,
  vertex: {
    head: 'uniform vec2 uLean;\nuniform float uSquash;\nuniform vec3 uJig;',
    main: /* glsl */ `
    {
      float hk = clamp( ( transformed.y - ${Y0.toFixed(3)} ) / ${BH.toFixed(3)}, 0.0, 1.0 );
      float lk = hk * hk * ( 3.0 - 2.0 * hk );
      float sy = 1.0 + uSquash;
      transformed.y = ${Y0.toFixed(3)} + ( transformed.y - ${Y0.toFixed(3)} ) * sy;
      transformed.xz *= mix( 1.0, inversesqrt( max( 0.35, sy ) ), smoothstep( 0.0, 0.7, hk ) );
      transformed.xz *= 1.0 + uJig.x * sin( hk * 11.0 - uJig.y ) * hk + uJig.z * sin( hk * 7.0 + atan( transformed.x, transformed.z ) * 3.0 - uJig.y * 1.3 ) * hk;
      transformed.x += uLean.x * lk;
      transformed.z += uLean.y * lk;
    }`,
  },
};
// the same deformation on the CPU, for everything stuck onto the bean
function jellyPoint(p, J, out) {
  const hk = Math.max(0, Math.min(1, (p.y - Y0) / BH));
  const lk = hk * hk * (3 - 2 * hk);
  const sy = 1 + J.squash;
  let x = p.x, z = p.z;
  const y = Y0 + (p.y - Y0) * sy;
  const sxz = 1 + (1 / Math.sqrt(Math.max(0.35, sy)) - 1) * sstep(0, 0.7, hk);
  x *= sxz; z *= sxz;
  const rip = 1 + J.jig.x * Math.sin(hk * 11 - J.jig.y) * hk + J.jig.z * Math.sin(hk * 7 + Math.atan2(p.x, p.z) * 3 - J.jig.y * 1.3) * hk;
  x *= rip; z *= rip;
  return out.set(x + J.lean.x * lk, y, z + J.lean.y * lk);
}
// slope of the lean at a height (how much stuck-on parts tilt)
function jellyTilt(y, J) {
  const hk = Math.max(0, Math.min(1, (y - Y0) / BH));
  const d = (6 * hk * (1 - hk)) / BH;
  return { x: J.lean.y * d, z: -J.lean.x * d };
}

// ------------------------------------------------------------------ materials
const matCache = new Map();
function cached(key, make) { if (!matCache.has(key)) matCache.set(key, make()); return matCache.get(key); }
function fabricMat(key, painterFn, opt = {}) {
  return cached('fab:' + key + JSON.stringify(opt), () => {
    const p = painterFn ? painterFn() : null;
    const map = p ? p.texture({ wrap: THREE.RepeatWrapping, anisotropy: 4 }) : null;
    const m = new THREE.MeshPhysicalMaterial({ color: opt.color ?? 0xffffff, map, roughness: opt.roughness ?? 0.85, sheen: opt.sheen ?? 0.6, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x555555), clearcoat: opt.clearcoat ?? 0, clearcoatRoughness: 0.3, side: opt.side ?? THREE.FrontSide });
    if (p && opt.bump !== false) { m.normalMap = p.normalTexture(opt.bump ?? 1.4); m.normalScale.set(0.5, 0.5); }
    return patchMaterial(m, {});
  });
}
const plain = (color, opt = {}) => cached('plain:' + color + JSON.stringify(opt), () => patchMaterial(new THREE.MeshStandardMaterial({ color, roughness: opt.roughness ?? 0.6, metalness: opt.metalness ?? 0, emissive: opt.emissive ?? 0x000000, transparent: !!opt.transparent, opacity: opt.opacity ?? 1, depthWrite: opt.depthWrite ?? true, side: opt.side ?? THREE.FrontSide }), {}));
const EYE_WHITE = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0xfbfaf4, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }), {});
const PUPIL = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.25 }), {});
const DOME = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }), {});
const GLINT = patchMaterial(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }), {});
const MOUTH_IN = patchMaterial(new THREE.MeshStandardMaterial({ color: 0x2a0a0e, roughness: 0.9, side: THREE.DoubleSide }), {});
const TOOTH = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0xf6f1e2, roughness: 0.3, clearcoat: 0.5, side: THREE.DoubleSide }), {});
const TONGUE = patchMaterial(new THREE.MeshPhysicalMaterial({ color: 0xe0606e, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 }), {});

const mesh = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };
function lathe(profile, segs = 28, phiStart = Math.PI, phiLength = Math.PI * 2) { const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs, phiStart, phiLength); g.computeVertexNormals(); return g; }

// ------------------------------------------------------------------ eyelids
// A lid is a curtain on a dome just in front of the eye: the upper one covers
// everything above a (slanted) cut line, the lower one everything below.
const LNX = 12, LNY = 4;
function lidGeometry() {
  const g = new THREE.BufferGeometry();
  const n = (LNX + 1) * (LNY + 1);
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(n * 3), 3));
  const idx = [];
  for (let i = 0; i < LNX; i++) for (let j = 0; j < LNY; j++) { const a = i * (LNY + 1) + j, b = a + LNY + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  g.setIndex(idx);
  g.userData.key = '';
  return g;
}
function shapeLid(m, r, cover, slope, upper) {
  const g = m.geometry;
  const key = cover.toFixed(3) + ':' + slope.toFixed(3);
  if (g.userData.key === key) return;
  g.userData.key = key;
  m.visible = cover > 0.02 || (upper && Math.abs(slope) > 0.12);
  if (!m.visible) return;
  const R = r * 1.08, pos = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i <= LNX; i++) {
    const x = -R + (2 * R * i) / LNX;
    const yt = Math.sqrt(Math.max(0, R * R - x * x));
    // where the lid edge crosses this column
    const cut = (upper ? R * (1 - 2 * cover) : -R * (1 - 2 * cover)) + slope * x * (upper ? 1 : -1);
    const y0 = upper ? Math.min(yt, Math.max(-yt, cut)) : -yt, y1 = upper ? yt : Math.max(-yt, Math.min(yt, cut));
    for (let j = 0; j <= LNY; j++) {
      const y = y0 + ((y1 - y0) * j) / LNY;
      const zz = Math.sqrt(Math.max(0, R * R - x * x - y * y));
      const k = (i * (LNY + 1) + j) * 3;
      pos.array[k] = x; pos.array[k + 1] = y; pos.array[k + 2] = zz * 0.6 + r * 0.035;
      const l = Math.hypot(x, y, zz / 0.6) || 1;
      nrm.array[k] = x / l; nrm.array[k + 1] = y / l; nrm.array[k + 2] = zz / 0.6 / l;
    }
  }
  pos.needsUpdate = true; nrm.needsUpdate = true;
}

// ------------------------------------------------------------------ expressions
// lid: upper/lower lid closure per eye [left, right] (0 open .. 1 shut), tilt
// (+ angry, - sad), ps pupil size, bias how the pupils are pulled (k > 0 =
// they try to look ahead, 'cross' / 'spin' / 'up'), brow raise/angle per side,
// mouth: W half-width, O open, S smile, A smirk, P pucker, T teeth, G tongue.
const E = (o) => { const e = { lu: [0.12, 0.12], ll: [0, 0], tilt: 0, ps: 1, bias: 'look', bk: 2.5, br: [0, 0], ba: [0, 0], W: 0.11, O: 0.012, S: 0.35, A: 0, P: 0, T: 0.15, G: 0, shake: 0, fx: null, ...o }; e.W *= 1.3; e.O *= 1.45; return e; };
export const EXPRESSIONS = {
  neutral: E({}),
  happy: E({ ll: [0.32, 0.32], br: [0.25, 0.25], W: 0.15, O: 0.05, S: 1, T: 0.7 }),
  grin: E({ ll: [0.25, 0.25], br: [0.35, 0.35], W: 0.19, O: 0.045, S: 1.1, T: 1 }),
  laugh: E({ lu: [0.5, 0.5], ll: [0.5, 0.5], br: [0.4, 0.4], W: 0.16, O: 0.12, S: 0.85, T: 0.9, shake: 0.4 }),
  sad: E({ lu: [0.38, 0.38], tilt: -0.55, br: [-0.1, -0.1], ba: [-0.8, -0.8], W: 0.09, O: 0.012, S: -0.9, bias: 'down', bk: 3 }),
  cry: E({ lu: [0.5, 0.5], ll: [0.25, 0.25], tilt: -0.6, ba: [-0.9, -0.9], W: 0.12, O: 0.07, S: -0.8, T: 0.4, fx: 'tears', shake: 0.25 }),
  angry: E({ lu: [0.42, 0.42], tilt: 0.65, br: [-0.4, -0.4], ba: [1, 1], W: 0.12, O: 0.035, S: -0.55, T: 1, bk: 6 }),
  rage: E({ lu: [0.45, 0.45], tilt: 0.75, br: [-0.5, -0.5], ba: [1.2, 1.2], W: 0.16, O: 0.1, S: -0.6, T: 1, shake: 0.7, fx: 'steam', bk: 8 }),
  scared: E({ lu: [0, 0], ll: [0, 0], ps: 0.5, br: [0.8, 0.8], ba: [-0.6, -0.6], W: 0.1, O: 0.07, S: -0.45, T: 0.5, shake: 0.5, fx: 'sweat', bias: 'none' }),
  scream: E({ lu: [0, 0], ps: 0.42, br: [1, 1], ba: [-0.7, -0.7], W: 0.13, O: 0.17, S: -0.25, P: 0.2, T: 0.7, shake: 0.6, bias: 'none' }),
  surprised: E({ lu: [0, 0], ps: 0.75, br: [1, 1], W: 0.07, O: 0.085, P: 0.75 }),
  shock: E({ lu: [0, 0], ps: 0.45, br: [1.1, 1.1], W: 0.11, O: 0.19, S: -0.1, T: 0.4, G: 0.2 }),
  derp: E({ lu: [0.1, 0.45], br: [0.4, -0.1], bias: 'cross', bk: 7, W: 0.12, O: 0.06, S: 0.45, A: 0.35, T: 0.6, G: 1 }),
  smug: E({ lu: [0.5, 0.55], ll: [0.1, 0.1], tilt: 0.2, br: [0.35, -0.05], ba: [0.3, 0.1], W: 0.13, O: 0.006, S: 0.7, A: 0.9, T: 0 }),
  sleepy: E({ lu: [0.72, 0.72], br: [-0.1, -0.1], W: 0.08, O: 0.02, S: 0, bias: 'down' }),
  sleep: E({ lu: [1, 1], ll: [1, 1], W: 0.06, O: 0.03, P: 0.5, S: 0, fx: 'zzz' }),
  ko: E({ lu: [0.35, 0.35], bias: 'spin', bk: 8, W: 0.12, O: 0.06, S: -0.3, G: 0.8, T: 0.3, fx: 'stars' }),
  hurt: E({ lu: [0.78, 0.78], ll: [0.55, 0.55], br: [-0.3, -0.3], ba: [0.5, 0.5], W: 0.15, O: 0.03, S: -0.6, T: 1, shake: 0.5 }),
  chomp: E({ ll: [0.3, 0.3], W: 0.12, O: 0.05, S: 0.4, T: 0.8, chew: 1 }),
  disgust: E({ lu: [0.5, 0.35], ll: [0.3, 0.2], br: [-0.2, 0.2], ba: [0.4, 0.4], W: 0.11, O: 0.035, S: -0.7, A: -0.45, T: 0.6, G: 0.85 }),
  love: E({ ll: [0.3, 0.3], ps: 1.3, br: [0.4, 0.4], W: 0.12, O: 0.04, S: 1, T: 0.5, fx: 'hearts' }),
  suspicious: E({ lu: [0.62, 0.3], br: [-0.25, 0.3], ba: [0.6, 0.2], W: 0.08, O: 0.006, S: -0.25, A: -0.55, T: 0, bk: 6 }),
  whistle: E({ lu: [0.2, 0.2], br: [0.3, 0.3], W: 0.035, O: 0.035, P: 1, S: 0, T: 0 }),
  puff: E({ lu: [0.3, 0.3], br: [0.3, 0.3], W: 0.05, O: 0.0, P: 0.6, S: 0, T: 0, cheeks: 1 }),
  dizzy: E({ lu: [0.3, 0.3], bias: 'spin', bk: 5, W: 0.11, O: 0.05, S: 0.2, A: 0.5, T: 0.5, G: 0.4, fx: 'stars' }),
  cold: E({ lu: [0.3, 0.3], br: [-0.2, -0.2], ba: [-0.4, -0.4], W: 0.1, O: 0.02, S: -0.2, T: 1, chatter: 1, shake: 0.6 }),
  proud: E({ lu: [0.45, 0.45], ll: [0.2, 0.2], br: [0.3, 0.3], W: 0.14, O: 0.01, S: 0.95, T: 0.3, chin: 0.02 }),
  focus: E({ lu: [0.3, 0.3], tilt: 0.25, br: [-0.1, -0.1], ba: [0.4, 0.4], W: 0.07, O: 0.006, S: -0.1, A: 0.3, G: 0.35, bk: 8 }),
};
const ALIAS = { neutral: 'neutral', happy: 'happy', scared: 'scared', angry: 'angry', hurt: 'hurt', sleepy: 'sleepy', surprised: 'surprised', ko: 'ko' };
const PARAMS = ['tilt', 'ps', 'bk', 'W', 'O', 'S', 'A', 'P', 'T', 'G', 'shake'];

// ------------------------------------------------------------------ the character
export class Character {
  constructor(outfit = PRESETS[0], opt = {}) {
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.outfit = normalizeOutfit(outfit);
    this.isLocal = !!opt.local;
    this.t = Math.random() * 10;
    this.phase = 0;
    // jelly springs
    this.J = { lean: new THREE.Vector2(), squash: 0, jig: new THREE.Vector3() };
    this.leanV = new THREE.Vector2(); this.squashV = 0; this.jigA = 0; this.jigB = 0;
    this.prevPos = null; this.vel = new THREE.Vector3(); this.acc = new THREE.Vector3();
    this.prevYaw = 0; this.prevGrounded = true; this.airTime = 0;
    this.blinkT = 2 + Math.random() * 3; this.blink = 0;
    this.fidget = { name: null, t: 0, next: 6 + Math.random() * 8 };
    this.expr = 'neutral';
    this.face = {}; // springy expression state
    this.faceV = {};
    this.talk = 0;
    this.pose = {};
    this.fxT = 0;
    this.build();
  }

  dispose() { this.root.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }

  build() {
    const o = this.outfit;
    const R = this.root;
    while (R.children.length) R.remove(R.children[0]);
    const color = SKIN_TONES[o.skin ?? 0];
    const L = leatherSet(color, o.top);
    // the bean body: one soft leather mesh with the jelly hook
    this.uni = { uLean: { value: new THREE.Vector2() }, uSquash: { value: 0 }, uJig: { value: new THREE.Vector3() } };
    const bodyMat = new THREE.MeshPhysicalMaterial({ map: L.map, normalMap: L.normalMap, roughnessMap: L.roughnessMap, roughness: 1, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x3a3028), clearcoat: 0.25, clearcoatRoughness: 0.45 });
    bodyMat.normalScale.set(0.8, 0.8);
    patchMaterial(bodyMat, { ...JELLY, uniforms: this.uni, wet: true });
    this.bodyMat = bodyMat;
    // limbs and lids share the leather without the jelly hook
    this.leather = cached('limb:' + color + o.top, () => { const m = new THREE.MeshPhysicalMaterial({ map: L.map, normalMap: L.normalMap, roughnessMap: L.roughnessMap, roughness: 1, sheen: 0.35, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x3a3028), clearcoat: 0.25, clearcoatRoughness: 0.45 }); m.normalScale.set(0.8, 0.8); return patchMaterial(m, { wet: true }); });
    this.leatherDark = cached('limbD:' + color, () => patchMaterial(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.55, sheen: 0.3, clearcoat: 0.3, clearcoatRoughness: 0.4 }), {}));
    this.leatherColor = color;
    const body = new THREE.Group(); R.add(body); this.body = body;
    const bean = mesh(beanGeo(), bodyMat); bean.userData.shared = true; bean.frustumCulled = false;
    body.add(bean);
    this.bean = bean;
    this.headMesh = bean; // the whole bean is the head (first person hides it)
    // things stuck on the bean: { obj, base (rest point), phi, y } follow the jelly
    this.stuck = [];
    this.buildFace(o);
    this.buildLimbs(o);
    this.buildGear(o);
    this.root.traverse((m) => { if (m.isMesh) m.userData.charPart = true; });
    this.heldGroup = null;
  }
  // a closed tube hugging the bean at height y (belts, scarves, kerchief rolls)
  hugTube(y, r, push, mat) {
    const pts = [];
    for (let k = 0; k < 40; k++) pts.push(beanSurface((k / 40) * Math.PI * 2, y, push + r * 0.8, new THREE.Vector3()).sub(_hb.set(0, y, 0)));
    const m = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 60, r, 6, true), mat);
    return this.stick(m, new THREE.Vector3(0, y, 0), { tilt: 0.5 });
  }
  stick(obj, base, opt = {}) { obj.position.copy(base); this.body.add(obj); this.stuck.push({ obj, base: base.clone(), rot: obj.rotation.clone(), quat: obj.quaternion.clone(), tilt: opt.tilt ?? 1, face: !!opt.face }); return obj; }

  // ---------------------------------------------------------------- face
  buildFace(o) {
    // googly eyes
    const eyeR = { googly: [0.074, 0.074], huge: [0.094, 0.094], tiny: [0.052, 0.052], wonky: [0.058, 0.088] }[o.overlay] ?? [0.074, 0.074];
    this.eyes = [];
    for (const [i, sx] of [[0, -1], [1, 1]]) {
      const r = eyeR[i];
      const phi = sx * Math.asin(Math.min(0.9, (r + 0.014) / 0.245));
      const y = EYE_Y - (r - 0.074) * 0.6 + (o.overlay === 'wonky' ? (i ? 0.012 : -0.01) : 0);
      const g = this.makeEye(r);
      this.orientOnBean(g, phi, y, r * 0.18);
      this.stick(g, g.position, { face: true });
      g.userData.phi = phi; g.userData.y = y;
      this.eyes.push(g.userData.eye);
    }
    // brows: stitched leather strips
    this.brows = [];
    for (const [i, sx] of [[0, -1], [1, 1]]) {
      const r = eyeR[i];
      const b = mesh(new RoundedBoxGeometry(r * 1.5, 0.022, 0.02, 2, 0.009), this.leatherDark, false);
      const piv = new THREE.Group(); piv.add(b);
      const phi = sx * Math.asin(Math.min(0.9, (r + 0.012) / 0.24));
      this.orientOnBean(piv, phi, EYE_Y - (r - 0.074) * 0.6 + r + 0.028, 0.012);
      this.stick(piv, piv.position, { face: true });
      piv.userData.base = piv.position.clone(); piv.userData.side = sx; piv.userData.bar = b;
      this.brows.push(piv);
    }
    // the mouth: rebuilt every frame from the expression
    this.mouthStyle = o.nose ?? 0;
    this.buildMouth();
  }
  // place an object on the bean surface facing outwards (+Z of the object = surface normal)
  orientOnBean(obj, phi, y, push = 0) {
    const n = surfaceNormal(phi, y, new THREE.Vector3());
    const p = beanSurface(phi, y, push, new THREE.Vector3());
    const up = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(up, n).normalize();
    const yy = new THREE.Vector3().crossVectors(n, x).normalize();
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, yy, n));
    obj.position.copy(p);
    return obj;
  }
  makeEye(r) {
    const g = new THREE.Group();
    // the white backing disc, slightly domed
    const white = mesh(new THREE.SphereGeometry(r, 26, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(1, 1, 0.22), EYE_WHITE, false);
    g.add(white);
    const rim = mesh(new THREE.TorusGeometry(r * 1.0, r * 0.07, 6, 28), plain(0xdedad0, { roughness: 0.25 }), false);
    g.add(rim);
    // the loose pupil
    const pr = r * 0.5;
    const pupil = mesh(new THREE.CylinderGeometry(pr, pr, 0.006, 22).rotateX(Math.PI / 2), PUPIL, false);
    pupil.position.z = r * 0.2;
    g.add(pupil);
    // clear plastic dome + a glint
    const dome = mesh(new THREE.SphereGeometry(r * 1.04, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.5).rotateX(Math.PI / 2).scale(1, 1, 0.5), DOME, false);
    dome.renderOrder = 3;
    g.add(dome);
    const gl = mesh(new THREE.CircleGeometry(r * 0.2, 12), GLINT, false); gl.position.set(-r * 0.38, r * 0.42, r * 0.5); gl.scale.set(1, 0.7, 1); g.add(gl);
    // leather lids that drop over the eye
    // (curtains over the dome, rebuilt when they move, so they can slant for moods)
    const lidMat = cached('lid:' + this.leatherColor + this.outfit.top, () => { const m = this.leather.clone(); m.side = THREE.DoubleSide; return patchMaterial(m, { wet: true }); });
    const up = mesh(lidGeometry(), lidMat, false); g.add(up);
    const lo = mesh(lidGeometry(), lidMat, false); g.add(lo);
    up.frustumCulled = lo.frustumCulled = false;
    g.userData.eye = { g, r, pr, pupil, up, lo, p: new THREE.Vector2(0, -r * 0.2), v: new THREE.Vector2(), last: null, spin: Math.random() * 6 };
    return g;
  }
  buildMouth() {
    const m = new THREE.Group();
    this.orientOnBean(m, 0, MOUTH_Y, 0.004);
    this.stick(m, m.position, { face: true });
    this.mouthG = m;
    this.mouthR = radiusAt(MOUTH_Y) * belly(0, MOUTH_Y);
    const N = 24;
    const cavity = new THREE.BufferGeometry();
    cavity.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((N + 1) * 2 * 3), 3));
    const ci = []; for (let i = 0; i < N; i++) { const a = i * 2, b = a + 2; ci.push(a, b, a + 1, a + 1, b, b + 1); }
    cavity.setIndex(ci);
    this.cavity = mesh(cavity, MOUTH_IN, false); m.add(this.cavity);
    // lips: a ribbon around the contour
    const lips = new THREE.BufferGeometry();
    lips.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((2 * N + 2) * 2 * 3), 3));
    const li = []; const LN = 2 * N + 1; for (let i = 0; i < LN; i++) { const a = i * 2, b = a + 2; li.push(a, a + 1, b, a + 1, b + 1, b); }
    lips.setIndex(li);
    this.lips = mesh(lips, cached('lip:' + this.leatherColor, () => patchMaterial(new THREE.MeshPhysicalMaterial({ color: new THREE.Color(this.leatherColor).multiplyScalar(0.5), roughness: 0.5, clearcoat: 0.4, side: THREE.DoubleSide }), {})), false); m.add(this.lips);
    // teeth: a strip of tooth quads under the upper lip
    const NT = 12;
    const teeth = new THREE.BufferGeometry();
    teeth.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(NT * 4 * 3), 3));
    const ti = []; for (let i = 0; i < NT; i++) { const a = i * 4; ti.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    teeth.setIndex(ti);
    this.teeth = mesh(teeth, TOOTH, false); m.add(this.teeth);
    this.NT = NT; this.NM = N;
    const tongue = mesh(new THREE.SphereGeometry(1, 16, 10), TONGUE, false); m.add(tongue); this.tongue = tongue;
    for (const x of [this.cavity, this.lips, this.teeth]) {
      x.frustumCulled = false;
      const n = x.geometry.attributes.position.count, nr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) nr[i * 3 + 2] = 1;
      x.geometry.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
    }
  }
  // write the mouth geometry for the current face
  shapeMouth(F, talk, t) {
    const N = this.NM, Rm = this.mouthR;
    const W = Math.max(0.02, F.W * (1 - F.P * 0.6) * (1 + talk * 0.08));
    const chatter = (F.chatter ?? 0) > 0.05 ? Math.abs(Math.sin(t * 38)) * 0.02 * F.chatter : 0;
    const chew = (F.chew ?? 0) > 0.05 ? (0.5 + 0.5 * Math.sin(t * 13)) * 0.05 * F.chew : 0;
    const O = Math.max(0, F.O + talk * 0.07 * (0.6 + 0.4 * Math.sin(t * 29) * Math.sin(t * 17)) + chatter + chew);
    const S = F.S, A = F.A, P = F.P;
    const wob = Math.sin(t * 9) * 0.004 * (1 + F.shake * 2);
    const zOf = (x) => -(Rm - Math.sqrt(Math.max(0, Rm * Rm - x * x)));
    const up = [], lo = [];
    for (let i = 0; i <= N; i++) {
      const u = (i / N) * 2 - 1; // -1 .. 1 across
      const x = u * W;
      const ends = u * u;
      const corner = (S * 0.035 + A * u * 0.03) * ends;
      // pucker rounds the mouth into an O
      const roundU = Math.sqrt(Math.max(0, 1 - ends));
      const openU = O * (P > 0.01 ? (1 - P) * Math.pow(1 - ends, 0.7) + P * roundU : Math.pow(1 - ends, 0.75));
      const yu = corner + openU * 0.28 + wob * u + S * 0.004 * (1 - ends);
      const yl = corner - openU * 0.95 - Math.max(0, -S) * 0.008 * (1 - ends) - 0.002;
      up.push(x, yu); lo.push(x, Math.min(yl, yu - 0.003));
    }
    // cavity strip
    const cp = this.cavity.geometry.attributes.position;
    for (let i = 0; i <= N; i++) { const x = up[i * 2]; cp.setXYZ(i * 2, x, up[i * 2 + 1], zOf(x) - 0.002); cp.setXYZ(i * 2 + 1, x, lo[i * 2 + 1], zOf(x) - 0.002); }
    cp.needsUpdate = true; this.cavity.geometry.computeBoundingSphere();
    // lips ribbon: around the top then back along the bottom
    const lp = this.lips.geometry.attributes.position;
    const ring = [];
    for (let i = 0; i <= N; i++) ring.push([up[i * 2], up[i * 2 + 1], 1]);
    for (let i = N; i >= 0; i--) ring.push([lo[i * 2], lo[i * 2 + 1], -1]);
    const th = 0.011 + O * 0.02;
    for (let k = 0; k < ring.length; k++) {
      const [x, y, s] = ring[k];
      const [xa, ya] = ring[Math.max(0, k - 1)], [xb, yb] = ring[Math.min(ring.length - 1, k + 1)];
      let nx = -(yb - ya), ny = xb - xa; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
      // keep the ribbon outside the opening
      if (ny * s < 0) { nx = -nx; ny = -ny; }
      lp.setXYZ(k * 2, x - nx * 0.002, y - ny * 0.002, zOf(x) + 0.001);
      lp.setXYZ(k * 2 + 1, x + nx * th, y + ny * th, zOf(x + nx * th) + 0.004);
    }
    lp.needsUpdate = true; this.lips.geometry.computeBoundingSphere();
    // teeth along the upper lip, height limited by how open the mouth is
    const tp = this.teeth.geometry.attributes.position, NT = this.NT;
    const style = this.mouthStyle;
    const gapH = Math.max(0, O * 1.2 - 0.004);
    for (let i = 0; i < NT; i++) {
      const u0 = (i / NT) * 1.6 - 0.8, u1 = ((i + 1) / NT) * 1.6 - 0.8;
      const um = (u0 + u1) / 2;
      let hgt = Math.min(0.026, gapH * 0.55) * F.T;
      const front = Math.abs(um) < 0.15;
      if (style === 1) hgt *= front ? 1.9 : 0.25; // buck teeth
      if (style === 2 && Math.abs(um - 0.07) < 0.07) hgt = 0; // gap
      if (style === 3 && Math.abs(Math.abs(um) - 0.45) < 0.08) hgt *= 2.2; // fangs
      const yAt = (u) => { const ii = Math.round((u * 0.5 + 0.5) * N); return up[Math.max(0, Math.min(N, ii)) * 2 + 1]; };
      const x0 = u0 * W + 0.0015, x1 = u1 * W - 0.0015;
      const y0 = yAt(u0) - 0.002, y1 = yAt(u1) - 0.002;
      const tip = style === 3 && hgt > 0 && Math.abs(Math.abs(um) - 0.45) < 0.08 ? 0.5 : 1;
      tp.setXYZ(i * 4, x0, y0, zOf(x0) - 0.001);
      tp.setXYZ(i * 4 + 1, x1, y1, zOf(x1) - 0.001);
      tp.setXYZ(i * 4 + 2, x0 + (x1 - x0) * (1 - tip) * 0.5, y0 - hgt, zOf(x0) - 0.001);
      tp.setXYZ(i * 4 + 3, x1 - (x1 - x0) * (1 - tip) * 0.5, y1 - hgt, zOf(x1) - 0.001);
    }
    tp.needsUpdate = true; this.teeth.geometry.computeBoundingSphere();
    // tongue: rests at the bottom of the mouth, flops out when it is out
    const yb = lo[N + 1] ?? lo[(N >> 1) * 2 + 1];
    const tg = F.G;
    this.tongue.visible = O > 0.035 || tg > 0.3;
    this.tongue.scale.set(Math.min(W * 0.55, 0.06) * (1 + tg * 0.2), 0.02 + tg * 0.035, 0.03 + tg * 0.02);
    this.tongue.position.set(F.A * W * 0.3, yb + 0.012 - tg * 0.045, -0.012 + tg * 0.03);
    this.tongue.rotation.set(tg * 0.6, 0, Math.sin(t * 3) * 0.15 * tg);
  }

  // ---------------------------------------------------------------- limbs
  buildLimbs(o) {
    const lm = this.leather;
    this.arms = [];
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group();
      const base = beanSurface(sx * Math.PI / 2, 0.44, -0.02, new THREE.Vector3());
      this.stick(sh, base, { tilt: 0.6 });
      const upper = mesh(new THREE.CapsuleGeometry(0.04, 0.12, 4, 10), lm); upper.position.y = -0.08; sh.add(upper);
      const elbow = new THREE.Group(); elbow.position.y = -0.16; sh.add(elbow);
      const fore = mesh(new THREE.CapsuleGeometry(0.036, 0.1, 4, 10), lm); fore.position.y = -0.065; elbow.add(fore);
      const wrist = new THREE.Group(); wrist.position.y = -0.13; elbow.add(wrist);
      // a leather mitten with a thumb
      const hand = mesh(new THREE.SphereGeometry(0.052, 14, 10), lm); hand.scale.set(1.0, 1.12, 0.82); wrist.add(hand);
      const thumb = mesh(new THREE.CapsuleGeometry(0.018, 0.03, 3, 8), lm); thumb.position.set(sx * 0.038, 0.012, -0.02); thumb.rotation.z = -sx * 0.6; wrist.add(thumb);
      const cuff = mesh(new THREE.TorusGeometry(0.04, 0.008, 5, 14), this.leatherDark, false); cuff.rotation.x = Math.PI / 2; cuff.position.y = 0.035; wrist.add(cuff);
      const socket = new THREE.Group(); socket.position.set(0, -0.025, -0.02); wrist.add(socket);
      this.arms.push({ sx, sh, elbow, wrist, socket });
    }
    this.handR = this.arms[1].socket;
    this.handL = this.arms[0].socket;
    // stubby legs and feet
    this.legs = [];
    const sockCols = o.socks ?? [0xff7a2a, 0xf2efe6];
    const feetMat = o.bottom === 'boots' ? plain(0x3a2a1e, { roughness: 0.5 }) : o.bottom === 'sneakers' ? plain(0xf2efe6, { roughness: 0.6 }) : o.bottom === 'socks' ? fabricMat('sock' + sockCols.join('-'), () => socksTexture(sockCols[0], sockCols[1]), { sheen: 0.7 }) : lm;
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.105, 0.17, 0.0); this.root.add(hip);
      const thigh = mesh(new THREE.CapsuleGeometry(0.05, 0.04, 4, 10), lm); thigh.position.y = -0.035; hip.add(thigh);
      const knee = new THREE.Group(); knee.position.y = -0.07; hip.add(knee);
      const shin = mesh(new THREE.CapsuleGeometry(0.045, 0.03, 4, 10), o.bottom === 'socks' ? feetMat : lm); shin.position.y = -0.03; knee.add(shin);
      const ankle = new THREE.Group(); ankle.position.y = -0.07; knee.add(ankle);
      const foot = mesh(new RoundedBoxGeometry(0.11, 0.07, 0.16, 3, 0.032), feetMat); foot.position.set(0, -0.012, -0.022); ankle.add(foot);
      if (o.bottom !== 'bare' && o.bottom !== 'socks') { const sole = mesh(new RoundedBoxGeometry(0.115, 0.022, 0.168, 2, 0.008), plain(o.bottom === 'sneakers' ? 0xc84a3a : 0x1e1814, { roughness: 0.8 })); sole.position.set(0, -0.045, -0.022); ankle.add(sole); }
      if (o.bottom === 'sneakers') { const st = mesh(new THREE.BoxGeometry(0.004, 0.03, 0.08), plain(0x3a7ac8), false); st.position.set(sx * 0.056, -0.01, -0.02); ankle.add(st); }
      this.legs.push({ sx, hip, knee, ankle });
    }
  }

  // ---------------------------------------------------------------- hats + gear
  buildGear(o) {
    // the hat sits on the round top of the bean
    const hat = new THREE.Group();
    hat.rotation.y = Math.PI; // the old hat models face +Z
    const hb = new THREE.Vector3(0, HAT_Y, bow(HAT_Y));
    this.stick(hat, hb, { tilt: 1.2 });
    this.hat = hat;
    this.buildHat(hat, o);
    // backpack on the back (+Z)
    if (o.pack === 'hiker' || o.pack === 'daypack') {
      const big = o.pack === 'hiker';
      const pg = new THREE.Group();
      this.stick(pg, beanSurface(Math.PI, 0.5, 0.06, new THREE.Vector3()), { tilt: 0.8 });
      const packMat = fabricMat('pack' + o.pack, () => backpackTexture(big ? 0x4f6b3a : 0x8a3a3a), { sheen: 0.4 });
      const bag = mesh(new RoundedBoxGeometry(big ? 0.3 : 0.25, big ? 0.36 : 0.27, big ? 0.16 : 0.12, 3, 0.06), packMat); pg.add(bag);
      const pocket = mesh(new RoundedBoxGeometry(big ? 0.2 : 0.16, 0.11, 0.05, 2, 0.02), packMat); pocket.position.set(0, -0.07, big ? 0.09 : 0.07); pg.add(pocket);
      if (big) {
        const roll = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.33, 12), plain(0x3a6aa8, { roughness: 0.8 })); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.22, 0.0); pg.add(roll);
        const mug = mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 10), plain(0xb0b4b8, { metalness: 0.8, roughness: 0.35 })); mug.position.set(0.17, -0.08, 0.02); pg.add(mug);
      }
      // straps over the top of the bean
      const strapMat = plain(0x2e2e2a, { roughness: 0.7 });
      for (const sx of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 12; k++) { const t = k / 12; const phi = sx * (Math.PI - 0.32 - t * (Math.PI / 2 - 0.12)); const y = 0.66 - t * 0.2 + Math.sin(t * Math.PI) * 0.03; pts.push(beanSurface(phi, y, 0.012, new THREE.Vector3())); }
        const strap = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.012, 5).translate(0, -0.62, 0), strapMat);
        this.stick(strap, new THREE.Vector3(0, 0.62, 0), { tilt: 0.5 });
      }
      this.pack = pg;
    }
    if (o.extra === 'fanny') {
      const fm = fabricMat('fanny', () => fannyTexture(), { sheen: 0.3 });
      const fp = mesh(new RoundedBoxGeometry(0.19, 0.09, 0.07, 2, 0.028), fm);
      this.orientOnBean(fp, 0.15, 0.27, 0.035); this.stick(fp, fp.position, { tilt: 0.3 });
      this.hugTube(0.27, 0.01, 0.0, plain(0x2e2e2a, { roughness: 0.7 }));
    }
    if (o.extra === 'scarf' || o.extra === 'kerchief') {
      const kc = o.extra === 'kerchief' ? (o.kerchief ?? 0xd94a3a) : null;
      const sm = kc ? plain(kc, { roughness: 0.85 }) : fabricMat('scarf', () => scarfTexture(), { sheen: 0.8 });
      const y = 0.49;
      this.hugTube(y, kc ? 0.016 : 0.032, 0.0, sm);
      if (kc) {
        // a bandana triangle hanging down the front under the mouth, knotted with a woggle
        const tri = new THREE.Shape([new THREE.Vector2(-0.12, 0), new THREE.Vector2(0.12, 0), new THREE.Vector2(0, -0.15)]);
        const tg = new THREE.ShapeGeometry(tri);
        // bend it around the belly
        const tp = tg.attributes.position;
        const rr = radiusAt(y - 0.06) * 1.05;
        for (let i = 0; i < tp.count; i++) { const x = tp.getX(i); tp.setZ(i, -(rr - Math.sqrt(Math.max(0, rr * rr - x * x)))); }
        tg.computeVertexNormals();
        const flap = mesh(tg, cached('kflap' + kc, () => patchMaterial(new THREE.MeshStandardMaterial({ color: kc, roughness: 0.85, side: THREE.DoubleSide }), {})));
        this.orientOnBean(flap, 0, y + 0.005, 0.02); this.stick(flap, flap.position, { tilt: 0.5 });
        const wog = mesh(new THREE.TorusGeometry(0.02, 0.009, 6, 12), plain(0x8a5a30, { roughness: 0.6 }));
        this.orientOnBean(wog, 0, y - 0.01, 0.03); this.stick(wog, wog.position, { tilt: 0.5 });
      } else {
        const tail = mesh(new RoundedBoxGeometry(0.08, 0.22, 0.03, 2, 0.012), sm);
        this.orientOnBean(tail, 0.35, y - 0.1, 0.03); this.stick(tail, tail.position, { tilt: 0.5 });
        this.scarfTail = tail;
      }
    }
    if (o.extra === 'sash') {
      const sm2 = cached('sash', () => patchMaterial(new THREE.MeshStandardMaterial({ color: 0x6a7a3a, roughness: 0.85, side: THREE.DoubleSide }), {}));
      const onB = (th) => { const x0 = Math.cos(th), y = 0.48 - x0 * 0.2; return beanSurface(th + Math.PI / 2, y, 0.012, new THREE.Vector3()); };
      const N = 64, pos = [], nrm = [], idx = [];
      for (let k = 0; k <= N; k++) {
        const th = (k / N) * Math.PI * 2, p0 = onB(th), p1 = onB(th + 0.01);
        const tan = p1.sub(p0).normalize(), out = new THREE.Vector3(p0.x, 0, p0.z - bow(p0.y)).normalize();
        const wd = new THREE.Vector3().crossVectors(tan, out).normalize().multiplyScalar(0.036);
        for (const sg of [-1, 1]) { const q = p0.clone().addScaledVector(wd, sg); pos.push(q.x, q.y, q.z); nrm.push(out.x, out.y, out.z); }
        if (k < N) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setIndex(idx);
      geo.translate(0, -0.48, 0);
      this.stick(mesh(geo, sm2), new THREE.Vector3(0, 0.48, 0), { tilt: 0.4 });
      const cols = [0xe8c040, 0xd94a3a, 0x3a8ad0, 0xf2efe6];
      [0.2, 0.55, 0.9, 1.25].forEach((th, i) => {
        const bdg = mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.008, 14).rotateX(Math.PI / 2), plain(cols[i], { roughness: 0.5 }), false);
        const p = onB(th + Math.PI);
        const phi = Math.atan2(p.x, -(p.z - bow(p.y)));
        this.orientOnBean(bdg, phi, p.y, 0.018); this.stick(bdg, bdg.position, { tilt: 0.4 });
      });
    }
    if (o.extra === 'glasses') {
      const gm = plain(0x222222, { roughness: 0.3, metalness: 0.6 });
      for (const e of this.eyes) {
        const ring = mesh(new THREE.TorusGeometry(e.r * 1.18, 0.007, 6, 24), gm, false);
        ring.position.z = e.r * 0.25; e.g.add(ring);
      }
      const br = mesh(new THREE.BoxGeometry(0.05, 0.007, 0.007), gm, false);
      const p = beanSurface(0, EYE_Y + 0.005, 0.02, new THREE.Vector3()); br.position.copy(p); this.stick(br, p, { face: true });
    }
  }
  buildHat(hatTop, o) {
    const T = (k) => () => HATS[k]();
    // sized from the bean where the hat sits: base radius and the height of the dome above
    const rb = radiusAt(HAT_Y) + 0.012, ht = Y1 - HAT_Y + 0.012;
    const A = rb, C = rb;
    if (o.hat === 'bucket') {
      const m = fabricMat('hat-bucket', T('bucket'), { sheen: 0.4, side: THREE.DoubleSide });
      const crown = mesh(lathe([[0.235, 0.0], [0.232, 0.05], [0.222, 0.1], [0.205, 0.145], [0.17, 0.175], [0.1, 0.19], [0.001, 0.195]], 30, 0), m);
      crown.scale.set(rb * 1.1 / 0.235, ht * 1.25 / 0.195, rb * 1.1 / 0.235); crown.position.y = 0.0; hatTop.add(crown);
      const brim = mesh(lathe([[0.225, 0.0], [0.28, -0.025], [0.335, -0.065], [0.337, -0.076], [0.28, -0.038], [0.225, -0.012]], 30, 0), m);
      brim.position.y = 0.012; brim.scale.set(rb * 1.12 / 0.225, 1, rb * 1.12 / 0.225); hatTop.add(brim);
      this.brim = brim;
    } else if (o.hat === 'beanie') {
      const m = fabricMat('hat-beanie', T('beanie'), { sheen: 0.9 });
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      crown.scale.set(A * 1.03, ht * 1.04, C * 1.03); crown.position.y = 0.0; hatTop.add(crown);
      const cuff = mesh(new THREE.CylinderGeometry(A * 1.05, A * 1.08, 0.06, 28, 1, true), m); cuff.position.y = 0.0; hatTop.add(cuff);
      const pm = fabricMat('pompom' + (o.pompom ?? 0xd94040), () => pompomTexture(o.pompom ?? 0xd94040), { sheen: 1, roughness: 1, bump: 3 });
      const pom = mesh(new THREE.IcosahedronGeometry(0.06, 2), pm); pom.position.y = ht * 1.04 + 0.04; hatTop.add(pom);
      this.pom = pom;
    } else if (o.hat === 'hardhat') {
      const m = fabricMat('hat-hard', T('hardhat'), { roughness: 0.35, sheen: 0, clearcoat: 0.6 });
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      crown.scale.set(A * 1.1, ht * 1.18, C * 1.1); crown.position.y = 0.0; hatTop.add(crown);
      const brim = mesh(lathe([[A, 0], [A + 0.055, -0.012], [A + 0.06, -0.022], [A, -0.016]], 30, 0), m); brim.position.y = 0.012; hatTop.add(brim);
      const ridge = mesh(new RoundedBoxGeometry(0.05, 0.03, A * 1.6, 2, 0.012), m); ridge.position.y = ht * 1.18 - 0.01; hatTop.add(ridge);
      const lamp = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.03, 12), plain(0xfff6c0, { emissive: 0x806a30 }));
      lamp.rotation.x = Math.PI / 2 - 0.5; lamp.position.set(0, ht * 0.6, C * 0.95); hatTop.add(lamp);
      this.headlamp = lamp;
    } else if (o.hat === 'cap') {
      const m = fabricMat('hat-cap', T('cap'), { sheen: 0.4 });
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      crown.scale.set(A * 1.04, ht * 1.05, C * 1.04); crown.position.y = 0.0; hatTop.add(crown);
      const bill = mesh(new RoundedBoxGeometry(0.22, 0.016, 0.15, 2, 0.007), m); bill.position.set(0, 0.012, C + 0.05); bill.rotation.x = 0.12; hatTop.add(bill);
      const btn = mesh(new THREE.SphereGeometry(0.015, 8, 6), m); btn.position.y = ht * 1.05; hatTop.add(btn);
    } else if (o.hat === 'pith') {
      const m = fabricMat('hat-pith', T('pith'), { sheen: 0.3, side: THREE.DoubleSide });
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      crown.scale.set(A * 1.1, ht * 1.45, C * 1.1); crown.position.y = 0.0; hatTop.add(crown);
      const brim = mesh(lathe([[A, 0], [A + 0.11, -0.05], [A + 0.12, -0.06], [A, -0.015]], 30, 0), m); brim.position.y = 0.012; hatTop.add(brim);
    } else if (o.hat === 'goggles') {
      const strap = fabricMat('hat-strap', T('goggles'), { sheen: 0.2 });
      const band = mesh(new THREE.CylinderGeometry(A * 1.0, A * 1.01, 0.05, 28, 1, true), strap);
      band.position.y = 0.03; band.scale.set(0.97, 1, 0.97); hatTop.add(band);
      const metal = plain(0xb08a50, { roughness: 0.3, metalness: 0.9 });
      const glass = plain(0x5ad0e0, { roughness: 0.05, emissive: 0x0a4050 });
      for (const sx of [-1, 1]) {
        const ring = mesh(new THREE.CylinderGeometry(0.042, 0.044, 0.038, 14), metal); ring.position.set(sx * 0.075, 0.03, A * 0.96); ring.rotation.x = Math.PI / 2 - 0.3; hatTop.add(ring);
        const lens = mesh(new THREE.CircleGeometry(0.034, 14), glass); lens.position.set(sx * 0.075, 0.036, A * 0.96 + 0.02); lens.rotation.x = -0.3; hatTop.add(lens);
      }
      // a fluffy mad-scientist tuft bursting out of the top
      const hairMat = plain(0xeeeae2, { roughness: 1 });
      for (const [x, y, z, r] of [[0, 0.12, 0, 0.1], [-0.09, 0.09, -0.04, 0.08], [0.09, 0.09, -0.04, 0.08], [0, 0.08, -0.12, 0.085], [-0.06, 0.13, 0.06, 0.07], [0.07, 0.12, 0.06, 0.065]]) { const pf = mesh(new THREE.IcosahedronGeometry(r, 1), hairMat); pf.position.set(x, y, z); hatTop.add(pf); }
    }
  }

  // attach a held-item mesh to the right hand
  setHeld(obj) {
    if (this.heldGroup) this.handR.remove(this.heldGroup);
    this.heldGroup = obj;
    if (obj) this.handR.add(obj);
  }

  // ---------------------------------------------------------------- animation
  // s: { speed, grounded, vy, crouch, sprint, swim, action:{name,t}, talk, expr, downed, carried, sitting, ride, drive, sleeping, lookPitch, lookYaw, yaw, holding, panic, hurt }
  update(dt, s = {}) {
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const t = this.t;
    const speed = s.speed ?? 0;
    const grounded = s.grounded ?? true;
    const ease = (cur, target, k) => cur + (target - cur) * Math.min(1, dt * k);
    // ---- how the bean moves through the world (for the jelly)
    const wp = this.root.getWorldPosition(_w);
    if (!this.prevPos) this.prevPos = wp.clone();
    const nv = _v.copy(wp).sub(this.prevPos).divideScalar(Math.max(dt, 1e-3));
    if (nv.lengthSq() > 400) nv.set(0, 0, 0); // teleports
    this.prevPos.copy(wp);
    this.acc.lerp(_a.copy(nv).sub(this.vel).divideScalar(Math.max(dt, 1e-3)), Math.min(1, dt * 12));
    this.vel.copy(nv);
    const yaw = s.yaw ?? 0;
    let dyaw = yaw - this.prevYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.prevYaw = yaw;
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    // world acceleration -> bean local (front = -Z)
    const ax = this.acc.x * cy - this.acc.z * sy, az = this.acc.x * sy + this.acc.z * cy;
    // ---- jelly springs: the top lags behind acceleration and overshoots
    const L = this.J.lean, LV = this.leanV;
    const turn = dyaw / Math.max(dt, 1e-3);
    LV.x += (-L.x * 150 - LV.x * 6.5 - Math.max(-30, Math.min(30, ax)) * 0.016 + turn * speed * 0.004) * dt;
    LV.y += (-L.y * 150 - LV.y * 6.5 - Math.max(-30, Math.min(30, az)) * 0.016) * dt;
    L.x += LV.x * dt; L.y += LV.y * dt;
    L.clampLength(0, 0.16);
    // squash: land = squish, jump = stretch, steps = little bounces
    if (grounded && !this.prevGrounded && this.airTime > 0.12) { this.squashV -= Math.min(5, 1.4 + this.airTime * 3); this.jigA = Math.min(0.12, this.jigA + 0.05 + this.airTime * 0.04); }
    if (!grounded && this.prevGrounded && (s.vy ?? 0) > 2) this.squashV += 2.6;
    this.airTime = grounded ? 0 : this.airTime + dt;
    this.prevGrounded = grounded;
    const stride = s.sprint ? 0.75 : 0.5;
    this.phase += (speed / stride) * dt * Math.PI;
    const ph = this.phase;
    const moving = Math.min(1, speed / 1.2);
    const stepBounce = grounded && !s.swim ? Math.abs(Math.sin(ph)) * 0.06 * moving : 0;
    const sqTarget = (grounded ? -stepBounce * 0.8 : Math.max(-0.05, Math.min(0.14, (s.vy ?? 0) * 0.02))) + Math.sin(t * 1.7) * 0.012;
    this.squashV += ((sqTarget - this.J.squash) * 260 - this.squashV * 9) * dt;
    this.J.squash += this.squashV * dt;
    this.J.squash = Math.max(-0.3, Math.min(0.3, this.J.squash));
    this.jigA *= Math.exp(-dt * 3.2); this.jigB = (this.jigB ?? 0) * Math.exp(-dt * 2.5);
    this.J.jig.set(this.jigA * 0.9, t * 18, this.jigB + (EXPRESSIONS[this.expr]?.shake ?? 0) * 0.008 * Math.sin(t * 47));
    this.uni.uLean.value.copy(L); this.uni.uSquash.value = this.J.squash; this.uni.uJig.value.copy(this.J.jig);

    // ---- body pose
    let bodyY = 0, bodyRX = 0, bodyRZ = 0, bodyRY = 0, rootRX = 0, rootRZ = 0, rootY = 0;
    let lookYaw = (s.lookYaw ?? 0), lookPitch = (s.lookPitch ?? 0);
    const leg = [{ x: 0, knee: 0, ankle: 0 }, { x: 0, knee: 0, ankle: 0 }];
    const arm = [{ x: 0.1, z: 0.4, elbow: -0.3 }, { x: 0.1, z: -0.4, elbow: -0.3 }];
    let expr = ALIAS[s.expr] ?? s.expr ?? 'neutral';
    if (!EXPRESSIONS[expr]) expr = 'neutral';
    arm[0].z += Math.sin(t * 1.7) * 0.03; arm[1].z -= Math.sin(t * 1.7) * 0.03;
    if (grounded && !s.swim && !s.downed && !s.carried && !s.sitting && !s.sleeping) {
      // a bouncy waddle
      const sw = Math.sin(ph), cw = Math.cos(ph);
      const runK = Math.min(1, Math.max(0, (speed - 3) / 3));
      const amp = 0.7 + runK * 0.35;
      leg[0].x = sw * amp * moving; leg[1].x = -sw * amp * moving;
      leg[0].knee = Math.max(0, -cw) * 1.0 * moving; leg[1].knee = Math.max(0, cw) * 1.0 * moving;
      leg[0].ankle = -leg[0].x * 0.5; leg[1].ankle = -leg[1].x * 0.5;
      bodyY += Math.abs(cw) * 0.035 * moving;
      bodyRZ = sw * (0.12 - runK * 0.04) * moving;
      bodyRY = sw * 0.1 * moving;
      bodyRX = -(runK * 0.22 + moving * 0.05);
      arm[0].x = -sw * (0.7 + runK * 0.6) * moving + 0.1; arm[1].x = sw * (0.7 + runK * 0.6) * moving + 0.1;
      arm[0].elbow = -0.3 - runK * 0.9; arm[1].elbow = -0.3 - runK * 0.9;
      arm[0].z = 0.4 + moving * 0.1 + runK * 0.2; arm[1].z = -0.4 - moving * 0.1 - runK * 0.2;
      if (s.panic) { arm[0].x = -2.7 + Math.sin(t * 22) * 0.6; arm[1].x = -2.7 + Math.cos(t * 22) * 0.6; arm[0].z = 0.3; arm[1].z = -0.3; expr = 'scream'; }
    }
    if (s.crouch) { bodyY -= 0.06; leg[0].x -= 0.7; leg[1].x -= 0.7; leg[0].knee += 1.3; leg[1].knee += 1.3; leg[0].ankle -= 0.6; leg[1].ankle -= 0.6; bodyRX -= 0.2; this.J.squash = Math.min(this.J.squash, -0.08); }
    if (!grounded && !s.swim && !s.carried) {
      const fall = (s.vy ?? 0) < -2;
      const flail = this.airTime > 0.8 && fall;
      leg[0].x = -0.6; leg[1].x = 0.3; leg[0].knee = 1.0; leg[1].knee = 0.6;
      arm[0].x = -1.4; arm[1].x = -1.4; arm[0].z = 0.9; arm[1].z = -0.9; arm[0].elbow = -0.5; arm[1].elbow = -0.5;
      if (flail) { arm[0].x = -2.6 + Math.sin(t * 25) * 0.7; arm[1].x = -2.6 + Math.cos(t * 23) * 0.7; leg[0].x = Math.sin(t * 20) * 0.8; leg[1].x = -Math.sin(t * 20) * 0.8; expr = 'scream'; }
      else if (this.airTime > 0.25) expr = expr === 'neutral' ? 'surprised' : expr;
    }
    if (s.swim) {
      rootRX = -1.05; rootY = -0.3;
      const sp = t * 4.5;
      arm[0].x = -2.3 + Math.sin(sp) * 0.9; arm[1].x = -2.3 + Math.sin(sp) * 0.9;
      arm[0].z = 0.6 + Math.cos(sp) * 0.6; arm[1].z = -0.6 - Math.cos(sp) * 0.6;
      leg[0].x = Math.sin(sp * 1.3) * 0.6; leg[1].x = -Math.sin(sp * 1.3) * 0.6;
      lookPitch += 0.6;
      if (s.underwater) expr = 'puff';
    }
    if (s.sitting) {
      bodyY = 0.05; leg[0].x = -1.5; leg[1].x = -1.5; leg[0].knee = 1.4; leg[1].knee = 1.4;
      if (s.ride) { leg[0].x = -1.2; leg[1].x = -1.2; }
      arm[0].x = -0.8; arm[1].x = -0.8; arm[0].elbow = -0.9; arm[1].elbow = -0.9;
      if (s.drive !== undefined && s.drive !== null) { const st = s.drive; arm[0].x = -1.3 - st * 0.25; arm[1].x = -1.3 + st * 0.25; arm[0].elbow = -0.5; arm[1].elbow = -0.5; arm[0].z = 0.25; arm[1].z = -0.25; bodyRZ += st * 0.15; }
    }
    if (s.sleeping) { rootRX = Math.PI / 2; rootY = 0.3; expr = 'sleep'; leg[0].x = 0.1; arm[0].z = 0.6; arm[1].z = -0.5; this.J.squash += Math.sin(t * 1.2) * 0.002; }
    if (s.downed) { rootRX = Math.PI / 2 - 0.05; rootRZ = 0.2; rootY = 0.3; expr = 'ko'; arm[0].z = 1.5 + Math.sin(t * 9) * 0.06 * (Math.sin(t * 1.3) > 0.8 ? 1 : 0); arm[1].z = -1.3; leg[0].x = 0.3; leg[1].x = -0.2; }
    if (s.carried) { rootRX = -Math.PI / 2.1; arm[0].x = -Math.PI * 0.9 + Math.sin(t * 3) * 0.2; arm[1].x = -Math.PI * 0.9 + Math.cos(t * 3) * 0.2; leg[0].x = Math.sin(t * 7) * 0.6; leg[1].x = -Math.sin(t * 7) * 0.6; expr = s.downed ? 'ko' : 'angry'; }

    // ---- actions (upper body; numbers in the +Z-front convention, mirrored on apply)
    const act = s.action;
    if (act && act.name) {
      const p = act.t ?? 0;
      const R = arm[1], Lh = arm[0];
      switch (act.name) {
        case 'chop': case 'mine': case 'swing': case 'club': {
          const k = p < 0.45 ? p / 0.45 : p < 0.6 ? 1 - (p - 0.45) / 0.15 : 0;
          const strike = p >= 0.45 && p < 0.7 ? Math.sin(((p - 0.45) / 0.25) * Math.PI) : 0;
          R.x = -2.8 * k + 0.7 * strike - 0.3; R.elbow = -1.1 * k - 0.2; R.z = -0.1;
          Lh.x = -2.3 * k + 0.6 * strike - 0.2; Lh.elbow = -1.0 * k - 0.3; Lh.z = 0.2;
          bodyRX += 0.25 * k - 0.4 * strike; bodyRY += -0.25 * k;
          if (strike > 0.5) this.leanV.y -= 0.7 * dt;
          expr = k > 0.5 ? 'focus' : expr;
          break;
        }
        case 'crank': { const a = t * 10; R.x = -1.3 + Math.sin(a) * 0.4; R.elbow = -0.6 + Math.cos(a) * 0.4; Lh.x = -0.5; Lh.elbow = -0.8; bodyRY += Math.sin(a) * 0.1; expr = 'rage'; break; }
        case 'wrench': { const a = Math.sin(t * 11); R.x = -1.4; R.elbow = -0.5; R.z = -0.2 + a * 0.3; Lh.x = -1.2; Lh.elbow = -0.6; Lh.z = 0.25; bodyRX -= 0.25; expr = 'focus'; break; }
        case 'hammer': { const k = Math.sin(p * Math.PI * 2) * 0.5 + 0.5; R.x = -1.3 - k * 0.9; R.elbow = -1.2 + k * 0.6; R.z = -0.25; expr = 'focus'; break; }
        case 'punch': { const k = Math.sin(Math.min(1, p * 2) * Math.PI); const side = act.side ? Lh : R; side.x = -1.6 * k - 0.2; side.elbow = -1.4 + 1.3 * k; bodyRY += (act.side ? -0.4 : 0.4) * k; expr = 'angry'; break; }
        case 'throw': { const k = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5; R.x = p < 0.5 ? -2.7 * k : -2.7 + 3.3 * (1 - k); R.elbow = -0.9; bodyRY += (p < 0.5 ? -0.5 * k : 0.5 * (1 - k)); expr = 'focus'; break; }
        case 'aim': R.x = -1.5 - lookPitch; R.elbow = -0.2; R.z = 0.05; Lh.x = -1.35 - lookPitch; Lh.elbow = -0.5; Lh.z = -0.3; expr = 'suspicious'; break;
        case 'eat': { const k = Math.sin(Math.min(1, p) * Math.PI); R.x = -1.9 * k - 0.2; R.elbow = -1.9 * k; R.z = -0.5 * k; expr = 'chomp'; break; }
        case 'drink': { bodyY -= 0.05; leg[0].knee += 1.2; leg[1].knee += 1.2; leg[0].x -= 0.8; leg[1].x -= 0.8; bodyRX -= 0.5; R.x = -1; Lh.x = -1; expr = 'puff'; break; }
        case 'interact': { const k = Math.sin(Math.min(1, p) * Math.PI); R.x = -1.5 * k; R.elbow = -0.3; bodyRX -= 0.15 * k; break; }
        case 'pickup': { const k = Math.sin(Math.min(1, p) * Math.PI); bodyY -= 0.06 * k; bodyRX -= 0.5 * k; R.x = -1.0 * k; leg[0].knee += 0.8 * k; leg[1].knee += 0.8 * k; leg[0].x -= 0.5 * k; leg[1].x -= 0.5 * k; this.J.squash -= 0.05 * k; break; }
        case 'carry': R.x = -3.0; Lh.x = -3.0; R.elbow = -0.6; Lh.elbow = -0.6; R.z = -0.2; Lh.z = 0.2; expr = 'hurt'; break;
        case 'wave': R.x = -2.7; R.z = -0.4 + Math.sin(t * 12) * 0.45; R.elbow = -0.4; expr = 'grin'; break;
        case 'point': R.x = -1.6 - lookPitch; R.elbow = 0; R.z = 0.0; expr = 'surprised'; break;
        case 'dance': { bodyY += Math.abs(Math.sin(t * 7)) * 0.06; bodyRZ += Math.sin(t * 7) * 0.25; R.x = -2.5 + Math.sin(t * 7) * 0.6; Lh.x = -2.5 - Math.sin(t * 7) * 0.6; R.z = -0.4; Lh.z = 0.4; this.J.squash += Math.sin(t * 14) * 0.01; expr = 'laugh'; break; }
        case 'scream': R.x = -2.9 + Math.sin(t * 30) * 0.2; Lh.x = -2.9 + Math.cos(t * 30) * 0.2; expr = 'scream'; this.talk = Math.max(this.talk, 0.5); break;
        case 'cheer': R.x = -3.0; Lh.x = -3.0; R.z = -0.6; Lh.z = 0.6; bodyY += Math.abs(Math.sin(t * 9)) * 0.07; expr = 'grin'; break;
        case 'derp': expr = 'derp'; R.x = -0.4 + Math.sin(t * 6) * 0.4; Lh.x = -0.4 - Math.sin(t * 6) * 0.4; bodyRZ += Math.sin(t * 3) * 0.15; break;
        case 'laugh': expr = 'laugh'; R.x = -1.2; Lh.x = -1.2; R.z = -0.9; Lh.z = 0.9; bodyY += Math.abs(Math.sin(t * 16)) * 0.03; break;
        case 'cry': expr = 'cry'; R.x = -2.2; Lh.x = -2.2; R.elbow = -2; Lh.elbow = -2; R.z = 0.2; Lh.z = -0.2; break;
        case 'rage': expr = 'rage'; R.x = -1.0 + Math.sin(t * 20) * 0.3; Lh.x = -1.0 - Math.sin(t * 20) * 0.3; R.elbow = -1.6; Lh.elbow = -1.6; bodyY += Math.abs(Math.sin(t * 20)) * 0.02; break;
        case 'scan': R.x = -1.5 - lookPitch * 0.8; R.elbow = -0.5; R.z = 0.2; Lh.x = -1.1; Lh.elbow = -1.0; Lh.z = -0.4; expr = 'focus'; break;
        case 'pet': R.x = -1.2 + Math.sin(t * 8) * 0.2; R.elbow = -0.4; bodyRX -= 0.25; expr = 'love'; break;
        case 'tpose': R.x = 0; Lh.x = 0; R.z = -1.57; Lh.z = 1.57; R.elbow = 0; Lh.elbow = 0; expr = 'smug'; break;
        default: break;
      }
    }
    if (s.holding && (!act || !act.name)) { arm[1].x = Math.min(arm[1].x, -0.4); arm[1].elbow = -0.8; }
    // ---- fidgets + idle faces
    if (speed < 0.2 && grounded && !act?.name && !s.sitting && !s.sleeping && !s.downed && !s.carried && !s.swim) {
      this.fidget.next -= dt;
      if (!this.fidget.name && this.fidget.next <= 0) { this.fidget.name = ['scratch', 'look', 'stretch', 'tap', 'derp', 'whistle', 'bounce'][Math.floor(Math.random() * 7)]; this.fidget.t = 0; }
      if (this.fidget.name) {
        const f = this.fidget; f.t += dt;
        const k = Math.sin(Math.min(1, f.t / 1.8) * Math.PI);
        if (f.name === 'scratch') { arm[1].x = -2.7 * k; arm[1].elbow = -2.0 * k; arm[1].z = -0.6 * k + Math.sin(t * 20) * 0.08 * k; }
        if (f.name === 'look') lookYaw += Math.sin(f.t * 2.2) * 1.1 * k;
        if (f.name === 'stretch') { arm[0].x = -3.0 * k; arm[1].x = -3.0 * k; this.J.squash += 0.08 * k; if (k > 0.6) expr = 'sleepy'; }
        if (f.name === 'tap') leg[1].ankle = -0.3 + Math.abs(Math.sin(t * 9)) * 0.4 * k;
        if (f.name === 'derp' && k > 0.2) expr = 'derp';
        if (f.name === 'whistle' && k > 0.2) expr = 'whistle';
        if (f.name === 'bounce') { this.J.squash += Math.sin(f.t * 12) * 0.05 * k; bodyY += Math.abs(Math.sin(f.t * 6)) * 0.04 * k; expr = 'happy'; }
        if (f.t > 1.8) { f.name = null; f.next = 6 + Math.random() * 10; }
      }
    } else this.fidget.name = null;

    // ---- apply the pose (smoothed)
    const P = this.pose;
    const sm = (name, v, k = 14) => { P[name] = P[name] === undefined ? v : ease(P[name], v, k); return P[name]; };
    this.root.rotation.x = sm('rootRX', rootRX, 8);
    this.root.rotation.z = sm('rootRZ', rootRZ, 8);
    this.body.position.y = sm('bodyY', bodyY + rootY);
    this.body.rotation.set(sm('bodyRX', bodyRX), sm('bodyRY', bodyRY), sm('bodyRZ', bodyRZ));
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i], ar = arm[i];
      // the pose numbers are written for a +Z-facing body; the bean faces -Z
      a.sh.rotation.set(-sm('ax' + i, ar.x), 0, -sm('az' + i, ar.z));
      a.elbow.rotation.x = -sm('ae' + i, ar.elbow);
      const l = this.legs[i], lr = leg[i];
      l.hip.rotation.x = -sm('lx' + i, lr.x);
      l.knee.rotation.x = -sm('lk' + i, lr.knee);
      l.ankle.rotation.x = -sm('la' + i, lr.ankle - lr.knee * 0.5);
      l.hip.position.y = 0.17 + this.body.position.y * 0.5;
    }
    // ---- face: springy expression parameters (they overshoot and wobble)
    this.expr = expr;
    const target = EXPRESSIONS[expr];
    const F = this.face, FV = this.faceV;
    for (const k of PARAMS) {
      const tv = target[k] ?? 0;
      if (F[k] === undefined) { F[k] = tv; FV[k] = 0; }
      FV[k] += (tv - F[k]) * 220 * dt; FV[k] *= Math.exp(-15 * dt); F[k] += FV[k] * dt;
    }
    for (const k of ['chatter', 'chew', 'cheeks', 'chin']) F[k] = ease(F[k] ?? 0, target[k] ?? 0, 10);
    for (const k of ['lu', 'll', 'br', 'ba']) { F[k] = F[k] ?? [...target[k]]; for (let i = 0; i < 2; i++) F[k][i] = ease(F[k][i], target[k][i], k === 'lu' || k === 'll' ? 22 : 12); }
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.14; this.blinkT = 2 + Math.random() * 4 + (Math.random() < 0.15 ? -1.6 : 0); }
    this.blink = Math.max(0, this.blink - dt);
    const talkTarget = Math.max(s.talk ?? 0, expr === 'scream' ? 0.4 : 0);
    this.talk = ease(this.talk, talkTarget, 18);
    // the face slides around the bean a little to look at things
    const faceYaw = Math.max(-0.45, Math.min(0.45, lookYaw * 0.4));
    const facePitch = Math.max(-0.05, Math.min(0.05, -lookPitch * 0.05)) + (F.chin ?? 0);
    // ---- stick everything to the deformed bean
    const J = this.J;
    for (const st of this.stuck) {
      _p.copy(st.base);
      if (st.face) {
        // rotate the rest point around the bean axis + nudge it up/down for the look
        const zc = bow(_p.y);
        const x = _p.x, z = _p.z - zc;
        const c = Math.cos(-faceYaw), sn = Math.sin(-faceYaw);
        _p.x = x * c - z * sn; _p.z = zc + x * sn + z * c;
        _p.y += facePitch;
      }
      jellyPoint(_p, J, st.obj.position);
      const tl = jellyTilt(st.base.y, J);
      st.obj.quaternion.copy(st.quat);
      if (st.face) { _q.setFromAxisAngle(_up, faceYaw); st.obj.quaternion.premultiply(_q); }
      _e.set(tl.x * st.tilt, 0, tl.z * st.tilt); _q.setFromEuler(_e); st.obj.quaternion.premultiply(_q);
    }
    // ---- eyes: lids, pupils with physics
    const blinkK = this.blink > 0 ? 1 : 0;
    this.eyes.forEach((e, i) => {
      const lu = Math.max(F.lu[i], blinkK), ll = Math.max(F.ll[i], blinkK * 0.7);
      const side = i ? 1 : -1;
      // slant: angry lids drop toward the middle, sad ones toward the outside
      shapeLid(e.up, e.r, lu, -F.tilt * side * 0.7, true);
      shapeLid(e.lo, e.r, ll, F.tilt * side * 0.25, false);
      this.pupilPhysics(e, dt, F, target, i, expr);
    });
    // brows
    this.brows.forEach((b, i) => {
      const side = b.userData.side;
      b.userData.bar.position.y = F.br[i] * 0.025 + (F.lu[i] > 0.5 ? -0.008 : 0);
      b.userData.bar.rotation.z = F.ba[i] * 0.4 * side;
    });
    // mouth
    this.shapeMouth(F, this.talk, t);
    // ---- secondary: pack, pompom, brim, scarf tail
    if (this.pack) this.pack.rotation.x += Math.sin(ph * 2) * 0.03 * moving;
    if (this.pom) { this.pomV = (this.pomV ?? 0) + (-(this.pomX ?? 0) * 120 - (this.pomV ?? 0) * 5 - L.x * 40) * dt; this.pomX = (this.pomX ?? 0) + this.pomV * dt; this.pom.position.x = this.pomX * 0.1; }
    if (this.scarfTail) this.scarfTail.rotation.x += Math.sin(t * 3) * 0.05 + L.y * 2;
    // ---- particles for some faces
    this.fxT -= dt;
    if (target.fx && this.fx && this.fxT <= 0) this.emitFaceFx(target.fx);
  }
  // something hit the bean: it jiggles and the eyes go flying
  hit(k = 1) {
    this.jigA = Math.min(0.16, this.jigA + 0.07 * k);
    this.leanV.x += (Math.random() - 0.5) * 1.6 * k; this.leanV.y += (Math.random() - 0.5) * 1.6 * k;
    for (const e of this.eyes) { e.v.x += (Math.random() - 0.5) * 2 * k; e.v.y += Math.random() * 1.5 * k; }
  }
  pupilPhysics(e, dt, F, target, i, expr) {
    const g = e.g;
    g.updateWorldMatrix(true, false);
    const m = g.matrixWorld.elements;
    // eye axes in world space
    _x.set(m[0], m[1], m[2]).normalize(); _y.set(m[4], m[5], m[6]).normalize();
    g.getWorldPosition(_w);
    if (!e.last) { e.last = _w.clone(); e.lastV = new THREE.Vector3(); }
    const v = _v.copy(_w).sub(e.last).divideScalar(Math.max(dt, 1e-3));
    if (v.lengthSq() > 400) v.set(0, 0, 0);
    const acc = _a.copy(v).sub(e.lastV).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 60);
    e.last.copy(_w); e.lastV.copy(v);
    // gravity and inertia in the eye plane
    _f.set(0, -9.8, 0).sub(acc);
    let fx = _f.dot(_x) * 0.6, fy = _f.dot(_y) * 0.6;
    const maxR = e.r - e.pr * F.ps * 1.0 - e.r * 0.06;
    // expression pulls
    const bias = target.bias, k = F.bk ?? 2;
    let tx = 0, ty = 0;
    if (bias === 'cross') { tx = (i ? -1 : 1) * maxR * 0.9; ty = maxR * 0.1; }
    else if (bias === 'down') { ty = -maxR * 0.6; }
    else if (bias === 'spin') { e.spin += dt * 9 * (i ? 1 : -1.2); tx = Math.cos(e.spin) * maxR * 0.9; ty = Math.sin(e.spin) * maxR * 0.9; }
    else if (bias === 'look') { ty = -maxR * 0.15; }
    if (bias !== 'none') { fx += (tx - e.p.x) * k * 160; fy += (ty - e.p.y) * k * 160; }
    e.v.x += fx * dt; e.v.y += fy * dt;
    e.v.multiplyScalar(Math.exp(-dt * 2.2));
    e.p.addScaledVector(e.v, dt);
    const l = e.p.length();
    if (l > maxR) {
      _n2.copy(e.p).divideScalar(l);
      e.p.copy(_n2).multiplyScalar(maxR);
      const vn = e.v.dot(_n2);
      if (vn > 0) { e.v.addScaledVector(_n2, -vn * 1.45); e.v.multiplyScalar(0.92); }
    }
    e.pupil.position.set(e.p.x, e.p.y, e.r * 0.2);
    const ps = F.ps;
    e.pupil.scale.set(ps, ps, 1);
    void expr;
  }
  emitFaceFx(kind) {
    const fx = this.fx;
    const eye = this.eyes[Math.random() < 0.5 ? 0 : 1];
    eye.g.getWorldPosition(_w);
    if (kind === 'tears') { this.fxT = 0.18; fx.sprite('drop', _w.x, _w.y - eye.r * 0.6, _w.z, { vy: 0.4, vx: (Math.random() - 0.5) * 1.2, vz: (Math.random() - 0.5) * 1.2, grav: 7, life: 0.8, size: 0.06, color: 0x9ad8ff }); }
    else if (kind === 'sweat') { this.fxT = 0.5; fx.sprite('drop', _w.x + (Math.random() - 0.5) * 0.3, _w.y + 0.12, _w.z, { vy: 0.6, grav: 6, life: 0.7, size: 0.05, color: 0xc8eaff }); }
    else if (kind === 'zzz') { this.fxT = 1.4; fx.sprite('zzz', _w.x, _w.y + 0.25, _w.z, { vy: 0.35, vx: 0.15, life: 2.2, size: 0.18, color: 0xffffff, drag: 0.5 }); }
    else if (kind === 'stars') { this.fxT = 0.3; const a = this.t * 4; fx.sprite('star', _w.x + Math.cos(a) * 0.25, _w.y + 0.3, _w.z + Math.sin(a) * 0.25, { life: 0.6, size: 0.1, color: 0xffe060 }); }
    else if (kind === 'hearts') { this.fxT = 0.7; fx.sprite('heart', _w.x, _w.y + 0.25, _w.z, { vy: 0.5, life: 1.2, size: 0.12, color: 0xff6a8a, drag: 0.6 }); }
    else if (kind === 'steam') { this.fxT = 0.12; fx.sprite('smoke', _w.x + (Math.random() - 0.5) * 0.2, _w.y + 0.3, _w.z, { vy: 1.2, life: 0.9, size: 0.12, grow: 0.4, alpha: 0.5, color: 0xffffff }); }
  }
}
const _hb = new THREE.Vector3();
const _w = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _p = new THREE.Vector3(), _f = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _n2 = new THREE.Vector2(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _up = new THREE.Vector3(0, 1, 0);

// Render a character to a small canvas for UI portraits.
export function portrait(renderer, outfit, size = 64) {
  const c = new Character(outfit);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1, 2, -3); scene.add(d);
  scene.add(c.root);
  c.update(0.016, {});
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
  cam.position.set(0.35, 0.9, -2.2); cam.lookAt(0, 0.6, 0);
  const rt = new THREE.WebGLRenderTarget(size, size);
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  rt.dispose();
  const p = new PixelPainter(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const k = ((size - 1 - y) * size + x) * 4; p.data.set(buf.subarray(k, k + 4), (y * size + x) * 4); }
  return p;
}
