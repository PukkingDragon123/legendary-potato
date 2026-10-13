// Trees: deterministic placement per biome, near/far BatchedMeshes with LOD
// swapping, plus the gameplay side (spatial queries, chopping, regrowth).
import * as THREE from 'three';
import { buildFloraLibrary, SPECIES } from './plantModels.js';
import { buildPlantTextures } from '../gfx/plantTextures.js';
import { makeArrayMaterial, makeArrayDepthMaterial } from '../gfx/materials.js';
import { BIOME, MAT } from './gen.js';
import { RNG, Simplex, smoothstep } from '../core/rng.js';

// density per 1000 m^2
const BY_BIOME = {
  [BIOME.JUNGLE]: { giant: 2.2, treefern: 6.0, cycad: 2.4, ginkgo: 0.9, araucaria: 0.8, palm: 0.25, horsetail: 2.2, dead: 0.08 },
  [BIOME.RIVER]: { treefern: 2.4, horsetail: 3.6, cycad: 0.8, palm: 0.3, cypress: 0.3 },
  [BIOME.PRAIRIE]: { araucaria: 0.14, ginkgo: 0.16, cycad: 0.5, treefern: 0.22, horsetail: 0.3, conifer: 0.06 },
  [BIOME.REDWOOD]: { redwood: 1.6, conifer: 1.4, treefern: 2.6, cycad: 0.6, dead: 0.12 },
  [BIOME.SWAMP]: { cypress: 2.2, dead: 0.45, horsetail: 3.0, treefern: 1.4, cycad: 0.3 },
  [BIOME.NESTING]: { cycad: 0.35, palm: 0.25, dead: 0.15, araucaria: 0.05 },
  [BIOME.BEACH]: { palm: 0.9, cycad: 0.25 },
  [BIOME.HIGHLAND]: { conifer: 0.45, ginkgo: 0.3, araucaria: 0.28, cycad: 0.3, treefern: 0.15, horsetail: 0.2 },
  [BIOME.BADLANDS]: { dead: 0.1, cycad: 0.07 },
  [BIOME.MOUNTAIN]: { conifer: 0.75, dead: 0.05 },
  [BIOME.VOLCANIC]: { dead: 0.22, conifer: 0.04 },
  [BIOME.CRATER]: { dead: 0.04 },
};
const BIG = new Set(['giant', 'redwood', 'araucaria', 'ginkgo', 'conifer', 'cypress', 'palm', 'dead']);
const NEAR_IN = 170, NEAR_OUT = 195;

export class Flora {
  constructor(engine, world, sampler) {
    this.engine = engine;
    this.world = world;
    this.s = sampler;
    this.lib = buildFloraLibrary('flora-v1');
    this.speciesKeys = Object.keys(this.lib);
    const tex = buildPlantTextures();
    this.tex = tex;
    tex.bark.anisotropy = engine.maxAniso;
    this.barkMat = makeArrayMaterial(tex.bark, { roughness: 0.92, wind: { amp: 1.6 }, wet: true });
    this.leafMat = makeArrayMaterial(tex.leaves, { roughness: 0.75, side: THREE.DoubleSide, alphaTest: 0.5, alphaToCoverage: engine.quality.msaa > 0, wind: { amp: 0.5, flutter: 0.035 }, translucency: 0.55 });
    this.leafDepth = makeArrayDepthMaterial(tex.leaves, { wind: { amp: 0.5, flutter: 0.035 } });
    this.trees = [];
    this.grid = new Map(); // 16 m cells -> tree indices
    this.place();
    this.buildBatches();
    this._lodCursor = 0;
    this._lastCam = new THREE.Vector3(1e9, 0, 0);
    this.falling = [];
  }

