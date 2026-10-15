// Procedural item models. Used for held items, dropped loot and to render the
// pixel-art inventory icons. Grip/origin is the bottom of the handle; tools
// point up +Y with their business end facing +Z.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from './shaderlib.js';
import { PixelPainter, ramp } from './pixel.js';
import { tileFbm } from '../core/rng.js';

const mats = new Map();
function M(key, make) {
  if (!mats.has(key)) { const m = make(); patchMaterial(m, {}); mats.set(key, m); }
  return mats.get(key);
}
const std = (color, rough = 0.8, metal = 0, extra = {}) => M(`s${color}-${rough}-${metal}-${JSON.stringify(extra)}`, () => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }));
const texMat = (key, painter, opt = {}) => M('t' + key, () => new THREE.MeshStandardMaterial({ map: painter().texture(), roughness: opt.rough ?? 0.85, metalness: opt.metal ?? 0, color: opt.color ?? 0xffffff }));

// small pixel textures
const woodTex = () => { const p = new PixelPainter(16, 32, 3); const pal = ramp(0x8a6038, 4); for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, pal[(x + Math.floor(tileFbm(x / 16 * 2, y / 32 * 8, 2, 2, 3) * 3)) % 3 === 0 ? 1 : 2]); for (let k = 0; k < 4; k++) p.set(Math.floor(Math.random() * 16), Math.floor(Math.random() * 32), pal[0]); return p; };
const barkTex = () => { const p = new PixelPainter(16, 32, 4); const pal = ramp(0x6a4a2c, 4); for (let y = 0; y < 32; y++) for (let x = 0; x < 16; x++) p.set(x, y, pal[x % 4 === 0 ? 0 : (y + x) % 7 === 0 ? 3 : 1]); return p; };
const stoneTex = () => { const p = new PixelPainter(16, 16, 5); const pal = ramp(0x8a8780, 4); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pal[1 + Math.floor(tileFbm(x / 16 * 3, y / 16 * 3, 3, 2, 5) * 2.9)]); return p; };
const leatherTex = () => { const p = new PixelPainter(16, 16, 6); const pal = ramp(0x7a5034, 4); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) p.set(x, y, pal[(y % 4 === 0) ? 0 : (x + y) % 3 === 0 ? 2 : 1]); return p; };
const W = () => texMat('wood', woodTex);
const BK = () => texMat('bark', barkTex);
const ST = () => texMat('stone', stoneTex, { rough: 0.9 });
const LE = () => texMat('leather', leatherTex, { rough: 0.7 });
const METAL = () => std(0xa8adb4, 0.35, 0.85);
const RUST = () => std(0x8a5a3a, 0.75, 0.4);
const PLASTIC = (c) => std(c, 0.45, 0, {});
const GLOW = (c, i = 1.5) => M('g' + c + i, () => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.4 }));

const mesh = (g, m) => { const x = new THREE.Mesh(g, m); x.castShadow = true; x.receiveShadow = true; return x; };
const box = (w, h, d, m, r = 0) => mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 8) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const sph = (r, m, w = 10, hh = 8) => mesh(new THREE.SphereGeometry(r, w, hh), m);
const rock = (r, m, detail = 0, squash = 0.7) => { const g = new THREE.IcosahedronGeometry(r, detail); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = 0.8 + Math.random() * 0.35; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * squash, p.getZ(i) * f); } g.computeVertexNormals(); return mesh(g, m); };
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
const G = (...kids) => { const g = new THREE.Group(); kids.forEach((k) => g.add(k)); return g; };

function handle(len = 0.45, r = 0.018) { return at(cyl(r, r * 1.1, len, W(), 6), 0, len / 2, 0); }
function wrap(y, r = 0.024) { return at(cyl(r, r, 0.05, LE(), 6), 0, y, 0); }

