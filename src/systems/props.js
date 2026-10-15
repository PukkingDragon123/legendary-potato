// Physical props: logs, boulder chunks, crates, oil barrels and van parts.
// Each is a small rigid body made of a few spheres, with gravity, terrain,
// structure and tree collisions, rolling friction, buoyancy (wood floats) and
// prop-to-prop contacts. The gravity gun lifts them on a spring: one explorer
// lifts up to their strength, friends holding the same prop add theirs, and a
// tamed creature can carry one on its back. Drop a prop into the van's rack
// (behind the back doors) or a storage crate and it is stored as items.
//
// Co-op: the host simulates; clients send their beam target and the host
// streams prop transforms back.
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';
import { buildItemModel } from '../gfx/itemModels.js';
import { ITEMS } from '../data/items.js';

const GRAV = 9.8;
export const LIFT = 330; // newtons one gravity gun can pull with
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _n = new THREE.Vector3();

// ------------------------------------------------------------------ models
const mats = new Map();
const M = (key, make) => { if (!mats.has(key)) mats.set(key, patchMaterial(make(), {})); return mats.get(key); };
function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#c99e64'; x.fillRect(0, 0, 64, 64);
  for (let r = 30; r > 2; r -= 3 + Math.random() * 2) { x.strokeStyle = `rgba(${110 + r},${70 + r},${36 + r * 0.5},0.75)`; x.lineWidth = 1.2; x.beginPath(); x.arc(32 + Math.random(), 32 + Math.random(), r, 0, 7); x.stroke(); }
  x.strokeStyle = 'rgba(60,36,18,0.9)'; x.lineWidth = 3; x.beginPath(); x.arc(32, 32, 31, 0, 7); x.stroke();
  for (let i = 0; i < 3; i++) { x.strokeStyle = 'rgba(70,40,20,0.6)'; x.lineWidth = 1; x.beginPath(); x.moveTo(32, 32); const a = Math.random() * 6.28; x.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function logModel(r, len) {
  const g = new THREE.Group();
  const geo = new THREE.CylinderGeometry(r, r * 1.06, len, 16, 8);
  const p = geo.attributes.position, col = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), rr = Math.hypot(x, z);
    if (rr > r * 0.5) {
      const ridge = Math.sin(a * 9 + Math.sin(y * 7) * 0.6) * 0.012 + Math.sin(y * 13 + a * 3) * 0.006;
      const k = (rr + ridge) / rr;
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    const n = 0.5 + 0.5 * Math.sin(a * 9 + Math.sin(y * 7) * 0.6);
    col.push(0.3 + n * 0.12, 0.2 + n * 0.08, 0.12 + n * 0.05);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.rotateZ(Math.PI / 2);
  const bark = M('logbark', () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }));
  const body = new THREE.Mesh(geo, bark); body.castShadow = true; body.receiveShadow = true; g.add(body);
  const cap = M('logcap', () => new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 0.85 }));
  for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.CircleGeometry(r * 0.97, 16), cap); c.position.x = s * len / 2 + s * 0.002; c.rotation.y = s * Math.PI / 2; c.receiveShadow = true; g.add(c); }
  // a stub of a cut branch
  const st = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.28, r * 0.6, 7), bark); st.position.set(len * 0.15, r * 0.95, 0); st.rotation.z = 0.4; st.castShadow = true; g.add(st);
  return g;
}
function rockModel(r) {
  const geo = new THREE.IcosahedronGeometry(r, 2);
  const p = geo.attributes.position;
  const seed = Math.random() * 10;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.82 + 0.22 * Math.sin(x * 9 + seed) * Math.cos(z * 8 - seed) + 0.08 * Math.sin(y * 17); p.setXYZ(i, x * k, y * k * 0.85, z * k); }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, M('proprock', () => new THREE.MeshStandardMaterial({ color: 0x8a867c, roughness: 0.95, flatShading: true })));
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function crateModel(s) {
  const g = new THREE.Group();
  const wood = M('cratewood', () => new THREE.MeshStandardMaterial({ color: 0xa87c48, roughness: 0.85 }));
  const dark = M('cratedark', () => new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }));
  const b = new THREE.Mesh(new THREE.BoxGeometry(s * 1.9, s * 1.9, s * 1.9), wood); b.castShadow = true; b.receiveShadow = true; g.add(b);
  for (const [x, y, z, w, h, d] of [[0, 0.97, 0, 2, 0.12, 2], [0, -0.97, 0, 2, 0.12, 2], [0.97, 0, 0, 0.12, 2, 2], [-0.97, 0, 0, 0.12, 2, 2], [0, 0, 0.97, 2, 0.12, 2], [0, 0, -0.97, 2, 0.12, 2]]) {
    const e = new THREE.Mesh(new THREE.BoxGeometry(s * w, s * h, s * d), dark); e.position.set(x * s, y * s, z * s); g.add(e);
  }
  const x1 = new THREE.Mesh(new THREE.BoxGeometry(s * 2.6, s * 0.14, s * 0.06), dark); x1.rotation.z = Math.PI / 4; x1.position.z = s * 0.98; g.add(x1);
  return g;
}
function barrelModel(r, h) {
  const g = new THREE.Group();
  const red = M('barrelred', () => new THREE.MeshStandardMaterial({ color: 0x7a1e18, roughness: 0.45, metalness: 0.6 }));
  const rib = M('barrelrib', () => new THREE.MeshStandardMaterial({ color: 0x2a1a18, roughness: 0.5, metalness: 0.7 }));
  const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), red); b.castShadow = true; b.receiveShadow = true; g.add(b);
  for (const y of [-0.42, -0.1, 0.1, 0.42]) { const t = new THREE.Mesh(new THREE.TorusGeometry(r * 1.01, r * 0.035, 6, 24), rib); t.rotation.x = Math.PI / 2; t.position.y = y * h; g.add(t); }
  const drop = M('barreldrop', () => new THREE.MeshStandardMaterial({ color: 0xf2c230, roughness: 0.5 }));
  const d = new THREE.Mesh(new THREE.CircleGeometry(r * 0.32, 12), drop); d.position.set(0, 0, r * 1.012); g.add(d);
  return g;
}

