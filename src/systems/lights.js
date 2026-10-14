// Light pool: a fixed set of point lights (so shaders never recompile) that
// are handed to the closest / brightest active light sources each frame:
// campfires, torches, lamps, the van's bulb, held torches...
import * as THREE from 'three';

export class LightPool {
  constructor(scene, n = 6) {
    this.name = 'lightpool';
    this.lights = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      scene.add(l);
      this.lights.push({ l, src: null, cur: 0 });
    }
    this.sources = new Set();
    this.t = 0;
  }
  // src: { pos: Vector3, color, intensity, range, flicker (0..1), on: bool, priority }
  add(src) { src.on = src.on ?? true; this.sources.add(src); return src; }
  remove(src) { this.sources.delete(src); }
  update(dt, cam) {
    this.t += dt;
    const list = [];
    for (const s of this.sources) {
      if (!s.on || s.intensity <= 0) continue;
      const d = s.pos.distanceToSquared(cam);
      if (d > 140 * 140) continue;
      list.push([d / (s.priority ?? 1) / Math.max(0.2, s.intensity), s]);
    }
    list.sort((a, b) => a[0] - b[0]);
    const want = new Set(list.slice(0, this.lights.length).map((x) => x[1]));
    // keep existing assignments stable, fill free slots
    for (const L of this.lights) if (L.src && !want.has(L.src)) L.src = null;
    for (const s of want) {
      if (this.lights.some((L) => L.src === s)) continue;
      const free = this.lights.find((L) => !L.src);
      if (free) { free.src = s; free.cur = 0; }
    }
    for (const L of this.lights) {
      const s = L.src;
      if (!s) { L.cur = Math.max(0, L.cur - dt * 8); L.l.intensity = L.cur; continue; }
      let target = s.intensity;
      if (s.flicker) target *= 1 - s.flicker * (0.5 + 0.5 * Math.sin(this.t * 13.7 + s.pos.x) * Math.sin(this.t * 7.3 + s.pos.z)) * 0.5;
      L.cur += (target - L.cur) * Math.min(1, dt * 10);
      L.l.intensity = L.cur;
      L.l.position.copy(s.pos);
      L.l.color.set(s.color ?? 0xffd8a0);
      L.l.distance = s.range ?? 10;
    }
  }
}
