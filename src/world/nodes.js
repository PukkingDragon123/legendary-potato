// Harvestable resource nodes (everything that is not a tree): boulders, ore,
// bushes, pickups, crash debris... Generated deterministically per 32 m cell
// around the players, rendered with one InstancedMesh per node type, with
// colliders and persistent depletion state (networked by id).
import * as THREE from 'three';
import { RNG, Simplex, tileFbm, tileNoise, hash2i } from '../core/rng.js';
import { BIOME } from './gen.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { sstep, rgb, mix3, mul3, cell, put } from '../gfx/paint.js';
import { GLSL_HASH } from './terrain.js';
import { GeoBuilder } from '../gfx/geo.js';
import { LEAF } from '../gfx/plantTextures.js';

const CELL = 32;
const RANGE = 170;

// ------------------------------------------------------------------ node type table
// drops: [itemId, min, max, chance]
export const NODE_TYPES = {
  boulder: { name: 'Boulder', tool: 'pick', hp: 70, drops: [['stone', 3, 6], ['flint', 0, 2]], regrow: 1800, solid: true, model: 'rock', size: [0.9, 2.2] },
  boulder_big: { name: 'Big Rock', tool: 'pick', hp: 160, drops: [['stone', 6, 10], ['flint', 1, 3]], regrow: 2400, solid: true, model: 'rock', size: [2.2, 4.2] },
  rock_small: { name: 'Stones', tool: 'hand', hp: 1, drops: [['stone', 1, 2]], regrow: 600, model: 'pebble', size: [0.25, 0.4], pickup: true },
  sticks: { name: 'Sticks', tool: 'hand', hp: 1, drops: [['stick', 2, 3]], regrow: 500, model: 'sticks', size: [1, 1], pickup: true },
  flint: { name: 'Flint Nodule', tool: 'pick', hp: 30, drops: [['flint', 2, 3], ['stone', 0, 1]], regrow: 1500, model: 'flint', size: [0.45, 0.7] },
  fiber: { name: 'Fiber Grass', tool: 'hand', hp: 1, drops: [['fiber', 3, 5]], regrow: 420, model: 'tuft', size: [0.9, 1.3], pickup: true, sickleBonus: 2 },
  fern: { name: 'Fern Clump', tool: 'hand', hp: 1, drops: [['fiber', 2, 4], ['fiddlehead', 0, 2, 0.5], ['seed_fern', 0, 1, 0.25]], regrow: 600, model: 'fern', size: [0.9, 1.4], pickup: true },
  bush_red: { name: 'Redberry Bush', tool: 'hand', hp: 1, drops: [['redberry', 3, 6], ['fiber', 1, 2], ['seed_berry', 0, 1, 0.3]], regrow: 540, model: 'bush', berry: 0xd8302a, keep: true, size: [0.9, 1.3] },
  bush_blue: { name: 'Blueberry Bush', tool: 'hand', hp: 1, drops: [['blueberry', 3, 6], ['fiber', 1, 2]], regrow: 540, model: 'bush', berry: 0x3b4fb8, keep: true, size: [0.9, 1.3] },
  bush_sun: { name: 'Sunberry Bush', tool: 'hand', hp: 1, drops: [['sunberry', 2, 5], ['fiber', 1, 2]], regrow: 600, model: 'bush', berry: 0xf2b630, keep: true, size: [0.9, 1.2] },
  bush_snooze: { name: 'Snoozeberry Bush', tool: 'hand', hp: 1, drops: [['snoozeberry', 3, 6], ['seed_snooze', 0, 1, 0.3]], regrow: 720, model: 'bush', berry: 0x7a3aa8, keep: true, size: [0.8, 1.1] },
  herb: { name: 'Healing Herb', tool: 'hand', hp: 1, drops: [['herb', 1, 2]], regrow: 900, model: 'herb', size: [0.6, 0.9], pickup: true },
  mushrooms: { name: 'Mushrooms', tool: 'hand', hp: 1, drops: [['mushroom_brown', 1, 3], ['mushroom_red', 0, 1, 0.4]], regrow: 800, model: 'mush', size: [0.8, 1.2], pickup: true },
  scrap: { name: 'Van Debris', tool: 'hand', hp: 24, drops: [['scrap', 2, 4], ['wire', 0, 2, 0.6], ['circuit', 0, 1, 0.35]], regrow: 0, model: 'debris', size: [0.9, 1.3], solid: false },
  crate: { name: 'Supply Box', tool: 'hand', hp: 1, drops: [['noodles', 1, 3], ['energybar', 1, 2], ['battery', 0, 1, 0.4]], regrow: 0, model: 'crate', size: [1, 1], pickup: true },
  ore_iron: { name: 'Meteorite Chunk', tool: 'pick', hp: 120, drops: [['iron', 2, 4], ['stone', 1, 2]], regrow: 3000, model: 'meteor', solid: true, size: [0.8, 1.6], tier: 1 },
  ore_copper: { name: 'Copper Vein', tool: 'pick', hp: 100, drops: [['copper', 2, 4], ['stone', 1, 2], ['mineral', 0, 1, 0.2]], regrow: 2400, model: 'copper', solid: true, size: [0.9, 1.6] },
  sulfur: { name: 'Sulfur Crust', tool: 'pick', hp: 40, drops: [['sulfur', 2, 4]], regrow: 1800, model: 'sulfur', size: [0.7, 1.2] },
  obsidian: { name: 'Obsidian', tool: 'pick', hp: 90, drops: [['obsidian', 2, 3], ['stone', 0, 1]], regrow: 2400, model: 'obsidian', solid: true, size: [0.8, 1.5] },
  crystal: { name: 'Chrono Crystals', tool: 'pick', hp: 150, drops: [['crystal', 1, 1], ['mineral', 1, 2]], regrow: 7200, model: 'crystal', solid: true, size: [0.9, 1.4], tier: 2 },
  clay: { name: 'Clay Bank', tool: 'hand', hp: 10, drops: [['clay', 2, 4]], regrow: 900, model: 'clay', size: [0.9, 1.3], shovelBonus: 2 },
  fossil: { name: 'Fossil Rock', tool: 'pick', hp: 60, drops: [['fossil', 1, 2], ['bone', 1, 3], ['amber', 0, 1, 0.3], ['amber_bug', 0, 1, 0.08], ['coprolite', 0, 1, 0.3]], regrow: 3600, model: 'fossil', solid: true, size: [0.9, 1.5] },
  tar: { name: 'Tar Seep', tool: 'hand', hp: 1, drops: [['tar', 2, 4]], regrow: 600, model: 'tar', size: [1.2, 1.8], pickup: true },
  salt: { name: 'Salt Crust', tool: 'hand', hp: 1, drops: [['salt', 1, 3]], regrow: 900, model: 'salt', size: [0.8, 1.2], pickup: true },
  driftwood: { name: 'Driftwood', tool: 'hand', hp: 1, drops: [['stick', 2, 4], ['log', 0, 1, 0.5]], regrow: 900, model: 'driftwood', size: [1, 1.4], pickup: true },
  hive: { name: 'Wild Beehive', tool: 'hand', hp: 1, drops: [['honey', 1, 2], ['resin', 0, 1, 0.5]], regrow: 1200, model: 'hive', size: [0.8, 1.1], stings: true },
  sand: { name: 'Sand', tool: 'hand', hp: 1, drops: [['sand', 2, 3]], regrow: 400, model: 'sandpile', size: [0.8, 1.2], pickup: true },
  dung: { name: 'Critter Dung', tool: 'hand', hp: 1, drops: [['dung', 1, 2]], regrow: 900, model: 'dung', size: [0.7, 1.15], pickup: true },
};