  // ---------------------------------------------------------------- placement
  place() {
    const s = this.s, w = this.world;
    const rng = new RNG(w.seed + ':trees');
    const forest = new Simplex(w.seed + ':forest');
    const pois = w.pois;
    const crash = pois.find((p) => p.id === 'crash');
    const tooClosePOI = (x, z) => {
      for (const p of pois) {
        const r = (p.radius ?? 20) * (p.id === 'crash' ? 0.75 : p.id === 'lake' ? 1.05 : 0.6);
        if ((x - p.x) ** 2 + (z - p.z) ** 2 < r * r) return true;
      }
      // skid trench
      const sx = crash.x + 5, sz = crash.z - 3, ex = crash.x + 50, ez = crash.z - 44;
      const dx = ex - sx, dz = ez - sz, ll = dx * dx + dz * dz;
      let t = ((x - sx) * dx + (z - sz) * dz) / ll;
      if (t > -0.05 && t < 1.05) { t = Math.max(0, Math.min(1, t)); if (Math.hypot(x - (sx + dx * t), z - (sz + dz * t)) < 5) return true; }
      return false;
    };
    const half = w.half;
    for (const pass of [0, 1]) {
      const cell = pass === 0 ? 7 : 4;
      for (let gz = -half + cell / 2; gz < half; gz += cell) {
        for (let gx = -half + cell / 2; gx < half; gx += cell) {
          const x = gx + (rng.next() - 0.5) * cell * 0.9, z = gz + (rng.next() - 0.5) * cell * 0.9;
          const b = s.biomeAt(x, z);
          const table = BY_BIOME[b];
          if (!table) continue;
          const keys = Object.keys(table).filter((k) => BIG.has(k) === (pass === 0));
          if (!keys.length) continue;
          let total = 0;
          for (const k of keys) total += table[k];
          const f = forest.fbm2(x * 0.009, z * 0.009, 3);
          const clump = 0.2 + 1.6 * smoothstep(-0.25, 0.45, f);
          const p = total * clump * (cell * cell) / 1000;
          if (rng.next() > p) continue;
          let r = rng.next() * total, key = keys[0];
          for (const k of keys) { r -= table[k]; if (r <= 0) { key = k; break; } }
          const y = s.heightAt(x, z);
          const wl = s.waterAt(x, z);
          if (wl > y - 0.15 && key !== 'cypress') continue;
          if (key === 'cypress' && wl > y + 0.6) continue;
          const slope = s.slopeAt(x, z);
          if (slope > (key === 'conifer' || key === 'dead' ? 0.95 : 0.7)) continue;
          if (s.matAt(x, z) === MAT.DIRT) continue;
          if (tooClosePOI(x, z)) continue;
          // keep a walkable strip along the water's edge for big trees
          if (pass === 0 && key !== 'cypress' && (s.waterAt(x + 3, z) > -999 || s.waterAt(x - 3, z) > -999 || s.waterAt(x, z + 3) > -999 || s.waterAt(x, z - 3) > -999)) continue;
          const lib = this.lib[key];
          let variant = Math.floor(rng.next() * lib.variants.length);
          if (key === 'dead' && b === BIOME.VOLCANIC) variant = 3; // charred
          if (key === 'ginkgo' && variant === 3 && rng.next() < 0.5) variant = 0;
          const v = lib.variants[variant];
          const scale = 0.82 + rng.next() * 0.36;
          // spacing
          const minD = pass === 0 ? Math.max(3, v.canopy * 0.55 * scale) : 1.4;
          if (this.anyNear(x, z, minD, pass === 1)) continue;
          this.addTree(key, variant, x, y, z, rng.next() * Math.PI * 2, scale, rng);
        }
      }
    }
  }

