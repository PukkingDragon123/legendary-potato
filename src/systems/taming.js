// Taming + life with tamed dinos: bribe taming (patient feeding), knock-out
// taming (feed while it snoozes, keep it asleep with snoozeberries), nets,
// eggs/babies; then names, personalities, happiness, petting, orders
// (follow / stay / wander / work / guard), species jobs that deliver to
// crates, riding with saddles (incl. flying), breeding and growing up.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { PERSONALITIES } from '../entities/dinoSpecies.js';
import { SPECIES as PLANTS } from '../world/plantModels.js';
import { buildDino, DinoRig } from '../entities/dinoModel.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const angleTo = (a, b) => { const d = b - a; return Math.atan2(Math.sin(d), Math.cos(d)); };
const JOB_NODES = {
  gather: ['sticks', 'rock_small', 'fiber'],
  forage: ['bush_red', 'bush_blue', 'bush_sun', 'bush_snooze'],
  harvest: ['fiber', 'fern', 'herb'],
  mine: ['boulder', 'boulder_big', 'flint', 'ore_copper', 'ore_iron', 'sulfur', 'obsidian'],
};

export class Taming {
  constructor(game) {
    this.name = 'taming';
    this.g = game;
    this.breedT = 60;
    game.taming = this;
  }

  // ---------------------------------------------------------------- food helpers
  foodValue(d, id) {
    if (!id) return 0;
    const sp = d.sp;
    if (id === sp.favorite) return 2;
    if (sp.foods.includes(id)) return 1;
    return 0;
  }
  needsResearch(d) { const r = d.sp.tame.research; return r && !this.g.research?.has(r) ? r : null; }

  // ---------------------------------------------------------------- interaction target for a dino
  target(d, dist) {
    const g = this.g, sp = d.sp;
    const key = g.input.keyName('interact'), ck = g.input.keyName('command');
    const held = g.inventory.held(), hid = held?.id ?? null, hdef = hid ? ITEMS[hid] : null;
    const t = { dist, kind: 'dino', dino: d, label: d.tamed ? `${d.displayName} (${sp.short})` : `${sp.short}${d.baby ? ' (baby)' : ''}`, hp: d.hp / d.maxHp, hpColor: d.tamed ? '#7bc86c' : sp.predator ? '#e04a3a' : '#e8a040' };
    if (d.state === 'dead') {
      t.label = d.sp.alpha ? `${d.displayName}'s carcass` : `${sp.short} carcass`; t.hp = null; t.info = 'Harvest meat, hide, bones and DNA';
      const c = g.dinos.corpses.find((x) => x.d === d);
      if (c) { t.prompt = { key, text: 'Harvest' }; t.onInteract = () => g.local.startAction('chop', 0.6, () => g.act('dino_harvest', { id: d.id }), 0.5, { faceCam: true }); }
      return t;
    }
    if (d.tamed) {
      const P = PERSONALITIES.find((p) => p.id === d.personality);
      t.info = `${P?.name ?? ''} · ${d.order}${d.job ? ' (' + (sp.job?.name ?? 'work') + ')' : ''} · ♥ ${Math.round(d.happy)}%`;
      if (hdef?.food && this.foodValue(d, hid) > 0) { t.prompt = { key, text: `Feed ${hdef.name}` }; t.onInteract = () => this.feedTamed(d); }
      else if (hdef?.saddle && sp.ride && !d.saddle && hdef.saddle === sp.ride.saddle) { t.prompt = { key, text: `Put on ${hdef.name}` }; t.onInteract = () => g.act('dino_saddle', { id: d.id, item: hid }); }
      else { t.prompt = { key, text: 'Pet' }; t.onInteract = () => this.pet(d); }
      t.prompt.alt = d.saddle && sp.ride && (!d.baby || d.growth > 0.8) ? { key: ck, text: 'Ride' } : { key: ck, text: 'Orders' };
      t.onCommand = () => (d.saddle && sp.ride && (!d.baby || d.growth > 0.8) ? this.ride(d, g.local) : g.ui?.openPDA?.('dinos'));
      if (d.baby) t.info += ` · growing ${Math.round(d.growth * 100)}%`;
      return t;
    }
    // ---- wild
    const res = this.needsResearch(d);
    t.info = sp.temper;
    if (d.state === 'ko') {
      t.torpor = Math.min(1, d.torpor / d.maxTorpor); t.tame = Math.min(1, d.tame.progress);
      if (res) { t.prompt = { key: '-', text: 'Too wild to tame', warn: 'Research ' + g.research?.techName(res) }; return t; }
      const v = this.foodValue(d, hid);
      if (hid === 'snoozeberry') { t.prompt = { key, text: 'Feed Snoozeberries (keeps it asleep)' }; t.onInteract = () => this.feedKO(d, hid); }
      else if (v > 0) { t.prompt = { key, text: `Feed ${hdef.name}${v > 1 ? ' (favourite!)' : ''}` }; t.onInteract = () => this.feedKO(d, hid); }
      else t.prompt = { key: '-', text: 'Knocked out', warn: `Hold food it likes: ${sp.foods.slice(0, 3).map((f) => ITEMS[f]?.name).join(', ')}` };
      t.info = `${sp.tame.method === 'knockout' ? 'Feed it before it wakes up!' : 'Feed it!'} Favourite: ${ITEMS[sp.favorite]?.name}`;
      return t;
    }
    if (sp.tame.method === 'bribe' && !sp.predator) {
      t.tame = d.tame.progress > 0 ? Math.min(1, d.tame.progress) : undefined;
      if (res) { t.prompt = { key: '-', text: 'Ignores you', warn: 'Research ' + g.research?.techName(res) }; return t; }
      const v = this.foodValue(d, hid);
      if (v > 0 && dist < 4 + d.radius) { t.prompt = { key, text: `Offer ${hdef.name}${v > 1 ? ' (favourite!)' : ''}`, warn: g.local.crouch ? null : 'Crouch to seem less scary' }; t.onInteract = () => this.bribe(d, hid); }
      else if (v > 0) t.prompt = { key: '-', text: 'Get closer slowly (crouch)' };
      else t.info = `${sp.temper} · likes ${ITEMS[sp.favorite]?.name}`;
    } else if (sp.tame.method === 'net') t.info = 'Catch it with a net, then feed it';
    else t.info = `${sp.temper} · knock it out to tame`;
    return t;
  }