// per-biome spawn weights per 32 m cell (expected count)
const SPAWN = {
  [BIOME.JUNGLE]: { boulder: 2.2, boulder_big: 0.35, rock_small: 3, sticks: 4, flint: 0.5, fiber: 4, fern: 4, bush_red: 2.2, bush_blue: 0.8, bush_sun: 0.4, bush_snooze: 0.6, herb: 0.7, mushrooms: 1.0, hive: 0.15, dung: 0.4 },
  [BIOME.RIVER]: { boulder: 3.2, rock_small: 3, sticks: 2, flint: 0.6, fiber: 3, fern: 2, clay: 1.6, bush_red: 0.8, herb: 0.5, bush_blue: 0.6, dung: 0.35 },
  [BIOME.PRAIRIE]: { boulder: 0.8, rock_small: 2, sticks: 1, fiber: 5, fern: 1, bush_red: 1.2, bush_sun: 1.4, bush_blue: 0.8, herb: 0.6, flint: 0.4, hive: 0.05, dung: 0.9 },
  [BIOME.REDWOOD]: { boulder: 1.2, rock_small: 1.5, sticks: 4, fern: 5, fiber: 2, mushrooms: 2.2, bush_snooze: 0.8, bush_blue: 0.8, herb: 0.6, hive: 0.15, dung: 0.35 },
  [BIOME.SWAMP]: { rock_small: 1, sticks: 3, fiber: 4, fern: 3, mushrooms: 1.6, bush_snooze: 1.4, herb: 1.0, clay: 1.0, dung: 0.5 },
  [BIOME.NESTING]: { boulder: 1.4, rock_small: 2, sticks: 2, fiber: 3, bush_red: 0.6, bush_sun: 0.6, flint: 0.6, dung: 1.2 },
  [BIOME.BEACH]: { rock_small: 2, driftwood: 1.2, salt: 0.8, sand: 1.2, fiber: 1 },
  [BIOME.HIGHLAND]: { boulder: 1.8, boulder_big: 0.25, rock_small: 2, fiber: 4, bush_red: 0.8, bush_blue: 1.2, bush_sun: 0.8, flint: 0.6, herb: 0.6, dung: 0.5 },
  [BIOME.BADLANDS]: { boulder: 2.2, boulder_big: 0.5, rock_small: 3, fossil: 1.2, flint: 0.8, fiber: 0.4 },
  [BIOME.MOUNTAIN]: { boulder: 2.6, boulder_big: 0.6, rock_small: 2, ore_copper: 0.6, flint: 0.7, fiber: 0.6, herb: 0.3 },
  [BIOME.SNOW]: { boulder: 1, boulder_big: 0.4, ore_copper: 0.3 },
  [BIOME.VOLCANIC]: { boulder: 1.6, obsidian: 0.9, sulfur: 1.0, rock_small: 1.5 },
  [BIOME.CRATER]: { ore_iron: 2.6, boulder: 1.0, rock_small: 2, clay: 0.6 },
};

// ------------------------------------------------------------------ geometry
// Weathered boulders: a subdivided icosahedron (shared vertices so it shades
// smooth) pushed around by noise, then broken along a few fracture planes,
// the flat faces real rocks split on, with rounded edges. The flattened
// bottom sinks into the ground.
export function rockGeo(seed, detail = 1, squash = 0.7, lumps = 0.35) {
  const r = new RNG(seed);
  const n = new Simplex(seed);
  let g = new THREE.IcosahedronGeometry(1, detail + 2);
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const ox = r.next() * 10, oz = r.next() * 10, sx = 0.85 + r.next() * 0.3, sz = 0.85 + 0.1 * Math.sin(seed);
  // fracture planes, mostly on the sides and the top
  const cuts = [];
  const nc = 3 + Math.floor(r.next() * 4);
  for (let k = 0; k < nc; k++) {
    const a = r.next() * Math.PI * 2, el = r.next() * 1.15 - 0.2;
    cuts.push([Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el), 0.62 + r.next() * 0.26]);
  }
  const K = 0.06; // how round the broken edges are
  for (let i = 0; i < p.count; i++) {
    const x0 = p.getX(i), y0 = p.getY(i), z0 = p.getZ(i);
    const f = 1 + lumps * n.noise3(x0 * 1.3 + ox, y0 * 1.3, z0 * 1.3 + oz) + 0.09 * n.noise3(x0 * 3 + oz, y0 * 3, z0 * 3);
    let x = x0 * f, y = y0 * f, z = z0 * f;
    for (const [cx, cy, cz, d] of cuts) {
      const s0 = x * cx + y * cy + z * cz - d;
      if (s0 < -4 * K) continue;
      // soft clamp onto the plane: min(s, 0) with a rounded corner
      const s1 = -K * Math.log1p(Math.exp(-s0 / K)) - s0;
      x += cx * s1; y += cy * s1; z += cz * s1;
    }
    // fine grain so the split faces do not look machined
    const fine = 1 + 0.028 * n.noise3(x0 * 7, y0 * 7 + ox, z0 * 7) + 0.012 * n.noise3(x0 * 15 + oz, y0 * 15, z0 * 15);
    x *= fine; y *= fine; z *= fine;
    let yy = y * squash;
    if (yy < -0.2) yy = -0.2 + (yy + 0.2) * 0.3; // flatter bottom sinks into the ground
    p.setXYZ(i, x * sx, yy + 0.35 * squash, z * sz);
  }
  g.computeVertexNormals();
  return g;
}

