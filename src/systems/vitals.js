// Survival vitals for the local player: health, hunger, thirst, stamina,
// energy (sleep), body temperature, wetness and status effects. Tuned to be
// present but not a chore: slow drains, generous food, buffs for cooking.
import { ITEMS } from '../data/items.js';
import { BIOME } from '../world/gen.js';

export const EFFECTS = {
  bleeding: { name: 'Bleeding', icon: 'drop', color: '#d03030', desc: 'Losing health. Use a bandage.' },
  poison: { name: 'Poisoned', icon: 'skull', color: '#70c040', desc: 'Dilophosaurus spit or bad food.' },
  sick: { name: 'Tummy Ache', icon: 'question', color: '#a0b040', desc: 'Should have cooked that.' },
  broken: { name: 'Sprained Leg', icon: 'exclaim', color: '#e0a040', desc: 'Slower until splinted or rested.' },
  trippy: { name: 'Funky', icon: 'star', color: '#e060e0', desc: 'The trees are talking.' },
  wet: { name: 'Soaked', icon: 'drop', color: '#60a0e0', desc: 'Dry off by a fire.' },
  cold: { name: 'Freezing', icon: 'puff', color: '#a0d0ff', desc: 'Find warmth: fire, shelter, clothes.' },
  hot: { name: 'Overheating', icon: 'flame', color: '#ff7030', desc: 'Drink water, find shade.' },
  wellfed: { name: 'Well Fed', icon: 'heart', color: '#f0c040', desc: 'Health regen + slower hunger.' },
  caffeinated: { name: 'Caffeinated', icon: 'spark', color: '#c08040', desc: 'Faster stamina regen.' },
  sleepy: { name: 'Sleepy', icon: 'zzz', color: '#9090d0', desc: 'Get some rest.' },
  warm: { name: 'Toasty', icon: 'flame', color: '#ffb060', desc: 'Near a fire.' },
  blind: { name: 'Spat On', icon: 'drop', color: '#9ad040', desc: 'Dilophosaurus spit. Everything is blurry.' },
  terrified: { name: 'Terrified', icon: 'exclaim', color: '#e05050', desc: 'An alpha roared at you. Legs are jelly.' },
};

export class Vitals {
  constructor(game) {
    this.name = 'vitals';
    this.game = game;
    this.max = { hp: 100, hunger: 100, thirst: 100, stamina: 100, energy: 100 };
    this.hp = 100; this.hunger = 82; this.thirst = 75; this.stamina = 100; this.energy = 90;
    this.temp = 0.5; // 0 cold .. 1 hot, comfort 0.3-0.7
    this.wetness = 0;
    this.effects = new Map(); // name -> remaining seconds (Infinity = until cured)
    this.exhausted = false;
    this.speedMul = 1;
    this.regenDelay = 0;
    this.damageFlash = 0;
    this.dead = false;
    this.god = false;
    this.warmth = 0; // from fires
    this.sleepyT = 0;
  }

  add(name, secs) { const cur = this.effects.get(name) ?? 0; this.effects.set(name, Math.max(cur, secs)); this.game.events.emit('effect', name); }
  cure(names) { for (const n of names) this.effects.delete(n); }
  has(name) { return this.effects.has(name); }
  useStamina(n) { this.stamina = Math.max(0, this.stamina - n); if (this.stamina <= 0) this.exhausted = true; }

  damage(amount, src = {}) {
    if (this.god || this.dead || amount <= 0) return;
    const p = this.game.local;
    if (p.downed) return;
    // nothing one-shots you from full health: even a T. rex bite leaves a sliver
    if (src.kind === 'dino' && this.hp > 30) amount = Math.min(amount, this.hp - 8, 62);
    this.hp -= amount;
    this.regenDelay = 6;
    this.damageFlash = Math.min(1, this.damageFlash + amount / 25 + 0.25);
    this.game.rig.addTrauma(Math.min(0.6, amount / 40));
    p.setExpr('hurt', 0.8);
    this.game.audio?.play('hurt', { pos: p.pos, vol: 0.8 });
    this.game.events.emit('damage', { amount, ...src });
    if (src.bleed && Math.random() < src.bleed) this.add('bleeding', 40);
    if (src.poison) this.add('poison', src.poison);
    if (this.hp <= 0) { this.hp = 0; this.down(src); }
    this.game.events.emit('damaged', { amount, src });
  }
  heal(n) { this.hp = Math.min(this.max.hp, this.hp + n); }
  down(src) {
    const p = this.game.local;
    p.downed = true; p.downedT = 0; p.action = null;
    this.game.events.emit('downed', { player: p, src });
  }
  revive(hpFrac = 0.35) {
    const p = this.game.local;
    p.downed = false; p.downedT = 0;
    this.hp = Math.max(this.hp, this.max.hp * hpFrac);
    this.effects.delete('bleeding');
    this.game.events.emit('revived', p);
  }
  fallDamage(h) { const d = (h - 5) * 9; this.damage(d, { kind: 'fall' }); if (h > 9) this.add('broken', 120); }

