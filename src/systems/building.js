// Raft-style free building: foundations on stilts, floors, walls, windows,
// doorways with doors, half walls, roofs, stairs, pillars, ladders, fences and
// gates in four material tiers. Each building has its own 2 m grid (origin +
// yaw set by its first foundation); pieces snap to cells / edges / levels and
// must be supported. Rendered with one InstancedMesh per piece+material.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { boxUV } from '../entities/vanModel.js';
import { bTex, withMaps } from '../gfx/buildTextures.js';
import { ITEMS } from '../data/items.js';

const S = 2; // cell size (m)
const H = 2; // storey height (m)
export const MATS = {
  thatch: { name: 'Stick & Thatch', hp: 120, step: 'step_wood', unlock: null },
  wood: { name: 'Plank', hp: 260, step: 'step_wood', unlock: null },
  stone: { name: 'Brick', hp: 650, step: 'step_stone', unlock: 'pottery' },
  metal: { name: 'Scrap Metal', hp: 1000, step: 'step_metal', unlock: 'metallurgy' },
};
const MAT_IDS = Object.keys(MATS);
// cost per piece per material
const COST = {
  foundation: { thatch: { log: 1, stick: 4 }, wood: { plank: 4, log: 1 }, stone: { brick: 6, stone: 4 }, metal: { scrap: 6, ingot_iron: 1 } },
  floor: { thatch: { stick: 4, thatch: 2 }, wood: { plank: 3 }, stone: { brick: 4 }, metal: { scrap: 4 } },
  wall: { thatch: { stick: 3, thatch: 3 }, wood: { plank: 4 }, stone: { brick: 6 }, metal: { scrap: 5, ingot_iron: 1 } },
  window: { thatch: { stick: 3, thatch: 2 }, wood: { plank: 3, glass: 1 }, stone: { brick: 5, glass: 1 }, metal: { scrap: 4, glass: 1 } },
  doorway: { thatch: { stick: 4, thatch: 2, rope: 1 }, wood: { plank: 5, rope: 1 }, stone: { brick: 5, plank: 2 }, metal: { scrap: 5, plank: 2 } },
  halfwall: { thatch: { stick: 2, thatch: 1 }, wood: { plank: 2 }, stone: { brick: 3 }, metal: { scrap: 3 } },
  roof: { thatch: { stick: 2, thatch: 4 }, wood: { plank: 3, thatch: 1 }, stone: { brick: 4, plank: 1 }, metal: { scrap: 4 } },
  stairs: { thatch: { stick: 6, rope: 1 }, wood: { plank: 5 }, stone: { brick: 6 }, metal: { scrap: 6 } },
  pillar: { thatch: { log: 1 }, wood: { log: 1, plank: 1 }, stone: { brick: 3 }, metal: { scrap: 2, ingot_iron: 1 } },
  fence: { thatch: { stick: 4, rope: 1 }, wood: { plank: 3, log: 1 }, stone: { brick: 4, stone: 2 }, metal: { scrap: 4 } },
  gate: { thatch: { stick: 5, rope: 2 }, wood: { plank: 4, rope: 1 }, stone: { brick: 3, plank: 3 }, metal: { scrap: 5 } },
  ladder: { thatch: { stick: 6, rope: 2 }, wood: { plank: 3, rope: 1 }, stone: { plank: 3, rope: 1 }, metal: { scrap: 3 } },
};
export const COSTS = COST;
export const PIECES = [
  { id: 'foundation', name: 'Foundation', slot: 'cell' },
  { id: 'floor', name: 'Floor', slot: 'cell' },
  { id: 'wall', name: 'Wall', slot: 'edge' },
  { id: 'window', name: 'Window', slot: 'edge' },
  { id: 'doorway', name: 'Doorway', slot: 'edge' },
  { id: 'halfwall', name: 'Half Wall', slot: 'edge' },
  { id: 'roof', name: 'Roof', slot: 'cell', rot: true },
  { id: 'stairs', name: 'Stairs', slot: 'cell', rot: true },
  { id: 'pillar', name: 'Pillar', slot: 'corner' },
  { id: 'fence', name: 'Fence', slot: 'edge', ground: true },
  { id: 'gate', name: 'Gate', slot: 'edge', ground: true },
  { id: 'ladder', name: 'Ladder', slot: 'edge' },
];
const PIECE = Object.fromEntries(PIECES.map((p) => [p.id, p]));
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();

// ------------------------------------------------------------------ materials per tier
const matCache = {};
function M(key, o) { return matCache[key] ?? (matCache[key] = patchMaterial(new THREE.MeshStandardMaterial(withMaps(o)), {})); }
function tierMats(mat) {
  const frame = M('b_bark', { map: bTex('bark'), roughness: 0.92 });
  switch (mat) {
    case 'thatch': return { face: M('b_thatch', { map: bTex('thatch'), roughness: 0.95 }), floor: M('b_floorT', { map: bTex('logs'), roughness: 0.9 }), frame, trim: frame };
    case 'wood': return { face: M('b_plankV', { map: bTex('plankV'), roughness: 0.82 }), floor: M('b_plank', { map: bTex('plank'), roughness: 0.82 }), frame, trim: M('b_plankT', { map: bTex('plank'), roughness: 0.82, color: 0xd0b090 }) };
    case 'stone': return { face: M('b_brick', { map: bTex('brick'), roughness: 0.88 }), floor: M('b_stone', { map: bTex('stone'), roughness: 0.9 }), frame: M('b_stoneF', { map: bTex('stone'), roughness: 0.9, color: 0xd8d0c8 }), trim: M('b_plank2', { map: bTex('plank'), roughness: 0.82 }) };
    default: return { face: M('b_metal', { map: bTex('metal'), roughness: 0.45, metalness: 0.6 }), floor: M('b_metalF', { map: bTex('metal'), roughness: 0.5, metalness: 0.5, color: 0xb0b4b8 }), frame: M('b_iron', { color: 0x4a4a52, roughness: 0.45, metalness: 0.8 }), trim: M('b_iron', {}) };
  }
}
const glassMat = () => M('b_glass', { color: 0xbfe0ea, roughness: 0.05, transparent: true, opacity: 0.3, depthWrite: false });

