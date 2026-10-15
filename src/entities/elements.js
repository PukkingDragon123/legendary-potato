// Creature elements (fire, water, electric, grass, crystal, earth, toxic,
// wind): their colours, the rigid parts creatures wear (crystals, flames,
// leaves, flowers) and the little particle aura each element gives off.
import * as THREE from 'three';
import { patchMaterial, G } from '../gfx/shaderlib.js';
import { clamp01, sstep, dataTex, put } from '../gfx/paint.js';

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
export const crystalGeo = () => cached('crystal', () => {
  const pts = [new THREE.Vector2(0.0001, -0.05), new THREE.Vector2(0.15, 0.0), new THREE.Vector2(0.17, 0.68), new THREE.Vector2(0.0001, 1.0)];
  const g = new THREE.LatheGeometry(pts, 6);
  return g.toNonIndexed();
});
// a leaf blade: tapered, cupped and curled, 1 unit long on +Y
export const leafGeo = (curl = 0.25) => cached('leaf' + curl, () => {
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
export const flameGeo = () => cached('flame', () => {
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
export function leafMat(color) {
  return partMat('leaf:' + color, () => patchMaterial(new THREE.MeshStandardMaterial({ color, map: leafTex(), roughness: 0.55, side: THREE.DoubleSide }), { translucency: 0.6, wind: { amp: 0.04, flutter: 0.02 } }));
}
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

export function flower(ctx, r, color) {
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
