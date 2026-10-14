// Chunky handcrafted models for every placeable structure + decoration.
// Local frame: origin on the ground at the centre, front = -Z (the side you
// use it from). Each builder returns { g, col, parts, anchors }:
//   col: walkable/solid boxes in local space [{x,y,z,hx,hy,hz,walk}]
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { std, box as vbox, cyl, mk, at, boxUV } from '../entities/vanModel.js';
import { bTex, withMaps } from '../gfx/buildTextures.js';
import { textTexture } from '../gfx/vanTextures.js';
import { PixelPainter } from '../gfx/pixel.js';

// ------------------------------------------------------------------ materials
const T = (key, o = {}) => std('st_' + key, withMaps(o));
export const SM = {
  plank: () => T('plank', { map: bTex('plank'), roughness: 0.82 }),
  plankV: () => T('plankV', { map: bTex('plankV'), roughness: 0.82 }),
  wood: () => T('wood', { map: bTex('wood'), roughness: 0.8 }),
  bark: () => T('bark', { map: bTex('bark'), roughness: 0.92 }),
  end: () => T('end', { map: bTex('endgrain'), roughness: 0.85 }),
  stone: () => T('stone', { map: bTex('stone'), roughness: 0.9 }),
  brick: () => T('brick', { map: bTex('brick'), roughness: 0.88 }),
  metal: () => T('metal', { map: bTex('metal'), roughness: 0.45, metalness: 0.6 }),
  thatch: () => T('thatch', { map: bTex('thatch'), roughness: 0.95 }),
  straw: () => T('straw', { map: bTex('straw'), roughness: 0.95 }),
  soil: () => T('soil', { map: bTex('soil'), roughness: 1 }),
  hide: () => T('hide', { map: bTex('hide'), roughness: 0.85 }),
  patch: () => T('patch', { map: bTex('patch'), roughness: 0.9 }),
  canvas: () => T('canvas', { map: bTex('canvas'), roughness: 0.9 }),
  redcloth: () => T('redcloth', { map: bTex('red'), roughness: 0.9, side: THREE.DoubleSide }),
  rock: () => T('rock', { color: 0x8e8a82, roughness: 0.92, flatShading: true }),
  rockDark: () => T('rockDark', { color: 0x5e5a56, roughness: 0.95, flatShading: true }),
  clay: () => T('clay', { color: 0xb07048, roughness: 0.9, flatShading: true }),
  iron: () => T('iron', { color: 0x3a3a40, roughness: 0.4, metalness: 0.8 }),
  copper: () => T('copper', { color: 0xc87840, roughness: 0.3, metalness: 0.9 }),
  brass: () => T('brass', { color: 0xd8a840, roughness: 0.3, metalness: 1 }),
  glass: () => T('glass', { color: 0xbfe0ea, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }),
  rope: () => T('rope', { color: 0xc8b080, roughness: 0.95 }),
  ember: () => T('ember', { color: 0x2a1008, emissive: 0xff5a1a, emissiveIntensity: 0, roughness: 0.8, flatShading: true }),
  coal: () => T('coal', { color: 0x1a1614, emissive: 0xff4010, emissiveIntensity: 0, roughness: 0.9, flatShading: true }),
  paper: () => T('paper', { color: 0xf2ecd8, roughness: 0.95, side: THREE.DoubleSide }),
  bone: () => T('bone', { color: 0xe8dcc0, roughness: 0.7 }),
  leaf: () => T('leafgreen', { color: 0x4a8a34, roughness: 0.8, flatShading: true }),
  black: () => T('black', { color: 0x1a1a1a, roughness: 0.6 }),
  white: () => T('white', { color: 0xe8e6e0, roughness: 0.5 }),
  red: () => T('red', { color: 0xc8402a, roughness: 0.5 }),
  blue: () => T('blue', { color: 0x3a7ac8, roughness: 0.5 }),
  water: () => T('water', { color: 0x3a7aa0, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.8 }),
  bulb: () => T('bulb', { color: 0xfff2c0, emissive: 0xffd890, emissiveIntensity: 0, roughness: 0.3 }),
};

// ------------------------------------------------------------------ helpers
// every box gets a small bevel so edges catch the light like real timber
const box = (w, h, d, m, x, y, z, r = 0, uvs = 0.5) => vbox(w, h, d, m, x, y, z, r > 0 ? r : Math.min(0.012, Math.min(w, h, d) * 0.2), uvs);
let _seed = 1;
const rnd = () => ((_seed = (_seed * 16807) % 2147483647) / 2147483647);
function rock(r, m = SM.rock()) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.85 + rnd() * 0.3), p.getY(i) * (0.6 + rnd() * 0.25), p.getZ(i) * (0.85 + rnd() * 0.3));
  g.computeVertexNormals();
  return mk(g, m);
}
function log(r, len, m = SM.bark()) {
  const g = new THREE.CylinderGeometry(r, r * 1.04, len, 8, 1);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len * 0.5);
  return mk(g, [m, SM.end(), SM.end()]);
}
function stick(len, r = 0.025) { return log(r, len); }
const lean = (o, rx, ry, rz) => { o.rotation.set(rx, ry, rz); return o; };
function lathe(points, m, seg = 14) { return mk(new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), seg), m); }
const col = (x, y, z, hx, hy, hz, walk = true) => ({ x, y, z, hx, hy, hz, walk });


// ------------------------------------------------------------------ furniture craft
// a top made of separate bevelled boards (running along x, side by side in z)
function boards(w, d, n, th, m, y) {
  const grp = new THREE.Group();
  const bw = d / n;
  for (let i = 0; i < n; i++) {
    const b = box(w * (0.985 + rnd() * 0.015), th * (0.92 + rnd() * 0.12), bw - 0.007, m, (rnd() - 0.5) * 0.012, y, -d / 2 + bw * (i + 0.5), Math.min(0.01, th * 0.3), 0.6);
    b.rotation.set((rnd() - 0.5) * 0.01, (rnd() - 0.5) * 0.008, (rnd() - 0.5) * 0.006);
    grp.add(b);
  }
  return grp;
}
// a lathe-turned leg (foot, beads, a waist and a top collar), height h along +y
function turnedLeg(h, r, m = SM.wood()) {
  const P = [[0.001, 0], [r * 0.8, 0], [r * 0.92, h * 0.025], [r * 0.7, h * 0.06], [r * 0.6, h * 0.28], [r * 0.95, h * 0.33], [r * 0.95, h * 0.36], [r * 0.6, h * 0.41], [r * 0.52, h * 0.66], [r * 0.82, h * 0.72], [r * 0.82, h * 0.78], [r, h * 0.8], [r, h * 0.995], [0.001, h]];
  return lathe(P, m, 10);
}
// a plump cushion / mattress / pillow: rounded box with the faces puffed out
function cushion(w, h, d, m, puff = 0.35) {
  const g = new RoundedBoxGeometry(w, h, d, 4, Math.min(w, h, d) * 0.45);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = Math.max(0, 1 - (2 * x / w) ** 2) * Math.max(0, 1 - (2 * z / d) ** 2);
    p.setY(i, y + Math.sign(y) * k * h * puff + Math.sin(x * 23 + z * 17) * 0.002);
  }
  g.computeVertexNormals(); boxUV(g, 1);
  return mk(g, m);
}
// a sheet lying over a w x d top whose sides and foot fall down by "hang"
function drape(w, d, hang, m, foot = true) {
  const W = w + hang * 2, D = d + (foot ? hang : 0);
  const g = new THREE.PlaneGeometry(W, D, 18, 22); g.rotateX(-Math.PI / 2);
  g.translate(0, 0, foot ? hang / 2 : 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i), y = 0;
    const ox = Math.max(0, Math.abs(x) - w / 2), oz = foot ? Math.max(0, z - d / 2) : 0;
    if (ox > 0) { x = Math.sign(x) * (w / 2 + ox * 0.12 + Math.sin(z * 9) * 0.01 * ox / hang); }
    if (oz > 0) z = d / 2 + oz * 0.12;
    y = -Math.max(ox, oz) * 0.95;
    // soft folds on top and ripples where it hangs
    y += Math.sin(x * 11 + z * 3) * 0.006 + Math.sin(z * 7.3 - x * 2) * 0.008 + (ox > 0 || oz > 0 ? Math.sin(z * 18 + x * 18) * 0.012 * Math.min(1, Math.max(ox, oz) / hang) : 0);
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W * 0.8, uv.getY(i) * D * 0.8);
  return mk(g, m);
}
// a rope lashing (a few wraps) around a joint
function lashing(r, n = 3) {
  const grp = new THREE.Group();
  for (let k = 0; k < n; k++) { const t = mk(new THREE.TorusGeometry(r, 0.012, 5, 14), SM.rope(), false); t.rotation.x = Math.PI / 2; t.position.y = (k - (n - 1) / 2) * 0.024; grp.add(t); }
  return grp;
}
// double-sided cloth for drapes
const cloth2 = (key) => T(key + '_2s', { map: bTex(key), roughness: 0.92, side: THREE.DoubleSide });
// a box bent along x (ends pushed by "bend" in z), e.g. a curved chair rail
function bentBox(w, h, d, bend, m) {
  const g = new THREE.BoxGeometry(w, h, d, 10, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + (p.getX(i) / (w / 2)) ** 2 * bend);
  g.computeVertexNormals(); boxUV(g, 0.6);
  return mk(g, m);
}
function rivet(m = SM.iron()) { return mk(new THREE.SphereGeometry(0.012, 6, 4), m, false); }

// ------------------------------------------------------------------ builders
const B = {};