const B = {
  stick: () => G(at(cyl(0.015, 0.02, 0.5, BK(), 5), 0, 0.25, 0, 0, 0, 0.05), at(cyl(0.008, 0.01, 0.12, BK(), 4), 0.03, 0.32, 0, 0, 0, -0.7)),
  stone: (o) => G(at(rock(0.07, o.color ? std(o.color, 0.9) : ST(), 0), 0, 0.045, 0)),
  fiber: () => { const g = new THREE.Group(); for (let i = 0; i < 9; i++) g.add(at(box(0.008, 0.32, 0.004, std(0x7aa040, 0.9)), (i - 4) * 0.012, 0.16, Math.sin(i) * 0.01, 0, 0, (i - 4) * 0.06)); g.add(at(cyl(0.035, 0.035, 0.03, std(0x9a7a40, 0.9), 8), 0, 0.12, 0)); return g; },
  log: () => G(at(cyl(0.11, 0.12, 0.7, BK(), 9), 0, 0.12, 0, 0, 0, Math.PI / 2), at(cyl(0.1, 0.1, 0.005, std(0xc9a46c, 0.85), 9), 0.352, 0.12, 0, 0, 0, Math.PI / 2), at(cyl(0.1, 0.1, 0.005, std(0xc9a46c, 0.85), 9), -0.352, 0.12, 0, 0, 0, Math.PI / 2)),
  plank: () => G(at(box(0.6, 0.03, 0.14, W()), 0, 0.015, 0), at(box(0.6, 0.03, 0.14, W()), 0.02, 0.045, 0.02, 0, 0.1, 0)),
  thatch: () => { const g = new THREE.Group(); for (let i = 0; i < 12; i++) g.add(at(box(0.012, 0.4, 0.006, std(i % 2 ? 0xb8a050 : 0x9a8a40, 0.95)), (i - 6) * 0.015, 0.2, 0, 0, 0, (i - 6) * 0.02)); g.add(at(cyl(0.06, 0.06, 0.03, std(0x6a5030), 8), 0, 0.2, 0)); return g; },
  flint: () => G(at(rock(0.055, std(0x4a4a58, 0.3, 0.1), 0, 0.6), 0, 0.03, 0)),
  resin: () => G(at(sph(0.045, std(0xd09030, 0.25, 0, { transparent: true, opacity: 0.85 })), 0, 0.04, 0)),
  clay: () => G(at(rock(0.07, std(0xa0805a, 0.9), 1, 0.6), 0, 0.04, 0)),
  brick: () => G(at(box(0.2, 0.07, 0.1, std(0xb0583a, 0.9), 0.008), 0, 0.035, 0)),
  sand: () => G(at(cyl(0.05, 0.12, 0.08, std(0xdcc48a, 1), 9), 0, 0.04, 0)),
  glass: () => G(at(box(0.25, 0.25, 0.012, std(0xaee0f0, 0.05, 0, { transparent: true, opacity: 0.55 })), 0, 0.13, 0)),
  rope: () => G(at(mesh(new THREE.TorusGeometry(0.08, 0.018, 6, 18), std(0xb09a60, 0.9)), 0, 0.03, 0, Math.PI / 2, 0, 0), at(mesh(new THREE.TorusGeometry(0.06, 0.018, 6, 16), std(0xa08a50, 0.9)), 0, 0.06, 0, Math.PI / 2, 0, 0)),
  scrap: () => G(at(box(0.18, 0.012, 0.12, RUST()), 0, 0.02, 0, 0, 0.3, 0.2), at(box(0.1, 0.012, 0.15, METAL()), 0.03, 0.04, 0.02, 0.2, -0.5, 0), at(cyl(0.012, 0.012, 0.12, METAL(), 6), -0.05, 0.05, 0, 0, 0, 1.2)),
  wire: () => G(at(mesh(new THREE.TorusGeometry(0.06, 0.008, 6, 20), std(0xd07a30, 0.3, 0.9)), 0, 0.04, 0, Math.PI / 2, 0, 0), at(mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 20), std(0xd07a30, 0.3, 0.9)), 0, 0.055, 0, Math.PI / 2, 0, 0)),
  circuit: (o) => { const g = G(at(box(0.16, 0.01, 0.11, std(o.color ?? 0x2a7a3a, 0.5)), 0, 0.005, 0)); for (let i = 0; i < 5; i++) g.add(at(box(0.025, 0.012, 0.02, std(0x222222, 0.4)), -0.05 + i * 0.025, 0.016, (i % 2) * 0.03 - 0.01)); g.add(at(cyl(0.008, 0.008, 0.02, std(0x3060c0, 0.4), 6), 0.05, 0.02, 0.03)); return g; },
  battery: (o) => G(at(cyl(0.035, 0.035, 0.12, std(o.color ?? 0x2a2a2e, 0.4, 0.2), 10), 0, 0.06, 0), at(cyl(0.036, 0.036, 0.03, std(0xd8b030, 0.4, 0.5), 10), 0, 0.105, 0), at(cyl(0.012, 0.012, 0.012, METAL(), 6), 0, 0.126, 0)),
  hide: () => G(at(box(0.3, 0.02, 0.22, std(0x8a6a48, 0.85), 0.01), 0, 0.01, 0, 0, 0.3, 0.05)),
  wool: () => { const m = std(0xf2eadc, 0.95); const g = new THREE.Group(); for (let i = 0; i < 7; i++) { const a = i * 2.4; g.add(at(sph(0.05 + (i % 3) * 0.01, m), Math.cos(a) * 0.05 * (i ? 1 : 0), 0.06 + (i % 2) * 0.03, Math.sin(a) * 0.05 * (i ? 1 : 0))); } return g; },
  feather: () => G(at(box(0.004, 0.25, 0.06, std(0x5a8ac0, 0.8)), 0, 0.12, 0, 0, 0, 0.2), at(cyl(0.004, 0.004, 0.27, std(0xe8e0d0, 0.6), 4), 0, 0.12, 0, 0, 0, 0.2)),
  bone: () => G(at(cyl(0.02, 0.02, 0.26, std(0xe8e0c8, 0.6), 6), 0, 0.02, 0, 0, 0, Math.PI / 2), at(sph(0.035, std(0xe8e0c8, 0.6)), 0.14, 0.02, 0.015), at(sph(0.035, std(0xe8e0c8, 0.6)), 0.14, 0.02, -0.015), at(sph(0.035, std(0xe8e0c8, 0.6)), -0.14, 0.02, 0.015), at(sph(0.035, std(0xe8e0c8, 0.6)), -0.14, 0.02, -0.015)),
  amber: () => G(at(rock(0.05, std(0xe09030, 0.15, 0, { transparent: true, opacity: 0.8, emissive: 0x402000 }), 1, 0.8), 0, 0.04, 0), at(box(0.012, 0.004, 0.02, std(0x222222)), 0, 0.04, 0)),
  ore_iron: () => G(at(rock(0.07, std(0x5a5a62, 0.5, 0.6), 0), 0, 0.045, 0), at(rock(0.03, std(0x8a8a96, 0.3, 0.9), 0), 0.04, 0.07, 0.02)),
  ore_copper: () => G(at(rock(0.065, std(0x7a6a5a, 0.8), 0), 0, 0.04, 0), at(rock(0.03, std(0x3aa080, 0.4, 0.2), 0), 0.03, 0.06, 0.02), at(rock(0.025, std(0xd07a30, 0.3, 0.9), 0), -0.03, 0.06, 0)),
  ingot_iron: () => G(at(box(0.16, 0.05, 0.07, std(0x8a8e96, 0.35, 0.9), 0.01), 0, 0.025, 0)),
  ingot_copper: () => G(at(box(0.16, 0.05, 0.07, std(0xd0783a, 0.3, 0.9), 0.01), 0, 0.025, 0)),
  sulfur: () => G(at(rock(0.06, std(0xe8d030, 0.7), 0), 0, 0.04, 0)),
  obsidian: () => G(at(rock(0.06, std(0x1a1420, 0.1, 0.3), 0, 0.9), 0, 0.05, 0)),
  tar: () => G(at(sph(0.06, std(0x101010, 0.15)), 0, 0.04, 0)),
  dung: () => G(at(sph(0.06, std(0x5a4228, 0.9)), 0, 0.04, 0), at(sph(0.045, std(0x5a4228, 0.9)), 0.02, 0.09, 0), at(sph(0.03, std(0x5a4228, 0.9)), 0.0, 0.13, 0.01)),
  charcoal: () => G(at(rock(0.05, std(0x1e1e20, 0.9), 0), 0, 0.03, 0), at(rock(0.04, std(0x2a2a2a, 0.9), 0), 0.05, 0.03, 0.02)),
  jerrycan: () => G(at(box(0.18, 0.24, 0.08, std(0x4a7a3a, 0.5), 0.015), 0, 0.12, 0), at(box(0.06, 0.03, 0.03, std(0x222222)), 0.04, 0.26, 0), at(box(0.1, 0.02, 0.02, std(0x3a6a2a, 0.5)), -0.02, 0.255, 0)),
  crystal: (o) => G(at(mesh(new THREE.OctahedronGeometry(0.06, 0), GLOW(o.color ?? 0x60e0ff, 1.2)), 0, 0.07, 0, 0, 0, 0.1), at(mesh(new THREE.OctahedronGeometry(0.035, 0), GLOW(o.color ?? 0x60e0ff, 1.2)), 0.05, 0.04, 0.02, 0.3, 0, 0.5)),
  salt: () => G(at(rock(0.05, std(0xf0eee8, 0.6), 0), 0, 0.03, 0)),
  honey: () => G(at(box(0.14, 0.1, 0.03, std(0xe0a020, 0.3, 0, { emissive: 0x301800 }), 0.01), 0, 0.05, 0)),
  seeds: () => { const g = new THREE.Group(); g.add(at(cyl(0.05, 0.06, 0.06, std(0xc8b090, 0.9), 8), 0, 0.03, 0)); for (let i = 0; i < 5; i++) g.add(at(sph(0.012, std(0x5a3a20)), Math.cos(i) * 0.025, 0.065, Math.sin(i) * 0.025)); return g; },
  berries: (o) => { const g = new THREE.Group(); const m = std(o.color ?? 0xd8302a, 0.3, 0); for (let i = 0; i < 7; i++) g.add(at(sph(0.025, m), Math.cos(i * 2.4) * 0.035 * (i ? 1 : 0), 0.025 + (i > 4 ? 0.03 : 0), Math.sin(i * 2.4) * 0.035 * (i ? 1 : 0))); g.add(at(box(0.04, 0.004, 0.02, std(0x3a7a2a)), 0, 0.07, 0, 0, 0, 0.4)); return g; },
  mushroom: (o) => G(at(cyl(0.015, 0.02, 0.06, std(0xe8e0c8, 0.8), 6), 0, 0.03, 0), at(mesh(new THREE.SphereGeometry(0.045, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), std(o.color ?? 0x8a6440, 0.7)), 0, 0.055, 0)),
  nut: (o) => G(at(sph(0.025, std(o.color ?? 0xd8c070, 0.6)), 0, 0.025, 0), at(sph(0.025, std(o.color ?? 0xd8c070, 0.6)), 0.04, 0.02, 0.01)),
  palmfruit: () => G(at(sph(0.06, std(0x7a5030, 0.9)), 0, 0.06, 0)),
  cone: (o) => G(at(mesh(new THREE.ConeGeometry(0.05, 0.14, 8), std(o.color ?? 0xd0a040, 0.7)), 0, 0.07, 0), at(sph(0.05, std(o.color ?? 0xd0a040, 0.7)), 0, 0.03, 0)),
  fiddlehead: () => G(at(mesh(new THREE.TorusGeometry(0.03, 0.012, 6, 14, Math.PI * 1.6), std(0x6aa040, 0.7)), 0, 0.09, 0), at(cyl(0.01, 0.012, 0.08, std(0x6aa040), 5), 0.03, 0.04, 0)),
  root: () => G(at(mesh(new THREE.CapsuleGeometry(0.03, 0.12, 3, 6), std(0xa07a50, 0.9)), 0, 0.03, 0, 0, 0, Math.PI / 2.2)),
  egg: () => G(at(sph(0.035, std(0xf0e8d8, 0.5)), 0, 0.04, 0)),
  friedegg: () => G(at(cyl(0.07, 0.07, 0.01, std(0xfaf6ee, 0.5), 14), 0, 0.005, 0), at(sph(0.025, std(0xf2b030, 0.3)), 0, 0.012, 0)),
  meat: (o) => G(at(sph(0.06, std(o.color ?? 0xc04a4a, 0.6)), 0, 0.06, 0), at(cyl(0.012, 0.012, 0.12, std(0xf0e8d8), 6), 0.08, 0.1, 0, 0, 0, -0.8), at(sph(0.02, std(0xf0e8d8)), 0.12, 0.14, 0)),
  fish: (o) => G(at(mesh(new THREE.SphereGeometry(0.05, 10, 8), std(o.color ?? 0x7a9aa8, 0.4, 0.2)), 0, 0.04, 0), at(mesh(new THREE.ConeGeometry(0.04, 0.06, 4), std(o.color ?? 0x7a9aa8, 0.4)), -0.08, 0.04, 0, 0, 0, Math.PI / 2)),
  bowl: (o) => G(at(mesh(new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), W()), 0, 0.07, 0), at(cyl(0.075, 0.075, 0.01, std(o.color ?? 0x8a5a30, 0.4), 12), 0, 0.06, 0)),
  kebab: () => { const g = G(at(cyl(0.006, 0.006, 0.3, W(), 4), 0, 0.15, 0)); [0xa07a50, 0xd0402a, 0x6aa040, 0x8a6440].forEach((c, i) => g.add(at(box(0.04, 0.04, 0.04, std(c, 0.6), 0.01), 0, 0.08 + i * 0.05, 0))); return g; },
  jerky: () => G(at(box(0.16, 0.012, 0.05, std(0x6a3020, 0.8)), 0, 0.01, 0, 0, 0.2, 0.05)),
  noodles: () => G(at(cyl(0.06, 0.05, 0.1, PLASTIC(0xf4f0e6), 12), 0, 0.05, 0), at(cyl(0.061, 0.061, 0.04, PLASTIC(0xd03030), 12), 0, 0.06, 0), at(cyl(0.062, 0.062, 0.006, std(0xc8c8c8, 0.4, 0.6), 12), 0, 0.1, 0)),
  bar: () => G(at(box(0.12, 0.02, 0.04, PLASTIC(0x3a8ad0)), 0, 0.01, 0), at(box(0.04, 0.021, 0.041, PLASTIC(0xf0c030)), 0, 0.01, 0)),
  mug: () => G(at(cyl(0.04, 0.035, 0.09, PLASTIC(0xe8e0d0), 12), 0, 0.045, 0), at(mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 10), PLASTIC(0xe8e0d0)), 0.045, 0.05, 0), at(cyl(0.036, 0.036, 0.005, std(0x3a2010, 0.2), 12), 0, 0.085, 0)),
  flask: (o) => G(at(sph(0.05, std(o.color ?? 0x5ab0e0, 0.1, 0, { transparent: true, opacity: 0.7 })), 0, 0.05, 0), at(cyl(0.015, 0.02, 0.05, std(0xd8eef4, 0.1, 0, { transparent: true, opacity: 0.6 }), 8), 0, 0.11, 0), at(cyl(0.016, 0.016, 0.015, W(), 6), 0, 0.14, 0)),
  herb: () => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) g.add(at(box(0.03, 0.002, 0.07, std(0x4a9a50, 0.7)), 0, 0.01 + i * 0.002, 0, 0, i * 1.2, 0.3)); return g; },
  hatchet: (o) => { const head = o.metal ? METAL() : ST(); return G(handle(0.42), wrap(0.38), at(box(0.04, 0.09, 0.14, head, 0.01), 0, 0.4, 0.06), at(box(0.035, 0.07, 0.02, head), 0, 0.4, 0.14)); },
  pick: (o) => { const head = o.metal ? METAL() : ST(); return G(handle(0.45), wrap(0.42), at(mesh(new THREE.ConeGeometry(0.025, 0.16, 5), head), 0, 0.44, 0.09, Math.PI / 2, 0, 0), at(mesh(new THREE.ConeGeometry(0.025, 0.16, 5), head), 0, 0.44, -0.09, -Math.PI / 2, 0, 0), at(box(0.05, 0.05, 0.06, head), 0, 0.44, 0)); },
  club: () => G(at(cyl(0.05, 0.022, 0.5, BK(), 7), 0, 0.25, 0), at(sph(0.06, BK()), 0, 0.48, 0), wrap(0.06, 0.026)),
  torch: () => G(at(cyl(0.02, 0.018, 0.42, BK(), 6), 0, 0.21, 0), at(cyl(0.035, 0.028, 0.08, std(0x6a5030, 0.9), 7), 0, 0.42, 0), at(sph(0.04, GLOW(0xffa030, 3)), 0, 0.48, 0)),
  spear: () => G(at(cyl(0.015, 0.015, 1.1, W(), 6), 0, 0.55, 0), at(mesh(new THREE.ConeGeometry(0.03, 0.14, 4), std(0x3a3a48, 0.3, 0.1)), 0, 1.15, 0), wrap(1.06, 0.02)),
  bola: () => { const g = new THREE.Group(); for (let i = 0; i < 3; i++) { const a = i * 2.1; g.add(at(sph(0.035, ST()), Math.cos(a) * 0.12, 0.04, Math.sin(a) * 0.12)); g.add(at(cyl(0.004, 0.004, 0.12, std(0xb09a60), 3), Math.cos(a) * 0.06, 0.04, Math.sin(a) * 0.06, Math.PI / 2, 0, -a + Math.PI / 2)); } return g; },
  slingshot: () => G(at(cyl(0.015, 0.015, 0.2, W(), 6), 0, 0.1, 0), at(cyl(0.012, 0.012, 0.12, W(), 6), 0.04, 0.24, 0, 0, 0, -0.5), at(cyl(0.012, 0.012, 0.12, W(), 6), -0.04, 0.24, 0, 0, 0, 0.5), at(box(0.12, 0.006, 0.01, std(0x8a4a2a, 0.6)), 0, 0.28, -0.01)),
  blowgun: () => G(at(cyl(0.018, 0.02, 0.7, std(0x6e9a3c, 0.6), 8), 0, 0.35, 0), at(cyl(0.022, 0.022, 0.03, std(0x3a3020), 8), 0, 0.68, 0)),
  dart: () => G(at(cyl(0.004, 0.004, 0.12, W(), 4), 0, 0.06, 0), at(mesh(new THREE.ConeGeometry(0.012, 0.03, 4), std(0x7a3aa8, 0.6)), 0, 0.01, 0, Math.PI, 0, 0)),
  rifle: () => G(at(box(0.05, 0.08, 0.6, PLASTIC(0xd0302a), 0.01), 0, 0.12, 0.15), at(cyl(0.035, 0.035, 0.4, std(0xc8c8c8, 0.4, 0.8), 10), 0, 0.17, 0.35, Math.PI / 2, 0, 0), at(box(0.04, 0.16, 0.05, W()), 0, 0.04, -0.1), at(box(0.12, 0.008, 0.04, std(0x2a6ab0, 0.6)), 0, 0.22, 0.1)),
  shell: () => G(at(cyl(0.012, 0.012, 0.05, std(0x7a3aa8, 0.4), 8), 0, 0.025, 0), at(cyl(0.013, 0.013, 0.012, std(0xd0a040, 0.3, 0.8), 8), 0, 0.006, 0)),
  hammer: () => G(handle(0.36), wrap(0.32), at(box(0.06, 0.06, 0.16, ST(), 0.01), 0, 0.36, 0.02)),
  // the gravity gun: a chunky emitter with three prongs around a glowing core and coil rings
  gravgun: () => {
    const shell = std(0xe8ecee, 0.32, 0.1), dark = std(0x2a3036, 0.45, 0.4), core = GLOW(0x5ef2ff, 2.2), coil = std(0xf07a2a, 0.35, 0.2);
    const g = G(at(box(0.05, 0.13, 0.06, dark, 0.012), 0, 0.065, -0.01), at(box(0.075, 0.07, 0.24, shell, 0.02), 0, 0.15, 0.08));
    for (const z of [0.0, 0.07, 0.14]) g.add(at(mesh(new THREE.TorusGeometry(0.045, 0.009, 8, 20), coil), 0, 0.15, 0.04 + z));
    g.add(at(cyl(0.032, 0.04, 0.05, dark, 14), 0, 0.15, 0.22, Math.PI / 2, 0, 0));
    g.add(at(sph(0.024, core, 14, 10), 0, 0.15, 0.25));
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.add(at(box(0.012, 0.012, 0.09, METAL(), 0.004), Math.cos(a) * 0.04, 0.15 + Math.sin(a) * 0.04, 0.27, -Math.sin(a) * 0.35, Math.cos(a) * 0.35, 0)); }
    g.add(at(box(0.04, 0.012, 0.06, core), 0, 0.19, 0.06));
    const mz = new THREE.Object3D(); mz.name = 'muzzle'; mz.position.set(0, 0.15, 0.3); g.add(mz);
    return g;
  },
  scanner: () => {
    const g = G(at(box(0.09, 0.16, 0.05, PLASTIC(0xf2c230), 0.015), 0, 0.12, 0), at(box(0.07, 0.06, 0.006, GLOW(0x60ff90, 0.8)), 0, 0.15, 0.026), at(cyl(0.02, 0.025, 0.06, PLASTIC(0x2a2a2e), 8), 0, 0.22, 0.01, Math.PI / 2.5, 0, 0));
    g.add(at(box(0.02, 0.012, 0.01, PLASTIC(0xd02a2a)), -0.02, 0.09, 0.027)); g.add(at(box(0.02, 0.012, 0.01, PLASTIC(0x2a60d0)), 0.02, 0.09, 0.027));
    g.add(at(cyl(0.003, 0.003, 0.12, METAL(), 4), 0.035, 0.26, -0.01, 0, 0, -0.2)); g.add(at(sph(0.008, GLOW(0xff3030, 2)), 0.048, 0.32, -0.01));
    return g;
  },
  shovel: () => G(handle(0.6), at(box(0.12, 0.16, 0.01, METAL(), 0.004), 0, 0.68, 0.0), wrap(0.05)),
  canteen: () => G(at(cyl(0.065, 0.065, 0.025, std(0x5a7a5a, 0.6, 0.3), 14), 0, 0.07, 0, Math.PI / 2, 0, 0), at(cyl(0.012, 0.012, 0.02, std(0x222222), 6), 0, 0.14, 0)),
  net: () => G(handle(0.5), at(mesh(new THREE.TorusGeometry(0.12, 0.008, 6, 18), W()), 0, 0.62, 0, 0, Math.PI / 2, 0), at(mesh(new THREE.ConeGeometry(0.11, 0.18, 10, 1, true), std(0xe8e0c0, 0.9, 0, { transparent: true, opacity: 0.6, side: THREE.DoubleSide })), 0, 0.62, -0.09, -Math.PI / 2, 0, 0)),
  binoculars: () => G(at(cyl(0.025, 0.028, 0.1, PLASTIC(0x2a2a2a), 10), -0.03, 0.05, 0, Math.PI / 2, 0, 0), at(cyl(0.025, 0.028, 0.1, PLASTIC(0x2a2a2a), 10), 0.03, 0.05, 0, Math.PI / 2, 0, 0), at(box(0.04, 0.02, 0.04, PLASTIC(0x3a3a3a)), 0, 0.05, 0)),
  flashlight: () => G(at(cyl(0.018, 0.018, 0.16, PLASTIC(0x2a50a0), 10), 0, 0.08, 0), at(cyl(0.026, 0.02, 0.04, PLASTIC(0x2a50a0), 10), 0, 0.17, 0), at(cyl(0.022, 0.022, 0.004, GLOW(0xfff2c0, 1), 10), 0, 0.19, 0)),
  walkie: () => G(at(box(0.05, 0.12, 0.03, PLASTIC(0x2a2a2a), 0.008), 0, 0.06, 0), at(cyl(0.006, 0.006, 0.08, PLASTIC(0x1a1a1a), 6), 0.015, 0.16, 0), at(box(0.03, 0.02, 0.004, GLOW(0xa0ff60, 0.6)), 0, 0.09, 0.016)),
  sickle: () => G(handle(0.25), at(mesh(new THREE.TorusGeometry(0.08, 0.012, 4, 10, Math.PI * 1.1), std(0x3a3a48, 0.3)), 0, 0.3, 0.06, 0, Math.PI / 2, 0)),
  whistle: () => G(at(cyl(0.015, 0.015, 0.06, PLASTIC(0xd04020), 8), 0, 0.03, 0, 0, 0, Math.PI / 2)),
  rod: () => G(at(cyl(0.008, 0.015, 1.2, W(), 5), 0, 0.6, 0), at(cyl(0.025, 0.025, 0.02, PLASTIC(0x3a3a3a), 8), 0.02, 0.2, 0, 0, 0, Math.PI / 2)),
  lantern: () => G(at(cyl(0.05, 0.05, 0.12, std(0xe0f0c0, 0.1, 0, { transparent: true, opacity: 0.5 }), 10), 0, 0.08, 0), at(sph(0.03, GLOW(0xd8ff60, 2.5)), 0, 0.08, 0), at(cyl(0.055, 0.055, 0.015, W(), 10), 0, 0.15, 0), at(mesh(new THREE.TorusGeometry(0.03, 0.005, 4, 10, Math.PI), METAL()), 0, 0.16, 0)),
  saddle: (o) => { const s = o.scale ?? 1; return G(at(box(0.4 * s, 0.08 * s, 0.35 * s, LE(), 0.03), 0, 0.04 * s, 0), at(box(0.1 * s, 0.12 * s, 0.06 * s, LE(), 0.02), 0, 0.12 * s, 0.14 * s)); },
  bandage: () => G(at(cyl(0.035, 0.035, 0.05, std(0xf0ece0, 0.9), 10), 0, 0.025, 0, 0, 0, Math.PI / 2)),
  splint: () => G(at(box(0.04, 0.3, 0.015, W()), 0, 0.15, 0), at(box(0.05, 0.03, 0.03, std(0xf0ece0)), 0, 0.1, 0), at(box(0.05, 0.03, 0.03, std(0xf0ece0)), 0, 0.2, 0)),
  vial: () => G(at(cyl(0.02, 0.02, 0.09, std(0x60d080, 0.1, 0, { transparent: true, opacity: 0.75, emissive: 0x104010 }), 8), 0, 0.045, 0), at(cyl(0.015, 0.015, 0.02, W(), 6), 0, 0.1, 0)),
  medkit: () => G(at(box(0.18, 0.12, 0.08, PLASTIC(0xe8e8e8), 0.015), 0, 0.06, 0), at(box(0.04, 0.012, 0.081, PLASTIC(0xd02a2a)), 0, 0.06, 0), at(box(0.012, 0.04, 0.081, PLASTIC(0xd02a2a)), 0, 0.06, 0)),
  kit: () => G(at(box(0.24, 0.16, 0.16, W(), 0.01), 0, 0.08, 0), at(box(0.25, 0.03, 0.02, LE()), 0, 0.12, 0.07), at(box(0.25, 0.03, 0.02, LE()), 0, 0.12, -0.07)),
  campfire_kit: () => { const g = new THREE.Group(); for (let i = 0; i < 5; i++) g.add(at(cyl(0.02, 0.02, 0.3, BK(), 5), 0, 0.05, 0, Math.PI / 2, i * 0.6, 0.3)); for (let i = 0; i < 6; i++) g.add(at(rock(0.04, ST()), Math.cos(i) * 0.12, 0.02, Math.sin(i) * 0.12)); return g; },
  part: (o) => G(at(box(0.14, 0.1, 0.1, METAL(), 0.01), 0, 0.05, 0), at(cyl(0.02, 0.02, 0.06, std(o.color ?? 0xd0a040, 0.4, 0.6), 8), 0, 0.12, 0)),
  dynamo: () => G(at(cyl(0.07, 0.07, 0.08, PLASTIC(0xd03030), 14), 0, 0.07, 0, Math.PI / 2, 0, 0), at(box(0.015, 0.1, 0.015, METAL()), 0.05, 0.12, 0.05), at(cyl(0.012, 0.012, 0.05, W(), 6), 0.05, 0.17, 0.08, Math.PI / 2, 0, 0)),
  gear: (o) => { const g = new THREE.Group(); const m = std(o.color ?? 0xa8adb4, 0.35, 0.85); g.add(at(cyl(0.07, 0.07, 0.025, m, 16), 0, 0.02, 0)); for (let i = 0; i < 10; i++) g.add(at(box(0.025, 0.025, 0.03, m), Math.cos(i / 10 * 6.28) * 0.08, 0.02, Math.sin(i / 10 * 6.28) * 0.08, 0, -i / 10 * 6.28, 0)); return g; },
  tire: () => G(at(mesh(new THREE.TorusGeometry(0.16, 0.07, 8, 20), std(0x1e1e1e, 0.9)), 0, 0.07, 0, Math.PI / 2, 0, 0), at(cyl(0.1, 0.1, 0.05, METAL(), 12), 0, 0.07, 0)),
  coil: () => G(at(mesh(new THREE.TorusKnotGeometry(0.06, 0.012, 64, 6, 2, 9), std(0xd07a30, 0.3, 0.9)), 0, 0.08, 0), at(cyl(0.03, 0.03, 0.2, std(0xe09030, 0.2, 0, { transparent: true, opacity: 0.7 }), 10), 0, 0.08, 0)),
  jar: (o) => G(at(cyl(0.045, 0.045, 0.1, std(0xd8eef4, 0.05, 0, { transparent: true, opacity: 0.45 }), 12), 0, 0.05, 0), at(sph(0.03, std(o.color ?? 0x60a040, 0.7)), 0, 0.04, 0), at(cyl(0.047, 0.047, 0.02, METAL(), 12), 0, 0.105, 0)),
  fossil: () => G(at(rock(0.08, std(0xa89a80, 0.9), 0, 0.5), 0, 0.03, 0), at(mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 14, Math.PI * 1.5), std(0xe8dcc0, 0.7)), 0, 0.055, 0, Math.PI / 2, 0, 0)),
  eggshell: () => G(at(mesh(new THREE.SphereGeometry(0.05, 10, 6, 0, Math.PI, 0, Math.PI / 2), std(0xe8e0c8, 0.6, 0, { side: THREE.DoubleSide })), 0, 0.02, 0, Math.PI, 0, 0)),
  swab: () => G(at(cyl(0.004, 0.004, 0.14, PLASTIC(0xf0f0f0), 4), 0, 0.07, 0), at(sph(0.012, std(0x9a4040, 0.9)), 0, 0.145, 0)),
  dinoegg: (o) => { const g = G(at(sph(0.11, std(0xe8dcc0, 0.6)), 0, 0.12, 0)); g.children[0].scale.set(1, 1.3, 1); for (let i = 0; i < 6; i++) g.add(at(sph(0.02, std(0x8a6a4a, 0.8)), Math.cos(i * 1.7) * 0.1, 0.1 + (i % 3) * 0.05, Math.sin(i * 1.7) * 0.1)); return g; },
};

