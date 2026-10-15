// GPU-placed ground cover: grass blades, fern understory, reeds, flowers,
// mushrooms and pebbles. Each layer is one instanced draw on a toroidal grid
// that follows the camera. Once per frame a tiny placement pass renders where
// every instance stands, how big it is and its colours into half-float
// textures, worked out from the world data textures (height, splat, biome,
// water, masks), so the vertex shader of the actual plants reads three texels
// and nothing is uploaded from the CPU. Grass is cleared under buildings via a
// writable mask texture.
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';
import { GLSL_HASH, GLSL_BARE, MUDDY_BANK } from './terrain.js';
import { BIOME, MAT } from './gen.js';
import { GeoBuilder } from '../gfx/geo.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PixelPainter, ramp, makeArrayTexture } from '../gfx/pixel.js';

const B = BIOME;

// ------------------------------------------------------------------ geometry
// A clump of curved, tapering blades. Normals lean to the sky and out of the
// clump (and are never flipped on back faces), so a meadow shades softly
// instead of flashing dark wherever a blade turns its back.
function grassClump(blades = 6, h = 0.55, segs = 1, w0 = 0.016, w1 = 0.032) {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  const up = new THREE.Vector3(0, 1, 0), nv = new THREE.Vector3(), pv = new THREE.Vector3();
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + Math.random() * 0.8;
    const r = 0.03 + Math.random() * 0.16;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const hh = h * (0.55 + Math.random() * 0.65);
    const w = w0 + Math.random() * (w1 - w0);
    const face = a + Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const fx = Math.cos(face), fz = Math.sin(face);
    const lean = 0.15 + Math.random() * 0.4, droop = Math.random() * 0.3;
    const ox = Math.cos(a), oz = Math.sin(a);
    const base = g.count;
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const out = lean * hh * t * t, y = hh * (t - droop * t * t * t);
      const cx = bx + ox * out, cz = bz + oz * out;
      const ww = k === segs ? w * 0.08 : w * (1 - t * 0.75);
      for (const sg of [-1, 1]) {
        // sky + out of the clump + a hint of the blade face, edges rounded
        nv.set(ox * 0.38 + fx * sg * 0.22 - fz * 0.12, 0, oz * 0.38 + fz * sg * 0.22 + fx * 0.12).add(up).normalize();
        g.vert(pv.set(cx + fx * ww * sg, y, cz + fz * ww * sg), nv, sg < 0 ? 0 : 1, t, { aWind: t * t, aLayer: t });
      }
    }
    for (let k = 0; k < segs; k++) { const q = base + k * 2; g.idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
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
  const up = new THREE.Vector3(0, 1, 0);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  // tapered leaves arching out of the clump (aLayer runs 0 at the root to 1 at the tip)
  for (let b = 0; b < 10; b++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.14;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = 0.75 + Math.random() * 0.95, w = 0.024 + Math.random() * 0.016;
    const face = a + Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const fx = Math.cos(face), fz = Math.sin(face);
    const lean = 0.12 + Math.random() * 0.32;
    const SEG = 4, base = g.count;
    for (let k = 0; k <= SEG; k++) {
      const t = k / SEG;
      const px = x + Math.cos(a) * lean * h * t * t, pz = z + Math.sin(a) * lean * h * t * t, py = h * t * (1 - 0.12 * t * t);
      const ww = w * (1 - t * 0.92);
      // normal: across the blade face, bent toward the sky so the clump is not dark
      nn.set(-fz, 0, fx).lerp(up, 0.65).normalize();
      g.vert(v.set(px - fx * ww, py, pz - fz * ww), nn, 0, t, { aWind: t * t, aLayer: t });
      g.vert(v.set(px + fx * ww, py, pz + fz * ww), nn, 1, t, { aWind: t * t, aLayer: t });
    }
    for (let k = 0; k < SEG; k++) { const q = base + k * 2; g.idx.push(q, q + 1, q + 3, q, q + 3, q + 2); }
  }
  // a few cattails: thin stalk with a velvety brown head
  for (let c = 0; c < 3; c++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.1;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 1.15 + Math.random() * 0.6;
    const lean = (Math.random() - 0.5) * 0.12;
    const pts = [new THREE.Vector3(x, 0, z), new THREE.Vector3(x + lean * 0.5, h * 0.5, z), new THREE.Vector3(x + lean, h, z)];
    g.tube(pts, [0.008, 0.007, 0.005], { segs: 4, layer: 0.7, wind: (t) => t * t * 0.9 });
    const head = [new THREE.Vector3(x + lean * 0.8, h * 0.72, z), new THREE.Vector3(x + lean * 0.86, h * 0.8, z), new THREE.Vector3(x + lean * 0.93, h * 0.9, z)];
    g.tube(head, [0.024, 0.03, 0.022], { segs: 7, layer: 2, wind: () => 0.75, capTop: true });
  }
  return g.build();
}

