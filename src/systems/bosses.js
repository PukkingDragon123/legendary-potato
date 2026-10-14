// Alphas: three legendary dinosaurs with lairs, a boss bar, signature attacks
// and trophies. OLD GNASHER (T. rex) rules the Rex Nesting Grounds, BIG MOMMA
// (Spinosaurus) lurks in Mirror Lake and RAZOR leads the Raptor Den. An alpha
// that is beaten or tamed stays that way (saved), and RAZOR's fall ends the
// raptor night raids. The host runs the fights; everyone gets the effects.
import * as THREE from 'three';
import { SPECIES } from '../entities/dinoSpecies.js';

export const ALPHAS = {
  gnasher: {
    sp: 'rex', poi: 'rexnest', name: 'Old Gnasher', title: 'King of the Nesting Grounds',
    size: 1.2, hp: 1.8, dmg: 1.2, torpor: 1.25,
    look: { color: 0x3e3a36, pcolor: 0x7a2418, accent: 0xd8402a, belly: 0xb8a890 },
    moves: { roar: 15, stomp: 8, charge: 11 },
    loot: [['trophy_gnasher', 1], ['meat_prime', 8], ['hide', 8], ['bone', 10], ['dna', 2]],
    rp: [['zoo', 40], ['paleo', 12]],
    intro: 'The ground shakes. Something ancient and grumpy has noticed you.',
  },
  bigmomma: {
    sp: 'spino', poi: 'lake', name: 'Big Momma', title: 'Terror of Mirror Lake',
    size: 1.15, hp: 1.6, dmg: 1.1, torpor: 1.2,
    look: { color: 0x3e5a52, pcolor: 0x1a2a26, accent: 0xe07a2a, belly: 0xd0c8a0 },
    moves: { roar: 18, sweep: 7, dive: 16 },
    loot: [['trophy_momma', 1], ['fish_raw', 10], ['meat_prime', 6], ['hide', 6], ['dna', 2]],
    rp: [['zoo', 35], ['bio', 10]],
    intro: 'Bubbles. A sail rises out of the lake. Then the rest of her.',
  },
  razor: {
    sp: 'raptor', poi: 'raptorden', name: 'Razor', title: 'Alpha of the Raptor Den',
    size: 1.45, hp: 4.5, dmg: 1.6, torpor: 2.4,
    look: { color: 0x3a3a46, pcolor: 0x16161c, accent: 0xe8d040, belly: 0xb8b0a0 },
    moves: { howl: 22, pounce: 6 },
    loot: [['trophy_razor', 1], ['feather', 8], ['hide', 4], ['meat_prime', 3], ['dna', 1]],
    rp: [['zoo', 25]],
    intro: 'A whistle in the bushes. Then another. Then a very big one.',
  },
};

const _v = new THREE.Vector3();
const HUNTING = ['stalk', 'chase', 'charge', 'hunt', 'backoff'];

// a species clone with the alpha's size, stats and colours (same id, so the
// Dino-Dex, taming rules and jobs all treat it as its species)
const _sp = new Map();
export function alphaSpecies(id) {
  if (_sp.has(id)) return _sp.get(id);
  const A = ALPHAS[id], base = SPECIES[A.sp];
  const sp = {
    ...base, alpha: id, alphaName: A.name, matKey: 'alpha:' + id, size: base.size * A.size,
    look: { ...base.look, ...A.look },
    stats: { ...base.stats, hp: Math.round(base.stats.hp * A.hp), dmg: base.stats.dmg * A.dmg },
    behaviour: { ...base.behaviour, boss: true },
    tame: { ...base.tame, need: Math.round(base.tame.need * 1.6) },
  };
  _sp.set(id, sp);
  return sp;
}

export class Bosses {
  constructor(game) {
    this.name = 'bosses';
    this.g = game;
    this.st = Object.fromEntries(Object.keys(ALPHAS).map((k) => [k, { beaten: false, tamed: false, day: 0 }]));
    this.live = new Map(); // alpha id -> dino (host)
    this.ensureT = 1;
    this.met = new Set();
    this.barFor = null;
    this.buildBar();
  }
  species(id) { return alphaSpecies(id); }
  isDown(id) { const s = this.st[id]; return !!(s && (s.beaten || s.tamed)); }
  // the alpha that still rules this place (for map skulls)
  lairOf(poiId) { const id = Object.keys(ALPHAS).find((k) => ALPHAS[k].poi === poiId); return id && !this.isDown(id) ? id : null; }

