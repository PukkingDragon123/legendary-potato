// Crafting: recipes need their station nearby (or the van workshop), are
// unlocked by research, take a little time with a satisfying animation.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';

export class Crafting {
  constructor(game) {
    this.name = 'crafting';
    this.game = game;
    this.job = null;
    this.crafted = new Set();
    game.crafting = this;
  }
  isUnlocked(r) { return !r.unlock || !!this.game.research?.has(r.unlock); }
  unlockHint(r) { return this.game.research?.hintFor?.(r.unlock); }
  nearStations() {
    const g = this.game;
    const set = new Set(['hand']);
    const p = g.local.pos;
    for (const s of g.stationProviders ?? []) for (const id of s(p)) set.add(id);
    return set;
  }
  canCraft(r, mult = 1) {
    if (!this.isUnlocked(r)) return false;
    if (!this.nearStations().has(r.station)) return false;
    const inv = this.game.inventory;
    for (const [id, n] of Object.entries(r.in)) if (inv.count(id) < n * mult) return false;
    return true;
  }
  start(r, mult = 1) {
    if (this.job || !this.canCraft(r, mult)) return false;
    const g = this.game;
    const req = {};
    for (const [id, n] of Object.entries(r.in)) req[id] = n * mult;
    if (!g.inventory.take(req)) return false;
    this.job = { r, mult, t: 0, time: r.time * (1 + (mult - 1) * 0.6), req };
    g.audio?.play(r.station === 'campfire' || r.station === 'cooking_pot' ? 'sizzle' : 'craft_start', { vol: 0.6 });
    return true;
  }
  cancel() {
    if (!this.job) return;
    for (const [id, n] of Object.entries(this.job.req)) this.game.give(id, n, { quiet: true });
    this.job = null;
  }
  update(dt) {
    const j = this.job;
    if (!j) return;
    const g = this.game;
    j.t += dt;
    j.tick = (j.tick ?? 0) + dt;
    if (j.tick > 0.32) { j.tick = 0; g.audio?.play(j.r.station === 'campfire' ? 'crackle' : 'craft_tick', { vol: 0.35, rate: 0.9 + Math.random() * 0.3 }); }
    if (j.t >= j.time) {
      const n = j.r.n * j.mult;
      g.give(j.r.out, n, { from: 'crafting' });
      g.audio?.play('craft_done', { vol: 0.7 });
      const first = !this.crafted.has(j.r.out);
      this.crafted.add(j.r.out);
      g.events.emit('crafted', { id: j.r.out, n, first });
      if (first && ITEMS[j.r.out]?.cat !== 'resource') g.ui?.toast(`New: ${ITEMS[j.r.out].name}`, '', j.r.out);
      g.fx.sprite('star', g.local.pos.x, g.local.pos.y + 1.4, g.local.pos.z, { vy: 0.8, life: 0.8, size: 0.35, color: 0xffe060 });
      this.job = null;
      g.ui?.renderCraftDetail?.();
    }
  }
  serialize() { return [...this.crafted]; }
  load(d) { this.crafted = new Set(d ?? []); }
}
void THREE;
