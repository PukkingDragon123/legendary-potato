// Aiming, prompts and the "do things" layer: swing tools at trees/rocks/dinos,
// pick stuff up, eat, drink, use interactables (van, stations, doors, dinos).
// Everything that changes shared world state goes through game.act(...) so it
// works the same in single-player, as host and as client.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { SPECIES } from '../world/plantModels.js';

const REACH = 3.3;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _t = new THREE.Vector3();

export class Interaction {
  constructor(game) {
    this.name = 'interaction';
    this.game = game;
    this.target = null;
    this.hold = 0;
    this.useHeld = false;
    this.handlers = []; // extra target providers: fn(origin, dir, reach) -> {dist, label, key, onInteract, onUse, info}
    game.act = (type, data) => this.act(type, data);
    this.actions = {};
    this.registerActions();
  }

  registerActions() {
    const g = this.game;
    const A = this.actions;
    // tree chopping
    A.hitTree = ({ i, dmg, dirX, dirZ, by }) => {
      const t = g.flora.trees[i];
      if (!t || !t.alive) return;
      t.hp -= dmg;
      g.events.emit('treeHit', { tree: t, by });
      if (t.hp <= 0) {
        g.flora.fell(t, dirX, dirZ);
        t.regrowAt = g.time.elapsed + 2400 + Math.random() * 1200;
        g.events.emit('treeFelled', { tree: t, by });
        if (g.net?.broadcast) g.net.broadcast('treeFell', { i, dirX, dirZ });
        const sp = SPECIES[t.key];
        if (by === g.local.id) {
          const big = t.height > 12;
          setTimeout(() => {
            for (const [id, n] of Object.entries(sp.yield)) g.give(id, Math.max(1, Math.round(n * (big ? 1.3 : 1) * t.scale)), { from: sp.name });
          }, 900);
        } else if (g.net?.sendTo) g.net.sendTo(by, 'give', { items: Object.entries(sp.yield).map(([id, n]) => [id, Math.max(1, Math.round(n * t.scale))]), from: sp.name });
      } else if (g.net?.broadcast) g.net.broadcast('treeHp', { i, hp: t.hp });
    };
    A.hitNode = ({ id, tool, power, by }) => {
      const nd = g.nodes.byId.get(id);
      if (!nd) return;
      const res = g.nodes.hit(nd, tool ? ITEMS[tool] : null, power);
      if (!res) return;
      if (by === g.local.id || !g.net?.sendTo) for (const [it, n] of res.drops) g.give(it, n, { from: nd.def.name });
      else if (res.drops.length) g.net.sendTo(by, 'give', { items: res.drops, from: nd.def.name });
      if (res.destroyed) { g.events.emit('nodeDepleted', { node: nd, by }); g.net?.broadcast?.('nodeState', { id, until: g.nodes.state.get(id).until }); }
    };
  }

  act(type, data) {
    const g = this.game;
    data.by = data.by ?? g.local.id;
    if (g.net && !g.isHost) { g.net.send('act', { type, data }); return; }
    const fn = this.actions[type] ?? g.actionHandlers?.[type];
    if (fn) fn(data);
    else console.warn('no action', type);
  }

  aimRay() {
    const cam = this.game.engine.camera;
    _o.copy(cam.position);
    cam.getWorldDirection(_d);
    // start the ray near the player so we don't target things behind them
    const head = this.game.local.headPos(_t);
    const along = Math.max(0, _d.dot(_t.sub(_o)));
    _o.addScaledVector(_d, along);
    return { o: _o, d: _d, reach: REACH + 0.6 };
  }

  // find what we're looking at
  scan() {
    const g = this.game;
    const { o, d, reach } = this.aimRay();
    let best = null;
    const consider = (c) => { if (c && c.dist <= reach && (!best || c.dist < best.dist)) best = c; };
    // custom providers (van, structures, dinos, drops, players...)
    for (const h of this.handlers) consider(h(o, d, reach));
    // trees
    const tr = g.flora.raycastTree(o, d, reach);
    if (tr) {
      const t = tr.tree, sp = SPECIES[t.key];
      consider({ dist: tr.dist, kind: 'tree', tree: t, label: sp.name, use: 'Chop', tool: 'axe', hp: t.hp / t.maxHp, small: t.small });
    }
    // resource nodes
    const nr = g.nodes.raycast(o, d, reach);
    if (nr) {
      const nd = nr.node, def = nd.def;
      const depleted = g.nodes.isDepleted(nd);
      const st = g.nodes.state.get(nd.id);
      consider({ dist: nr.dist, kind: 'node', node: nd, label: def.name + (depleted ? ' (picked)' : ''), use: def.tool === 'pick' ? 'Mine' : def.pickup || def.keep ? null : 'Hit', interact: !depleted && (def.pickup || def.keep || def.tool === 'hand') ? (def.keep ? 'Pick' : 'Take') : null, tool: def.tool, hp: st && def.hp > 1 ? st.hp / def.hp : null, depleted });
    }
    // water surface
    const wr = this.rayWater(o, d, reach);
    if (wr && (!best || wr.dist < best.dist - 0.2)) best = { dist: wr.dist, kind: 'water', label: 'Water', interact: 'Drink', point: wr.point };
    return best;
  }