// ------------------------------------------------------------------ geometry builders (local: cell centre at origin, edges along x at z = 0)
const bx = (w, h, d, x, y, z, uv = 0.5) => { const g = new THREE.BoxGeometry(w, h, d); boxUV(g, uv); g.translate(x, y, z); return g; };
const cy = (r, h, x, y, z, seg = 7) => { const g = new THREE.CylinderGeometry(r, r * 1.05, h, seg); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * h * 0.5); g.translate(x, y, z); return g; };
function strip(g) { const out = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'uv'].includes(k)) out.deleteAttribute(k); return out; }
function group(parts) {
  // parts: [[geo, slot]] -> merged geometry with groups in slot order
  const slots = ['face', 'floor', 'frame', 'trim', 'glass'];
  const geos = [], mats = [];
  for (const slot of slots) {
    const list = parts.filter((p) => p[1] === slot).map((p) => strip(p[0]));
    if (!list.length) continue;
    geos.push(list.length > 1 ? mergeGeometries(list) : list[0]);
    mats.push(slot);
  }
  const geo = mergeGeometries(geos, true);
  geo.computeBoundingSphere();
  return { geo, slots: mats };
}
const GEO = {
  foundation: (mat) => group([[bx(S, 0.3, S, 0, -0.15, 0, 0.5), 'floor'], ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => [cy(0.11, 0.34, a * 0.88, -0.15, b * 0.88), 'frame']), [bx(S + 0.04, 0.12, 0.14, 0, -0.24, -0.93), 'frame'], [bx(S + 0.04, 0.12, 0.14, 0, -0.24, 0.93), 'frame']]),
  floor: () => group([[bx(S, 0.12, S, 0, -0.06, 0), 'floor'], [bx(S, 0.1, 0.12, 0, -0.14, 0), 'frame']]),
  wall: (mat) => group([[bx(S - 0.16, H, 0.12, 0, H / 2, 0), 'face'], [cy(0.09, H, -0.92, H / 2, 0), 'frame'], [cy(0.09, H, 0.92, H / 2, 0), 'frame'], ...(mat === 'thatch' ? [[bx(S - 0.1, 0.1, 0.16, 0, H - 0.05, 0), 'frame'], [bx(S - 0.1, 0.08, 0.15, 0, 0.9, 0), 'frame']] : [[bx(S, 0.1, 0.16, 0, H - 0.05, 0), 'trim']])]),
  window: () => group([[bx(S - 0.16, 0.75, 0.12, 0, 0.375, 0), 'face'], [bx(S - 0.16, 0.45, 0.12, 0, H - 0.225, 0), 'face'], [bx(0.42, 0.8, 0.12, -0.71, 1.15, 0), 'face'], [bx(0.42, 0.8, 0.12, 0.71, 1.15, 0), 'face'], [cy(0.09, H, -0.92, H / 2, 0), 'frame'], [cy(0.09, H, 0.92, H / 2, 0), 'frame'], [bx(1.1, 0.07, 0.2, 0, 0.75, 0), 'trim'], [bx(1.1, 0.07, 0.18, 0, 1.55, 0), 'trim'], [bx(0.05, 0.8, 0.05, 0, 1.15, 0), 'trim'], [bx(1.0, 0.8, 0.01, 0, 1.15, 0), 'glass']]),
  doorway: () => group([[bx(0.5, H, 0.12, -0.67, H / 2, 0), 'face'], [bx(0.5, H, 0.12, 0.67, H / 2, 0), 'face'], [bx(0.9, 0.36, 0.12, 0, H - 0.18, 0), 'face'], [cy(0.09, H, -0.92, H / 2, 0), 'frame'], [cy(0.09, H, 0.92, H / 2, 0), 'frame'], [bx(1.02, 0.08, 0.18, 0, H - 0.38, 0), 'trim'], [bx(0.07, 1.62, 0.17, -0.45, 0.81, 0), 'trim'], [bx(0.07, 1.62, 0.17, 0.45, 0.81, 0), 'trim']]),
  halfwall: () => group([[bx(S - 0.16, 1, 0.12, 0, 0.5, 0), 'face'], [cy(0.09, 1.08, -0.92, 0.54, 0), 'frame'], [cy(0.09, 1.08, 0.92, 0.54, 0), 'frame'], [bx(S, 0.08, 0.18, 0, 1.0, 0), 'trim']]),
  roof: () => {
    // lean-to: low edge at local -z (on the wall top), rising toward +z, with overhang
    const len = Math.hypot(S + 0.4, 1.0), ang = Math.atan2(1.0, S + 0.4);
    const g1 = bx(S + 0.3, 0.1, len, 0, 0, 0); g1.rotateX(-ang); g1.translate(0, 0.5, 0);
    const g2 = bx(S + 0.34, 0.12, 0.14, 0, 0, 0); g2.translate(0, 0.02, -(S + 0.4) / 2);
    const g3 = bx(S + 0.34, 0.12, 0.14, 0, 0, 0); g3.translate(0, 1.02, (S + 0.4) / 2);
    const tri = (sx) => { const sh = new THREE.Shape([new THREE.Vector2(-1.0, 0), new THREE.Vector2(1.0, 0), new THREE.Vector2(-1.0, 1.0)]); const g = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false }); g.rotateY(Math.PI / 2); g.translate(sx * (S / 2 - 0.05) - 0.05, 0, 0); boxUV(g, 0.5); return g; };
    return group([[g1, 'face'], [g2, 'frame'], [g3, 'frame'], [tri(-1), 'trim'], [tri(1), 'trim']]);
  },
  stairs: () => {
    const parts = [];
    for (let k = 0; k < 6; k++) parts.push([bx(1.2, 0.08, 0.36, 0, (k + 1) * (H / 6) - 0.04, -0.85 + k * 0.34), 'floor']);
    for (const sx of [-0.62, 0.62]) { const g = bx(0.1, 0.24, 2.6, 0, 0, 0); g.rotateX(-Math.atan2(H, S)); g.translate(sx, H / 2 - 0.05, 0); parts.push([g, 'frame']); }
    return group(parts);
  },
  pillar: () => group([[cy(0.14, H, 0, H / 2, 0, 8), 'frame'], [bx(0.36, 0.1, 0.36, 0, 0.05, 0), 'trim'], [bx(0.36, 0.1, 0.36, 0, H - 0.05, 0), 'trim']]),
  fence: (mat) => group([[cy(0.07, 1.4, -0.95, 0.6, 0), 'frame'], [cy(0.07, 1.4, 0.95, 0.6, 0), 'frame'], [bx(S, 0.12, 0.06, 0, 0.45, 0), 'trim'], [bx(S, 0.12, 0.06, 0, 1.0, 0), 'trim'], ...(mat === 'stone' || mat === 'metal' ? [[bx(S - 0.1, 1.1, 0.08, 0, 0.6, 0), 'face']] : [])]),
  gate: () => group([[cy(0.08, 1.5, -0.95, 0.65, 0), 'frame'], [cy(0.08, 1.5, 0.95, 0.65, 0), 'frame']]),
  ladder: () => { const parts = [[bx(0.06, H, 0.06, -0.25, H / 2, 0), 'frame'], [bx(0.06, H, 0.06, 0.25, H / 2, 0), 'frame']]; for (let k = 0; k < 6; k++) parts.push([bx(0.5, 0.05, 0.05, 0, 0.2 + k * 0.32, 0), 'trim']); return group(parts); },
  stilt: () => group([[cy(0.1, 1, 0, 0.5, 0, 7), 'frame']]),
};
// moving parts (doors, gates) are individual meshes
function doorMesh(mat, gate = false) {
  const T = tierMats(mat);
  const g = new THREE.Group();
  const leaf = new THREE.Group(); g.add(leaf);
  if (gate) {
    const geo = mergeGeometries([bx(1.7, 0.1, 0.06, 0.85, 0.35, 0), bx(1.7, 0.1, 0.06, 0.85, 1.0, 0), bx(0.08, 0.9, 0.06, 0.05, 0.68, 0), bx(0.08, 0.9, 0.06, 1.65, 0.68, 0), (() => { const d = bx(1.9, 0.08, 0.05, 0, 0, 0); d.rotateZ(0.36); d.translate(0.85, 0.68, 0); return d; })()].map(strip));
    const m = new THREE.Mesh(geo, T.trim); m.castShadow = m.receiveShadow = true; leaf.add(m);
    leaf.position.x = -0.85;
  } else {
    const geo = strip(bx(0.82, 1.58, 0.07, 0.41, 0.79, 0));
    const m = new THREE.Mesh(geo, T.face === T.floor ? T.trim : T.face); m.castShadow = m.receiveShadow = true; leaf.add(m);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M('b_knob', { color: 0xd8a840, roughness: 0.3, metalness: 1 })); knob.position.set(0.72, 0.85, -0.06); leaf.add(knob);
    leaf.position.x = -0.41;
  }
  g.userData.leaf = leaf;
  return g;
}