  // ---------------------------------------------------------------- spawning (host)
  ensure() {
    const g = this.g;
    for (const [id, A] of Object.entries(ALPHAS)) {
      let d = this.live.get(id);
      if (d && (!g.dinos.list.has(d.id) || d.state === 'dead' || d.tamed)) { this.live.delete(id); d = null; }
      if (this.isDown(id)) continue;
      const poi = g.world.pois.find((p) => p.id === A.poi);
      if (!poi) continue;
      let near = Infinity;
      for (const p of g.players.values()) near = Math.min(near, Math.hypot(p.pos.x - poi.x, p.pos.z - poi.z));
      if (!d && near < 210) this.spawn(id, A, poi);
      else if (d && near > 330 && d.state !== 'ko') { g.dinos.despawn(d); this.live.delete(id); }
    }
  }
  spawn(id, A, poi) {
    const g = this.g, s = g.sampler;
    let x = poi.x, z = poi.z;
    if (id === 'bigmomma') {
      // somewhere properly deep in the lake
      let best = -1;
      for (let k = 0; k < 40; k++) {
        const a = k * 2.4, r = (k / 40) * Math.max(10, poi.radius * 0.8);
        const px = poi.x + Math.cos(a) * r, pz = poi.z + Math.sin(a) * r;
        const depth = s.waterAt(px, pz) - s.heightAt(px, pz);
        if (depth > best) { best = depth; x = px; z = pz; }
      }
    }
    const home = new THREE.Vector3(x, 0, z);
    const herd = id === 'razor' ? { id: 'alpha:razor', leader: null, members: [], home: home.clone(), alarm: 0 } : null;
    const d = g.dinos.spawn(this.species(id), x, z, { home, name: A.name, herd, food: 50 });
    // tougher to knock out than a normal one, but not a whole-weekend job
    d.maxTorpor = SPECIES[A.sp].stats.hp * 0.6 * A.torpor;
    this.live.set(id, d);
    if (herd) {
      herd.leader = d; herd.members.push(d);
      for (let k = 0; k < 3; k++) {
        const a = k * 2.1;
        const m = g.dinos.spawn('raptor', x + Math.cos(a) * 4, z + Math.sin(a) * 4, { herd, home: home.clone() });
        herd.members.push(m);
      }
    }
  }
  callPack(d, T) {
    const g = this.g, herd = d.herd;
    if (!herd) return;
    const alive = herd.members.filter((m) => m !== d && m.state !== 'dead' && !m.tamed && g.dinos.list.has(m.id)).length;
    for (let k = alive; k < 4; k++) {
      const a = Math.random() * 6.28, R = 18 + Math.random() * 8;
      const m = g.dinos.spawn('raptor', T.pos.x + Math.cos(a) * R, T.pos.z + Math.sin(a) * R, { herd, home: herd.home.clone() });
      herd.members.push(m); m.target = T; m.setState('stalk', 12); m.food = 10;
    }
  }