  rayWater(o, d, reach) {
    const s = this.game.sampler;
    for (let t = 0.3; t < reach; t += 0.2) {
      const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const wl = s.waterAt(x, z);
      if (wl > -999 && y <= wl + 0.05) return { dist: t, point: new THREE.Vector3(x, wl, z) };
      if (y < s.heightAt(x, z)) return null;
    }
    return null;
  }

  update(dt) {
    const g = this.game, p = g.local, inp = g.input;
    if (g.uiOpen || p.downed || p.sitting || p.sleeping) { this.target = null; g.ui?.setPrompt(null); return; }
    // hotbar selection
    for (let i = 0; i < 8; i++) if (inp.pressed('hot' + (i + 1))) this.select(i);
    if (inp.wheel && !inp.down('crouch') && !g.building?.active) { this.select((g.inventory.selected + (inp.wheel > 0 ? 1 : 7)) % 8); g.wheelCaptured = true; } else g.wheelCaptured = !!g.building?.active;
    const held = g.inventory.held();
    const hdef = held ? ITEMS[held.id] : null;
    p.setHeld(held?.id ?? null);
    // targeting
    const tgt = this.scan();
    this.target = tgt;
    g.ui?.setTarget(tgt);
    // prompt text
    let prompt = null;
    if (tgt) {
      if (tgt.interact) prompt = { key: inp.keyName('interact'), text: `${tgt.interact} ${tgt.label}` };
      if (tgt.use && (!prompt || tgt.kind === 'tree')) {
        const kind = hdef?.tool?.kind ?? 'hand';
        const right = tgt.tool === 'any' || tgt.tool === kind || (tgt.tool === 'axe' && tgt.small);
        prompt = { key: 'LMB', text: `${tgt.use} ${tgt.label}`, warn: right ? null : tgt.tool === 'axe' ? 'Needs a hatchet' : tgt.tool === 'pick' ? 'Needs a pickaxe' : null, alt: prompt };
      }
      if (tgt.prompt) prompt = tgt.prompt;
    }
    g.ui?.setPrompt(prompt);
    // E: interact
    if (inp.pressed('interact') && tgt) {
      if (tgt.onInteract) tgt.onInteract();
      else if (tgt.kind === 'node' && tgt.interact) this.pickNode(tgt.node);
      else if (tgt.kind === 'water') this.drinkHere(tgt.point);
    }
    // LMB: use held / swing
    if (inp.down('use') && !p.action && !g.building?.active && !g.ui?.consumesClick) this.useHeld_(held, hdef, tgt);
    // drop
    if (inp.pressed('drop') && held && g.drops) {
      const s = g.inventory.removeAt(g.inventory.selected, inp.down('sprint') ? held.n : 1);
      if (s) g.drops.throwFromPlayer(s);
    }
  }

  select(i) {
    const g = this.game;
    if (g.inventory.selected === i) return;
    g.inventory.selected = i;
    g.inventory.changed();
    g.audio?.play('ui_tick', { vol: 0.25 });
  }

  pickNode(nd) {
    const g = this.game, p = g.local;
    if (!p.startAction('pickup', 0.45, () => {
      g.act('hitNode', { id: nd.id, tool: g.inventory.held()?.id ?? null, power: 1 });
      const pos = new THREE.Vector3(nd.x, nd.y + 0.4, nd.z);
      if (nd.def.model === 'bush') { g.fx.leaves(pos, 4, 0x4a8a30); g.audio?.play('rustle', { pos }); }
      else if (nd.def.model === 'tuft' || nd.def.model === 'fern' || nd.def.model === 'herb') { g.fx.leaves(pos, 3, 0x6aa040); g.audio?.play('pluck', { pos }); }
      else { g.audio?.play('pickup', { pos }); g.fx.dust(pos, 2); }
      if (nd.def.stings && Math.random() < 0.6) { setTimeout(() => { g.vitals?.damage(4, { kind: 'bees' }); g.ui?.toast('Ow! Bees!', 'warn'); p.panic = 2; }, 300); }
    })) return;
  }

  drinkHere(point) {
    const g = this.game, p = g.local;
    p.startAction('drink', 1.1, () => {
      g.vitals?.drink(18, true);
      g.audio?.play('drink', { pos: point });
      g.fx.splash(point.x, point.y, point.z, 0.4);
    }, 0.6);
  }