const modelCache = new Map();
// placeables show a miniature of the real structure (set by the structures module)
let structureBuilder = null;
export function setStructureModelBuilder(fn) { structureBuilder = fn; modelCache.clear(); }
function miniature(def) {
  const st = structureBuilder?.(def.place);
  if (!st) return B.kit(def);
  const g = new THREE.Group();
  g.add(st.g);
  const bb = new THREE.Box3().setFromObject(st.g), sz = bb.getSize(new THREE.Vector3());
  st.g.scale.setScalar(0.42 / Math.max(sz.x, sz.y, sz.z, 0.01));
  st.g.position.y = -bb.min.y * st.g.scale.y;
  return g;
}
export function buildItemModel(def, opt = {}) {
  const mini = def.place && def.model === 'kit' && structureBuilder;
  const key = (mini ? 'mini:' + def.id : def.model) + ':' + (def.color ?? '') + ':' + (def.metal ? 1 : 0) + ':' + (def.scale ?? '');
  const fn = mini ? miniature : B[def.model] ?? B.kit;
  if (opt.fresh || !modelCache.has(key)) {
    const g = fn(def);
    g.name = 'item:' + def.id;
    if (opt.fresh) return g;
    modelCache.set(key, g);
  }
  return modelCache.get(key).clone();
}

