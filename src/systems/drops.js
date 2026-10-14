// Physical item drops: bounce, roll to rest on terrain/floors, glint, and can
// be picked up. Host-authoritative ids for co-op.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { buildItemModel } from '../gfx/itemModels.js';

let _nid = 1;
export class Drops {
  constructor(game) {
    this.name = 'drops';
    this.game = game;
    this.list = new Map();
    game.drops = this;
    game.interaction?.handlers.push((o, d, reach) => this.raycast(o, d, reach));
    this.group = new THREE.Group(); this.group.name = 'drops';
    game.engine.scene.add(this.group);
  }

  spawn(id, n, pos, vel = null, opt = {}) {
    const g = this.game;
    if (!ITEMS[id] || n <= 0) return null;
    if (g.net && !g.isHost && !opt.fromNet) { g.net.send('dropSpawn', { id, n, x: pos.x, y: pos.y, z: pos.z, vx: vel?.x ?? 0, vy: vel?.y ?? 0, vz: vel?.z ?? 0, dur: opt.dur }); return null; }
    const nid = opt.nid ?? g.local.id + ':' + _nid++;
    const mesh = buildItemModel(ITEMS[id]);
    const big = ['log', 'tire', 'kit', 'campfire_kit', 'saddle', 'dinoegg'].includes(ITEMS[id].model);
    mesh.scale.setScalar(big ? 1 : 1.25);
    this.group.add(mesh);
    const d = { nid, id, n, dur: opt.dur, pos: pos.clone(), vel: vel ? vel.clone() : new THREE.Vector3((Math.random() - 0.5) * 2, 3, (Math.random() - 0.5) * 2), spin: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6), mesh, rest: false, age: 0, r: big ? 0.25 : 0.12 };
    mesh.position.copy(d.pos);
    this.list.set(nid, d);
    if (g.net?.isHost && !opt.fromNet) g.net.broadcast('dropSpawn', { nid, id, n, x: pos.x, y: pos.y, z: pos.z, vx: d.vel.x, vy: d.vel.y, vz: d.vel.z, dur: opt.dur });
    return d;
  }
  throwFromPlayer(slot) {
    const p = this.game.local;
    const f = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const pos = p.pos.clone().add(new THREE.Vector3(0, 1.0, 0)).addScaledVector(f, 0.5);
    this.spawn(slot.id, slot.n, pos, f.multiplyScalar(3.5).add(new THREE.Vector3(0, 2.5, 0)), { dur: slot.dur });
    this.game.audio?.play('throw', { pos, vol: 0.4 });
  }
  remove(nid) { const d = this.list.get(nid); if (!d) return; d.mesh.removeFromParent(); this.list.delete(nid); }

  pickup(d) {
    const g = this.game;
    if (g.net && !g.isHost) { g.net.send('dropPick', { nid: d.nid }); return; }
    this.give(d, g.local.id);
  }
  give(d, toId) {
    const g = this.game;
    if (toId === g.local.id) {
      const left = g.inventory.add(d.id, d.n, d.dur !== undefined ? { dur: d.dur } : null);
      g.events.emit('loot', { id: d.id, n: d.n - left });
      if (left > 0) { d.n = left; g.ui?.toast('Backpack full!', 'warn'); return; }
    } else g.net?.sendTo(toId, 'give', { items: [[d.id, d.n]], dur: d.dur });
    g.audio?.play('pickup', { pos: d.pos, vol: 0.6 });
    this.remove(d.nid);
    g.net?.broadcast?.('dropGone', { nid: d.nid });
  }

  raycast(o, dir, reach) {
    let best = null, bt = reach;
    for (const d of this.list.values()) {
      const r = d.r + 0.25;
      const ox = o.x - d.pos.x, oy = o.y - d.pos.y, oz = o.z - d.pos.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z, c = ox * ox + oy * oy + oz * oz - r * r;
      const disc = b * b - c;
      if (disc < 0) continue;
      const t = -b - Math.sqrt(disc);
      if (t > 0 && t < bt) { bt = t; best = d; }
    }
    if (!best) return null;
    const d = best;
    const scan = d.id === 'dung' ? () => ({ key: 'dung:fresh', title: 'Fresh Dino Dung', fact: 'Still warm. Rich in methane. Could power a van, honestly.', cat: 'zoo', rp: 2, insight: 'dung' }) : undefined;
    return { dist: bt, kind: 'drop', label: `${ITEMS[d.id].name}${d.n > 1 ? ' ×' + d.n : ''}`, interact: 'Pick up', scan, onInteract: () => { this.game.local.startAction('pickup', 0.35, () => this.pickup(d)); } };
  }

  update(dt) {
    const g = this.game, phys = g.physics;
    const t = performance.now() / 1000;
    for (const d of this.list.values()) {
      d.age += dt;
      if (!d.rest) {
        d.vel.y -= 18 * dt;
        d.pos.addScaledVector(d.vel, dt);
        const ground = phys.groundAt(d.pos.x, d.pos.z, d.pos.y + 0.3, 0.3, d.r) + d.r * 0.6;
        const wl = g.sampler.waterAt(d.pos.x, d.pos.z);
        if (wl > -999 && d.pos.y < wl && ground < wl) { d.vel.multiplyScalar(0.9); d.vel.y += 22 * dt; if (d.pos.y > wl - 0.05) d.vel.y *= 0.5; }
        if (d.pos.y < ground) {
          d.pos.y = ground;
          if (Math.abs(d.vel.y) > 1.5) { d.vel.y = -d.vel.y * 0.35; d.vel.x *= 0.65; d.vel.z *= 0.65; d.spin.multiplyScalar(0.6); g.audio?.play('clack', { pos: d.pos, vol: Math.min(0.5, Math.abs(d.vel.y) * 0.1) }); }
          else { d.vel.set(0, 0, 0); d.rest = true; d.restY = ground; }
        }
        d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.z += d.spin.z * dt;
      } else {
        // gentle bob + spin so loot is easy to spot
        d.mesh.rotation.y += dt * 0.8;
        d.mesh.rotation.x *= 0.9; d.mesh.rotation.z *= 0.9;
        d.pos.y = d.restY + 0.04 + Math.sin(t * 2 + d.age) * 0.03;
      }
      d.mesh.position.copy(d.pos);
      if (d.age > 900 && g.isHost) { this.remove(d.nid); g.net?.broadcast?.('dropGone', { nid: d.nid }); }
      // sparkle
      if (d.id === 'dung') { if (d.rest && Math.random() < dt * 0.5) g.fx.sprite('puff', d.pos.x, d.pos.y + 0.2, d.pos.z, { life: 1.6, size: 0.22, vy: 0.35, grow: 0.6, alpha: 0.3, color: 0x9aa048, wobble: 1 }); }
      else if (d.rest && Math.random() < dt * 0.5) g.fx.sprite('spark', d.pos.x + (Math.random() - 0.5) * 0.2, d.pos.y + 0.15, d.pos.z + (Math.random() - 0.5) * 0.2, { life: 0.5, size: 0.08, vy: 0.3, color: 0xfff0b0 });
    }
  }
  serialize() { return [...this.list.values()].map((d) => [d.id, d.n, +d.pos.x.toFixed(2), +d.pos.y.toFixed(2), +d.pos.z.toFixed(2), d.dur ?? null]); }
  load(arr) { for (const [id, n, x, y, z, dur] of arr ?? []) this.spawn(id, n, new THREE.Vector3(x, y + 0.3, z), new THREE.Vector3(0, 0, 0), { dur: dur ?? undefined }); }
}
