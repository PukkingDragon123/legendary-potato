// The dinosaur ecosystem: biome-driven herd/pack spawning around players,
// perception (sight, noise, stealth), herding + stampedes, grazing,
// drinking, sleep cycles, territorial charges, predators that stalk, hunt
// and fear fire, thieves that steal, combat, torpor + knock-outs, corpses,
// nests with eggs, and host-authoritative networking + saving.
import * as THREE from 'three';
import { SPECIES, DINO_NAMES, PERSONALITIES, BIOME_KEYS } from './dinoSpecies.js';
import { buildDino, DinoRig } from './dinoModel.js';
import { RNG, hash2i } from '../core/rng.js';
import { ITEMS } from '../data/items.js';
import { G } from '../gfx/shaderlib.js';

const CELL = 72, SPAWN_R = 190, DESPAWN_R = 290, MAX_WILD = 34;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3();
let _id = 1;
const angleTo = (a, b) => { let d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };

export class Dino {
  constructor(mgr, sp, opt = {}) {
    this.mgr = mgr; this.g = mgr.g;
    this.id = opt.id ?? (this.g.local.id + ':d' + _id++);
    this.sp = sp;
    this.baby = opt.baby ?? false;
    this.growth = opt.growth ?? (this.baby ? 0 : 1);
    this.rig = buildDino(sp, { baby: this.baby && this.growth < 0.5 });
    this.anim = new DinoRig(this.rig, sp);
    this.root = this.rig.root;
    mgr.group.add(this.root);
    this.pos = new THREE.Vector3(opt.x ?? 0, opt.y ?? 0, opt.z ?? 0);
    this.yaw = opt.yaw ?? Math.random() * 6.28;
    this.speed = 0; this.wantSpeed = 0; this.wantYaw = this.yaw;
    this.vy = 0; this.alt = 0;
    const st = sp.stats;
    this.maxHp = st.hp * (this.baby ? 0.4 + this.growth * 0.6 : 1); this.hp = opt.hp ?? this.maxHp;
    this.maxTorpor = st.hp * 0.6; this.torpor = 0;
    this.food = opt.food ?? 60 + Math.random() * 30; this.energy = 70 + Math.random() * 30;
    this.state = 'wander'; this.stateT = 0; this.think = Math.random() * 0.5;
    this.target = null; this.goal = null; this.home = opt.home ?? this.pos.clone();
    this.herd = opt.herd ?? null; this.alert = 0; this.mood = null;
    this.action = null;
    this.tamed = !!opt.tamed; this.owner = opt.owner ?? null; this.name = opt.name ?? null;
    this.personality = opt.personality ?? null; this.order = opt.order ?? 'follow';
    this.happy = opt.happy ?? 70; this.level = opt.level ?? 1; this.xp = opt.xp ?? 0;
    this.tame = { progress: 0, by: null, lastFed: 0 };
    this.saddle = opt.saddle ?? null; this.riders = [];
    this.carry = null; // stolen item / job cargo
    this.cell = opt.cell ?? null;
    this.radius = Math.max(0.25, this.rig.br * 1.05);
    this.lastHitBy = null; this.koT = 0;
    this.lod = 0; this.animSkip = 0;
    this.applyScale();
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
  }
  get displayName() { return this.name ?? this.sp.short; }
  applyScale() { const s = this.baby ? 0.35 + this.growth * 0.65 : 1; this.root.scale.setScalar(this.baby && this.growth < 0.5 ? s / 1 : s); this.sizeK = s; }
  setState(s, t = 0) { if (this.state !== s) { this.state = s; this.stateT = t; } }
  act(name, dur, onImpact, impactAt = 0.5) { if (this.action && this.action.lock) return false; this.action = { name, t: 0, dur, onImpact, impactAt, done: false }; return true; }

  dist2(p) { return (p.x - this.pos.x) ** 2 + (p.z - this.pos.z) ** 2; }
  isAsleep() { return this.state === 'sleep' || this.state === 'ko'; }
  isHostile() { return !this.tamed && (this.sp.predator || this.state === 'charge' || this.state === 'attack'); }
}

export class Dinos {
  constructor(game) {
    this.name = 'dinos';
    this.g = game;
    this.list = new Map();
    this.group = new THREE.Group(); this.group.name = 'dinos';
    game.engine.scene.add(this.group);
    this.cells = new Map(); // key -> { until, spawned }
    this.scanT = 0; this.netT = 0;
    this.corpses = [];
    this.nests = [];
    this.species = SPECIES;
    game.dinos = this;
    this.setupNests();
  }