B.campfire = () => {
  const g = new THREE.Group(), parts = {};
  _seed = 11;
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const r = rock(0.13 + rnd() * 0.04); r.position.set(Math.cos(a) * 0.46, 0.06, Math.sin(a) * 0.46); r.rotation.y = rnd() * 6; g.add(r); }
  const bed = mk(new THREE.CircleGeometry(0.36, 10), SM.ember(), false); bed.rotation.x = -Math.PI / 2; bed.position.y = 0.025; g.add(bed);
  parts.coals = [];
  for (let i = 0; i < 7; i++) { const c = rock(0.05 + rnd() * 0.03, SM.coal()); c.position.set((rnd() - 0.5) * 0.4, 0.04, (rnd() - 0.5) * 0.4); g.add(c); parts.coals.push(c); }
  const logs = new THREE.Group(); g.add(logs); parts.logs = logs;
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; const l = log(0.05, 0.62); l.position.set(Math.cos(a) * 0.13, 0.24, Math.sin(a) * 0.13); l.rotation.set(Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55); logs.add(l); }
  for (const a of [0.3, 1.9]) { const l = log(0.055, 0.7); l.rotation.set(Math.PI / 2, a, 0); l.position.y = 0.06; logs.add(l); }
  // cooking spit
  for (const sx of [-1, 1]) { const y = stick(0.62, 0.02); y.position.set(sx * 0.55, 0.31, 0); g.add(y); const fork = stick(0.12, 0.015); fork.position.set(sx * 0.55 + sx * 0.03, 0.62, 0); fork.rotation.z = sx * 0.6; g.add(fork); }
  const bar = stick(1.2, 0.015); bar.rotation.z = Math.PI / 2; bar.position.y = 0.6; g.add(bar);
  parts.spit = bar;
  return { g, col: [col(0, 0.25, 0, 0.5, 0.25, 0.5, false)], parts, anchors: { fire: new THREE.Vector3(0, 0.25, 0) }, solidCyl: 0.55 };
};

B.workbench = () => {
  const g = new THREE.Group(), parts = {};
  _seed = 5;
  // a thick top of four boards, square legs with stretchers and a lower shelf
  g.add(boards(1.5, 0.72, 4, 0.08, SM.plank(), 0.82));
  for (const [x, z] of [[-0.66, -0.29], [0.66, -0.29], [-0.66, 0.29], [0.66, 0.29]]) g.add(box(0.09, 0.8, 0.09, SM.wood(), x, 0.4, z, 0.012, 0.6));
  for (const z of [-0.29, 0.29]) g.add(box(1.24, 0.07, 0.05, SM.wood(), 0, 0.12, z, 0.01, 0.6));
  for (const x of [-0.66, 0.66]) g.add(box(0.05, 0.07, 0.5, SM.wood(), x, 0.12, 0, 0.01, 0.6));
  g.add(boards(1.3, 0.5, 3, 0.035, SM.plank(), 0.18));
  for (let k = 0; k < 3; k++) g.add(at(log(0.06, 0.5), -0.3 + k * 0.14, 0.26, 0.08, Math.PI / 2, 0, 0.1 * k)); // spare logs on the shelf
  // a tool board at the back with hanging tools
  const back = new THREE.Group(); back.position.set(0, 1.18, 0.33); g.add(back);
  for (const x of [-0.68, 0.68]) g.add(box(0.07, 0.75, 0.07, SM.wood(), x, 1.2, 0.33, 0.01, 0.6));
  back.add(box(1.36, 0.5, 0.03, SM.plankV(), 0, 0, 0, 0.006, 0.6));
  const peg = (x, y) => { const p = cyl(0.008, 0.008, 0.06, SM.iron(), 5); p.rotation.x = Math.PI / 2; p.position.set(x, y, -0.04); back.add(p); };
  // hammer
  peg(-0.45, 0.12); back.add(at(stick(0.3, 0.014), -0.45, -0.02, -0.04)); back.add(at(box(0.11, 0.045, 0.045, SM.iron(), 0, 0, 0, 0.008, 0), -0.45, 0.12, -0.045));
  // saw
  peg(-0.12, 0.16); const saw = mk(new THREE.PlaneGeometry(0.36, 0.11), T('sawblade', { color: 0xc8ccd0, roughness: 0.3, metalness: 0.9, side: THREE.DoubleSide }), false); saw.position.set(-0.02, 0.06, -0.022); back.add(saw); back.add(at(box(0.1, 0.09, 0.025, SM.wood(), 0, 0, 0, 0.01, 0), -0.24, 0.08, -0.025));
  // wrench + rope coil
  peg(0.2, 0.12); back.add(at(box(0.025, 0.24, 0.012, SM.iron(), 0, 0, 0, 0.005, 0), 0.2, 0.0, -0.035, 0, 0, 0.15));
  peg(0.48, 0.15); const coil = mk(new THREE.TorusGeometry(0.09, 0.022, 6, 16), SM.rope()); coil.position.set(0.48, 0.05, -0.04); back.add(coil);
  // the vise
  const vise = new THREE.Group(); vise.position.set(0.62, 0.9, -0.3); g.add(vise);
  vise.add(box(0.14, 0.1, 0.12, SM.iron(), 0, 0, 0, 0.012, 0));
  vise.add(box(0.14, 0.1, 0.04, SM.iron(), 0, 0, -0.12, 0.01, 0));
  const scr = cyl(0.012, 0.012, 0.22, SM.iron(), 6); scr.rotation.x = Math.PI / 2; scr.position.set(0, -0.02, -0.12); vise.add(scr);
  const bar = cyl(0.008, 0.008, 0.16, SM.iron(), 5); bar.rotation.z = Math.PI / 2; bar.position.set(0, -0.02, -0.23); vise.add(bar);
  // stuff on top: mallet, chisel, pencil, shavings, a lantern
  const mal = new THREE.Group(); mal.position.set(-0.3, 0.885, -0.1); mal.rotation.y = 0.5; g.add(mal);
  mal.add(at(stick(0.3, 0.014), 0, 0, 0, 0, 0, Math.PI / 2)); mal.add(at(cyl(0.045, 0.045, 0.12, SM.wood(), 10), 0.17, 0.0, 0, Math.PI / 2, 0, 0));
  g.add(at(box(0.16, 0.02, 0.025, SM.wood(), 0, 0, 0, 0.006, 0), 0.25, 0.875, 0.05, 0, -0.3, 0));
  g.add(at(box(0.07, 0.008, 0.02, SM.iron(), 0, 0, 0, 0.003, 0), 0.36, 0.875, 0.01, 0, -0.3, 0));
  for (let k = 0; k < 9; k++) { const c = mk(new THREE.TorusGeometry(0.025, 0.006, 3, 6, 4), T('shaving', { color: 0xe0c08a, roughness: 0.9 }), false); c.position.set((rnd() - 0.5) * 0.8, 0.872, (rnd() - 0.5) * 0.5); c.rotation.set(Math.PI / 2, 0, rnd() * 6); g.add(c); }
  const lan = new THREE.Group(); lan.position.set(-0.6, 0.86, 0.2); g.add(lan);
  lan.add(at(cyl(0.05, 0.055, 0.02, SM.iron(), 10), 0, 0.01, 0)); lan.add(at(cyl(0.04, 0.04, 0.1, SM.glass(), 10), 0, 0.07, 0)); lan.add(at(cyl(0.02, 0.05, 0.04, SM.iron(), 10), 0, 0.14, 0));
  const note = mk(new THREE.PlaneGeometry(0.12, 0.12), T('wbnote', { map: textTexture(['MEASURE ONCE', 'CUT TWICE'], { w: 96, h: 96, bg: '#f6df7c', fg: '#17130e', size: 13 }) }), false);
  note.position.set(0.0, 0.0, -0.02); note.rotation.y = Math.PI; note.rotation.z = 0.08; note.position.set(0.0, -0.12, -0.018); back.add(note);
  return { g, col: [col(0, 0.43, 0, 0.75, 0.43, 0.36)], parts, anchors: {} };
};

B.storage_box = () => {
  const g = new THREE.Group(), parts = {};
  // a plank chest bound with iron: bands, corner brackets, rivets, a hasp and rope handles
  g.add(box(0.9, 0.5, 0.6, SM.plankV(), 0, 0.27, 0, 0.015, 0.8));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(0.06, 0.52, 0.06, SM.wood(), sx * 0.43, 0.27, sz * 0.28, 0.01, 0.6));
  for (const y of [0.1, 0.44]) g.add(box(0.915, 0.04, 0.615, SM.iron(), 0, y, 0, 0.006, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.1, 0.44]) { const r = rivet(); r.position.set(sx * 0.3, y, sz * 0.31); g.add(r); }
  for (const sx of [-1, 1]) { const h = mk(new THREE.TorusGeometry(0.06, 0.014, 5, 12, Math.PI), SM.rope()); h.position.set(sx * 0.47, 0.34, 0); h.rotation.y = Math.PI / 2; h.rotation.x = Math.PI; g.add(h); for (const z of [-0.06, 0.06]) { const b = box(0.02, 0.04, 0.03, SM.iron(), sx * 0.462, 0.34, z, 0.004, 0); g.add(b); } }
  const lid = new THREE.Group(); lid.position.set(0, 0.52, 0.3); g.add(lid); parts.lid = lid;
  // slightly arched lid: half a cylinder of planks
  const arch = new THREE.CylinderGeometry(0.33, 0.33, 0.94, 12, 1, false, -Math.PI / 2, Math.PI);
  arch.rotateZ(Math.PI / 2); arch.scale(1, 0.32, 1);
  const top = mk(arch, [SM.plankV(), SM.wood(), SM.wood()]); top.position.set(0, 0.01, -0.3); lid.add(top);
  for (const x of [-0.3, 0.3]) { const band = mk(new THREE.CylinderGeometry(0.338, 0.338, 0.04, 12, 1, true, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).scale(1, 0.32, 1), SM.iron()); band.position.set(x, 0.01, -0.3); lid.add(band); }
  lid.add(box(0.94, 0.04, 0.64, SM.plank(), 0, 0.0, -0.3, 0.012, 0.8));
  const hasp = box(0.07, 0.12, 0.012, SM.iron(), 0, -0.04, -0.625, 0.004, 0); lid.add(hasp);
  const lock = new THREE.Group(); lock.position.set(0, -0.12, -0.64); lid.add(lock);
  lock.add(box(0.05, 0.05, 0.02, SM.brass(), 0, 0, 0, 0.006, 0));
  const shackle = mk(new THREE.TorusGeometry(0.018, 0.005, 4, 10, Math.PI), SM.iron(), false); shackle.position.y = 0.025; lock.add(shackle);
  return { g, col: [col(0, 0.29, 0, 0.47, 0.29, 0.32)], parts, anchors: {} };
};

