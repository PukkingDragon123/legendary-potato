// Elemental creatures. Every species belongs to an element (fire, water,
// electric, grass, crystal, earth, toxic, wind). The element paints glowing
// markings into a smooth hand-painted skin (lava cracks, lightning stripes,
// bioluminescent spots, crystal facets, ore veins), gives the skin a soft
// glossy rim light, grows extra parts on the body (crystals, leaves, moss and
// flowers, flames, fins, rock plates, fluff, streamers), lights up the eyes
// and leaves a small particle aura around the creature.
import * as THREE from 'three';
import { patchMaterial, addWindWeights, G } from '../gfx/shaderlib.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { tileFbm, hash2i, RNG } from '../core/rng.js';
import { clamp01, sstep, rgb, mix3, mul3, cell, dataTex, normalTex, put } from '../gfx/paint.js';

export const ELEMENTS = {
  fire: { name: 'Fire', css: '#ff7a2a', glow: 0xff5a14, rim: 0xff8a4a, iris: 0xffa020, fx: 'ember' },
  water: { name: 'Water', css: '#4ac8ff', glow: 0x2ac8ff, rim: 0x8ae0ff, iris: 0x40d0ff, fx: 'drip' },
  electric: { name: 'Electric', css: '#ffd83a', glow: 0xffd02a, rim: 0xfff0a0, iris: 0xffe040, fx: 'spark' },
  grass: { name: 'Grass', css: '#7ad84a', glow: 0x9aff4a, rim: 0xc8ff90, iris: 0x8ae040, fx: 'leaf' },
  crystal: { name: 'Crystal', css: '#9ae8ff', glow: 0x5ad8ff, rim: 0xb8f0ff, iris: 0x70e0ff, fx: 'glint' },
  earth: { name: 'Earth', css: '#e0a050', glow: 0xff9a20, rim: 0xffd09a, iris: 0xffa830, fx: 'dust' },
  toxic: { name: 'Toxic', css: '#b8ff3a', glow: 0x9aff1a, rim: 0xc890ff, iris: 0xb0ff30, fx: 'bubble' },
  wind: { name: 'Wind', css: '#b8fff0', glow: 0x7af0d8, rim: 0xe0fff8, iris: 0x60e0c8, fx: 'wisp' },
};
export const elementOf = (sp) => ELEMENTS[sp?.element] ?? null;

// ------------------------------------------------------------------ the creature skin shader
// One program for every creature material: glowing markings breathe slowly
// and burn brighter at night, and a fresnel rim gives the smooth toy-like
// gloss. Colours live in per-material uniforms.
const CREATURE = {
  wet: true,
  uniforms: null, // filled per material
  fragment: {
    head: 'uniform vec3 uRim;\nuniform vec2 uPulse;',
    emissive: /* glsl */ `
    {
      float pulse = 0.8 + 0.2 * sin( uTime * uPulse.x + uPulse.y );
      totalEmissiveRadiance *= pulse * ( 1.0 + uNight * 0.9 );
      vec3 vdir = normalize( vViewPosition );
      float fr = pow( 1.0 - clamp( dot( normal, vdir ), 0.0, 1.0 ), 3.0 );
      totalEmissiveRadiance += uRim * fr * ( 0.3 + 0.7 * ( 1.0 - uNight ) );
    }`,
  },
};
export function creatureMat(params, E, opt = {}) {
  const m = new THREE.MeshStandardMaterial(params);
  const rim = new THREE.Color(opt.rim ?? E?.rim ?? 0xffffff).multiplyScalar(opt.rimK ?? 0.11);
  patchMaterial(m, { ...CREATURE, uniforms: { uRim: { value: rim }, uPulse: { value: new THREE.Vector2(opt.pulse ?? 1.6, Math.random() * 6.28) } } });
  return m;
}

// ------------------------------------------------------------------ painting
// The element's glowing markings for a point on the skin (u around, 0 = spine;
// v along, 0 = tail tip). Returns { glow 0..1, dark 0..1 (charring / rings) }.
function markings(el, u, v, side, seed) {
  let glow = 0, dark = 0, tone = 0;
  const flank = sstep(-0.45, -0.1, side);
  switch (el) {
    case 'fire': {
      const c = cell(u, v, 7, 18, seed), e = c.f2 - c.f1;
      const crack = 1 - sstep(0.015, 0.055, e);
      const n = tileFbm(u * 6, v * 18, 6, 3, seed + 3);
      glow = crack * flank * sstep(0.45, 0.62, n + side * 0.2);
      glow = Math.max(glow, sstep(0.93, 0.99, side) * 0.8); // the molten spine
      dark = crack * flank * 0.35; tone = (c.id - 0.5) * 0.12;
      break;
    }
    case 'water': {
      const c = cell(u, v, 16, 40, seed);
      const band = sstep(-0.35, -0.15, side) * (1 - sstep(0.35, 0.6, side));
      glow = (1 - sstep(0.1, 0.2, c.f1)) * band * (c.id > 0.25 ? 1 : 0);
      glow = Math.max(glow, sstep(0.95, 0.995, side) * 0.7);
      tone = Math.sin(v * 70 + Math.sin(u * 12.566) * 2) * 0.05;
      break;
    }
    case 'electric': {
      const tri = Math.abs(((u * 8) % 1) - 0.5) * 2; // zigzag around the body
      const s = v * 13 + tri * 0.7;
      const f = s - Math.floor(s);
      glow = (1 - sstep(0.04, 0.09, Math.abs(f - 0.5))) * sstep(-0.25, 0.1, side);
      dark = sstep(0.12, 0.3, Math.abs(f - 0.5)) * 0;
      break;
    }
    case 'grass': {
      const c = cell(u, v, 12, 30, seed);
      glow = (1 - sstep(0.05, 0.11, c.f1)) * sstep(0.2, 0.5, side) * (c.id > 0.55 ? 1 : 0) * 0.8;
      const veins = 1 - sstep(0.0, 0.06, Math.abs(tileFbm(u * 5, v * 14, 5, 3, seed + 9) - 0.5));
      dark = veins * 0.3 * flank;
      break;
    }
    case 'crystal': {
      const c = cell(u, v, 8, 20, seed), e = c.f2 - c.f1;
      glow = (1 - sstep(0.015, 0.05, e)) * sstep(-0.1, 0.4, side) * 0.75;
      tone = (c.id - 0.5) * 0.22 * flank;
      break;
    }
    case 'earth': {
      const c = cell(u, v, 9, 22, seed), e = c.f2 - c.f1;
      const gap = 1 - sstep(0.03, 0.09, e);
      dark = gap * flank * 0.55; tone = (c.id - 0.5) * 0.24 * flank;
      glow = gap * flank * (tileFbm(u * 7, v * 16, 7, 2, seed + 5) > 0.62 ? 1 : 0);
      break;
    }
    case 'toxic': {
      const c = cell(u, v, 9, 22, seed);
      const ring = 1 - sstep(0.04, 0.08, Math.abs(c.f1 - 0.3));
      dark = ring * flank * (c.id > 0.45 ? 0.6 : 0);
      glow = (1 - sstep(0.12, 0.19, c.f1)) * flank * (c.id > 0.45 ? 1 : 0);
      break;
    }
    case 'wind': {
      const n = tileFbm(u * 4, v * 10, 4, 3, seed);
      const sw = Math.sin(v * 46 + Math.sin(u * 12.566) * 2.2 + n * 5);
      glow = sstep(0.9, 0.99, sw) * sstep(-0.2, 0.3, side) * 0.55;
      tone = sw * 0.04;
      break;
    }
    default: break;
  }
  return { glow, dark, tone };
}

