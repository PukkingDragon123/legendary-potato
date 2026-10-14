// Caves: rock shells built over the heightmap where the world wants one.
// The Cave Behind the Falls is a dry grotto tucked under the waterfall (walk
// through the water along the stepping stones; the Navigation Chip waits on
// its floor), and the Crystal Grotto is a big mossy cave mouth in the hill
// with chrono crystals glowing in the dark inside.
import * as THREE from 'three';
import { makeRockMaterial } from '../world/nodes.js';
import { Simplex } from '../core/rng.js';

const noise = new Simplex('caves');

// A noisy dome shell: a full cap on top, a band below with a gap for the
// entrance (facing local -Z). r: radius, sy: vertical squash, gap: half
// width of the entrance (radians), split: polar angle where the arch starts.
function shellGeo(r, sy, gap, split, seed) {
  const parts = [];
  const cap = new THREE.SphereGeometry(r, 26, 6, 0, Math.PI * 2, 0, split);
  // three.js sphere: z = r sin(phi) sin(theta), so local -Z (the entrance) is phi = 3PI/2
  const band = new THREE.SphereGeometry(r, 22, 6, Math.PI * 1.5 + gap, Math.PI * 2 - gap * 2, split, Math.PI / 2 - split + 0.25);
  for (const g of [cap, band]) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const l = Math.hypot(x, y, z) || 1;
      const k = 1 + 0.16 * noise.noise3(x / l * 2.1 + seed, y / l * 2.1, z / l * 2.1) + 0.07 * noise.noise3(x / l * 5 + seed, y / l * 5, z / l * 5);
      p.setXYZ(i, x * k, y * k * sy, z * k);
    }
    parts.push(g.toNonIndexed());
  }
  // merge
  const pos = [];
  for (const g of parts) pos.push(...g.attributes.position.array);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