// ------------------------------------------------------------------ types
// item/n: what it becomes when stored; mass in kg; spheres: [x, y, z, r] in the local frame
export const PROPS = {
  log: { name: 'Log', item: 'log', n: 2, mass: 30, float: 0.75, spheres: [[-0.55, 0, 0, 0.17], [0, 0, 0, 0.17], [0.55, 0, 0, 0.17]], build: () => logModel(0.17, 1.5) },
  log_small: { name: 'Log', item: 'log', n: 1, mass: 16, float: 0.75, spheres: [[-0.3, 0, 0, 0.13], [0.3, 0, 0, 0.13]], build: () => logModel(0.13, 0.85) },
  boulder: { name: 'Stone Chunk', item: 'stone', n: 6, mass: 58, float: 0, spheres: [[0, 0, 0, 0.28]], build: () => rockModel(0.3) },
  crate: { name: 'Supply Crate', item: null, mass: 18, float: 0.4, spheres: [[0, 0, 0, 0.3]], build: () => crateModel(0.28) },
  barrel_oil: { name: 'Oil Barrel', item: 'crude_oil', n: 4, mass: 52, float: 0.3, spheres: [[0, -0.26, 0, 0.26], [0, 0.26, 0, 0.26]], build: () => barrelModel(0.27, 0.82) },
  part: { name: 'Van Part', item: null, mass: 20, float: 0.2, spheres: [[0, 0, 0, 0.3]], build: (o) => { const m = buildItemModel(ITEMS[o.item]); m.scale.setScalar(o.scale ?? 2.2); const g = new THREE.Group(); g.add(m); m.position.y = -0.25; return g; } },
};

