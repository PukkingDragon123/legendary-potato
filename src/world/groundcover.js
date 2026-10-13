// GPU-placed ground cover: grass blades, fern understory, reeds, flowers,
// mushrooms and pebbles. Each layer is one instanced draw on a toroidal grid
// that follows the camera; placement, height, density and colour are computed
// in the vertex shader from the world data textures, so nothing is uploaded
// per frame. Grass is cleared under buildings via a writable mask texture.
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';
import { GLSL_HASH } from './terrain.js';
import { BIOME, MAT } from './gen.js';
import { GeoBuilder } from '../gfx/geo.js';
import { PixelPainter, ramp, makeArrayTexture } from '../gfx/pixel.js';

const B = BIOME;

// ------------------------------------------------------------------ geometry
function grassClump(blades = 6, h = 0.55) {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + Math.random() * 0.8;
    const r = 0.04 + Math.random() * 0.17;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const hh = h * (0.6 + Math.random() * 0.6);
    const w = 0.016 + Math.random() * 0.016;
    const face = a + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const fx = Math.cos(face) * w, fz = Math.sin(face) * w;
    const lean = 0.18 + Math.random() * 0.25, la = a;
    const lx = Math.cos(la) * lean * hh, lz = Math.sin(la) * lean * hh;
    const n = new THREE.Vector3(0, 1, 0);
    const p0 = g.vert(new THREE.Vector3(bx - fx, 0, bz - fz), n, 0, 0, { aWind: 0, aLayer: 0 });
    const p1 = g.vert(new THREE.Vector3(bx + fx, 0, bz + fz), n, 1, 0, { aWind: 0, aLayer: 0 });
    const p2 = g.vert(new THREE.Vector3(bx - fx * 0.7 + lx * 0.35, hh * 0.5, bz - fz * 0.7 + lz * 0.35), n, 0, 0.5, { aWind: 0.3, aLayer: 0.5 });
    const p3 = g.vert(new THREE.Vector3(bx + fx * 0.7 + lx * 0.35, hh * 0.5, bz + fz * 0.7 + lz * 0.35), n, 1, 0.5, { aWind: 0.3, aLayer: 0.5 });
    const p4 = g.vert(new THREE.Vector3(bx + lx, hh, bz + lz), n, 0.5, 1, { aWind: 1, aLayer: 1 });
    g.idx.push(p0, p1, p3, p0, p3, p2, p2, p3, p4);
  }
  return g.build();
}

function fernGeo(fronds = 7) {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  const up = new THREE.Vector3(0, 1, 0);
  for (let f = 0; f < fronds; f++) {
    const az = (f / fronds) * Math.PI * 2 + Math.random() * 0.4;
    const len = 0.7 + Math.random() * 0.5;
    const elev = 0.9 + Math.random() * 0.35;
    const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az));
    const side = new THREE.Vector3(-Math.sin(az), 0.25, Math.cos(az)).normalize();
    const pts = [], sides = [], ws = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, s = t * len;
      pts.push(dir.clone().multiplyScalar(Math.cos(elev) * s * 1.4).addScaledVector(up, Math.sin(elev) * s - 0.9 * s * s / len));
      sides.push(side);
      ws.push(0.32 * (t < 0.15 ? 0.5 + t * 3 : 1));
    }
    g.ribbon(pts, sides, ws, { layer: 0, uvRect: [0, 0, 1, 1], wind: (t) => t * t, normalBias: up, normalBiasAmt: 0.6, ao: (t) => 0.6 + t * 0.4 });
  }
  return g.build();
}

