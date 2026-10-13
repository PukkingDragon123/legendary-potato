// Collision world: heightfield terrain + static shapes (oriented boxes,
// vertical cylinders, ramps) in a spatial hash, plus tree trunks pulled from
// the flora system. Provides a capsule character controller and raycasts.
import * as THREE from 'three';

const CELL = 8;
let _id = 1;

export class CollisionWorld {
  constructor(sampler) {
    this.s = sampler;
    this.shapes = new Map();
    this.grid = new Map();
    this.extraQuery = null; // fn(x, z, r, out) for dynamic colliders (trees, vehicles)
    this._tmp = [];
  }

  _cells(minX, minZ, maxX, maxZ, fn) {
    const i0 = Math.floor(minX / CELL), i1 = Math.floor(maxX / CELL), j0 = Math.floor(minZ / CELL), j1 = Math.floor(maxZ / CELL);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(i * 73856093 ^ j * 19349663);
  }
  _bounds(s) {
    if (s.type === 'cyl') return [s.x - s.r, s.z - s.r, s.x + s.r, s.z + s.r];
    const r = Math.hypot(s.hx, s.hz);
    return [s.x - r, s.z - r, s.x + r, s.z + r];
  }
  add(shape) {
    shape.id = shape.id ?? _id++;
    if (shape.type !== 'cyl') { shape.cos = Math.cos(shape.yaw || 0); shape.sin = Math.sin(shape.yaw || 0); }
    this.shapes.set(shape.id, shape);
    const [a, b, c, d] = this._bounds(shape);
    this._cells(a, b, c, d, (k) => { let l = this.grid.get(k); if (!l) this.grid.set(k, (l = [])); l.push(shape); });
    return shape.id;
  }
  remove(id) {
    const s = this.shapes.get(id);
    if (!s) return;
    this.shapes.delete(id);
    const [a, b, c, d] = this._bounds(s);
    this._cells(a, b, c, d, (k) => { const l = this.grid.get(k); if (l) { const i = l.indexOf(s); if (i >= 0) l.splice(i, 1); } });
  }
  update(id, patch) { const s = this.shapes.get(id); if (!s) return; this.remove(id); Object.assign(s, patch); this.add(s); }
  addBox(o) { return this.add({ type: 'box', x: o.x, y: o.y, z: o.z, hx: o.hx, hy: o.hy, hz: o.hz, yaw: o.yaw || 0, walk: o.walk !== false, solid: o.solid !== false, ref: o.ref, kind: o.kind }); }
  addCyl(o) { return this.add({ type: 'cyl', x: o.x, z: o.z, r: o.r, y0: o.y0, y1: o.y1, ref: o.ref, kind: o.kind, walk: o.walk !== false, solid: o.solid !== false }); }
  addRamp(o) { return this.add({ type: 'ramp', x: o.x, y: o.y, z: o.z, hx: o.hx, hz: o.hz, hy: o.hy ?? 0.2, h0: o.h0, h1: o.h1, yaw: o.yaw || 0, ref: o.ref, kind: o.kind, walk: true, solid: false }); }

  query(x, z, r, out = []) {
    out.length = 0;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    this._cells(x - r, z - r, x + r, z + r, (k) => {
      const l = this.grid.get(k);
      if (l) for (const s of l) if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
    });
    if (this.extraQuery) this.extraQuery(x, z, r, out);
    return out;
  }

  // world -> local (box frame)
  local(s, x, z) {
    const dx = x - s.x, dz = z - s.z;
    return [dx * s.cos - dz * s.sin, dx * s.sin + dz * s.cos];
  }
  toWorldDir(s, lx, lz) { return [lx * s.cos + lz * s.sin, -lx * s.sin + lz * s.cos]; }

  surfaceAt(s, x, z, margin = 0) {
    // top height of a walkable shape at (x, z) or -Infinity
    if (s.type === 'cyl') {
      if (!s.walk) return -Infinity;
      return (x - s.x) ** 2 + (z - s.z) ** 2 <= (s.r + margin) ** 2 ? s.y1 : -Infinity;
    }
    const [lx, lz] = this.local(s, x, z);
    if (Math.abs(lx) > s.hx + margin || Math.abs(lz) > s.hz + margin) return -Infinity;
    if (s.type === 'ramp') {
      const t = Math.min(1, Math.max(0, (lz + s.hz) / (2 * s.hz)));
      return s.y + s.h0 + (s.h1 - s.h0) * t;
    }
    if (!s.walk) return -Infinity;
    return s.y + s.hy;
  }

  groundAt(x, z, feetY, step = 0.45, r = 0.2, shapes = null) {
    let g = this.s.heightAt(x, z);
    const list = shapes || this.query(x, z, r + 1, this._tmp);
    for (const s of list) {
      if (s.ignore) continue;
      const top = this.surfaceAt(s, x, z, r * 0.6);
      if (top > g && top <= feetY + step) g = top;
    }
    return g;
  }