// ------------------------------------------------------------------ skins
// Smooth painted body: dorsal -> flank -> belly gradient, soft species
// pattern, fine scale bumps, plus the element's glowing markings.
export function paintBody(L, el, seed) {
  const W = 256, H = 256;
  const col = new Uint8Array(W * H * 4), emi = new Uint8Array(W * H * 4), hgt = new Float32Array(W * H);
  const back = rgb(L.color), bel = rgb(L.belly), pat = rgb(L.pcolor);
  const dors = mul3(back, 0.72);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    const side = Math.cos(u * Math.PI * 2);
    const n = tileFbm(u * 8, v * 16, 8, 4, seed);
    // countershading
    let c = mix3(back, dors, sstep(0.55, 1.0, side) * 0.8);
    c = mix3(c, bel, sstep(-0.05, -0.55, side));
    c = mul3(c, 0.9 + (n - 0.5) * 0.28);
    // species pattern, soft-edged
    let pk = 0;
    switch (L.pattern) {
      case 'stripes': pk = sstep(0.45, 0.65, Math.sin(v * 52 + Math.sin(u * 12.566) * 1.4)) * sstep(-0.1, 0.25, side); break;
      case 'bands': pk = sstep(0.35, 0.55, Math.sin(v * 26)) * sstep(-0.2, 0.2, side); break;
      case 'saddle': pk = sstep(0.2, 0.4, side) * sstep(0.3, 0.38, v) * (1 - sstep(0.72, 0.8, v)); break;
      case 'spots': { const cc = cell(u, v, 10, 26, seed + 21); pk = (1 - sstep(0.18, 0.26, cc.f1)) * sstep(-0.3, 0.1, side); break; }
      case 'mottle': pk = sstep(0.55, 0.66, n) * sstep(-0.2, 0.2, side); break;
      case 'scutes': { const cc = cell(u, v, 10, 24, seed + 21); pk = sstep(0.04, 0.0, cc.f2 - cc.f1 - 0.04) * sstep(-0.2, 0.2, side); break; }
      case 'iridescent': pk = sstep(0.3, 0.8, side) * (0.5 + 0.5 * Math.sin(u * 40 + v * 30)); break;
      default: break;
    }
    c = mix3(c, mix3(pat, mul3(pat, 0.8), n), pk * 0.85);
    const m = markings(el, u, v, side, seed);
    c = mul3(c, 1 + m.tone - m.dark * 0.6);
    // scales: small bumps, bigger on the back, flat on the belly
    const sc = cell(u, v, 40, 90, seed + 40);
    const bump = (1 - sstep(0.2, 0.7, sc.f1)) * (0.3 + 0.7 * sstep(-0.6, 0.4, side));
    hgt[y * W + x] = bump * 0.35 + n * 0.6 - m.dark * 0.4;
    c = mul3(c, 0.96 + bump * 0.06);
    put(col, i, c);
    const gk = clamp01(m.glow);
    put(emi, i, [gk, gk, gk]);
    // a little of the glow colour bleeds into the albedo so markings read by day too
  }
  return { map: dataTex(col, W, H), emissiveMap: dataTex(emi, W, H), normalMap: normalTex(hgt, W, H, 1.1) };
}
// Limbs / heads: belly-to-back gradient (v: 0 bottom, 1 top) with scales.
export function paintPart(L, el, seed) {
  const W = 64, H = 64;
  const col = new Uint8Array(W * H * 4), emi = new Uint8Array(W * H * 4), hgt = new Float32Array(W * H);
  const back = rgb(L.color), bel = rgb(L.belly);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    const n = tileFbm(u * 4, v * 4, 4, 3, seed);
    let c = mix3(bel, back, sstep(0.26, 0.42, v));
    c = mix3(c, mul3(back, 0.75), sstep(0.8, 1.0, v) * 0.6);
    c = mul3(c, 0.92 + (n - 0.5) * 0.2);
    const sc = cell(u, v, 12, 12, seed + 40);
    const bump = 1 - sstep(0.2, 0.7, sc.f1);
    hgt[y * W + x] = bump * 0.35 + n * 0.5;
    c = mul3(c, 0.96 + bump * 0.06);
    put(col, i, c);
    let g = 0;
    if (el === 'fire') { const cc = cell(u, v, 4, 4, seed + 3); g = (1 - sstep(0.02, 0.08, cc.f2 - cc.f1)) * sstep(0.45, 0.6, v) * 0.8; }
    if (el === 'electric') g = (1 - sstep(0.05, 0.12, Math.abs(((v * 4 + Math.abs((u * 4) % 1 - 0.5)) % 1) - 0.5))) * sstep(0.4, 0.55, v) * 0.7;
    if (el === 'water' || el === 'toxic') { const cc = cell(u, v, 5, 5, seed + 3); g = (1 - sstep(0.1, 0.18, cc.f1)) * sstep(0.5, 0.65, v) * 0.8; }
    if (el === 'crystal') { const cc = cell(u, v, 4, 4, seed + 3); g = (1 - sstep(0.015, 0.05, cc.f2 - cc.f1)) * 0.5; }
    put(emi, i, [g, g, g]);
  }
  return { map: dataTex(col, W, H), emissiveMap: dataTex(emi, W, H), normalMap: normalTex(hgt, W, H, 0.9) };
}