  // ======================================================================== spawning
  spawn(sp, x, z, opt = {}) {
    const y = this.g.sampler.heightAt(x, z);
    const d = new Dino(this, typeof sp === 'string' ? SPECIES[sp] : sp, { ...opt, x, y, z });
    this.list.set(d.id, d);
    if (!d.name && d.tamed) d.name = this.randomName();
    return d;
  }
  despawn(d) { d.root.removeFromParent(); this.list.delete(d.id); for (const r of d.riders) r.sitting = null; }
  randomName() { return DINO_NAMES[Math.floor(Math.random() * DINO_NAMES.length)]; }
  cellPlan(ci, cj) {
    // deterministic group for a world cell
    const g = this.g, w = g.world;
    const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
    if (Math.abs(cx) > w.half - 40 || Math.abs(cz) > w.half - 40) return null;
    const r = new RNG(hash2i(ci + 1000, cj + 1000) ^ 0x5eed);
    if (!r.chance(0.42)) return null;
    const x = cx + r.range(-CELL * 0.35, CELL * 0.35), z = cz + r.range(-CELL * 0.35, CELL * 0.35);
    const h = g.sampler.heightAt(x, z), wl = g.sampler.waterAt(x, z);
    const biome = BIOME_KEYS[g.sampler.biomeAt(x, z)];
    if (!biome) return null;
    // near the crash site: keep the first hours gentle (no big predators)
    const crash = g.crash, dc = Math.hypot(x - crash.x, z - crash.z);
    const opts = [];
    for (const sp of Object.values(SPECIES)) {
      let wgt = sp.biomes[biome] ?? 0;
      if (!wgt) continue;
      if (dc < 160 && (sp.predator && sp.size > 3 || sp.boss || sp.size > 8)) wgt *= 0.05;
      if (dc < 90 && sp.predator) wgt *= 0.15;
      if (sp.behaviour.swimmer && !(wl > h)) wgt *= 0.1;
      if (!sp.behaviour.swimmer && wl > h + 0.5) wgt = 0;
      opts.push([sp, wgt]);
    }
    // special places
    for (const p of g.world.pois) {
      const dp = Math.hypot(x - p.x, z - p.z);
      if (dp > p.radius + 60) continue;
      if (p.id === 'rexnest') opts.push([SPECIES.rex, 4]);
      if (p.id === 'raptorden') opts.push([SPECIES.raptor, 5]);
      if (p.id === 'ptera') opts.push([SPECIES.ptera, 5]);
      if (p.id === 'tarpits') opts.push([SPECIES.ankylo, 1]);
      if (p.id === 'grove') opts.push([SPECIES.brachio, 2.5]);
    }
    if (!opts.length) return null;
    const tot = opts.reduce((a, b) => a + b[1], 0);
    let k = r.next() * tot, sp = opts[0][0];
    for (const [s, wv] of opts) { k -= wv; if (k <= 0) { sp = s; break; } }
    const B = sp.behaviour;
    const [n0, n1] = B.herd ?? B.pack ?? [1, 1];
    return { sp, x, z, n: r.int(n0, n1), key: ci + ',' + cj };
  }
  population(dt) {
    const g = this.g;
    if (!g.isHost) return;
    this.scanT -= dt;
    if (this.scanT > 0) return;
    this.scanT = 2;
    const players = [...g.players.values()];
    const now = g.time.elapsed;
    // despawn far wild dinos
    for (const d of [...this.list.values()]) {
      if (d.tamed || d.state === 'ko' && d.tame.progress > 0) continue;
      let near = Infinity; for (const p of players) near = Math.min(near, d.dist2(p.pos));
      if (near > DESPAWN_R * DESPAWN_R) { const c = this.cells.get(d.cell); if (c) c.spawned = Math.max(0, c.spawned - 1); this.despawn(d); }
    }
    let wild = [...this.list.values()].filter((d) => !d.tamed).length;
    if (wild >= MAX_WILD) return;
    // spawn cells around players (nearest first)
    const cand = [];
    for (const p of players) {
      const ci0 = Math.floor(p.pos.x / CELL), cj0 = Math.floor(p.pos.z / CELL);
      const R = Math.ceil(SPAWN_R / CELL);
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        const ci = ci0 + i, cj = cj0 + j, key = ci + ',' + cj;
        const cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
        const dd = Math.hypot(cx - p.pos.x, cz - p.pos.z);
        if (dd > SPAWN_R || dd < 55) continue;
        const c = this.cells.get(key);
        if (c && (c.spawned > 0 || c.until > now)) continue;
        cand.push([dd, ci, cj, key]);
      }
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, ci, cj, key] of cand) {
      if (wild >= MAX_WILD) break;
      const plan = this.cellPlan(ci, cj);
      const c = this.cells.get(key) ?? { until: 0, spawned: 0 };
      this.cells.set(key, c);
      if (!plan) { c.until = now + 1e9; continue; }
      // nocturnal packs only show up at dusk
      if (plan.sp.behaviour.nocturnal && !g.time.isNight && Math.random() < 0.6) { c.until = now + 120; continue; }
      const herd = { id: key, leader: null, members: [], sp: plan.sp, home: new THREE.Vector3(plan.x, 0, plan.z), alarm: 0 };
      for (let k = 0; k < plan.n; k++) {
        const a = (k / plan.n) * 6.28, rr = plan.sp.size * 0.8 * Math.sqrt(k);
        const d = this.spawn(plan.sp, plan.x + Math.cos(a) * rr, plan.z + Math.sin(a) * rr, { herd, cell: key, home: herd.home });
        if (Math.random() < 0.15 && !plan.sp.boss && plan.n > 2) { d.baby = true; d.growth = 0.3 + Math.random() * 0.4; d.applyScale(); }
        herd.members.push(d);
        if (!herd.leader) herd.leader = d;
        wild++;
      }
      c.spawned = plan.n;
    }
  }

  // ======================================================================== perception helpers
  stealth(p) {
    const g = this.g;
    let k = 1;
    if (p.crouch) k *= 0.5;
    if (p.sprint) k *= 1.45;
    if (g.time.isNight) k *= 0.75;
    if (p.sitting?.van) k *= 0.45;
    if (p.sitting?.dino) k *= 0.6;
    return k;
  }
  nearestPlayer(d, maxR) {
    let best = null, bd = maxR * maxR;
    for (const p of this.g.players.values()) {
      if (p.downed && !d.sp.predator) continue;
      const dd = d.dist2(p.pos);
      if (dd < bd) { bd = dd; best = p; }
    }
    return best ? { p: best, d: Math.sqrt(bd) } : null;
  }
  scared(d) {
    // fire / lamps / torches in hand keep predators away
    const g = this.g;
    if (!d.sp.predator || d.sp.behaviour.boss) return null;
    const src = g.scareSources?.(d.pos, 18) ?? [];
    if (src.length) return src[0];
    for (const p of g.players.values()) {
      const held = p.heldId ? ITEMS[p.heldId] : null;
      if (held?.tool?.kind === 'torch' && d.dist2(p.pos) < 64) return p;
    }
    if (g.van && g.van.s.sw[0] && g.van.s.upgrades.floodlights && g.time.isNight && d.dist2(g.van.pos) < 28 * 28) return { x: g.van.pos.x, z: g.van.pos.z };
    return null;
  }
  noise(pos, r, loud = 1) {
    // gunshots, horns, roars, falling trees: wake + alarm dinos
    for (const d of this.list.values()) {
      if (d.tamed || d.state === 'ko') continue;
      const dd = d.dist2(pos);
      if (dd > r * r) continue;
      if (d.state === 'sleep' && loud > 0.6) d.setState('wander');
      d.alert = Math.min(1, d.alert + loud * 0.6);
      if (!d.sp.predator && (d.sp.behaviour.skittish || loud > 0.8)) this.flee(d, pos, 6 + loud * 4);
    }
  }
  flee(d, from, t = 6) {
    if (d.tamed || d.state === 'ko' || d.state === 'dead') return;
    d.setState('flee', t);
    d.fleeFrom = new THREE.Vector3(from.x, 0, from.z);
    if (d.herd && !d.herd.alarm) { d.herd.alarm = 4; for (const m of d.herd.members) if (m !== d && m.state !== 'ko' && m.state !== 'dead') { m.setState('flee', t + Math.random()); m.fleeFrom = d.fleeFrom; } if (d.sp.call) this.g.audio?.play(d.sp.call, { pos: d.pos, vol: 0.9, ref: 12 }); }
  }

  // ======================================================================== AI
  updateAI(d, dt) {
    const g = this.g, sp = d.sp, B = sp.behaviour, st = sp.stats;
    d.stateT -= dt;
    d.think -= dt;
    d.alert = Math.max(0, d.alert - dt * 0.15);
    d.food = Math.max(0, d.food - dt * 0.02);
    if (d.herd?.alarm) d.herd.alarm = Math.max(0, d.herd.alarm - dt);
    if (d.state === 'dead') { d.wantSpeed = 0; return; }
    // torpor + knockouts
    if (d.torpor > 0 && d.state !== 'ko') d.torpor = Math.max(0, d.torpor - dt * d.maxTorpor * 0.02);
    if (d.state === 'ko') {
      d.wantSpeed = 0;
      d.torpor = Math.max(0, d.torpor - dt * d.maxTorpor * 0.006);
      d.koT += dt;
      if (Math.random() < dt * 0.8) g.fx.zzz(_v.copy(d.pos).add(new THREE.Vector3(0, d.rig.height * d.sizeK * 0.8, 0)));
      if (d.torpor < d.maxTorpor * 0.08 && d.koT > 6) { d.setState(d.tamed ? 'follow' : B.predator ? 'hunt' : 'flee', 6); d.koT = 0; d.tame.progress *= 0.5; if (!d.tamed) { d.alert = 1; if (!B.predator) this.flee(d, g.local.pos, 8); } g.audio?.play(sp.call ?? 'grunt', { pos: d.pos, vol: 0.9 }); }
      return;
    }
    if (d.tamed) { this.g.taming?.updateTamed(d, dt); return; }
    // ---- thinking (perception) at ~4 Hz
    if (d.think <= 0) {
      d.think = 0.25 + Math.random() * 0.15;
      const sight = (B.sight ?? 20) * (d.state === 'sleep' ? 0.35 : 1);
      const pl = this.nearestPlayer(d, sight * 1.5);
      const scare = this.scared(d);
      const night = g.time.isNight;
      if (pl) {
        const k = this.stealth(pl.p);
        const detected = pl.d < sight * k;
        d.seen = detected ? pl.p : null;
        if (detected) d.alert = Math.min(1, d.alert + 0.35);
      } else d.seen = null;
      // sleep schedule
      const sleepy = B.nocturnal ? !night : night;
      if (sleepy && !d.seen && d.state === 'wander' && Math.random() < 0.04 && !B.flyer) d.setState('sleep', 60 + Math.random() * 120);
      if (d.state === 'sleep' && (!sleepy || d.stateT <= 0 || (d.seen && d.dist2(d.seen.pos) < 16))) { d.setState('wander'); d.act('shake', 0.8); }
      // behaviour selection
      if (d.state !== 'sleep' && d.state !== 'flee') {
        if (B.predator) {
          if (scare && d.state !== 'flee') { const s = scare.pos ?? scare; this.flee(d, s, 3); d.mood = 'angry'; }
          else if (d.seen && (d.food < 85 || B.boss || d.dist2(d.seen.pos) < 100)) {
            if (d.state !== 'chase' && d.state !== 'attack') { d.setState('stalk', 4 + Math.random() * 4); if (B.boss || sp.stats.roar) { d.act('roar', 1.6); g.audio?.play('roar', { pos: d.pos, vol: 1.3, ref: 25 }); g.rig.addTrauma(0.25 * Math.max(0, 1 - d.pos.distanceTo(g.local.pos) / 40)); this.noise(d.pos, 60, 0.7); } else g.audio?.play(sp.call ?? 'growl', { pos: d.pos, vol: 0.9 }); }
            d.target = d.seen;
          } else if (d.food < 40 && Math.random() < 0.05) {
            // hunt the nearest smaller wild herbivore
            let prey = null, pd = 50 * 50;
            for (const o of this.list.values()) if (o !== d && !o.sp.predator && !o.tamed && o.state !== 'dead' && o.sp.size < sp.size * 1.3) { const dd = d.dist2(o.pos); if (dd < pd) { pd = dd; prey = o; } }
            if (prey) { d.target = prey; d.setState('stalk', 8); }
          }
        } else if (d.seen) {
          const dd = Math.sqrt(d.dist2(d.seen.pos));
          if (B.territorial && dd < B.territorial && !d.seen.sitting?.van) {
            if (d.state !== 'charge' && d.state !== 'warn') { d.setState('warn', 2.2); d.target = d.seen; d.act(sp.call === 'bellow' ? 'roar' : 'call', 1.2); g.audio?.play(sp.call ?? 'bellow', { pos: d.pos, vol: 1 }); d.mood = 'angry'; }
          } else if (B.thief) {
            if (d.state !== 'steal' && d.state !== 'flee') { d.setState('steal', 12); d.target = d.seen; }
          } else if (B.skittish && dd < (B.sight ?? 20) * 0.75 * this.stealth(d.seen)) this.flee(d, d.seen.pos, 6);
          else if (!B.gentle && dd < 6 && d.seen.sprint) this.flee(d, d.seen.pos, 4);
          else if (d.state === 'wander' && Math.random() < 0.2) { d.lookAtP = d.seen; d.setState('watch', 2 + Math.random() * 2); }
        }
      }
      // thirst / grazing ambience
      if (d.state === 'wander' && Math.random() < 0.02) {
        if (!B.predator && Math.random() < 0.6) d.setState('graze', 4 + Math.random() * 6);
        else { const w = this.findWater(d); if (w) { d.goal = w; d.setState('drink', 25); } }
      }
    }
    // ---- execute state
    let speed = 0, yaw = d.yaw;
    const toward = (p, k = 1) => { yaw = Math.atan2(-(p.x - d.pos.x), -(p.z - d.pos.z)); speed = k; };
    const away = (p, k = 1) => { yaw = Math.atan2(-(d.pos.x - p.x), -(d.pos.z - p.z)); speed = k; };
    switch (d.state) {
      case 'wander': {
        // herd cohesion around the leader, else meander near home
        if (!d.goal || d.dist2(d.goal) < 4 || Math.random() < dt * 0.05) {
          const base = d.herd?.leader && d.herd.leader !== d && d.herd.leader.state !== 'dead' ? d.herd.leader.pos : d.home;
          const r = d.herd?.leader === d ? 30 : 8 + sp.size;
          const a = Math.random() * 6.28;
          d.goal = new THREE.Vector3(base.x + Math.cos(a) * r * Math.random(), 0, base.z + Math.sin(a) * r * Math.random());
          if (Math.random() < 0.35) { d.setState('idle', 2 + Math.random() * 5); }
        }
        if (d.goal) toward(d.goal, st.speed * (B.flyer ? 1.2 : 0.75));
        if (d.dist2(d.goal) < 9) speed *= 0.4;
        break;
      }
      case 'idle': speed = 0; if (d.stateT <= 0) d.setState('wander'); if (Math.random() < dt * 0.3 && !d.action) d.act(Math.random() < 0.5 ? 'sniff' : 'shake', 1.2); break;
      case 'watch': speed = 0; if (d.lookAtP) yaw = d.yaw + angleTo(d.yaw, Math.atan2(-(d.lookAtP.pos.x - d.pos.x), -(d.lookAtP.pos.z - d.pos.z))) * 0.3; if (d.stateT <= 0) d.setState('wander'); break;
      case 'graze': speed = 0; if (!d.action) d.act('eat', 2.2); d.food = Math.min(100, d.food + dt * 1.5); if (d.stateT <= 0) d.setState('wander'); break;
      case 'drink': {
        if (d.goal && d.dist2(d.goal) > 4) toward(d.goal, st.speed * 0.8);
        else { speed = 0; if (!d.action) d.act('drink', 2.5); if (Math.random() < dt * 0.6) g.fx.splash(d.pos.x - Math.sin(d.yaw) * d.rig.len * 0.3, d.goal?.y ?? d.pos.y, d.pos.z - Math.cos(d.yaw) * d.rig.len * 0.3, 0.3); }
        if (d.stateT <= 0) d.setState('wander');
        break;
      }
      case 'sleep': speed = 0; break;
      case 'flee': {
        const from = d.fleeFrom ?? g.local.pos;
        away(from, st.run * (d.sp.size > 8 ? 0.8 : 1));
        // stampede: big herds trample through
        if (d.stateT <= 0 || d.dist2(from) > 80 * 80) { d.setState('wander'); d.fleeFrom = null; d.goal = null; }
        break;
      }
      case 'warn': {
        speed = 0;
        if (d.target) yaw = Math.atan2(-(d.target.pos.x - d.pos.x), -(d.target.pos.z - d.pos.z));
        if (Math.random() < dt * 1.2) { g.fx.dust(_v.copy(d.pos), 2, 0xb8a080, d.sp.size * 0.15); }
        if (d.stateT <= 0) {
          const dd = d.target ? Math.sqrt(d.dist2(d.target.pos)) : 99;
          if (dd < (B.territorial ?? 10) * 0.8) { d.setState('charge', 4); g.audio?.play(sp.call ?? 'bellow', { pos: d.pos, vol: 1.1 }); }
          else { d.setState('wander'); d.mood = null; }
        }
        break;
      }
      case 'charge': {
        if (!d.target || d.target.downed) { d.setState('wander'); break; }
        toward(d.target.pos, st.run);
        const dd = Math.sqrt(d.dist2(d.target.pos));
        if (dd < d.radius + 1.4) { this.melee(d, d.target, B.tailWhip ? 'tailwhip' : sp.stats.charge ? 'headbutt' : 'bite'); d.setState('backoff', 2.5); }
        if (d.stateT <= 0) d.setState('backoff', 2);
        break;
      }
      case 'backoff': if (d.target) away(d.target.pos, st.speed); if (d.stateT <= 0) { d.setState('wander'); d.mood = null; } break;
      case 'stalk': case 'hunt': {
        const T = d.target;
        if (!T || T.state === 'dead' || T.downed && !(T instanceof Dino)) { d.setState('wander'); d.target = null; break; }
        const tp = T.pos;
        const dd = Math.sqrt(d.dist2(tp));
        // pack flanking: offset the approach angle per member
        const off = d.herd ? (d.herd.members.indexOf(d) - (d.herd.members.length - 1) / 2) * 0.6 : 0;
        const ang = Math.atan2(-(tp.x - d.pos.x), -(tp.z - d.pos.z)) + (dd > 8 ? off : 0);
        yaw = ang; speed = dd > 16 ? st.speed * 1.1 : st.run;
        if (d.state === 'stalk' && dd < 18) d.setState('chase', 10);
        if (dd > (B.sight ?? 30) * 2.2 || (B.boss && d.home && d.dist2(d.home) > 140 * 140)) { d.setState('wander'); d.target = null; }
        break;
      }
      case 'chase': {
        const T = d.target;
        if (!T || T.state === 'dead' || (T.downed && !(T instanceof Dino))) { d.setState('wander'); d.target = null; break; }
        toward(T.pos, st.run * (T.sitting?.van ? 0.9 : 1));
        const dd = Math.sqrt(d.dist2(T.pos));
        const reach = d.radius + (T instanceof Dino ? T.radius : 0.4) + 0.8 * d.sizeK;
        if (dd < reach && !d.action) { this.melee(d, T, sp.stats.spit && dd > 2 ? 'spit' : 'bite'); }
        if (sp.stats.spit && dd < 9 && dd > 4 && !d.action && Math.random() < dt * 0.6) this.melee(d, T, 'spit');
        if (d.stateT <= 0 && dd > 12) d.setState('stalk', 5);
        if (B.boss && d.home && d.dist2(d.home) > 160 * 160) { d.setState('wander'); d.goal = d.home.clone(); d.target = null; }
        break;
      }
      case 'eatcorpse': speed = 0; if (!d.action) d.act('eat', 2); d.food = Math.min(100, d.food + dt * 4); if (d.stateT <= 0 || d.food >= 99) d.setState('wander'); break;
      case 'steal': {
        const T = d.target;
        if (!T) { d.setState('wander'); break; }
        // go for dropped food/shiny items first, else sneak up on the player
        const loot = this.findLoot(d);
        const goalP = loot ? loot.pos : T.pos;
        toward(goalP, d.carry ? 0 : st.run * 0.8);
        const dd = Math.sqrt(d.dist2(goalP));
        if (dd < 1.0 && !d.carry) {
          if (loot) { d.carry = { id: loot.id, n: loot.n }; this.g.drops?.remove(loot.nid); this.g.net?.broadcast?.('dropGone', { nid: loot.nid }); }
          else if (T === g.local) this.stealFromPlayer(d);
          if (d.carry) { g.audio?.play(sp.call ?? 'chirp', { pos: d.pos, vol: 0.8 }); this.flee(d, T.pos, 14); d.mood = 'happy'; }
        }
        if (d.stateT <= 0) d.setState('wander');
        break;
      }
      default: d.setState('wander');
    }
    d.wantYaw = yaw; d.wantSpeed = speed;
  }
  findWater(d) {
    const s = this.g.sampler;
    for (let k = 0; k < 10; k++) { const a = Math.random() * 6.28, r = 10 + Math.random() * 50; const x = d.pos.x + Math.cos(a) * r, z = d.pos.z + Math.sin(a) * r; const wl = s.waterAt(x, z); if (wl > -999 && wl > s.heightAt(x, z) && wl - s.heightAt(x, z) < 0.6) return new THREE.Vector3(x, wl, z); }
    return null;
  }
  findLoot(d) {
    const drops = this.g.drops?.list;
    if (!drops) return null;
    let best = null, bd = 18 * 18;
    for (const l of drops.values()) { const def = ITEMS[l.id]; const want = d.sp.behaviour.shiny ? (def.cat === 'tool' || def.cat === 'special' || l.id === 'amber' || l.id === 'crystal') : def.cat === 'food'; if (!want) continue; const dd = d.dist2(l.pos); if (dd < bd) { bd = dd; best = l; } }
    return best;
  }
  stealFromPlayer(d) {
    const g = this.g, inv = g.inventory;
    const shiny = d.sp.behaviour.shiny;
    // only steal when the player is not looking at the thief
    const f = new THREE.Vector3(); g.engine.camera.getWorldDirection(f);
    const to = d.pos.clone().sub(g.engine.camera.position).normalize();
    if (f.dot(to) > 0.6) { this.flee(d, g.local.pos, 3); return; }
    const idx = inv.slots.findIndex((s, i) => s && i !== inv.selected && (shiny ? ['tool'].includes(ITEMS[s.id].cat) && !['scanner', 'hammer'].includes(s.id) : ITEMS[s.id].cat === 'food'));
    if (idx < 0) return;
    const s = inv.slots[idx];
    const taken = inv.removeAt(idx, shiny ? 1 : Math.min(s.n, 2));
    d.carry = { id: taken.id, n: taken.n, dur: taken.dur };
    g.ui?.toast(`HEY! A ${d.sp.short} stole your ${ITEMS[taken.id].name}!`, 'warn', taken.id);
    g.events.emit('stolen', { d, id: taken.id });
  }

  // ======================================================================== combat
  melee(d, T, kind) {
    const g = this.g, sp = d.sp;
    const dur = kind === 'tailwhip' ? 1.0 : kind === 'spit' ? 0.9 : 0.6;
    d.act(kind === 'spit' ? 'spit' : kind, dur, () => {
      const dd = Math.sqrt(d.dist2(T.pos));
      if (kind === 'spit') {
        g.audio?.play('hiss', { pos: d.pos, vol: 0.9 });
        for (let k = 0; k < 8; k++) g.fx.sprite('drop', d.pos.x, d.pos.y + d.rig.height * 0.8, d.pos.z, { vx: (T.pos.x - d.pos.x) * 0.8 + (Math.random() - 0.5), vy: 2 + Math.random(), vz: (T.pos.z - d.pos.z) * 0.8 + (Math.random() - 0.5), life: 0.9, size: 0.18, color: 0x9ad040, grav: 9 });
        if (T === g.local && dd < 10) { g.vitals?.damage(sp.stats.dmg * 0.4, { kind: 'spit' }); g.vitals?.add?.('blind', 5); g.ui?.toast('BLEGH! Dino spit in your eyes!', 'warn'); }
        return;
      }
      const reach = d.radius + (T instanceof Dino ? T.radius : 0.5) + 1.4 * d.sizeK;
      if (dd > reach) return;
      const dmg = sp.stats.dmg * (d.baby ? 0.3 : 1) * (0.85 + Math.random() * 0.3);
      g.audio?.play(kind === 'tailwhip' ? 'tailwhip' : kind === 'headbutt' ? 'bonk' : 'bite', { pos: T.pos, vol: 1 });
      if (T instanceof Dino) { this.damage(T, dmg, 0, d); return; }
      if (T.sitting?.van) { T.sitting.van.s.hp = Math.max(0, T.sitting.van.s.hp - dmg * (T.sitting.van.s.upgrades.armor ? 0.3 : 0.8)); g.rig.addTrauma(0.4); return; }
      if (T === g.local) {
        g.vitals?.damage(dmg, { kind: 'dino', bleed: sp.predator ? 0.35 : 0.1 });
        const push = new THREE.Vector3(T.pos.x - d.pos.x, 0, T.pos.z - d.pos.z).normalize().multiplyScalar(kind === 'headbutt' || kind === 'tailwhip' ? 12 : 5);
        T.vel.add(push); T.vel.y = kind === 'headbutt' ? 6 : 3;
        g.events.emit('dinoAttack', { d, kind });
      } else g.net?.sendTo?.(T.id, 'hurt', { dmg, kind: 'dino', from: d.id });
    }, kind === 'tailwhip' ? 0.55 : 0.45);
  }
  // player / dino hits a dino (host)
  damage(d, dmg, torpor, by) {
    const g = this.g;
    if (d.state === 'dead') return;
    d.hp -= dmg;
    d.torpor = Math.min(d.maxTorpor * 1.2, d.torpor + torpor);
    d.lastHitBy = by;
    d.alert = 1;
    if (dmg > 0) { g.fx.chips_(d.pos.x, d.pos.y + d.rig.height * 0.5 * d.sizeK, d.pos.z, 4, [0xc84040, 0x9a2a2a], { speed: 2, size: 0.05, life: 0.8 }); d.mood = 'angry'; }
    if (torpor > 0) g.fx.stars(_v.copy(d.pos).add(new THREE.Vector3(0, d.rig.height * d.sizeK, 0)), 3);
    if (d.hp <= 0) { this.kill(d, by); return; }
    if (d.torpor >= d.maxTorpor && d.state !== 'ko') {
      d.setState('ko'); d.koT = 0; d.action = null; d.anim.koSide = Math.random() < 0.5 ? -1 : 1;
      g.audio?.play('ko', { pos: d.pos, vol: 1 });
      g.fx.stars(_v.copy(d.pos).add(new THREE.Vector3(0, d.rig.height * d.sizeK, 0)), 8);
      g.events.emit('dinoKO', { d, by });
      if (by?.id === g.local.id || by === g.local) g.ui?.toast(`${d.sp.short} knocked out! Feed it to tame it (${ITEMS[d.sp.favorite]?.name} is its favourite).`, '', 'dino', 5000);
      return;
    }
    if (d.tamed) return;
    // reactions
    const attacker = by instanceof Dino ? by : by && by.pos ? by : g.local;
    if (d.sp.predator || d.sp.behaviour.territorial || d.sp.behaviour.defensive && d.sp.size > 3) { d.target = attacker; d.setState(d.sp.predator ? 'chase' : 'charge', 5); }
    else this.flee(d, attacker.pos ?? g.local.pos, 7);
    if (Math.random() < 0.6) g.audio?.play(d.sp.call ?? 'grunt', { pos: d.pos, vol: 0.9, rate: 1.2 });
  }
  kill(d, by) {
    const g = this.g;
    d.state = 'dead'; d.hp = 0; d.action = null;
    d.anim.koSide = Math.random() < 0.5 ? -1 : 1;
    g.audio?.play(d.sp.call ?? 'grunt', { pos: d.pos, vol: 1, rate: 0.7 });
    g.events.emit('dinoKilled', { d, by });
    if (d.tamed) g.ui?.toast(`${d.displayName} the ${d.sp.short} has died. :(`, 'warn', 'dino', 6000);
    const meat = Math.max(1, Math.round(d.sp.size * 2.2));
    this.corpses.push({ d, meat, hide: Math.max(1, Math.round(d.sp.size * 0.8)), bone: Math.max(1, Math.round(d.sp.size * 0.6)), prime: d.sp.size > 3 ? Math.round(d.sp.size * 0.3) : 0, at: g.time.elapsed, dna: 1 });
    const c = this.cells.get(d.cell); if (c) { c.spawned = Math.max(0, c.spawned - 1); c.until = g.time.elapsed + 900; }
  }
  harvestCorpse(c, by) {
    const g = this.g;
    const items = [];
    if (c.dna) { items.push(['dna', 1]); c.dna = 0; }
    if (c.prime > 0) { items.push(['meat_prime', 1]); c.prime--; }
    else if (c.meat > 0) { items.push(['meat_raw', Math.min(3, c.meat)]); c.meat -= 3; }
    if (c.hide > 0 && Math.random() < 0.7) { items.push(['hide', 1]); c.hide--; }
    if (c.bone > 0 && Math.random() < 0.5) { items.push(['bone', 1]); c.bone--; }
    if (Math.random() < 0.25) items.push(['feather', 1]);
    if (by === g.local.id) for (const [id, n] of items) g.give(id, n, { from: c.d.sp.short });
    else g.net?.sendTo?.(by, 'give', { items });
    g.fx.chips_(c.d.pos.x, c.d.pos.y + 0.5, c.d.pos.z, 6, [0xc84040, 0x9a2a2a], { speed: 2, size: 0.05 });
    g.audio?.play('chop', { pos: c.d.pos, vol: 0.6 });
    if (c.meat <= 0 && c.prime <= 0) { this.despawn(c.d); this.corpses = this.corpses.filter((x) => x !== c); }
  }

  // ======================================================================== nests
  setupNests() {
    const g = this.g;
    const spots = [];
    for (const p of g.world.pois) {
      if (p.id === 'rexnest') spots.push([p.x, p.z, 'rex', 2]);
      if (p.id === 'raptorden') spots.push([p.x + 6, p.z - 4, 'raptor', 3]);
      if (p.id === 'ptera') spots.push([p.x, p.z, 'ptera', 2]);
    }
    // a few herbivore nests scattered through the prairie / nesting grounds
    const r = new RNG(g.world.seed + ':nests');
    for (let k = 0; k < 14; k++) {
      const x = (r.next() - 0.5) * g.world.size * 0.8, z = (r.next() - 0.5) * g.world.size * 0.8;
      const b = BIOME_KEYS[g.sampler.biomeAt(x, z)];
      const sp = { prairie: 'parasaur', nesting: 'trike', badlands: 'proto', jungle: 'compy', highland: 'pachy', river: 'gallimimus', redwood: 'stego', swamp: 'dilo' }[b];
      if (!sp || g.sampler.waterAt(x, z) > g.sampler.heightAt(x, z)) continue;
      spots.push([x, z, sp, 1 + r.int(0, 2)]);
    }
    this.nestMat = new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 0.95 });
    for (const [x, z, sp, n] of spots) {
      const y = g.sampler.heightAt(x, z);
      const grp = new THREE.Group(); grp.position.set(x, y, z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.22, 6, 14), this.nestMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.12; ring.castShadow = true; grp.add(ring);
      const eggs = [];
      const col = SPECIES[sp].look.belly;
      for (let i = 0; i < n; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 })); e.scale.set(1, 1.3, 1); e.position.set((i - (n - 1) / 2) * 0.32, 0.22, (i % 2) * 0.15); e.castShadow = true; grp.add(e); eggs.push(e); }
      this.group.add(grp);
      this.nests.push({ x, y, z, sp, eggs, grp, regrow: 0 });
    }
  }
  nestRaycast(o, dir, reach) {
    let best = null;
    for (const n of this.nests) {
      if (!n.eggs.some((e) => e.visible)) continue;
      _v.set(n.x, n.y + 0.25, n.z);
      const t = Math.max(0, _w.copy(_v).sub(o).dot(dir));
      if (t > reach) continue;
      const c = _w.copy(o).addScaledVector(dir, t);
      if (c.distanceTo(_v) < 0.9 && (!best || t < best.t)) best = { t, n };
    }
    if (!best) return null;
    const n = best.n, sp = SPECIES[n.sp];
    return { dist: best.t, kind: 'nest', species: n.sp, label: `${sp.short} Nest`, info: 'The parents will NOT be happy', prompt: { key: this.g.input.keyName('interact'), text: 'Steal an egg' }, onInteract: () => this.takeEgg(n), scan: () => ({ key: 'nest:' + n.sp, title: sp.short + ' nest', fact: `${n.eggs.filter((e) => e.visible).length} eggs. Warm. Guarded. Probably.`, cat: 'paleo', rp: 3 }) };
  }
  takeEgg(n) {
    const g = this.g;
    const e = n.eggs.find((x) => x.visible);
    if (!e) return;
    g.local.startAction('pickup', 0.5, () => {
      e.visible = false;
      g.give('egg_' + n.sp, 1, { from: 'Nest' });
      n.regrow = g.time.elapsed + 1800;
      g.events.emit('eggStolen', { sp: n.sp });
      // angry parents nearby come running
      for (const d of this.list.values()) if (!d.tamed && d.sp.id === n.sp && d.dist2(_v.set(n.x, 0, n.z)) < 60 * 60 && d.state !== 'ko') { d.target = g.local; d.setState(d.sp.predator ? 'chase' : 'charge', 12); d.mood = 'angry'; }
      if (n.sp === 'rex' || n.sp === 'raptor') { g.audio?.play('roar', { pos: _v.set(n.x, n.y + 3, n.z), vol: 1.2, ref: 30 }); g.ui?.toast('You hear something VERY angry nearby...', 'warn'); }
    });
  }

  // ======================================================================== movement + animation
  move(d, dt) {
    const g = this.g, sp = d.sp, s = g.sampler;
    const turnRate = (sp.size > 8 ? 1.2 : sp.size > 3 ? 2.2 : 4.5) * (d.state === 'chase' || d.state === 'flee' ? 1.4 : 1);
    let dy = angleTo(d.yaw, d.wantYaw);
    // obstacle + terrain avoidance: probe ahead
    if (d.wantSpeed > 0.2 && !d.flying) {
      const look = d.radius * 2 + d.speed * 0.6;
      const probe = (a) => { const x = d.pos.x - Math.sin(a) * look, z = d.pos.z - Math.cos(a) * look; const h = s.heightAt(x, z), wl = s.waterAt(x, z); const steep = (h - d.pos.y) / look; const deep = wl > -999 && wl - h > (sp.behaviour.swimmer ? 99 : sp.size > 6 ? 1.6 : 0.7); return steep > 0.9 || deep || Math.abs(x) > g.world.half - 20 || Math.abs(z) > g.world.half - 20; };
      if (probe(d.wantYaw)) { for (const off of [0.6, -0.6, 1.2, -1.2, 2.0, -2.0, 3.1]) if (!probe(d.wantYaw + off)) { dy = angleTo(d.yaw, d.wantYaw + off); break; } }
    }
    if (d.tangled > 0) { d.tangled -= dt; d.wantSpeed = 0; d.speed *= Math.max(0, 1 - dt * 8); if (Math.random() < dt * 2) d.act('shake', 0.6); }
    d.yaw += Math.max(-turnRate * dt, Math.min(turnRate * dt, dy));
    const acc = d.wantSpeed > d.speed ? (sp.size > 8 ? 3 : 8) : 10;
    d.speed += Math.max(-acc * dt, Math.min(acc * dt, d.wantSpeed - d.speed));
    if (d.action && ['eat', 'drink', 'roar', 'call', 'tailwhip'].includes(d.action.name)) d.speed *= Math.max(0, 1 - dt * 6);
    const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
    d.pos.x += fx * d.speed * dt; d.pos.z += fz * d.speed * dt;
    // push out of solid stuff (trees, rocks, buildings, van)
    if (d.speed > 0.05 || d.state === 'charge') {
      const p = { x: d.pos.x, y: d.pos.y, z: d.pos.z };
      g.physics.pushCircle(p, d.radius * d.sizeK, d.pos.y, d.pos.y + d.rig.height * d.sizeK * 0.7, { step: 0.5, skipSmall: true, onHit: (sh) => { if (sh.tree && sp.size > 6 && d.state === 'charge' && sh.tree.radius < 0.5) g.act('hitTree', { i: sh.tree.i, dmg: 999, dirX: fx, dirZ: fz }); } });
      d.pos.x = p.x; d.pos.z = p.z;
    }
    // vertical: terrain / water / flight
    const h = s.heightAt(d.pos.x, d.pos.z), wl = s.waterAt(d.pos.x, d.pos.z);
    d.swim = wl > -999 && wl - h > d.rig.height * d.sizeK * 0.55 && !d.flying;
    if (sp.behaviour.flyer === true && (d.state === 'wander' || d.state === 'flee' || d.flying) && !d.isAsleep() && d.state !== 'idle') {
      d.flying = true;
      const want = h + (d.state === 'flee' ? 25 : 14) + Math.sin(d.stateT + d.id.length) * 4;
      d.pos.y += (want - d.pos.y) * Math.min(1, dt * 0.8);
      d.wantSpeed = Math.max(d.wantSpeed, sp.stats.fly ?? 10);
      if (Math.random() < dt * 0.02 && d.state === 'wander') { d.flying = false; d.setState('idle', 10 + Math.random() * 20); }
    } else {
      d.flying = false;
      const ground = d.swim ? wl - d.rig.height * d.sizeK * 0.45 : h;
      if (d.pos.y > ground + 0.05) { d.vy -= 21 * dt; d.pos.y += d.vy * dt; if (d.pos.y < ground) { d.pos.y = ground; d.vy = 0; } }
      else { d.pos.y = ground; d.vy = 0; }
    }
    // body pitch on slopes
    const ahead = s.heightAt(d.pos.x + fx * d.rig.len * 0.3, d.pos.z + fz * d.rig.len * 0.3), behind = s.heightAt(d.pos.x - fx * d.rig.len * 0.3, d.pos.z - fz * d.rig.len * 0.3);
    d.pitch = d.flying ? -0.1 : Math.atan2(ahead - behind, d.rig.len * 0.6) * 0.7;
    // footsteps for big ones
    if (!d.flying && d.speed > 0.6) {
      d.stepT = (d.stepT ?? 0) + d.speed * dt;
      const stride = Math.max(0.5, d.rig.len * 0.25);
      if (d.stepT > stride) {
        d.stepT = 0;
        if (sp.size > 5) { g.audio?.play('step_big', { pos: d.pos, vol: Math.min(1.2, sp.size / 10), ref: sp.size, rate: 1.2 - Math.min(0.6, sp.size / 25) }); const dl = d.pos.distanceTo(g.local.pos); if (sp.size > 9 && dl < 40) g.rig.addTrauma(0.05 * (1 - dl / 40)); if (d.swim) g.fx.splash(d.pos.x, wl, d.pos.z, 0.6); else if (d.speed > 3) g.fx.dust(d.pos, 1, 0xb8a080, sp.size * 0.12); }
        else if (d.swim) g.fx.splash(d.pos.x, wl, d.pos.z, 0.3);
      }
    }
  }
  updateAction(d, dt) {
    const a = d.action;
    if (!a) return;
    a.t += dt / a.dur;
    if (!a.done && a.t >= a.impactAt) { a.done = true; a.onImpact?.(); }
    if (a.t >= 1) d.action = null;
  }
  animate(d, dt) {
    const cam = this.g.engine.camera.position;
    const dist2 = (d.pos.x - cam.x) ** 2 + (d.pos.z - cam.z) ** 2;
    d.root.visible = dist2 < 360 * 360;
    if (!d.root.visible) return;
    // cheaper animation far away
    const skip = dist2 > 120 * 120 ? 3 : dist2 > 60 * 60 ? 1 : 0;
    d.animAcc = (d.animAcc ?? 0) + dt;
    if ((d.animSkip = (d.animSkip + 1) % (skip + 1)) === 0) {
      const look = d.lookAtP ?? d.seen ?? (d.tamed ? this.g.players.get(d.owner) : null);
      let ly = 0, lp = 0;
      if (look?.pos && d.dist2(look.pos) < 30 * 30) { ly = angleTo(d.yaw, Math.atan2(-(look.pos.x - d.pos.x), -(look.pos.z - d.pos.z))); lp = Math.atan2(look.pos.y + 1 - (d.pos.y + d.rig.height * d.sizeK), Math.sqrt(d.dist2(look.pos))) * 0.6; }
      d.anim.update(d.animAcc, { speed: d.speed / d.sizeK, yaw: d.yaw, state: d.state === 'dead' ? 'dead' : d.state === 'ko' ? 'ko' : d.state === 'sleep' || d.state === 'sleepT' ? 'sleep' : 'idle', action: d.action ? { name: d.action.name, t: Math.min(1, d.action.t) } : null, look: { yaw: ly, pitch: lp }, alert: d.alert, mood: d.mood, swim: d.swim, fly: d.flying, glide: d.sp.stats.glide, pitch: d.pitch ?? 0 });
      d.animAcc = 0;
    }
    d.root.position.copy(d.pos);
    d.root.rotation.set(0, d.yaw, 0);
  }

  // ======================================================================== interaction raycast
  raycast(o, dir, reach) {
    let best = null;
    for (const d of this.list.values()) {
      const r = d.radius * d.sizeK * 1.1 + 0.2;
      const cy = d.pos.y + Math.min(d.rig.height * 0.6, 2.5) * d.sizeK;
      // test a few spheres along the body
      for (const k of [-0.35, 0, 0.35, 0.6]) {
        _v.set(d.pos.x - Math.sin(d.yaw) * d.rig.len * k * d.sizeK, cy, d.pos.z - Math.cos(d.yaw) * d.rig.len * k * d.sizeK);
        const ox = o.x - _v.x, oy = o.y - _v.y, oz = o.z - _v.z;
        const b = ox * dir.x + oy * dir.y + oz * dir.z, c = ox * ox + oy * oy + oz * oz - r * r;
        const disc = b * b - c;
        if (disc < 0) continue;
        const t = -b - Math.sqrt(disc);
        if (t > -r && t < reach + r && (!best || t < best.t)) best = { t: Math.max(0, t), d };
      }
    }
    const nest = this.nestRaycast(o, dir, reach);
    if (!best) return nest;
    if (nest && nest.dist < best.t) return nest;
    const d = best.d;
    return this.g.taming ? this.g.taming.target(d, best.t) : { dist: best.t, kind: 'dino', dino: d, label: d.displayName, hp: d.hp / d.maxHp };
  }

  // ======================================================================== frame
  update(dt) {
    const g = this.g;
    this.population(dt);
    for (const d of this.list.values()) {
      if (g.isHost || !g.net) { this.updateAI(d, dt); this.updateAction(d, dt); if (!d.riders.length) this.move(d, dt); }
      else this.netInterp(d, dt);
      this.animate(d, dt);
    }
    // grass + fern pushers: the nearest dinos bend the vegetation they walk through
    let pi = g.pusherBase ?? 3;
    const cam = g.engine.camera.position;
    const near = [...this.list.values()].filter((d) => !d.flying && d.dist2(cam) < 50 * 50).sort((a, b) => a.dist2(cam) - b.dist2(cam));
    for (const d of near) { if (pi >= 8) break; G.uPushers.value[pi++].set(d.pos.x, d.pos.y, d.pos.z, Math.max(0.6, d.radius * d.sizeK * 1.6)); }
    for (; pi < 8; pi++) G.uPushers.value[pi].set(0, -9999, 0, 0);
    // nests regrow eggs
    for (const n of this.nests) if (n.regrow && g.time.elapsed > n.regrow) { n.regrow = 0; for (const e of n.eggs) e.visible = true; }
    // network
    this.netT -= dt;
    if (g.net?.isHost && this.netT <= 0) { this.netT = 0.1; this.broadcast(); }
    this.updateCorpses(dt);
  }
  updateCorpses() { for (const c of this.corpses) if (this.g.time.elapsed - c.at > 900) { this.despawn(c.d); c.gone = true; } this.corpses = this.corpses.filter((c) => !c.gone); }

  // ======================================================================== networking
  broadcast() {
    const g = this.g, arr = [];
    for (const d of this.list.values()) {
      let near = false; for (const p of g.players.values()) if (d.dist2(p.pos) < 220 * 220) { near = true; break; }
      if (!near) continue;
      arr.push([d.id, d.sp.id, +d.pos.x.toFixed(2), +d.pos.y.toFixed(2), +d.pos.z.toFixed(2), +d.yaw.toFixed(3), d.state, +d.speed.toFixed(2), d.action?.name ?? '', +(d.hp / d.maxHp).toFixed(2), +(d.torpor / d.maxTorpor).toFixed(2), d.tamed ? 1 : 0, d.name ?? '', d.baby ? +d.growth.toFixed(2) : 1, d.owner ?? '', +(d.tame.progress).toFixed(2)]);
    }
    g.net.broadcast('dinos', arr);
  }
  applyNet(arr) {
    const seen = new Set();
    const now = performance.now() / 1000;
    for (const a of arr) {
      const [id, sid, x, y, z, yaw, state, speed, act, hp, tor, tamed, name, growth, owner, tp] = a;
      seen.add(id);
      let d = this.list.get(id);
      if (!d) { d = new Dino(this, SPECIES[sid], { id, x, y, z, yaw, baby: growth < 1, growth, tamed: !!tamed, name: name || null, owner: owner || null }); this.list.set(id, d); }
      d.netBuf = d.netBuf || [];
      d.netBuf.push({ at: now, x, y, z, yaw }); if (d.netBuf.length > 10) d.netBuf.shift();
      d.state = state; d.speed = speed; d.hp = hp * d.maxHp; d.torpor = tor * d.maxTorpor; d.tamed = !!tamed; d.name = name || null; d.owner = owner || null; d.tame.progress = tp;
      if (act && (!d.action || d.action.name !== act)) d.action = { name: act, t: 0, dur: 0.8, done: true };
      if (!act) d.action = null;
    }
    for (const [id, d] of this.list) if (!seen.has(id) && !d.tamed) this.despawn(d);
  }
  netInterp(d, dt) {
    const b = d.netBuf;
    if (!b?.length) return;
    const t = performance.now() / 1000 - 0.15;
    let i = b.length - 1; while (i > 0 && b[i - 1].at > t) i--;
    const A = b[Math.max(0, i - 1)], C = b[i];
    const k = C.at === A.at ? 1 : Math.max(0, Math.min(1, (t - A.at) / (C.at - A.at)));
    d.pos.set(A.x + (C.x - A.x) * k, A.y + (C.y - A.y) * k, A.z + (C.z - A.z) * k);
    d.yaw = A.yaw + angleTo(A.yaw, C.yaw) * k;
    if (d.action) { d.action.t += dt / d.action.dur; if (d.action.t > 1) d.action = null; }
  }

  // ======================================================================== misc API (UI, van monitor, research)
  tamed() { return [...this.list.values()].filter((d) => d.tamed && d.state !== 'dead'); }
  nearbySummary(pos, r) { const out = []; for (const d of this.list.values()) { const dd = Math.sqrt(d.dist2(pos)); if (dd < r) out.push(`${d.sp.short.padEnd(9)} ${String(Math.round(dd)).padStart(3)}m${d.tamed ? ' ♥' : d.sp.predator ? ' !' : ''}`); } return out; }
  scanInfo(d) {
    const sp = d.sp;
    const tips = { bribe: 'Can be tamed by patient feeding.', knockout: 'Must be knocked out before taming.', net: 'Catch it with a net.' };
    return { fact: `${sp.blurb}\n${tips[sp.tame.method] ?? ''} Favourite food: ${ITEMS[sp.favorite]?.name}. Temper: ${sp.temper}.`, insight: null };
  }
  command(d, order) { this.g.taming?.command(d, order); }
  rename(d, name) { d.name = name; this.g.net?.broadcast?.('dinoName', { id: d.id, name }); }
  serialize() { return this.tamed().map((d) => ({ id: d.id, sp: d.sp.id, x: d.pos.x, y: d.pos.y, z: d.pos.z, yaw: d.yaw, name: d.name, owner: d.owner, personality: d.personality, order: d.order, happy: d.happy, level: d.level, xp: d.xp, hp: d.hp, food: d.food, baby: d.baby, growth: d.growth, saddle: d.saddle, job: d.job ? { id: d.job.id, x: d.job.anchor.x, z: d.job.anchor.z } : null })); }
  load(arr) {
    for (const d of this.tamed()) this.despawn(d);
    for (const r of arr ?? []) {
      const d = this.spawn(r.sp, r.x, r.z, { id: r.id, tamed: true, name: r.name, owner: r.owner, personality: r.personality, order: r.order, happy: r.happy, level: r.level, xp: r.xp, hp: r.hp, food: r.food, baby: r.baby, growth: r.growth, saddle: r.saddle, yaw: r.yaw });
      d.state = r.order === 'stay' ? 'stay' : 'follow';
      if (r.job) d.job = { id: r.job.id, anchor: new THREE.Vector3(r.job.x, 0, r.job.z), t: 0 };
      this.g.taming?.onTamedLoaded?.(d);
    }
  }
}