function reedGeo() {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  const n = new THREE.Vector3(0, 1, 0);
  for (let b = 0; b < 7; b++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.6 + Math.random() * 1.1, w = 0.02;
    const face = Math.random() * Math.PI;
    const fx = Math.cos(face) * w, fz = Math.sin(face) * w;
    const lean = (Math.random() - 0.5) * 0.3;
    const p0 = g.vert(new THREE.Vector3(x - fx, 0, z - fz), n, 0, 0, { aWind: 0, aLayer: 0 });
    const p1 = g.vert(new THREE.Vector3(x + fx, 0, z + fz), n, 1, 0, { aWind: 0, aLayer: 0 });
    const p2 = g.vert(new THREE.Vector3(x - fx + lean, h, z - fz), n, 0, 1, { aWind: 1, aLayer: 1 });
    const p3 = g.vert(new THREE.Vector3(x + fx + lean, h, z + fz), n, 1, 1, { aWind: 1, aLayer: 1 });
    g.idx.push(p0, p1, p3, p0, p3, p2);
    if (b % 2 === 0) {
      // cattail head
      const c = new THREE.Vector3(x + lean * 0.9, h * 0.88, z);
      const hd = 0.045;
      const q0 = g.vert(c.clone().add(new THREE.Vector3(-hd, -0.1, 0)), n, 0, 0, { aWind: 0.9, aLayer: 2 });
      const q1 = g.vert(c.clone().add(new THREE.Vector3(hd, -0.1, 0)), n, 1, 0, { aWind: 0.9, aLayer: 2 });
      const q2 = g.vert(c.clone().add(new THREE.Vector3(hd, 0.1, 0)), n, 1, 1, { aWind: 0.95, aLayer: 2 });
      const q3 = g.vert(c.clone().add(new THREE.Vector3(-hd, 0.1, 0)), n, 0, 1, { aWind: 0.95, aLayer: 2 });
      g.idx.push(q0, q1, q2, q0, q2, q3);
    }
  }
  return g.build();
}

function flowerGeo() {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  const n = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 3; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.25;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.25 + Math.random() * 0.25;
    // stem
    const s0 = g.vert(new THREE.Vector3(x - 0.008, 0, z), n, 0, 0, { aWind: 0, aLayer: 0 });
    const s1 = g.vert(new THREE.Vector3(x + 0.008, 0, z), n, 1, 0, { aWind: 0, aLayer: 0 });
    const s2 = g.vert(new THREE.Vector3(x, h, z), n, 0.5, 1, { aWind: 1, aLayer: 0 });
    g.idx.push(s0, s1, s2);
    // flower head: two crossed tiny quads
    for (const rot of [0, Math.PI / 2]) {
      const dx = Math.cos(rot) * 0.06, dz = Math.sin(rot) * 0.06;
      const c = new THREE.Vector3(x, h, z);
      const q0 = g.vert(c.clone().add(new THREE.Vector3(-dx, -0.03, -dz)), n, 0, 0, { aWind: 1, aLayer: 3 });
      const q1 = g.vert(c.clone().add(new THREE.Vector3(dx, -0.03, dz)), n, 1, 0, { aWind: 1, aLayer: 3 });
      const q2 = g.vert(c.clone().add(new THREE.Vector3(dx, 0.06, dz)), n, 1, 1, { aWind: 1, aLayer: 3 });
      const q3 = g.vert(c.clone().add(new THREE.Vector3(-dx, 0.06, -dz)), n, 0, 1, { aWind: 1, aLayer: 3 });
      g.idx.push(q0, q1, q2, q0, q2, q3);
    }
    // flat top disk for when seen from above
    const c = new THREE.Vector3(x, h + 0.01, z);
    const t0 = g.vert(c.clone().add(new THREE.Vector3(-0.055, 0, -0.055)), n, 0, 0, { aWind: 1, aLayer: 3 });
    const t1 = g.vert(c.clone().add(new THREE.Vector3(0.055, 0, -0.055)), n, 1, 0, { aWind: 1, aLayer: 3 });
    const t2 = g.vert(c.clone().add(new THREE.Vector3(0.055, 0, 0.055)), n, 1, 1, { aWind: 1, aLayer: 3 });
    const t3 = g.vert(c.clone().add(new THREE.Vector3(-0.055, 0, 0.055)), n, 0, 1, { aWind: 1, aLayer: 3 });
    g.idx.push(t0, t2, t1, t0, t3, t2);
  }
  return g.build();
}