  eat(id) {
    const d = ITEMS[id];
    const f = d?.food;
    if (!f) return false;
    if (f.hunger) this.hunger = Math.max(0, Math.min(this.max.hunger, this.hunger + f.hunger));
    if (f.thirst) this.thirst = Math.max(0, Math.min(this.max.thirst, this.thirst + f.thirst));
    if (f.hp) { if (f.hp > 0) this.heal(f.hp); else this.damage(-f.hp, { kind: 'food' }); }
    if (f.stamina) this.stamina = Math.min(this.max.stamina, this.stamina + f.stamina);
    if (f.sick && Math.random() < f.sick / 30) this.add('sick', 60);
    if (f.trippy) this.add('trippy', f.trippy);
    if (f.sleepy) { if (f.sleepy > 0) { this.energy = Math.max(0, this.energy - f.sleepy); this.add('sleepy', 20); } else this.energy = Math.min(100, this.energy - f.sleepy); }
    if (f.buff) this.add(f.buff, f.buff === 'wellfed' ? 600 : 240);
    this.game.events.emit('ate', id);
    return true;
  }
  drink(amount = 30, dirty = true) {
    this.thirst = Math.min(this.max.thirst, this.thirst + amount);
    if (dirty && Math.random() < 0.08) this.add('sick', 45);
    this.game.events.emit('drank', { dirty });
  }
  useMed(id) {
    const m = ITEMS[id]?.med;
    if (!m) return false;
    this.heal(m.hp ?? 0);
    this.cure(m.cure ?? []);
    return true;
  }