export async function install(g) {
  const D = new Dinos(g);
  g.addSystem(D);
  g.interaction.handlers.push((o, d, reach) => D.raycast(o, d, reach + 1.5));
  g.saveables.dinos = { save: () => D.serialize(), load: (d) => D.load(d) };
  g.netHandlers.dinos = (arr) => { if (!g.isHost) D.applyNet(arr); };
  g.netHandlers.dinoName = ({ id, name }) => { const d = D.list.get(id); if (d) d.name = name; };
  // world noises that alarm dinos
  g.events.on('treeLanded', ({ tip }) => D.noise(tip, 35, 0.6));
  g.events.on('vanHorn', ({ x, z, r }) => D.noise({ x, y: 0, z }, r, 1));
  g.events.on('vanSweep', ({ x, z, speed, fx, fz }) => {
    for (const d of D.list.values()) {
      if (d.state === 'dead') continue;
      const dd = Math.hypot(d.pos.x - x, d.pos.z - z);
      if (dd < 18 && !d.tamed && d.state !== 'ko') { if (!d.sp.predator && d.state !== 'flee') D.flee(d, { x, z }, 5); }
      if (dd < 2.6 + d.radius && Math.abs(speed) > 4) { D.damage(d, Math.abs(speed) * (d.sp.size < 2 ? 4 : 1.5), Math.abs(speed) * 3, g.local); d.pos.x += fx * 1.2; d.pos.z += fz * 1.2; g.audio?.play('bonk', { pos: d.pos }); }
    }
  });
  // drop stolen loot when hit
  g.events.on('dinoHit', ({ d }) => { if (d.carry) { g.drops?.spawn(d.carry.id, d.carry.n, d.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), null, { dur: d.carry.dur }); d.carry = null; } });
  return D;
}