// ------------------------------------------------------------------ piece icons (pixel canvases for the build bar)
function pieceIcon(id) {
  const c = document.createElement('canvas'); c.width = c.height = 18;
  const x = c.getContext('2d');
  const col = '#f1e9d2', dark = '#8a7a5a';
  x.fillStyle = col;
  const R = (a, b, w, h, cc = col) => { x.fillStyle = cc; x.fillRect(a, b, w, h); };
  switch (id) {
    case 'foundation': R(2, 9, 14, 4); R(3, 13, 2, 3, dark); R(13, 13, 2, 3, dark); break;
    case 'floor': R(2, 9, 14, 2); break;
    case 'wall': R(3, 2, 12, 14); R(3, 2, 2, 14, dark); R(13, 2, 2, 14, dark); break;
    case 'window': R(3, 2, 12, 14); R(6, 6, 6, 5, '#3a6a8a'); break;
    case 'doorway': R(3, 2, 12, 14); R(7, 7, 4, 9, '#2a2420'); break;
    case 'halfwall': R(3, 9, 12, 7); break;
    case 'roof': for (let k = 0; k < 8; k++) R(2 + k, 12 - k, 9, 2); break;
    case 'stairs': for (let k = 0; k < 6; k++) R(2 + k * 2, 14 - k * 2, 14 - k * 2, 2); break;
    case 'pillar': R(7, 2, 4, 14); break;
    case 'fence': R(3, 5, 2, 11, dark); R(13, 5, 2, 11, dark); R(2, 7, 14, 2); R(2, 12, 14, 2); break;
    case 'gate': R(3, 5, 2, 11, dark); R(13, 5, 2, 11, dark); R(5, 7, 8, 2); R(5, 12, 8, 2); for (let k = 0; k < 6; k++) R(5 + k, 12 - k, 2, 2); break;
    case 'ladder': R(5, 2, 2, 14); R(11, 2, 2, 14); for (let k = 0; k < 5; k++) R(5, 4 + k * 3, 8, 1); break;
    default: R(4, 4, 10, 10);
  }
  return c.toDataURL();
}