// Render every item into a pixel-art icon (data URLs keyed by item id). Each
// model is rendered 4x supersampled, boiled down to a 32 x 32 sprite with a
// limited, hue-shifted shading ramp (shadows drift cool, highlights warm), a
// selective outline (a dark version of the colour it borders), a lit rim on
// the top-left and a shaded one on the bottom-right. Shown at whole multiples
// so every pixel stays square.
// opt.build(def) makes the model (items by default), opt.rot its turn, opt.key(def) the output key
export function renderIcons(renderer, items, size = 32, opt = {}) {
  const SS = 4, big = size * SS;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5048, 1.8));
  const d = new THREE.DirectionalLight(0xfff4e0, 2.8); d.position.set(-1.2, 2, 1.6); scene.add(d);
  const rim = new THREE.DirectionalLight(0x9ad0ff, 1.3); rim.position.set(1.5, 0.5, -1.5); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 20);
  const rt = new THREE.WebGLRenderTarget(big, big, { samples: 4 });
  const buf = new Uint8Array(big * big * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const out = {};
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NeutralToneMapping;
  const N = size * size;
  const cr = new Float32Array(N), cg = new Float32Array(N), cb = new Float32Array(N), ca = new Float32Array(N);
  const LEVELS = [0.16, 0.3, 0.46, 0.64, 0.82, 1.0];
  for (const def of Object.values(items)) {
    const g = opt.build ? opt.build(def) : buildItemModel(def, { fresh: true });
    if (!g) continue;
    g.rotation.set(...(opt.rot ?? [0.35, -0.75, 0.15]));
    scene.add(g);
    const bb = new THREE.Box3().setFromObject(g);
    const c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
    const r = Math.max(sz.x, sz.y, sz.z) * 0.6 + 0.001;
    cam.position.set(c.x, c.y + r * 0.2, c.z + r / Math.tan((15 * Math.PI) / 180) * 1.0);
    cam.lookAt(c);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, big, big, buf);
    scene.remove(g);
    // box-filter each 4x4 block (alpha weighted), flipping y
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let R = 0, G = 0, B = 0, A = 0;
      for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
        const k = ((big - 1 - (y * SS + j)) * big + x * SS + i) * 4, a = buf[k + 3] / 255;
        R += buf[k] * a; G += buf[k + 1] * a; B += buf[k + 2] * a; A += a;
      }
      const o = y * size + x;
      ca[o] = A / (SS * SS);
      if (A > 0) { cr[o] = R / A / 255; cg[o] = G / A / 255; cb[o] = B / A / 255; } else cr[o] = cg[o] = cb[o] = 0;
    }
    const inside = (x, y) => x >= 0 && y >= 0 && x < size && y < size && ca[y * size + x] > 0.42;
    const img = ctx.createImageData(size, size);
    const put = (o, rr, gg, bb2) => { img.data[o * 4] = Math.max(0, Math.min(255, Math.round(rr * 255))); img.data[o * 4 + 1] = Math.max(0, Math.min(255, Math.round(gg * 255))); img.data[o * 4 + 2] = Math.max(0, Math.min(255, Math.round(bb2 * 255))); img.data[o * 4 + 3] = 255; };
    // quantised, hue-shifted colour of an inside pixel
    const shade = (o, bias = 0) => {
      let rr = cr[o], gg = cg[o], bb2 = cb[o];
      const l = 0.3 * rr + 0.59 * gg + 0.11 * bb2 + 1e-4;
      let li = 0; while (li < LEVELS.length - 1 && l * 1.05 + bias > (LEVELS[li] + LEVELS[li + 1]) / 2) li++;
      const lq = LEVELS[li], k = lq / l;
      rr *= k; gg *= k; bb2 *= k;
      // a little more saturation, cool shadows and warm lights
      const m = (rr + gg + bb2) / 3;
      rr = m + (rr - m) * 1.18; gg = m + (gg - m) * 1.18; bb2 = m + (bb2 - m) * 1.18;
      const w = (lq - 0.55) * 0.12;
      return [rr + w, gg + w * 0.6, bb2 - w];
    };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = y * size + x;
      if (inside(x, y)) {
        // lit rim on the top-left edge, shaded rim on the bottom-right
        const lit = !inside(x - 1, y) || !inside(x, y - 1);
        const dark = !inside(x + 1, y) || !inside(x, y + 1);
        const [rr, gg, bb2] = shade(o, lit && !dark ? 0.12 : dark && !lit ? -0.1 : 0);
        put(o, rr, gg, bb2);
      } else {
        // selective outline: a deep version of the colour it borders
        let n = -1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (inside(x + dx, y + dy)) { n = (y + dy) * size + x + dx; break; }
        if (n >= 0) { put(o, 0.06 + cr[n] * 0.18, 0.05 + cg[n] * 0.16, 0.07 + cb[n] * 0.2); }
      }
    }
    ctx.putImageData(img, 0, 0);
    out[opt.key ? opt.key(def) : def.id] = canvas.toDataURL();
  }
  renderer.toneMapping = prevTone;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  rt.dispose();
  return out;
}