B.bedroll = () => {
  const g = new THREE.Group();
  const pad = cushion(0.72, 0.07, 1.78, SM.straw(), 0.25); pad.position.y = 0.045; g.add(pad);
  const roll = mk(new THREE.CapsuleGeometry(0.1, 0.55, 4, 10), SM.canvas()); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.12, -0.78); g.add(roll);
  for (const x of [-0.18, 0.18]) { const t = mk(new THREE.TorusGeometry(0.105, 0.01, 4, 14), SM.rope(), false); t.rotation.y = Math.PI / 2; t.position.set(x, 0.12, -0.78); g.add(t); }
  const blanket = drape(0.74, 1.1, 0.04, cloth2('patch')); blanket.position.set(0, 0.105, 0.28); g.add(blanket);
  return { g, col: [col(0, 0.06, 0, 0.38, 0.06, 0.9)], parts: {}, anchors: { sleep: new THREE.Vector3(0, 0.12, 0) } };
};

B.bed = () => {
  const g = new THREE.Group();
  // a lashed log frame, a planked headboard, a plump mattress, pillow, blanket and fur throw
  for (const sx of [-1, 1]) { const l = log(0.06, 2.1); l.rotation.x = Math.PI / 2; l.position.set(sx * 0.5, 0.2, 0); g.add(l); }
  for (const z of [-1.0, 1.0]) { const l = log(0.06, 1.1); l.rotation.z = Math.PI / 2; l.position.set(0, 0.2, z); g.add(l); }
  for (const sx of [-1, 1]) for (const z of [-1, 1]) { const l = log(0.065, z < 0 ? 0.95 : 0.42); l.position.set(sx * 0.5, z < 0 ? 0.47 : 0.21, z); g.add(l); const la = lashing(0.072); la.position.set(sx * 0.5, 0.2, z); g.add(la); }
  // slats under the mattress
  for (let k = 0; k < 7; k++) g.add(box(0.98, 0.025, 0.09, SM.wood(), 0, 0.245, -0.84 + k * 0.28, 0.006, 0.6));
  const head = new THREE.Group(); head.position.set(0, 0.62, -1.02); g.add(head);
  head.add(boards(1.0, 0.5, 4, 0.05, SM.plank(), 0).rotateX(Math.PI / 2));
  head.add(at(log(0.04, 1.06), 0, 0.27, 0, 0, 0, Math.PI / 2));
  const mattress = cushion(0.98, 0.16, 1.92, SM.canvas(), 0.3); mattress.position.set(0, 0.34, 0); g.add(mattress);
  const pillow = cushion(0.58, 0.12, 0.32, SM.white(), 0.6); pillow.position.set(0, 0.47, -0.72); pillow.rotation.x = -0.12; g.add(pillow);
  const blanket = drape(0.98, 1.15, 0.2, cloth2('patch')); blanket.position.set(0, 0.425, 0.24); g.add(blanket);
  const fur = drape(1.0, 0.36, 0.16, cloth2('hide'), false); fur.position.set(0, 0.44, 0.62); fur.scale.set(1.04, 1, 1); g.add(fur);
  // tiny carved dino on the headboard
  const d = mk(new THREE.PlaneGeometry(0.3, 0.18), T('bedcarve', { map: (() => { const p = new PixelPainter(32, 20, 5).clear(); for (const [x, y, w, h] of [[10, 6, 14, 6], [20, 2, 6, 6], [6, 8, 6, 2], [12, 12, 2, 6], [20, 12, 2, 6]]) p.rect(x, y, w, h, [90, 58, 32]); return p.texture(); })(), transparent: true, alphaTest: 0.5, roughness: 0.9 }), false);
  d.position.set(0, 0.05, 0.031); head.add(d);
  return { g, col: [col(0, 0.25, 0, 0.56, 0.25, 1.05)], parts: {}, anchors: { sleep: new THREE.Vector3(0, 0.46, 0) } };
};

B.cooking_pot = () => {
  const g = new THREE.Group(), parts = {};
  _seed = 21;
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = stick(1.2, 0.025); l.position.set(Math.cos(a) * 0.3, 0.55, Math.sin(a) * 0.3); l.rotation.set(-Math.sin(a) * 0.28, 0, Math.cos(a) * 0.28); g.add(l); }
  const pot = lathe([[0.0, 0], [0.18, 0.02], [0.24, 0.1], [0.25, 0.2], [0.21, 0.28], [0.22, 0.3], [0.2, 0.31]], SM.clay());
  pot.position.y = 0.42; g.add(pot); parts.pot = pot;
  const stew = mk(new THREE.CircleGeometry(0.2, 12), T('stew', { color: 0x8a5a30, roughness: 0.3 }), false); stew.rotation.x = -Math.PI / 2; stew.position.y = 0.7; g.add(stew); parts.stew = stew;
  const chain = stick(0.42, 0.008); chain.position.y = 0.95; g.add(chain);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const r = rock(0.08); r.position.set(Math.cos(a) * 0.24, 0.04, Math.sin(a) * 0.24); g.add(r); }
  const bed = mk(new THREE.CircleGeometry(0.18, 8), SM.ember(), false); bed.rotation.x = -Math.PI / 2; bed.position.y = 0.03; g.add(bed);
  parts.coals = [];
  for (let i = 0; i < 4; i++) { const c = rock(0.04, SM.coal()); c.position.set((rnd() - 0.5) * 0.2, 0.04, (rnd() - 0.5) * 0.2); g.add(c); parts.coals.push(c); }
  const ladle = stick(0.4, 0.01); ladle.position.set(0.12, 0.8, 0.05); ladle.rotation.z = 0.5; g.add(ladle);
  return { g, col: [col(0, 0.5, 0, 0.35, 0.5, 0.35, false)], parts, anchors: { fire: new THREE.Vector3(0, 0.12, 0), steam: new THREE.Vector3(0, 0.75, 0) } };
};

B.kiln = () => {
  const g = new THREE.Group(), parts = {};
  const dome = mk(new THREE.SphereGeometry(0.7, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), SM.clay()); dome.scale.set(1, 1.15, 1); g.add(dome);
  g.add(at(cyl(0.72, 0.76, 0.12, SM.stone(), 14), 0, 0.06, 0));
  g.add(at(cyl(0.12, 0.15, 0.6, SM.clay(), 8), 0.18, 0.95, 0.15));
  const mouth = box(0.42, 0.36, 0.1, T('kilnmouth', { color: 0x120806, emissive: 0xff5010, emissiveIntensity: 0, roughness: 1 }), 0, 0.3, -0.66, 0.05, 0); g.add(mouth); parts.glow = mouth;
  for (let k = 0; k < 6; k++) { const a = -0.9 + k * 0.36; const r = rock(0.07); r.position.set(Math.sin(a) * 0.36, 0.5 + Math.cos(a) * 0.08 - 0.04, -0.66); g.add(r); }
  return { g, col: [col(0, 0.45, 0, 0.7, 0.45, 0.7, false)], parts, anchors: { fire: new THREE.Vector3(0, 0.35, -0.55), smoke: new THREE.Vector3(0.18, 1.3, 0.15) } };
};

B.forge = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(1.2, 0.9, 0.95, SM.brick(), 0, 0.45, 0, 0.04, 0.6));
  g.add(box(0.5, 1.3, 0.5, SM.brick(), 0.25, 1.45, 0.18, 0.03, 0.6));
  const mouth = box(0.5, 0.3, 0.1, T('forgemouth', { color: 0x120806, emissive: 0xff6a20, emissiveIntensity: 0, roughness: 1 }), -0.15, 0.7, -0.46, 0.04, 0); g.add(mouth); parts.glow = mouth;
  // bellows
  const bel = new THREE.Group(); bel.position.set(-0.75, 0.5, 0.0); g.add(bel); parts.bellows = bel;
  bel.add(box(0.3, 0.12, 0.5, SM.hide(), 0, 0, 0, 0.05, 1));
  bel.add(box(0.32, 0.03, 0.52, SM.plank(), 0, 0.07, 0, 0.01, 0.6));
  bel.add(at(cyl(0.03, 0.04, 0.3, SM.iron(), 6), 0.2, 0, 0, 0, 0, Math.PI / 2));
  // anvil on a stump
  const stump = log(0.22, 0.5); stump.position.set(0.95, 0.25, -0.6); g.add(stump);
  const anvil = new THREE.Group(); anvil.position.set(0.95, 0.5, -0.6); g.add(anvil);
  anvil.add(box(0.36, 0.1, 0.16, SM.iron(), 0, 0.12, 0, 0.01, 0)); anvil.add(box(0.16, 0.08, 0.12, SM.iron(), 0, 0.03, 0, 0.01, 0));
  const horn = mk(new THREE.ConeGeometry(0.06, 0.16, 6), SM.iron()); horn.rotation.z = Math.PI / 2; horn.position.set(-0.26, 0.13, 0); anvil.add(horn);
  return { g, col: [col(0, 0.45, 0, 0.62, 0.45, 0.5, false), col(0.25, 1.45, 0.18, 0.26, 0.65, 0.26, false), col(0.95, 0.31, -0.6, 0.24, 0.31, 0.24)], parts, anchors: { fire: new THREE.Vector3(-0.15, 0.7, -0.38), smoke: new THREE.Vector3(0.25, 2.15, 0.18) } };
};

B.smoker = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(0.85, 1.2, 0.8, SM.plankV(), 0, 0.6, 0, 0.02, 0.7));
  const roof = new THREE.Group(); roof.position.y = 1.2; g.add(roof);
  for (const sx of [-1, 1]) { const r = box(0.55, 0.05, 0.95, SM.thatch(), sx * 0.24, 0.15, 0, 0.02, 0.8); r.rotation.z = sx * -0.55; roof.add(r); }
  g.add(at(cyl(0.06, 0.06, 0.5, SM.metal(), 8), 0.22, 1.55, 0.2));
  // slatted window with meat strips inside
  for (let k = 0; k < 4; k++) g.add(box(0.5, 0.03, 0.02, SM.plank(), 0, 0.7 + k * 0.1, -0.41, 0, 0.6));
  g.add(box(0.5, 0.36, 0.01, SM.black(), 0, 0.85, -0.395, 0, 0));
  parts.meat = [];
  for (let k = 0; k < 4; k++) { const m = box(0.06, 0.22, 0.02, T('meatstrip', { color: 0x8a3a24, roughness: 0.6 }), -0.18 + k * 0.12, 0.85, -0.37, 0.01, 0); g.add(m); parts.meat.push(m); }
  return { g, col: [col(0, 0.6, 0, 0.43, 0.6, 0.4, false)], parts, anchors: { smoke: new THREE.Vector3(0.22, 1.85, 0.2), fire: new THREE.Vector3(0, 0.2, 0) } };
};