  anyNear(x, z, d, trunksOnly) {
    const cs = 16;
    const ci = Math.floor((x + 1024) / cs), cj = Math.floor((z + 1024) / cs);
    const r = Math.ceil(d / cs) + 1;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      const list = this.grid.get(j * 1000 + i);
      if (!list) continue;
      for (const idx of list) {
        const t = this.trees[idx];
        const dd = trunksOnly ? Math.max(d, t.radius + 0.9) : Math.max(d, t.canopy * 0.4);
        if ((t.x - x) ** 2 + (t.z - z) ** 2 < dd * dd) return true;
      }
    }
    return false;
  }

  addTree(key, variant, x, y, z, rot, scale, rng) {
    const v = this.lib[key].variants[variant];
    const sp = SPECIES[key];
    const tint = new THREE.Color().setHSL(0, 0, 1);
    const hue = (rng.next() - 0.5) * 0.06, light = 0.88 + rng.next() * 0.22;
    tint.setRGB(light * (1 + hue), light, light * (1 - hue * 1.5));
    const t = {
      i: this.trees.length, key, variant, x, y, z, rot, scale,
      radius: v.radius * scale, height: v.height * scale, canopy: v.canopy * scale, small: v.small,
      hp: sp.hp * scale, maxHp: sp.hp * scale, alive: true, regrowAt: 0, grow: 1,
      tint, near: false, barkId: -1, leafId: -1,
    };
    this.trees.push(t);
    const key2 = Math.floor((z + 1024) / 16) * 1000 + Math.floor((x + 1024) / 16);
    if (!this.grid.has(key2)) this.grid.set(key2, []);
    this.grid.get(key2).push(t.i);
    return t;
  }

  // ---------------------------------------------------------------- rendering
  buildBatches() {
    const sets = { near: [], far: [] };
    for (const key of this.speciesKeys) for (const v of this.lib[key].variants) { sets.near.push(v.near); sets.far.push(v.far); }
    const count = (arr, part, attr) => arr.reduce((a, g) => a + (attr === 'v' ? g[part].attributes.position.count : g[part].index.count), 0);
    const mk = (arr, part, mat, maxInst) => {
      const bm = new THREE.BatchedMesh(maxInst, count(arr, part, 'v') + 16, count(arr, part, 'i') + 16, mat);
      bm.sortObjects = false;
      bm.perObjectFrustumCulled = true;
      bm.frustumCulled = false;
      return bm;
    };
    const nTrees = this.trees.length;
    this.bm = {
      nearBark: mk(sets.near, 'bark', this.barkMat, 4000),
      nearLeaf: mk(sets.near, 'leaf', this.leafMat, 4000),
      farBark: mk(sets.far, 'bark', this.barkMat, nTrees + 16),
      farLeaf: mk(sets.far, 'leaf', this.leafMat, nTrees + 16),
    };
    this.bm.nearBark.castShadow = this.bm.nearLeaf.castShadow = true;
    this.bm.nearBark.receiveShadow = this.bm.nearLeaf.receiveShadow = true;
    this.bm.farBark.receiveShadow = this.bm.farLeaf.receiveShadow = true;
    this.bm.nearLeaf.customDepthMaterial = this.leafDepth;
    // register geometries
    this.geoIds = {};
    for (const key of this.speciesKeys) {
      this.geoIds[key] = this.lib[key].variants.map((v) => ({
        nearBark: this.bm.nearBark.addGeometry(v.near.bark),
        nearLeaf: v.near.leaf.attributes.position.count ? this.bm.nearLeaf.addGeometry(v.near.leaf) : -1,
        farBark: this.bm.farBark.addGeometry(v.far.bark),
        farLeaf: v.far.leaf.attributes.position.count ? this.bm.farLeaf.addGeometry(v.far.leaf) : -1,
      }));
    }
    for (const m of Object.values(this.bm)) { m.name = 'flora'; this.engine.scene.add(m); }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    for (const t of this.trees) this.attach(t, false);
  }

  matrixFor(t) {
    const s = t.scale * t.grow;
    this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
    return this._m.compose(new THREE.Vector3(t.x, t.y, t.z), this._q, new THREE.Vector3(s, s, s));
  }

  detach(t) {
    const b = t.near ? this.bm.nearBark : this.bm.farBark;
    const l = t.near ? this.bm.nearLeaf : this.bm.farLeaf;
    if (t.barkId >= 0) b.deleteInstance(t.barkId);
    if (t.leafId >= 0) l.deleteInstance(t.leafId);
    t.barkId = t.leafId = -1;
  }

  attach(t, near) {
    const g = this.geoIds[t.key][t.variant];
    t.near = near;
    const b = near ? this.bm.nearBark : this.bm.farBark;
    const l = near ? this.bm.nearLeaf : this.bm.farLeaf;
    const m = this.matrixFor(t);
    t.barkId = b.addInstance(near ? g.nearBark : g.farBark);
    b.setMatrixAt(t.barkId, m);
    b.setColorAt(t.barkId, _barkTint.copy(t.tint).lerp(_white, 0.6));
    const lg = near ? g.nearLeaf : g.farLeaf;
    if (lg >= 0) {
      t.leafId = l.addInstance(lg);
      l.setMatrixAt(t.leafId, m);
      l.setColorAt(t.leafId, t.tint);
    }
  }

  forEachNear(x, z, r, fn) {
    const cs = 16;
    const i0 = Math.floor((x - r + 1024) / cs), i1 = Math.floor((x + r + 1024) / cs);
    const j0 = Math.floor((z - r + 1024) / cs), j1 = Math.floor((z + r + 1024) / cs);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const list = this.grid.get(j * 1000 + i);
      if (!list) continue;
      for (const idx of list) fn(this.trees[idx]);
    }
  }

  update(camPos, dt) {
    // LOD: trees within NEAR_IN become detailed, beyond NEAR_OUT go back to far
    const moved = camPos.distanceToSquared(this._lastCam) > 16;
    if (moved) {
      this._lastCam.copy(camPos);
      let budget = 400;
      this.forEachNear(camPos.x, camPos.z, NEAR_OUT + 32, (t) => {
        if (!t.alive || budget <= 0) return;
        const d2 = (t.x - camPos.x) ** 2 + (t.z - camPos.z) ** 2;
        if (!t.near && d2 < NEAR_IN * NEAR_IN) { this.detach(t); this.attach(t, true); budget--; }
        else if (t.near && d2 > NEAR_OUT * NEAR_OUT) { this.detach(t); this.attach(t, false); budget--; }
      });
      if (budget <= 0) this._lastCam.set(1e9, 0, 0); // continue next frame
    }
    // far ring sweep for trees that stayed near while we teleported away
    if (this._sweep === undefined) this._sweep = 0;
    for (let k = 0; k < 200; k++) {
      const t = this.trees[this._sweep];
      this._sweep = (this._sweep + 1) % this.trees.length;
      if (t && t.alive && t.near && (t.x - camPos.x) ** 2 + (t.z - camPos.z) ** 2 > NEAR_OUT * NEAR_OUT) { this.detach(t); this.attach(t, false); }
    }
    this.updateFalling(dt);
  }

  // ---------------------------------------------------------------- gameplay
  // nearest alive tree whose trunk the ray (origin, dir) hits within maxDist
  raycastTree(origin, dir, maxDist) {
    let best = null, bestT = maxDist;
    this.forEachNear(origin.x, origin.z, maxDist + 4, (t) => {
      if (!t.alive) return;
      // ray vs vertical cylinder (x,z,radius) between y and y+height
      const ox = origin.x - t.x, oz = origin.z - t.z;
      const r = t.radius + (t.small ? 0.35 : 0.15);
      const a = dir.x * dir.x + dir.z * dir.z;
      if (a < 1e-6) return;
      const b = 2 * (ox * dir.x + oz * dir.z), c = ox * ox + oz * oz - r * r;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return;
      const tt = (-b - Math.sqrt(disc)) / (2 * a);
      if (tt < 0 || tt > bestT) return;
      const y = origin.y + dir.y * tt;
      if (y < t.y - 0.5 || y > t.y + Math.min(t.height, 6)) return;
      bestT = tt; best = t;
    });
    return best ? { tree: best, dist: bestT } : null;
  }

  // collision circles for the character controller
  collidersNear(x, z, r, out) {
    this.forEachNear(x, z, r, (t) => {
      if (!t.alive || t.small) return;
      out.push({ type: 'cyl', x: t.x, z: t.z, r: t.radius * 0.95, y0: t.y - 1, y1: t.y + t.height, tree: t });
    });
    return out;
  }

  fell(t, dirX, dirZ) {
    if (!t.alive) return;
    t.alive = false;
    this.detach(t);
    const v = this.lib[t.key].variants[t.variant];
    const grp = new THREE.Group();
    const bark = new THREE.Mesh(v.near.bark, this.barkMat);
    const leaf = new THREE.Mesh(v.near.leaf, this.leafMat);
    bark.castShadow = leaf.castShadow = true;
    leaf.customDepthMaterial = this.leafDepth;
    grp.add(bark, leaf);
    grp.position.set(t.x, t.y, t.z);
    grp.rotation.y = t.rot;
    grp.scale.setScalar(t.scale);
    this.engine.scene.add(grp);
    const axis = new THREE.Vector3(dirZ, 0, -dirX).normalize();
    this.falling.push({ t, grp, axis, ang: 0, vel: 0.15, done: false, time: 0, bounced: 0 });
    return grp;
  }

  updateFalling(dt) {
    for (const f of this.falling) {
      f.time += dt;
      if (!f.done) {
        f.vel += dt * (0.9 + f.ang * 2.2);
        f.ang += f.vel * dt;
        if (f.ang >= Math.PI / 2 - 0.05) {
          f.ang = Math.PI / 2 - 0.05;
          if (f.bounced < 2 && f.vel > 0.4) { f.vel = -f.vel * 0.22; f.bounced++; if (this.onTreeImpact) this.onTreeImpact(f.t, f.bounced); }
          else { f.done = true; f.doneAt = f.time; }
        }
        const q = new THREE.Quaternion().setFromAxisAngle(f.axis, f.ang);
        const base = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.t.rot);
        f.grp.quaternion.copy(q.multiply(base));
      } else if (f.time - f.doneAt > 1.2) {
        f.grp.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
        if (f.grp.scale.x < 0.05) { f.grp.removeFromParent(); f.removed = true; if (this.onTreeSettled) this.onTreeSettled(f.t, f); }
      }
    }
    this.falling = this.falling.filter((f) => !f.removed);
  }

  regrow(t) {
    t.alive = true; t.hp = t.maxHp; t.grow = 1;
    this.attach(t, false);
  }
}
const _white = new THREE.Color(1, 1, 1);
const _barkTint = new THREE.Color();