// ========================================================================== system
export class Building {
  constructor(game) {
    this.name = 'building';
    this.g = game;
    this.active = false;
    this.sel = 0; this.mat = 'thatch'; this.rot = 0;
    this.buildings = new Map(); // id -> { id, x, y, z, yaw }
    this.pieces = new Map(); // id -> piece
    this.cells = new Map(); // key -> piece (bid:kind:i:j:k:e)
    this.meshes = new Map(); // kind:mat -> { im, list }
    this.root = new THREE.Group(); this.root.name = 'buildings';
    game.engine.scene.add(this.root);
    this.geoCache = {};
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x70ff90, transparent: true, opacity: 0.4, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5a40, transparent: true, opacity: 0.4, depthWrite: false });
    this.ghostMat.userData.patchOpts = {}; this.ghostBad.userData.patchOpts = {};
    this.icons = Object.fromEntries(PIECES.map((p) => [p.id, pieceIcon(p.id)]));
    this.demo = null;
    this.t = 0;
    game.building = this;
  }

  // ---------------------------------------------------------------- geometry/mesh pools
  geo(kind, mat) { const k = kind + ':' + mat; return this.geoCache[k] ?? (this.geoCache[k] = GEO[kind](mat)); }
  pool(kind, mat) {
    const key = kind + ':' + mat;
    let P = this.meshes.get(key);
    if (!P) {
      const { geo, slots } = this.geo(kind, mat);
      const T = tierMats(mat);
      const mats = slots.map((s) => (s === 'glass' ? glassMat() : T[s]));
      const im = new THREE.InstancedMesh(geo, mats, 16);
      im.count = 0; im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      im.name = 'build-' + key;
      this.root.add(im);
      P = { im, list: [], cap: 16, key, kind, mat };
      this.meshes.set(key, P);
    }
    return P;
  }
  rebuildPool(P) {
    if (P.list.length > P.cap) {
      const cap = Math.max(P.list.length, P.cap * 2);
      const im = new THREE.InstancedMesh(P.im.geometry, P.im.material, cap);
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.name = P.im.name;
      P.im.removeFromParent(); P.im.dispose();
      this.root.add(im); P.im = im; P.cap = cap;
    }
    P.list.forEach((pc, i) => P.im.setMatrixAt(i, pc.matrix));
    P.im.count = P.list.length;
    P.im.instanceMatrix.needsUpdate = true;
    P.im.computeBoundingSphere?.();
  }

  // ---------------------------------------------------------------- grid math
  frame(b) { return { o: new THREE.Vector3(b.x, b.y, b.z), cs: Math.cos(b.yaw), sn: Math.sin(b.yaw) }; }
  toLocal(b, p) { const dx = p.x - b.x, dz = p.z - b.z; const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw); return new THREE.Vector3(dx * cs - dz * sn, p.y - b.y, dx * sn + dz * cs); }
  toWorld(b, lx, ly, lz, out = new THREE.Vector3()) { const cs = Math.cos(b.yaw), sn = Math.sin(b.yaw); return out.set(b.x + lx * cs + lz * sn, b.y + ly, b.z - lx * sn + lz * cs); }
  // piece transform (local position + yaw in building frame)
  pieceLocal(pc) {
    const { kind, i, j, k, e, r } = pc;
    const y = k * H;
    const slot = PIECE[kind].slot;
    if (slot === 'cell') return { x: (i + 0.5) * S, y: kind === 'roof' ? y : y, z: (j + 0.5) * S, yaw: (r ?? 0) * Math.PI / 2 };
    if (slot === 'corner') return { x: i * S, y, z: j * S, yaw: 0 };
    // edge: e=0 along x at z=j*S (cell's north edge), e=1 along z at x=i*S (west edge)
    return e === 0 ? { x: (i + 0.5) * S, y, z: j * S, yaw: 0 } : { x: i * S, y, z: (j + 0.5) * S, yaw: Math.PI / 2 };
  }
  key(bid, kind, i, j, k, e) { const cls = PIECE[kind].slot === 'edge' ? 'edge' : PIECE[kind].slot === 'corner' ? 'corner' : kind === 'roof' ? 'roof' : kind === 'stairs' ? 'stairs' : 'cell'; return `${bid}|${cls}|${i}|${j}|${k}|${e ?? -1}`; }
  at(bid, kind, i, j, k, e) { return this.cells.get(this.key(bid, kind, i, j, k, e)); }
  hasCellFloor(bid, i, j, k) { const c = this.cells.get(`${bid}|cell|${i}|${j}|${k}|-1`); return c && (c.kind === 'foundation' || c.kind === 'floor'); }
  hasEdge(bid, i, j, k, e) { const c = this.cells.get(`${bid}|edge|${i}|${j}|${k}|${e}`); return c && c.kind !== 'fence' && c.kind !== 'gate' && c.kind !== 'ladder' ? c : null; }
  // the 4 edges of a cell (i,j): north (i,j,e0), south (i,j+1,e0), west (i,j,e1), east (i+1,j,e1)
  cellEdges(i, j) { return [[i, j, 0], [i, j + 1, 0], [i, j, 1], [i + 1, j, 1]]; }

  supported(pc) {
    const { bid, kind, i, j, k, e } = pc;
    switch (kind) {
      case 'foundation': return true;
      case 'floor': {
        if (this.hasCellFloor(bid, i, j, k)) return false;
        if (k <= 0) return false;
        for (const [a, b, ee] of this.cellEdges(i, j)) if (this.hasEdge(bid, a, b, k - 1, ee)) return true;
        for (const [a, b] of [[i, j], [i + 1, j], [i, j + 1], [i + 1, j + 1]]) if (this.cells.get(`${bid}|corner|${a}|${b}|${k - 1}|-1`)) return true;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) if (this.hasCellFloor(bid, a, b, k)) return true;
        return false;
      }
      case 'roof': {
        for (const [a, b, ee] of this.cellEdges(i, j)) if (this.hasEdge(bid, a, b, k - 1, ee)) return true;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) if (this.cells.get(`${bid}|roof|${a}|${b}|${k}|-1`)) return true;
        return false;
      }
      case 'stairs': return this.hasCellFloor(bid, i, j, k);
      case 'pillar': for (const [a, b] of [[i - 1, j - 1], [i, j - 1], [i - 1, j], [i, j]]) if (this.hasCellFloor(bid, a, b, k)) return true; return !!this.cells.get(`${bid}|corner|${i}|${j}|${k - 1}|-1`);
      case 'fence': case 'gate': return k === 0 || this.edgeHasFloor(bid, i, j, k, e);
      default: // walls, windows, doorways, half walls, ladders
        return this.edgeHasFloor(bid, i, j, k, e) || !!this.hasEdge(bid, i, j, k - 1, e);
    }
  }
  edgeHasFloor(bid, i, j, k, e) { return e === 0 ? this.hasCellFloor(bid, i, j, k) || this.hasCellFloor(bid, i, j - 1, k) : this.hasCellFloor(bid, i, j, k) || this.hasCellFloor(bid, i - 1, j, k); }

  // ---------------------------------------------------------------- add / remove
  addBuilding(b) { this.buildings.set(b.id, b); return b; }
  addPiece(pc) {
    const b = this.buildings.get(pc.bid);
    if (!b) return null;
    const L = this.pieceLocal(pc);
    const world = this.toWorld(b, L.x, L.y, L.z);
    // ground-hugging fences follow the terrain
    if ((pc.kind === 'fence' || pc.kind === 'gate') && pc.k === 0 && !this.edgeHasFloor(pc.bid, pc.i, pc.j, 0, pc.e)) world.y = this.g.sampler.heightAt(world.x, world.z) - 0.05;
    pc.wpos = world; pc.wyaw = b.yaw + L.yaw;
    pc.matrix = new THREE.Matrix4().compose(world, _q.setFromEuler(_e.set(0, pc.wyaw, 0)), _s.set(1, 1, 1));
    pc.hp = pc.hp ?? MATS[pc.mat].hp;
    this.pieces.set(pc.id, pc);
    this.cells.set(this.key(pc.bid, pc.kind, pc.i, pc.j, pc.k, pc.e), pc);
    const P = this.pool(pc.kind, pc.mat);
    P.list.push(pc); pc.pool = P;
    this.rebuildPool(P);
    this.addColliders(pc);
    if (pc.kind === 'foundation') this.addStilts(pc);
    if (pc.kind === 'doorway' || pc.kind === 'gate') this.addDoor(pc);
    if (pc.k === 0) this.g.ground?.clearCircle?.(world.x, world.z, 1.4);
    return pc;
  }
  removePiece(id) {
    const pc = this.pieces.get(id);
    if (!pc) return;
    this.pieces.delete(id);
    this.cells.delete(this.key(pc.bid, pc.kind, pc.i, pc.j, pc.k, pc.e));
    const P = pc.pool; P.list.splice(P.list.indexOf(pc), 1); this.rebuildPool(P);
    for (const s of pc.shapes ?? []) this.g.physics.remove(s);
    if (pc.stilts) { const SP = pc.stilts.pool; SP.list = SP.list.filter((x) => !pc.stilts.items.includes(x)); this.rebuildPool(SP); }
    if (pc.door) pc.door.removeFromParent();
  }
  addStilts(pc) {
    // legs from the four corners down to the terrain
    const b = this.buildings.get(pc.bid), L = this.pieceLocal(pc);
    const SP = this.pool('stilt', pc.mat === 'thatch' || pc.mat === 'wood' ? 'thatch' : pc.mat);
    const items = [];
    for (const [a, c] of [[-0.88, -0.88], [0.88, -0.88], [-0.88, 0.88], [0.88, 0.88]]) {
      const w = this.toWorld(b, L.x + a, L.y, L.z + c);
      const gy = this.g.sampler.heightAt(w.x, w.z) - 0.1;
      const top = w.y - 0.3;
      const len = top - gy;
      if (len < 0.05) continue;
      const it = { matrix: new THREE.Matrix4().compose(_v.set(w.x, gy, w.z), _q.identity(), _s.set(1, len, 1)) };
      SP.list.push(it); items.push(it);
    }
    pc.stilts = { pool: SP, items };
    this.rebuildPool(SP);
  }
  addColliders(pc) {
    const ph = this.g.physics, w = pc.wpos, yaw = pc.wyaw;
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const W = (lx, lz) => [w.x + lx * cs + lz * sn, w.z - lx * sn + lz * cs];
    const box = (lx, ly, lz, hx, hy, hz, walk, solid = true) => { const [x, z] = W(lx, lz); return ph.addBox({ x, y: w.y + ly, z, hx, hy, hz, yaw, walk, solid, ref: pc, kind: 'build' }); };
    const S2 = S / 2;
    pc.shapes = [];
    switch (pc.kind) {
      case 'foundation': pc.shapes.push(box(0, -0.15, 0, S2, 0.15, S2, true)); break;
      case 'floor': pc.shapes.push(box(0, -0.06, 0, S2, 0.06, S2, true)); break;
      case 'wall': pc.shapes.push(box(0, H / 2, 0, S2, H / 2, 0.08, false)); break;
      case 'halfwall': pc.shapes.push(box(0, 0.5, 0, S2, 0.52, 0.08, false)); break;
      case 'window': pc.shapes.push(box(0, 0.38, 0, S2, 0.38, 0.08, false), box(0, H - 0.22, 0, S2, 0.23, 0.08, false), box(-0.71, 1.15, 0, 0.29, 0.4, 0.08, false), box(0.71, 1.15, 0, 0.29, 0.4, 0.08, false)); break;
      case 'doorway': pc.shapes.push(box(-0.69, H / 2, 0, 0.31, H / 2, 0.08, false), box(0.69, H / 2, 0, 0.31, H / 2, 0.08, false), box(0, H - 0.2, 0, 0.45, 0.2, 0.08, false)); if (!pc.open) pc.shapes.push(pc.doorShape = box(0, 0.8, 0, 0.42, 0.8, 0.05, false)); break;
      case 'roof': { const [x, z] = W(0, 0); pc.shapes.push(ph.addRamp({ x, y: w.y, z, hx: S2 + 0.15, hz: S2 + 0.2, hy: 0.12, h0: 0, h1: 1.0, yaw, ref: pc, kind: 'build' })); break; }
      case 'stairs': { const [x, z] = W(0, 0); pc.shapes.push(ph.addRamp({ x, y: w.y, z, hx: 0.6, hz: S2, hy: 0.15, h0: 0, h1: H, yaw, ref: pc, kind: 'build' })); break; }
      case 'pillar': pc.shapes.push(ph.addCyl({ x: w.x, z: w.z, r: 0.16, y0: w.y, y1: w.y + H, ref: pc, kind: 'build' })); break;
      case 'fence': pc.shapes.push(box(0, 0.65, 0, S2, 0.65, 0.07, false)); break;
      case 'gate': pc.shapes.push(box(-0.95, 0.7, 0, 0.09, 0.7, 0.09, false), box(0.95, 0.7, 0, 0.09, 0.7, 0.09, false)); if (!pc.open) pc.shapes.push(pc.doorShape = box(0, 0.65, 0, 0.85, 0.5, 0.06, false)); break;
      case 'ladder': break; // climbed via interaction
      default: break;
    }
  }
  addDoor(pc) {
    const d = doorMesh(pc.mat, pc.kind === 'gate');
    d.position.copy(pc.wpos); d.rotation.y = pc.wyaw;
    d.userData.leaf.rotation.y = pc.open ? -1.5 : 0;
    this.root.add(d);
    pc.door = d;
  }
  setDoor(pc, open) {
    if (!!pc.open === !!open) return;
    pc.open = !!open;
    if (pc.doorShape && open) { this.g.physics.remove(pc.doorShape); pc.shapes = pc.shapes.filter((x) => x !== pc.doorShape); pc.doorShape = null; }
    if (!open) { setTimeout(() => { if (pc.open || !this.pieces.has(pc.id)) return; const w = pc.wpos, yaw = pc.wyaw; pc.doorShape = this.g.physics.addBox({ x: w.x, y: w.y + (pc.kind === 'gate' ? 0.65 : 0.8), z: w.z, hx: pc.kind === 'gate' ? 0.85 : 0.42, hy: pc.kind === 'gate' ? 0.5 : 0.8, hz: 0.06, yaw, walk: false, solid: true, ref: pc, kind: 'build' }); pc.shapes.push(pc.doorShape); }, 300); }
    this.g.audio?.play(open ? 'door_open' : 'door_slam', { pos: _v.copy(pc.wpos).add(new THREE.Vector3(0, 1, 0)), vol: 0.7 });
  }

  // ---------------------------------------------------------------- actions (host)
  registerActions() {
    const g = this.g, A = g.actionHandlers;
    A.b_place = (d) => {
      if (d.by === g.local.id && !(g.materials ?? g.inventory).take(COST[d.kind][d.mat])) return;
      if (d.newBuilding && !this.buildings.has(d.bid)) this.addBuilding({ id: d.bid, x: d.bx, y: d.by_, z: d.bz, yaw: d.byaw });
      const pc = { id: d.pid, bid: d.bid, kind: d.kind, mat: d.mat, i: d.i, j: d.j, k: d.k, e: d.e, r: d.r, by: d.by };
      if (this.at(pc.bid, pc.kind, pc.i, pc.j, pc.k, pc.e)) return;
      this.addPiece(pc);
      g.net?.broadcast?.('bAdd', { b: this.buildings.get(pc.bid), pc: this.pieceRec(pc) });
      g.events.emit('built', { piece: pc, by: d.by });
      g.audio?.play('build', { pos: pc.wpos, vol: 0.8 });
      g.fx.dust(_v.copy(pc.wpos).add(new THREE.Vector3(0, 0.6, 0)), 5, 0xc8b8a0, 0.9);
    };
    A.b_remove = ({ id, by }) => {
      const pc = this.pieces.get(id);
      if (!pc) return;
      this.removePiece(id);
      g.net?.broadcast?.('bGone', { id });
      const refund = Object.entries(COST[pc.kind][pc.mat]).map(([it, n]) => [it, Math.max(1, Math.floor(n / 2))]);
      if (by === g.local.id) for (const [it, n] of refund) g.give(it, n, { from: 'demolish' }); else g.net?.sendTo?.(by, 'give', { items: refund });
      g.audio?.play('demolish', { pos: pc.wpos });
      g.fx.dust(_v.copy(pc.wpos).add(new THREE.Vector3(0, 0.8, 0)), 8, 0xb8a888, 1.1);
      // pieces left unsupported fall down too
      this.collapse(pc.bid, by);
    };
    A.b_door = ({ id, open }) => { const pc = this.pieces.get(id); if (!pc) return; this.setDoor(pc, open); g.net?.broadcast?.('bDoor', { id, open }); };
  }
  // big angry dinos (and stampedes) wreck walls (host)
  damagePiece(pc, dmg, who = 'Something') {
    const g = this.g;
    if (!this.pieces.has(pc.id)) return;
    pc.hp = (pc.hp ?? MATS[pc.mat].hp) - dmg;
    g.fx.dust(_v.copy(pc.wpos).add(new THREE.Vector3(0, 0.8, 0)), 3, 0xb8a888, 1);
    g.audio?.play('creak', { pos: pc.wpos, vol: 0.8 });
    if (pc.hp > 0) return;
    this.removePiece(pc.id);
    g.net?.broadcast?.('bGone', { id: pc.id });
    g.audio?.play('demolish', { pos: pc.wpos });
    g.fx.dust(_v.copy(pc.wpos).add(new THREE.Vector3(0, 0.8, 0)), 10, 0xb8a888, 1.3);
    this.collapse(pc.bid);
    if ((this.toldSmash ?? -99) < g.time.elapsed - 30) { this.toldSmash = g.time.elapsed; g.toastNear?.(pc.wpos, 90, `CRASH! ${who} smashed through your ${MATS[pc.mat].name} ${PIECE[pc.kind].name}!`, 'warn', 'dino', 4500); }
  }
  collapse(bid, by) {
    for (let pass = 0; pass < 6; pass++) {
      let any = false;
      for (const pc of [...this.pieces.values()]) {
        if (pc.bid !== bid || pc.kind === 'foundation') continue;
        if (!this.supported(pc)) { this.removePiece(pc.id); this.g.net?.broadcast?.('bGone', { id: pc.id }); any = true; this.g.fx.dust(pc.wpos, 4, 0xb8a888, 1); }
      }
      if (!any) break;
    }
    void by;
  }
  pieceRec(pc) { return { id: pc.id, bid: pc.bid, kind: pc.kind, mat: pc.mat, i: pc.i, j: pc.j, k: pc.k, e: pc.e, r: pc.r, hp: pc.hp, open: pc.open ? 1 : 0 }; }

  // ---------------------------------------------------------------- build mode
  toggle(on = !this.active) {
    const g = this.g;
    if (on && g.inventory.heldDef()?.tool?.kind !== 'hammer') { g.ui?.toast('Hold a Builder\'s Hammer to build (craft one by hand).', 'warn', 'hammer'); return; }
    this.active = on;
    if (on) { g.audio?.play('pda_open', { vol: 0.5 }); this.showBar(); }
    else { this.hideGhost(); this.hideBar(); g.audio?.play('pda_close', { vol: 0.5 }); if (g.promptClaim === 'build') g.promptClaim = null; }
  }
  showBar() {
    const g = this.g;
    this.hideBar();
    const bar = document.createElement('div'); bar.id = 'buildbar';
    const pieces = document.createElement('div'); pieces.className = 'pieces px-dark';
    PIECES.forEach((p, i) => { const el = document.createElement('div'); el.className = 'piece' + (i === this.sel ? ' on' : ''); el.innerHTML = `<img src="${this.icons[p.id]}"><span>${p.name}</span>`; el.onclick = () => this.select(i); pieces.appendChild(el); });
    const mats = document.createElement('div'); mats.className = 'mats';
    for (const m of MAT_IDS) { const el = document.createElement('div'); const locked = MATS[m].unlock && !g.research?.has?.(MATS[m].unlock); el.className = 'mat px-dark' + (m === this.mat ? ' on' : '') + (locked ? ' no' : ''); el.textContent = MATS[m].name + (locked ? ' 🔒' : ''); el.onclick = () => this.setMat(m); mats.appendChild(el); }
    const info = document.createElement('div'); info.className = 'info px-dark';
    bar.appendChild(info); bar.appendChild(mats); bar.appendChild(pieces);
    (g.ui?.hud ?? document.body).appendChild(bar);
    this.bar = { bar, pieces, mats, info };
    this.renderInfo();
  }
  exit() { this.toggle(false); }
  hideBar() { if (this.bar) { this.bar.bar.remove(); this.bar = null; } }
  select(i) { this.sel = (i + PIECES.length) % PIECES.length; this.g.audio?.play('ui_tick', { vol: 0.3 }); if (this.bar) [...this.bar.pieces.children].forEach((el, k) => el.classList.toggle('on', k === this.sel)); this.hideGhost(); this.renderInfo(); }
  setMat(m) {
    const g = this.g;
    if (MATS[m].unlock && !g.research?.has?.(MATS[m].unlock)) { g.ui?.toast(`${MATS[m].name} needs research: ${g.research?.techName?.(MATS[m].unlock) ?? MATS[m].unlock}`, 'warn'); return; }
    this.mat = m; this.hideGhost(); g.audio?.play('ui_tick', { vol: 0.3 });
    if (this.bar) [...this.bar.mats.children].forEach((el, k) => el.classList.toggle('on', MAT_IDS[k] === m));
    this.renderInfo();
  }
  renderInfo() {
    if (!this.bar) return;
    const g = this.g, p = PIECES[this.sel], cost = COST[p.id][this.mat];
    const parts = Object.entries(cost).map(([id, n]) => { const have = (g.materials ?? g.inventory).count(id); return `<span style="color:${have >= n ? 'inherit' : '#ff7060'}"><img src="${g.ui.icon(id)}" style="width:18px;height:18px;vertical-align:-4px;image-rendering:pixelated"> ${n} <span class="small">(${have})</span></span>`; }).join(' ');
    this.bar.info.innerHTML = `<b>${p.name}</b> · ${MATS[this.mat].name} &nbsp; ${parts} &nbsp;<span class="small">wheel/1-8 piece · F material · R rotate · LMB build · hold RMB remove · B exit</span>`;
  }

  hideGhost() { if (this.ghost) { this.ghost.removeFromParent(); this.ghost = null; this.ghostKey = null; } }
  // figure out where the selected piece would go
  solve() {
    const g = this.g, p = PIECES[this.sel];
    const cam = g.engine.camera;
    const o = cam.position.clone(), d = new THREE.Vector3(); cam.getWorldDirection(d);
    const head = g.local.headPos(new THREE.Vector3());
    o.addScaledVector(d, Math.max(0, d.dot(head.clone().sub(o))));
    const hit = g.physics.raycast(o, d, 9, { filter: (s) => s.kind === 'build' || s.kind === undefined && s.walk !== undefined && false });
    if (!hit) return null;
    const pt = hit.point.clone();
    const onPiece = hit.shape?.ref && hit.shape.kind === 'build' ? hit.shape.ref : null;
    // pick the building: the piece we hit, else the nearest within 14 m, else a new one (foundations / fences only)
    let b = onPiece ? this.buildings.get(onPiece.bid) : null;
    if (!b) { let bd = 14 * 14; for (const bb of this.buildings.values()) { const dd = (bb.x - pt.x) ** 2 + (bb.z - pt.z) ** 2; if (dd < bd && Math.abs(bb.y - pt.y) < 8) { bd = dd; b = bb; } } }
    const nb = !b;
    if (nb) {
      if (p.id !== 'foundation' && !p.ground) return { bad: 'Start with a Foundation (or a Fence)' };
      const yaw = Math.round((g.rig.yaw + this.rot * Math.PI / 2) / (Math.PI / 12)) * (Math.PI / 12);
      // foundation origin so that the hit point is the centre of cell (0,0)
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      const y0 = p.id === 'foundation' ? this.foundationHeight(pt, yaw) : pt.y;
      b = { id: 'b' + g.local.id + ':' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), x: pt.x - (S / 2) * cs - (S / 2) * sn, y: y0, z: pt.z + (S / 2) * sn - (S / 2) * cs, yaw, fresh: true };
    }
    const L = this.toLocal(b, pt);
    // nudge slightly along the hit normal so wall-faces resolve to the near side
    const nl = this.toLocal({ ...b, x: 0, y: 0, z: 0 }, hit.normal);
    const lx = L.x + nl.x * 0.05, lz = L.z + nl.z * 0.05;
    const fi = lx / S, fj = lz / S;
    const i = Math.floor(fi), j = Math.floor(fj);
    let k = Math.round(L.y / H);
    if (p.slot === 'edge' || p.id === 'pillar' || p.id === 'stairs') k = Math.floor((L.y + 0.25) / H);
    if (p.id === 'roof') k = Math.max(1, Math.round(L.y / H));
    if (p.id === 'floor' && onPiece && (onPiece.kind === 'wall' || onPiece.kind === 'window' || onPiece.kind === 'doorway' || onPiece.kind === 'pillar')) k = onPiece.k + 1;
    if (p.id === 'roof' && onPiece && PIECE[onPiece.kind].slot === 'edge') k = onPiece.k + 1;
    const pc = { bid: b.id, kind: p.id, mat: this.mat, i, j, k, e: -1, r: this.rot % 4 };
    if (p.slot === 'edge') {
      const ux = fi - i, uz = fj - j;
      const cand = [[uz, i, j, 0], [1 - uz, i, j + 1, 0], [ux, i, j, 1], [1 - ux, i + 1, j, 1]];
      cand.sort((a, c) => a[0] - c[0]);
      const [, a, c, e] = cand[0];
      pc.i = a; pc.j = c; pc.e = e;
    } else if (p.slot === 'corner') { pc.i = Math.round(fi); pc.j = Math.round(fj); }
    if (p.id === 'foundation' && !nb) {
      // foundations extend sideways at the level of the building base
      k = 0; pc.k = 0;
      if (this.hasCellFloor(b.id, pc.i, pc.j, 0)) {
        // pointed at an existing foundation's top: extend toward the aim direction
        const ux = fi - i - 0.5, uz = fj - j - 0.5;
        if (Math.abs(ux) > Math.abs(uz)) pc.i += Math.sign(ux); else pc.j += Math.sign(uz);
      }
    }
    return { b, pc, nb };
  }
  foundationHeight(pt, yaw) {
    const s = this.g.sampler, cs = Math.cos(yaw), sn = Math.sin(yaw);
    let hi = -Infinity;
    for (const [a, c] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) { const x = pt.x + a * cs * 0.95 + c * sn * 0.95, z = pt.z - a * sn * 0.95 + c * cs * 0.95; hi = Math.max(hi, s.heightAt(x, z)); }
    return hi + 0.3;
  }
  validate(sol) {
    const g = this.g;
    if (!sol || sol.bad) return sol?.bad ?? 'Aim at the ground or a building';
    const { b, pc, nb } = sol;
    if (this.at(pc.bid, pc.kind, pc.i, pc.j, pc.k, pc.e)) return 'Already built here';
    if (!nb && !this.supported(pc)) return 'Needs support';
    const L = this.pieceLocal(pc);
    const w = this.toWorld(b, L.x, L.y, L.z);
    if (w.distanceTo(g.local.pos) > 9) return 'Too far';
    if (pc.kind === 'foundation') {
      // ground must be below and not too far down
      let lo = Infinity, hi = -Infinity;
      for (const [a, c] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) { const p = this.toWorld(b, L.x + a, 0, L.z + c); const h = g.sampler.heightAt(p.x, p.z); lo = Math.min(lo, h); hi = Math.max(hi, h); }
      if (hi > w.y + 0.1) return 'Ground is in the way';
      if (w.y - lo > 4) return 'Too high for stilts';
      if (g.van && Math.hypot(w.x - g.van.pose.x, w.z - g.van.pose.z) < 3.8) return 'Too close to the van';
    }
    if (!(g.materials ?? g.inventory).has(COST[pc.kind][pc.mat])) return 'Not enough materials';
    if (MATS[pc.mat].unlock && !g.research?.has?.(MATS[pc.mat].unlock)) return 'Material locked';
    // something solid (rocks, trees, structures) in the footprint
    const list = g.physics.query(w.x, w.z, 2, []);
    for (const s of list) {
      if (s.kind === 'build' || s.kind === 'van' || !s.solid) continue;
      const top = s.type === 'cyl' ? s.y1 : s.y + s.hy, bot = s.type === 'cyl' ? s.y0 : s.y - s.hy;
      if (top < w.y + 0.1 || bot > w.y + H) continue;
      const P2 = { x: w.x, y: w.y, z: w.z };
      if (PIECE[pc.kind].slot === 'cell' && g.physics.resolve(P2, 0.8, H, 0.1, [s])) return 'Something is in the way';
      if (PIECE[pc.kind].slot === 'edge' && g.physics.resolve(P2, 0.4, H, 0.1, [s])) return 'Something is in the way';
    }
    return null;
  }
  update(dt) {
    const g = this.g, inp = g.input;
    this.t += dt;
    if (inp.pressed('build') && !g.uiOpen && !g.local.sitting) this.toggle();
    if (!this.active) { this.updateDoorsAnim(dt); return; }
    if (g.inventory.heldDef()?.tool?.kind !== 'hammer') { this.toggle(false); return; }
    if (g.uiOpen) { this.hideGhost(); return; }
    g.promptClaim = 'build';
    // select / material / rotate
    if (inp.wheel) this.select(this.sel + (inp.wheel > 0 ? 1 : -1));
    for (let k = 0; k < 8; k++) if (inp.pressed('hot' + (k + 1)) && k < PIECES.length) this.select(k);
    if (inp.pressed('whistle')) this.setMat(MAT_IDS[(MAT_IDS.indexOf(this.mat) + 1) % MAT_IDS.length]);
    if (inp.pressed('rotate')) { this.rot = (this.rot + 1) % 4; this.hideGhost(); }
    const sol = this.solve();
    const why = this.validate(sol);
    this.renderInfoT = (this.renderInfoT ?? 0) - dt;
    if (this.renderInfoT <= 0) { this.renderInfoT = 0.5; this.renderInfo(); }
    // ghost
    if (sol && !sol.bad) {
      const key = sol.pc.kind + ':' + sol.pc.mat + ':' + (why ? 0 : 1);
      if (this.ghostKey !== key) {
        this.hideGhost();
        const { geo } = this.geo(sol.pc.kind, sol.pc.mat);
        this.ghost = new THREE.Mesh(geo, why ? this.ghostBad : this.ghostMat);
        this.ghost.renderOrder = 5;
        this.root.add(this.ghost); this.ghostKey = key;
      }
      const L = this.pieceLocal(sol.pc);
      const w = this.toWorld(sol.b, L.x, L.y, L.z);
      if ((sol.pc.kind === 'fence' || sol.pc.kind === 'gate') && sol.pc.k === 0 && !this.edgeHasFloor(sol.pc.bid, sol.pc.i, sol.pc.j, 0, sol.pc.e)) w.y = g.sampler.heightAt(w.x, w.z) - 0.05;
      this.ghost.position.copy(w); this.ghost.rotation.set(0, sol.b.yaw + L.yaw, 0);
      this.ghost.visible = true;
    } else if (this.ghost) this.ghost.visible = false;
    g.ui?.setPrompt({ key: 'LMB', text: `Build ${PIECES[this.sel].name}`, warn: why, alt: { key: 'RMB', text: 'Hold to remove' } });
    // place
    if (inp.pressed('use') && !g.ui?.consumesClick) {
      if (why) { g.audio?.play('build_fail', { vol: 0.5 }); g.ui?.toast(why, 'warn'); }
      else {
        const { b, pc, nb } = sol;
        g.act('b_place', { ...pc, pid: 'p' + g.local.id + ':' + Date.now().toString(36) + Math.floor(Math.random() * 1e5), newBuilding: nb, bx: b.x, by_: b.y, bz: b.z, byaw: b.yaw });
        g.local.startAction('hammer', 0.45, null, 2, { faceCam: true });
      }
    }
    // remove (hold RMB on a piece)
    const tgt = this.aimedPiece();
    if (inp.down('alt') && tgt) {
      if (!this.demo || this.demo.pc !== tgt) this.demo = { pc: tgt, t: 0 };
      this.demo.t += dt;
      if (!g.local.action) g.local.startAction('hammer', 0.45, null, 2, { faceCam: true });
      if (this.demo.t > 0.9) { g.act('b_remove', { id: tgt.id }); this.demo = null; }
    } else this.demo = null;
    this.updateDoorsAnim(dt);
  }
  aimedPiece() {
    const g = this.g, cam = g.engine.camera;
    const o = cam.position.clone(), d = new THREE.Vector3(); cam.getWorldDirection(d);
    const hit = g.physics.raycast(o, d, 10, { terrain: false, filter: (s) => s.kind === 'build' });
    return hit?.shape?.ref ?? null;
  }
  updateDoorsAnim(dt) {
    for (const pc of this.pieces.values()) {
      if (!pc.door) continue;
      const leaf = pc.door.userData.leaf;
      const target = pc.open ? -1.6 : 0;
      leaf.rotation.y += (target - leaf.rotation.y) * Math.min(1, dt * 7);
    }
  }
  // doors / gates / ladders through the normal interaction system
  raycast(o, d, reach) {
    if (this.active) return null;
    const g = this.g;
    const hit = g.physics.raycast(o, d, reach, { terrain: false, filter: (s) => s.kind === 'build' });
    let pc = hit?.shape?.ref;
    if (!pc) {
      // ladders and open doors have no blocking shape: test their slots directly
      for (const p of this.pieces.values()) {
        if (p.kind !== 'ladder' && !(p.door && p.open)) continue;
        if (p.wpos.distanceTo(o) > reach + 2) continue;
        const c = _w.copy(p.wpos).add(new THREE.Vector3(0, 1, 0));
        const t = Math.max(0, _v.copy(c).sub(o).dot(d));
        const closest = _v.copy(o).addScaledVector(d, t);
        if (closest.distanceTo(c) < 0.8 && t < reach) { pc = p; break; }
      }
    }
    if (!pc) return null;
    const dist = hit ? hit.t : pc.wpos.distanceTo(o);
    const key = g.input.keyName('interact');
    if (pc.door) return { dist, kind: 'build', label: pc.kind === 'gate' ? 'Gate' : 'Door', prompt: { key, text: pc.open ? 'Close' : 'Open' }, onInteract: () => g.act('b_door', { id: pc.id, open: !pc.open }) };
    if (pc.kind === 'ladder') return { dist, kind: 'build', label: 'Ladder', prompt: { key, text: 'Climb' }, onInteract: () => this.climb(pc) };
    if (g.inventory.heldDef()?.tool?.kind !== 'hammer') return null;
    return { dist, kind: 'build', label: `${MATS[pc.mat].name} ${PIECE[pc.kind].name}`, hp: pc.hp / MATS[pc.mat].hp, prompt: { key: 'B', text: 'Build mode' } };
  }
  climb(pc) {
    const g = this.g, p = g.local;
    const up = p.pos.y < pc.wpos.y + 1;
    const n = new THREE.Vector3(-Math.sin(pc.wyaw), 0, -Math.cos(pc.wyaw));
    const side = Math.sign(n.dot(_v.copy(p.pos).sub(pc.wpos))) || 1;
    const target = up ? pc.wpos.clone().addScaledVector(n, -side * 0.6).add(new THREE.Vector3(0, H + 0.05, 0)) : pc.wpos.clone().addScaledVector(n, side * 0.7);
    if (!up) target.y = g.physics.groundAt(target.x, target.z, pc.wpos.y + 0.5, 0.6);
    const from = p.pos.clone();
    let t = 0;
    p.startAction('interact', 0.7, null, 2);
    this.g.van && (this.g.van.climbing = (dt) => { t += dt / 0.7; const k = Math.min(1, t); p.pos.lerpVectors(from, target, k); p.vel.set(0, 0, 0); return k >= 1; });
    g.audio?.play('step_wood', { pos: p.pos, vol: 0.6 });
  }
  surfaceAt(pos) {
    const list = this.g.physics.query(pos.x, pos.z, 0.5, []);
    for (const s of list) if (s.kind === 'build' && s.ref && Math.abs(this.g.physics.surfaceAt(s, pos.x, pos.z, 0.2) - pos.y) < 0.2) return MATS[s.ref.mat].step;
    return null;
  }

  // ---------------------------------------------------------------- save / net
  serialize() { return { buildings: [...this.buildings.values()].map((b) => ({ id: b.id, x: b.x, y: b.y, z: b.z, yaw: b.yaw })), pieces: [...this.pieces.values()].map((pc) => this.pieceRec(pc)) }; }
  load(d) {
    for (const id of [...this.pieces.keys()]) this.removePiece(id);
    this.buildings.clear();
    for (const b of d?.buildings ?? []) this.addBuilding(b);
    // foundations first so supports resolve
    const order = { foundation: 0, floor: 2, pillar: 1 };
    for (const pc of (d?.pieces ?? []).slice().sort((a, b) => (order[a.kind] ?? 3) - (order[b.kind] ?? 3) || a.k - b.k)) this.addPiece({ ...pc, open: !!pc.open });
  }
}

export async function install(g) {
  const B = new Building(g);
  B.registerActions();
  g.addSystem(B);
  g.interaction.handlers.push((o, d, reach) => B.raycast(o, d, reach));
  g.saveables.building = { save: () => B.serialize(), load: (d) => B.load(d) };
  g.netHandlers.bAdd = ({ b, pc }) => { if (!B.buildings.has(b.id)) B.addBuilding(b); if (!B.pieces.has(pc.id)) B.addPiece({ ...pc, open: !!pc.open }); };
  g.netHandlers.bGone = ({ id }) => B.removePiece(id);
  g.netHandlers.bDoor = ({ id, open }) => { const pc = B.pieces.get(id); if (pc) B.setDoor(pc, open); };
  // footsteps on built floors
  const prev = g.structures?.surfaceAt;
  if (g.structures) g.structures.surfaceAt = (pos) => B.surfaceAt(pos) ?? prev?.(pos) ?? 'step_wood';
  void ITEMS;
  return B;
}