// a pale leaf with a midrib and veins, tinted by the material colour
let _leafTex = null;
function leafTex() {
  if (_leafTex) return _leafTex;
  const W = 32, H = 64, col = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / (W - 1) - 0.5, v = y / (H - 1), i = (y * W + x) * 4;
    const rib = 1 - sstep(0.0, 0.06, Math.abs(u));
    const vein = 1 - sstep(0.0, 0.08, Math.abs(((Math.abs(u) * 2.2 - v * 1.6) * 6) % 1 - 0.5) * 0.5);
    let k = 0.78 + v * 0.18 + rib * 0.28 + vein * 0.08 * (1 - rib) - Math.abs(u) * 0.25;
    k = clamp01(k);
    put(col, i, [k, k, k * 0.92]);
  }
  _leafTex = dataTex(col, W, H);
  _leafTex.wrapS = _leafTex.wrapT = THREE.ClampToEdgeWrapping;
  return _leafTex;
}

// ------------------------------------------------------------------ shared geometry
const geoCache = new Map();
const cached = (k, f) => { if (!geoCache.has(k)) geoCache.set(k, f()); return geoCache.get(k); };
// a pointed hexagonal crystal standing on +Y, 1 unit tall
const crystalGeo = () => cached('crystal', () => {
  const pts = [new THREE.Vector2(0.0001, -0.05), new THREE.Vector2(0.15, 0.0), new THREE.Vector2(0.17, 0.68), new THREE.Vector2(0.0001, 1.0)];
  const g = new THREE.LatheGeometry(pts, 6);
  return g.toNonIndexed();
});
// a leaf blade: tapered, cupped and curled, 1 unit long on +Y
const leafGeo = (curl = 0.25) => cached('leaf' + curl, () => {
  const g = new THREE.PlaneGeometry(0.42, 1, 2, 7); g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const w = Math.pow(Math.sin(Math.PI * Math.min(1, y * 0.98 + 0.02)), 0.75);
    p.setXYZ(i, x * w, y, curl * y * y - Math.abs(x * w) * 0.35);
  }
  g.computeVertexNormals();
  return g;
});
// lumpy blob (moss clump, rock plate, fluff)
const blobGeo = (kind, detail, amp, seed) => cached(`blob:${kind}:${detail}:${amp}:${seed}`, () => {
  let g = new THREE.IcosahedronGeometry(1, detail);
  // soft blobs share their vertices so they shade smooth; rocks keep facets
  if (kind !== 'rock') { g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g); }
  const p = g.attributes.position, r = new RNG(seed);
  const off = [r.next() * 10, r.next() * 10, r.next() * 10];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = Math.sin(x * 3.1 + off[0]) * Math.sin(y * 2.7 + off[1]) * Math.sin(z * 3.3 + off[2]);
    const k = 1 + n * amp + (kind === 'fluff' ? (hash2i(Math.round(x * 50), Math.round(y * 50) + Math.round(z * 50) * 97, seed) - 0.5) * amp * 1.6 : 0);
    p.setXYZ(i, x * k, y * k, z * k);
  }
  // icosahedra come unindexed: per-face normals give rocks crisp facets
  g.computeVertexNormals();
  return g;
});
const flameGeo = () => cached('flame', () => {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(Math.max(0.0001, Math.sin(Math.PI * Math.pow(t, 0.55)) * 0.32 * Math.pow(1 - t, 0.35)), t)); }
  return new THREE.LatheGeometry(pts, 10);
});

// ------------------------------------------------------------------ materials for parts
const partMats = new Map();
function partMat(key, make) { if (!partMats.has(key)) partMats.set(key, make()); return partMats.get(key); }
export function crystalMat(E, tint) {
  return partMat('crystal:' + (tint ?? E.glow), () => creatureMat({ color: tint ?? 0xc8f4ff, emissive: E.glow, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.15, flatShading: true, transparent: true, opacity: 0.9 }, E, { rimK: 0.6, pulse: 1.2 }));
}
export function glowMat(E, color, k = 1.6) {
  return partMat(`glow:${color ?? E.glow}:${k}`, () => creatureMat({ color: 0x101010, emissive: color ?? E.glow, emissiveIntensity: k, roughness: 0.35 }, E, { rimK: 0.2, pulse: 2.1 }));
}
function leafMat(color) {
  return partMat('leaf:' + color, () => patchMaterial(new THREE.MeshStandardMaterial({ color, map: leafTex(), roughness: 0.55, side: THREE.DoubleSide }), { translucency: 0.6, wind: { amp: 0.04, flutter: 0.02 } }));
}
function plainMat(key, params, E, opt) { return partMat(key, () => creatureMat(params, E, opt)); }
const FLAME_VS = /* glsl */ `
uniform float uTime; uniform float uSeed;
varying float vH; varying float vF;
void main() {
  vec3 p = position;
  float h = clamp( p.y, 0.0, 1.0 );
  p.x += ( sin( uTime * 9.0 + p.y * 7.0 + uSeed ) * 0.12 + sin( uTime * 15.0 + p.y * 13.0 + uSeed * 2.0 ) * 0.05 ) * h;
  p.z += cos( uTime * 7.0 + p.y * 9.0 + uSeed ) * 0.1 * h;
  p.xz *= 1.0 + 0.12 * sin( uTime * 11.0 + uSeed );
  vH = h;
  vec4 mv = modelViewMatrix * vec4( p, 1.0 );
  vec3 n = normalize( normalMatrix * normal );
  vF = abs( dot( n, normalize( -mv.xyz ) ) );
  gl_Position = projectionMatrix * mv;
}`;
const FLAME_FS = /* glsl */ `
uniform vec3 uCol; uniform vec3 uCore;
varying float vH; varying float vF;
void main() {
  float a = pow( vF, 1.4 ) * ( 1.0 - vH * vH );
  vec3 c = mix( uCol, uCore, pow( vF, 3.0 ) * ( 1.0 - vH ) );
  gl_FragColor = vec4( c * a * 2.2, 1.0 );
}`;
export function flameMat(col, core) {
  return partMat(`flame:${col}:${core}`, () => new THREE.ShaderMaterial({
    vertexShader: FLAME_VS, fragmentShader: FLAME_FS,
    uniforms: { uTime: G.uTime, uSeed: { value: Math.random() * 10 }, uCol: { value: new THREE.Color(col) }, uCore: { value: new THREE.Color(core) } },
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  }));
}