// little wildflowers: a stem with two leaves and a cup of kite-shaped petals
// around a bright centre (aLayer 3 = petals, 3.7 = centre)
function flowerGeo() {
  const g = new GeoBuilder(['aWind', 'aLayer']);
  const up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), nn = new THREE.Vector3();
  const kite = (o, dir, side, len, wid, lay, wind, nrm) => {
    const a = g.vert(o.clone(), nrm, 0.5, 0, { aWind: wind, aLayer: lay });
    const b = g.vert(o.clone().addScaledVector(dir, len * 0.4).addScaledVector(side, wid), nrm, 0, 0.5, { aWind: wind, aLayer: lay });
    const c = g.vert(o.clone().addScaledVector(dir, len), nrm, 0.5, 1, { aWind: wind, aLayer: lay });
    const d = g.vert(o.clone().addScaledVector(dir, len * 0.4).addScaledVector(side, -wid), nrm, 1, 0.5, { aWind: wind, aLayer: lay });
    g.idx.push(a, b, c, a, c, d);
  };
  for (let k = 0; k < 3; k++) {
    const a = Math.random() * Math.PI * 2, r = Math.random() * 0.25;
    const x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.22 + Math.random() * 0.26;
    const lean = new THREE.Vector3((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.06);
    const top = new THREE.Vector3(x, h, z).add(lean);
    // stem: a thin tapered strip
    const sd = new THREE.Vector3(Math.cos(a + 1.57), 0, Math.sin(a + 1.57)).multiplyScalar(0.006);
    const s0 = g.vert(v.set(x, 0, z).sub(sd), up, 0, 0, { aWind: 0, aLayer: 0 });
    const s1 = g.vert(v.set(x, 0, z).add(sd), up, 1, 0, { aWind: 0, aLayer: 0 });
    const s2 = g.vert(top.clone().addScaledVector(sd, 0.5), up, 1, 1, { aWind: 1, aLayer: 0 });
    const s3 = g.vert(top.clone().addScaledVector(sd, -0.5), up, 0, 1, { aWind: 1, aLayer: 0 });
    g.idx.push(s0, s1, s2, s0, s2, s3);
    // two leaves part-way up
    for (const q of [0.25, 0.45]) {
      const o = new THREE.Vector3(x, h * q, z).addScaledVector(lean, q);
      const la = a + q * 9;
      const dir = new THREE.Vector3(Math.cos(la), 0.55, Math.sin(la)).normalize();
      const side = new THREE.Vector3(-Math.sin(la), 0, Math.cos(la));
      kite(o, dir, side, 0.09, 0.022, 0.15, q, nn.copy(up).lerp(dir, 0.3).normalize());
    }
    // petals cupped upward
    const np = 5 + Math.floor(Math.random() * 3), cupK = 0.35 + Math.random() * 0.4;
    for (let p = 0; p < np; p++) {
      const pa = (p / np) * Math.PI * 2 + a;
      const dir = new THREE.Vector3(Math.cos(pa), cupK, Math.sin(pa)).normalize();
      const side = new THREE.Vector3(-Math.sin(pa), 0, Math.cos(pa));
      kite(top, dir, side, 0.05, 0.018, 3, 1, nn.copy(up).lerp(dir, 0.25).normalize());
    }
    // centre button
    const c0 = g.vert(top.clone().add(new THREE.Vector3(0, 0.012, 0)), up, 0.5, 0.5, { aWind: 1, aLayer: 3.7 });
    const ring = [];
    for (let q = 0; q < 6; q++) { const qa = (q / 6) * Math.PI * 2; ring.push(g.vert(top.clone().add(new THREE.Vector3(Math.cos(qa) * 0.014, 0.004, Math.sin(qa) * 0.014)), up, 0, 0, { aWind: 1, aLayer: 3.7 })); }
    for (let q = 0; q < 6; q++) g.idx.push(c0, ring[(q + 1) % 6], ring[q]);
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
    const r = 0.035 + Math.random() * 0.09;
    let s = new THREE.IcosahedronGeometry(r, 1);
    s.deleteAttribute('normal'); s.deleteAttribute('uv');
    s = mergeVertices(s);
    s.computeVertexNormals();
    const a = Math.random() * 6.28, d = Math.random() * 0.4;
    s.scale(1, 0.45 + Math.random() * 0.25, 0.75 + Math.random() * 0.4);
    s.rotateY(Math.random() * 3);
    s.translate(Math.cos(a) * d, -r * 0.05, Math.sin(a) * d);
    g.addGeometry(s, new THREE.Matrix4(), { layer: 6, wind: 0 });
  }
  return g.build();
}