function bushGeo(seed) {
  const r = new RNG(seed);
  const b = new GeoBuilder();
  const up = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < 16; k++) {
    const a = r.next() * Math.PI * 2, el = r.next() * 1.3 - 0.2;
    const d = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.8 + 0.25, Math.sin(a) * Math.cos(el));
    const pos = d.clone().multiplyScalar(0.42 + r.next() * 0.15).add(new THREE.Vector3(0, 0.45, 0));
    const f = new THREE.Vector3(r.next() - 0.5, r.next() - 0.5, r.next() - 0.5).normalize();
    const ax = new THREE.Vector3().crossVectors(f, up).normalize().multiplyScalar(0.42);
    const ay = new THREE.Vector3().crossVectors(ax, f).normalize().multiplyScalar(0.42);
    b.card(pos, ax, ay, d.clone().normalize(), { layer: LEAF.BROAD, uvRect: r.next() < 0.5 ? [0, 0, 1, 0.5] : [0, 0.5, 1, 1], wind: 0.25 + d.y * 0.3, ao: 0.6 + 0.4 * Math.max(0, d.y) });
  }
  return b.build();
}
function berryGeo(seed) {
  const r = new RNG(seed);
  const parts = [];
  for (let k = 0; k < 18; k++) {
    const a = r.next() * Math.PI * 2, el = r.next() * 1.0;
    const pos = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el) * 0.75 + 0.2, Math.sin(a) * Math.cos(el)).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.45, 0));
    const s = new THREE.SphereGeometry(0.045, 6, 5);
    s.translate(pos.x, pos.y, pos.z);
    parts.push(s);
  }
  return mergeSimple(parts);
}
function mergeSimple(geos) {
  const pos = [], nrm = [];
  for (const g0 of geos) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
function tuftGeo(seed, h = 0.9, blades = 14, w = 0.035) {
  const r = new RNG(seed);
  const b = new GeoBuilder();
  const n = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < blades; i++) {
    const a = r.next() * Math.PI * 2, d = r.next() * 0.18;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, hh = h * (0.6 + r.next() * 0.5);
    const lean = 0.25 + r.next() * 0.35;
    const fx = Math.cos(a + 1.57) * w, fz = Math.sin(a + 1.57) * w;
    const tip = new THREE.Vector3(x + Math.cos(a) * lean * hh, hh, z + Math.sin(a) * lean * hh);
    const p0 = b.vert(new THREE.Vector3(x - fx, 0, z - fz), n, 0, 1, { aWind: 0, aLayer: 0, ao: 0.6 });
    const p1 = b.vert(new THREE.Vector3(x + fx, 0, z + fz), n, 1, 1, { aWind: 0, aLayer: 0, ao: 0.6 });
    const p2 = b.vert(tip, n, 0.5, 0, { aWind: 1, aLayer: 0, ao: 1 });
    b.idx.push(p0, p1, p2);
  }
  return b.build();
}

