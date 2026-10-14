// Dino tracks: footprints pressed into the ground as dinosaurs walk. They
// fade over a few minutes. Look at one to see whose it is and how fresh;
// scan it and the trail is marked on your compass so you can follow it.
// Prints are made locally from each dino's movement, so they show up for
// every player in co-op without any network traffic.
import * as THREE from 'three';
import { PixelPainter } from '../gfx/pixel.js';
import { patchMaterial } from '../gfx/shaderlib.js';

const CAP = 2000, LIFE = 300, FADE = 80, NEAR = 65;
// foot shape per species: 0 three-toed theropod, 1 round sauropod, 2 broad
// three-toed ornithopod, 3 hoofed quadruped
const FOOT = { compy: 0, microraptor: 0, gallimimus: 0, raptor: 0, dilo: 0, spino: 0, rex: 0, ptera: 0, brachio: 1, parasaur: 2, pachy: 2, trike: 3, stego: 3, ankylo: 3, proto: 3 };
const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qy = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

function atlas() {
  // 64x64: four 32x32 prints, pixel-art mud: dark pressed centre, pale rim
  const p = new PixelPainter(64, 64, 77).clear();
  const D = [44, 30, 20], M = [70, 50, 32];
  const dot = (ox, oy, x, y, r, c, a) => { for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= r * r + 0.5) { const X = ox + Math.round(x + i), Y = oy + 31 - Math.round(y + j); /* flipped: row 0 is v = 0, the heel end */ if (X >= ox && X < ox + 32 && Y >= oy && Y < oy + 32) p.set(X, Y, c, a); } };
  const line = (ox, oy, x0, y0, x1, y1, r, c, a) => { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)); for (let k = 0; k <= n; k++) { const t = k / Math.max(1, n); dot(ox, oy, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c, a); } };
  const print = (ox, oy, draw) => { draw((...a) => line(ox, oy, ...a, M, 90), (...a) => dot(ox, oy, ...a, M, 90), 2); draw((...a) => line(ox, oy, ...a, D, 205), (...a) => dot(ox, oy, ...a, D, 205), 0); };
  // 0: theropod (toes point up = forward)
  print(0, 0, (L, O, grow) => { L(16, 24, 16, 5, 2 + grow / 2); L(15, 22, 7, 9, 2 + grow / 2); L(17, 22, 25, 9, 2 + grow / 2); O(16, 24, 4 + grow / 2); });
  // 1: sauropod: big round pad with stubby toes
  print(32, 0, (L, O, grow) => { O(16, 17, 10 + grow / 2); for (const x of [8, 13, 19, 24]) O(x, 6, 2 + grow / 2); });
  // 2: ornithopod: three broad blunt toes
  print(0, 32, (L, O, grow) => { L(16, 22, 16, 7, 3 + grow / 2); L(14, 21, 8, 10, 3 + grow / 2); L(18, 21, 24, 10, 3 + grow / 2); O(16, 23, 5 + grow / 2); });
  // 3: quadruped: rounded pad with short toes
  print(32, 32, (L, O, grow) => { O(16, 18, 8 + grow / 2); for (const [x, y] of [[9, 9], [16, 7], [23, 9]]) O(x, y, 3 + grow / 2); });
  return p.texture({ wrap: THREE.ClampToEdgeWrapping });
}