B.crop_plot = () => {
  const g = new THREE.Group(), parts = {};
  for (const sz of [-1, 1]) g.add(box(1.84, 0.25, 0.08, SM.plank(), 0, 0.125, sz * 0.88, 0.01, 0.6));
  for (const sx of [-1, 1]) g.add(box(0.08, 0.25, 1.7, SM.plank(), sx * 0.88, 0.125, 0, 0.01, 0.6));
  const soil = box(1.7, 0.18, 1.7, SM.soil(), 0, 0.12, 0, 0, 0.6); g.add(soil); parts.soil = soil;
  const crops = new THREE.Group(); g.add(crops); parts.crops = crops;
  // little sign stake
  const stake = stick(0.5, 0.015); stake.position.set(0.8, 0.35, -0.95); g.add(stake);
  const tag = box(0.16, 0.1, 0.01, SM.plank(), 0.8, 0.55, -0.96, 0.005, 0); g.add(tag); parts.tag = tag;
  return { g, col: [col(0, 0.12, 0, 0.92, 0.12, 0.92)], parts, anchors: {} };
};

B.greenhouse = () => {
  // a glass hut around one big crop bed; plants grow faster day and night
  const g = new THREE.Group(), parts = {};
  for (const sz of [-1, 1]) g.add(box(1.84, 0.25, 0.08, SM.plank(), 0, 0.125, sz * 0.88, 0.01, 0.6));
  for (const sx of [-1, 1]) g.add(box(0.08, 0.25, 1.7, SM.plank(), sx * 0.88, 0.125, 0, 0.01, 0.6));
  const soil = box(1.7, 0.18, 1.7, SM.soil(), 0, 0.12, 0, 0, 0.6); g.add(soil); parts.soil = soil;
  const crops = new THREE.Group(); g.add(crops); parts.crops = crops;
  const W = 1.3, Hh = 1.7, R = 2.35;
  // frame
  for (const [x, z] of [[-W, -W], [W, -W], [-W, W], [W, W]]) g.add(at(log(0.045, Hh), x, Hh / 2, z));
  for (const z of [-W, W]) g.add(at(log(0.035, W * 2), 0, Hh, z, 0, 0, Math.PI / 2));
  for (const x of [-W, W]) g.add(at(log(0.035, W * 2), x, Hh, 0, Math.PI / 2, 0, 0));
  g.add(at(log(0.04, W * 2 + 0.1), 0, R, 0, Math.PI / 2, 0, 0));
  const rafter = Math.hypot(W, R - Hh);
  for (const z of [-W, 0, W]) for (const sx of [-1, 1]) g.add(at(log(0.03, rafter), sx * W / 2, (Hh + R) / 2, z, 0, 0, sx * Math.atan2(W, R - Hh)));
  // glass: side walls, back wall, gables and the roof (front left open as a doorway)
  const glass = T('ghglass', { color: 0xcfeef0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const pane = (w, h, x, y, z, ry = 0, rx = 0) => { const m = mk(new THREE.PlaneGeometry(w, h), glass, false); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); g.add(m); };
  for (const sx of [-1, 1]) pane(W * 2, Hh, sx * W, Hh / 2, 0, Math.PI / 2);
  pane(W * 2, Hh, 0, Hh / 2, W);
  for (const sx of [-1, 1]) pane(W * 0.55, Hh, sx * W * 0.72, Hh / 2, -W);
  const roofW = rafter;
  for (const sx of [-1, 1]) { const m = mk(new THREE.PlaneGeometry(roofW, W * 2), glass, false); m.position.set(sx * W / 2, (Hh + R) / 2, 0); m.rotation.order = 'ZXY'; m.rotation.set(-Math.PI / 2, 0, -sx * Math.atan2(R - Hh, W)); g.add(m); }
  for (const z of [-W, W]) { const tri = new THREE.Shape([new THREE.Vector2(-W, 0), new THREE.Vector2(W, 0), new THREE.Vector2(0, R - Hh)]); const m = mk(new THREE.ShapeGeometry(tri), glass, false); m.position.set(0, Hh, z); g.add(m); }
  // a watering can + a thermometer for flavour
  const can = mk(new THREE.CylinderGeometry(0.09, 0.1, 0.18, 10), SM.metal()); can.position.set(1.05, 0.09, -1.05); g.add(can);
  const therm = box(0.05, 0.3, 0.02, SM.white(), -1.28, 1.2, 0.6, 0.005, 0); therm.rotation.y = Math.PI / 2; g.add(therm);
  return { g, col: [col(0, 0.12, 0, 0.92, 0.12, 0.92), col(-W, Hh / 2, -W, 0.06, Hh / 2, 0.06, false), col(W, Hh / 2, -W, 0.06, Hh / 2, 0.06, false), col(-W, Hh / 2, W, 0.06, Hh / 2, 0.06, false), col(W, Hh / 2, W, 0.06, Hh / 2, 0.06, false)], parts, anchors: {} };
};

B.water_collector = () => {
  const g = new THREE.Group(), parts = {};
  const barrel = cyl(0.3, 0.3, 0.7, SM.plankV(), 12); barrel.position.y = 0.35; g.add(barrel);
  for (const y of [0.12, 0.58]) g.add(at(mk(new THREE.TorusGeometry(0.305, 0.015, 4, 16), SM.iron()), 0, y, 0, Math.PI / 2, 0, 0));
  const water = mk(new THREE.CircleGeometry(0.28, 12), SM.water(), false); water.rotation.x = -Math.PI / 2; water.position.y = 0.1; g.add(water); parts.water = water;
  for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.78; const l = stick(1.5, 0.025); l.position.set(Math.cos(a) * 0.55, 0.75, Math.sin(a) * 0.55); l.rotation.set(-Math.sin(a) * 0.12, 0, Math.cos(a) * 0.12); g.add(l); }
  const funnel = mk(new THREE.ConeGeometry(0.75, 0.55, 8, 1, true), T('hidefunnel', { map: bTex('hide'), roughness: 0.85, side: THREE.DoubleSide })); funnel.rotation.x = Math.PI; funnel.position.y = 1.25; g.add(funnel);
  return { g, col: [col(0, 0.4, 0, 0.32, 0.4, 0.32, false)], parts, anchors: {} };
};

B.torch_stand = () => {
  const g = new THREE.Group(), parts = {};
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const l = stick(0.6, 0.02); l.position.set(Math.cos(a) * 0.12, 0.27, Math.sin(a) * 0.12); l.rotation.set(-Math.sin(a) * 0.4, 0, Math.cos(a) * 0.4); g.add(l); }
  const pole = log(0.035, 1.5); pole.position.y = 0.75; g.add(pole);
  const head = cyl(0.06, 0.045, 0.18, T('torchwrap', { color: 0x3a2a1a, roughness: 1, emissive: 0xff5010, emissiveIntensity: 0 }), 8); head.position.y = 1.55; g.add(head); parts.head = head;
  for (const y of [1.48, 1.6]) g.add(at(mk(new THREE.TorusGeometry(0.062, 0.008, 3, 10), SM.rope()), 0, y, 0, Math.PI / 2, 0, 0));
  return { g, col: [col(0, 0.8, 0, 0.08, 0.8, 0.08, false)], parts, anchors: { fire: new THREE.Vector3(0, 1.66, 0) } };
};

B.feed_trough = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(1.6, 0.06, 0.6, SM.plank(), 0, 0.42, 0, 0.01, 0.6));
  for (const sz of [-1, 1]) { const s = box(1.6, 0.26, 0.05, SM.plank(), 0, 0.55, sz * 0.31, 0.01, 0.6); s.rotation.x = sz * 0.25; g.add(s); }
  for (const sx of [-1, 1]) g.add(box(0.05, 0.3, 0.66, SM.plank(), sx * 0.8, 0.56, 0, 0.01, 0.6));
  for (const sx of [-0.7, 0.7]) for (const sz of [-0.2, 0.2]) { const l = log(0.04, 0.42); l.position.set(sx, 0.21, sz); g.add(l); }
  const food = box(1.5, 0.08, 0.5, SM.straw(), 0, 0.48, 0, 0.03, 1); g.add(food); parts.food = food;
  return { g, col: [col(0, 0.35, 0, 0.82, 0.35, 0.34, false)], parts, anchors: {} };
};

B.incubator = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(0.8, 0.45, 0.6, SM.plankV(), 0, 0.3, 0, 0.02, 0.7));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const l = log(0.035, 0.12); l.position.set(sx * 0.34, 0.06, sz * 0.24); g.add(l); }
  g.add(box(0.72, 0.06, 0.52, SM.straw(), 0, 0.54, 0, 0.02, 1));
  const lid = mk(new THREE.SphereGeometry(0.36, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), SM.glass(), false); lid.scale.set(1.05, 0.7, 0.8); lid.position.y = 0.55; g.add(lid);
  const lamp = mk(new THREE.SphereGeometry(0.045, 8, 6), T('heatlamp', { color: 0xff8040, emissive: 0xff6020, emissiveIntensity: 0, roughness: 0.3 }), false); lamp.position.set(0, 0.92, 0); g.add(lamp); parts.lamp = lamp;
  g.add(at(stick(0.5, 0.012), 0.3, 0.75, 0.2)); g.add(at(stick(0.35, 0.01), 0.15, 0.98, 0.1, 0, 0, Math.PI / 2 - 0.3));
  const dial = mk(new THREE.CircleGeometry(0.05, 12), T('dial', { map: textTexture(['°C'], { w: 32, h: 32, bg: '#f2efe6', fg: '#c8302a', size: 12 }) }), false); dial.position.set(0.25, 0.35, -0.305); dial.rotation.y = Math.PI; g.add(dial);
  parts.eggAt = new THREE.Vector3(0, 0.62, 0);
  return { g, col: [col(0, 0.35, 0, 0.42, 0.35, 0.32, false)], parts, anchors: { light: new THREE.Vector3(0, 0.9, 0) } };
};