// ------------------------------------------------------------------ the system
let _pid = 1;
export class Props {
  constructor(game) {
    this.name = 'props';
    this.g = game;
    this.list = new Map();
    this.group = new THREE.Group(); this.group.name = 'props';
    game.engine.scene.add(this.group);
    this.holds = new Map(); // holder id -> { pid, local (grab point in prop frame), target, dist }
    this.syncT = 0;
    this.stores = []; // fn(prop) -> true if it took it
    game.props = this;
  }
  spawn(type, pos, opt = {}) {
    const g = this.g;
    const T = PROPS[type];
    if (!T) return null;
    if (g.net && !g.isHost && !opt.fromNet) { g.net.send('propSpawn', { type, x: pos.x, y: pos.y, z: pos.z, item: opt.item, n: opt.n, yaw: opt.yaw ?? 0 }); return null; }
    const id = opt.id ?? (g.local?.id ?? 'p') + ':' + _pid++;
    const mesh = T.build(opt);
    mesh.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.prop = id; } });
    this.group.add(mesh);
    const mass = opt.mass ?? T.mass;
    const spheres = T.spheres.map(([x, y, z, r]) => ({ p: new THREE.Vector3(x, y, z), r }));
    let I = 0; for (const s of spheres) I += s.p.lengthSq() + s.r * s.r * 0.4;
    const P = {
      id, type, T, mesh, mass, spheres, inertia: Math.max(0.02, (I / spheres.length) * mass),
      item: opt.item ?? T.item, n: opt.n ?? T.n ?? 1,
      pos: pos.clone(), vel: new THREE.Vector3(), quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), opt.yaw ?? 0), ang: new THREE.Vector3(),
      sleep: 0, asleep: false, carriedBy: null, age: 0, net: null,
    };
    if (opt.vel) P.vel.copy(opt.vel);
    this.list.set(id, P);
    this.place(P);
    if (g.net?.isHost && !opt.fromNet) g.net.broadcast('propSpawn', { id, type, x: pos.x, y: pos.y, z: pos.z, item: P.item, n: P.n, yaw: opt.yaw ?? 0 });
    return P;
  }
  remove(id) {
    const P = this.list.get(id); if (!P) return;
    P.mesh.removeFromParent(); this.list.delete(id);
    for (const [k, h] of this.holds) if (h.pid === id) this.holds.delete(k);
    if (this.g.net?.isHost) this.g.net.broadcast('propGone', { id });
  }
  place(P) { P.mesh.position.copy(P.pos); P.mesh.quaternion.copy(P.quat); }
  wake(P) { P.asleep = false; P.sleep = 0; }
  // what the gravity gun is pointing at
  raycast(o, d, reach = 10) {
    let best = null;
    for (const P of this.list.values()) {
      if (P.carriedBy) continue;
      for (const s of P.spheres) {
        const c = _v.copy(s.p).applyQuaternion(P.quat).add(P.pos);
        const oc = _w.copy(c).sub(o);
        const t = oc.dot(d);
        if (t < 0 || t > reach + s.r) continue;
        const d2 = oc.lengthSq() - t * t;
        const rr = (s.r + 0.08) ** 2;
        if (d2 > rr) continue;
        const th = t - Math.sqrt(rr - d2);
        if (!best || th < best.dist) best = { dist: Math.max(0.1, th), prop: P, point: o.clone().addScaledVector(d, Math.max(0.1, th)) };
      }
    }
    return best;
  }
  // ---------------------------------------------------------------- holding (gravity gun)
  grab(holder, pid, point, dist) {
    const P = this.list.get(pid); if (!P) return;
    const local = point.clone().sub(P.pos).applyQuaternion(_q.copy(P.quat).invert());
    // grab close to the centre so the prop does not swing wildly
    local.multiplyScalar(0.35);
    this.holds.set(holder, { pid, local, target: point.clone(), dist });
    this.wake(P);
  }
  setTarget(holder, target) { const h = this.holds.get(holder); if (h) h.target.copy(target); }
  release(holder, impulse = null) {
    const h = this.holds.get(holder); if (!h) return;
    this.holds.delete(holder);
    const P = this.list.get(h.pid);
    if (P && impulse) { P.vel.addScaledVector(impulse, 1 / P.mass); this.wake(P); }
  }
  holdersOf(pid) { let n = 0; for (const h of this.holds.values()) if (h.pid === pid) n++; return n; }
  canLift(P) { return this.holdersOf(P.id) * LIFT * 1.2 > P.mass * GRAV; }
  // ---------------------------------------------------------------- physics
  update(dt) {
    const g = this.g;
    if (g.net && !g.isHost) { this.updateClient(dt); return; }
    const steps = Math.max(1, Math.ceil(dt / (1 / 60)));
    const h = Math.min(dt, 0.05) / steps;
    for (let i = 0; i < steps; i++) this.step(h);
    for (const P of this.list.values()) { this.place(P); P.age += dt; }
    this.checkStores();
    // stream to clients
    if (g.net?.isHost && g.net.connected) {
      this.syncT -= dt;
      if (this.syncT <= 0) {
        this.syncT = 0.1;
        const out = [];
        for (const P of this.list.values()) if (!P.asleep || P._dirty) { P._dirty = false; out.push([P.id, +P.pos.x.toFixed(3), +P.pos.y.toFixed(3), +P.pos.z.toFixed(3), +P.quat.x.toFixed(4), +P.quat.y.toFixed(4), +P.quat.z.toFixed(4), +P.quat.w.toFixed(4)]); }
        if (out.length) g.net.broadcast('props', out);
      }
    }
  }
  updateClient(dt) {
    for (const P of this.list.values()) {
      if (!P.net) continue;
      const k = Math.min(1, dt * 12);
      P.pos.lerp(P.net.pos, k); P.quat.slerp(P.net.quat, k);
      this.place(P);
    }
  }
  step(h) {
    const g = this.g, S = g.sampler;
    const all = [...this.list.values()];
    // forces from gravity guns
    const pull = new Map();
    for (const [holder, H] of this.holds) {
      const P = this.list.get(H.pid); if (!P) { this.holds.delete(holder); continue; }
      const gp = _v.copy(H.local).applyQuaternion(P.quat).add(P.pos);
      const want = _w.copy(H.target).sub(gp);
      // a stiff, damped spring, limited by the gun's strength
      const f = want.multiplyScalar(P.mass * 38).addScaledVector(P.vel, -P.mass * 9.5);
      if (!H.strong && f.length() > LIFT * 0.6) f.setLength(LIFT * 0.6);
      // the gun also cancels gravity up to its strength (so light things float)
      let arr = pull.get(P); if (!arr) pull.set(P, (arr = []));
      arr.push({ f: f.clone(), at: gp.clone(), strong: !!H.strong });
      this.wake(P);
    }
    for (const P of all) {
      if (P.carriedBy) continue;
      if (P.asleep) continue;
      const F = _a.set(0, -GRAV * P.mass, 0);
      const torque = _b.set(0, 0, 0);
      const pulls = pull.get(P);
      if (pulls) {
        // hold-assist: up to the holders' combined strength of anti-gravity
        const cap = pulls.reduce((a, q) => a + (q.strong ? 1e6 : LIFT * 0.9), 0);
        const lift = Math.min(cap, GRAV * P.mass);
        F.y += lift;
        for (const { f, at } of pulls) {
          F.add(f);
          torque.add(_n.copy(at).sub(P.pos).cross(f));
        }
        // held things stop spinning
        P.ang.multiplyScalar(Math.exp(-h * 6));
      }
      // buoyancy and water drag
      const wl = S.waterAt(P.pos.x, P.pos.z);
      let wet = 0;
      if (wl > -999) for (const s of P.spheres) { const c = _v.copy(s.p).applyQuaternion(P.quat).add(P.pos); const sub = Math.max(0, Math.min(1, (wl - (c.y - s.r)) / (2 * s.r))); wet += sub / P.spheres.length; }
      if (wet > 0) {
        F.y += GRAV * P.mass * wet * (P.T.float > 0 ? 1.0 + P.T.float * 0.6 : 0.3);
        P.vel.multiplyScalar(Math.exp(-h * 2.2 * wet));
        P.ang.multiplyScalar(Math.exp(-h * 2 * wet));
        // the river carries floating things
        const flow = g.riverFlow?.(P.pos.x, P.pos.z, this._flow ?? (this._flow = {}));
        if (flow && P.T.float > 0) { P.vel.x += (flow.x * 2.2 - P.vel.x) * h * 0.8 * wet; P.vel.z += (flow.z * 2.2 - P.vel.z) * h * 0.8 * wet; }
      }
      P.vel.addScaledVector(F, h / P.mass);
      P.ang.addScaledVector(torque, h / P.inertia);
      P.vel.multiplyScalar(Math.exp(-h * 0.08));
      P.ang.multiplyScalar(Math.exp(-h * 0.4));
      P.pos.addScaledVector(P.vel, h);
      const al = P.ang.length();
      if (al > 1e-5) { _q.setFromAxisAngle(_n.copy(P.ang).divideScalar(al), al * h); P.quat.premultiply(_q).normalize(); }
      // contacts: terrain, structures and trees, per sphere
      for (const s of P.spheres) {
        const c = _v.copy(s.p).applyQuaternion(P.quat).add(P.pos);
        this.contactGround(P, s, c, h);
        this.contactShapes(P, s, c);
      }
      // players nudge props they walk into
      for (const pl of g.players.values()) {
        const dx = P.pos.x - pl.pos.x, dz = P.pos.z - pl.pos.z, d = Math.hypot(dx, dz);
        const R = 0.3 + P.spheres[0].r;
        if (d < R && P.pos.y < pl.pos.y + 1.2 && P.pos.y > pl.pos.y - 0.4 && d > 1e-4 && !this.holdsBy(pl.id, P.id)) {
          const k = (R - d) / d;
          P.pos.x += dx * k * 0.5; P.pos.z += dz * k * 0.5;
          P.vel.x += dx / d * 0.8; P.vel.z += dz / d * 0.8;
          this.wake(P);
        }
      }
      // sleep when settled
      if (!pulls && P.vel.lengthSq() < 0.004 && P.ang.lengthSq() < 0.01) { P.sleep += h; if (P.sleep > 0.8) { P.asleep = true; P.vel.set(0, 0, 0); P.ang.set(0, 0, 0); P._dirty = true; } } else P.sleep = 0;
      if (P.pos.y < -200) this.remove(P.id);
    }
    // props against props (sphere pairs)
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const A = all[i], B = all[j];
      if (A.carriedBy || B.carriedBy || (A.asleep && B.asleep)) continue;
      if (A.pos.distanceToSquared(B.pos) > 9) continue;
      for (const sa of A.spheres) for (const sb of B.spheres) {
        const ca = _v.copy(sa.p).applyQuaternion(A.quat).add(A.pos), cb = _w.copy(sb.p).applyQuaternion(B.quat).add(B.pos);
        const dd = ca.distanceTo(cb), R = sa.r + sb.r;
        if (dd >= R || dd < 1e-5) continue;
        const nrm = _n.copy(cb).sub(ca).divideScalar(dd), pen = R - dd;
        const ia = A.asleep && !B.asleep ? 0 : 1 / A.mass, ib = B.asleep && !A.asleep ? 0 : 1 / B.mass;
        const sum = ia + ib || 1;
        A.pos.addScaledVector(nrm, -pen * ia / sum); B.pos.addScaledVector(nrm, pen * ib / sum);
        const rv = _a.copy(B.vel).sub(A.vel).dot(nrm);
        if (rv < 0) { const j2 = -(1.2) * rv / sum; A.vel.addScaledVector(nrm, -j2 * ia); B.vel.addScaledVector(nrm, j2 * ib); }
        if (pen > 0.01) { this.wake(A); this.wake(B); }
      }
    }
  }
  holdsBy(holder, pid) { const h = this.holds.get(holder); return h && h.pid === pid; }
  contactGround(P, s, c, h) {
    const g = this.g;
    let gy = g.sampler.heightAt(c.x, c.z);
    const st = g.physics.groundAt(c.x, c.z, c.y + s.r, s.r + 0.2, s.r * 0.6);
    if (st > gy) gy = st;
    const pen = gy + s.r - c.y;
    if (pen <= 0) return;
    const nrm = st > g.sampler.heightAt(c.x, c.z) + 0.01 ? _n.set(0, 1, 0) : g.sampler.normalAt(c.x, c.z, _n);
    P.pos.addScaledVector(nrm, pen);
    // contact point velocity = v + w x r
    const r = _a.copy(c).sub(P.pos).addScaledVector(nrm, -s.r);
    const vc = _b.copy(P.ang).cross(r).add(P.vel);
    const vn = vc.dot(nrm);
    if (vn < 0) {
      // normal impulse (a little bounce) and friction that makes logs roll
      const jn = -(1 + 0.15) * vn * P.mass;
      P.vel.addScaledVector(nrm, jn / P.mass);
      const vt = vc.addScaledVector(nrm, -vn);
      const vtl = vt.length();
      if (vtl > 1e-4) {
        const jt = Math.min(vtl * P.mass * 0.6, 0.7 * jn + GRAV * P.mass * h * 0.7);
        const imp = vt.multiplyScalar(-jt / vtl);
        P.vel.addScaledVector(imp, 1 / P.mass);
        P.ang.addScaledVector(r.clone().cross(imp), 1 / P.inertia);
      }
      if (-vn > 2.5) this.g.audio?.play('thud', { pos: c, vol: Math.min(0.8, -vn * 0.1), rate: P.T.float > 0.5 ? 1.1 : 0.7 });
    }
    P.ang.multiplyScalar(0.995);
  }
  contactShapes(P, s, c) {
    const ph = this.g.physics;
    const shapes = ph.query(c.x, c.z, s.r + 1, this._tmp ?? (this._tmp = []));
    for (const sh of shapes) {
      if (!sh.solid || sh.ignore) continue;
      let px, py, pz;
      if (sh.type === 'cyl') {
        if (c.y + s.r < sh.y0 || c.y - s.r > sh.y1) continue;
        const dx = c.x - sh.x, dz = c.z - sh.z, d = Math.hypot(dx, dz);
        if (d >= sh.r + s.r || d < 1e-5) continue;
        const pen = sh.r + s.r - d;
        px = dx / d * pen; py = 0; pz = dz / d * pen;
      } else if (sh.type === 'box') {
        // closest point on a yawed box
        const lx0 = c.x - sh.x, lz0 = c.z - sh.z;
        const lx = lx0 * sh.cos - lz0 * sh.sin, lz = lx0 * sh.sin + lz0 * sh.cos, ly = c.y - sh.y;
        const qx = Math.max(-sh.hx, Math.min(sh.hx, lx)), qy = Math.max(-sh.hy, Math.min(sh.hy, ly)), qz = Math.max(-sh.hz, Math.min(sh.hz, lz));
        let dx = lx - qx, dy = ly - qy, dz = lz - qz;
        let d = Math.hypot(dx, dy, dz);
        if (d >= s.r) continue;
        if (d < 1e-5) { dy = 1; d = 1; }
        const pen = s.r - d;
        const wx = dx * sh.cos + dz * sh.sin, wz = -dx * sh.sin + dz * sh.cos;
        px = wx / d * pen; py = dy / d * pen; pz = wz / d * pen;
      } else continue;
      P.pos.x += px; P.pos.y += py; P.pos.z += pz;
      const nl = Math.hypot(px, py, pz);
      if (nl > 0) { _n.set(px / nl, py / nl, pz / nl); const vn = P.vel.dot(_n); if (vn < 0) P.vel.addScaledVector(_n, -vn * 1.2); }
      c.x += px; c.y += py; c.z += pz;
    }
  }
  // ---------------------------------------------------------------- storing (van rack, crates)
  checkStores() {
    for (const P of [...this.list.values()]) {
      if (!P.item || P.age < 0.5) continue;
      for (const st of this.stores) { if (st(P)) { this.stored(P); break; } }
    }
  }
  stored(P) {
    this.g.fx?.burst?.(P.pos, { color: 0x5ef2ff, n: 14 });
    this.g.audio?.play('pickup', { pos: P.pos, vol: 0.7, rate: 0.8 });
    this.remove(P.id);
  }
  serialize() { return [...this.list.values()].map((P) => [P.type, +P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2), +P.quat.x.toFixed(3), +P.quat.y.toFixed(3), +P.quat.z.toFixed(3), +P.quat.w.toFixed(3), P.item, P.n]); }
  load(arr) {
    for (const id of [...this.list.keys()]) this.remove(id);
    for (const [type, x, y, z, qx, qy, qz, qw, item, n] of arr ?? []) {
      const P = this.spawn(type, new THREE.Vector3(x, y, z), { item, n });
      if (P) { P.quat.set(qx, qy, qz, qw); P.asleep = true; this.place(P); }
    }
  }
}