export class Tracks {
  constructor(game) {
    this.name = 'tracks';
    this.g = game;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3), 3);
    this.attr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aFoot', this.attr);
    const mat = new THREE.MeshStandardMaterial({ map: atlas(), transparent: true, depthWrite: false, roughness: 1, metalness: 0 });
    mat.map.minFilter = THREE.NearestMipmapLinearFilter; mat.map.magFilter = THREE.NearestFilter;
    patchMaterial(mat, {
      wet: true,
      vertex: { head: 'attribute vec3 aFoot;\nvarying float vFade;', main: '#ifdef USE_MAP\n vMapUv = uv * 0.5 + aFoot.xy;\n#endif\n vFade = aFoot.z;' },
      fragment: { head: 'varying float vFade;', main: 'diffuseColor.a *= vFade;' },
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.receiveShadow = true; this.mesh.castShadow = false;
    this.mesh.renderOrder = 1; this.mesh.name = 'dino-tracks';
    game.engine.scene.add(this.mesh);
    this.prints = new Array(CAP).fill(null);
    this.head = 0;
    this.fadeT = 0;
    this.trail = null;
  }
  add(d, x, z, yaw, L, W, foot) {
    const g = this.g, s = g.sampler;
    const y = s.heightAt(x, z);
    if (s.waterAt(x, z) > y - 0.03) return;
    const i = this.head;
    this.head = (this.head + 1) % CAP;
    this.mesh.count = Math.max(this.mesh.count, this.head === 0 ? CAP : this.head);
    s.normalAt(x, z, _n);
    _q.setFromUnitVectors(_up, _n);
    _qy.setFromAxisAngle(_up, yaw);
    _q.multiply(_qy);
    _p.set(x, y + 0.035, z); _s.set(W, 1, L);
    _m.compose(_p, _q, _s);
    this.mesh.setMatrixAt(i, _m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attr.setXYZ(i, (foot % 2) * 0.5, foot >= 2 ? 0.5 : 0, 1);
    this.attr.needsUpdate = true;
    this.prints[i] = { x, y, z, yaw, L, sp: d.sp, dino: d.id, at: g.time.elapsed };
  }
  update(dt) {
    const g = this.g, cam = g.engine.camera.position;
    // walk each nearby dino's path and press a print every stride
    for (const d of g.dinos?.list.values() ?? []) {
      const T = (d._trk ??= { x: d.pos.x, z: d.pos.z, acc: 0, side: 1 });
      const mv = Math.hypot(d.pos.x - T.x, d.pos.z - T.z);
      T.x = d.pos.x; T.z = d.pos.z;
      if (mv > 4 || d.flying || d.swim || d.hidden || d.state === 'dead' || d.sp.size < 0.9) { T.acc = 0; continue; }
      if ((d.pos.x - cam.x) ** 2 + (d.pos.z - cam.z) ** 2 > NEAR * NEAR) continue;
      if (d.pos.y > g.sampler.heightAt(d.pos.x, d.pos.z) + 0.4) continue; // on a bridge / structure
      T.acc += mv;
      const k = d.sizeK ?? 1;
      const stride = Math.max(0.8, d.rig.len * k * 0.3);
      if (T.acc < stride) continue;
      T.acc = 0; T.side = -T.side;
      const foot = FOOT[d.sp.id] ?? 0;
      const L = Math.min(1.3, Math.max(0.16, d.sp.size * 0.075)) * (d.baby ? 0.6 : 1) * (d.sp.alpha ? 1.15 : 1);
      const W = L * (foot === 1 ? 1 : foot === 0 ? 0.85 : 0.92);
      const hip = d.rig.br * k * 0.55;
      const sx = Math.cos(d.yaw) * hip * T.side, sz = -Math.sin(d.yaw) * hip * T.side;
      this.add(d, d.pos.x + sx, d.pos.z + sz, d.yaw, L, W, foot);
    }
    // fading
    this.fadeT -= dt;
    if (this.fadeT <= 0) {
      this.fadeT = 0.5;
      const now = g.time.elapsed;
      let dirty = false;
      for (let i = 0; i < this.mesh.count; i++) {
        const P = this.prints[i];
        if (!P) continue;
        const age = now - P.at;
        const f = age > LIFE ? 0 : age > LIFE - FADE ? (LIFE - age) / FADE : 1;
        if (this.attr.getZ(i) !== f) { this.attr.setZ(i, f); dirty = true; }
        if (f <= 0) this.prints[i] = null;
      }
      if (dirty) this.attr.needsUpdate = true;
    }
    this.updateTrail(dt);
  }
  // the print you are looking at
  raycast(o, dir, reach) {
    if (dir.y > -0.08 || !this.mesh.count) return null;
    const g = this.g;
    let best = null;
    for (const P of this.prints) {
      if (!P) continue;
      if (Math.abs(P.x - o.x) > reach + 2 || Math.abs(P.z - o.z) > reach + 2) continue;
      const t = (P.y - o.y) / dir.y;
      if (t < 0 || t > reach + 1) continue;
      const hx = o.x + dir.x * t - P.x, hz = o.z + dir.z * t - P.z;
      if (hx * hx + hz * hz < Math.max(0.3, P.L * 0.6) ** 2 && (!best || t < best.t)) best = { t, P };
    }
    if (!best) return null;
    const P = best.P, sp = P.sp, age = g.time.elapsed - P.at;
    const fresh = age < 60 ? 'Very fresh' : age < 150 ? 'A few minutes old' : 'Old, fading';
    const heading = DIRS[Math.round((((-P.yaw * 180) / Math.PI + 720) % 360) / 45) % 8];
    return {
      dist: best.t, kind: 'track', species: sp.id, label: `${sp.short} tracks`, info: `${fresh} · heading ${heading}${sp.predator ? ' · predator!' : ''}`,
      fact: `${sp.name} footprints, ${fresh.toLowerCase()}, heading ${heading}. ${sp.predator ? 'Whatever made these eats people like you.' : 'Herbivore. Probably.'} The trail is marked on your compass.`,
      trail: { dino: P.dino, x: P.x, z: P.z, yaw: P.yaw, sp: sp.short },
    };
  }
  follow(trail) {
    this.trail = { ...trail, t: 90 };
    this.g.ui?.toast(`Following the ${trail.sp} trail. Check your compass!`, '', 'dino', 3500);
    this.updateTrail(0);
  }
  updateTrail(dt) {
    const T = this.trail, g = this.g;
    if (!T) return;
    T.t -= dt;
    const d = g.dinos?.list.get(T.dino);
    // the dino itself while it is around, else a point further along the trail
    const x = d ? d.pos.x : T.x - Math.sin(T.yaw) * 60, z = d ? d.pos.z : T.z - Math.cos(T.yaw) * 60;
    const close = Math.hypot(g.local.pos.x - x, g.local.pos.z - z) < (d ? 10 + d.radius * d.sizeK : 8);
    if (T.t <= 0 || close || d?.state === 'dead') {
      if (close && d) g.ui?.toast(`Found it: the ${d.displayName}!`, '', 'dino', 3000);
      g.ui?.setMarker('trail', null); this.trail = null; return;
    }
    T.mx = x; T.mz = z;
    g.ui?.setMarker('trail', { icon: 'dino', x, z, label: T.sp + ' trail' });
  }
}

export async function install(g) {
  const T = new Tracks(g);
  g.tracks = T;
  g.addSystem(T);
  g.interaction.handlers.push((o, d, reach) => T.raycast(o, d, reach + 3));
  g.events.on('scanned', ({ d }) => { if (d?.trail) T.follow(d.trail); });
  return T;
}