  // push a vertical capsule (feet at p.y, height h, radius r) out of solid shapes
  resolve(p, r, h, step, shapes) {
    let hit = null;
    for (const s of shapes) {
      if (!s.solid || s.ignore) continue;
      let y0, y1;
      if (s.type === 'cyl') { y0 = s.y0; y1 = s.y1; } else { y0 = s.y - s.hy; y1 = s.y + s.hy; }
      if (p.y + h <= y0 || p.y + step >= y1) continue; // above or steppable
      if (s.type === 'cyl') {
        const dx = p.x - s.x, dz = p.z - s.z;
        const d = Math.hypot(dx, dz), rr = s.r + r;
        if (d < rr) {
          const nx = d > 1e-5 ? dx / d : 1, nz = d > 1e-5 ? dz / d : 0;
          p.x = s.x + nx * rr; p.z = s.z + nz * rr;
          hit = { shape: s, nx, nz };
        }
      } else {
        const [lx, lz] = this.local(s, p.x, p.z);
        const cx = Math.max(-s.hx, Math.min(s.hx, lx)), cz = Math.max(-s.hz, Math.min(s.hz, lz));
        let dx = lx - cx, dz = lz - cz;
        let d = Math.hypot(dx, dz);
        if (d < r) {
          let nlx, nlz, push;
          if (d < 1e-5) {
            // centre inside: push to nearest face
            const fx = s.hx - Math.abs(lx), fz = s.hz - Math.abs(lz);
            if (fx < fz) { nlx = Math.sign(lx) || 1; nlz = 0; push = fx + r; } else { nlx = 0; nlz = Math.sign(lz) || 1; push = fz + r; }
          } else { nlx = dx / d; nlz = dz / d; push = r - d; }
          const [wx, wz] = this.toWorldDir(s, nlx, nlz);
          p.x += wx * push; p.z += wz * push;
          hit = { shape: s, nx: wx, nz: wz };
        }
      }
    }
    return hit;
  }

  ceilingAt(p, h, shapes) {
    let c = Infinity;
    for (const s of shapes) {
      if (!s.solid || s.ignore || s.type === 'cyl') continue;
      const [lx, lz] = this.local(s, p.x, p.z);
      if (Math.abs(lx) > s.hx || Math.abs(lz) > s.hz) continue;
      const bottom = s.y - s.hy;
      if (bottom >= p.y + h * 0.5 && bottom < c) c = bottom;
    }
    return c;
  }

  // Character controller. state: { pos, vel, grounded }. Returns contact info.
  moveCapsule(state, dt, opt = {}) {
    const r = opt.radius ?? 0.28, h = opt.height ?? 1.15, step = opt.step ?? 0.45;
    const p = state.pos, v = state.vel;
    const shapes = this.query(p.x, p.z, r + 4 + Math.hypot(v.x, v.z) * dt, []);
    const travel = Math.hypot(v.x, v.z) * dt;
    const n = Math.max(1, Math.ceil(travel / (r * 0.5)));
    let grounded = false, wallHit = null, groundY = -Infinity;
    const wasGrounded = state.grounded;
    for (let i = 0; i < n; i++) {
      p.x += (v.x * dt) / n; p.z += (v.z * dt) / n;
      const hit = this.resolve(p, r, h, step, shapes);
      if (hit) wallHit = hit;
      p.y += (v.y * dt) / n;
      const g = this.groundAt(p.x, p.z, p.y, step, r, shapes);
      groundY = g;
      if (p.y <= g + 0.002 && v.y <= 0.01) { p.y = g; if (v.y < 0) state.impact = -v.y; v.y = 0; grounded = true; }
      const c = this.ceilingAt(p, h, shapes);
      if (p.y + h > c && v.y > 0) { p.y = c - h; v.y = 0; }
    }
    // stick to the ground when walking down slopes/steps
    if (!grounded && wasGrounded && v.y <= 0 && !opt.noSnap) {
      const g = this.groundAt(p.x, p.z, p.y, step, r, shapes);
      if (p.y - g < 0.4) { p.y = g; grounded = true; groundY = g; }
    }
    // terrain too steep: slide
    if (grounded && opt.slide !== false) {
      const sl = this.s.slopeAt(p.x, p.z);
      const tg = this.s.heightAt(p.x, p.z);
      if (sl > 1.3 && Math.abs(p.y - tg) < 0.05) {
        const nrm = this.s.normalAt(p.x, p.z, _n);
        v.x += nrm.x * 18 * dt; v.z += nrm.z * 18 * dt;
        state.sliding = true;
      } else state.sliding = false;
    }
    state.grounded = grounded;
    return { grounded, wallHit, groundY };
  }

  // Simple 2D circle push for creatures (no stepping onto boxes, they wade through small stuff)
  pushCircle(p, r, y0, y1, opt = {}) {
    const shapes = this.query(p.x, p.z, r + 2, this._tmp);
    let hit = null;
    for (const s of shapes) {
      if (!s.solid || s.ignore) continue;
      if (opt.skipSmall && s.kind === 'small') continue;
      const sy0 = s.type === 'cyl' ? s.y0 : s.y - s.hy, sy1 = s.type === 'cyl' ? s.y1 : s.y + s.hy;
      if (y1 <= sy0 || y0 + (opt.step ?? 0.5) >= sy1) continue;
      const before = { x: p.x, z: p.z };
      const one = [s];
      if (this.resolve(p, r, y1 - y0, opt.step ?? 0.5, one)) { hit = s; if (opt.onHit) opt.onHit(s, before); }
    }
    return hit;
  }