function mushroomGeo() {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  for (let k = 0; k < 3; k++) {
    const a = Math.random() * 6.28, r = Math.random() * 0.12;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.06 + Math.random() * 0.1, cr = 0.04 + Math.random() * 0.05;
    const stem = new THREE.CylinderGeometry(cr * 0.3, cr * 0.38, h, 5, 1);
    stem.translate(x, h / 2, z);
    g.addGeometry(stem, new THREE.Matrix4(), { layer: 4, wind: 0 });
    const cap = new THREE.SphereGeometry(cr, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.65, 1);
    cap.translate(x, h, z);
    g.addGeometry(cap, new THREE.Matrix4(), { layer: 5, wind: 0 });
  }
  return g.build();
}

function pebbleGeo() {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  for (let k = 0; k < 3; k++) {
    const r = 0.05 + Math.random() * 0.12;
    const s = new THREE.IcosahedronGeometry(r, 0);
    const a = Math.random() * 6.28, d = Math.random() * 0.4;
    s.scale(1, 0.55 + Math.random() * 0.3, 0.8 + Math.random() * 0.4);
    s.rotateY(Math.random() * 3);
    s.translate(Math.cos(a) * d, r * 0.2, Math.sin(a) * d);
    g.addGeometry(s, new THREE.Matrix4(), { layer: 6, wind: 0 });
  }
  return g.build();
}

// ------------------------------------------------------------------ textures
function fernFrondTex() {
  const p = new PixelPainter(32, 64, 77).clear();
  const pal = ramp(0x4f8a30, 5, { light: 0.24 });
  for (let y = 0; y < 64; y++) p.set(16, y, pal[0]);
  for (let y = 2; y < 62; y += 3) {
    const t = 1 - y / 64;
    const len = Math.max(2, 14 * (t < 0.3 ? 0.3 + t * 2.3 : 1 - (t - 0.3) * 0.7));
    for (const s of [-1, 1]) for (let k = 1; k < len; k++) p.set(16 + s * k, y - k * 0.45, pal[k > len - 2 ? 4 : s < 0 ? 3 : 2]);
  }
  return p;
}

// ------------------------------------------------------------------ layer definitions
// biome / material density tables
const BIOME_N = 14, MAT_N = 18;
function table(n, def, map) { const a = new Array(n).fill(def); for (const [k, v] of Object.entries(map)) a[+k] = v; return a; }