  // ---------------------------------------------------------------- fight brain (host)
  brain(d, dt) {
    const g = this.g;
    if (d.state === 'dead' || d.state === 'ko' || d.tamed) { d.speedMul = 1; return; }
    const A = ALPHAS[d.sp.alpha], M = A.moves;
    const cd = (d.bossCd ??= { roar: 3, stomp: 2, charge: 6, sweep: 2, dive: 8, howl: 5, pounce: 2 });
    for (const k in cd) cd[k] -= dt;
    d.speedMul = 1;
    if (d.charging > 0) { d.charging -= dt; d.speedMul = 1.6; if (Math.random() < dt * 8) g.fx.dust(d.pos, 2, 0xb8a080, 1.4); }
    if (d.leapT > 0) {
      d.leapT -= dt; d.speedMul = 1.9;
      const T = d.leapAt;
      if (d.leapT <= 0 && T && Math.sqrt(d.dist2(T.pos)) < d.radius * d.sizeK + 1.8) g.dinos.melee(d, T, 'bite');
    }
    if (d.diving > 0) {
      d.diving -= dt;
      if (d.diving <= 0) this.surface(d);
      return;
    }
    const T = d.target;
    if (!T || !this.isPlayer(T) || T.downed || !HUNTING.includes(d.state)) return;
    const dist = Math.sqrt(d.dist2(T.pos));
    if (d.action) return;
    const P = { id: d.id, x: +d.pos.x.toFixed(2), y: +d.pos.y.toFixed(2), z: +d.pos.z.toFixed(2) };
    if (M.roar && cd.roar <= 0 && dist < 40) { cd.roar = M.roar; d.act('roar', 1.8); this.fx({ k: 'roar', ...P, r: 30 }); g.dinos.noise(d.pos, 70, 0.8); return; }
    if (M.howl && cd.howl <= 0 && dist < 45) { cd.howl = M.howl; d.act('call', 1.6); this.callPack(d, T); this.fx({ k: 'howl', ...P, r: 26 }); return; }
    if (M.stomp && cd.stomp <= 0 && dist < 9 + d.radius) { cd.stomp = M.stomp; d.act('stomp', 1.35, () => this.fx({ k: 'stomp', ...P, x: +d.pos.x.toFixed(2), z: +d.pos.z.toFixed(2), r: 10, dmg: Math.round(24 * A.dmg) }), 0.62); return; }
    if (M.sweep && cd.sweep <= 0 && dist < 11) { cd.sweep = M.sweep; d.act('tailwhip', 1.1, () => this.fx({ k: 'sweep', ...P, x: +d.pos.x.toFixed(2), z: +d.pos.z.toFixed(2), r: 11, dmg: Math.round(26 * A.dmg) }), 0.55); return; }
    if (M.charge && cd.charge <= 0 && dist > 14 && dist < 42) { cd.charge = M.charge; d.charging = 3.2; d.setState('charge', 3.2); g.audio?.play('roar', { pos: d.pos, vol: 1.4, ref: 30, rate: 0.85 }); return; }
    if (M.pounce && cd.pounce <= 0 && dist > 3.5 && dist < 11) {
      cd.pounce = M.pounce;
      d.act('pounce', 0.9, () => { d.pos.y += 0.15; d.vy = 6.5; d.leapT = 0.55; d.leapAt = T; g.audio?.play('screech', { pos: d.pos, vol: 1, rate: 1.3 }); }, 0.35);
      return;
    }
    if (M.dive && cd.dive <= 0 && dist > 13 && d.swim) { cd.dive = M.dive; this.dive(d, T); }
  }
  isPlayer(T) { for (const p of this.g.players.values()) if (p === T) return true; return false; }
  dive(d, T) {
    d.diving = 3.4; d.hold = 3.4; d.diveAt = T; d.hidden = true;
    this.fx({ k: 'dive', id: d.id, x: +d.pos.x.toFixed(2), y: +d.pos.y.toFixed(2), z: +d.pos.z.toFixed(2) });
  }
  surface(d) {
    const g = this.g, s = g.sampler, T = d.diveAt ?? g.local;
    // come up in the water closest to the target, else right at the shore
    let bx = d.pos.x, bz = d.pos.z, bd = Infinity;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * 6.28, r = 6 + (k % 3) * 3;
      const x = T.pos.x + Math.cos(a) * r, z = T.pos.z + Math.sin(a) * r;
      const deep = s.waterAt(x, z) - s.heightAt(x, z);
      const score = (deep > 1.4 ? 0 : 50) + Math.hypot(x - T.pos.x, z - T.pos.z);
      if (score < bd) { bd = score; bx = x; bz = z; }
    }
    d.pos.set(bx, Math.max(s.heightAt(bx, bz), s.waterAt(bx, bz) - 1), bz);
    d.yaw = Math.atan2(-(T.pos.x - bx), -(T.pos.z - bz));
    d.hidden = false; d.hold = 0;
    d.target = T; d.setState('chase', 6);
    d.act('roar', 1.6);
    this.fx({ k: 'surface', id: d.id, x: +bx.toFixed(2), y: +d.pos.y.toFixed(2), z: +bz.toFixed(2), r: 24 });
  }

  // ---------------------------------------------------------------- effects (everyone)
  fx(m) { this.apply(m); this.g.net?.broadcast?.('bossFx', m); }
  apply(m) {
    const g = this.g, me = g.local;
    const d = g.dinos?.list.get(m.id);
    const pos = new THREE.Vector3(m.x ?? 0, m.y ?? 0, m.z ?? 0);
    const dist = Math.hypot(me.pos.x - pos.x, me.pos.z - pos.z);
    const safe = !!me.sitting?.van;
    const ring = (n, speed, color, size) => { for (let k = 0; k < n; k++) { const a = (k / n) * 6.28; g.fx.sprite('puff', pos.x + Math.cos(a) * 1.5, pos.y + 0.3, pos.z + Math.sin(a) * 1.5, { vx: Math.cos(a) * speed, vy: 0.6, vz: Math.sin(a) * speed, life: 1.1, size, grow: 1.2, alpha: 0.6, color, drag: 2.2 }); } };
    const shove = (k, up) => { const dir = _v.set(me.pos.x - pos.x, 0, me.pos.z - pos.z).normalize(); me.vel.addScaledVector(dir, k); me.vel.y = Math.max(me.vel.y, up); };
    switch (m.k) {
      case 'roar': case 'howl': {
        g.audio?.play(m.k === 'roar' ? 'roar' : 'screech', { pos, vol: 1.6, ref: 45, rate: m.k === 'roar' ? 0.8 : 0.7 });
        g.rig.addTrauma(0.5 * Math.max(0, 1 - dist / 50));
        if (dist < m.r && !safe) {
          g.vitals?.add('terrified', 3.5);
          if (!this.toldRoar) { this.toldRoar = true; g.ui?.toast('That roar turned your legs to jelly! Keep your distance, or hide in the van.', 'warn', 'skull', 5000); }
        }
        break;
      }
      case 'stomp': case 'sweep': {
        g.audio?.play(m.k === 'stomp' ? 'quake' : 'tailwhip', { pos, vol: 1.5, ref: 30 });
        g.rig.addTrauma(0.7 * Math.max(0, 1 - dist / 35));
        ring(m.k === 'stomp' ? 26 : 14, m.k === 'stomp' ? 9 : 6, 0xb8a080, 1.4);
        if (dist < m.r && !safe && me.grounded !== false) {
          g.vitals?.damage(m.dmg * (1 - (dist / m.r) * 0.6), { kind: 'dino' });
          shove(m.k === 'stomp' ? 10 : 13, m.k === 'stomp' ? 7.5 : 5);
          g.events.emit('dinoAttack', { d, kind: m.k });
        }
        break;
      }
      case 'dive': {
        if (d) d.hidden = true;
        g.fx.splash(pos.x, g.sampler.waterAt(pos.x, pos.z), pos.z, 2.6);
        g.audio?.play('splash', { pos, vol: 1.4, rate: 0.5 });
        if (dist < 50 && !this.toldDive) { this.toldDive = true; g.ui?.toast('She went under... watch the water!', 'warn', 'skull', 4000); }
        break;
      }
      case 'surface': {
        if (d) { d.hidden = false; if (!g.isHost) { d.pos.copy(pos); d.netBuf = []; } }
        g.fx.splash(pos.x, g.sampler.waterAt(pos.x, pos.z), pos.z, 3.2);
        g.audio?.play('splash', { pos, vol: 1.6, rate: 0.45 });
        g.audio?.play('roar', { pos, vol: 1.5, ref: 40, rate: 0.75 });
        g.rig.addTrauma(0.45 * Math.max(0, 1 - dist / 40));
        break;
      }
      case 'down': case 'tamedAlpha': {
        const A = ALPHAS[m.a];
        if (!A) break;
        const st = this.st[m.a];
        if (m.k === 'down') st.beaten = true; else st.tamed = true;
        st.day = g.time.day;
        g.ui?.banner(m.k === 'down' ? 'ALPHA DEFEATED' : 'ALPHA TAMED', A.name.toUpperCase(), m.k === 'down' ? 'Its trophy is yours. Mount it in your camp.' : 'The biggest, grumpiest pet on the island');
        g.audio?.jingle?.('chapter');
        g.events.emit('alphaDown', { id: m.a, tamed: m.k !== 'down' });
        if (m.a === 'razor') setTimeout(() => g.ui?.toast('With Razor gone, the raptor packs have lost their nerve. No more night raids!', '', 'star', 6000), 3500);
        this.hideBar();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- boss bar UI
  buildBar() {
    const el = document.createElement('div');
    el.id = 'bossbar'; el.className = 'hidden';
    el.innerHTML = '<div class="bb-name shadow-text"></div><div class="bb-title"></div><div class="bb-bar"><i class="bb-hp"></i><i class="bb-lag"></i></div><div class="bb-tor"><i></i></div>';
    (document.querySelector('#ui .hud') ?? document.getElementById('ui') ?? document.body).appendChild(el);
    this.bar = { el, name: el.querySelector('.bb-name'), title: el.querySelector('.bb-title'), hp: el.querySelector('.bb-hp'), lag: el.querySelector('.bb-lag'), tor: el.querySelector('.bb-tor'), torI: el.querySelector('.bb-tor i') };
    this.lagHp = 1;
  }
  hideBar() { this.bar.el.classList.add('hidden'); this.barFor = null; }
  updateBar(dt) {
    const g = this.g, me = g.local;
    let best = null, bd = 75 * 75;
    for (const d of g.dinos?.list.values() ?? []) {
      if (!d.sp.alpha || d.tamed || d.state === 'dead' || d.hidden && !this.barFor) continue;
      const dd = d.dist2(me.pos);
      const engaged = HUNTING.includes(d.state) || d.state === 'ko' || d.hp < d.maxHp * 0.999 || this.barFor === d;
      if (dd < bd && engaged) { bd = dd; best = d; }
    }
    if (!best) { if (this.barFor) this.hideBar(); return; }
    const A = ALPHAS[best.sp.alpha];
    if (this.barFor !== best) {
      this.barFor = best;
      this.bar.el.classList.remove('hidden');
      this.bar.name.textContent = A.name.toUpperCase();
      this.bar.title.textContent = A.title.toUpperCase();
      this.lagHp = best.hp / best.maxHp;
      if (!this.met.has(best.sp.alpha)) {
        this.met.add(best.sp.alpha);
        g.ui?.banner('! ALPHA !', A.name.toUpperCase(), A.title);
        g.audio?.jingle?.('boss');
        g.ui?.toast(A.intro, 'warn', 'skull', 6000);
      }
    }
    const hp = Math.max(0, best.hp / best.maxHp), tor = Math.min(1, best.torpor / best.maxTorpor);
    this.lagHp = Math.max(hp, this.lagHp - dt * 0.25);
    this.bar.hp.style.width = (hp * 100).toFixed(1) + '%';
    this.bar.lag.style.width = (this.lagHp * 100).toFixed(1) + '%';
    this.bar.torI.style.width = (tor * 100).toFixed(1) + '%';
    this.bar.tor.classList.toggle('hidden', tor < 0.01 && best.state !== 'ko');
    this.bar.el.classList.toggle('ko', best.state === 'ko');
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const g = this.g;
    if (!g.dinos) return;
    if (g.isHost) {
      this.ensureT -= dt;
      if (this.ensureT <= 0) { this.ensureT = 2; this.ensure(); }
      for (const d of this.live.values()) this.brain(d, dt);
    }
    this.updateBar(dt);
  }
  onKilled(d) {
    const g = this.g, id = d.sp.alpha;
    if (!id || !g.isHost || d.tamed) return;
    const A = ALPHAS[id];
    for (const [item, n] of A.loot) {
      const a = Math.random() * 6.28;
      g.drops?.spawn(item, n, d.pos.clone().add(new THREE.Vector3(Math.cos(a) * 1.5, 1.2 + Math.random(), Math.sin(a) * 1.5)), new THREE.Vector3(Math.cos(a) * 2, 4, Math.sin(a) * 2));
    }
    for (const [cat, n] of A.rp) g.research?.addRP?.(cat, n, A.name);
    this.live.delete(id);
    this.fx({ k: 'down', a: id });
  }
  onTamed(d) {
    const id = d.sp.alpha;
    if (!id || !this.g.isHost) return;
    this.live.delete(id);
    this.fx({ k: 'tamedAlpha', a: id });
  }
  serialize() { return this.st; }
  load(s) { for (const k of Object.keys(this.st)) if (s?.[k]) this.st[k] = { ...this.st[k], ...s[k] }; }
}

export async function install(g) {
  const B = new Bosses(g);
  g.bosses = B;
  g.addSystem(B);
  g.saveables.bosses = { save: () => B.serialize(), load: (d) => B.load(d) };
  g.netHandlers.bossFx = (m) => B.apply(m);
  g.events.on('dinoKilled', ({ d }) => B.onKilled(d));
  g.events.on('tamed', ({ d }) => B.onTamed(d));
  // lairs get a skull on the compass once discovered (while their alpha rules)
  g.events.on('discover', (p) => {
    const id = Object.keys(ALPHAS).find((k) => ALPHAS[k].poi === p.id);
    if (id && !B.isDown(id)) g.ui?.setMarker('poi:' + p.id, { icon: 'skull', x: p.x, z: p.z, label: ALPHAS[id].name + '\'s lair' });
  });
  return B;
}