B.research_table = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(1.6, 0.08, 0.8, SM.plank(), 0, 0.84, 0, 0.012, 0.6));
  for (const [x, z] of [[-0.72, -0.32], [0.72, -0.32], [-0.72, 0.32], [0.72, 0.32]]) g.add(at(log(0.045, 0.82), x, 0.41, z));
  // brass microscope
  const mic = new THREE.Group(); mic.position.set(-0.45, 0.88, 0.05); g.add(mic);
  mic.add(box(0.16, 0.025, 0.2, SM.brass(), 0, 0.012, 0, 0.005, 0));
  mic.add(at(box(0.035, 0.24, 0.035, SM.brass(), 0, 0, 0, 0.005, 0), 0, 0.13, 0.07));
  const tube = cyl(0.025, 0.03, 0.2, SM.brass(), 10); tube.position.set(0, 0.22, 0.0); tube.rotation.x = 0.35; mic.add(tube);
  mic.add(at(cyl(0.05, 0.05, 0.012, SM.black(), 12), 0, 0.09, 0));
  // magnifier on a stand
  const mag = new THREE.Group(); mag.position.set(0.1, 0.88, 0.18); g.add(mag);
  mag.add(at(stick(0.22, 0.008), 0, 0.11, 0));
  mag.add(at(mk(new THREE.TorusGeometry(0.06, 0.008, 4, 14), SM.brass()), 0, 0.26, -0.02, 0, 0.4, 0));
  mag.add(at(mk(new THREE.CircleGeometry(0.058, 14), SM.glass(), false), 0, 0.26, -0.02, 0, 0.4, 0));
  // jars, papers, fossil, brushes
  const jarCols = [0x60c040, 0xd0a030, 0x9a60c0];
  for (let k = 0; k < 3; k++) { const j = cyl(0.045, 0.045, 0.12, SM.glass(), 10); j.position.set(0.45 + k * 0.1, 0.94, 0.22); g.add(j); g.add(at(cyl(0.035, 0.035, 0.06, T('goo' + k, { color: jarCols[k], emissive: jarCols[k], emissiveIntensity: 0.15, roughness: 0.3 }), 8), 0.45 + k * 0.1, 0.915, 0.22)); g.add(at(cyl(0.048, 0.048, 0.02, SM.iron(), 10), 0.45 + k * 0.1, 1.01, 0.22)); }
  for (let k = 0; k < 3; k++) { const p = mk(new THREE.PlaneGeometry(0.2, 0.28), SM.paper(), false); p.rotation.set(-Math.PI / 2, 0, (k - 1) * 0.3); p.position.set(0.15 + k * 0.05, 0.882 + k * 0.002, -0.15); g.add(p); }
  const doodle = mk(new THREE.PlaneGeometry(0.2, 0.28), T('doodle', { map: textTexture(['RAPTOR', 'PROBABLY', 'FRIENDLY?'], { w: 96, h: 128, bg: '#f2ecd8', fg: '#2a50a0', size: 13 }), roughness: 0.95 }), false);
  doodle.rotation.set(-Math.PI / 2, 0, 0.15); doodle.position.set(0.22, 0.888, -0.12); g.add(doodle);
  const fossil = mk(new THREE.TorusGeometry(0.07, 0.02, 4, 10, Math.PI * 1.5), SM.bone()); fossil.rotation.x = -Math.PI / 2; fossil.position.set(-0.1, 0.9, -0.2); g.add(fossil);
  for (let k = 0; k < 2; k++) g.add(at(stick(0.18, 0.008), -0.65, 0.9, -0.1 + k * 0.05, 0, 0.2 * k, Math.PI / 2));
  return { g, col: [col(0, 0.44, 0, 0.8, 0.44, 0.4)], parts, anchors: {} };
};

B.specimen_shelf = () => {
  const g = new THREE.Group(), parts = { slots: [] };
  for (const sx of [-1, 1]) g.add(box(0.06, 1.7, 0.4, SM.plank(), sx * 0.6, 0.85, 0, 0.01, 0.6));
  for (let k = 0; k < 4; k++) g.add(box(1.2, 0.05, 0.4, SM.plank(), 0, 0.1 + k * 0.52, 0, 0.008, 0.6));
  g.add(box(1.26, 1.7, 0.03, SM.plankV(), 0, 0.85, 0.2, 0, 0.6));
  for (let k = 0; k < 3; k++) for (let i = 0; i < 3; i++) parts.slots.push(new THREE.Vector3(-0.38 + i * 0.38, 0.13 + k * 0.52, -0.02));
  return { g, col: [col(0, 0.85, 0, 0.64, 0.85, 0.22, false)], parts, anchors: {} };
};

B.spike_wall = () => {
  const g = new THREE.Group();
  for (let k = 0; k < 6; k++) {
    const x = -1.0 + k * 0.4;
    const s = new THREE.Group(); s.position.set(x, 0, 0); s.rotation.x = -0.6; g.add(s);
    s.add(at(log(0.07, 1.5), 0, 0.75, 0));
    const tip = mk(new THREE.ConeGeometry(0.07, 0.3, 8), SM.end()); tip.position.y = 1.65; s.add(tip);
  }
  const beam = log(0.08, 2.4); beam.rotation.z = Math.PI / 2; beam.position.set(0, 0.45, 0.3); g.add(beam);
  for (let k = 0; k < 6; k++) g.add(at(mk(new THREE.TorusGeometry(0.09, 0.012, 3, 8), SM.rope()), -1.0 + k * 0.4, 0.45, 0.3, 0, Math.PI / 2, 0));
  return { g, col: [col(0, 0.6, -0.2, 1.2, 0.6, 0.45, false)], parts: {}, anchors: {}, damage: 8 };
};

B.generator = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(0.8, 0.06, 0.6, SM.metal(), 0, 0.03, 0, 0, 0));
  g.add(box(0.7, 0.55, 0.5, T('genred', { color: 0xc8402a, roughness: 0.5, metalness: 0.3 }), 0, 0.35, 0, 0.05, 0));
  const fan = new THREE.Group(); fan.position.set(0, 0.36, -0.26); g.add(fan); parts.fan = fan;
  for (let k = 0; k < 4; k++) { const b = box(0.06, 0.3, 0.005, SM.metal(), 0, 0, 0, 0, 0); b.rotation.z = k * Math.PI / 4; fan.add(b); }
  g.add(at(mk(new THREE.TorusGeometry(0.18, 0.014, 4, 16), SM.iron()), 0, 0.36, -0.26));
  g.add(at(cyl(0.035, 0.035, 0.8, T('rustpipe', { color: 0x6a4a3a, roughness: 0.8, metalness: 0.5 }), 8), 0.25, 0.95, 0.15));
  const lab = mk(new THREE.PlaneGeometry(0.42, 0.1), T('genlabel', { map: textTexture(['DUNG-O-MATIC'], { w: 160, h: 40, bg: '#f2d040', fg: '#17130e', size: 18 }) }), false);
  lab.position.set(0, 0.52, -0.252); lab.rotation.y = Math.PI; g.add(lab);
  return { g, col: [col(0, 0.32, 0, 0.4, 0.32, 0.3, false)], parts, anchors: { smoke: new THREE.Vector3(0.25, 1.38, 0.15) } };
};

B.solar_panel = () => {
  const g = new THREE.Group(), parts = {};
  const tex = (() => { const p = new PixelPainter(64, 32, 41); p.fill([22, 34, 70]); for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) if (x % 8 === 0 || y % 8 === 0) p.set(x, y, [180, 190, 200]); p.scatter(10, (x, y) => p.set(x, y, [120, 150, 220])); return p.texture(); })();
  g.add(at(cyl(0.05, 0.07, 1.1, SM.iron(), 8), 0, 0.55, 0));
  const panel = new THREE.Group(); panel.position.y = 1.15; panel.rotation.x = -0.55; g.add(panel); parts.panel = panel;
  panel.add(box(1.4, 0.04, 0.9, SM.metal(), 0, 0, 0, 0.01, 0));
  const cells = mk(new THREE.PlaneGeometry(1.34, 0.84), T('solarcells', { map: tex, roughness: 0.15, metalness: 0.4 }), false); cells.rotation.x = -Math.PI / 2; cells.position.y = 0.022; panel.add(cells);
  g.add(box(0.3, 0.2, 0.2, SM.black(), 0.25, 0.12, 0.15, 0.02, 0));
  return { g, col: [col(0, 0.6, 0, 0.12, 0.6, 0.12, false)], parts, anchors: {} };
};

B.lamp = () => {
  const g = new THREE.Group(), parts = {};
  g.add(at(cyl(0.12, 0.16, 0.08, SM.iron(), 10), 0, 0.04, 0));
  g.add(at(cyl(0.03, 0.03, 2.1, SM.iron(), 8), 0, 1.08, 0));
  g.add(at(box(0.5, 0.04, 0.04, SM.iron(), 0, 0, 0, 0, 0), 0.22, 2.1, 0));
  const shade = mk(new THREE.ConeGeometry(0.16, 0.14, 10, 1, true), T('lampshade', { color: 0x2a5a3a, roughness: 0.5, side: THREE.DoubleSide })); shade.position.set(0.45, 2.04, 0); g.add(shade);
  const bulb = mk(new THREE.SphereGeometry(0.06, 8, 6), SM.bulb(), false); bulb.position.set(0.45, 1.98, 0); g.add(bulb); parts.bulb = bulb;
  return { g, col: [col(0, 1.05, 0, 0.08, 1.05, 0.08, false)], parts, anchors: { light: new THREE.Vector3(0.45, 1.9, 0) } };
};

B.sprinkler = () => {
  const g = new THREE.Group(), parts = {};
  g.add(at(cyl(0.025, 0.025, 0.6, SM.copper(), 8), 0, 0.3, 0));
  const head = new THREE.Group(); head.position.y = 0.62; g.add(head); parts.head = head;
  for (let k = 0; k < 3; k++) { const a = box(0.3, 0.02, 0.02, SM.copper(), 0.15, 0, 0, 0, 0); const w = new THREE.Group(); w.rotation.y = k * 2.094; w.add(a); head.add(w); }
  g.add(at(cyl(0.08, 0.1, 0.06, SM.iron(), 10), 0, 0.03, 0));
  return { g, col: [], parts, anchors: { spray: new THREE.Vector3(0, 0.65, 0) } };
};