const LAYERS = [
  {
    name: 'grass', geo: () => grassClump(9, 0.5), cell: 0.36, N: 190, mode: 'grass', density: 1.0,
    biome: table(BIOME_N, 0.55, { [B.OCEAN]: 0, [B.BEACH]: 0.3, [B.SNOW]: 0, [B.VOLCANIC]: 0.15, [B.BADLANDS]: 0.1, [B.REDWOOD]: 0.35, [B.JUNGLE]: 0.65, [B.PRAIRIE]: 1, [B.HIGHLAND]: 1, [B.NESTING]: 0.9, [B.RIVER]: 0.75, [B.SWAMP]: 0.8, [B.CRATER]: 0.25 }),
    mat: table(MAT_N, 0, { [MAT.GRASS]: 1, [MAT.DRYGRASS]: 1, [MAT.JUNGLE]: 0.55, [MAT.MOSS]: 0.7, [MAT.SAND]: 0.25, [MAT.MUD]: 0.6, [MAT.NEEDLES]: 0.3, [MAT.DIRT]: 0.12, [MAT.CLAY]: 0.2, [MAT.GRAVEL]: 0.15 }),
    useGrass: true, scale: [0.75, 1.35], wind: { amp: 0.11, push: true }, fade: [0.72, 0.97],
  },
  {
    name: 'grassFar', geo: () => grassClump(12, 0.6), cell: 0.9, N: 130, mode: 'grass', density: 0.85, inner: 30,
    biome: table(BIOME_N, 0.55, { [B.OCEAN]: 0, [B.BEACH]: 0.3, [B.SNOW]: 0, [B.VOLCANIC]: 0.15, [B.BADLANDS]: 0.1, [B.REDWOOD]: 0.35, [B.JUNGLE]: 0.65, [B.PRAIRIE]: 1, [B.HIGHLAND]: 1, [B.NESTING]: 0.9, [B.RIVER]: 0.75, [B.SWAMP]: 0.8, [B.CRATER]: 0.25 }),
    mat: table(MAT_N, 0, { [MAT.GRASS]: 1, [MAT.DRYGRASS]: 1, [MAT.JUNGLE]: 0.55, [MAT.MOSS]: 0.7, [MAT.SAND]: 0.25, [MAT.MUD]: 0.6, [MAT.NEEDLES]: 0.3, [MAT.DIRT]: 0.12, [MAT.CLAY]: 0.2 }),
    useGrass: true, scale: [1.3, 2.0], wind: { amp: 0.14 }, fade: [0.75, 0.97],
  },
  {
    name: 'fern', geo: () => fernGeo(8), cell: 1.55, N: 84, mode: 'fern', density: 1,
    biome: table(BIOME_N, 0, { [B.JUNGLE]: 0.75, [B.REDWOOD]: 0.7, [B.SWAMP]: 0.45, [B.RIVER]: 0.4, [B.PRAIRIE]: 0.16, [B.HIGHLAND]: 0.12, [B.NESTING]: 0.06, [B.MOUNTAIN]: 0.05 }),
    mat: table(MAT_N, 0.15, { [MAT.JUNGLE]: 1, [MAT.MOSS]: 1, [MAT.NEEDLES]: 1, [MAT.GRASS]: 0.8, [MAT.MUD]: 0.5, [MAT.DIRT]: 0.1, [MAT.ROCK]: 0.08, [MAT.SAND]: 0.0, [MAT.GRAVEL]: 0.05 }),
    clump: 0.5, scale: [0.8, 1.7], wind: { amp: 0.12, flutter: 0.02, push: true }, fade: [0.8, 0.98],
  },
  {
    name: 'reeds', geo: reedGeo, cell: 1.1, N: 76, mode: 'reed', density: 0.55, clump: 0.45,
    biome: table(BIOME_N, 0.6, { [B.SWAMP]: 1, [B.RIVER]: 1, [B.OCEAN]: 0, [B.BEACH]: 0.15, [B.SNOW]: 0, [B.VOLCANIC]: 0 }),
    mat: table(MAT_N, 1, {}), shore: true, scale: [0.8, 1.3], wind: { amp: 0.16, push: true }, fade: [0.8, 0.98],
  },
  {
    name: 'flowers', geo: flowerGeo, cell: 1.3, N: 70, mode: 'flower', density: 1,
    biome: table(BIOME_N, 0, { [B.PRAIRIE]: 0.5, [B.HIGHLAND]: 0.4, [B.JUNGLE]: 0.08, [B.NESTING]: 0.15, [B.RIVER]: 0.15, [B.MOUNTAIN]: 0.1 }),
    mat: table(MAT_N, 0, { [MAT.GRASS]: 1, [MAT.DRYGRASS]: 0.6, [MAT.MOSS]: 0.5, [MAT.JUNGLE]: 0.4 }),
    clump: 0.62, scale: [0.8, 1.3], wind: { amp: 0.06, push: true }, fade: [0.75, 0.97],
  },
  {
    name: 'mushrooms', geo: mushroomGeo, cell: 2.2, N: 40, mode: 'mush', density: 1,
    biome: table(BIOME_N, 0, { [B.JUNGLE]: 0.18, [B.REDWOOD]: 0.35, [B.SWAMP]: 0.25 }),
    mat: table(MAT_N, 0.2, { [MAT.JUNGLE]: 1, [MAT.MOSS]: 1, [MAT.NEEDLES]: 1, [MAT.MUD]: 0.6 }),
    clump: 0.55, scale: [0.8, 1.6], fade: [0.75, 0.97],
  },
  {
    name: 'pebbles', geo: pebbleGeo, cell: 1.4, N: 64, mode: 'rock', density: 1,
    biome: table(BIOME_N, 0.25, { [B.OCEAN]: 0.1, [B.BEACH]: 0.3, [B.RIVER]: 0.9, [B.BADLANDS]: 0.6, [B.MOUNTAIN]: 0.7, [B.VOLCANIC]: 0.7, [B.CRATER]: 0.8, [B.SNOW]: 0.1 }),
    mat: table(MAT_N, 0.1, { [MAT.GRAVEL]: 1, [MAT.DIRT]: 0.6, [MAT.ROCK]: 0.8, [MAT.CLIFF ?? 16]: 0.5, [MAT.REDSAND]: 0.4, [MAT.ASH]: 0.6, [MAT.BASALT]: 0.7, [MAT.CLAY]: 0.6, [MAT.SAND]: 0.2, [MAT.GRASS]: 0.06 }),
    scale: [0.7, 1.8], fade: [0.75, 0.97],
  },
];