export class Caves {
  constructor(game) {
    this.name = 'caves';
    this.g = game;
    this.list = [];
    this.mat = makeRockMaterial(game.nodes?.rockTex, { side: THREE.DoubleSide, moss: 1 });
    this.slab = makeRockMaterial(game.nodes?.rockTex, { moss: 0.3 });
    this.buildFallCave();
    this.buildCrystalGrotto();
  }
  // walls as a ring of boxes, leaving the entrance free
  ringColliders(c, r, yaw, gap, y0, h) {
    const ph = this.g.physics, N = 14;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // local angle 0 = entrance direction (-Z)
      let d = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(d) < gap + 0.12) continue;
      const lx = Math.sin(a) * r, lz = -Math.cos(a) * r;
      const cs = Math.cos(yaw), sn = Math.sin(yaw);
      ph.addBox({ x: c.x + lx * cs + lz * sn, y: y0 + h / 2, z: c.z - lx * sn + lz * cs, hx: r * Math.sin(Math.PI / N) + 0.25, hy: h / 2, hz: 0.7, yaw: yaw - a, walk: false, solid: true, kind: 'struct' });
    }
  }
  shell(c, yaw, r, sy, gap, split, seed) {
    const m = new THREE.Mesh(shellGeo(r, sy, gap, split, seed), this.mat);
    m.position.copy(c); m.rotation.y = yaw;
    m.castShadow = true; m.receiveShadow = true; m.name = 'cave';
    this.g.engine.scene.add(m);
    return m;
  }
  // ---------------------------------------------------------------- behind the falls
  buildFallCave() {
    const g = this.g, s = g.sampler, f = g.world.waterfalls?.[0];
    const poi = g.world.pois.find((p) => p.id === 'fallcave');
    if (!f || !poi) return;
    // from the foot of the falls toward the cliff
    let dx = f.x0 - f.x1, dz = f.z0 - f.z1; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
    let wall = 6;
    for (let k = 0; k < 20; k += 0.5) { if (s.heightAt(f.x1 + dx * k, f.z1 + dz * k) > f.bottom + 6) { wall = k; break; } }
    const floorY = Math.max(f.bottom + 0.45, s.heightAt(f.x1 + dx * (wall - 2.5), f.z1 + dz * (wall - 2.5)) + 0.1);
    const c = new THREE.Vector3(f.x1 + dx * (wall - 2.6), floorY, f.z1 + dz * (wall - 2.6));
    const yaw = Math.atan2(dx, dz); // local +Z points into the cliff, the entrance (-Z) faces the pool
    const R = 3.8;
    this.shell(c.clone().add(new THREE.Vector3(0, -0.4, 0)), yaw, R, 0.82, 0.62, 0.8, 3.3);
    // the dry floor: a flat rock slab just above the pool
    const slab = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.95, R, 0.6, 18).translate(0, -0.3, 0), this.slab);
    slab.position.copy(c); slab.receiveShadow = true; slab.castShadow = true; g.engine.scene.add(slab);
    g.physics.addCyl({ x: c.x, z: c.z, r: R * 0.92, y0: floorY - 1.5, y1: floorY, ref: null, kind: 'struct', walk: true });
    this.ringColliders(c, R * 0.92, yaw, 0.62, floorY, 3);
    // stepping stones from the nearest dry bank to the cave mouth
    const sx = -dz, sz = dx; // along the cliff
    let side = 1, bank = null;
    for (const sg of [1, -1]) for (let k = 3; k < 30; k += 1) { const x = c.x + sx * k * sg - dx * 1.2, z = c.z + sz * k * sg - dz * 1.2; if (s.heightAt(x, z) > f.bottom + 0.2) { if (!bank || k < bank.k) bank = { k, sg }; break; } }
    if (bank) side = bank.sg;
    const n = bank ? Math.max(2, Math.ceil(bank.k / 1.55)) : 6;
    for (let i = 1; i <= n; i++) {
      const t = i * (bank ? bank.k / n : 1.55);
      const x = c.x + sx * t * side - dx * (1.2 + Math.sin(i * 1.7) * 0.4), z = c.z + sz * t * side - dz * (1.2 + Math.sin(i * 1.7) * 0.4);
      const rr = 0.75 + (i % 2) * 0.15;
      const st = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.85, rr, 0.5, 8).translate(0, -0.25, 0), this.slab);
      st.position.set(x, floorY - 0.05, z); st.rotation.y = i; st.castShadow = true; st.receiveShadow = true;
      g.engine.scene.add(st);
      g.physics.addCyl({ x, z, r: rr * 0.9, y0: floorY - 2, y1: floorY - 0.05, ref: null, kind: 'struct', walk: true });
    }
    // the POI (discovery + node content + the chip) now lives inside the grotto
    poi.x = c.x; poi.z = c.z; poi.y = floorY; poi.floorY = floorY;
    this.fallCave = { c, yaw, floorY, R };
    this.list.push({ c, r: R, roofY: floorY + R * 0.82 });
  }
  // ---------------------------------------------------------------- crystal grotto
  buildCrystalGrotto() {
    const g = this.g, s = g.sampler;
    const p = g.world.pois.find((q) => q.id === 'crystalcave');
    if (!p) return;
    // face the entrance downhill
    const e = 3, gx = s.heightAt(p.x + e, p.z) - s.heightAt(p.x - e, p.z), gz = s.heightAt(p.x, p.z + e) - s.heightAt(p.x, p.z - e);
    const yaw = Math.atan2(gx, gz); // local -Z = downhill
    const R = 10;
    let lo = Infinity;
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; lo = Math.min(lo, s.heightAt(p.x + Math.cos(a) * R, p.z + Math.sin(a) * R)); }
    const c = new THREE.Vector3(p.x, lo - 1.2, p.z);
    this.shell(c, yaw, R, 0.74, 0.42, 1.0, 7.7);
    this.ringColliders(new THREE.Vector3(p.x, 0, p.z), R * 0.93, yaw, 0.42, lo - 1, 6);
    this.light = g.lightPool?.add({ pos: new THREE.Vector3(p.x, s.heightAt(p.x, p.z) + 2.5, p.z), color: 0x50e0ff, intensity: 160, range: 22, flicker: 0.08, on: true, priority: 0.7 });
    this.list.push({ c: new THREE.Vector3(p.x, s.heightAt(p.x, p.z), p.z), r: R, roofY: c.y + R * 0.74 });
  }
  // is a point under a cave roof? (rain, sky light and sun checks can use this)
  inside(pos) { for (const q of this.list) if (Math.hypot(pos.x - q.c.x, pos.z - q.c.z) < q.r * 0.85 && pos.y < q.roofY) return true; return false; }
  update() {}
}

export async function install(g) {
  const C = new Caves(g);
  g.caves = C;
  g.addSystem(C);
  return C;
}