B.dino_wheel = () => {
  const g = new THREE.Group(), parts = {};
  const wheel = new THREE.Group(); wheel.position.y = 1.8; g.add(wheel); parts.wheel = wheel;
  for (const sx of [-0.6, 0.6]) {
    const ring = mk(new THREE.TorusGeometry(1.65, 0.07, 6, 24), SM.bark()); ring.rotation.y = Math.PI / 2; ring.position.x = sx; wheel.add(ring);
    for (let k = 0; k < 8; k++) { const sp = box(0.06, 3.2, 0.06, SM.plank(), sx, 0, 0, 0.01, 0); sp.rotation.x = (k / 8) * Math.PI; wheel.add(sp); }
  }
  for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; const slat = box(1.3, 0.04, 0.26, SM.plank(), 0, Math.cos(a) * 1.68, Math.sin(a) * 1.68, 0.005, 0.6); slat.rotation.x = -a; wheel.add(slat); }
  wheel.add(at(cyl(0.12, 0.12, 1.6, SM.iron(), 10), 0, 0, 0, 0, 0, Math.PI / 2));
  for (const sx of [-0.85, 0.85]) for (const sz of [-1, 1]) { const l = log(0.08, 2.2); l.position.set(sx, 1.0, sz * 0.5); l.rotation.x = sz * 0.45; g.add(l); }
  g.add(box(0.4, 0.5, 0.4, SM.metal(), 1.2, 0.25, 0, 0.03, 0));
  return { g, col: [col(0, 0.15, 0, 0.7, 0.15, 1.7), col(-0.9, 1.0, 0, 0.1, 1.0, 1.2, false), col(0.9, 1.0, 0, 0.1, 1.0, 1.2, false)], parts, anchors: { inside: new THREE.Vector3(0, 0.35, 0) } };
};

B.auto_harvester = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(0.9, 0.7, 0.7, SM.metal(), 0, 0.5, 0, 0.04, 0.6));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(at(cyl(0.04, 0.04, 0.2, SM.iron(), 6), sx * 0.38, 0.08, sz * 0.28));
  const funnel = mk(new THREE.ConeGeometry(0.4, 0.4, 8, 1, true), T('funnel', { color: 0x9aa0a6, roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide })); funnel.rotation.x = Math.PI; funnel.position.y = 1.05; g.add(funnel);
  const arm = new THREE.Group(); arm.position.set(0, 0.95, 0); g.add(arm); parts.arm = arm;
  arm.add(at(box(1.4, 0.05, 0.05, SM.iron(), 0, 0, 0, 0, 0), 0.6, 0.2, 0));
  const claw = mk(new THREE.TorusGeometry(0.08, 0.02, 4, 8, Math.PI), SM.iron()); claw.position.set(1.3, 0.1, 0); claw.rotation.z = Math.PI; arm.add(claw);
  { const chute = box(0.2, 0.06, 0.5, SM.metal(), 0, 0.3, -0.55, 0, 0); chute.rotation.x = 0.4; g.add(chute); }
  const lamp = mk(new THREE.SphereGeometry(0.04, 6, 4), T('harvled', { color: 0x103010, emissive: 0x40ff60, emissiveIntensity: 0 }), false); lamp.position.set(0.3, 0.9, -0.36); g.add(lamp); parts.led = lamp;
  return { g, col: [col(0, 0.45, 0, 0.47, 0.45, 0.37, false)], parts, anchors: {} };
};

B.radio_tower = () => {
  const g = new THREE.Group(), parts = {};
  const H = 6;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const pts = [new THREE.Vector3(sx * 0.6, 0, sz * 0.6), new THREE.Vector3(sx * 0.12, H, sz * 0.12)];
    const geo = new THREE.TubeGeometry(new THREE.LineCurve3(pts[0], pts[1]), 1, 0.035, 5);
    g.add(mk(geo, SM.iron()));
  }
  for (let k = 1; k < 6; k++) {
    const y = k, w = 0.6 - (k / H) * 0.48;
    for (const [a, b] of [[[-w, -w], [w, -w]], [[w, -w], [w, w]], [[w, w], [-w, w]], [[-w, w], [-w, -w]]]) g.add(mk(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(a[0], y, a[1]), new THREE.Vector3(b[0], y, b[1])), 1, 0.02, 4), SM.iron()));
    if (k < 5) { const w2 = 0.6 - ((k + 1) / H) * 0.48; g.add(mk(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(-w, y, -w), new THREE.Vector3(w2, y + 1, -w2)), 1, 0.015, 4), SM.iron())); }
  }
  g.add(at(cyl(0.02, 0.02, 1.4, SM.iron(), 6), 0, H + 0.7, 0));
  const dish = mk(new THREE.SphereGeometry(0.45, 12, 5, 0, Math.PI * 2, 0, 0.7), T('towerdish', { color: 0xe8e4dc, roughness: 0.5, side: THREE.DoubleSide })); dish.position.set(0, H - 0.6, -0.35); dish.rotation.x = -1.7; g.add(dish); parts.dish = dish;
  const light = mk(new THREE.SphereGeometry(0.07, 8, 6), T('towerlight', { color: 0x400808, emissive: 0xff2020, emissiveIntensity: 0 }), false); light.position.y = H + 1.42; g.add(light); parts.light = light;
  g.add(box(0.5, 0.6, 0.4, SM.metal(), 0, 0.3, 0, 0.03, 0));
  return { g, col: [col(0, 0.3, 0, 0.3, 0.3, 0.25, false)], parts, anchors: { top: new THREE.Vector3(0, H + 1.4, 0) } };
};

B.lightning_rod = () => {
  const g = new THREE.Group(), parts = {};
  g.add(at(cyl(0.25, 0.3, 0.2, SM.stone(), 10), 0, 0.1, 0));
  g.add(at(cyl(0.04, 0.05, 5, SM.iron(), 8), 0, 2.6, 0));
  const helix = []; for (let i = 0; i <= 80; i++) { const t = i / 80; const a = t * Math.PI * 2 * 10; helix.push(new THREE.Vector3(Math.cos(a) * 0.08, 1 + t * 2.5, Math.sin(a) * 0.08)); }
  g.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 200, 0.012, 4), SM.copper()));
  const ball = mk(new THREE.SphereGeometry(0.14, 12, 8), T('rodball', { color: 0x9adaff, emissive: 0x40a0ff, emissiveIntensity: 0.1, roughness: 0.1, transparent: true, opacity: 0.8 }), false); ball.position.y = 5.2; g.add(ball); parts.ball = ball;
  g.add(at(cyl(0.01, 0.03, 0.5, SM.copper(), 6), 0, 5.55, 0));
  return { g, col: [col(0, 1.5, 0, 0.12, 1.5, 0.12, false)], parts, anchors: { tip: new THREE.Vector3(0, 5.8, 0) } };
};

B.capacitor = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(0.9, 1.1, 0.5, SM.metal(), 0, 0.55, 0, 0.03, 0.6));
  for (let k = 0; k < 6; k++) g.add(at(cyl(0.06, 0.06, 0.3, k % 2 ? SM.blue() : SM.black(), 10), -0.3 + (k % 3) * 0.3, 1.25, k < 3 ? -0.1 : 0.12));
  for (const z of [-0.1, 0.12]) g.add(box(0.75, 0.02, 0.03, SM.copper(), 0, 1.41, z, 0, 0));
  const gauge = mk(new THREE.PlaneGeometry(0.5, 0.12), T('capgauge', { color: 0x102010, emissive: 0x40ff60, emissiveIntensity: 0, roughness: 0.3 }), false); gauge.position.set(0, 0.8, -0.252); gauge.rotation.y = Math.PI; g.add(gauge); parts.gauge = gauge;
  const lab = mk(new THREE.PlaneGeometry(0.5, 0.1), T('caplabel', { map: textTexture(['DANGER: ZAPPY'], { w: 160, h: 32, bg: '#f2d040', fg: '#17130e', size: 16 }) }), false); lab.position.set(0, 0.55, -0.252); lab.rotation.y = Math.PI; g.add(lab);
  return { g, col: [col(0, 0.7, 0, 0.45, 0.7, 0.25, false)], parts, anchors: {} };
};

B.flag = () => {
  const g = new THREE.Group(), parts = {};
  g.add(at(log(0.04, 2.6), 0, 1.3, 0));
  g.add(at(mk(new THREE.SphereGeometry(0.06, 8, 6), SM.brass()), 0, 2.63, 0));
  const cloth = mk(new THREE.PlaneGeometry(0.9, 0.55, 10, 4), T('teamflag', { map: textTexture(['TEAM', 'VAN'], { w: 128, h: 80, bg: '#e8614f', fg: '#ffffff', border: '#17130e', size: 26 }), side: THREE.DoubleSide, roughness: 0.9 }), false);
  cloth.position.set(0.47, 2.25, 0); g.add(cloth); parts.cloth = cloth;
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const r = rock(0.1); r.position.set(Math.cos(a) * 0.14, 0.05, Math.sin(a) * 0.14); g.add(r); }
  return { g, col: [col(0, 1.3, 0, 0.06, 1.3, 0.06, false)], parts, anchors: {} };
};

B.coffee_machine = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(0.6, 0.05, 0.5, SM.plank(), 0, 0.75, 0, 0.01, 0.6));
  for (const [x, z] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) g.add(at(stick(0.74, 0.025), x, 0.37, z));
  g.add(box(0.24, 0.34, 0.22, T('coffeeblk', { color: 0x2a2826, roughness: 0.5 }), 0, 0.95, 0.05, 0.02, 0));
  const pot = cyl(0.07, 0.08, 0.14, SM.glass(), 12); pot.position.set(0, 0.85, -0.08); g.add(pot);
  const brew = cyl(0.065, 0.075, 0.07, T('coffeebrew', { color: 0x3a1a08, roughness: 0.2 }), 12); brew.position.set(0, 0.82, -0.08); g.add(brew); parts.brew = brew;
  const mug = cyl(0.04, 0.035, 0.08, SM.red(), 10); mug.position.set(0.2, 0.82, -0.12); g.add(mug);
  return { g, col: [col(0, 0.5, 0, 0.3, 0.5, 0.25, false)], parts, anchors: { steam: new THREE.Vector3(0, 1.0, -0.08) } };
};