// per-material grass colours: base, tip
const GRASS_COLORS = {
  [MAT.GRASS]: [0x3d6a24, 0x9fcf52], [MAT.DRYGRASS]: [0x6e6a30, 0xd6c46a], [MAT.JUNGLE]: [0x2b4f1d, 0x6fa23e],
  [MAT.MOSS]: [0x325c20, 0x86b84a], [MAT.SAND]: [0x6a7034, 0xc9c07a], [MAT.MUD]: [0x3a5524, 0x8aa252],
  [MAT.NEEDLES]: [0x3a5426, 0x7c9a48], [MAT.DIRT]: [0x4a5e28, 0x9aa858], [MAT.CLAY]: [0x5a6430, 0xa8a868],
  [MAT.GRAVEL]: [0x4a6028, 0x92aa52], [MAT.SNOW]: [0x6a7a5a, 0xc8d0b0], [MAT.ASH]: [0x4a5030, 0x8a8a58],
};

const GC_VERTEX_HEAD = /* glsl */ `
${GLSL_HASH}
attribute vec2 aCell;
attribute float aLayer;
uniform vec2 uCamCell;
uniform float uCellSize;
uniform float uGridN;
uniform float uInner;
uniform vec2 uFade;
uniform vec2 uScale;
uniform float uDensityMul;
uniform float uClump;
uniform float uUseGrass;
uniform float uShore;
uniform float uLayerSeed;
uniform float uBiomeD[14];
uniform float uMatD[18];
uniform vec3 uBaseCol[18];
uniform vec3 uTipCol[18];
uniform sampler2D tHeight;
uniform sampler2D tSplat;
uniform sampler2D tBiome;
uniform sampler2D tWaterLvl;
uniform sampler2D tMask;
uniform float uHalf;
uniform float uSize;
varying vec3 vGCol;
varying float vGTip;
varying float vGLayer;
varying vec2 vGUv;
vec3 gcPos; float gcSc; float gcCa; float gcSa;
float gcHeight( vec2 xz ) { return texture2D( tHeight, ( xz + uHalf + 0.5 ) / ( uSize + 1.0 ) ).r; }
`;