  update(dt) {
    const g = this.game, p = g.local;
    if (this.god) { this.hp = 100; this.hunger = Math.max(this.hunger, 50); this.thirst = Math.max(this.thirst, 50); }
    // ---- environment temperature
    const x = p.pos.x, z = p.pos.z;
    const biome = g.sampler.biomeAt(x, z);
    let env = 0.52;
    const night = g.time.isNight;
    if (night) env -= 0.14;
    if (biome === BIOME.SNOW) env -= 0.35; else if (biome === BIOME.MOUNTAIN) env -= 0.15;
    if (biome === BIOME.VOLCANIC) env += 0.25; else if (biome === BIOME.BADLANDS && !night) env += 0.18;
    if (p.pos.y > 120) env -= (p.pos.y - 120) * 0.002;
    const wx = g.weather.cur;
    env -= wx.rain * 0.08 + wx.storm * 0.05;
    // wetness
    const sheltered = g.isCameraSheltered();
    if (p.swim) this.wetness = Math.min(1, this.wetness + dt * 0.6);
    else if (wx.rain > 0.2 && !sheltered) this.wetness = Math.min(1, this.wetness + dt * 0.02 * wx.rain);
    else this.wetness = Math.max(0, this.wetness - dt * (0.012 + this.warmth * 0.05));
    env -= this.wetness * 0.12;
    env += this.warmth * 0.35;
    if (sheltered) env += 0.05;
    this.temp += (env - this.temp) * Math.min(1, dt * 0.02);
    if (this.wetness > 0.35) this.effects.set('wet', 1); else this.effects.delete('wet');
    if (this.temp < 0.22) this.effects.set('cold', 1); else this.effects.delete('cold');
    if (this.temp > 0.82) this.effects.set('hot', 1); else this.effects.delete('hot');
    if (this.warmth > 0.3) this.effects.set('warm', 1); else this.effects.delete('warm');
    this.warmth = Math.max(0, this.warmth - dt * 0.5);

    // ---- drains (per second); a full meter lasts ~35-45 min of play
    const fed = this.effects.has('wellfed');
    const working = p.sprint ? 1.8 : p.action ? 1.3 : 1;
    this.hunger = Math.max(0, this.hunger - dt * 0.037 * working * (fed ? 0.6 : 1) * (this.temp < 0.22 ? 1.4 : 1));
    this.thirst = Math.max(0, this.thirst - dt * 0.05 * working * (this.temp > 0.82 ? 1.8 : 1));
    this.energy = Math.max(0, this.energy - dt * 0.0105 * (p.sprint ? 1.5 : 1));
    // stamina
    if (p.sprint && Math.hypot(p.vel.x, p.vel.z) > 1) this.useStamina(dt * 9);
    else if (!p.action) {
      const rate = (this.effects.has('caffeinated') ? 26 : 16) * (this.hunger < 10 ? 0.4 : 1);
      this.stamina = Math.min(this.max.stamina, this.stamina + dt * rate);
    }
    if (this.exhausted && this.stamina > 30) this.exhausted = false;
    // ---- health
    if (this.hunger <= 0) this.damage(dt * 0.6, { kind: 'starve' });
    if (this.thirst <= 0) this.damage(dt * 0.9, { kind: 'thirst' });
    if (this.effects.has('cold') && this.temp < 0.12) this.damage(dt * 0.5, { kind: 'cold' });
    if (this.effects.has('hot') && this.temp > 0.9) this.damage(dt * 0.4, { kind: 'heat' });
    if (this.effects.has('bleeding')) this.damage(dt * 0.8, { kind: 'bleed' });
    if (this.effects.has('poison')) this.damage(dt * 0.5, { kind: 'poison' });
    this.regenDelay -= dt;
    if (this.regenDelay <= 0 && this.hunger > 25 && this.thirst > 25 && !p.downed) this.heal(dt * (fed ? 0.9 : 0.25));
    // ---- effects tick
    for (const [k, v] of this.effects) {
      if (v === 1 && ['wet', 'cold', 'hot', 'warm'].includes(k)) continue;
      if (v === Infinity) continue;
      const nv = v - dt;
      if (nv <= 0) this.effects.delete(k); else this.effects.set(k, nv);
    }
    if (this.energy < 12) this.effects.set('sleepy', Math.max(this.effects.get('sleepy') ?? 0, 2));
    this.speedMul = (this.effects.has('broken') ? 0.7 : 1) * (this.effects.has('terrified') ? 0.55 : 1) * (this.energy < 5 ? 0.8 : 1) * (this.wetness > 0.6 ? 0.95 : 1);
    // ---- post effects
    const post = g.engine.post.compMat.uniforms;
    this.damageFlash = Math.max(0, this.damageFlash - dt * 1.5);
    const low = this.hp < 25 ? (1 - this.hp / 25) * (0.25 + 0.15 * Math.sin(performance.now() / 300)) : 0;
    post.uDamage.value = Math.max(this.damageFlash, low);
    post.uDesat.value = p.downed ? 0.8 : this.hp < 20 ? 0.35 : 0;
    post.uBlur.value = this.effects.has('blind') ? 1 : this.effects.has('sleepy') ? 0.6 : this.effects.has('trippy') ? 0.4 : 0;
    if (this.effects.has('trippy')) { const t = performance.now() / 1000; post.uSaturation.value = 1.6 + Math.sin(t * 2) * 0.5; post.uLift.value.set(0.04 * Math.sin(t), 0.02 * Math.sin(t * 1.3 + 2), 0.04 * Math.sin(t * 0.7 + 4)); }
    else { post.uSaturation.value = 1.12; post.uLift.value.set(0.012, 0.014, 0.022); }
    if (p.downed) {
      if (p.downedT > 75 && !this.game.anyFriendNear?.()) this.game.events.emit('bleedout', p);
    }
  }

  serialize() { return { hp: this.hp, hunger: this.hunger, thirst: this.thirst, stamina: this.stamina, energy: this.energy, temp: this.temp, wet: this.wetness, fx: [...this.effects].filter(([, v]) => v !== Infinity) }; }
  load(d) { if (!d) return; Object.assign(this, { hp: d.hp, hunger: d.hunger, thirst: d.thirst, stamina: d.stamina, energy: d.energy, temp: d.temp ?? 0.5, wetness: d.wet ?? 0 }); this.effects = new Map(d.fx ?? []); }
}