  // Raycast against terrain + shapes. Returns { t, point, normal, shape } or null.
  raycast(origin, dir, maxDist, opt = {}) {
    let best = null;
    // shapes along the ray (sample cells along the segment)
    const steps = Math.ceil(maxDist / CELL) + 1;
    const seen = new Set();
    const cand = [];
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * maxDist;
      const x = origin.x + dir.x * t, z = origin.z + dir.z * t;
      this.query(x, z, 2, this._tmp);
      for (const s of this._tmp) if (!seen.has(s)) { seen.add(s); cand.push(s); }
    }
    for (const s of cand) {
      if (s.ignore || (opt.filter && !opt.filter(s))) continue;
      const hit = s.type === 'cyl' ? rayCyl(origin, dir, s) : rayBox(origin, dir, s, this);
      if (hit && hit.t >= 0 && hit.t <= maxDist && (!best || hit.t < best.t)) best = { ...hit, shape: s };
    }
    if (opt.terrain !== false) {
      const lim = best ? best.t : maxDist;
      const tt = this.rayTerrain(origin, dir, lim);
      if (tt !== null && (!best || tt < best.t)) {
        const point = new THREE.Vector3().copy(origin).addScaledVector(dir, tt);
        best = { t: tt, point, normal: this.s.normalAt(point.x, point.z, new THREE.Vector3()), shape: null, terrain: true };
      }
    }
    if (best && !best.point) best.point = new THREE.Vector3().copy(origin).addScaledVector(dir, best.t);
    return best;
  }

  rayTerrain(o, d, maxDist) {
    const h = this.s.heightAt;
    let t = 0, prevT = 0;
    let stepLen = 0.35;
    let above = o.y - h(o.x, o.z);
    if (above < 0) return 0;
    while (t < maxDist) {
      prevT = t;
      t = Math.min(maxDist, t + stepLen);
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const a = y - h(x, z);
      if (a < 0) {
        let lo = prevT, hi = t;
        for (let i = 0; i < 10; i++) {
          const m = (lo + hi) / 2;
          const mm = o.y + d.y * m - h(o.x + d.x * m, o.z + d.z * m);
          if (mm < 0) hi = m; else lo = m;
        }
        return (lo + hi) / 2;
      }
      stepLen = Math.max(0.25, Math.min(4, a * 0.5));
      above = a;
    }
    return null;
  }
}
const _n = new THREE.Vector3();

function rayCyl(o, d, s) {
  const ox = o.x - s.x, oz = o.z - s.z;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-8) return null;
  const b = 2 * (ox * d.x + oz * d.z), c = ox * ox + oz * oz - s.r * s.r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  if (t < 0) return null;
  const y = o.y + d.y * t;
  if (y < s.y0 || y > s.y1) return null;
  const px = o.x + d.x * t, pz = o.z + d.z * t;
  const nx = (px - s.x) / s.r, nz = (pz - s.z) / s.r;
  return { t, normal: new THREE.Vector3(nx, 0, nz) };
}

function rayBox(o, d, s, w) {
  const [lox, loz] = w.local(s, o.x, o.z);
  const ldx = d.x * s.cos - d.z * s.sin, ldz = d.x * s.sin + d.z * s.cos;
  let hy0, hy1;
  if (s.type === 'ramp') { hy0 = s.y + Math.min(s.h0, s.h1) - s.hy; hy1 = s.y + Math.max(s.h0, s.h1); }
  else { hy0 = s.y - s.hy; hy1 = s.y + s.hy; }
  const oy = o.y, dy = d.y;
  let tmin = -Infinity, tmax = Infinity, nAxis = 0, nSign = 0;
  const slab = (oo, dd, lo, hi, axis) => {
    if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) { tmin = Infinity; } return; }
    let t1 = (lo - oo) / dd, t2 = (hi - oo) / dd, sg = -1;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; sg = 1; }
    if (t1 > tmin) { tmin = t1; nAxis = axis; nSign = sg; }
    if (t2 < tmax) tmax = t2;
  };
  slab(lox, ldx, -s.hx, s.hx, 0);
  slab(oy, dy, hy0, hy1, 1);
  slab(loz, ldz, -s.hz, s.hz, 2);
  if (tmin > tmax || tmax < 0 || tmin === Infinity) return null;
  const t = Math.max(0, tmin);
  let n;
  if (nAxis === 1) n = new THREE.Vector3(0, nSign, 0);
  else {
    const lx = nAxis === 0 ? nSign : 0, lz = nAxis === 2 ? nSign : 0;
    const [wx, wz] = w.toWorldDir(s, lx, lz);
    n = new THREE.Vector3(wx, 0, wz);
  }
  return { t, normal: n };
}