B.dino_bed = () => {
  const g = new THREE.Group();
  _seed = 31;
  for (let k = 0; k < 26; k++) { const a = (k / 26) * Math.PI * 2; const l = stick(0.9 + rnd() * 0.4, 0.035); l.position.set(Math.cos(a) * 1.1, 0.18, Math.sin(a) * 1.1); l.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.4, a + 0.3, 0.25); g.add(l); }
  const cushion = mk(new THREE.CylinderGeometry(1.0, 1.05, 0.18, 14), SM.straw()); cushion.position.y = 0.09; g.add(cushion);
  for (let k = 0; k < 5; k++) { const f = mk(new THREE.PlaneGeometry(0.1, 0.3), T('feather', { color: [0xe8e0d0, 0x9a6040, 0x6080c0][k % 3], side: THREE.DoubleSide, roughness: 0.9 }), false); f.position.set((rnd() - 0.5) * 1.2, 0.2, (rnd() - 0.5) * 1.2); f.rotation.set(-1.2, rnd() * 6, 0); g.add(f); }
  return { g, col: [col(0, 0.1, 0, 1.0, 0.1, 1.0)], parts: {}, anchors: {} };
};

B.fridge = () => {
  const g = new THREE.Group(), parts = {};
  g.add(box(0.8, 0.45, 0.5, SM.white(), 0, 0.32, 0, 0.04, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.55, 0.25); g.add(lid); parts.lid = lid;
  lid.add(box(0.82, 0.08, 0.52, SM.blue(), 0, 0.04, -0.25, 0.03, 0));
  for (const sx of [-1, 1]) g.add(box(0.06, 0.03, 0.16, SM.white(), sx * 0.42, 0.45, 0, 0.01, 0));
  for (const sx of [-0.3, 0.3]) { const l = log(0.06, 0.8); l.rotation.x = Math.PI / 2; l.position.set(sx, 0.06, 0); g.add(l); }
  const sticker = mk(new THREE.PlaneGeometry(0.3, 0.1), T('coolsticker', { map: textTexture(['DO NOT EAT', 'THE EGGS'], { w: 128, h: 40, bg: '#ffffff', fg: '#c8302a', size: 13 }) }), false); sticker.position.set(0, 0.32, -0.252); sticker.rotation.y = Math.PI; g.add(sticker);
  return { g, col: [col(0, 0.3, 0, 0.41, 0.3, 0.26)], parts, anchors: {} };
};

// ------------------------------------------------------------------ decorations
B.table = () => {
  const g = new THREE.Group();
  _seed = 13;
  g.add(boards(1.3, 0.85, 5, 0.06, SM.plank(), 0.73));
  // apron rails, turned legs and a stretcher
  for (const z of [-0.36, 0.36]) g.add(box(1.08, 0.1, 0.035, SM.wood(), 0, 0.65, z, 0.008, 0.6));
  for (const x of [-0.56, 0.56]) g.add(box(0.035, 0.1, 0.66, SM.wood(), x, 0.65, 0, 0.008, 0.6));
  for (const [x, z] of [[-0.56, -0.36], [0.56, -0.36], [-0.56, 0.36], [0.56, 0.36]]) g.add(at(turnedLeg(0.7, 0.045), x, 0, z));
  const st = cyl(0.018, 0.018, 1.1, SM.wood(), 8); st.rotation.z = Math.PI / 2; st.position.y = 0.18; g.add(st);
  for (const x of [-0.56, 0.56]) { const s2 = cyl(0.016, 0.016, 0.72, SM.wood(), 8); s2.rotation.x = Math.PI / 2; s2.position.set(x, 0.18, 0); g.add(s2); }
  // a mug, a plate with a snack and a candle
  const cup = lathe([[0.001, 0], [0.035, 0], [0.04, 0.02], [0.042, 0.085], [0.036, 0.09], [0.034, 0.012], [0.001, 0.012]], SM.clay(), 12); cup.position.set(0.3, 0.765, 0.1); g.add(cup);
  const handle = mk(new THREE.TorusGeometry(0.022, 0.006, 4, 10, Math.PI * 1.2), SM.clay(), false); handle.position.set(0.345, 0.81, 0.1); handle.rotation.z = -Math.PI / 2 - 0.3; g.add(handle);
  const plate = lathe([[0.001, 0], [0.09, 0], [0.12, 0.018], [0.11, 0.02], [0.08, 0.006], [0.001, 0.006]], SM.white(), 16); plate.position.set(-0.22, 0.765, -0.08); g.add(plate);
  for (let k = 0; k < 5; k++) { const b = mk(new THREE.SphereGeometry(0.02, 8, 6), T('berryred', { color: 0xc8303a, roughness: 0.25 }), false); b.position.set(-0.22 + (rnd() - 0.5) * 0.08, 0.79, -0.08 + (rnd() - 0.5) * 0.08); g.add(b); }
  const candle = new THREE.Group(); candle.position.set(0.05, 0.765, -0.22); g.add(candle);
  candle.add(at(cyl(0.045, 0.05, 0.015, SM.brass(), 12), 0, 0.008, 0)); candle.add(at(cyl(0.018, 0.018, 0.09, T('wax', { color: 0xf2ead2, roughness: 0.5 }), 10), 0, 0.06, 0));
  return { g, col: [col(0, 0.38, 0, 0.66, 0.38, 0.43)], parts: {}, anchors: {} };
};
B.chair = () => {
  const g = new THREE.Group();
  _seed = 17;
  g.add(boards(0.5, 0.48, 3, 0.05, SM.plank(), 0.45));
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19]]) g.add(at(turnedLeg(0.43, 0.03), x, 0, z));
  // the back posts run from the floor to the top rail
  for (const x of [-0.2, 0.2]) g.add(at(turnedLeg(1.0, 0.032), x, 0, 0.2));
  for (const [y, z0, z1] of [[0.14, -0.19, 0.2]]) for (const x of [-0.2, 0.2]) { const s2 = cyl(0.013, 0.013, z1 - z0, SM.wood(), 6); s2.rotation.x = Math.PI / 2; s2.position.set(x, y, (z0 + z1) / 2); g.add(s2); }
  const front = cyl(0.013, 0.013, 0.4, SM.wood(), 6); front.rotation.z = Math.PI / 2; front.position.set(0, 0.2, -0.19); g.add(front);
  // curved top rail and three slats
  const rail = bentBox(0.5, 0.09, 0.035, -0.035, SM.wood()); rail.position.set(0, 0.93, 0.2); g.add(rail);
  for (const x of [-0.1, 0, 0.1]) g.add(box(0.05, 0.36, 0.018, SM.wood(), x, 0.7, 0.205, 0.006, 0.6));
  const pad = cushion(0.42, 0.06, 0.4, SM.patch(), 0.5); pad.position.set(0, 0.5, 0); g.add(pad);
  return { g, col: [col(0, 0.24, 0, 0.26, 0.24, 0.25)], parts: {}, anchors: { sit: new THREE.Vector3(0, 0.5, 0) } };
};
B.rug = () => {
  const g = new THREE.Group();
  const r = box(1.8, 0.02, 1.2, SM.patch(), 0, 0.01, 0, 0.008, 1.4); g.add(r);
  for (let k = 0; k < 12; k++) g.add(box(0.02, 0.005, 0.08, SM.rope(), -0.85 + k * 0.155, 0.01, 0.64, 0, 0));
  return { g, col: [], parts: {}, anchors: {} };
};
B.planter = () => {
  const g = new THREE.Group();
  const pot = lathe([[0.0, 0], [0.22, 0.0], [0.28, 0.35], [0.3, 0.38], [0.26, 0.38]], SM.clay()); g.add(pot);
  const dirt = mk(new THREE.CircleGeometry(0.26, 10), SM.soil(), false); dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.36; g.add(dirt);
  _seed = 41;
  for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; const f = mk(new THREE.ConeGeometry(0.07, 0.6, 4), SM.leaf()); f.position.set(Math.cos(a) * 0.12, 0.62, Math.sin(a) * 0.12); f.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); g.add(f); }
  return { g, col: [col(0, 0.2, 0, 0.28, 0.2, 0.28, false)], parts: {}, anchors: {} };
};
B.hammock = () => {
  const g = new THREE.Group();
  for (const z of [-1.3, 1.3]) { g.add(at(log(0.06, 1.6), 0, 0.8, z)); }
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(0, 1.2 - Math.sin(t * Math.PI) * 0.55, -1.25 + t * 2.5)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 20, 0.35, 8, false); geo.scale(1, 0.25, 1);
  const net = mk(geo, T('hammockfab', { map: bTex('red'), roughness: 0.9, side: THREE.DoubleSide })); net.position.y = 0.6; g.add(net);
  return { g, col: [col(0, 0.8, -1.3, 0.08, 0.8, 0.08, false), col(0, 0.8, 1.3, 0.08, 0.8, 0.08, false)], parts: {}, anchors: { sleep: new THREE.Vector3(0, 0.95, 0) } };
};
B.skull_trophy = () => {
  const g = new THREE.Group();
  g.add(at(log(0.05, 1.2), 0, 0.6, 0));
  const sk = new THREE.Group(); sk.position.y = 1.3; g.add(sk);
  const head = mk(new THREE.SphereGeometry(0.22, 10, 8), SM.bone()); head.scale.set(1, 0.9, 1.5); sk.add(head);
  for (const sx of [-1, 1]) { const e = mk(new THREE.SphereGeometry(0.06, 6, 4), SM.black(), false); e.position.set(sx * 0.11, 0.06, -0.24); sk.add(e); const h = mk(new THREE.ConeGeometry(0.05, 0.35, 6), SM.bone()); h.position.set(sx * 0.12, 0.2, -0.15); h.rotation.x = -0.9; sk.add(h); }
  return { g, col: [col(0, 0.7, 0, 0.1, 0.7, 0.1, false)], parts: {}, anchors: {} };
};