export async function install(g) {
  const S = new Props(g);
  g.addSystem(S);
  g.saveables.props = { save: () => S.serialize(), load: (d) => S.load(d) };
  // co-op plumbing
  g.netHandlers.propSpawn = (d) => {
    if (g.isHost) { if (!S.list.has(d.id)) S.spawn(d.type, new THREE.Vector3(d.x, d.y, d.z), { item: d.item, n: d.n, yaw: d.yaw }); }
    else if (!S.list.has(d.id)) S.spawn(d.type, new THREE.Vector3(d.x, d.y, d.z), { item: d.item, n: d.n, yaw: d.yaw, id: d.id, fromNet: true });
  };
  g.netHandlers.propGone = (d) => { const P = S.list.get(d.id); if (P) { P.mesh.removeFromParent(); S.list.delete(d.id); } };
  g.netHandlers.props = (arr) => {
    if (g.isHost) return;
    for (const [id, x, y, z, qx, qy, qz, qw] of arr) { const P = S.list.get(id); if (!P) continue; P.net = P.net ?? { pos: new THREE.Vector3(), quat: new THREE.Quaternion() }; P.net.pos.set(x, y, z); P.net.quat.set(qx, qy, qz, qw); }
  };
  g.netHandlers.propHold = (d, from) => {
    if (!g.isHost) return;
    if (d.release) S.release(from, d.imp ? new THREE.Vector3(...d.imp) : null);
    else if (d.pid) { if (!S.holdsBy(from, d.pid)) S.grab(from, d.pid, new THREE.Vector3(...d.p), d.dist); S.setTarget(from, new THREE.Vector3(...d.t)); }
  };
  return S;
}