// rock material: triplanar painted stone + moss on top, relief from the
// painted detail, contact shadow at the ground and a wet band at the waterline
// noise that tiles with separate periods along u and v (for streaks)
function tileNoise2(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const wx = (v) => ((v % px) + px) % px, wy = (v) => ((v % py) + py) % py;
  const a = hash2i(wx(xi), wy(yi), seed), b = hash2i(wx(xi + 1), wy(yi), seed);
  const c = hash2i(wx(xi), wy(yi + 1), seed), d = hash2i(wx(xi + 1), wy(yi + 1), seed);
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function rockTextureData(S = 256) { return rockTextureSet(S).data; }
// colour layers (stone, moss) + their normal maps from a painted relief
export function rockTextureSet(S = 256) {
  const data = new Uint8Array(S * S * 4 * 2);
  const hgt = new Float32Array(S * S * 2);
  const greyA = rgb(0x8d8a84), greyB = rgb(0x9b9081), greyC = rgb(0x787a7e), dark = rgb(0x47433f), pale = rgb(0xcac5b8);
  const lichens = [rgb(0xbdb67a), rgb(0xcf8f48), rgb(0xd9d7c9), rgb(0x9aad6a)];
  const moss = rgb(0x4e6630), mossL = rgb(0x76863e), mossD = rgb(0x24341a), mossY = rgb(0x9a9a4e);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, i = (y * S + x) * 4;
    // stone: broad tone shifts, weathered mottling, granite grains, sparse cracks,
    // streaks where rain runs down, lichen rosettes
    const n = tileFbm(u * 3, v * 3, 3, 5, 3), n2 = tileFbm(u * 12, v * 12, 12, 4, 5), n3 = tileFbm(u * 40, v * 40, 40, 2, 7);
    let c = mix3(greyA, greyB, sstep(0.35, 0.68, n));
    c = mix3(c, greyC, sstep(0.5, 0.78, tileFbm(u * 2 + 0.3, v * 2, 2, 3, 17)) * 0.7);
    c = mul3(c, 0.8 + 0.34 * n2 + (n3 - 0.5) * 0.14);
    // granite grain: a soft salt-and-pepper, never hard dots
    const gr = tileNoise(u * 110, v * 110, 110, 31);
    c = mul3(c, 0.94 + (gr - 0.5) * 0.14);
    if (gr > 0.9) c = mix3(c, pale, (gr - 0.9) * 2.5);
    const streak = tileNoise2(u * 30, v * 3, 30, 3, 41) * 0.7 + tileNoise2(u * 60, v * 5, 60, 5, 43) * 0.3;
    c = mul3(c, 1 - sstep(0.62, 0.9, streak) * 0.16);
    const cr = cell(u, v, 4, 4, 9), e = cr.f2 - cr.f1;
    const crackMask = sstep(0.56, 0.68, tileFbm(u * 2, v * 2, 2, 2, 11));
    const core = 1 - sstep(0.0, 0.022, e);
    // dark crack with a slightly lighter lip beside it
    c = mix3(c, mul3(c, 1.12), (1 - sstep(0.022, 0.05, e)) * (1 - core) * crackMask * 0.4);
    c = mix3(c, dark, core * crackMask * 0.75);
    hgt[y * S + x] = n * 0.5 + n2 * 0.28 + (gr - 0.5) * 0.05 - core * crackMask * 0.3 - sstep(0.62, 0.9, streak) * 0.03;
    const lc = cell(u, v, 7, 7, 13);
    if (lc.id > 0.82) {
      // irregular crusty rosettes of different sizes, broken up by the grain
      const k = (lc.id - 0.82) / 0.18;
      const edge = lc.f1 + (tileNoise(u * 70, v * 70, 70, 19) - 0.5) * 0.22 + (tileNoise(u * 160, v * 160, 160, 23) - 0.5) * 0.1;
      const lich = lichens[Math.floor(k * 3.999)];
      c = mix3(c, mul3(lich, 0.88 + n3 * 0.24), sstep(0.16 + k * 0.2, 0.08 + k * 0.14, edge) * 0.6);
    }
    put(data, i, c);
    // moss: soft cushions, sunlit yellow tips, dark hollows, tiny sprigs
    const m1 = tileFbm(u * 6, v * 6, 6, 4, 21), m2 = tileFbm(u * 28, v * 28, 28, 3, 23), m3 = tileNoise(u * 110, v * 110, 110, 29);
    let mc = mix3(mossD, moss, sstep(0.2, 0.5, m1 + (m2 - 0.5) * 0.4));
    mc = mix3(mc, mossL, sstep(0.5, 0.75, m1 + (m2 - 0.5) * 0.5));
    mc = mix3(mc, mossY, sstep(0.78, 0.95, m1 + (m2 - 0.5) * 0.4) * 0.5);
    mc = mul3(mc, 0.82 + m2 * 0.26 + (m3 - 0.5) * 0.1);
    put(data, S * S * 4 + i, mc);
    hgt[S * S + y * S + x] = m1 * 0.6 + m2 * 0.3 + (m3 - 0.5) * 0.06;
  }
  // normal maps (Sobel over the wrapped relief)
  const nrm = new Uint8Array(S * S * 4 * 2);
  for (let L = 0; L < 2; L++) {
    const o = L * S * S, k = L ? 2.2 : 3.2;
    const H = (x, y) => hgt[o + (((y % S) + S) % S) * S + (((x % S) + S) % S)];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = ((H(x + 1, y - 1) + 2 * H(x + 1, y) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x - 1, y) + H(x - 1, y + 1))) * k;
      const dy = ((H(x - 1, y + 1) + 2 * H(x, y + 1) + H(x + 1, y + 1)) - (H(x - 1, y - 1) + 2 * H(x, y - 1) + H(x + 1, y - 1))) * k;
      const l = Math.hypot(dx, dy, 1), i = (o + y * S + x) * 4;
      nrm[i] = (-dx / l * 0.5 + 0.5) * 255; nrm[i + 1] = (-dy / l * 0.5 + 0.5) * 255; nrm[i + 2] = (1 / l * 0.5 + 0.5) * 255; nrm[i + 3] = 255;
    }
  }
  return { data, nrm };
}
function rockTextures() {
  const S = 256, { data, nrm } = rockTextureSet(S);
  const ntex = new THREE.DataArrayTexture(nrm, S, S, 2);
  ntex.format = THREE.RGBAFormat;
  ntex.wrapS = ntex.wrapT = THREE.RepeatWrapping;
  ntex.magFilter = THREE.LinearFilter; ntex.minFilter = THREE.LinearMipmapLinearFilter;
  ntex.generateMipmaps = true; ntex.anisotropy = 8;
  ntex.needsUpdate = true;
  const tex = new THREE.DataArrayTexture(data, S, S, 2);
  tex.userData.normal = ntex;
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// opt.water = { tex, half, size }: the world water-level texture, for the wet
// band at the waterline; opt.soak raises it (spray in the rapids)
export function makeRockMaterial(tex, opt = {}) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, side: opt.side ?? THREE.FrontSide });
  const water = opt.water;
  patchMaterial(mat, {
    wet: true,
    uniforms: {
      tRockArr: { value: tex }, tRockN: { value: tex?.userData?.normal ?? null }, uMoss: { value: opt.moss ?? 1 }, uSoak: { value: opt.soak ?? 0 },
      ...(water ? { tWaterLvl: { value: water.tex }, uWHalf: { value: water.half }, uWSize: { value: water.size } } : {}),
    },
    vertex: {
      head: 'varying vec3 vRW;\nvarying vec3 vRN;\nvarying float vRLY;',
      main: `
        vec4 rwp = vec4( transformed, 1.0 );
        vRLY = transformed.y;
        #ifdef USE_INSTANCING
          rwp = instanceMatrix * rwp;
        #endif
        vRW = ( modelMatrix * rwp ).xyz;
        vec3 rn = normal;
        #ifdef USE_INSTANCING
          rn = mat3( instanceMatrix ) * rn;
        #endif
        vRN = normalize( mat3( modelMatrix ) * rn );`,
    },
    fragment: {
      head: `precision highp sampler2DArray;\nuniform sampler2DArray tRockArr;\nuniform sampler2DArray tRockN;\nuniform float uMoss;\nuniform float uSoak;\nvarying vec3 vRW;\nvarying vec3 vRN;\nvarying float vRLY;\nvec3 rNW; float rWet;\n${water ? 'uniform sampler2D tWaterLvl;\nuniform float uWHalf;\nuniform float uWSize;\n' : ''}${GLSL_HASH}`,
      map: `
        vec3 an = abs( vRN );
        vec3 bw = an * an; bw *= bw; bw /= bw.x + bw.y + bw.z;
        vec2 uvx = vRW.zy * 0.5, uvy = vRW.xz * 0.5, uvz = vRW.xy * 0.5;
        vec3 rc = texture( tRockArr, vec3( uvx, 0.0 ) ).rgb * bw.x + texture( tRockArr, vec3( uvy + 0.37, 0.0 ) ).rgb * bw.y + texture( tRockArr, vec3( uvz, 0.0 ) ).rgb * bw.z;
        // inside a cave we see back faces: moss belongs on the floor side, not the ceiling
        float upY = gl_FrontFacing ? vRN.y : -vRN.y;
        float mossAmt = smoothstep( 0.55, 0.95, upY + ( vnoise( vRW.xz * 1.3 ) - 0.5 ) * 0.6 ) * uMoss;
        vec3 mc = texture( tRockArr, vec3( uvy, 1.0 ) ).rgb;
        float pick = smoothstep( 0.4, 0.6, mossAmt + ( vnoise( vRW.xz * 4.5 ) - 0.5 ) * 0.35 );
        vec3 rcol = mix( rc, mc, pick );
        // triplanar relief (whiteout blend), moss relief on the top projection
        {
          vec3 rnF = gl_FrontFacing ? vRN : -vRN;
          vec3 tnx = texture( tRockN, vec3( uvx, 0.0 ) ).xyz * 2.0 - 1.0;
          vec3 tny = mix( texture( tRockN, vec3( uvy + 0.37, 0.0 ) ).xyz, texture( tRockN, vec3( uvy, 1.0 ) ).xyz, pick ) * 2.0 - 1.0;
          vec3 tnz = texture( tRockN, vec3( uvz, 0.0 ) ).xyz * 2.0 - 1.0;
          tnx = vec3( tnx.xy + rnF.zy, abs( tnx.z ) * rnF.x );
          tny = vec3( tny.xy + rnF.xz, abs( tny.z ) * rnF.y );
          tnz = vec3( tnz.xy + rnF.xy, abs( tnz.z ) * rnF.z );
          rNW = normalize( tnx.zyx * bw.x + tny.xzy * bw.y + tnz.xyz * bw.z );
        }
        // contact shadow where the rock meets the ground
        rcol *= mix( 0.6, 1.0, smoothstep( -0.05, 0.42, vRLY ) );
        rWet = 0.0;
        ${water ? `{
          // wet below the waterline (higher where the rapids throw spray)
          vec2 wuv = ( vRW.xz + uWHalf ) / uWSize, o = vec2( 1.5 / uWSize, 0.0 );
          float wl = max( max( texture2D( tWaterLvl, wuv ).r, texture2D( tWaterLvl, wuv + o ).r ), max( texture2D( tWaterLvl, wuv - o ).r, max( texture2D( tWaterLvl, wuv + o.yx ).r, texture2D( tWaterLvl, wuv - o.yx ).r ) ) );
          float top = wl + 0.22 + uSoak * ( 0.55 + vnoise( vRW.xz * 2.3 + vRW.y * 1.7 ) * 0.7 );
          if ( wl > -999.0 ) rWet = 1.0 - smoothstep( top - 0.18, top, vRW.y );
        }` : ''}
        rcol *= 1.0 - 0.38 * rWet;
        diffuseColor.rgb *= rcol;`,
      emissive: `
        roughnessFactor = mix( roughnessFactor, 0.26, rWet );
        // painted relief, a little softer where it is wet
        normal = normalize( mix( ( viewMatrix * vec4( rNW, 0.0 ) ).xyz, normal, 0.25 + 0.3 * rWet ) );`,
      lights: `
        #if NUM_HEMI_LIGHTS > 0
        if ( rWet > 0.01 ) {
          // wet stone mirrors the sky
          vec3 rvd = normalize( vViewPosition );
          vec3 rrv = reflect( -rvd, normal );
          float rup = dot( rrv, hemisphereLights[ 0 ].direction );
          vec3 rsky = mix( hemisphereLights[ 0 ].groundColor, hemisphereLights[ 0 ].skyColor, smoothstep( -0.2, 0.6, rup ) );
          float rfr = 0.04 + 0.96 * pow( 1.0 - max( dot( normal, rvd ), 0.0 ), 5.0 );
          reflectedLight.indirectSpecular += rsky * rfr * rWet * 0.8;
        }
        #endif`,
    },
  });
  return mat;
}