// ------------------------------------------------------------------ textures
// a fern frond: solid, overlapping tapered leaflets along a midrib (thick
// enough that the alpha cut-out stays a leaf at a distance, not a dotted line)
function fernFrondTex() {
  const W = 64, H = 128;
  const p = new PixelPainter(W, H, 77).clear();
  const pal = ramp(0x4f8a30, 5, { light: 0.24 });
  const cx = W / 2;
  for (let y = 4; y < H - 2; y += 5) {
    const t = 1 - y / H; // 1 at the base, 0 at the tip
    const len = Math.max(3, 28 * (t < 0.25 ? 0.35 + t * 2.6 : 1 - (t - 0.25) * 0.75));
    const wid = 1.5 + t * 1.6;
    for (const sd of [-1, 1]) {
      // leaflet: a capsule from the midrib out and slightly up, tapering to a point
      for (let k = 0; k <= len; k++) {
        const u = k / len;
        const px = cx + sd * k, py = y - k * 0.5;
        const half = wid * (1 - u * u) + 0.6;
        for (let d = -Math.ceil(half); d <= Math.ceil(half); d++) {
          if (Math.abs(d) > half) continue;
          const lit = d < 0 ? (sd < 0 ? 3 : 2) : (sd < 0 ? 2 : 1);
          p.set(px, py + d, pal[u > 0.85 ? Math.min(4, lit + 1) : lit]);
        }
      }
    }
  }
  for (let y = 0; y < H; y++) { p.set(cx, y, pal[0]); p.set(cx - 1, y, pal[1]); }
  return p;
}

// ------------------------------------------------------------------ layer definitions
// biome / material density tables
const BIOME_N = 14, MAT_N = 18;
function table(n, def, map) { const a = new Array(n).fill(def); for (const [k, v] of Object.entries(map)) a[+k] = v; return a; }