// ---- traps
function baitPile() {
  const b = new THREE.Group();
  const leaf = mk(new THREE.CircleGeometry(0.16, 7), SM.leaf(), false); leaf.rotation.x = -Math.PI / 2; leaf.position.y = 0.02; b.add(leaf);
  for (let k = 0; k < 5; k++) { const a = k * 1.3; const f = mk(new THREE.SphereGeometry(0.035, 6, 4), SM.red()); f.position.set(Math.cos(a) * 0.06, 0.05 + (k % 2) * 0.02, Math.sin(a) * 0.06); b.add(f); }
  return b;
}
B.trap_snare = () => {
  const g = new THREE.Group(), parts = {};
  _seed = 21;
  // peg + trigger stick + bait in the middle of the loop
  g.add(at(stick(0.3, 0.02), 0.5, 0.12, 0, 0, 0, 0.15));
  parts.bait = baitPile(); g.add(parts.bait);
  // armed: sapling bent down to the trigger, rope loop flat on the ground
  const armed = new THREE.Group(); g.add(armed); parts.armed = armed;
  const sap = new THREE.Group(); sap.position.set(0.55, 0, 0); armed.add(sap);
  const pole = log(0.035, 1.5); pole.position.y = 0.75; sap.add(pole); sap.rotation.z = 1.25;
  const loop = mk(new THREE.TorusGeometry(0.38, 0.015, 4, 18), SM.rope()); loop.rotation.x = -Math.PI / 2; loop.position.y = 0.03; armed.add(loop);
  const line = mk(new THREE.CylinderGeometry(0.01, 0.01, 0.62, 4), SM.rope()); line.rotation.z = Math.PI / 2; line.position.set(0.2, 0.08, 0); armed.add(line);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; const l = mk(new THREE.PlaneGeometry(0.22, 0.12), SM.leaf(), false); l.rotation.set(-Math.PI / 2, 0, a); l.position.set(Math.cos(a) * 0.38, 0.025, Math.sin(a) * 0.38); armed.add(l); }
  // sprung: sapling upright, loop yanked up
  const sprung = new THREE.Group(); g.add(sprung); parts.sprung = sprung; sprung.visible = false;
  const pole2 = log(0.035, 1.5); pole2.position.set(0.55, 0.75, 0); pole2.rotation.z = 0.12; sprung.add(pole2);
  const loop2 = mk(new THREE.TorusGeometry(0.18, 0.015, 4, 14), SM.rope()); loop2.position.set(0.45, 1.1, 0); loop2.rotation.y = 0.4; sprung.add(loop2);
  const line2 = mk(new THREE.CylinderGeometry(0.01, 0.01, 0.5, 4), SM.rope()); line2.position.set(0.52, 1.35, 0); sprung.add(line2);
  return { g, col: [], parts, anchors: {} };
};
B.trap_net = () => {
  const g = new THREE.Group(), parts = {};
  const H = 2.1, R = 1.45;
  for (const [x, z] of [[-R, -R], [R, -R], [-R, R], [R, R]]) { const p = log(0.06, H + 0.2); p.position.set(x, H / 2, z); g.add(p); }
  for (const [x0, z0, x1, z1] of [[-R, -R, R, -R], [-R, R, R, R], [-R, -R, -R, R], [R, -R, R, R]]) { const b = log(0.035, Math.hypot(x1 - x0, z1 - z0)); b.position.set((x0 + x1) / 2, H, (z0 + z1) / 2); if (x0 === x1) b.rotation.x = Math.PI / 2; else b.rotation.z = Math.PI / 2; g.add(b); }
  parts.bait = baitPile(); parts.bait.scale.setScalar(1.6); g.add(parts.bait);
  // net texture: rope grid with holes
  const p = new PixelPainter(32, 32, 3).clear();
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) if (x % 8 < 2 || y % 8 < 2) p.set(x, y, [200, 176, 128]);
  const netM = T('trapnet', { map: p.texture({ repeat: [3, 3] }), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
  // armed: the net bundled up at the top
  const armed = new THREE.Group(); g.add(armed); parts.armed = armed;
  const bundle = mk(new THREE.SphereGeometry(0.42, 10, 8), T('netbundle', { color: 0xc8b080, roughness: 0.95 })); bundle.scale.set(1.3, 0.6, 1.3); bundle.position.y = H - 0.2; armed.add(bundle);
  const trig = mk(new THREE.CylinderGeometry(0.01, 0.01, H - 0.3, 4), SM.rope()); trig.position.y = (H - 0.3) / 2; armed.add(trig);
  // sprung: the net draped over the catch
  const sprung = new THREE.Group(); g.add(sprung); parts.sprung = sprung; sprung.visible = false;
  const drape = new THREE.PlaneGeometry(R * 2.2, R * 2.2, 8, 8);
  const pp = drape.attributes.position; for (let i = 0; i < pp.count; i++) { const x = pp.getX(i), y = pp.getY(i); pp.setZ(i, 1.1 * Math.max(0, 1 - (x * x + y * y) / (R * R * 1.6))); }
  drape.computeVertexNormals(); drape.rotateX(-Math.PI / 2);
  const dm = mk(drape, netM, false); dm.position.y = 0.05; sprung.add(dm);
  return { g, col: [], parts, anchors: {} };
};

// ---- alpha trophies
function plaque(text, w = 0.62) {
  const m = mk(new THREE.PlaneGeometry(w, 0.16), T('plq_' + text, { map: textTexture([text], { w: 256, h: 64, bg: '#7a5232', fg: '#f3ead2', size: 30 }), roughness: 0.85 }), false);
  return m;
}
function bentCone(r, h, bend, m, seg = 10) {
  const geo = new THREE.ConeGeometry(r, h, seg, 6);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / h + 0.5; p.setZ(i, p.getZ(i) + bend * y * y * h); }
  geo.computeVertexNormals();
  return mk(geo, m);
}
B.trophy_gnasher = () => {
  const g = new THREE.Group();
  _seed = 66;
  const base = rock(0.42, SM.rockDark()); base.scale.set(1.1, 0.7, 1); base.position.y = 0.16; g.add(base);
  g.add(box(0.5, 0.12, 0.5, SM.plank(), 0, 0.36, 0, 0.02, 0.5));
  // the tooth: ivory point, darker root
  // the fang: fat root, curved point
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; const r = 0.22 * (t < 0.22 ? 0.82 + t * 0.8 : Math.pow(1 - t, 0.75) * 1.2); prof.push(new THREE.Vector2(Math.max(0.004, r), t * 1.1)); }
  const tg = new THREE.LatheGeometry(prof, 14);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) / 1.1; tp.setZ(i, tp.getZ(i) + 0.32 * y * y); }
  tg.computeVertexNormals();
  const tooth = mk(tg, T('rextooth', { color: 0xf0e2c0, roughness: 0.4 })); tooth.position.set(0, 0.5, -0.04); g.add(tooth);
  const root = mk(new THREE.CylinderGeometry(0.2, 0.19, 0.1, 12), T('rexroot', { color: 0x8a6a46, roughness: 0.8 })); root.position.y = 0.46; g.add(root);
  const sign = plaque('OLD GNASHER'); sign.position.set(0, 0.36, -0.256); sign.rotation.y = Math.PI; g.add(sign);
  for (const sx of [-1, 1]) { const f = mk(new THREE.ConeGeometry(0.03, 0.22, 4), SM.bone()); f.position.set(sx * 0.19, 0.5, -0.12); f.rotation.z = sx * 0.4; g.add(f); }
  return { g, col: [col(0, 0.5, 0, 0.3, 0.5, 0.3, false)], parts: {}, anchors: {} };
};
B.trophy_momma = () => {
  const g = new THREE.Group();
  for (const x of [-0.42, 0.42]) g.add(at(log(0.05, 1.2), x, 0.6, 0));
  g.add(at(log(0.04, 0.95), 0, 0.25, 0, 0, 0, Math.PI / 2));
  // fan-shaped sail scale with teal + orange bands
  const p = new PixelPainter(32, 32, 9);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const band = Math.floor(Math.hypot(x - 16, y) / 4); p.set(x, y, band % 2 ? [0x3e, 0x5a, 0x52] : [0xe0, 0x7a, 0x2a]); }
  const mat = T('mommasail', { map: p.texture(), roughness: 0.7, side: THREE.DoubleSide });
  const fan = mk(new THREE.CircleGeometry(0.42, 16, 0, Math.PI), mat); fan.position.set(0, 0.32, 0); g.add(fan);
  for (let k = 0; k < 7; k++) { const a = (k / 6) * Math.PI; const sp = mk(new THREE.CylinderGeometry(0.012, 0.02, 0.44, 5), SM.bone()); sp.position.set(Math.cos(a) * 0.21, 0.32 + Math.sin(a) * 0.21, 0.01); sp.rotation.z = a - Math.PI / 2; g.add(sp); }
  const sign = plaque('BIG MOMMA', 0.5); sign.position.set(0, 1.08, -0.06); sign.rotation.y = Math.PI; g.add(sign);
  g.add(at(log(0.035, 0.95), 0, 1.08, 0, 0, 0, Math.PI / 2));
  return { g, col: [col(0, 0.6, 0, 0.46, 0.6, 0.08, false)], parts: {}, anchors: {} };
};
B.trophy_razor = () => {
  const g = new THREE.Group();
  g.add(at(log(0.06, 1.25), 0, 0.62, 0));
  // crossed bones + the sickle claw
  for (const a of [-0.7, 0.7]) { const b = mk(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), SM.bone()); b.position.set(0, 1.05, -0.07); b.rotation.set(0, 0, a); g.add(b); }
  const claw = bentCone(0.07, 0.5, 0.9, T('raptorclaw', { color: 0x2a2624, roughness: 0.35 }));
  claw.position.set(0, 1.12, -0.12); claw.rotation.x = -0.2; g.add(claw);
  // feathers tied on with string
  for (const [x, c] of [[-0.08, 0xe8d040], [0.0, 0x3a3a46], [0.08, 0xe8d040]]) { const f = mk(new THREE.PlaneGeometry(0.06, 0.26), T('rfeather' + c, { color: c, roughness: 0.8, side: THREE.DoubleSide }), false); f.position.set(x, 0.72, -0.07); f.rotation.z = x * 2; g.add(f); }
  const sign = plaque('RAZOR', 0.36); sign.position.set(0, 0.45, -0.065); sign.rotation.y = Math.PI; g.add(sign);
  return { g, col: [col(0, 0.62, 0, 0.1, 0.62, 0.1, false)], parts: {}, anchors: {} };
};

export const STRUCTURE_BUILDERS = B;
export function buildStructure(type) {
  const fn = B[type];
  if (!fn) return null;
  const r = fn();
  r.g.traverse((o) => { if (o.isMesh) { o.userData.structure = true; } });
  return r;
}