function simpleMat(color, opt = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: opt.rough ?? 0.85, metalness: opt.metal ?? 0, flatShading: !!opt.flat, emissive: opt.emissive ?? 0, emissiveIntensity: opt.ei ?? 1, side: opt.side ?? THREE.FrontSide, vertexColors: !!opt.vc, transparent: !!opt.transparent, opacity: opt.opacity ?? 1 });
  patchMaterial(m, { wind: opt.wind, translucency: opt.trans });
  return m;
}

// ------------------------------------------------------------------ system
export class Nodes {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.s = game.sampler;
    this.cells = new Map(); // key -> nodes[]
    this.byId = new Map();
    this.state = new Map(); // id -> { hp, until }
    this.nearby = [];
    this.group = new THREE.Group();
    this.group.name = 'nodes';
    game.engine.scene.add(this.group);
    this.noise = new Simplex(this.world.seed + ':nodes');
    this.buildVisuals();
    this._lastCenter = null;
    this._m = new THREE.Matrix4();
  }

  buildVisuals() {
    const rockTex = rockTextures();
    const flora = this.game.flora;
    const leafMat = flora.leafMat;
    const V = this.visuals = {};
    const mk = (key, geo, mat, cap, opt = {}) => {
      const im = new THREE.InstancedMesh(geo, mat, cap);
      im.count = 0; im.castShadow = opt.shadow !== false; im.receiveShadow = true; im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (opt.depth) im.customDepthMaterial = opt.depth;
      im.name = 'node-' + key;
      this.group.add(im);
      V[key] = { im, cap, list: [] };
    };
    const ter = this.game.terrain;
    this.waterOpt = ter ? { tex: ter.waterTex, half: this.world.half, size: this.world.size } : undefined;
    const rockMat = makeRockMaterial(rockTex, { water: this.waterOpt });
    this.rockTex = rockTex; // shared with the caves
    const rockGeos = [rockGeo(11), rockGeo(23, 1, 0.6), rockGeo(37, 1, 0.8, 0.4), rockGeo(51, 1, 0.55, 0.3)];
    rockGeos.forEach((g, i) => mk('rock' + i, g, rockMat, 1200));
    mk('pebble', rockGeo(71, 0, 0.6, 0.3), rockMat, 1500);
    mk('flint', rockGeo(81, 0, 0.8, 0.3), simpleMat(0x3e3e4c, { rough: 0.35, flat: true }), 400);
    mk('meteor', rockGeo(91, 1, 0.8, 0.45), simpleMat(0x4e4a52, { rough: 0.4, metal: 0.7, flat: true }), 400);
    mk('copper', rockGeo(101, 1, 0.75, 0.4), makeRockMaterial(rockTex, { moss: 0 }), 400);
    mk('copperVein', rockGeo(103, 0, 0.5, 0.2), simpleMat(0x2fa080, { rough: 0.4, flat: true }), 400);
    mk('sulfur', rockGeo(111, 1, 0.45, 0.3), simpleMat(0xd8c030, { rough: 0.8, flat: true }), 400);
    mk('obsidian', rockGeo(121, 0, 1.0, 0.25), simpleMat(0x16121c, { rough: 0.08, metal: 0.3, flat: true }), 400);
    mk('crystal', new THREE.OctahedronGeometry(0.5, 0).scale(0.5, 1.3, 0.5).translate(0, 0.5, 0), simpleMat(0x5ae0ff, { rough: 0.15, emissive: 0x2ab0d0, ei: 1.6, flat: true }), 300, { shadow: false });
    mk('fossil', rockGeo(131, 1, 0.6, 0.35), makeRockMaterial(rockTex, { moss: 0.2 }), 300);
    mk('fossilBone', new THREE.TorusGeometry(0.35, 0.06, 5, 12, Math.PI * 1.4).rotateX(-0.3).translate(0, 0.45, 0.42), simpleMat(0xe8dcc0, { rough: 0.6 }), 300);
    mk('clay', rockGeo(141, 1, 0.3, 0.2), simpleMat(0x9c7c5a, { rough: 0.95 }), 400);
    mk('tar', new THREE.CylinderGeometry(0.9, 1.0, 0.08, 14).translate(0, 0.02, 0), simpleMat(0x0c0a0a, { rough: 0.08 }), 200, { shadow: false });
    mk('salt', rockGeo(151, 0, 0.3, 0.3), simpleMat(0xf2efe8, { rough: 0.6, flat: true }), 300);
    mk('sandpile', new THREE.ConeGeometry(0.5, 0.25, 8).translate(0, 0.1, 0), simpleMat(0xdcc48a, { rough: 1 }), 300);
    const bushG = [bushGeo(5), bushGeo(6), bushGeo(7)];
    bushG.forEach((g, i) => mk('bush' + i, g, leafMat, 800, { depth: flora.leafDepth }));
    const berryG = berryGeo(8);
    for (const k of ['bush_red', 'bush_blue', 'bush_sun', 'bush_snooze']) mk('berries_' + k, berryG, simpleMat(NODE_TYPES[k].berry, { rough: 0.3, wind: { amp: 0.06 } }), 800, { shadow: false });
    const tuftMat = simpleMat(0xffffff, { rough: 0.9, vc: true, side: THREE.DoubleSide, wind: { amp: 0.12 }, trans: 0.4 });
    const tg = tuftGeo(9);
    // tint tuft vertex colours: dark root -> light tip
    { const c = tg.attributes.color; for (let i = 0; i < c.count; i++) { const t = tg.attributes.aWind.getX(i); c.setXYZ(i, 0.3 + 0.35 * t, 0.48 + 0.35 * t, 0.16 + 0.12 * t); } }
    mk('tuft', tg, tuftMat, 1200, { shadow: false });
    const fernG = (() => { const b = new GeoBuilder(); const up = new THREE.Vector3(0, 1, 0); for (let f = 0; f < 9; f++) { const az = f / 9 * 6.28; const dir = new THREE.Vector3(Math.cos(az), 0, Math.sin(az)); const side = new THREE.Vector3(-Math.sin(az), 0.25, Math.cos(az)).normalize(); const pts = [], sides = [], ws = []; for (let i = 0; i <= 5; i++) { const t = i / 5, s = t * 1.2; pts.push(dir.clone().multiplyScalar(s * 0.8).addScaledVector(up, s * 0.9 - s * s * 0.55)); sides.push(side); ws.push(0.42); } b.ribbon(pts, sides, ws, { layer: LEAF.FERN, wind: (t) => t * t * 0.8, normalBias: up, normalBiasAmt: 0.6, ao: (t) => 0.65 + 0.35 * t }); } return b.build(); })();
    mk('fern', fernG, leafMat, 1000, { depth: flora.leafDepth });
    const herbG = tuftGeo(12, 0.45, 10, 0.06);
    { const c = herbG.attributes.color; for (let i = 0; i < c.count; i++) { const t = herbG.attributes.aWind.getX(i); c.setXYZ(i, 0.25 + 0.3 * t, 0.55 + 0.35 * t, 0.35 + 0.2 * t); } }
    mk('herb', herbG, tuftMat, 400, { shadow: false });
    mk('herbFlower', new THREE.SphereGeometry(0.06, 6, 5).translate(0, 0.45, 0), simpleMat(0xf0f0ff, { emissive: 0x404060, ei: 0.4 }), 400, { shadow: false });
    // mushrooms cluster
    const mushG = mergeSimple([0, 1, 2, 3].map((k) => { const a = k * 1.7; const g = new THREE.SphereGeometry(0.09 + k * 0.02, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2); g.scale(1, 0.7, 1); g.translate(Math.cos(a) * 0.18, 0.12 + k * 0.03, Math.sin(a) * 0.18); return g; }));
    mk('mushCap', mushG, simpleMat(0xc85a3a, { rough: 0.6 }), 400);
    mk('mushStem', mergeSimple([0, 1, 2, 3].map((k) => { const a = k * 1.7; const g = new THREE.CylinderGeometry(0.03, 0.04, 0.12 + k * 0.03, 6); g.translate(Math.cos(a) * 0.18, 0.06 + k * 0.015, Math.sin(a) * 0.18); return g; })), simpleMat(0xeee6d0), 400);
    // sticks
    const stickG = mergeSimple([0, 1, 2, 3].map((k) => { const g = new THREE.CylinderGeometry(0.025, 0.03, 0.9 - k * 0.1, 5); g.rotateZ(Math.PI / 2); g.rotateY(k * 0.8); g.translate(0, 0.03 + k * 0.02, 0); return g; }));
    mk('sticks', stickG, simpleMat(0x6a4a2c, { rough: 0.9 }), 1200);
    mk('driftwood', new THREE.CylinderGeometry(0.12, 0.16, 1.8, 6).rotateZ(Math.PI / 2).translate(0, 0.1, 0), simpleMat(0xa8a090, { rough: 0.9, flat: true }), 300);
    // crash debris: bent panels + cables
    const debrisG = mergeSimple([(() => { const g = new THREE.BoxGeometry(0.9, 0.04, 0.6); g.rotateZ(0.25); g.rotateY(0.4); g.translate(0, 0.15, 0); return g; })(), (() => { const g = new THREE.BoxGeometry(0.5, 0.04, 0.5); g.rotateX(0.8); g.translate(0.2, 0.2, 0.15); return g; })(), (() => { const g = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6); g.rotateZ(1.2); g.translate(-0.2, 0.1, 0.2); return g; })()]);
    mk('debris', debrisG, simpleMat(0x6c8a8a, { rough: 0.6, metal: 0.5, flat: true }), 120);
    mk('crate', new THREE.BoxGeometry(0.7, 0.45, 0.5).translate(0, 0.225, 0), simpleMat(0x3a6ab0, { rough: 0.5 }), 60);
    mk('crateLid', new THREE.BoxGeometry(0.72, 0.06, 0.52).translate(0, 0.47, 0), simpleMat(0xd8d0c0, { rough: 0.6 }), 60);
    mk('hive', new THREE.SphereGeometry(0.3, 8, 6).scale(1, 1.4, 1).translate(0, 0.2, 0), simpleMat(0xb89050, { rough: 0.8, flat: true }), 150);
    // a cartoon swirl of dino dung, still glossy
    mk('dung', mergeSimple([[0.26, 0.09], [0.19, 0.2], [0.12, 0.29], [0.06, 0.35]].map(([r, y], k) => new THREE.SphereGeometry(r, 9, 6).scale(1, 0.62, 1).translate(k * 0.02, y, -k * 0.015))), simpleMat(0x5a3e24, { rough: 0.42 }), 500);
  }

  key(i, j) { return i * 10000 + j; }

  generateCell(ci, cj) {
    const k = this.key(ci, cj);
    if (this.cells.has(k)) return this.cells.get(k);
    const r = new RNG((ci * 73856093) ^ (cj * 19349663) ^ 0x5eed);
    const list = [];
    const x0 = ci * CELL, z0 = cj * CELL;
    const cx = x0 + CELL / 2, cz = z0 + CELL / 2;
    const s = this.s, w = this.world;
    if (Math.abs(cx) > w.half || Math.abs(cz) > w.half) { this.cells.set(k, list); return list; }
    const biome = s.biomeAt(cx, cz);
    const table = SPAWN[biome] || {};
    let idx = 0;
    const add = (type, x, z, extra = {}) => {
      const def = NODE_TYPES[type];
      const y = s.heightAt(x, z);
      const size = def.size[0] + r.next() * (def.size[1] - def.size[0]);
      const node = { id: k * 64 + idx++, type, def, x, y, z, rot: r.next() * Math.PI * 2, size, variant: Math.floor(r.next() * 4), ...extra };
      list.push(node);
      return node;
    };
    for (const [type, exp] of Object.entries(table)) {
      let n = Math.floor(exp) + (r.next() < exp % 1 ? 1 : 0);
      const clump = this.noise.noise2(cx * 0.01 + type.length, cz * 0.01) * 0.5 + 0.5;
      if (['bush_red', 'bush_blue', 'bush_sun', 'bush_snooze', 'mushrooms', 'herb'].includes(type)) n = Math.round(n * (0.3 + clump * 1.4));
      for (let q = 0; q < n; q++) {
        const x = x0 + r.next() * CELL, z = z0 + r.next() * CELL;
        const y = s.heightAt(x, z);
        const wl = s.waterAt(x, z);
        const inWater = wl > y + 0.1;
        if (inWater && !(type === 'boulder' && biome === BIOME.RIVER && wl - y < 1.6)) continue;
        if (type !== 'boulder' && type !== 'boulder_big' && s.slopeAt(x, z) > 0.8) continue;
        if (this.game.clearings && this.game.clearings(x, z, type)) continue;
        add(type, x, z);
      }
    }
    // special POI content
    for (const p of w.pois) {
      if (Math.abs(p.x - cx) > CELL / 2 + p.radius + 4 || Math.abs(p.z - cz) > CELL / 2 + p.radius + 4) continue;
      const inCell = (x, z) => x >= x0 && x < x0 + CELL && z >= z0 && z < z0 + CELL;
      const pr = new RNG(p.id + ':' + k);
      if (p.id === 'crash') {
        // debris along the skid trench + scattered supply crates
        for (let q = 0; q < 14; q++) {
          const t = pr.next();
          const x = p.x + 5 + t * 45 + (pr.next() - 0.5) * 8, z = p.z - 3 - t * 41 + (pr.next() - 0.5) * 8;
          if (inCell(x, z) && Math.hypot(x - (p.x + 3.2), z - (p.z - 1.6)) > 4) add('scrap', x, z);
        }
        for (let q = 0; q < 5; q++) { const a = pr.next() * 6.28, d = 6 + pr.next() * 10; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (inCell(x, z) && Math.hypot(x - (p.x + 3.2), z - (p.z - 1.6)) > 4) add('crate', x, z); }
      }
      if (p.id === 'crystalcave' || p.id === 'caldera') {
        for (let q = 0; q < 6; q++) { const a = pr.next() * 6.28, d = pr.next() * p.radius * 0.7; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (inCell(x, z)) add('crystal', x, z); }
      }
      if (p.id === 'tarpits') {
        for (let q = 0; q < 8; q++) { const a = pr.next() * 6.28, d = pr.next() * p.radius * 0.8; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (inCell(x, z)) add('tar', x, z); }
        for (let q = 0; q < 3; q++) { const a = pr.next() * 6.28, d = pr.next() * p.radius * 0.6; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (inCell(x, z)) add('fossil', x, z); }
      }
      if (p.id === 'skeleton' || p.id === 'petrified') {
        for (let q = 0; q < 5; q++) { const a = pr.next() * 6.28, d = pr.next() * p.radius; const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d; if (inCell(x, z)) add('fossil', x, z); }
      }
      if (p.id === 'fallcave') { const x = p.x, z = p.z, y = p.floorY !== undefined ? { y: p.floorY } : {}; if (inCell(x, z)) { add('fossil', x + 1.6, z - 0.6, y); add('crystal', x - 1.6, z - 0.9, y); } }
    }
    this.cells.set(k, list);
    for (const nd of list) this.byId.set(nd.id, nd);
    return list;
  }

  isDepleted(nd) {
    const st = this.state.get(nd.id);
    return st && st.until > (this.game.time?.elapsed ?? 0);
  }

  update(dt) {
    const players = this.game.allPlayers();
    if (!players.length) return;
    const c = players[0].pos;
    const ci = Math.floor(c.x / CELL), cj = Math.floor(c.z / CELL);
    const centerKey = this.key(ci, cj);
    this._rebuildT = (this._rebuildT ?? 0) - dt;
    if (centerKey === this._lastCenter && this._rebuildT > 0 && !this.dirty) return;
    this._lastCenter = centerKey;
    this._rebuildT = 2;
    this.dirty = false;
    const R = Math.ceil(RANGE / CELL);
    const active = [];
    const seenCells = new Set();
    for (const p of players) {
      const pi = Math.floor(p.pos.x / CELL), pj = Math.floor(p.pos.z / CELL);
      for (let j = pj - R; j <= pj + R; j++) for (let i = pi - R; i <= pi + R; i++) {
        const k = this.key(i, j);
        if (seenCells.has(k)) continue;
        seenCells.add(k);
        const list = this.generateCell(i, j);
        for (const nd of list) active.push(nd);
      }
    }
    this.syncColliders(active);
    this.nearby = active;
    this.rebuildInstances(active);
  }

  syncColliders(active) {
    const phys = this.game.physics;
    const want = new Set();
    for (const nd of active) {
      if (!nd.def.solid || this.isDepleted(nd)) continue;
      want.add(nd.id);
      if (!nd.colId) {
        const r = nd.size * 0.72;
        nd.colId = phys.addCyl({ x: nd.x, z: nd.z, r, y0: nd.y - 1, y1: nd.y + nd.size * 0.9, ref: nd, kind: 'node' });
      }
    }
    for (const nd of this._colliding || []) if (nd.colId && !want.has(nd.id)) { phys.remove(nd.colId); nd.colId = null; }
    this._colliding = active.filter((n) => n.colId);
  }

  rebuildInstances(active) {
    const V = this.visuals;
    for (const v of Object.values(V)) v.n = 0;
    const m = this._m, q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const color = new THREE.Color();
    const put = (key, x, y, z, rot, s, sy = s, tint = null) => {
      const v = V[key];
      if (!v || v.n >= v.cap) return;
      q.setFromAxisAngle(up, rot);
      m.compose(pos.set(x, y, z), q, sc.set(s, sy, s));
      v.im.setMatrixAt(v.n, m);
      if (tint) { v.im.setColorAt(v.n, tint); }
      v.n++;
    };
    for (const nd of active) {
      const depleted = this.isDepleted(nd);
      const d = nd.def;
      if (depleted && !d.keep) continue;
      const { x, y, z, rot, size } = nd;
      switch (d.model) {
        case 'rock': {
          const b = this.s.biomeAt(x, z);
          color.set(b === BIOME.BADLANDS ? 0xd08060 : b === BIOME.VOLCANIC ? 0x585058 : b === BIOME.SNOW ? 0xc8ccd8 : 0xffffff);
          const hit = this.state.get(nd.id);
          const shrink = hit && hit.hp !== undefined ? 0.55 + 0.45 * (hit.hp / d.hp) : 1;
          put('rock' + nd.variant, x, y - size * 0.18, z, rot, size * shrink, size * (0.8 + (nd.variant % 2) * 0.2) * shrink, color);
          break;
        }
        case 'pebble': put('pebble', x, y - 0.05, z, rot, size, size, color.set(0xd8d4cc)); break;
        case 'flint': put('flint', x, y - 0.1, z, rot, size); break;
        case 'meteor': put('meteor', x, y - 0.2, z, rot, size); break;
        case 'copper': put('copper', x, y - 0.2, z, rot, size, size, color.set(0x9a8a7a)); put('copperVein', x + 0.2 * size, y + 0.15 * size, z, rot + 1, size * 0.45); break;
        case 'sulfur': put('sulfur', x, y - 0.1, z, rot, size); break;
        case 'obsidian': put('obsidian', x, y - 0.2, z, rot, size); break;
        case 'crystal': for (let k = 0; k < 4; k++) put('crystal', x + Math.cos(k * 1.9 + rot) * 0.4 * size * (k ? 1 : 0), y - 0.1, z + Math.sin(k * 1.9 + rot) * 0.4 * size * (k ? 1 : 0), rot + k, size * (k ? 0.6 : 1), size * (k ? 0.7 : 1.3)); break;
        case 'fossil': put('fossil', x, y - 0.2, z, rot, size, size * 0.8, color.set(0xd8c8a8)); put('fossilBone', x, y - 0.2, z, rot, size); break;
        case 'clay': put('clay', x, y - 0.12, z, rot, size); break;
        case 'tar': put('tar', x, y + 0.01, z, rot, size); break;
        case 'salt': put('salt', x, y - 0.05, z, rot, size); break;
        case 'sandpile': put('sandpile', x, y, z, rot, size); break;
        case 'bush': {
          put('bush' + (nd.variant % 3), x, y - 0.05, z, rot, size, size, color.set(nd.type === 'bush_snooze' ? 0xb0a0d0 : 0xffffff));
          if (!depleted) put('berries_' + nd.type, x, y - 0.05, z, rot, size);
          break;
        }
        case 'tuft': put('tuft', x, y, z, rot, size); break;
        case 'fern': put('fern', x, y - 0.05, z, rot, size); break;
        case 'herb': put('herb', x, y, z, rot, size); put('herbFlower', x, y, z, rot, size); break;
        case 'mush': put('mushCap', x, y - 0.02, z, rot, size); put('mushStem', x, y - 0.02, z, rot, size); break;
        case 'sticks': put('sticks', x, y, z, rot, size); break;
        case 'driftwood': put('driftwood', x, y, z, rot, size); break;
        case 'debris': put('debris', x, y, z, rot, size); break;
        case 'crate': put('crate', x, y, z, rot, size); put('crateLid', x, y, z, rot, size); break;
        case 'hive': put('hive', x, y + 2.8, z, rot, size); break;
        case 'dung': put('dung', x, y - 0.03, z, rot, size); break;
        default: break;
      }
    }
    for (const v of Object.values(V)) {
      v.im.count = v.n;
      v.im.instanceMatrix.needsUpdate = true;
      if (v.im.instanceColor) v.im.instanceColor.needsUpdate = true;
    }
  }

  // find the node the player is aiming at
  raycast(origin, dir, maxDist) {
    let best = null, bt = maxDist;
    for (const nd of this.nearby) {
      if (this.isDepleted(nd) && !nd.def.keep) continue;
      if (Math.abs(nd.x - origin.x) > maxDist + 4 || Math.abs(nd.z - origin.z) > maxDist + 4) continue;
      const r = Math.max(0.45, nd.size * (nd.def.model === 'rock' ? 0.75 : 0.55));
      const cy = nd.y + (nd.def.model === 'hive' ? 2.9 : r * 0.6);
      const ox = origin.x - nd.x, oy = origin.y - cy, oz = origin.z - nd.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < bt) { bt = t; best = nd; }
    }
    return best ? { node: best, dist: bt } : null;
  }

  // host-side damage. returns { drops, destroyed }
  hit(nd, toolDef, power = 1) {
    const d = nd.def;
    const now = this.game.time.elapsed;
    let st = this.state.get(nd.id);
    if (st && st.until > now) return null;
    if (!st || st.until <= now) { st = { hp: d.hp, until: 0 }; this.state.set(nd.id, st); }
    const kind = toolDef?.tool?.kind ?? 'hand';
    let dmg = 3 * power;
    if (d.tool === 'pick') dmg = kind === 'pick' ? toolDef.tool.dmg * power : kind === 'hand' ? 1 : 2;
    else if (d.tool === 'hand') dmg = d.hp >= 10 ? (kind === 'pick' || kind === 'shovel' ? 10 : 4) * power : d.hp;
    if (d.tier && (toolDef?.tool?.tier ?? 0) < d.tier) dmg *= 0.25;
    st.hp -= dmg;
    const drops = [];
    // small chip drops while mining big rocks
    if (d.tool === 'pick' && st.hp > 0 && Math.random() < 0.35) drops.push([d.drops[0][0], 1]);
    if (st.hp <= 0) {
      const r = new RNG(nd.id * 7 + Math.floor(now));
      for (const [id, min, max, chance = 1] of d.drops) {
        if (r.next() > chance) continue;
        let n = r.int(min, max);
        if (d.sickleBonus && kind === 'sickle') n += d.sickleBonus;
        if (d.shovelBonus && kind === 'shovel') n += d.shovelBonus;
        if (n > 0) drops.push([id, n]);
      }
      st.until = d.regrow > 0 ? now + d.regrow : Infinity;
      st.hp = d.hp;
      this.onDeplete(nd);
      return { drops, destroyed: true };
    }
    this.dirty = true;
    return { drops, destroyed: false };
  }

  onDeplete(nd) {
    if (nd.colId) { this.game.physics.remove(nd.colId); nd.colId = null; }
    this.dirty = true;
  }

  // network/save: apply depletion
  applyState(id, until, hp) {
    this.state.set(id, { until, hp });
    const nd = this.byId.get(id);
    if (nd) this.onDeplete(nd);
    this.dirty = true;
  }
  serialize() {
    const now = this.game.time.elapsed, out = [];
    for (const [id, st] of this.state) if (st.until > now) out.push([id, st.until === Infinity ? -1 : Math.round(st.until)]);
    return out;
  }
  load(arr) { for (const [id, until] of arr || []) this.state.set(id, { until: until < 0 ? Infinity : until, hp: 0 }); this.dirty = true; }
}