  // ---------------------------------------------------------------- taming actions (go through host)
  feedKO(d, id) {
    const g = this.g;
    g.local.startAction('pickup', 0.5, () => { if (g.inventory.remove(id, 1)) g.act('dino_feed', { id: d.id, food: id }); });
  }
  bribe(d, id) {
    const g = this.g;
    if (g.local.sprint) { g.dinos.flee(d, g.local.pos, 5); return; }
    g.local.startAction('pickup', 0.6, () => { if (g.inventory.remove(id, 1)) g.act('dino_feed', { id: d.id, food: id, bribe: 1 }); });
  }
  feedTamed(d) {
    const g = this.g, held = g.inventory.held();
    g.local.startAction('pickup', 0.5, () => { if (held && g.inventory.remove(held.id, 1)) g.act('dino_feed', { id: d.id, food: held.id, tamed: 1 }); });
  }
  pet(d) {
    const g = this.g;
    g.local.startAction('pet', 1.2, () => g.act('dino_pet', { id: d.id }), 0.5);
  }
  registerActions() {
    const g = this.g, A = g.actionHandlers;
    const D = () => g.dinos;
    A.dino_feed = ({ id, food, bribe, tamed, by }) => {
      const d = D().list.get(id);
      if (!d) return;
      const v = this.foodValue(d, food);
      const ITEM = ITEMS[food];
      d.act('eat', 1.6);
      g.fx.hearts(_v.copy(d.pos).add(new THREE.Vector3(0, d.rig.height * d.sizeK * 0.8, 0)), v > 1 ? 4 : 2);
      g.audio?.play('eat_dino', { pos: d.pos, vol: 0.8 });
      if (tamed) { d.food = Math.min(100, d.food + (ITEM?.food?.hunger ?? 10) * 1.5); d.happy = Math.min(100, d.happy + 4 + v * 3); return; }
      if (food === 'snoozeberry') { d.torpor = Math.min(d.maxTorpor * 1.2, d.torpor + d.maxTorpor * 0.35); return; }
      if (v <= 0) return;
      if (bribe) {
        if (d.state === 'flee') return;
        d.setState('idle', 4); d.mood = 'happy'; d.alert = 0;
      }
      d.tame.progress += v / d.sp.tame.need;
      d.tame.by = by;
      d.tame.lastFed = g.time.elapsed;
      if (d.tame.progress >= 1) this.completeTame(d, by);
    };
    A.dino_pet = ({ id }) => {
      const d = D().list.get(id);
      if (!d || !d.tamed) return;
      d.happy = Math.min(100, d.happy + 6);
      d.act('happy', 1.2);
      g.fx.hearts(_v.copy(d.pos).add(new THREE.Vector3(0, d.rig.height * d.sizeK, 0)), 3);
      g.audio?.play('happy_dino', { pos: d.pos, vol: 0.8 });
      g.events.emit('dinoPet', { d });
    };
    A.dino_order = ({ id, order, x, z }) => {
      const d = D().list.get(id);
      if (!d || !d.tamed) return;
      d.order = order;
      d.anchor = new THREE.Vector3(x ?? d.pos.x, 0, z ?? d.pos.z);
      if (order === 'work') { d.job = d.sp.job ? { id: d.sp.job.id, anchor: d.anchor.clone(), t: 0, phase: 'find' } : null; if (d.job) g.events.emit('dinoJob', { d }); }
      else d.job = null;
      d.setState(order === 'stay' ? 'stay' : 'follow');
      d.act('call', 0.8);
    };
    A.dino_saddle = ({ id, item, by }) => {
      const d = D().list.get(id);
      if (!d || d.saddle) return;
      if (by === g.local.id && !g.inventory.remove(item, 1)) return;
      d.saddle = item; this.attachSaddle(d);
      g.audio?.play('build', { pos: d.pos });
      g.ui?.toast(`${d.displayName} is wearing a saddle! Press ${g.input.keyName('command')} to ride.`, '', item);
    };
    A.dino_harvest = ({ id, by }) => { const c = D().corpses.find((x) => x.d.id === id); if (c) D().harvestCorpse(c, by); };
    A.dino_hit = ({ id, dmg, torpor, by }) => {
      const d = D().list.get(id);
      if (!d) return;
      const who = g.players.get(by) ?? g.local;
      D().damage(d, dmg, torpor, who);
      g.events.emit('dinoHit', { d, by });
    };
    A.dino_net = ({ id }) => {
      const d = D().list.get(id);
      if (!d || d.tamed || d.sp.size > 2.2) return;
      d.setState('ko'); d.torpor = d.maxTorpor * 0.9; d.koT = 0; d.netted = true;
      g.audio?.play('bola', { pos: d.pos });
      if (d.carry) { g.drops?.spawn(d.carry.id, d.carry.n, d.pos.clone().add(new THREE.Vector3(0, 0.4, 0))); d.carry = null; }
      g.ui?.toast(`Caught a ${d.sp.short} in the net! Feed it now.`, '', 'net');
    };
    A.dino_bola = ({ id }) => { const d = D().list.get(id); if (!d || d.sp.size > 5) return; d.tangled = 6; d.setState('idle', 6); g.audio?.play('bola', { pos: d.pos }); g.fx.stars(_v.copy(d.pos).add(new THREE.Vector3(0, 0.6, 0)), 3); };
    A.dino_rename = ({ id, name }) => { const d = D().list.get(id); if (d) D().rename(d, name); };
  }
  completeTame(d, by) {
    const g = this.g;
    d.tamed = true; d.owner = by ?? g.local.id;
    d.name = d.sp.alphaName ?? g.dinos.randomName();
    d.personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)].id;
    d.order = 'follow'; d.happy = 80; d.food = Math.max(d.food, 60);
    d.torpor = 0; d.state = 'follow'; d.mood = 'happy'; d.netted = false;
    if (d.herd) { d.herd.members = d.herd.members.filter((m) => m !== d); if (d.herd.leader === d) d.herd.leader = d.herd.members[0] ?? null; d.herd = null; }
    d.act('happy', 2);
    g.fx.hearts(_v.copy(d.pos).add(new THREE.Vector3(0, d.rig.height * d.sizeK, 0)), 10);
    g.audio?.jingle?.('tame');
    if (d.owner === g.local.id) g.ui?.banner('TAMED!', `Say hi to ${d.name}`, `${d.sp.name} · ${PERSONALITIES.find((p) => p.id === d.personality)?.name}`);
    g.events.emit('tamed', { d, by });
    g.net?.broadcast?.('tamed', { id: d.id, name: d.name, owner: d.owner });
  }
  onTamedLoaded(d) { if (d.saddle) this.attachSaddle(d); }

  // ---------------------------------------------------------------- orders
  command(d, order) { const g = this.g; g.act('dino_order', { id: d.id, order, x: g.local.pos.x, z: g.local.pos.z }); }

  // ---------------------------------------------------------------- tamed behaviour (host)
  updateTamed(d, dt) {
    const g = this.g, sp = d.sp;
    if (d.riders.length) return;
    const owner = g.players.get(d.owner) ?? g.local;
    d.food = Math.max(0, d.food - dt * 0.015 * (d.personality === 'greedy' ? 2 : 1));
    d.happy = Math.max(0, Math.min(100, d.happy + dt * ((d.food > 40 ? 0.02 : -0.06) + (owner && d.dist2(owner.pos) < 400 ? 0.01 : 0) + (d.personality === 'cuddly' && owner && d.dist2(owner.pos) < 25 ? 0.03 : 0))));
    if (d.baby) { d.growth = Math.min(1, d.growth + dt / 1800); if (d.growth >= 0.5 && !d.grownModel) this.growUp(d); if (d.growth >= 1) { d.baby = false; } d.applyScale(); }
    // hungry: eat from a trough
    d.think -= dt;
    if (d.think <= 0) {
      d.think = 0.5 + Math.random() * 0.3;
      if (d.food < 45 && d.state !== 'eatTrough') {
        const tr = g.structures?.near(d.pos, 30, (s) => s.type === 'feed_trough' && s.inv?.slots.some((x) => x && this.foodValue(d, x.id) > 0));
        if (tr) { d.trough = tr; d.setState('eatTrough', 30); }
        else if (d.personality === 'greedy' || d.food < 15) {
          // funny: raid a crop plot
          const plot = g.structures?.near(d.pos, 25, (s) => s.type === 'crop_plot' && s.data.crop && s.data.grow > 0.3);
          if (plot && Math.random() < 0.3) { d.raid = plot; d.setState('raid', 20); }
        }
      }
      // tamed predators defend their humans
      if (sp.predator || d.order === 'guard') {
        let foe = null, fd = (d.order === 'guard' ? 25 : 14) ** 2;
        for (const o of g.dinos.list.values()) if (!o.tamed && o.state !== 'dead' && o.state !== 'ko' && o.isHostile() && o.sp.size < sp.size * 2.5) { const dd = o.dist2(d.pos); if (dd < fd) { fd = dd; foe = o; } }
        if (foe) { d.target = foe; d.setState('defend', 10); }
      }
      // alarm job: honk at predators
      if (d.job?.id === 'alarm') for (const o of g.dinos.list.values()) if (!o.tamed && o.sp.predator && o.dist2(d.pos) < 1600 && (d.alarmT ?? 0) < g.time.elapsed) { d.alarmT = g.time.elapsed + 30; d.act('call', 1.2); g.audio?.play('honk', { pos: d.pos, vol: 1.2, ref: 30 }); g.ui?.toast(`${d.displayName} is honking: predator near camp!`, 'warn', 'dino'); }
    }
    let speed = 0, yaw = d.yaw;
    const toward = (p, k) => { yaw = Math.atan2(-(p.x - d.pos.x), -(p.z - d.pos.z)); speed = k; };
    switch (d.state) {
      case 'eatTrough': {
        const tr = d.trough;
        if (!tr || !g.structures.list.has(tr.id)) { d.setState('follow'); break; }
        if (d.dist2(_v.set(tr.x, 0, tr.z)) > (d.radius + 1.2) ** 2) toward(_v, sp.stats.speed);
        else if (!d.action) {
          const sl = tr.inv.slots.findIndex((x) => x && this.foodValue(d, x.id) > 0);
          if (sl < 0) { d.setState('follow'); break; }
          const id = tr.inv.slots[sl].id;
          tr.inv.removeAt(sl, 1);
          d.food = Math.min(100, d.food + (ITEMS[id]?.food?.hunger ?? 10) * 1.5 * this.foodValue(d, id));
          d.act('eat', 1.8);
          g.structures.sync(tr);
          if (d.food > 85) d.setState(d.order === 'stay' ? 'stay' : 'follow');
        }
        break;
      }
      case 'raid': {
        const pl = d.raid;
        if (!pl || !g.structures.list.has(pl.id) || !pl.data.crop) { d.setState('follow'); break; }
        if (d.dist2(_v.set(pl.x, 0, pl.z)) > (d.radius + 0.8) ** 2) toward(_v, sp.stats.speed * 1.2);
        else if (!d.action) { d.act('eat', 2); pl.data.crop = null; pl.data.grow = 0; g.structures.applyVisual(pl); g.structures.sync(pl); d.food = Math.min(100, d.food + 40); g.fx.leaves(_v.set(pl.x, pl.y + 0.4, pl.z), 10); if (d.dist2(g.local.pos) < 2500) g.ui?.toast(`${d.displayName} ate your crops. Bad ${d.sp.short}!`, 'warn', 'dino'); d.setState('follow'); }
        break;
      }
      case 'defend': {
        const T = d.target;
        if (!T || T.state === 'dead' || T.state === 'ko' || d.dist2(T.pos) > 40 * 40) { d.setState(d.order === 'stay' ? 'stay' : 'follow'); d.target = null; break; }
        toward(T.pos, sp.stats.run);
        if (Math.sqrt(d.dist2(T.pos)) < d.radius + T.radius + 1 && !d.action) g.dinos.melee(d, T, sp.stats.charge ? 'headbutt' : d.sp.behaviour.tailWhip ? 'tailwhip' : 'bite');
        break;
      }
      case 'stay': speed = 0; if (Math.random() < dt * 0.02) d.act(Math.random() < 0.5 ? 'sniff' : 'shake', 1.2); if (Math.random() < dt * 0.01 && g.time.isNight) d.setState('sleepT', 30 + Math.random() * 60); break;
      case 'sleepT': speed = 0; if (d.stateT <= 0 || !g.time.isNight && Math.random() < dt * 0.1) d.setState(d.order === 'stay' ? 'stay' : 'follow'); break;
      default: {
        if (d.order === 'work' && d.job) { [speed, yaw] = this.work(d, dt); break; }
        if (d.order === 'wander' || d.order === 'guard') {
          const a = d.anchor ?? d.pos;
          if (!d.goal || d.dist2(d.goal) < 4 || Math.random() < dt * 0.05) { const ang = Math.random() * 6.28, r = 4 + Math.random() * 12; d.goal = new THREE.Vector3(a.x + Math.cos(ang) * r, 0, a.z + Math.sin(ang) * r); }
          toward(d.goal, sp.stats.speed * 0.6); if (d.dist2(d.goal) < 9) speed = 0;
          break;
        }
        // follow the owner
        if (!owner) break;
        const dist = Math.sqrt(d.dist2(owner.pos));
        const keep = 2.2 + d.radius * 1.6 + (d.personality === 'loyal' ? -0.6 : 0);
        if (dist > 90 && !owner.sitting) { const b = owner.pos.clone().add(new THREE.Vector3(-Math.sin(owner.yaw) * -6, 0, -Math.cos(owner.yaw) * -6)); d.pos.set(b.x, g.sampler.heightAt(b.x, b.z), b.z); }
        else if (dist > keep) toward(owner.pos, dist > keep * 3 ? sp.stats.run * 0.9 : sp.stats.speed * (dist > keep * 1.6 ? 1.2 : 0.8));
        else if (d.personality === 'lazy' && Math.random() < dt * 0.01) d.setState('sleepT', 15 + Math.random() * 20);
        else if (Math.random() < dt * 0.03 && !d.action) d.act(['sniff', 'shake', 'happy'][Math.floor(Math.random() * 3)], 1.2);
      }
    }
    if (d.state === 'sleepT') { d.anim.forceSleep = true; } else d.anim.forceSleep = false;
    d.wantYaw = yaw; d.wantSpeed = speed;
  }
  growUp(d) {
    // swap the cute baby model for adult proportions (keeps current scale)
    d.grownModel = true;
    const old = d.root;
    d.rig = buildDino(d.sp, {});
    d.anim = new DinoRig(d.rig, d.sp);
    d.root = d.rig.root;
    old.parent?.add(d.root); old.removeFromParent();
    if (d.saddle) this.attachSaddle(d);
    this.g.ui?.toast(`${d.displayName} is growing up!`, '', 'dino');
  }

  // ---------------------------------------------------------------- jobs
  work(d, dt) {
    const g = this.g, J = d.job, sp = d.sp;
    let speed = 0, yaw = d.yaw;
    const toward = (p, k) => { yaw = Math.atan2(-(p.x - d.pos.x), -(p.z - d.pos.z)); speed = k; };
    J.t -= dt;
    const range = 24;
    switch (J.phase) {
      case 'find': {
        if (J.t > 0) { if (d.dist2(J.anchor) > 16) toward(J.anchor, sp.stats.speed * 0.8); break; }
        J.t = 3;
        J.target = this.findJobTarget(d, range);
        if (J.target) J.phase = 'go';
        else if (J.id === 'treasure' && Math.random() < 0.08) { J.cargo = [[['amber', 'mineral', 'fossil', 'scrap', 'crystal', 'amber_bug'][Math.floor(Math.random() * 5.2)], 1]]; J.phase = 'deliver'; }
        break;
      }
      case 'go': {
        const T = J.target;
        const p = T.pos ?? T;
        if (!p || (T.node && g.nodes.isDepleted(T.node)) || (T.tree && !T.tree.alive)) { J.phase = 'find'; break; }
        if (d.dist2(p) > (d.radius + 1.6) ** 2) toward(p, sp.stats.speed);
        else { J.phase = 'work'; J.t = J.id === 'fish' ? 5 : 2.4; yaw = Math.atan2(-(p.x - d.pos.x), -(p.z - d.pos.z)); }
        break;
      }
      case 'work': {
        const T = J.target;
        if (!d.action) d.act({ lumber: 'headbutt', mine: sp.behaviour.tailWhip ? 'tailwhip' : 'headbutt', fish: 'drink' }[J.id] ?? 'eat', 1.2, () => this.workImpact(d, T));
        if (J.t <= 0) { J.cargo = this.collect(d, T); J.phase = J.cargo?.length ? 'deliver' : 'find'; J.t = 0; d.xp += 10; if (d.xp >= d.level * 100) { d.xp = 0; d.level++; g.ui?.toast(`${d.displayName} reached level ${d.level}!`, '', 'star'); } }
        break;
      }
      case 'deliver': {
        const crate = g.structures?.near(J.anchor, 30, (s) => s.type === 'storage_box' && s.inv && s.inv.slots.some((x) => !x));
        const dest = J.id === 'treasure' ? (g.players.get(d.owner) ?? g.local).pos : crate ? _v.set(crate.x, 0, crate.z) : J.anchor;
        if (d.dist2(dest) > (d.radius + 1.6) ** 2) { toward(dest, sp.stats.speed); break; }
        for (const [id, n] of J.cargo ?? []) {
          if (crate && J.id !== 'treasure') { const left = crate.inv.add(id, n); if (left > 0) g.drops?.spawn(id, left, new THREE.Vector3(crate.x, crate.y + 0.8, crate.z)); }
          else g.drops?.spawn(id, n, d.pos.clone().add(new THREE.Vector3(0, 0.6, 0)));
        }
        if (crate) g.structures.sync(crate);
        if (J.id === 'treasure') g.ui?.toast(`${d.displayName} brought you a present!`, '', J.cargo?.[0]?.[0]);
        g.audio?.play('pickup', { pos: d.pos, vol: 0.6 });
        J.cargo = null; J.phase = 'find'; J.t = 2;
        break;
      }
      default: J.phase = 'find';
    }
    return [speed, yaw];
  }
  findJobTarget(d, range) {
    const g = this.g, J = d.job, a = J.anchor;
    const r2 = range * range;
    if (JOB_NODES[J.id]) {
      let best = null, bd = r2;
      for (const nd of g.nodes.nearby ?? []) {
        if (!JOB_NODES[J.id].includes(nd.type) || g.nodes.isDepleted(nd)) continue;
        if (J.id === 'mine' && nd.def.tier > d.level) continue;
        const dd = (nd.x - a.x) ** 2 + (nd.z - a.z) ** 2;
        if (dd < bd) { bd = dd; best = nd; }
      }
      return best ? { node: best, pos: new THREE.Vector3(best.x, best.y, best.z) } : null;
    }
    if (J.id === 'lumber') {
      let best = null, bd = r2;
      g.flora.forEachNear(a.x, a.z, range, (t) => { if (!t.alive || t.small || t.key === 'giant' || t.key === 'redwood') return; const dd = (t.x - a.x) ** 2 + (t.z - a.z) ** 2; if (dd < bd) { bd = dd; best = t; } });
      return best ? { tree: best, pos: new THREE.Vector3(best.x, best.y, best.z) } : null;
    }
    if (J.id === 'farm') { const p = g.structures?.near(a, range, (s) => s.type === 'crop_plot' && s.data.crop && s.data.grow >= 1); return p ? { plot: p, pos: new THREE.Vector3(p.x, p.y, p.z) } : null; }
    if (J.id === 'fish') { const w = g.dinos.findWater(d); return w ? { water: true, pos: w } : null; }
    if (J.id === 'guard' || J.id === 'alarm' || J.id === 'base') return null;
    return null;
  }
  workImpact(d, T) {
    const g = this.g;
    if (!T) return;
    if (T.node) { g.fx.hitStone(T.pos.clone().add(new THREE.Vector3(0, 0.4, 0)), new THREE.Vector3(0, 1, 0), 0x8a8780); g.audio?.play(T.node.def.tool === 'pick' ? 'clink' : 'rustle', { pos: T.pos }); }
    if (T.tree) { g.fx.hitWood(T.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 0, 1)); g.audio?.play('thunk', { pos: T.pos }); g.rig.addTrauma(0.05 * Math.max(0, 1 - d.pos.distanceTo(g.local.pos) / 30)); }
    if (T.water) g.fx.splash(T.pos.x, T.pos.y, T.pos.z, 0.6);
  }
  collect(d, T) {
    const g = this.g, J = d.job, out = [];
    if (!T) return out;
    const mult = 1 + (d.level - 1) * 0.15;
    if (T.node) {
      const res = g.nodes.hit(T.node, null, 999);
      if (res) for (const [id, n] of res.drops) out.push([id, Math.max(1, Math.round(n * mult))]);
      if (J.id === 'harvest') out.push(['thatch', 1]);
      g.net?.broadcast?.('nodeState', { id: T.node.id, until: g.nodes.state.get(T.node.id)?.until });
    } else if (T.tree) {
      const t = T.tree;
      if (t.alive) { g.flora.fell(t, -Math.sin(d.yaw), -Math.cos(d.yaw)); t.regrowAt = g.time.elapsed + 2400; g.events.emit('treeFelled', { tree: t, by: 'dino' }); g.net?.broadcast?.('treeFell', { i: t.i, dirX: -Math.sin(d.yaw), dirZ: -Math.cos(d.yaw) }); }
      for (const [id, n] of Object.entries(PLANTS[t.key]?.yield ?? { log: 2 })) out.push([id, Math.max(1, Math.round(n * t.scale * mult))]);
    } else if (T.plot) {
      const s = T.plot; const C = g.structures && s.data.crop;
      if (C) { const n = 4 + Math.floor(Math.random() * 3); out.push([({ seed_berry: 'redberry', seed_fern: 'fiddlehead', seed_root: 'starchroot', seed_snooze: 'snoozeberry' })[s.data.crop], n]); if (Math.random() < 0.6) out.push([s.data.crop, 1]); s.data.crop = null; s.data.grow = 0; g.structures.applyVisual(s); g.structures.sync(s); }
    } else if (T.water) out.push(['fish_raw', 1 + (Math.random() < 0.3 * mult ? 1 : 0)]);
    return out;
  }

  // ---------------------------------------------------------------- riding
  attachSaddle(d) {
    if (d.saddleMesh) d.saddleMesh.removeFromParent();
    const R = d.rig, sp = d.sp;
    const br = R.br;
    const g = new THREE.Group();
    const leather = new THREE.MeshStandardMaterial({ color: 0x7a4a28, roughness: 0.75 });
    const strap = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 });
    const seatW = Math.max(0.35, br * 0.9), seatL = Math.max(0.5, br * 1.1 * (sp.ride?.seats ?? 1));
    const seat = new THREE.Mesh(new THREE.BoxGeometry(seatW, Math.max(0.08, br * 0.18), seatL), leather); seat.castShadow = true; g.add(seat);
    const horn = new THREE.Mesh(new THREE.CylinderGeometry(br * 0.06 + 0.02, br * 0.08 + 0.02, br * 0.3 + 0.08, 8), leather); horn.position.set(0, br * 0.2, -seatL * 0.45); g.add(horn);
    const band = new THREE.Mesh(new THREE.TorusGeometry(br * 1.05, Math.max(0.02, br * 0.05), 4, 16), strap); band.rotation.y = Math.PI / 2; band.position.y = -br * 0.95; g.add(band);
    if (sp.ride?.saddle === 'platform') { const deck = new THREE.Mesh(new THREE.BoxGeometry(br * 2.2, 0.12, br * 2.6), new THREE.MeshStandardMaterial({ color: 0xa87a4a, roughness: 0.8 })); deck.position.y = br * 0.15; g.add(deck); }
    const chest = R.bonePos[R.idx.chest], hips = R.bonePos[R.idx.hips];
    const mid = chest.clone().lerp(hips, 0.45);
    g.position.set(0, br * 1.02, 0);
    const holder = new THREE.Group(); holder.position.copy(mid).sub(hips); holder.add(g);
    R.bones.hips.add(holder);
    d.saddleMesh = holder;
    d.seatLocal = new THREE.Vector3(mid.x, mid.y + br * 1.05 + 0.05, mid.z);
  }
  ride(d, p) {
    const g = this.g;
    if (!d.saddle || p.sitting) return;
    const seats = d.sp.ride?.seats ?? 1;
    if (d.riders.length >= seats) { g.ui?.toast('No room on this dino!', 'warn'); return; }
    d.riders.push(p);
    p.sitting = { seat: 'dino', dino: d, ride: true, idx: d.riders.length - 1, since: g.time.elapsed };
    d.order = 'follow'; d.job = null;
    if (p.local) {
      g.cameraOverride = () => (g.rig.firstPerson ? null : { pos: d.pos.clone().add(new THREE.Vector3(0, d.rig.height * d.sizeK * 0.75, 0)), dist: 3.5 + d.sp.size * 0.45 });
      g.ui?.toast(`Riding ${d.displayName}! WASD move · Shift sprint · Space ${d.sp.ride?.fly ? 'fly up' : 'jump'} · LMB attack · E get off`, '', 'dino', 5000);
      g.events.emit('ride', { d });
    }
  }
  dismount(p) {
    const g = this.g, st = p.sitting;
    if (!st?.dino) return;
    const d = st.dino;
    d.riders = d.riders.filter((x) => x !== p);
    p.sitting = null;
    const side = new THREE.Vector3(Math.cos(d.yaw), 0, -Math.sin(d.yaw)).multiplyScalar(d.radius * d.sizeK + 0.9);
    const out = d.pos.clone().add(side);
    p.teleport(out.x, Math.max(g.sampler.heightAt(out.x, out.z), d.pos.y) + 0.1, out.z);
    if (p.local) g.cameraOverride = null;
    d.flying = false;
  }
  updateRiding(dt) {
    const g = this.g, p = g.local, st = p.sitting;
    if (!st?.dino) return;
    const d = st.dino, sp = d.sp, R = sp.ride ?? { speed: 6 };
    if (d.state === 'dead' || d.state === 'ko') { this.dismount(p); return; }
    // controls (only the first rider steers)
    if (st.idx === 0 && !g.uiOpen) {
      const ax = g.input.axis();
      const camYaw = g.rig.yaw;
      let speed = 0, yaw = d.yaw;
      if (Math.abs(ax.x) + Math.abs(ax.y) > 0.1) { yaw = camYaw + Math.atan2(-ax.x, ax.y); speed = R.speed * (g.input.down('sprint') ? 1.35 : 0.75) * Math.min(1, Math.hypot(ax.x, ax.y)); }
      if (ax.y < -0.5 && Math.abs(ax.x) < 0.3) { yaw = d.yaw; speed = -R.speed * 0.3; }
      const dy = angleTo(d.yaw, yaw);
      d.yaw += Math.max(-dt * 3, Math.min(dt * 3, dy));
      d.speed += ((speed < 0 ? speed : speed * Math.max(0.2, Math.cos(dy))) - d.speed) * Math.min(1, dt * 3);
      if (R.fly) {
        if (g.input.down('jump')) { d.flying = true; d.vy = Math.min(8, (d.vy ?? 0) + dt * 14); }
        else if (g.input.down('crouch')) d.vy = Math.max(-8, (d.vy ?? 0) - dt * 14);
        else d.vy = (d.vy ?? 0) * Math.max(0, 1 - dt * 2);
      } else if (g.input.pressed('jump') && !d.flying && d.pos.y <= g.sampler.heightAt(d.pos.x, d.pos.z) + 0.05 && sp.size < 6) d.vy = 7.5;
      if (g.input.pressed('use') && !d.action) {
        // attack whatever is in front
        let foe = null, fd = (d.radius * d.sizeK + 3) ** 2;
        for (const o of g.dinos.list.values()) if (o !== d && o.state !== 'dead') { const dd = o.dist2(d.pos); if (dd < fd) { fd = dd; foe = o; } }
        if (foe) g.dinos.melee(d, foe, sp.stats.charge ? 'headbutt' : sp.behaviour.tailWhip ? 'tailwhip' : 'bite');
        else d.act(sp.stats.roar ? 'roar' : 'call', 1.2);
        if (sp.stats.roar) { g.audio?.play('roar', { pos: d.pos, vol: 1.2 }); g.dinos.noise(d.pos, 50, 0.9); }
      }
      // move (physics-lite)
      const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw);
      d.pos.x += fx * d.speed * dt; d.pos.z += fz * d.speed * dt;
      const pp = { x: d.pos.x, y: d.pos.y, z: d.pos.z };
      g.physics.pushCircle(pp, d.radius * d.sizeK, d.pos.y, d.pos.y + d.rig.height * 0.6, { step: 0.6, skipSmall: true, onHit: (sh) => { if (sh.tree && sp.size > 6 && sh.tree.radius < 0.5 && Math.abs(d.speed) > 4) g.act('hitTree', { i: sh.tree.i, dmg: 999, dirX: fx, dirZ: fz }); } });
      d.pos.x = pp.x; d.pos.z = pp.z;
      const h = g.sampler.heightAt(d.pos.x, d.pos.z), wl = g.sampler.waterAt(d.pos.x, d.pos.z);
      const floor = wl > h && !R.swim && !R.fly ? wl - d.rig.height * d.sizeK * 0.5 : h;
      if (R.fly && d.flying) { d.pos.y += (d.vy ?? 0) * dt; if (d.pos.y < h + 0.2) { d.pos.y = h; d.flying = false; } d.pos.y = Math.min(d.pos.y, h + 120); }
      else { d.vy = (d.vy ?? 0) - 21 * dt; d.pos.y += d.vy * dt; if (d.pos.y < floor) { d.pos.y = floor; d.vy = 0; } }
      d.swim = wl > -999 && wl - h > d.rig.height * d.sizeK * 0.5;
      g.net?.send?.('dinoRide', { id: d.id, x: d.pos.x, y: d.pos.y, z: d.pos.z, yaw: d.yaw, sp: d.speed, fly: d.flying ? 1 : 0 });
    }
    // seat the riders
    d.root.updateMatrixWorld(true);
    for (const [i, r] of d.riders.entries()) {
      const seat = (d.seatLocal ?? new THREE.Vector3(0, d.rig.height * 0.6, 0)).clone().add(new THREE.Vector3(0, 0, i * Math.max(0.45, d.rig.br * 0.9)));
      seat.multiplyScalar(d.sizeK).applyAxisAngle(new THREE.Vector3(0, 1, 0), d.yaw).add(d.pos);
      r.pos.copy(seat); r.root.position.copy(seat); r.root.rotation.set(0, d.yaw, 0); r.yaw = d.yaw;
    }
    if (g.time.elapsed - (st.since ?? 0) > 0.4 && (g.input.pressed('interact') || g.input.pressed('dismount')) && !g.uiOpen) this.dismount(p);
  }

  // ---------------------------------------------------------------- breeding + misc
  breed(dt) {
    const g = this.g;
    this.breedT -= dt;
    if (this.breedT > 0 || !g.isHost) return;
    this.breedT = 120;
    const tames = g.dinos.tamed().filter((d) => !d.baby && d.happy > 75 && d.food > 55 && (d.breedAt ?? 0) < g.time.elapsed);
    const beds = g.structures?.all('dino_bed') ?? [];
    for (const bed of beds) {
      const near = tames.filter((d) => d.dist2(_v.set(bed.x, 0, bed.z)) < 144);
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j];
        if (a.sp.id !== b.sp.id || Math.random() > 0.35) continue;
        a.breedAt = b.breedAt = g.time.elapsed + 1500;
        g.drops?.spawn('egg_' + a.sp.id, 1, new THREE.Vector3(bed.x, bed.y + 0.6, bed.z));
        g.fx.hearts(_v.set(bed.x, bed.y + 1.2, bed.z), 10);
        g.ui?.toast(`${a.displayName} and ${b.displayName} laid an egg! Put it in an incubator.`, '', 'egg_' + a.sp.id, 6000);
        g.events.emit('bred', { a, b });
        return;
      }
    }
  }
  update(dt) {
    const g = this.g;
    this.updateRiding(dt);
    this.breed(dt);
    // command key on the targeted dino
    const tgt = g.interaction?.target;
    if (tgt?.kind === 'dino' && tgt.onCommand && g.input.pressed('command') && !g.uiOpen && !g.local.sitting) tgt.onCommand();
    // bribe-taming: sprinting or swinging near a trusting dino scares it off
    for (const d of g.dinos?.list.values() ?? []) {
      if (d.tamed || d.tame.progress <= 0 || d.state === 'ko') continue;
      if (g.time.elapsed - d.tame.lastFed > 90) d.tame.progress = Math.max(0, d.tame.progress - dt * 0.004);
      if (g.local.sprint && d.dist2(g.local.pos) < 64) { d.tame.progress *= 0.6; g.dinos.flee(d, g.local.pos, 5); }
    }
  }
}

export async function install(g) {
  const T = new Taming(g);
  T.registerActions();
  g.addSystem(T);
  g.netHandlers.tamed = ({ id, name, owner }) => { const d = g.dinos?.list.get(id); if (d) { d.tamed = true; d.name = name; d.owner = owner; } };
  g.netHandlers.dinoRide = (m) => { const d = g.dinos?.list.get(m.id); if (d) { d.pos.set(m.x, m.y, m.z); d.yaw = m.yaw; d.speed = m.sp; d.flying = !!m.fly; } };
  // hatchlings imprint on whoever is closest
  g.events.on('eggHatched', ({ species, pos }) => {
    if (!g.isHost && g.net) return;
    if (!species || !g.dinos) return;
    const d = g.dinos.spawn(species, pos.x + 0.6, pos.z + 0.6, { baby: true, growth: 0, tamed: true, owner: g.local.id });
    d.name = g.dinos.randomName(); d.personality = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)].id; d.state = 'follow'; d.happy = 95;
    g.ui?.banner('IT HATCHED!', `Meet ${d.name}`, `A baby ${d.sp.name}`);
    g.events.emit('tamed', { d, by: g.local.id, hatched: true });
  });
  return T;
}