const mesh = (geo, mat, cast = false) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; return m; };

// ------------------------------------------------------------------ eyes
// Big glossy eyes: a dark lens, a glowing element-coloured iris, a pupil and
// two catch-lights. Built facing local +Z, then turned to look outward.
export function buildEye(r, E, sx) {
  const g = new THREE.Group();
  const lens = mesh(cached('eyeball', () => new THREE.SphereGeometry(1, 18, 12)), partMat('eyelens', () => creatureMat({ color: 0x07070c, roughness: 0.06, metalness: 0.2 }, E, { rim: 0x8090a0, rimK: 0.25 })));
  lens.scale.setScalar(r); g.add(lens);
  const cap = (k, th) => cached('eyecap' + th, () => new THREE.SphereGeometry(1, 18, 6, 0, Math.PI * 2, 0, th).rotateX(Math.PI / 2));
  const iris = mesh(cap(0, 0.62), partMat('iris:' + E.iris, () => creatureMat({ color: E.iris, emissive: E.iris, emissiveIntensity: 0.9, roughness: 0.2 }, E, { rimK: 0.1, pulse: 1.0 })));
  iris.scale.setScalar(r * 1.012); g.add(iris);
  const pupil = mesh(cap(1, 0.3), partMat('pupil', () => creatureMat({ color: 0x020203, roughness: 0.05 }, E, { rimK: 0 })));
  pupil.scale.setScalar(r * 1.02); g.add(pupil);
  const hl = partMat('eyehl', () => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const h1 = mesh(cached('eyehl', () => new THREE.SphereGeometry(1, 8, 6)), hl); h1.scale.setScalar(r * 0.24); h1.position.set(-sx * r * 0.32, r * 0.42, r * 0.86); g.add(h1);
  const h2 = mesh(h1.geometry, hl); h2.scale.setScalar(r * 0.11); h2.position.set(sx * r * 0.3, -r * 0.3, r * 0.94); g.add(h2);
  return g;
}

// ------------------------------------------------------------------ element features
// ctx: { sp, L, S, E, el, sc, F, rAt, onBone, near, bones, B, parts, M, br, hipP, chestP }
export function decorate(ctx) {
  const { el } = ctx;
  const f = FEATURES[el];
  if (f) f(ctx);
}
// helper: something sitting on the back at spine fraction f, a sideways offset (-1..1 of radius) and up-tilt
function onBack(ctx, obj, f, side = 0, lift = 0.9) {
  const c = ctx.sc.curve.getPointAt(Math.min(1, Math.max(0, f)));
  const r = ctx.rAt(f);
  ctx.onBone(ctx.near(f), obj, side * r * 0.7, c.y + r * (lift - Math.abs(side) * 0.35), c.z);
  return { c, r };
}
function crystalCluster(ctx, f, size, side = 0, tint) {
  const E = ctx.E, grp = new THREE.Group();
  const mat = crystalMat(E, tint);
  const r = new RNG(Math.floor(f * 1000) + 7);
  const n = 2 + Math.floor(r.next() * 2);
  for (let i = 0; i < n; i++) {
    const k = i === 0 ? 1 : 0.45 + r.next() * 0.3;
    const cm = mesh(crystalGeo(), mat, i === 0);
    cm.scale.set(size * k * 1.1, size * k, size * k * 1.1);
    cm.position.set(i ? (r.next() - 0.5) * size * 0.45 : 0, 0, i ? (r.next() - 0.5) * size * 0.45 : 0);
    cm.rotation.set((r.next() - 0.5) * 0.7 + (i ? 0.3 : 0), r.next() * 6, (r.next() - 0.5) * 0.7);
    grp.add(cm);
  }
  grp.rotation.z = -side * 0.5;
  onBack(ctx, grp, f, side, 0.82);
  ctx.parts.crystals = ctx.parts.crystals ?? []; ctx.parts.crystals.push(grp);
  return grp;
}
function leaf(ctx, color, len, curl = 0.25) { const m = mesh(leafGeo(curl), leafMat(color)); m.scale.set(len, len, len); return m; }
function flame(ctx, size, col = 0xff5a10, core = 0xffe080) {
  const g = new THREE.Group();
  const outer = mesh(flameGeo(), flameMat(col, core)); outer.scale.set(size, size * 1.6, size); g.add(outer);
  const inner = mesh(flameGeo(), flameMat(core, 0xffffff)); inner.scale.set(size * 0.55, size, size * 0.55); g.add(inner);
  outer.renderOrder = 5; inner.renderOrder = 6;
  ctx.parts.flames = ctx.parts.flames ?? []; ctx.parts.flames.push(g);
  return g;
}
function finAlong(ctx, f0, f1, height, mat, edgeMat) {
  // a membrane fin along the top of the spine between two fractions
  const pts = [], n = 12;
  for (let i = 0; i <= n; i++) { const f = f0 + (f1 - f0) * (i / n); const c = ctx.sc.curve.getPointAt(f); pts.push([c.z, c.y + ctx.rAt(f) * 0.85, Math.pow(Math.sin((i / n) * Math.PI), 0.8) * height * (0.8 + 0.2 * Math.sin(i * 1.7))]); }
  const shape = new THREE.Shape();
  shape.moveTo(-pts[0][0], pts[0][1]);
  for (const [z, y, h] of pts) shape.lineTo(-z, y + h);
  for (let i = pts.length - 1; i >= 0; i--) shape.lineTo(-pts[i][0], pts[i][1]);
  const g = new THREE.ShapeGeometry(shape); g.rotateY(Math.PI / 2);
  const fin = mesh(g, mat, true);
  const fMid = (f0 + f1) / 2, bn = ctx.near(fMid), bp = ctx.bonePos[ctx.idx[bn]];
  fin.position.set(-bp.x, -bp.y, -bp.z); ctx.B[bn].add(fin);
  if (edgeMat) {
    const curve = new THREE.CatmullRomCurve3(pts.map(([z, y, h]) => new THREE.Vector3(0, y + h, z)));
    const edge = mesh(new THREE.TubeGeometry(curve, 24, Math.max(0.012, height * 0.025), 5), edgeMat);
    edge.position.copy(fin.position); ctx.B[bn].add(edge);
  }
  return fin;
}
const FEATURES = {
  // ---- fire: obsidian spikes with molten roots, flame tufts, ember aura
  fire(ctx) {
    const { sp, F, L } = ctx, E = ctx.E;
    const obs = plainMat('obsidian', { color: 0x15100e, roughness: 0.18, metalness: 0.3, emissive: E.glow, emissiveIntensity: 0.0 }, E, { rimK: 0.35 });
    const big = sp.size > 5;
    if (big) {
      for (let i = 0; i < 9; i++) {
        const f = F.tailBase * 0.55 + (F.neckBase - F.tailBase * 0.55) * (i / 8);
        const r = ctx.rAt(f);
        const h = r * (0.35 + Math.sin((i / 8) * Math.PI) * 0.45);
        const sp2 = mesh(cached('spike', () => new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0)), obs, true);
        sp2.scale.set(h * 0.5, h, h * 0.5); sp2.rotation.x = 0.35;
        onBack(ctx, sp2, f, 0, 0.88);
        const root = mesh(cached('sph8', () => new THREE.SphereGeometry(1, 8, 6)), glowMat(E, null, 2.2)); root.scale.set(0.62, 0.1, 0.62);
        sp2.add(root);
      }
    }
    // flame tufts: tail tip, and the back of the head
    const tip = ctx.sc.curve.getPointAt(0.02);
    const fl = flame(ctx, ctx.rAt(0.06) * (big ? 2.2 : 3.2));
    ctx.onBone(ctx.near(0.02), fl, 0, tip.y + ctx.rAt(0.02) * 0.4, tip.z);
    fl.rotation.x = 0.5;
    if (ctx.parts.skull) {
      const hd = ctx.parts.headDims;
      for (let i = 0; i < (big ? 3 : 2); i++) {
        const f2 = flame(ctx, hd.h * (big ? 0.28 : 0.42) * (1 - i * 0.18));
        f2.position.set(0, hd.h * 0.42, hd.len * (0.12 + i * 0.16)); f2.rotation.x = 0.9;
        ctx.parts.skull.add(f2);
      }
    }
    if (L.feathers || sp.id === 'gallimimus') {
      // a burning plume on the tail
      for (let i = 0; i < 3; i++) { const c = ctx.sc.curve.getPointAt(0.05 + i * 0.05); const p = flame(ctx, ctx.rAt(0.08) * 2.6); ctx.onBone(ctx.near(0.05 + i * 0.05), p, 0, c.y + ctx.rAt(0.05) * 0.8, c.z); p.rotation.x = 1.1; }
    }
  },
  // ---- water: glowing fins, a glowing sail edge, bioluminescent dots
  water(ctx) {
    const { F, L, E } = ctx;
    const finMat = plainMat('fin:' + ctx.sp.id, { color: L.accent, roughness: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.72, emissive: E.glow, emissiveIntensity: 0.25 }, E, { rimK: 0.5 });
    const edge = glowMat(E, null, 1.8);
    finAlong(ctx, 0.04, F.tailBase * 0.9, ctx.rAt(F.tailBase * 0.5) * 2.2, finMat, edge);
    if (!L.sail) finAlong(ctx, F.hips, F.chest + (F.neckBase - F.chest) * 0.5, ctx.rAt(F.chest) * 0.75, finMat, edge);
    if (ctx.parts.sail) {
      const s = ctx.parts.sail;
      s.material = plainMat('sail:' + ctx.sp.id, { color: L.accent, roughness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.8, emissive: E.glow, emissiveIntensity: 0.9, emissiveMap: veinTex() }, E, { rimK: 0.4 });
      for (const rod of ctx.parts.sailRods ?? []) rod.material = glowMat(E, null, 1.6);
    }
    // cheek fins
    if (ctx.parts.skull) {
      const hd = ctx.parts.headDims;
      for (const sx of [-1, 1]) {
        const g = new THREE.CircleGeometry(hd.h * 0.55, 10, -0.4, Math.PI * 0.9);
        const cf = mesh(g, finMat); cf.position.set(sx * hd.w * 0.48, hd.h * 0.1, hd.len * 0.12); cf.rotation.set(0, sx > 0 ? -1.0 : Math.PI + 1.0, 0);
        ctx.parts.skull.add(cf);
      }
    }
    if (ctx.parts.crest) ctx.parts.crest.material = glowMat(E, null, 1.1);
  },
  // ---- electric: horns with glowing tips, glowing feather tips
  electric(ctx) {
    const { E } = ctx;
    if (ctx.parts.skull) {
      const hd = ctx.parts.headDims;
      const hornMat = plainMat('volthorn', { color: 0x1a1a24, roughness: 0.25, metalness: 0.4 }, E, { rimK: 0.3 });
      for (const sx of [-1, 1]) {
        const h = mesh(cached('bolthorn', () => { const g = new THREE.ConeGeometry(0.5, 1, 5); g.translate(0, 0.5, 0); return g; }), hornMat, true);
        h.scale.set(hd.h * 0.16, hd.h * 0.95, hd.h * 0.16);
        h.position.set(sx * hd.w * 0.3, hd.h * 0.4, hd.len * 0.05); h.rotation.set(1.15, 0, sx * -0.35);
        ctx.parts.skull.add(h);
        const tipG = mesh(cached('sph8', () => new THREE.SphereGeometry(1, 8, 6)), glowMat(E, null, 3));
        tipG.scale.set(0.45, 0.075, 0.45); tipG.position.y = 1.0; h.add(tipG);
        ctx.parts.sparkTips = ctx.parts.sparkTips ?? []; ctx.parts.sparkTips.push(tipG);
      }
    }
    for (const fe of ctx.parts.feathers ?? []) fe.material = glowFeather(E, fe.material.color.getHex());
    for (const w of ctx.parts.wings ?? []) if (w.material) w.material = glowFeather(E, ctx.L.accent);
  },
  // ---- grass: leaf crest, leaf tail, leafy collar; moss garden + flowers on big ones
  grass(ctx) {
    const { sp, F, L, E } = ctx;
    const leafCol = L.accent, leafCol2 = new THREE.Color(L.accent).offsetHSL(0.03, 0, 0.08).getHex();
    const big = sp.size > 5;
    if (ctx.parts.skull) {
      const hd = ctx.parts.headDims;
      for (let i = 0; i < 3; i++) { const lf = leaf(ctx, i % 2 ? leafCol2 : leafCol, hd.h * (1.05 - i * 0.12), 0.35); lf.position.set((i - 1) * hd.w * 0.18, hd.h * 0.38, hd.len * 0.05); lf.rotation.set(0.55 + i * 0.05, 0, (i - 1) * 0.6); ctx.parts.skull.add(lf); }
    }
    // leafy collar where the neck meets the body
    const cf = F.neckBase + (1 - F.neckBase) * 0.12, cc = ctx.sc.curve.getPointAt(cf), cr = ctx.rAt(cf);
    const nL = big ? 10 : 7;
    for (let i = 0; i < nL; i++) {
      const a = (i / nL) * Math.PI * 2;
      if (Math.cos(a) < -0.4) continue;
      const lf = leaf(ctx, i % 2 ? leafCol : leafCol2, cr * 1.5, 0.3);
      ctx.onBone(ctx.near(cf), lf, Math.sin(a) * cr * 0.9, cc.y + Math.cos(a) * cr * 0.9, cc.z + cr * 0.2);
      lf.rotation.order = 'ZYX'; lf.rotation.set(1.0, 0, -a);
    }
    // tail-tip leaves
    const tc = ctx.sc.curve.getPointAt(0.015), tr = Math.max(ctx.rAt(0.06), L.tail[1] * ctx.S * 0.5);
    for (const sx of [-1, 1]) { const lf = leaf(ctx, leafCol, tr * 4.5, 0.2); ctx.onBone(ctx.near(0.02), lf, sx * tr * 0.3, tc.y, tc.z); lf.rotation.set(Math.PI / 2 + 0.15, 0, sx * 0.55); }
    if (big) {
      // a mossy garden on the back with flowers and ferns
      const moss = plainMat('moss:' + sp.id, { color: new THREE.Color(L.accent).offsetHSL(0, -0.1, -0.08).getHex(), roughness: 0.95 }, E, { rimK: 0.25, rim: 0xd8ff90 });
      const n = sp.size > 15 ? 18 : 12;
      for (let i = 0; i < n; i++) {
        const f = F.tailBase * 0.7 + (F.neckBase - F.tailBase * 0.7) * (i / (n - 1));
        const r = ctx.rAt(f), side = Math.sin(i * 2.4) * 0.45;
        const cl = mesh(blobGeo('moss', 1, 0.28, i % 3), moss);
        cl.scale.set(r * 0.42, r * 0.16, r * 0.5); onBack(ctx, cl, f, side, 0.92);
        if (i % 3 === 1) { const fl = flower(ctx, r * 0.16, [0xff7ab0, 0xfff07a, 0xb08aff][i % 3]); onBack(ctx, fl, f, side * 1.1, 1.02); }
        if (i % 4 === 2) for (let k = 0; k < 3; k++) { const fern = leaf(ctx, leafCol2, r * 0.5, 0.5); onBack(ctx, fern, f + 0.004, side, 0.98); fern.rotation.set(-0.3, k * 2.1, 0.7); }
      }
      if (sp.size > 15) {
        // a sapling growing out of the brachiosaur's back
        const tf = (F.hips + F.chest) / 2, tcp = ctx.sc.curve.getPointAt(tf), trr = ctx.rAt(tf);
        const trunk = mesh(new THREE.CylinderGeometry(trr * 0.05, trr * 0.08, trr * 1.1, 6).translate(0, trr * 0.55, 0), plainMat('bark', { color: 0x6a4a30, roughness: 0.9 }, E, { rimK: 0.1 }), true);
        ctx.onBone(ctx.near(tf), trunk, 0, tcp.y + trr * 0.9, tcp.z);
        for (let k = 0; k < 5; k++) { const cn = mesh(blobGeo('moss', 1, 0.3, k), moss, true); cn.scale.setScalar(trr * (0.35 - k * 0.03)); cn.position.set(Math.sin(k * 2.5) * trr * 0.25, trr * (1.05 + k * 0.08), Math.cos(k * 2.5) * trr * 0.25); trunk.add(cn); }
        // hanging vines along the neck
        const vine = plainMat('vine', { color: 0x4a8a3a, roughness: 0.8 }, E, { rimK: 0.2 });
        for (let k = 0; k < 6; k++) {
          const f = F.neckBase + (1 - F.neckBase) * (0.1 + k * 0.13), c = ctx.sc.curve.getPointAt(Math.min(1, f)), r = ctx.rAt(Math.min(1, f));
          const len = r * (1.6 + (k % 3) * 0.7);
          const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(r * 0.15, -len * 0.5, r * 0.1), new THREE.Vector3(0, -len, 0)];
          const v = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 6, r * 0.04, 4), vine);
          ctx.onBone(ctx.near(Math.min(1, f)), v, (k % 2 ? 1 : -1) * r * 0.85, c.y + r * 0.2, c.z);
          for (let j = 1; j < 4; j++) { const lf = leaf(ctx, leafCol, r * 0.35, 0.2); lf.position.set(0, -len * j / 4, 0); lf.rotation.set(0.4, j * 1.9, 0.8); v.add(lf); }
        }
      }
    }
    if (ctx.parts.frill) {
      // the frill is ringed with big leaves
      const fr = ctx.parts.frill, rad = ctx.parts.headDims.frill;
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; const lf = leaf(ctx, i % 2 ? leafCol : leafCol2, rad * 0.55, 0.25); lf.position.set(Math.cos(a) * rad * 0.85, Math.sin(a) * rad * 0.85, -0.01); lf.rotation.z = a - Math.PI / 2; fr.add(lf); }
    }
  },
  // ---- crystal: crystal clusters replace plates, shards around the head
  crystal(ctx) {
    const { F, E, sp } = ctx;
    if (sp.look.plates) {
      const n = 9;
      for (let i = 0; i < n; i++) {
        const f = F.tailBase * 0.35 + (F.neckBase - F.tailBase * 0.35) * (i / (n - 1));
        const r = ctx.rAt(f), h = r * (0.55 + Math.sin((i / (n - 1)) * Math.PI) * 0.75);
        crystalCluster(ctx, f, h, (i % 2 ? 1 : -1) * 0.18);
      }
    } else {
      for (let i = 0; i < 5; i++) { const f = F.hips + (F.chest - F.hips) * (i / 4); crystalCluster(ctx, f, ctx.rAt(f) * 0.5, (i % 2 ? 1 : -1) * 0.25); }
    }
    if (ctx.parts.dome) { ctx.parts.dome.material = crystalMat(E, 0xd8c8ff); }
    if (ctx.parts.skull) {
      const hd = ctx.parts.headDims;
      for (let i = 0; i < 4; i++) { const a = -0.9 + i * 0.6; const c = mesh(crystalGeo(), crystalMat(E)); c.scale.set(hd.h * 0.22, hd.h * 0.5, hd.h * 0.22); c.position.set(Math.sin(a) * hd.w * 0.45, hd.h * 0.45, hd.len * 0.1 + Math.cos(a) * hd.h * 0.1); c.rotation.set(0.7, 0, -a * 0.8); ctx.parts.skull.add(c); }
    }
    if (ctx.parts.thag) for (const t of ctx.parts.thag) t.material = crystalMat(E);
  },
  // ---- earth: rock plates with glowing amber ore, a boulder club
  earth(ctx) {
    const { F, E, sp } = ctx;
    const rock = plainMat('rockplate', { color: 0x7a7068, roughness: 0.92, flatShading: true }, E, { rimK: 0.12 });
    const n = sp.look.armor ? 14 : 6;
    for (let i = 0; i < n; i++) {
      const f = F.tailBase * 0.6 + (F.chest - F.tailBase * 0.6) * (i / Math.max(1, n - 1));
      const r = ctx.rAt(f), side = (i % 2 ? 1 : -1) * (0.2 + (i % 3) * 0.12);
      const pl = mesh(blobGeo('rock', 0, 0.22, i % 4), rock, true);
      pl.scale.set(r * 0.42, r * 0.2, r * 0.38); pl.rotation.set(0.1, i, side * 0.4);
      onBack(ctx, pl, f, side, 0.9);
      if (i % 3 === 0) crystalCluster(ctx, f + 0.01, r * 0.32, -side, 0xffc070);
    }
    if (ctx.parts.club) { ctx.parts.club.material = rock; const g = mesh(cached('sph8', () => new THREE.SphereGeometry(1, 8, 6)), glowMat(E, null, 1.6)); g.scale.setScalar(0.55); ctx.parts.club.add(g); }
    if (ctx.parts.frill) {
      const hd = ctx.parts.headDims;
      const gem = mesh(crystalGeo(), crystalMat(E, 0xffc070)); gem.scale.set(hd.frill * 0.3, hd.frill * 0.35, hd.frill * 0.3); gem.position.set(0, hd.frill * 0.45, 0.02); gem.rotation.x = Math.PI / 2;
      ctx.parts.frill.add(gem);
    }
  },
  // ---- toxic: glowing spikes along the back, a glowing frill
  toxic(ctx) {
    const { F, E } = ctx;
    const spike = plainMat('toxspike', { color: 0x2a1a3a, roughness: 0.3, emissive: E.glow, emissiveIntensity: 0.0 }, E, { rimK: 0.4 });
    for (let i = 0; i < 10; i++) {
      const f = F.tailBase * 0.4 + (F.neckBase - F.tailBase * 0.4) * (i / 9);
      const r = ctx.rAt(f), h = r * (0.35 + Math.sin((i / 9) * Math.PI) * 0.3);
      const s = mesh(cached('spike', () => new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0)), spike, true);
      s.scale.set(h * 0.45, h, h * 0.45); s.rotation.x = 0.5; onBack(ctx, s, f, 0, 0.9);
      const tip = mesh(cached('sph8', () => new THREE.SphereGeometry(1, 8, 6)), glowMat(E, null, 2.4)); tip.scale.set(0.32, 0.14, 0.32); tip.position.y = 0.85; s.add(tip);
    }
    if (ctx.parts.neckFrill) ctx.parts.neckFrill.material = plainMat('toxfrill', { color: 0x6a2a8a, roughness: 0.4, side: THREE.DoubleSide, emissive: E.glow, emissiveIntensity: 0.5, emissiveMap: veinTex() }, E, { rimK: 0.3 });
    for (const c of ctx.parts.crests ?? []) c.material = glowMat(E, 0xc060ff, 0.9);
  },
  // ---- wind: a fluffy collar, glowing wing tips, streamers that flutter
  wind(ctx) {
    const { F, E, L } = ctx;
    const fluff = plainMat('fluff:' + ctx.sp.id, { color: 0xf4fbff, roughness: 0.95 }, E, { rimK: 0.55, rim: 0xffffff });
    const cf = F.neckBase + (1 - F.neckBase) * 0.15, c = ctx.sc.curve.getPointAt(cf), r = ctx.rAt(cf);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const b = mesh(blobGeo('fluff', 2, 0.18, i), fluff); b.scale.setScalar(r * 0.75); ctx.onBone(ctx.near(cf), b, Math.sin(a) * r * 0.6, c.y + Math.cos(a) * r * 0.6, c.z); }
    for (const w of ctx.parts.wings ?? []) {
      const tip = w.children?.[1];
      if (tip) { tip.material = plainMat('wingtip:' + ctx.sp.id, { color: L.pcolor, emissive: E.glow, emissiveIntensity: 0.45, roughness: 0.5, side: THREE.DoubleSide }, E, { rimK: 0.3 }); tip.scale.setScalar(0.8); }
    }
    if (ctx.parts.skull) {
      const hd = ctx.parts.headDims;
      const ribbon = partMat('streamer:' + L.accent, () => patchMaterial(new THREE.MeshStandardMaterial({ color: E.glow, emissive: E.glow, emissiveIntensity: 0.6, roughness: 0.5, side: THREE.DoubleSide }), { wind: { amp: 0.25, flutter: 0.12 } }));
      for (const sx of [-1, 1]) {
        const g = addWindWeights(new THREE.PlaneGeometry(hd.h * 0.18, hd.len * 1.6, 1, 8).translate(0, hd.len * 0.8, 0).rotateX(Math.PI / 2 + 0.2), { power: 1.3 });
        // weights along the streamer (it lies along +Z after the rotation)
        const p = g.attributes.position, w = g.attributes.aWind;
        for (let i = 0; i < p.count; i++) w.setX(i, Math.min(1, Math.max(0, p.getZ(i) / (hd.len * 1.6))));
        const s = mesh(g, ribbon); s.position.set(sx * hd.w * 0.2, hd.h * 0.45, hd.len * 0.2); ctx.parts.skull.add(s);
      }
    }
  },
};
let _veinTex = null;
function veinTex() {
  if (_veinTex) return _veinTex;
  const W = 64, H = 64, col = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / H, i = (y * W + x) * 4;
    const c = cell(u, v, 6, 6, 77), e = c.f2 - c.f1;
    const k = (1 - sstep(0.02, 0.07, e)) * 0.9 + (1 - sstep(0.1, 0.2, c.f1)) * 0.6;
    put(col, i, [k, k, k]);
  }
  _veinTex = dataTex(col, W, H);
  _veinTex.repeat.set(0.6, 0.6);
  return _veinTex;
}
function glowFeather(E, color) {
  return partMat(`gfeather:${color}`, () => creatureMat({ color, emissive: E.glow, emissiveIntensity: 0.55, roughness: 0.7, side: THREE.DoubleSide }, E, { rimK: 0.3, pulse: 3.2 }));
}
function flower(ctx, r, color) {
  const g = new THREE.Group();
  const pm = partMat('petal:' + color, () => patchMaterial(new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.12 }), { translucency: 0.5 }));
  const petal = cached('petal', () => new THREE.SphereGeometry(1, 8, 5).scale(0.5, 0.12, 1).translate(0, 0, 0.8));
  for (let i = 0; i < 5; i++) { const p = mesh(petal, pm); p.scale.setScalar(r); p.rotation.set(-0.35, (i / 5) * Math.PI * 2, 0); g.add(p); }
  const ctr = mesh(cached('sph8', () => new THREE.SphereGeometry(1, 8, 6)), partMat('flowerctr', () => new THREE.MeshStandardMaterial({ color: 0xffd040, roughness: 0.6, emissive: 0x806000, emissiveIntensity: 0.4 })));
  ctr.scale.setScalar(r * 0.38); g.add(ctr);
  return g;
}

