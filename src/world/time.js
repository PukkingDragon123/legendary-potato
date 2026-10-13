// In-game clock + weather state machine (clear / cloudy / rain / storm / fog),
// with rain particles, lightning and wind gusts.
import * as THREE from 'three';
import { G } from '../gfx/shaderlib.js';
import { RNG } from '../core/rng.js';

export class GameTime {
  constructor(opt = {}) {
    this.dayLength = opt.dayLength ?? 1200; // real seconds per in-game day (20 min)
    this.elapsed = opt.elapsed ?? 0; // total game seconds
    this.startTod = opt.tod ?? 0.31; // start a bit after sunrise
    this.scale = 1;
    this.paused = false;
  }
  get tod() { return ((this.startTod + this.elapsed / this.dayLength) % 1 + 1) % 1; }
  get day() { return Math.floor(this.startTod + this.elapsed / this.dayLength) + 1; }
  get isNight() { const t = this.tod; return t < 0.235 || t > 0.79; }
  get hour() { return this.tod * 24; }
  clock() { const h = this.hour; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60); const ap = hh >= 12 ? 'PM' : 'AM'; return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${ap}`; }
  update(dt) { if (!this.paused) this.elapsed += dt * this.scale; }
  // fast-forward until a target time of day (sleeping)
  skipTo(tod) { const cur = this.tod; let d = tod - cur; if (d < 0) d += 1; this.elapsed += d * this.dayLength; }
}

const KINDS = {
  clear: { cover: 0.12, rain: 0, storm: 0, fog: 0, wind: 0.7, dur: [300, 700] },
  cloudy: { cover: 0.55, rain: 0, storm: 0, fog: 0.05, wind: 1.0, dur: [200, 500] },
  rain: { cover: 0.85, rain: 0.7, storm: 0.15, fog: 0.12, wind: 1.4, dur: [150, 350] },
  storm: { cover: 1.0, rain: 1.0, storm: 1.0, fog: 0.1, wind: 2.4, dur: [100, 240] },
  fog: { cover: 0.4, rain: 0, storm: 0, fog: 0.55, wind: 0.3, dur: [120, 300] },
};

export class Weather {
  constructor(game, seed = 'weather') {
    this.game = game;
    this.rng = new RNG(seed);
    this.kind = 'clear';
    this.cur = { cover: 0.12, rain: 0, storm: 0, fog: 0, wind: 0.7 };
    this.target = { ...KINDS.clear };
    this.timer = 400;
    this.windDir = new THREE.Vector2(1, 0.3).normalize();
    this.flash = 0;
    this.nextBolt = 5;
    this.forced = null;
    this.buildRain();
  }
  set(kind, duration) {
    this.kind = kind;
    this.target = { ...KINDS[kind] };
    this.timer = duration ?? this.rng.range(...KINDS[kind].dur);
    this.game.events.emit('weather', kind);
  }
  buildRain() {
    const n = 2600;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 6);
    this.rainSeeds = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { this.rainSeeds[i * 3] = Math.random(); this.rainSeeds[i * 3 + 1] = Math.random(); this.rainSeeds[i * 3 + 2] = Math.random(); }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ color: 0xc8d8e8, transparent: true, opacity: 0.0, depthWrite: false, fog: false });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rainN = n;
    this.game.engine.scene.add(this.rain);
  }
  update(dt) {
    const g = this.game;
    this.timer -= dt;
    if (this.timer <= 0 && !this.forced) {
      const r = this.rng.next();
      const prev = this.kind;
      let k = r < 0.42 ? 'clear' : r < 0.67 ? 'cloudy' : r < 0.84 ? 'rain' : r < 0.92 ? 'storm' : 'fog';
      if (prev === 'storm' && k === 'storm') k = 'rain';
      this.set(k);
    }
    const lerp = Math.min(1, dt * 0.08);
    for (const key of ['cover', 'rain', 'storm', 'fog', 'wind']) this.cur[key] += (this.target[key] - this.cur[key]) * lerp;
    // wind slowly veers
    const t = G.uTime.value;
    const ang = Math.atan2(this.windDir.y, this.windDir.x) + Math.sin(t * 0.01) * 0.0005;
    this.windDir.set(Math.cos(ang), Math.sin(ang));
    const gust = 0.25 + 0.35 * Math.max(0, Math.sin(t * 0.21) * Math.sin(t * 0.13 + 1)) + this.cur.storm * 0.6;
    G.uWind.value.set(this.windDir.x * this.cur.wind, gust, this.windDir.y * this.cur.wind);
    G.uWetness.value += ((this.cur.rain > 0.2 ? 1 : 0) - G.uWetness.value) * Math.min(1, dt * (this.cur.rain > 0.2 ? 0.05 : 0.01));
    // lightning
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.cur.storm > 0.6) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.nextBolt = 6 + this.rng.next() * 14;
        this.flash = 1;
        const cam = g.engine.camera.position;
        const a = this.rng.next() * Math.PI * 2, d = 60 + this.rng.next() * 400;
        const pos = new THREE.Vector3(cam.x + Math.cos(a) * d, 0, cam.z + Math.sin(a) * d);
        pos.y = g.sampler.heightAt(pos.x, pos.z);
        g.events.emit('lightning', { pos, dist: d });
        setTimeout(() => g.audio?.play('thunder', { vol: Math.max(0.3, 1 - d / 500) }), Math.min(4000, d * 3));
      }
    }
    // rain streaks around the camera
    const cam = g.engine.camera.position;
    const pos = this.rain.geometry.attributes.position.array;
    const R = 26, H = 22;
    const fall = t * 24;
    const wx = G.uWind.value.x * 0.25, wz = G.uWind.value.z * 0.25;
    const active = Math.floor(this.rainN * Math.min(1, this.cur.rain * 1.1));
    const inside = g.isCameraSheltered?.() ?? false;
    for (let i = 0; i < this.rainN; i++) {
      const k = i * 6;
      if (i >= active || inside) { pos[k] = pos[k + 3] = 0; pos[k + 1] = pos[k + 4] = -9999; pos[k + 2] = pos[k + 5] = 0; continue; }
      const sx = this.rainSeeds[i * 3], sy = this.rainSeeds[i * 3 + 1], sz = this.rainSeeds[i * 3 + 2];
      const x = cam.x + (sx - 0.5) * R * 2, z = cam.z + (sz - 0.5) * R * 2;
      let y = cam.y + H * 0.5 - ((sy * H + fall) % H);
      const len = 0.55;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      pos[k + 3] = x - wx * len; pos[k + 4] = y - len; pos[k + 5] = z - wz * len;
    }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rain.material.opacity = Math.min(0.55, this.cur.rain * 0.7);
    return this.cur;
  }
  state() { return { cover: this.cur.cover, storm: this.cur.storm, fog: this.cur.fog, rain: this.cur.rain }; }
}