function gcVertexMain(mode) {
  return /* glsl */ `
  {
    vec2 base = uCamCell - floor( uGridN * 0.5 );
    vec2 cellIdx = base + mod( aCell - base, uGridN );
    vec2 jit = vec2( hash21( cellIdx * 1.31 + uLayerSeed ), hash21( cellIdx * 0.77 + uLayerSeed + 9.0 ) );
    vec2 wxz = ( cellIdx + 0.1 + jit * 0.8 ) * uCellSize;
    vec2 suv = ( wxz + uHalf ) / uSize;
    vec4 sp = texture2D( tSplat, suv );
    float bio = floor( texture2D( tBiome, suv ).r * 255.0 + 0.5 );
    float sel = hash21( cellIdx * 2.17 + uLayerSeed + 3.0 );
    float mid = floor( ( sel < sp.b ? sp.g : sp.r ) * 255.0 + 0.5 );
    float dens = uBiomeD[ int( bio ) ] * uMatD[ int( mid ) ] * uDensityMul;
    if ( uUseGrass > 0.5 ) dens *= sp.a * 1.5;
    if ( uClump > 0.0 ) dens *= smoothstep( uClump - 0.25, uClump + 0.2, vnoise( wxz * 0.06 + uLayerSeed ) ) * 1.6;
    float h = gcHeight( wxz );
    float wl = texture2D( tWaterLvl, suv ).r;
    if ( uShore > 0.5 ) {
      float band = ( wl > -999.0 ) ? 1.0 - smoothstep( 0.15, 0.7, abs( h - wl + 0.05 ) ) : 0.0;
      // also look one cell over for banks right next to water
      float wl2 = texture2D( tWaterLvl, suv + vec2( 2.0 / uSize, 0.0 ) ).r;
      float wl3 = texture2D( tWaterLvl, suv - vec2( 0.0, 2.0 / uSize ) ).r;
      float near = max( wl2, wl3 ) > -999.0 ? 1.0 - smoothstep( 0.2, 1.0, h - max( wl2, wl3 ) ) : 0.0;
      dens *= max( band, near );
    } else {
      if ( wl > h - 0.08 ) dens = 0.0;
    }
    float mask = texture2D( tMask, suv ).r;
    dens *= 1.0 - mask;
    float keep = step( hash21( cellIdx * 3.71 + uLayerSeed + 17.0 ), dens );
    float d = distance( wxz, cameraPosition.xz );
    float R = uGridN * uCellSize * 0.5;
    float fade = 1.0 - smoothstep( R * uFade.x, R * uFade.y, d );
    if ( uInner > 0.0 ) fade *= smoothstep( uInner * 0.8, uInner * 1.1, d );
    float sc = mix( uScale.x, uScale.y, hash21( cellIdx * 5.3 + uLayerSeed ) ) * keep * fade;
    float ang = hash21( cellIdx * 7.7 + uLayerSeed ) * 6.2831;
    float ca = cos( ang ), sa = sin( ang );
    gcPos = vec3( wxz.x, h - 0.02, wxz.y ); gcSc = sc; gcCa = ca; gcSa = sa;
    objectNormal = vec3( objectNormal.x * ca - objectNormal.z * sa, objectNormal.y, objectNormal.x * sa + objectNormal.z * ca );
    vGUv = uv;
    // colours
    int mi = int( mid );
    float macro = 0.9 + 0.17 * vnoise( wxz * 0.018 ) + 0.06 * ( vnoise( wxz * 0.07 + 17.0 ) - 0.5 );
    vGTip = aLayer;
    vGLayer = aLayer;
    ${mode === 'grass' ? `
      vec3 bc = uBaseCol[ mi ], tc = uTipCol[ mi ];
      float var = hash21( cellIdx * 9.1 + uLayerSeed );
      tc = mix( tc, tc * vec3( 1.12, 1.05, 0.7 ), step( 0.82, var ) );
      vGCol = mix( bc, tc, aLayer ) * macro;
    ` : mode === 'fern' ? `
      float var = hash21( cellIdx * 9.1 + uLayerSeed );
      vGCol = mix( vec3( 0.42, 0.66, 0.26 ), vec3( 0.6, 0.72, 0.28 ), var ) * macro * 1.15;
      if ( var > 0.93 ) vGCol = vec3( 0.62, 0.42, 0.2 );
    ` : mode === 'reed' ? `
      vGCol = aLayer > 1.5 ? vec3( 0.36, 0.2, 0.1 ) : mix( vec3( 0.24, 0.36, 0.14 ), vec3( 0.48, 0.6, 0.26 ), aLayer ) * macro;
    ` : mode === 'flower' ? `
      float var = hash21( cellIdx * 4.1 + uLayerSeed );
      vec3 petal = var < 0.25 ? vec3( 0.95, 0.85, 0.3 ) : var < 0.5 ? vec3( 0.95, 0.95, 0.9 ) : var < 0.7 ? vec3( 0.75, 0.45, 0.9 ) : var < 0.85 ? vec3( 0.95, 0.5, 0.35 ) : vec3( 0.45, 0.6, 0.95 );
      vGCol = aLayer > 2.5 ? petal : vec3( 0.3, 0.5, 0.2 );
    ` : mode === 'mush' ? `
      float var = hash21( cellIdx * 4.1 + uLayerSeed );
      vec3 capc = var < 0.4 ? vec3( 0.75, 0.25, 0.15 ) : var < 0.7 ? vec3( 0.75, 0.6, 0.4 ) : vec3( 0.55, 0.85, 0.9 );
      vGCol = aLayer > 4.5 ? capc : vec3( 0.9, 0.86, 0.75 );
    ` : `
      float var = hash21( cellIdx * 4.1 + uLayerSeed );
      vGCol = mix( vec3( 0.42, 0.4, 0.37 ), vec3( 0.6, 0.55, 0.48 ), var ) * macro;
      if ( bio == 8.0 ) vGCol *= vec3( 1.25, 0.8, 0.6 );
      if ( bio == 11.0 ) vGCol *= 0.55;
    `}
  }
  `;
}

