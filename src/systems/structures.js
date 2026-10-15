// Placeable structures: stations (workbench, campfire, kiln, forge...),
// storage, beds, crops, rain catchers, incubators, power devices and decor.
// Handles the placement ghost, colliders, interaction prompts, per-type
// simulation (fuel, fire, growth, water, power grid), demolishing, saving and
// host-authoritative networking.
import * as THREE from 'three';
import { buildStructure } from '../world/structureModels.js';
import { Inventory } from './inventory.js';
import { ITEMS } from '../data/items.js';
import { RECIPES, STATIONS } from '../data/recipes.js';

// ------------------------------------------------------------------ type table
const FIRE_LIGHT = { color: 0xffa050, intensity: 3.6, range: 10, flicker: 0.55 };
export const STYPES = {
  campfire: { name: 'Campfire', station: 'campfire', fuel: { max: 900, start: 240 }, light: FIRE_LIGHT, warmth: 6, scare: 12 },
  workbench: { name: 'Workbench', station: 'workbench' },
  storage_box: { name: 'Storage Crate', storage: 24 },
  bedroll: { name: 'Bedroll', bed: 1 },
  bed: { name: 'Comfy Bed', bed: 1.6 },
  hammock: { name: 'Hammock', bed: 1.3 },
  cooking_pot: { name: 'Cooking Pot', station: 'cooking_pot', fuel: { max: 900, start: 180 }, light: { ...FIRE_LIGHT, intensity: 1.6, range: 5 }, warmth: 3 },
  kiln: { name: 'Clay Kiln', station: 'kiln', fuel: { max: 900, start: 120 }, light: { color: 0xff7030, intensity: 1.6, range: 5, flicker: 0.3 }, warmth: 4 },
  forge: { name: 'Forge', station: 'forge', fuel: { max: 900, start: 120 }, light: { color: 0xff8030, intensity: 2.6, range: 7, flicker: 0.3 }, warmth: 5 },
  smoker: { name: 'Smoker', station: 'smoker', fuel: { max: 900, start: 120 } },
  crop_plot: { name: 'Crop Plot', crop: true },
  greenhouse: { name: 'Greenhouse', crop: true, greenhouse: true },
  water_collector: { name: 'Rain Catcher', collector: true },
  torch_stand: { name: 'Torch Stand', light: FIRE_LIGHT, autoNight: true, scare: 8 },
  feed_trough: { name: 'Feeding Trough', storage: 12, accept: 'food' },
  incubator: { name: 'Egg Incubator', incubator: true, light: { color: 0xff9050, intensity: 0.8, range: 3 } },
  research_table: { name: 'Research Table', station: 'research_table', research: true },
  specimen_shelf: { name: 'Specimen Shelf', storage: 9, accept: 'specimen' },
  spike_wall: { name: 'Spike Wall', damage: 8 },
  generator: { name: 'Dung Generator', power: { gen: 1.2, fuel: 'biofuel' } },
  solar_panel: { name: 'Solar Panel', power: { gen: 0.6, sun: true } },
  lamp: { name: 'Electric Lamp', power: { draw: 0.08 }, light: { color: 0xfff0d0, intensity: 4, range: 14 }, scare: 14 },
  sprinkler: { name: 'Sprinkler', power: { draw: 0.06 } },
  dino_wheel: { name: 'Critter Wheel', power: { gen: 2.5, dino: true } },
  auto_harvester: { name: 'Auto-Harvester', power: { draw: 0.15 } },
  radio_tower: { name: 'Scanner Tower', power: { draw: 0.2 } },
  lightning_rod: { name: 'Lightning Rod', power: { storm: true } },
  capacitor: { name: 'Capacitor Bank', power: { store: 400 } },
  flag: { name: 'Team Flag' },
  coffee_machine: { name: 'Coffee Machine', power: { draw: 0.05 } },
  dino_bed: { name: 'Critter Nest Bed' },
  fridge: { name: 'Cooler Box', storage: 16, accept: 'food', spoil: 0.33 },
  table: { name: 'Table' }, chair: { name: 'Chair', seat: true }, rug: { name: 'Rug', flat: true }, planter: { name: 'Planter' }, skull_trophy: { name: 'Skull Trophy' },
  // alpha trophies: predators keep away from a camp that displays one
  trophy_gnasher: { name: 'Gnasher\'s Tooth', trophy: true, scare: 34 },
  trophy_momma: { name: 'Big Momma\'s Scale', trophy: true, scare: 20, cropBoost: 16 },
  trophy_razor: { name: 'Razor\'s Claw', trophy: true, scare: 22 },
  // traps: bait them, wait, and the catch is held (tangled + drowsy) for you
  trap_snare: { name: 'Snare Trap', trap: { max: 2.4, r: 0.75, lure: 26, hold: 30, torpor: 0.4 } },
  trap_net: { name: 'Spring Net Trap', trap: { max: 6.5, r: 1.4, lure: 34, hold: 26, torpor: 0.55 } },
};
export const CROPS = {
  seed_berry: { name: 'Redberries', out: 'redberry', n: [4, 7], seed: 'seed_berry', time: 480, color: 0xd8302a },
  seed_fern: { name: 'Fiddleheads', out: 'fiddlehead', n: [3, 6], seed: 'seed_fern', time: 420, color: 0x6aa040 },
  seed_root: { name: 'Starch Roots', out: 'starchroot', n: [2, 4], seed: 'seed_root', time: 600, color: 0x8a6440 },
  seed_snooze: { name: 'Snoozeberries', out: 'snoozeberry', n: [4, 7], seed: 'seed_snooze', time: 540, color: 0x7a3aa8 },
};
const FUEL_ORDER = ['log', 'charcoal', 'dung', 'stick', 'resin', 'tar', 'thatch', 'fiber'];
const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _ray = new THREE.Ray(), _box = new THREE.Box3(), _hit = new THREE.Vector3();
let _sid = 1;

export class Structures {
  constructor(game) {
    this.name = 'structures';
    this.g = game;
    this.list = new Map();
    this.group = new THREE.Group(); this.group.name = 'structures';
    game.engine.scene.add(this.group);
    this.ghost = null; this.ghostType = null; this.ghostRot = 0;
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x60ff80, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghostBad = new THREE.MeshBasicMaterial({ color: 0xff5040, transparent: true, opacity: 0.35, depthWrite: false });
    this.ghostMat.userData.patchOpts = {}; this.ghostBad.userData.patchOpts = {};
    this.t = 0; this.powerT = 0;
    game.structures = this;
  }