const GRASS_BIOME = table(BIOME_N, 0.55, { [B.OCEAN]: 0, [B.BEACH]: 0.3, [B.SNOW]: 0, [B.VOLCANIC]: 0.15, [B.BADLANDS]: 0.1, [B.REDWOOD]: 0.35, [B.JUNGLE]: 0.65, [B.PRAIRIE]: 1, [B.HIGHLAND]: 1, [B.NESTING]: 0.9, [B.RIVER]: 0.75, [B.SWAMP]: 0.8, [B.CRATER]: 0.25 });
const GRASS_MAT = table(MAT_N, 0, { [MAT.GRASS]: 1, [MAT.DRYGRASS]: 1, [MAT.JUNGLE]: 0.55, [MAT.MOSS]: 0.7, [MAT.SAND]: 0.25, [MAT.MUD]: 0.6, [MAT.NEEDLES]: 0.3, [MAT.DIRT]: 0.12, [MAT.CLAY]: 0.2, [MAT.GRAVEL]: 0.15 });
const LAYERS = [
  // three rings of grass: curved many-segment blades right around you,
  // simpler clumps further out, broad tufts to the edge of the meadow
  {
    name: 'grass', geo: () => grassClump(8, 0.36, 3, 0.022, 0.04), cell: 0.2, N: 116, mode: 'grass', density: 1.0,
    biome: GRASS_BIOME, mat: GRASS_MAT, useGrass: true, scale: [0.65, 1.3], wind: { amp: 0.11, push: true }, fade: [0.78, 0.98],
  },
  {
    name: 'grassMid', geo: () => grassClump(9, 0.42, 2, 0.026, 0.046), cell: 0.42, N: 132, mode: 'grass', density: 0.95, inner: 10.5,
    biome: GRASS_BIOME, mat: GRASS_MAT, useGrass: true, scale: [0.8, 1.4], wind: { amp: 0.12, push: true }, fade: [0.8, 0.98],
  },
  {
    name: 'grassFar', geo: () => grassClump(12, 0.5, 1, 0.03, 0.055), cell: 0.95, N: 120, mode: 'grass', density: 0.85, inner: 26,
    biome: GRASS_BIOME, mat: GRASS_MAT, useGrass: true, scale: [1.2, 1.9], wind: { amp: 0.14 }, fade: [0.75, 0.97],
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
    mat: table(MAT_N, 1, {}), shore: true, calm: true, scale: [0.8, 1.3], wind: { amp: 0.16, push: true }, fade: [0.8, 0.98],
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
  [MAT.GRASS]: [0x335c1e, 0x8fc24c], [MAT.DRYGRASS]: [0x6a6630, 0xcab862], [MAT.JUNGLE]: [0x2b4f1d, 0x6fa23e],
  [MAT.MOSS]: [0x325c20, 0x86b84a], [MAT.SAND]: [0x6a7034, 0xc9c07a], [MAT.MUD]: [0x3a5524, 0x8aa252],
  [MAT.NEEDLES]: [0x3a5426, 0x7c9a48], [MAT.DIRT]: [0x4a5e28, 0x9aa858], [MAT.CLAY]: [0x5a6430, 0xa8a868],
  [MAT.GRAVEL]: [0x4a6028, 0x92aa52], [MAT.SNOW]: [0x6a7a5a, 0xc8d0b0], [MAT.ASH]: [0x4a5030, 0x8a8a58],
};

// The placement pass: one fragment per grid slot works out that slot's plant.
const PLACE_FRAG_HEAD = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
layout( location = 0 ) out vec4 oPos;
layout( location = 1 ) out vec4 oColA;
layout( location = 2 ) out vec4 oColB;
${GLSL_HASH}
${GLSL_BARE}
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
uniform float uCalm;
uniform float uBare;
uniform float uLayerSeed;
uniform float uBiomeD[14];
uniform float uMatD[18];
uniform float uMudOK[18];
uniform vec3 uBaseCol[18];
uniform vec3 uTipCol[18];
uniform sampler2D tHeight;
uniform sampler2D tSplat;
uniform sampler2D tBiome;
uniform sampler2D tWaterLvl;
uniform sampler2D tMask;
uniform sampler2DArray tAlbedo;
uniform float uHalf;
uniform float uSize;
uniform vec3 uCam;
uniform vec3 uRef;
float gcHeight( vec2 xz ) { return texture( tHeight, ( xz + uHalf + 0.5 ) / ( uSize + 1.0 ) ).r; }
`;

function placeFrag(mode) {
  return PLACE_FRAG_HEAD + /* glsl */ `
void main() {
  vec2 aCell = floor( gl_FragCoord.xy );
  vec2 base = uCamCell - floor( uGridN * 0.5 );
  vec2 cellIdx = base + mod( aCell - base, uGridN );
  vec2 jit = vec2( hash21( cellIdx * 1.31 + uLayerSeed ), hash21( cellIdx * 0.77 + uLayerSeed + 9.0 ) );
  vec2 wxz = ( cellIdx + 0.1 + jit * 0.8 ) * uCellSize;
  vec2 suv = ( wxz + uHalf ) / uSize;
  vec4 sp = texture( tSplat, suv );
  float bio = floor( texture( tBiome, suv ).r * 255.0 + 0.5 );
  float sel = hash21( cellIdx * 2.17 + uLayerSeed + 3.0 );
  float mid = floor( ( sel < sp.b ? sp.g : sp.r ) * 255.0 + 0.5 );
  float dens = uBiomeD[ int( bio ) ] * uMatD[ int( mid ) ] * uDensityMul;
  if ( uUseGrass > 0.5 ) dens *= sp.a * 1.5;
  if ( uClump > 0.0 ) dens *= smoothstep( uClump - 0.25, uClump + 0.2, vnoise( wxz * 0.06 + uLayerSeed ) ) * 1.6;
  float h = gcHeight( wxz );
  float wl = texture( tWaterLvl, suv ).r;
  if ( uBare > 0.5 ) {
    // nothing grows on the worn bare patches or the muddy banks the terrain paints
    float hx = gcHeight( wxz + vec2( 1.0, 0.0 ) ) - gcHeight( wxz - vec2( 1.0, 0.0 ) );
    float hz = gcHeight( wxz + vec2( 0.0, 1.0 ) ) - gcHeight( wxz - vec2( 0.0, 1.0 ) );
    float slopeN = 1.0 - inversesqrt( 1.0 + ( hx * hx + hz * hz ) * 0.25 );
    dens *= 1.0 - smoothstep( 0.3, 0.7, bareGround( wxz, slopeN ) );
    float o = 3.0 / uSize;
    float wlN = max( max( texture( tWaterLvl, suv + vec2( o, 0.0 ) ).r, texture( tWaterLvl, suv - vec2( o, 0.0 ) ).r ), max( texture( tWaterLvl, suv + vec2( 0.0, o ) ).r, texture( tWaterLvl, suv - vec2( 0.0, o ) ).r ) );
    wlN = max( wlN, wl );
    float bank = wlN > -999.0 ? 1.0 - smoothstep( 0.25, 0.95, h - wlN ) : 0.0;
    bank *= uMudOK[ int( mid ) ];
    dens *= 1.0 - smoothstep( 0.4, 0.8, bank );
  }
  if ( uShore > 0.5 ) {
    float band = ( wl > -999.0 ) ? 1.0 - smoothstep( 0.15, 0.7, abs( h - wl + 0.05 ) ) : 0.0;
    // also look one cell over for banks right next to water
    float wl2 = texture( tWaterLvl, suv + vec2( 2.0 / uSize, 0.0 ) ).r;
    float wl3 = texture( tWaterLvl, suv - vec2( 0.0, 2.0 / uSize ) ).r;
    float nearW = max( wl2, wl3 ) > -999.0 ? 1.0 - smoothstep( 0.2, 1.0, h - max( wl2, wl3 ) ) : 0.0;
    dens *= max( band, nearW );
  } else {
    if ( wl > h - 0.08 ) dens = 0.0;
  }
  vec2 mask = texture( tMask, suv ).rg;
  dens *= 1.0 - mask.r;
  if ( uCalm > 0.5 ) dens *= 1.0 - mask.g;
  float keep = step( hash21( cellIdx * 3.71 + uLayerSeed + 17.0 ), dens );
  float d = distance( wxz, uCam.xz );
  float R = uGridN * uCellSize * 0.5;
  float fade = 1.0 - smoothstep( R * uFade.x, R * uFade.y, d );
  if ( uInner > 0.0 ) fade *= smoothstep( uInner * 0.8, uInner * 1.1, d );
  // plants thin out individually at the edge of their ring instead of all shrinking
  // into a carpet of dots
  float vis = step( hash21( cellIdx * 11.3 + uLayerSeed + 5.0 ), fade );
  float sc = mix( uScale.x, uScale.y, hash21( cellIdx * 5.3 + uLayerSeed ) ) * keep * vis * mix( 0.65, 1.0, fade );
  float ang = hash21( cellIdx * 7.7 + uLayerSeed ) * 6.2831;
  // colours, with the same large-scale tints the terrain uses so plants and ground agree
  int mi = int( mid );
  float m1 = vnoise( wxz * 0.018 ), m2 = vnoise( wxz * 0.07 + 17.0 ), m3 = vnoise( wxz * 0.011 + 7.0 );
  float macro = 0.9 + 0.17 * m1 + 0.06 * ( m2 - 0.5 );
  vec3 tint = mix( vec3( 1.0 ), vec3( 1.06, 1.0, 0.86 ), smoothstep( 0.55, 0.9, m2 ) * 0.5 );
  vec3 A, Bc; float extra = 0.0;
  ${mode === 'grass' ? `
    vec3 bc = uBaseCol[ mi ], tc = uTipCol[ mi ];
    float var = hash21( cellIdx * 9.1 + uLayerSeed );
    // a few sun-bleached and a few bluish tufts among the green
    tc = mix( tc, tc * vec3( 1.12, 1.05, 0.7 ), step( 0.84, var ) );
    tc = mix( tc, tc * vec3( 0.85, 0.98, 1.04 ), step( var, 0.1 ) );
    tint *= mix( vec3( 1.0 ), vec3( 1.14, 1.04, 0.72 ), smoothstep( 0.58, 0.85, m3 ) * 0.55 );
    tint *= mix( vec3( 1.0 ), vec3( 0.84, 0.96, 0.92 ), smoothstep( 0.42, 0.15, m3 ) * 0.45 );
    // small patches a few metres across: lusher darker hollows, paler sunny tufts
    float pt = vnoise( wxz * 0.11 + 31.0 ) * 0.7 + vnoise( wxz * 0.37 + 5.0 ) * 0.3;
    tint *= mix( vec3( 0.78, 0.86, 0.8 ), vec3( 1.08, 1.05, 0.9 ), smoothstep( 0.25, 0.75, pt ) );
    // roots take the colour of the ground they grow out of
    vec3 gnd = textureLod( tAlbedo, vec3( wxz * 0.25, mid ), 5.0 ).rgb;
    A = mix( bc, gnd, 0.45 ) * macro * tint;
    Bc = tc * macro * tint * ( 0.8 + 0.3 * hash21( cellIdx * 3.3 + uLayerSeed ) );
  ` : mode === 'fern' ? `
    float var = hash21( cellIdx * 9.1 + uLayerSeed );
    A = mix( vec3( 0.42, 0.66, 0.26 ), vec3( 0.6, 0.72, 0.28 ), var ) * macro * 1.15;
    if ( var > 0.93 ) A = vec3( 0.62, 0.42, 0.2 );
    Bc = A;
  ` : mode === 'reed' ? `
    float var = hash21( cellIdx * 9.1 + uLayerSeed );
    A = vec3( 0.2, 0.3, 0.12 ) * macro;
    Bc = mix( vec3( 0.5, 0.6, 0.27 ), vec3( 0.62, 0.6, 0.32 ), var ) * macro;
    extra = var;
  ` : mode === 'flower' ? `
    float var = hash21( cellIdx * 4.1 + uLayerSeed );
    Bc = var < 0.25 ? vec3( 0.95, 0.85, 0.3 ) : var < 0.5 ? vec3( 0.95, 0.95, 0.9 ) : var < 0.7 ? vec3( 0.75, 0.45, 0.9 ) : var < 0.85 ? vec3( 0.95, 0.5, 0.35 ) : vec3( 0.45, 0.6, 0.95 );
    A = vec3( 0.3, 0.5, 0.2 ) * macro;
  ` : mode === 'mush' ? `
    float var = hash21( cellIdx * 4.1 + uLayerSeed );
    Bc = var < 0.4 ? vec3( 0.75, 0.25, 0.15 ) : var < 0.7 ? vec3( 0.75, 0.6, 0.4 ) : vec3( 0.55, 0.85, 0.9 );
    A = vec3( 0.9, 0.86, 0.75 );
  ` : `
    float var = hash21( cellIdx * 4.1 + uLayerSeed );
    A = mix( vec3( 0.3, 0.28, 0.26 ), vec3( 0.5, 0.46, 0.4 ), var ) * macro;
    if ( bio == 8.0 ) A *= vec3( 1.25, 0.8, 0.6 );
    if ( bio == 11.0 ) A *= 0.55;
    Bc = A;
  `}
  oPos = vec4( vec3( wxz.x, h - 0.02, wxz.y ) - uRef, sc );
  oColA = vec4( A, ang );
  oColB = vec4( Bc, extra );
}
`;
}

// The plants themselves read their slot's placement.
const GC_VERTEX_HEAD = /* glsl */ `
attribute vec2 aCell;
attribute float aLayer;
uniform sampler2D tP0;
uniform sampler2D tP1;
uniform sampler2D tP2;
uniform vec3 uRef;
varying vec3 vGCol;
varying float vGTip;
varying float vGLayer;
varying vec2 vGUv;
vec3 gcPos; float gcSc; float gcCa; float gcSa;
`;

function gcVertexMain(mode) {
  return /* glsl */ `
  {
    ivec2 slot = ivec2( aCell );
    vec4 p0 = texelFetch( tP0, slot, 0 ), p1 = texelFetch( tP1, slot, 0 ), p2 = texelFetch( tP2, slot, 0 );
    gcPos = p0.xyz + uRef; gcSc = p0.w;
    float ca = cos( p1.w ), sa = sin( p1.w );
    gcCa = ca; gcSa = sa;
    objectNormal = vec3( objectNormal.x * ca - objectNormal.z * sa, objectNormal.y, objectNormal.x * sa + objectNormal.z * ca );
    vGUv = uv;
    vGTip = aLayer;
    vGLayer = aLayer;
    ${mode === 'grass' ? 'vGCol = mix( p1.rgb, p2.rgb, aLayer );'
      : mode === 'fern' ? 'vGCol = p1.rgb;'
      : mode === 'reed' ? 'vGCol = aLayer > 1.5 ? vec3( 0.3, 0.17, 0.09 ) * ( 0.9 + 0.2 * p2.w ) : mix( p1.rgb, p2.rgb, aLayer );'
      : mode === 'flower' ? 'vGCol = aLayer > 3.5 ? vec3( 0.95, 0.72, 0.18 ) : aLayer > 2.5 ? p2.rgb : p1.rgb;'
      : mode === 'mush' ? 'vGCol = aLayer > 4.5 ? p2.rgb : p1.rgb;'
      : 'vGCol = p1.rgb;'}
  }
  `;
}

const PLACE_VERT = /* glsl */ `
void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

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
    // r: cleared under buildings, g: white water (no calm-water plants there)
    this.maskData = new Uint8Array(M * M * 2);
    this.maskTex = new THREE.DataTexture(this.maskData, M, M, THREE.RGFormat, THREE.UnsignedByteType);
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
    // placement pass plumbing: a full-screen triangle per layer
    this.placeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.camPos = new THREE.Vector3();
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
      // where each slot's plant stands (relative to uRef), its size, rotation and colours
      const rt = new THREE.WebGLRenderTarget(N, N, { count: 3, type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false });
      const uRef = { value: new THREE.Vector3() };
      const uniforms = {
        uCamCell: { value: new THREE.Vector2() }, uCellSize: { value: cell }, uGridN: { value: N }, uInner: { value: def.inner ?? 0 },
        uFade: { value: new THREE.Vector2(...def.fade) }, uScale: { value: new THREE.Vector2(...def.scale) }, uDensityMul: { value: def.density },
        uClump: { value: def.clump ?? 0 }, uUseGrass: { value: def.useGrass ? 1 : 0 }, uShore: { value: def.shore ? 1 : 0 }, uCalm: { value: def.calm ? 1 : 0 }, uBare: { value: def.shore || def.mode === 'rock' ? 0 : 1 }, uLayerSeed: { value: this.layers.length * 13.7 + 1 },
        uBiomeD: { value: def.biome }, uMatD: { value: def.mat }, uMudOK: { value: MUDDY_BANK }, uBaseCol: { value: baseCols }, uTipCol: { value: tipCols },
        tHeight: { value: terrain.heightTex }, tSplat: { value: terrain.splatTex }, tBiome: { value: this.biomeTex }, tWaterLvl: { value: terrain.waterTex }, tMask: { value: this.maskTex },
        tAlbedo: { value: terrain.textures.albedo },
        uHalf: { value: world.half }, uSize: { value: world.size }, uCam: { value: this.camPos }, uRef,
      };
      const placeMat = new THREE.ShaderMaterial({ glslVersion: THREE.GLSL3, uniforms, vertexShader: PLACE_VERT, fragmentShader: placeFrag(def.mode), depthTest: false, depthWrite: false });
      const placeScene = new THREE.Scene();
      const quad = new THREE.Mesh(tri, placeMat);
      quad.frustumCulled = false;
      placeScene.add(quad);
      const isFern = def.mode === 'fern';
      const mat = def.mode === 'rock' || def.mode === 'mush'
        ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: def.mode === 'rock' ? 0.75 : 0.85 })
        : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, side: THREE.DoubleSide, alphaTest: isFern ? 0.5 : 0 });
      const drawUniforms = { tP0: { value: rt.textures[0] }, tP1: { value: rt.textures[1] }, tP2: { value: rt.textures[2] }, uRef };
      const twoSided = mat.side === THREE.DoubleSide;
      patchMaterial(mat, {
        wind: def.wind,
        translucency: def.mode === 'grass' || isFern ? 0.5 : 0,
        uniforms: { ...drawUniforms, ...(isFern ? { tFern: { value: leafArr } } : {}) },
        vertex: { head: GC_VERTEX_HEAD, main: '' },
        fragment: {
          head: 'varying vec3 vGCol;\nvarying float vGTip;\nvarying float vGLayer;\nvarying vec2 vGUv;\n' + (isFern ? 'precision highp sampler2DArray;\nuniform sampler2DArray tFern;\n' : ''),
          map: isFern ? 'vec4 fc = texture( tFern, vec3( vGUv, 0.0 ) );\ndiffuseColor *= vec4( fc.rgb * vGCol * 1.5, fc.a );' : 'diffuseColor.rgb *= vGCol;',
        },
      });
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = (shader, r) => {
        prev(shader, r);
        // placement runs right after beginnormal (so the normal is rotated before
        // defaultnormal uses it); the position transform runs after begin_vertex,
        // before the wind code that patchMaterial appended there.
        shader.vertexShader = shader.vertexShader
          .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + gcVertexMain(def.mode))
          .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = vec3( transformed.x * gcCa - transformed.z * gcSa, transformed.y, transformed.x * gcSa + transformed.z * gcCa ) * gcSc + gcPos;');
        // plants keep their sky-leaning normals on both faces (no dark backs)
        if (twoSided) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal *= faceDirection;');
      };
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.name = 'gc-' + def.name;
      this.group.add(mesh);
      this.layers.push({ def, mesh, uniforms, cell, rt, placeScene, uRef });
    }
  }

  // clear (1) or restore (0) grass in a world-space rectangle
  setMask(x0, z0, x1, z1, v = 255) {
    const { M, half } = this.world;
    const i0 = Math.max(0, Math.floor((x0 + half) / 2)), i1 = Math.min(M - 1, Math.floor((x1 + half) / 2));
    const j0 = Math.max(0, Math.floor((z0 + half) / 2)), j1 = Math.min(M - 1, Math.floor((z1 + half) / 2));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) this.maskData[(j * M + i) * 2] = v;
    this.maskTex.needsUpdate = true;
  }
  clearCircle(x, z, r) {
    const { M, half } = this.world;
    for (let j = Math.floor((z - r + half) / 2); j <= Math.floor((z + r + half) / 2); j++)
      for (let i = Math.floor((x - r + half) / 2); i <= Math.floor((x + r + half) / 2); i++) {
        if (i < 0 || j < 0 || i >= M || j >= M) continue;
        const cx = -half + (i + 0.5) * 2, cz = -half + (j + 0.5) * 2;
        if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) this.maskData[(j * M + i) * 2] = 255;
      }
    this.maskTex.needsUpdate = true;
  }
  // mark fast water (rapids, falls) where reeds and lilies cannot root
  markWild(x, z, r) {
    const { M, half } = this.world;
    for (let j = Math.floor((z - r + half) / 2); j <= Math.floor((z + r + half) / 2); j++)
      for (let i = Math.floor((x - r + half) / 2); i <= Math.floor((x + r + half) / 2); i++) {
        if (i < 0 || j < 0 || i >= M || j >= M) continue;
        const cx = -half + (i + 0.5) * 2, cz = -half + (j + 0.5) * 2;
        if ((cx - x) ** 2 + (cz - z) ** 2 < r * r) this.maskData[(j * M + i) * 2 + 1] = 255;
      }
    this.maskTex.needsUpdate = true;
  }

  update(camPos) {
    const r = this.engine.renderer;
    const prevRT = r.getRenderTarget();
    this.camPos.copy(camPos);
    for (const L of this.layers) {
      const cx = Math.floor(camPos.x / L.cell), cz = Math.floor(camPos.z / L.cell);
      L.uniforms.uCamCell.value.set(cx, cz);
      // positions are stored relative to this (half floats keep centimetres near it)
      L.uRef.value.set(cx * L.cell, Math.floor(camPos.y), cz * L.cell);
      r.setRenderTarget(L.rt);
      r.render(L.placeScene, this.placeCam);
    }
    r.setRenderTarget(prevRT);
  }
}