export class GroundCover {
  constructor(engine, world, terrain, opt = {}) {
    this.engine = engine;
    this.world = world;
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'groundcover';
    engine.scene.add(this.group);
    const { M } = world;
    this.biomeTex = new THREE.DataTexture(world.biome, M, M, THREE.RedFormat, THREE.UnsignedByteType);
    this.biomeTex.magFilter = this.biomeTex.minFilter = THREE.NearestFilter;
    this.biomeTex.needsUpdate = true;
    this.maskData = new Uint8Array(M * M);
    this.maskTex = new THREE.DataTexture(this.maskData, M, M, THREE.RedFormat, THREE.UnsignedByteType);
    this.maskTex.magFilter = this.maskTex.minFilter = THREE.NearestFilter;
    this.maskTex.needsUpdate = true;
    const frond = fernFrondTex();
    const leafArr = makeArrayTexture([frond]);
    this.fernTex = leafArr;
    const baseCols = new Array(18).fill(null).map(() => new THREE.Color(0x3d6a24));
    const tipCols = new Array(18).fill(null).map(() => new THREE.Color(0x9fcf52));
    for (const [k, [b, t]] of Object.entries(GRASS_COLORS)) { baseCols[+k] = new THREE.Color(b); tipCols[+k] = new THREE.Color(t); }
    this.layers = [];
    const densityScale = opt.density ?? engine.quality.grass;
    for (const def of LAYERS) {
      const N = Math.max(8, Math.round(def.N * Math.sqrt(Math.min(1.5, densityScale)) / (def.mode === 'grass' && densityScale < 1 ? 1.25 : 1)));
      const cell = def.cell * def.N / N;
      const geo = new THREE.InstancedBufferGeometry();
      const src = def.geo();
      for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.attributes[k]);
      geo.setIndex(src.index);
      const cells = new Float32Array(N * N * 2);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { cells[(j * N + i) * 2] = i; cells[(j * N + i) * 2 + 1] = j; }
      geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
      geo.instanceCount = N * N;
      const uniforms = {
        uCamCell: { value: new THREE.Vector2() }, uCellSize: { value: cell }, uGridN: { value: N }, uInner: { value: def.inner ?? 0 },
        uFade: { value: new THREE.Vector2(...def.fade) }, uScale: { value: new THREE.Vector2(...def.scale) }, uDensityMul: { value: def.density },
        uClump: { value: def.clump ?? 0 }, uUseGrass: { value: def.useGrass ? 1 : 0 }, uShore: { value: def.shore ? 1 : 0 }, uLayerSeed: { value: this.layers.length * 13.7 + 1 },
        uBiomeD: { value: def.biome }, uMatD: { value: def.mat }, uBaseCol: { value: baseCols }, uTipCol: { value: tipCols },
        tHeight: { value: terrain.heightTex }, tSplat: { value: terrain.splatTex }, tBiome: { value: this.biomeTex }, tWaterLvl: { value: terrain.waterTex }, tMask: { value: this.maskTex },
        uHalf: { value: world.half }, uSize: { value: world.size },
      };
      const isFern = def.mode === 'fern';
      const mat = def.mode === 'rock' || def.mode === 'mush'
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, flatShading: def.mode === 'rock' })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, alphaTest: isFern ? 0.5 : 0 });
      if (isFern && engine.quality.msaa > 0) mat.alphaToCoverage = true;
      patchMaterial(mat, {
        wind: def.wind,
        translucency: def.mode === 'grass' || isFern ? 0.5 : 0,
        uniforms: { ...uniforms, ...(isFern ? { tFern: { value: leafArr } } : {}) },
        vertex: { head: GC_VERTEX_HEAD, main: '' },
        fragment: {
          head: 'varying vec3 vGCol;\nvarying float vGTip;\nvarying float vGLayer;\nvarying vec2 vGUv;\n' + (isFern ? 'precision highp sampler2DArray;\nuniform sampler2DArray tFern;\n' : ''),
          map: isFern ? 'vec4 fc = texture( tFern, vec3( vGUv, 0.0 ) );\ndiffuseColor *= vec4( fc.rgb * vGCol * 1.9, fc.a );' : 'diffuseColor.rgb *= vGCol;',
        },
      });
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, r) => {
        prev(shader, r);
        // placement must happen before wind (which reads world position), so inject at beginnormal
        // placement runs right after beginnormal (so the normal is rotated before
        // defaultnormal uses it); the position transform runs after begin_vertex,
        // before the wind code that patchMaterial appended there.
        shader.vertexShader = shader.vertexShader
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + gcVertexMain(def.mode))
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = vec3( transformed.x * gcCa - transformed.z * gcSa, transformed.y, transformed.x * gcSa + transformed.z * gcCa ) * gcSc + gcPos;');
      };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = 'gc-' + def.name;
      this.group.add(mesh);
      this.layers.push({ def, mesh, uniforms, cell });
    }
  }

  // clear (1) or restore (0) grass in a world-space rectangle
  setMask(x0, z0, x1, z1, v = 255) {
    const { M, half } = this.world;
    const i0 = Math.max(0, Math.floor((x0 + half) / 2)), i1 = Math.min(M - 1, Math.floor((x1 + half) / 2));
    const j0 = Math.max(0, Math.floor((z0 + half) / 2)), j1 = Math.min(M - 1, Math.floor((z1 + half) / 2));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.maskData[j * M + i] = v;
    this.maskTex.needsUpdate = true;
  }
  clearCircle(x, z, r) {
    const { M, half } = this.world;
    for (let j = Math.floor((z - r + half) / 2); j <= Math.floor((z + r + half) / 2); j++)
      for (let i = Math.floor((x - r + half) / 2); i <= Math.floor((x + r + half) / 2); i++) {
        if (i < 0 || j < 0 || i >= M || j >= M) continue;
        const cx = -half + (i + 0.5) * 2, cz = -half + (j + 0.5) * 2;
        if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) this.maskData[j * M + i] = 255;
      }
    this.maskTex.needsUpdate = true;
  }

  update(camPos) {
    for (const L of this.layers) L.uniforms.uCamCell.value.set(Math.floor(camPos.x / L.cell), Math.floor(camPos.z / L.cell));
  }
}