// ------------------------------------------------------------------ particle aura
const _p = new THREE.Vector3();
export function emitAura(fx, d, dt) {
  const E = elementOf(d.sp);
  if (!E) return;
  d._aura = (d._aura ?? Math.random()) + dt * (E.fx === 'leaf' ? 0.6 : E.fx === 'dust' ? 0.8 : 2.4) * Math.min(3, 0.6 + d.sp.size * 0.15);
  if (d._aura < 1) return;
  d._aura -= 1;
  const R = d.rig, k = d.sizeK ?? 1;
  const names = R._boneNames ?? (R._boneNames = R.boneSpec.map((b) => b.name));
  const bn = R.bones[names[Math.floor(Math.random() * names.length)]];
  bn.getWorldPosition(_p);
  const r = R.br * k;
  _p.x += (Math.random() - 0.5) * r * 1.4; _p.y += r * (0.4 + Math.random() * 0.6); _p.z += (Math.random() - 0.5) * r * 1.4;
  const s = Math.max(0.6, Math.min(3, d.sp.size * 0.25));
  switch (E.fx) {
    case 'ember': fx.sprite('spark', _p.x, _p.y, _p.z, { vx: (Math.random() - 0.5) * 0.8, vy: 1.2 + Math.random() * 1.8, vz: (Math.random() - 0.5) * 0.8, life: 1.2 + Math.random(), size: 0.07 * s, color: Math.random() < 0.5 ? 0xffa030 : 0xff5a10, wobble: 2.5, drag: 0.6 }); break;
    case 'spark': fx.sprite('spark', _p.x, _p.y, _p.z, { vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.2) * 3, vz: (Math.random() - 0.5) * 4, life: 0.18 + Math.random() * 0.15, size: 0.09 * s, color: Math.random() < 0.5 ? 0xfff07a : 0x8ae8ff, drag: 4 }); break;
    case 'drip': fx.sprite('drop', _p.x, _p.y, _p.z, { vy: -0.5, life: 0.9, size: 0.07 * s, color: 0x9ae8ff, alpha: 0.8, grav: 9 }); break;
    case 'leaf': fx.sprite('leaf', _p.x, _p.y, _p.z, { vx: (Math.random() - 0.5) * 0.6, vy: -0.3, vz: (Math.random() - 0.5) * 0.6, life: 3, size: 0.12 * s, color: d.sp.look.accent, spin: (Math.random() - 0.5) * 5, wobble: 1.4, drag: 1.4 }); break;
    case 'glint': fx.sprite('star', _p.x, _p.y + r * 0.3, _p.z, { life: 0.6, size: 0.12 * s, color: 0xc8f4ff, grow: 0.1, fadeIn: 0.3 }); break;
    case 'dust': fx.sprite('puff', _p.x, _p.y - r * 0.6, _p.z, { vy: 0.2, life: 1.6, size: 0.2 * s, grow: 0.3, color: 0xb8a080, alpha: 0.3, drag: 1 }); break;
    case 'bubble': fx.sprite('bubble', _p.x, _p.y, _p.z, { vy: 0.5 + Math.random() * 0.4, life: 1.4, size: 0.08 * s, color: 0xb0ff40, alpha: 0.8, wobble: 1.5, drag: 0.8 }); break;
    case 'wisp': fx.sprite('smoke', _p.x, _p.y, _p.z, { vx: (Math.random() - 0.5) * 1.2, vy: 0.3, vz: (Math.random() - 0.5) * 1.2, life: 1.4, size: 0.18 * s, grow: 0.5, color: 0xe8fff8, alpha: 0.25, drag: 0.8, wobble: 1 }); break;
    default: break;
  }
}