  // ======================================================================== lifecycle
  create(rec) {
    const def = STYPES[rec.type];
    const built = buildStructure(rec.type);
    if (!def || !built) return null;
    const s = { ...rec, def, built, group: built.g, parts: built.parts, anchors: built.anchors, shapes: [], data: rec.data ?? {} };
    s.group.position.set(s.x, s.y, s.z);
    s.group.rotation.y = s.rot;
    s.group.updateMatrixWorld(true);
    this.group.add(s.group);
    // colliders
    const cs = Math.cos(s.rot), sn = Math.sin(s.rot);
    for (const c of built.col) {
      const wx = s.x + c.x * cs + c.z * sn, wz = s.z - c.x * sn + c.z * cs;
      s.shapes.push(this.g.physics.addBox({ x: wx, y: s.y + c.y, z: wz, hx: c.hx, hy: c.hy, hz: c.hz, yaw: s.rot, walk: c.walk, solid: true, ref: s, kind: 'struct' }));
    }
    // per-type state
    const D = s.data;
    if (def.storage) { s.inv = new Inventory(def.storage, { hotbar: 0 }); if (def.accept) s.inv.accept = (id) => (def.accept === 'food' ? ITEMS[id]?.cat === 'food' : ITEMS[id]?.cat === def.accept); if (D.inv) s.inv.load(D.inv); }
    if (def.fuel) { D.fuel = D.fuel ?? def.fuel.start; D.lit = D.lit ?? true; }
    if (def.crop) { D.crop = D.crop ?? null; D.grow = D.grow ?? 0; D.water = D.water ?? 0.5; D.fert = D.fert ?? 0; }
    if (def.collector) D.level = D.level ?? 0;
    if (def.incubator) { D.egg = D.egg ?? null; D.heat = D.heat ?? 0; D.prog = D.prog ?? 0; }
    if (def.power) { D.on = D.on ?? true; D.store = D.store ?? 0; D.fuel = D.fuel ?? 0; }
    if (def.trap) { D.sprung = D.sprung ?? false; D.bait = D.bait ?? null; }
    if (def.light && this.g.lightPool) {
      const a = s.anchors.fire ?? s.anchors.light ?? new THREE.Vector3(0, 1, 0);
      s.light = this.g.lightPool.add({ pos: s.group.localToWorld(a.clone()), color: def.light.color, intensity: 0, range: def.light.range, flicker: def.light.flicker ?? 0, on: false, priority: 1 });
    }
    this.list.set(s.id, s);
    this.applyVisual(s);
    // clear ground cover under it
    this.g.ground?.clearCircle?.(s.x, s.z, Math.max(...built.col.map((c) => Math.hypot(c.hx, c.hz)), 0.6) + 0.2);
    return s;
  }
  destroy(id) {
    const s = this.list.get(id);
    if (!s) return;
    for (const sh of s.shapes) this.g.physics.remove(sh);
    if (s.light) this.g.lightPool.remove(s.light);
    s.group.removeFromParent();
    s.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.list.delete(id);
  }
  record(s) {
    const D = { ...s.data };
    if (s.inv) D.inv = s.inv.serialize();
    return { id: s.id, type: s.type, x: +s.x.toFixed(3), y: +s.y.toFixed(3), z: +s.z.toFixed(3), rot: +s.rot.toFixed(4), hp: s.hp ?? 100, by: s.by, data: D };
  }
  sync(s) { if (this.g.net?.broadcast) this.g.net.broadcast('structState', this.record(s)); }
  near(pos, r, filter) {
    let best = null, bd = r * r;
    for (const s of this.list.values()) { if (filter && !filter(s)) continue; const d = (s.x - pos.x) ** 2 + (s.z - pos.z) ** 2 + (s.y - pos.y) ** 2 * 0.25; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  all(type) { return [...this.list.values()].filter((s) => s.type === type); }
  isLit(s) { return s.def.fuel ? s.data.lit && s.data.fuel > 0 : true; }
  // crops near Big Momma's lucky scale grow faster
  boosted(s) {
    if (!this.boostT || this.t - this.boostT > 5) { this.boostT = this.t || 1e-3; this.boosters = [...this.list.values()].filter((o) => o.def.cropBoost); }
    return this.boosters.some((o) => Math.hypot(o.x - s.x, o.z - s.z) < o.def.cropBoost);
  }

  // ======================================================================== actions
  registerActions() {
    const g = this.g, A = g.actionHandlers;
    A.st_place = ({ type, x, y, z, rot, by, item }) => {
      if (by === g.local.id && !g.inventory.remove(item ?? type, 1)) return;
      const id = (by ?? 'h') + ':' + _sid++ + ':' + Math.floor(Math.random() * 1e6);
      const s = this.create({ id, type, x, y, z, rot, by, hp: 100 });
      if (!s) return;
      g.net?.broadcast?.('structAdd', this.record(s));
      g.events.emit('structurePlaced', { s, by, type });
      g.audio?.play('build', { pos: _v.set(x, y + 0.5, z) });
      g.fx.dust(_v.set(x, y + 0.2, z), 6, 0xc8b8a0, 0.9);
    };
    A.st_remove = ({ id, by }) => {
      const s = this.list.get(id);
      if (!s) return;
      const refund = [[s.type, 1]];
      if (s.inv) for (const sl of s.inv.slots) if (sl) refund.push([sl.id, sl.n]);
      if (s.def.crop && s.data.crop && s.data.grow >= 1) refund.push([CROPS[s.data.crop].out, 2]);
      this.destroy(id);
      g.net?.broadcast?.('structGone', { id });
      if (by === g.local.id) for (const [it, n] of refund) g.give(it, n, { from: 'demolish' });
      else g.net?.sendTo?.(by, 'give', { items: refund, from: 'demolish' });
      g.audio?.play('demolish', { pos: _v.set(s.x, s.y + 0.5, s.z) });
      g.fx.dust(_v.set(s.x, s.y + 0.3, s.z), 8, 0xb8a888, 1);
    };
    A.st_fuel = ({ id, add, lit }) => {
      const s = this.list.get(id); if (!s || !s.def.fuel) return;
      if (add) s.data.fuel = Math.min(s.def.fuel.max, s.data.fuel + add);
      if (lit !== undefined) s.data.lit = lit;
      this.applyVisual(s); this.sync(s);
    };
    A.st_gfuel = ({ id }) => { const s = this.list.get(id); if (!s) return; s.data.fuel = (s.data.fuel ?? 0) + 180; this.sync(s); };
    A.st_toggle = ({ id }) => { const s = this.list.get(id); if (!s) return; s.data.on = !(s.data.on ?? true); this.applyVisual(s); this.sync(s); g.audio?.play('switch', { pos: _v.set(s.x, s.y + 1, s.z) }); };
    A.st_plant = ({ id, seed, by }) => {
      const s = this.list.get(id); if (!s || !s.def.crop || s.data.crop) return;
      if (by === g.local.id && !g.inventory.remove(seed, 1)) return;
      s.data.crop = seed; s.data.grow = 0; this.applyVisual(s); this.sync(s);
      g.audio?.play('pluck', { pos: _v.set(s.x, s.y + 0.3, s.z) });
      g.events.emit('planted', { s, seed, by });
    };
    A.st_harvest = ({ id, by }) => {
      const s = this.list.get(id); if (!s || !s.data.crop || s.data.grow < 1) return;
      const C = CROPS[s.data.crop];
      const n = C.n[0] + Math.floor(Math.random() * (C.n[1] - C.n[0] + 1)) + (s.data.fert > 0 ? 2 : 0) + (s.def.greenhouse ? 2 : 0);
      const items = [[C.out, n]]; if (Math.random() < 0.6) items.push([C.seed, 1 + (Math.random() < 0.3 ? 1 : 0)]);
      s.data.crop = null; s.data.grow = 0; s.data.fert = Math.max(0, s.data.fert - 1);
      this.applyVisual(s); this.sync(s);
      if (by === g.local.id) for (const [it, k] of items) g.give(it, k, { from: C.name }); else g.net?.sendTo?.(by, 'give', { items, from: C.name });
      g.fx.leaves(_v.set(s.x, s.y + 0.5, s.z), 8, C.color);
      g.audio?.play('rustle', { pos: _v });
      g.events.emit('harvested', { s, crop: C.out, n, by });
    };
    A.st_water = ({ id, amount = 1, fert = 0 }) => { const s = this.list.get(id); if (!s) return; s.data.water = Math.min(1, s.data.water + amount); s.data.fert = Math.min(3, s.data.fert + fert); this.applyVisual(s); this.sync(s); };
    A.st_collect = ({ id, by }) => {
      const s = this.list.get(id); if (!s || s.data.level < 1) return;
      s.data.level -= 1; this.applyVisual(s); this.sync(s);
      if (by === g.local.id) g.give('water_clean', 1, { from: 'Rain Catcher' }); else g.net?.sendTo?.(by, 'give', { items: [['water_clean', 1]], from: 'Rain Catcher' });
      g.audio?.play('fill', { pos: _v.set(s.x, s.y + 0.5, s.z) });
    };
    A.st_egg = ({ id, egg, by }) => {
      const s = this.list.get(id); if (!s || !s.def.incubator || s.data.egg) return;
      if (by === g.local.id && !g.inventory.remove(egg, 1)) return;
      s.data.egg = egg; s.data.prog = 0; this.applyVisual(s); this.sync(s);
      g.events.emit('eggIncubating', { s, egg, by });
    };
    A.st_bait = ({ id, item, by }) => {
      const s = this.list.get(id); if (!s || !s.def.trap || s.data.bait) return;
      if (by === g.local.id && !g.inventory.remove(item, 1)) return;
      s.data.bait = item; this.applyVisual(s); this.sync(s);
      g.audio?.play('pluck', { pos: _v.set(s.x, s.y + 0.2, s.z) });
    };
    A.st_rearm = ({ id }) => {
      const s = this.list.get(id); if (!s || !s.def.trap) return;
      const d = s.data.caught && g.dinos?.list.get(s.data.caught); if (d && d.state !== 'ko') d.tangled = 0;
      s.data.sprung = false; s.data.caught = null; this.applyVisual(s); this.sync(s);
      g.audio?.play('ratchet', { pos: _v.set(s.x, s.y + 0.3, s.z) });
    };
    A.st_brew = ({ id, by }) => {
      const s = this.list.get(id); if (!s) return;
      if (by === g.local.id) { if (!g.inventory.remove('water_clean', 1)) return; setTimeout(() => g.give('coffee', 1, { from: 'Coffee Machine' }), 2500); }
      s.data.brewT = 2.5; g.audio?.play('coffee', { pos: _v.set(s.x, s.y + 1, s.z) });
    };
  }

  // ======================================================================== placement ghost
  updateGhost() {
    const g = this.g, held = g.inventory.held(), def = held ? ITEMS[held.id] : null;
    const type = def?.cat === 'placeable' ? def.place : null;
    if (!type || g.uiOpen || g.local.sitting || g.building?.active) { this.hideGhost(); if (g.promptClaim === 'ghost') g.promptClaim = null; return; }
    g.promptClaim = 'ghost';
    if (this.ghostType !== type) {
      this.hideGhost();
      const b = buildStructure(type);
      if (!b) return;
      b.g.traverse((o) => { if (o.isMesh) { o.material = this.ghostMat; o.castShadow = false; o.receiveShadow = false; } });
      this.ghost = b; this.ghostType = type;
      this.group.add(b.g);
    }
    if (g.input.pressed('rotate')) { this.ghostRot += Math.PI / 4; g.audio?.play('ui_tick', { vol: 0.3 }); }
    const r = this.placeRay();
    const G = this.ghost.g;
    if (!r) { G.visible = false; this.ghostOk = false; return; }
    G.visible = true;
    const yaw = g.rig.yaw + Math.PI + this.ghostRot;
    G.position.copy(r.point); G.rotation.y = yaw;
    const ok = this.canPlace(type, r.point, yaw, r);
    if (ok !== this.ghostOk) { this.ghostOk = ok; G.traverse((o) => { if (o.isMesh) o.material = ok ? this.ghostMat : this.ghostBad; }); }
    this.ghostPos = r.point.clone(); this.ghostYaw = yaw;
    g.ui?.setPrompt({ key: 'LMB', text: `Place ${STYPES[type]?.name ?? type}`, alt: { key: g.input.keyName('rotate'), text: 'Rotate' }, warn: ok ? null : this.whyNot });
  }
  hideGhost() { if (this.ghost) { this.ghost.g.removeFromParent(); this.ghost = null; this.ghostType = null; } }
  placeRay() {
    const g = this.g, cam = g.engine.camera;
    const o = cam.position.clone(), d = new THREE.Vector3(); cam.getWorldDirection(d);
    const head = g.local.headPos(new THREE.Vector3());
    o.addScaledVector(d, Math.max(0, d.dot(head.clone().sub(o))));
    const hit = g.physics.raycast(o, d, 7, { filter: (s) => s.kind === 'build' || s.kind === 'struct' && s.walk });
    if (!hit) return null;
    if (hit.normal.y < 0.7) return null;
    if (hit.shape && hit.shape.kind === 'struct' && !hit.shape.walk) return null;
    return { point: hit.point, onShape: hit.shape };
  }
  canPlace(type, p, yaw, r) {
    const g = this.g;
    this.whyNot = null;
    if (p.distanceTo(g.local.pos) > 6.5) { this.whyNot = 'Too far'; return false; }
    const wl = g.sampler.waterAt(p.x, p.z);
    if (wl > p.y + 0.15 && wl > -999 && !r.onShape) { this.whyNot = 'Not in water'; return false; }
    if (!r.onShape && g.sampler.slopeAt(p.x, p.z) > 0.6) { this.whyNot = 'Too steep'; return false; }
    if (g.van && g.van.near(p, 0.5) && Math.hypot(p.x - g.van.pose.x, p.z - g.van.pose.z) < 3.4) { this.whyNot = 'Too close to the van'; return false; }
    // overlap test against solid shapes using the footprint
    const b = this.ghost?.built ?? this.ghost;
    const cols = (b?.col ?? []);
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const list = g.physics.query(p.x, p.z, 3, []);
    for (const c of cols) {
      const wx = p.x + c.x * cs + c.z * sn, wz = p.z - c.x * sn + c.z * cs;
      for (const s of list) {
        if (!s.solid || s.walk && s.kind === 'build' && Math.abs((s.y + s.hy) - p.y) < 0.15) continue;
        if (s === r.onShape) continue;
        const sy0 = s.type === 'cyl' ? s.y0 : s.y - s.hy, sy1 = s.type === 'cyl' ? s.y1 : s.y + s.hy;
        if (sy1 < p.y + 0.05 || sy0 > p.y + c.y + c.hy) continue;
        const rad = Math.min(c.hx, c.hz) * 0.85;
        const pt = { x: wx, y: p.y, z: wz };
        if (g.physics.resolve(pt, rad, c.hy * 2, 0.05, [s])) { this.whyNot = 'Something is in the way'; return false; }
      }
    }
    if (!g.inventory.count(g.inventory.held()?.id)) return false;
    return true;
  }
  tryPlace() {
    const g = this.g;
    if (!this.ghost || !this.ghostOk || !this.ghostPos) { g.audio?.play('build_fail', { vol: 0.5 }); return; }
    const held = g.inventory.held();
    g.act('st_place', { type: this.ghostType, item: held.id, x: this.ghostPos.x, y: this.ghostPos.y, z: this.ghostPos.z, rot: this.ghostYaw });
    g.local.startAction('hammer', 0.5, null, 2);
  }

  // ======================================================================== interaction
  raycast(o, d, reach) {
    let best = null;
    for (const s of this.list.values()) {
      if ((s.x - o.x) ** 2 + (s.z - o.z) ** 2 > (reach + 4) ** 2) continue;
      _m.copy(s.group.matrixWorld).invert();
      _ray.origin.copy(o).applyMatrix4(_m); _ray.direction.copy(d).transformDirection(_m);
      const cols = s.built.col.length ? s.built.col : [{ x: 0, y: 0.3, z: 0, hx: 0.6, hy: 0.3, hz: 0.6 }];
      for (const c of cols) {
        _box.min.set(c.x - c.hx - 0.05, c.y - c.hy, c.z - c.hz - 0.05); _box.max.set(c.x + c.hx + 0.05, c.y + c.hy + 0.15, c.z + c.hz + 0.05);
        if (!_ray.intersectBox(_box, _hit)) continue;
        const dist = _ray.origin.distanceTo(_hit);
        if (dist <= reach && (!best || dist < best.dist)) best = { dist, s };
      }
    }
    if (!best) return null;
    return this.target(best.s, best.dist);
  }
  target(s, dist) {
    const g = this.g, D = s.data, def = s.def;
    const key = g.input.keyName('interact');
    const held = g.inventory.held(), hdef = held ? ITEMS[held.id] : null;
    const t = { dist, kind: 'struct', s, label: def.name, info: this.info(s) };
    const hammer = hdef?.tool?.kind === 'hammer';
    let prompt = null, act = null;
    if (def.fuel) {
      prompt = { text: `Open ${def.name}` }; act = () => this.openStation(s);
    } else if (def.station) { prompt = { text: `Use ${def.name}` }; act = () => this.openStation(s); }
    if (def.storage) { prompt = { text: `Open ${def.name}` }; act = () => g.ui?.openContainer({ inv: s.inv }, def.name, { label: def.name, cols: def.storage > 12 ? 6 : 4, onClose: () => this.syncInv(s) }); }
    if (def.bed) { prompt = { text: g.time.isNight || (g.vitals?.energy ?? 100) < 40 ? 'Sleep' : 'Set respawn here (sleep at night)' }; act = () => this.sleep(s); }
    if (def.seat) { prompt = { text: 'Sit' }; act = () => this.sitChair(s); }
    if (def.crop) {
      if (!D.crop) {
        const seed = hdef && CROPS[hdef.id] ? hdef.id : Object.keys(CROPS).find((k) => g.inventory.count(k) > 0);
        if (seed) { prompt = { text: `Plant ${ITEMS[seed].name}` }; act = () => g.act('st_plant', { id: s.id, seed }); } else prompt = { text: 'Empty plot', key: '-', warn: 'Needs seeds' };
      } else if (D.grow >= 1) { prompt = { text: `Harvest ${CROPS[D.crop].name}` }; act = () => { g.local.startAction('pickup', 0.45, () => g.act('st_harvest', { id: s.id })); }; }
      else if (held && (held.id === 'water_clean' || held.id === 'water_dirty')) { prompt = { text: 'Water the crops' }; act = () => { if (g.inventory.remove(held.id, 1)) { g.act('st_water', { id: s.id, amount: 1 }); g.audio?.play('splash', { pos: _v.set(s.x, s.y + 0.4, s.z), vol: 0.5 }); g.fx.splash(s.x, s.y + 0.3, s.z, 0.5); } }; }
      else if (held && held.id === 'dung') { prompt = { text: 'Fertilise (+speed, +yield)' }; act = () => { if (g.inventory.remove('dung', 1)) g.act('st_water', { id: s.id, amount: 0, fert: 1 }); }; }
      else prompt = { text: 'Growing...', key: '-' };
    }
    if (def.collector) { if (D.level >= 1) { prompt = { text: 'Take Clean Water' }; act = () => g.act('st_collect', { id: s.id }); } else prompt = { text: 'Waiting for rain...', key: '-' }; }
    if (def.incubator) {
      if (!D.egg) { const egg = g.inventory.slots.find((x) => x && ITEMS[x.id]?.egg); if (egg) { prompt = { text: `Place ${ITEMS[egg.id].name}` }; act = () => g.act('st_egg', { id: s.id, egg: egg.id }); } else prompt = { text: 'Empty incubator', key: '-', warn: 'Find a critter egg' }; }
      else prompt = { text: `Incubating... ${Math.floor(D.prog * 100)}%`, key: '-' };
    }
    if (def.power && (s.type === 'lamp' || s.type === 'sprinkler' || s.type === 'radio_tower' || s.type === 'auto_harvester')) { prompt = { text: D.on ? 'Switch off' : 'Switch on' }; act = () => g.act('st_toggle', { id: s.id }); }
    if (s.type === 'generator') { if (g.inventory.count('biofuel')) { prompt = { text: 'Refuel with Dung-o-Diesel' }; act = () => { if (g.inventory.remove('biofuel', 1)) { g.act('st_gfuel', { id: s.id }); g.audio?.play('fill', { pos: _v.set(s.x, s.y + 0.5, s.z) }); } }; } else { prompt = { text: D.on ? 'Switch off' : 'Switch on' }; act = () => g.act('st_toggle', { id: s.id }); } }
    if (s.type === 'coffee_machine') { if (g.inventory.count('water_clean')) { prompt = { text: 'Brew Van Coffee' }; act = () => { if (this.powered(s)) g.act('st_brew', { id: s.id }); else g.ui?.toast('No power! Connect a generator or solar panel nearby.', 'warn'); }; } else prompt = { text: 'Coffee Machine', key: '-', warn: 'Needs Clean Water' }; }
    if (s.type === 'torch_stand') { prompt = { text: D.off ? 'Light torch' : 'Put out torch' }; act = () => { D.off = !D.off; this.applyVisual(s); this.sync(s); g.audio?.play(D.off ? 'sizzle' : 'fire_whoosh', { pos: _v.set(s.x, s.y + 1.6, s.z), vol: 0.5 }); }; }
    if (def.trap) {
      if (D.sprung) { const d = D.caught && g.dinos?.list.get(D.caught); prompt = { text: d && !d.tamed && d.state !== 'dead' ? 'Re-arm (let it go)' : 'Re-arm the trap' }; act = () => { g.local.startAction('hammer', 0.6, () => g.act('st_rearm', { id: s.id }), 0.8); }; }
      else if (!D.bait) { const food = hdef?.cat === 'food' ? held.id : null; if (food) { prompt = { text: `Bait with ${hdef.name}` }; act = () => g.act('st_bait', { id: s.id, item: food }); } else prompt = { text: 'Armed', key: '-', warn: 'Hold food to bait it' }; }
      else prompt = { text: 'Armed and baited', key: '-' };
    }
    if (def.research) { prompt = { text: 'Study specimens' }; act = () => (g.computer ? g.computer.open(null, 0, 'lab') : this.openStation(s)); }
    if (hammer) prompt = { ...(prompt ?? { text: def.name, key: '-' }), alt: { key: 'RMB', text: 'Hold to pick up' } };
    t.prompt = prompt ? { key: prompt.key ?? key, text: prompt.text, warn: prompt.warn ?? null, alt: prompt.alt ?? null, progress: this.demo?.s === s ? this.demo.t / 1.0 : null } : null;
    t.onInteract = act;
    return t;
  }
  info(s) {
    const D = s.data, def = s.def;
    if (def.fuel) return D.lit && D.fuel > 0 ? `Burning · ${Math.ceil(D.fuel / 60)} min of fuel` : D.fuel > 0 ? 'Not lit' : 'Out of fuel';
    if (def.crop) return D.crop ? `${CROPS[D.crop].name} · ${Math.min(100, Math.floor(D.grow * 100))}% · water ${Math.round(D.water * 100)}%${D.fert ? ' · fertilised' : ''}` : 'Empty';
    if (def.collector) return `Water: ${Math.floor(D.level)} / 5`;
    if (def.trap) return D.sprung ? (D.caught && this.g.dinos?.list.get(D.caught) ? `Caught: ${this.g.dinos.list.get(D.caught).displayName}! Bonk it or feed it` : 'Sprung') : D.bait ? `Baited with ${ITEMS[D.bait]?.name}` : `Catches critters up to ${def.trap.max} m · bait it with food`;
    if (def.power?.store) return `Stored ${Math.round(D.store)} / ${def.power.store}`;
    if (def.power) return this.powered(s) ? 'Powered' : def.power.draw ? 'No power' : (def.power.gen ? 'Generating' : '');
    if (def.storage) { const n = s.inv.slots.filter(Boolean).length; return `${n} / ${def.storage} slots used`; }
    return null;
  }
  syncInv(s) { this.sync(s); }

  // station panel: fuel slot + recipes for that station
  openStation(s) {
    const g = this.g, def = s.def;
    const recipes = RECIPES.filter((r) => r.station === def.station && !r.hidden);
    const fuelInv = new Inventory(1, { hotbar: 0 });
    fuelInv.accept = (id) => FUEL_ORDER.includes(id) || (ITEMS[id]?.fuel ?? 0) > 0;
    const panel = () => {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;gap:6px;margin-top:8px;max-height:380px;overflow-y:auto;';
      if (def.fuel) {
        const D = s.data;
        const st = document.createElement('div'); st.className = 'small';
        st.innerHTML = `<b>${D.lit && D.fuel > 0 ? '🔥 Burning' : 'Not burning'}</b> · fuel ${Math.ceil(D.fuel / 60)} min<br>Drop fuel in the slot above (logs, sticks, charcoal, dung...)`;
        el.appendChild(st);
        const b = document.createElement('button'); b.className = 'btn'; b.textContent = D.lit ? 'Put out' : 'Light it';
        b.onclick = () => { g.act('st_fuel', { id: s.id, lit: !D.lit }); g.audio?.play(D.lit ? 'sizzle' : 'fire_whoosh', { pos: _v.set(s.x, s.y + 0.4, s.z) }); setTimeout(() => g.ui?.renderContainer(), 50); };
        el.appendChild(b);
      }
      const title = document.createElement('div'); title.className = 'section-title'; title.textContent = (STATIONS[def.station]?.name ?? def.name).toUpperCase() + ' RECIPES'; el.appendChild(title);
      for (const r of recipes) {
        const unlocked = g.crafting.isUnlocked(r);
        const row = document.createElement('div'); row.className = 'req' + (g.crafting.canCraft(r) ? '' : ' no');
        row.style.cssText = 'cursor:pointer;display:flex;align-items:center;gap:6px;';
        const ins = Object.entries(r.in).map(([id, n]) => `${n} ${ITEMS[id]?.name ?? id}`).join(', ');
        row.innerHTML = `<img src="${g.ui.icon(r.out)}"><span style="flex:1"><b>${unlocked ? ITEMS[r.out].name : '???'}${r.n > 1 ? ' ×' + r.n : ''}</b><br><span class="small">${unlocked ? ins : 'Locked: research to unlock'}</span></span>`;
        row.onclick = () => { if (g.crafting.start(r)) { g.ui?.toast(`Crafting ${ITEMS[r.out].name}...`); setTimeout(() => g.ui?.renderContainer(), 50); } else g.audio?.play('error', { vol: 0.4 }); };
        el.appendChild(row);
      }
      return el;
    };
    if (def.fuel) {
      // anything dropped in the fuel slot is burned right away
      fuelInv.onChange(() => {
        const sl = fuelInv.slots[0];
        if (!sl) return;
        const per = ITEMS[sl.id]?.fuel ?? 10;
        const need = Math.ceil((def.fuel.max - s.data.fuel) / per);
        const k = Math.min(sl.n, Math.max(0, need));
        if (k <= 0) { g.ui?.toast('It\'s full!'); return; }
        sl.n -= k; if (sl.n <= 0) fuelInv.slots[0] = null;
        if (fuelInv.slots[0]) { g.inventory.add(sl.id, sl.n); fuelInv.slots[0] = null; }
        g.act('st_fuel', { id: s.id, add: k * per * 6, lit: true });
        g.audio?.play('fire_whoosh', { pos: _v.set(s.x, s.y + 0.4, s.z), vol: 0.6 });
        setTimeout(() => g.ui?.renderContainer(), 30);
      });
      g.ui?.openContainer({ inv: fuelInv }, def.name, { label: 'Fuel', cols: 1, extra: panel });
    } else g.ui?.openContainer({ inv: null }, def.name, { extra: panel });
  }

  sleep(s) {
    const g = this.g, p = g.local, v = g.vitals;
    g.respawn = { x: s.x, y: s.y + 0.3, z: s.z };
    if (!g.time.isNight && (v?.energy ?? 100) > 40) { g.ui?.toast('Respawn point set. It\'s too bright to sleep.'); return; }
    const a = s.group.localToWorld((s.anchors.sleep ?? new THREE.Vector3(0, 0.3, 0)).clone());
    p.sleeping = { s, bonus: s.def.bed };
    this._sleptAt = this.t;
    p.teleport(a.x, a.y, a.z);
    p.yaw = s.rot;
    g.audio?.play('sleep', { vol: 0.6 });
    g.events.emit('sleep', { by: p.id, s });
    g.ui?.toast('Zzz... (all explorers must sleep to skip the night)');
  }
  sitChair(s) {
    const g = this.g, p = g.local;
    p.sitting = { seat: 'chair', seatObj: s.group, chair: s, since: this.t };
    g.audio?.play('creak', { pos: _v.set(s.x, s.y + 0.5, s.z), vol: 0.4 });
  }
  powered(s) { return !!s.data.pw; }

  // ======================================================================== per-frame
  update(dt) {
    const g = this.g;
    this.t += dt;
    this.updateGhost();
    // demolish with hammer (hold RMB)
    const tgt = g.interaction?.target;
    const hammer = g.inventory.heldDef()?.tool?.kind === 'hammer';
    if (hammer && tgt?.kind === 'struct' && g.input.down('alt') && !g.uiOpen) {
      if (!this.demo || this.demo.s !== tgt.s) this.demo = { s: tgt.s, t: 0 };
      this.demo.t += dt;
      if (!g.local.action) g.local.startAction('hammer', 0.5, null, 2);
      if (this.demo.t >= 1.0) { g.act('st_remove', { id: tgt.s.id }); this.demo = null; }
    } else this.demo = null;
    // sleeping: wake on input, skip the night when everyone sleeps
    const p = g.local;
    if (p.sleeping) {
      const v = g.vitals;
      if (v) { v.energy = Math.min(100, v.energy + dt * 6 * (p.sleeping.bonus ?? 1)); v.stamina = 100; }
      g.engine.post.compMat.uniforms.uFade && (g.engine.post.compMat.uniforms.uFade.value = Math.min(0.85, (g.engine.post.compMat.uniforms.uFade.value ?? 0) + dt * 0.5));
      const all = [...g.players.values()].every((q) => q.sleeping);
      if (all && g.isHost && !this.skipping && (g.time.isNight || (v?.energy ?? 0) < 40)) {
        this.skipping = true;
        setTimeout(() => {
          const was = g.time.day;
          g.time.skipTo(0.27);
          if (v) { v.energy = 100; v.hunger = Math.max(5, v.hunger - 18); v.thirst = Math.max(5, v.thirst - 22); v.heal(30); }
          for (const q of g.players.values()) q.sleeping = false;
          g.net?.broadcast?.('wake', { tod: g.time.tod, elapsed: g.time.elapsed });
          g.events.emit('nightSkipped', { day: g.time.day, was });
          g.ui?.banner('GOOD MORNING', 'Day ' + g.time.day, 'You survived the night');
          g.audio?.jingle?.('discover');
          this.skipping = false;
        }, 2500);
      }
      if (g.input.pressed('jump') || g.input.pressed('interact') && this.t - (this._sleptAt ?? 0) > 1) { p.sleeping = false; }
    } else if (g.engine.post.compMat.uniforms.uFade && !this.skipping) g.engine.post.compMat.uniforms.uFade.value = Math.max(0, g.engine.post.compMat.uniforms.uFade.value - dt * 1.5);
    // chairs
    if (p.sitting?.chair) {
      const s = p.sitting.chair;
      s.group.localToWorld(_v.copy(s.anchors.sit ?? new THREE.Vector3(0, 0.45, 0)));
      p.pos.copy(_v).add(new THREE.Vector3(0, -0.42, 0)); p.root.position.copy(p.pos); p.root.rotation.y = s.rot + Math.PI; p.yaw = s.rot + Math.PI;
      if (this.t - p.sitting.since > 0.35 && (g.input.pressed('interact') || g.input.pressed('jump'))) { p.sitting = null; p.teleport(p.pos.x + Math.sin(s.rot) * 0.6, p.pos.y + 0.05, p.pos.z + Math.cos(s.rot) * 0.6); }
    }
    this.simulate(dt);
    this.updateVisuals(dt);
  }

  simulate(dt) {
    const g = this.g, host = g.isHost || !g.net;
    const rain = g.weather.cur.rain;
    const night = g.time.isNight;
    // power grid every second
    this.powerT -= dt;
    if (this.powerT <= 0) { this.powerT = 1; this.updatePower(1); }
    for (const s of this.list.values()) {
      const D = s.data, def = s.def;
      if (def.trap && host && g.dinos) this.updateTrap(s, dt);
      if (def.fuel && D.lit && D.fuel > 0) {
        D.fuel -= dt * (rain > 0.5 && s.type === 'campfire' && !this.sheltered(s) ? 2 : 1);
        if (D.fuel <= 0) { D.fuel = 0; D.lit = false; this.applyVisual(s); if (host) this.sync(s); g.audio?.play('sizzle', { pos: _v.set(s.x, s.y + 0.3, s.z), vol: 0.5 }); }
        // warmth for the local player
        if (def.warmth && g.vitals) { const d = g.local.pos.distanceTo(_v.set(s.x, s.y, s.z)); if (d < def.warmth) g.vitals.warmth = Math.max(g.vitals.warmth, 1 - d / def.warmth); }
      }
      if (def.crop && D.crop) {
        const C = CROPS[D.crop];
        const gh = !!def.greenhouse;
        if (rain > 0.2 && !gh) D.water = Math.min(1, D.water + dt * 0.02 * rain);
        D.water = Math.max(gh ? 0.35 : 0, D.water - dt / 900); // greenhouses keep their own damp air
        const rate = (D.water > 0.05 ? 1 : 0.25) * (D.fert > 0 ? 1.8 : 1) * (night && !gh ? 0.6 : 1) * (gh ? 1.8 : 1) * (this.boosted(s) ? 1.5 : 1);
        const before = D.grow;
        D.grow = Math.min(1, D.grow + (dt / C.time) * rate);
        if (Math.floor(before * 3) !== Math.floor(D.grow * 3) || (before < 1 && D.grow >= 1)) { this.applyVisual(s); if (D.grow >= 1) g.events.emit('cropReady', { s }); }
      }
      if (def.collector) { const before = D.level; D.level = Math.min(5, D.level + dt * rain * 0.02); if (Math.floor(before) !== Math.floor(D.level)) this.applyVisual(s); }
      if (def.incubator && D.egg) {
        // needs warmth: a lit fire within 5 m, or daytime sun, or power
        const warm = this.powered(s) || !night || [...this.list.values()].some((o) => o.def.warmth && this.isLit(o) && Math.hypot(o.x - s.x, o.z - s.z) < 5);
        D.heat += ((warm ? 1 : 0) - D.heat) * Math.min(1, dt * 0.2);
        D.prog = Math.min(1, D.prog + dt * D.heat / 600);
        if (D.prog >= 1 && host) {
          const egg = D.egg; D.egg = null; D.prog = 0; this.applyVisual(s); this.sync(s);
          g.events.emit('eggHatched', { s, egg, species: ITEMS[egg]?.egg, pos: new THREE.Vector3(s.x, s.y + 0.7, s.z) });
          g.fx.stars(_v.set(s.x, s.y + 0.8, s.z), 8); g.audio?.play('chirp', { pos: _v, vol: 0.8 }); g.audio?.jingle?.('tame');
        }
      }
      if (D.brewT > 0) D.brewT -= dt;
    }
  }
  sheltered(s) { return !!this.g.physics.raycast(_v.set(s.x, s.y + 1.2, s.z), new THREE.Vector3(0, 1, 0), 12, { terrain: false, filter: (x) => x.kind === 'build' }); }

  updatePower(dt) {
    // connected components of power devices within 16 m
    const devs = [...this.list.values()].filter((s) => s.def.power);
    const seen = new Set();
    const sunUp = Math.max(0, this.g.sky?.sunDir?.y ?? 0.5);
    const storm = this.g.weather.cur.storm;
    for (const d of devs) {
      if (seen.has(d)) continue;
      const comp = [d]; seen.add(d);
      for (let i = 0; i < comp.length; i++) for (const o of devs) if (!seen.has(o) && (o.x - comp[i].x) ** 2 + (o.z - comp[i].z) ** 2 < 256) { seen.add(o); comp.push(o); }
      let gen = 0, draw = 0, store = 0, cap = 0;
      for (const s of comp) {
        const P = s.def.power, D = s.data;
        if (P.gen && D.on !== false) {
          if (P.fuel) { if (D.fuel > 0) { gen += P.gen; D.fuel -= dt; } }
          else if (P.sun) gen += P.gen * Math.min(1, sunUp * 2) * (1 - this.g.weather.cur.cover * 0.7);
          else if (P.dino) gen += D.dinoIn ? P.gen : 0;
        }
        if (P.storm && storm > 0.5 && Math.random() < 0.02 * storm) { gen += 60; this.g.events.emit('lightningRod', { s }); this.zap(s); }
        if (P.store) { store += D.store; cap += P.store; }
        if (P.draw && D.on !== false) draw += P.draw;
      }
      let net = (gen - draw) * dt;
      // capacitors absorb surplus / cover deficit
      const caps = comp.filter((s) => s.def.power.store);
      let ok = gen >= draw;
      if (net > 0 && caps.length) for (const c of caps) { const room = c.def.power.store - c.data.store; const k = Math.min(room, net); c.data.store += k; net -= k; }
      if (net < 0 && caps.length && store > -net) { let need = -net; for (const c of caps) { const k = Math.min(c.data.store, need); c.data.store -= k; need -= k; } ok = true; }
      for (const s of comp) { const was = s.data.pw; s.data.pw = ok && (gen > 0 || store > 0) && s.data.on !== false; if (was !== s.data.pw) this.applyVisual(s); }
      void cap;
    }
  }
  zap(s) {
    const g = this.g, top = s.group.localToWorld((s.anchors.tip ?? new THREE.Vector3(0, 5, 0)).clone());
    g.audio?.play('thunder', { pos: top, vol: 1.2 }); g.audio?.play('zap', { pos: top });
    for (let k = 0; k < 20; k++) g.fx.sprite('spark', top.x, top.y, top.z, { vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 8, life: 0.6, size: 0.18, color: 0x9ae0ff, grav: 6 });
    if (g.weather) g.weather.flash = 1;
  }

  updateTrap(s, dt) {
    const g = this.g, D = s.data, T = s.def.trap;
    if (D.sprung) {
      // hold the catch in place
      const d = D.caught && g.dinos.list.get(D.caught);
      if (d && !d.tamed && d.state !== 'dead' && D.holdT > 0) {
        D.holdT -= dt;
        if (d.state !== 'ko') {
          d.tangled = Math.max(d.tangled ?? 0, 0.3); d.pos.x += (s.x - d.pos.x) * Math.min(1, dt * 3); d.pos.z += (s.z - d.pos.z) * Math.min(1, dt * 3);
          // it struggles, and stays drowsy while it is held, so bonking it works
          if (d.state !== 'idle') d.setState('idle', 1);
          if (!d.action && Math.random() < dt * 1.2) d.act('shake', 0.8);
          d.torpor = Math.max(d.torpor, d.maxTorpor * T.torpor * (D.holdT / T.hold));
        }
      } else if (D.caught) { if (d && !d.tamed && d.state !== 'dead' && d.state !== 'ko') g.dinos.flee(d, { x: s.x, z: s.z }, 6); D.caught = null; this.sync(s); }
      return;
    }
    s.trapT = (s.trapT ?? Math.random() * 0.3) - dt;
    if (s.trapT > 0) return;
    s.trapT = 0.25;
    for (const d of g.dinos.list.values()) {
      if (d.tamed || d.state === 'dead' || d.state === 'ko' || d.flying || d.hidden || d.swim || d.sp.size > T.max) continue;
      const dd = Math.hypot(d.pos.x - s.x, d.pos.z - s.z);
      if (dd > T.lure + 2) continue;
      if (dd < T.r + d.radius * (d.sizeK ?? 1) * 0.5) { this.spring(s, d); return; }
      // bait lures dinos that like it, unless they are busy being scared or angry
      if (D.bait && d.sp.foods?.includes(D.bait) && !['flee', 'chase', 'stalk', 'charge', 'warn', 'steal'].includes(d.state)) d.lure = { x: s.x, z: s.z, until: g.time.elapsed + 3 };
    }
  }
  spring(s, d) {
    const g = this.g, D = s.data, T = s.def.trap;
    D.sprung = true; D.caught = d.id; D.holdT = T.hold; D.bait = null; d.lure = null;
    d.tangled = T.hold; d.torpor = Math.min(d.maxTorpor * 0.95, d.torpor + d.maxTorpor * T.torpor);
    d.setState('idle', 3); d.alert = 1; d.mood = 'angry'; d.action = null; d.act('shake', 1);
    if (d.carry) { g.drops?.spawn(d.carry.id, d.carry.n, d.pos.clone().add(new THREE.Vector3(0, 0.5, 0))); d.carry = null; }
    g.audio?.play('bola', { pos: _v.set(s.x, s.y + 0.4, s.z), vol: 1.1 });
    g.audio?.play(d.sp.call ?? 'grunt', { pos: d.pos, vol: 0.9, rate: 1.2 });
    g.fx.stars(_v.set(d.pos.x, d.pos.y + d.rig.height * d.sizeK, d.pos.z), 5);
    g.fx.dust(_v.set(s.x, s.y + 0.2, s.z), 6, 0xb8a080, 1);
    this.applyVisual(s); this.sync(s);
    g.events.emit('trapped', { s, d });
    g.toastNear?.({ x: s.x, z: s.z }, 80, `SNAP! Your ${s.def.name} caught a ${d.sp.short}! Bonk it to knock it out, or feed it.`, '', 'dino', 5500);
  }

  applyVisual(s) {
    const D = s.data, P = s.parts, def = s.def;
    const lit = def.fuel ? this.isLit(s) : s.type === 'torch_stand' ? !D.off : def.power ? this.powered(s) : false;
    s.isLit = lit;
    if (P.coals) for (const c of P.coals) c.material.emissiveIntensity = lit ? 1.2 : D.fuel > 0 ? 0.15 : 0;
    if (P.glow) P.glow.material.emissiveIntensity = lit ? 1.8 : 0;
    if (P.logs) P.logs.scale.setScalar(0.4 + 0.6 * Math.min(1, (D.fuel ?? 0) / 300));
    if (P.head) { if (P.head.material.emissive) P.head.material.emissiveIntensity = lit ? 1.4 : 0; }
    if (P.bulb) P.bulb.material.emissiveIntensity = lit ? 3 : 0;
    if (P.lamp) P.lamp.material.emissiveIntensity = D.egg ? 1.5 : 0;
    if (P.light) P.light.material.emissiveIntensity = lit ? 2 : 0;
    if (P.gauge) P.gauge.material.emissiveIntensity = (D.store ?? 0) > 1 ? 1.2 : 0;
    if (P.led) P.led.material.emissiveIntensity = lit ? 1.5 : 0;
    if (s.light) { s.light.on = lit || (def.incubator && !!D.egg); s.light.intensity = def.light.intensity * (s.light.on ? 1 : 0); }
    if (P.water) { P.water.position.y = 0.1 + Math.min(1, (D.level ?? 0) / 5) * 0.55; P.water.visible = (D.level ?? 0) > 0.05; }
    if (P.food && s.inv) P.food.visible = s.inv.slots.some(Boolean);
    if (def.crop) this.buildCrops(s);
    if (def.trap) { if (P.armed) P.armed.visible = !D.sprung; if (P.sprung) P.sprung.visible = !!D.sprung; if (P.bait) P.bait.visible = !!D.bait && !D.sprung; }
    if (def.incubator) {
      if (D.egg && !P.eggMesh) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.6 })); m.scale.set(1, 1.3, 1); m.position.copy(P.eggAt); m.castShadow = true; s.group.add(m); P.eggMesh = m; }
      if (!D.egg && P.eggMesh) { P.eggMesh.removeFromParent(); P.eggMesh = null; }
    }
  }
  buildCrops(s) {
    const D = s.data, P = s.parts;
    const stage = D.crop ? (D.grow >= 1 ? 3 : Math.min(2, Math.floor(D.grow * 3))) : -1;
    if (P.cropStage === stage && P.cropType === D.crop) return;
    P.cropStage = stage; P.cropType = D.crop;
    const grp = P.crops;
    while (grp.children.length) { const c = grp.children.pop(); c.geometry?.dispose(); }
    if (!D.crop) return;
    const C = CROPS[D.crop];
    const leafM = P.leafM || (P.leafM = new THREE.MeshStandardMaterial({ color: 0x4a8a30, roughness: 0.8, flatShading: true }));
    const fruitM = P.fruitM?.userData.crop === D.crop ? P.fruitM : (P.fruitM = Object.assign(new THREE.MeshStandardMaterial({ color: C.color, roughness: 0.4 }), { userData: { crop: D.crop } }));
    const sc = [0.25, 0.5, 0.8, 1][stage];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const x = -0.55 + i * 0.55, z = -0.55 + j * 0.55;
      const plant = new THREE.Group(); plant.position.set(x, 0.21, z); plant.rotation.y = i * 1.3 + j * 0.7; grp.add(plant);
      if (D.crop === 'seed_fern') {
        for (let k = 0; k < 5; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.4, 3), leafM); f.position.set(Math.cos(k * 1.26) * 0.08 * sc, 0.18 * sc, Math.sin(k * 1.26) * 0.08 * sc); f.rotation.set(Math.sin(k * 1.26) * 0.7, 0, -Math.cos(k * 1.26) * 0.7); f.scale.setScalar(sc); plant.add(f); }
        if (stage === 3) for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.012, 4, 8, 4), fruitM); c.position.set((k - 1) * 0.05, 0.3, 0); plant.add(c); }
      } else if (D.crop === 'seed_root') {
        for (let k = 0; k < 4; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 3), leafM); f.position.set(0, 0.12 * sc, 0); f.rotation.set(0.5, k * 1.57, 0); f.scale.setScalar(sc); plant.add(f); }
        if (stage === 3) { const r = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 5), fruitM); r.position.y = 0.02; r.scale.set(1, 0.7, 1); plant.add(r); }
      } else {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), leafM); bush.position.y = 0.14 * sc; bush.scale.setScalar(sc); plant.add(bush);
        if (stage >= 2) for (let k = 0; k < (stage === 3 ? 6 : 2); k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 5, 4), stage === 3 ? fruitM : leafM); const a = k * 1.05; b.position.set(Math.cos(a) * 0.13 * sc, 0.16 * sc + (k % 2) * 0.05, Math.sin(a) * 0.13 * sc); plant.add(b); }
      }
    }
    grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  updateVisuals(dt) {
    const g = this.g, cam = g.engine.camera.position;
    const t = this.t;
    for (const s of this.list.values()) {
      const d2 = (s.x - cam.x) ** 2 + (s.z - cam.z) ** 2;
      if (d2 > 90 * 90) continue;
      const P = s.parts, D = s.data, def = s.def;
      const lit = s.isLit;
      if (s.light && s.light.on) s.light.pos.copy(s.group.localToWorld((s.anchors.fire ?? s.anchors.light ?? new THREE.Vector3(0, 1, 0)).clone()));
      // auto torches: light at dusk
      if (def.autoNight) { const want = !D.off; if (want !== s.isLit) this.applyVisual(s); }
      if (lit && (s.anchors.fire) && (s.type === 'campfire' || s.type === 'torch_stand' || s.type === 'cooking_pot')) {
        s.fxT = (s.fxT ?? 0) - dt;
        if (s.fxT <= 0) {
          s.fxT = s.type === 'torch_stand' ? 0.09 : 0.06;
          const a = s.group.localToWorld(s.anchors.fire.clone());
          const big = s.type === 'campfire' ? Math.min(1.2, 0.5 + D.fuel / 400) : 0.45;
          g.fx.flame(a, big);
          if (Math.random() < 0.25) g.fx.ember(a);
          if (Math.random() < 0.12 && d2 < 40 * 40) g.fx.smoke(a.clone().add(new THREE.Vector3(0, 0.6, 0)), 0x7a7470, 0.6);
          if (Math.random() < 0.04 && d2 < 30 * 30) g.audio?.play('crackle', { pos: a, vol: 0.45, gap: 200 });
        }
      }
      if (lit && s.anchors.smoke && (s.type === 'kiln' || s.type === 'forge' || s.type === 'smoker' || s.type === 'generator')) { if (Math.random() < dt * 4) g.fx.smoke(s.group.localToWorld(s.anchors.smoke.clone()), 0x6a6460, 0.7); }
      if (s.type === 'cooking_pot' && lit && s.anchors.steam && Math.random() < dt * 3) g.fx.smoke(s.group.localToWorld(s.anchors.steam.clone()), 0xe8eef2, 0.35);
      if (P.fan && lit) P.fan.rotation.z += dt * 25;
      if (P.head && s.type === 'sprinkler' && lit) { P.head.rotation.y += dt * 4; if (Math.random() < dt * 8) { const a = s.group.localToWorld(s.anchors.spray.clone()); g.fx.sprite('puff', a.x, a.y, a.z, { vx: Math.cos(t * 4) * 2, vy: 1.2, vz: Math.sin(t * 4) * 2, life: 0.7, size: 0.12, color: 0xbfe8ff, alpha: 0.6, grav: 6 }); } }
      if (P.wheel && D.dinoIn) P.wheel.rotation.x += dt * 1.2;
      if (P.arm && lit) P.arm.rotation.y = Math.sin(t * 0.8) * 1.2;
      if (P.light && s.type === 'radio_tower') P.light.material.emissiveIntensity = lit && Math.sin(t * 3) > 0.6 ? 3 : 0;
      if (P.dish && lit) P.dish.rotation.z += dt * 0.6;
      if (P.cloth) { const pa = P.cloth.geometry.attributes.position; if (!P.cloth.userData.base) P.cloth.userData.base = pa.array.slice(); const b = P.cloth.userData.base; const w = 0.6 + g.weather.cur.wind * 0.4; for (let i = 0; i < pa.count; i++) { const x = b[i * 3] + 0.45; pa.setZ(i, Math.sin(t * 5 * w + x * 7) * 0.06 * x * w); } pa.needsUpdate = true; }
      if (P.lid && s.inv) { const open = g.ui?.container?.cont?.inv === s.inv; const target = open ? -1.1 : 0; P.lid.rotation.x += (target - P.lid.rotation.x) * Math.min(1, dt * 8); }
      if (P.stew) P.stew.visible = !!g.crafting?.job && g.crafting.job.r.station === 'cooking_pot' && Math.hypot(g.local.pos.x - s.x, g.local.pos.z - s.z) < 5;
      if (P.bellows) P.bellows.scale.y = 1 + (lit ? Math.sin(t * 3) * 0.3 : 0);
      if (P.brew) P.brew.visible = (D.brewT ?? 0) > 0 || Math.sin(t * 0.3) > 0.2;
    }
  }

  // ======================================================================== save / net
  serialize() { return [...this.list.values()].map((s) => this.record(s)); }
  load(arr) { for (const s of [...this.list.keys()]) this.destroy(s); for (const r of arr ?? []) this.create(r); }
  applyState(r) { const s = this.list.get(r.id); if (!s) { this.create(r); return; } Object.assign(s.data, r.data); if (s.inv && r.data.inv) s.inv.load(r.data.inv); this.applyVisual(s); }
}