  useHeld_(held, hdef, tgt) {
    const g = this.game, p = g.local;
    const kind = hdef?.tool?.kind ?? (hdef ? null : 'hand');
    // consumables
    if (hdef?.food) {
      if (hdef.id === 'water_clean' || hdef.id === 'water_dirty' || hdef.id === 'coffee') {
        p.startAction('eat', 0.9, () => { if (g.inventory.remove(hdef.id, 1)) { g.vitals.eat(hdef.id); g.audio?.play('drink', { pos: p.pos }); } }, 0.65);
      } else {
        p.startAction('eat', 0.9, () => { if (g.inventory.remove(hdef.id, 1)) { g.vitals.eat(hdef.id); g.audio?.play('munch', { pos: p.pos }); g.fx.chips_(p.pos.x, p.pos.y + 0.95, p.pos.z, 4, [hdef.color ?? 0xd8302a], { speed: 1.2, size: 0.03, life: 1 }); } }, 0.6);
      }
      return;
    }
    if (hdef?.med) { p.startAction('eat', 1.2, () => { if (g.inventory.remove(hdef.id, 1)) { g.vitals.useMed(hdef.id); g.audio?.play('heal', { pos: p.pos }); g.fx.hearts(p.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), 3); } }, 0.7); return; }
    if (kind === 'canteen') {
      if (tgt?.kind === 'water') { p.startAction('drink', 1.0, () => { g.give('water_dirty', 1, { quiet: false }); g.audio?.play('fill', { pos: p.pos }); }, 0.6); }
      return;
    }
    // custom held-item handlers (scanner, building, throwing, placing, whistle...)
    if (hdef && g.heldHandlers?.[kind ?? hdef.cat]) { if (g.heldHandlers[kind ?? hdef.cat](held, hdef, tgt) !== false) return; }
    // swings: hand punch / tools
    const swingKinds = { hand: 'punch', axe: 'chop', pick: 'mine', club: 'club', hammer: 'hammer', shovel: 'mine', sickle: 'swing', spear: 'swing', torch: 'swing', rod: 'swing' };
    const anim = swingKinds[kind] ?? (hdef ? 'swing' : 'punch');
    const speed = hdef?.tool?.speed ?? 1;
    const dur = (anim === 'punch' ? 0.42 : 0.62) / speed;
    const stamina = g.vitals;
    if (stamina && stamina.stamina < 3) { g.ui?.toast('Too tired!', 'warn'); return; }
    p.startAction(anim, dur, () => this.impact(held, hdef, kind), anim === 'punch' ? 0.45 : 0.55, { faceCam: true, side: (this._side = !this._side) });
    stamina?.useStamina(anim === 'punch' ? 1.5 : 3);
    g.audio?.play('whoosh', { pos: p.pos, vol: 0.35, rate: 1.1 / speed });
  }

  impact(held, hdef, kind) {
    const g = this.game, p = g.local;
    const tgt = this.scan();
    if (!tgt) return;
    const point = this.aimPoint(tgt.dist);
    const dirX = -Math.sin(p.yaw), dirZ = -Math.cos(p.yaw);
    const dir = new THREE.Vector3(dirX, 0, dirZ);
    let used = false;
    if (tgt.kind === 'tree') {
      const t = tgt.tree;
      const isAxe = kind === 'axe';
      const dmg = isAxe ? hdef.tool.dmg : t.small ? 6 : kind === 'hand' ? 1 : 2.5;
      g.act('hitTree', { i: t.i, dmg, dirX, dirZ });
      g.fx.hitWood(point, dir.clone().negate());
      if (Math.random() < 0.6) g.fx.leaves(new THREE.Vector3(t.x, t.y + Math.min(t.height * 0.7, 9), t.z), t.small ? 3 : 7, t.key === 'ginkgo' && t.variant === 3 ? 0xd9a93a : 0x5a9a3a);
      g.audio?.play(isAxe ? 'chop' : kind === 'hand' ? 'punch_wood' : 'thunk', { pos: point });
      g.rig.addTrauma(isAxe ? 0.12 : 0.06);
      if (!isAxe && !t.small && kind === 'hand' && Math.random() < 0.3) { g.vitals?.damage(1, { kind: 'punch' }); g.ui?.toast('Ouch. Trees are hard.', 'warn'); }
      used = true;
    } else if (tgt.kind === 'node') {
      const nd = tgt.node;
      const isRock = nd.def.tool === 'pick';
      g.act('hitNode', { id: nd.id, tool: held?.id ?? null, power: 1 });
      if (isRock) { g.fx.hitStone(point, dir.clone().negate(), nd.def.model === 'meteor' ? 0x6a6a72 : nd.def.model === 'sulfur' ? 0xd8c030 : 0x8a8780); g.audio?.play(kind === 'pick' ? 'clink' : 'thud', { pos: point }); g.rig.addTrauma(0.1); }
      else { g.fx.leaves(point, 3); g.audio?.play('rustle', { pos: point }); }
      used = true;
    } else if (tgt.onHit) { tgt.onHit({ held, hdef, kind, point, dir }); used = true; }
    if (used && held && held.dur !== undefined) {
      if (g.inventory.useDurability(g.inventory.selected, 1)) { g.ui?.toast(`${hdef.name} broke!`, 'warn'); g.audio?.play('break', { pos: p.pos }); }
    }
  }

  aimPoint(dist) { const { o, d } = this.aimRay(); return o.clone().addScaledVector(d, Math.max(0.2, dist - 0.05)); }
}