// ========================================================================== install
export async function install(g) {
  const S = new Structures(g);
  S.registerActions();
  g.addSystem(S);
  g.interaction.handlers.push((o, d, reach) => S.raycast(o, d, reach));
  g.heldHandlers.placeable = () => { if (g.input.pressed('use')) S.tryPlace(); return true; };
  g.stationProviders.push((p) => {
    const out = [];
    for (const s of S.list.values()) if (s.def.station && (s.x - p.x) ** 2 + (s.z - p.z) ** 2 < 16 && Math.abs(s.y - p.y) < 2.5 && S.isLit(s)) out.push(s.def.station);
    return out;
  });
  g.saveables.structures = { save: () => S.serialize(), load: (d) => S.load(d) };
  g.netHandlers.structAdd = (r) => S.create(r);
  g.netHandlers.structGone = ({ id }) => S.destroy(id);
  g.netHandlers.structState = (r) => S.applyState(r);
  g.netHandlers.wake = (m) => { g.time.elapsed = m.elapsed; g.local.sleeping = false; };
  g.structures.surfaceAt = () => 'step_wood';
  // dinos and the journal can ask what is around
  g.scareSources = (pos, r = 20) => [...S.list.values()].filter((s) => s.def.scare && (s.isLit || s.def.trophy) && Math.hypot(s.x - pos.x, s.z - pos.z) < r + s.def.scare);
  return S;
}
