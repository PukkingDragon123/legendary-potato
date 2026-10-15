// Timmy's tutorial: the first few minutes after you wake up. He flies ahead to
// show you each thing (a hologram marker hangs over it, and an arrow at the
// edge of the screen points the way when it is behind you), talks you through
// it and celebrates when you get it right:
//   pick up a stone -> hold it -> knock a tree down with it -> lift a log with
//   the gravity gun -> drop it in the van rack -> craft a hatchet -> hold it.
// It is also the journal's first chapter, so the task list ticks along.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { SPECIES } from '../world/plantModels.js';
import { RECIPES } from '../data/recipes.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// a hologram marker: a ring on the ground and a chevron bobbing above it
function marker() {
  const g = new THREE.Group();
  const mat = (op) => new THREE.MeshBasicMaterial({ color: 0x5ef2ff, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.7, 40), mat(0.9)); ring.rotation.x = -Math.PI / 2;
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(0.85, 0.88, 40, 1, 0, Math.PI * 1.4), mat(0.6)); ring2.rotation.x = -Math.PI / 2;
  const chev = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(-0.22, 0.18); shape.lineTo(0, -0.06); shape.lineTo(0.22, 0.18); shape.lineTo(0.22, 0.06); shape.lineTo(0, -0.18); shape.lineTo(-0.22, 0.06); shape.closePath();
  const cg = new THREE.ShapeGeometry(shape);
  for (let i = 0; i < 2; i++) { const m = new THREE.Mesh(cg, mat(0.95 - i * 0.4)); m.position.y = i * 0.2; m.rotation.y = 0; chev.add(m); const m2 = m.clone(); m2.rotation.y = Math.PI / 2; chev.add(m2); }
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1, 6, 1, true), mat(0.35)); beam.position.y = 0.5;
  g.add(ring, ring2, chev, beam);
  g.traverse((o) => { o.renderOrder = 10; o.frustumCulled = false; });
  return { g, ring, ring2, chev, beam };
}

export class Tutorial {
  constructor(game) {
    this.name = 'tutorial';
    this.g = game;
    this.step = -1; // -1 = not started
    this.passed = new Set();
    this.active = false;
    this.t = 0; this.stepT = 0; this.nagT = 0;
    this.M = marker(); this.M.g.visible = false;
    game.engine.scene.add(this.M.g);
    this.arrow = document.createElement('div');
    this.arrow.className = 'holo-guide hidden';
    this.arrow.innerHTML = '<i></i><span></span>';
    (game.ui?.hud ?? document.body).appendChild(this.arrow);
    this.flags = {};
    this.steps = this.makeSteps();
    game.tutorial = this;
    this.hook();
  }
  key(a) { return this.g.input.keyName(a); }
  slotKey(id) { const i = this.g.inventory.slots.findIndex((s) => s && s.id === id); return i >= 0 ? String(i + 1) : '?'; }
  held(id) { return this.g.inventory.held()?.id === id; }
  makeSteps() {
    const g = this.g;
    return [
      {
        id: 'stone', task: 'Pick up a stone',
        say: () => `First things first, boss: tools. See that loose stone over there? Walk up to it and press ${this.key('interact')} to pick it up.`,
        target: () => this.nearestNode(['rock_small']),
        done: () => g.inventory.count('stone') > 0 || g.inventory.count('flint') > 0,
        nag: 'The stone is right where my marker is. Pointy end optional.',
      },
      {
        id: 'hold', task: 'Hold the stone',
        say: () => `Lovely rock. Now hold it: press ${this.slotKey(g.inventory.count('stone') ? 'stone' : 'flint')} to put it in your hand.`,
        done: () => this.held('stone') || this.held('flint') || this.passed.has('tree'),
      },
      {
        id: 'tree', task: 'Knock down a tree with the stone',
        say: () => 'Perfect. See that tree I am pointing at? Whack it with the stone. Click, click, click! It takes a while without a proper axe.',
        target: () => this.nearestTree(),
        done: () => this.flags.felled,
        enter: () => { this.flags.felled = false; },
        nag: 'Keep whacking! Trees here are very stubborn. Like you.',
      },
      {
        id: 'grav', task: 'Lift a log with the gravity gun',
        say: () => `TIMBER! Logs are far too big for your pockets, so press ${this.slotKey('gravgun')} for the gravity gun, aim at a log and HOLD the trigger to lift it.`,
        target: () => this.nearestProp('log'),
        done: () => this.flags.lifted,
        enter: () => { this.flags.lifted = false; },
        nag: () => `Gravity gun out (${this.slotKey('gravgun')}), point at the log and hold the left mouse button. The wheel pulls it closer or pushes it away.`,
      },
      {
        id: 'rack', task: 'Drop logs into the van rack (back doors)',
        say: () => 'Now drag it to the van and drop it at the back doors. The rack in there takes anything big. Heavy stuff? Get a friend\'s beam on it, or hand it to a creature later.',
        target: () => this.rackPoint(),
        done: () => (this.flags.racked ?? 0) >= 2,
        enter: () => { this.flags.racked = this.flags.racked ?? 0; },
        progress: () => `${Math.min(2, this.flags.racked ?? 0)}/2`,
        nag: 'Bring the logs to the back of the van. Let go of the trigger when it is right at the doors.',
      },
      {
        id: 'craft', task: 'Craft a Stone Hatchet',
        say: () => `Now a proper tool. Press ${this.key('inventory')} to open the Chrono-Link, go to CRAFT and make a Stone Hatchet. Near the van I pull materials straight off the rack. You also need sticks and plant fibre from the ground.`,
        target: () => this.missingFor('stone_hatchet'),
        done: () => !!g.journal?.crafted.has('stone_hatchet') || g.materials?.count('stone_hatchet') > 0,
        nag: () => { const m = this.missingList('stone_hatchet'); return m ? `Still missing: ${m}. I marked some for you.` : `You have everything! ${this.key('inventory')}, then CRAFT.`; },
      },
      {
        id: 'equip', task: 'Hold the hatchet',
        say: () => `A hatchet! I am so proud. Press ${this.slotKey('stone_hatchet')} to hold it. Trees fall much faster now.`,
        done: () => this.held('stone_hatchet') || (g.inventory.count('stone_hatchet') === 0 && this.stepT > 20),
      },
    ];
  }
  // ---------------------------------------------------------------- targets
  nearestNode(types) {
    const g = this.g, p = g.local.pos;
    let best = null, bd = 45 * 45;
    for (const nd of g.nodes.byId.values()) {
      if (!types.includes(nd.type) || g.nodes.isDepleted(nd)) continue;
      const d = (nd.x - p.x) ** 2 + (nd.z - p.z) ** 2;
      if (d < bd) { bd = d; best = nd; }
    }
    return best ? { pos: new THREE.Vector3(best.x, best.y, best.z), r: 0.5 } : null;
  }
  nearestTree() {
    const g = this.g, p = g.local.pos;
    if (this._tree && this._tree.alive) return { pos: new THREE.Vector3(this._tree.x, this._tree.y, this._tree.z), r: this._tree.radius + 0.4 };
    let best = null, bs = Infinity;
    for (const t of g.flora.trees) {
      if (!t.alive || t.small) continue;
      const sp = SPECIES[t.key];
      if (!sp?.yield?.log) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d > 60) continue;
      const s = d + t.maxHp * 0.12;
      if (s < bs) { bs = s; best = t; }
    }
    this._tree = best;
    return best ? { pos: new THREE.Vector3(best.x, best.y, best.z), r: best.radius + 0.4 } : null;
  }
  nearestProp(type) {
    const g = this.g, p = g.local.pos;
    let best = null, bd = 60 * 60;
    for (const P of g.props?.list.values() ?? []) { if (P.type !== type && !(type === 'log' && P.type === 'log_small')) continue; const d = P.pos.distanceToSquared(p); if (d < bd) { bd = d; best = P; } }
    return best ? { pos: best.pos.clone().setY(best.pos.y - 0.15), r: 0.9, live: best } : null;
  }
  rackPoint() {
    const v = this.g.van;
    if (!v) return null;
    const pos = v.root.localToWorld(new THREE.Vector3(0, 0, 2.95));
    pos.y = this.g.sampler.heightAt(pos.x, pos.z);
    return { pos, r: 0.9 };
  }
  missingList(rid) {
    const g = this.g, r = RECIPES.find((x) => x.id === rid);
    const req = r?.in ?? { stick: 2, stone: 3, fiber: 3 };
    const out = [];
    for (const [id, n] of Object.entries(req)) { const have = g.materials?.count(id) ?? g.inventory.count(id); if (have < n) out.push(`${n - have} ${ITEMS[id]?.name ?? id}`); }
    return out.join(', ');
  }
  missingFor(rid) {
    const g = this.g, m = this.missingList(rid);
    if (!m) return null;
    const types = [];
    if ((g.materials?.count('stick') ?? 0) < 2) types.push('sticks');
    if ((g.materials?.count('fiber') ?? 0) < 3) types.push('fiber', 'fern');
    if ((g.materials?.count('stone') ?? 0) < 3) types.push('rock_small');
    return types.length ? this.nearestNode(types) : null;
  }
  // ---------------------------------------------------------------- flow
  hook() {
    const g = this.g, E = g.events;
    E.on('treeFelled', ({ by }) => { if (by === g.local.id) this.flags.felled = true; });
    E.on('gravGrab', ({ prop }) => { if (prop.type === 'log' || prop.type === 'log_small') this.flags.lifted = true; });
    E.on('rackStored', ({ id }) => { if (id === 'log') this.flags.racked = (this.flags.racked ?? 0) + 1; });
    E.on('started', (opt) => {
      if (this.passed.has('done')) return;
      // a save from before the tutorial existed: those explorers know the ropes
      if (opt?.mode === 'continue' && this.step < 0) { for (const S of this.steps) this.passed.add(S.id); this.passed.add('done'); return; }
      g.skipGreeting = true; // Timmy introduces himself in the first lesson instead
      this.greet = this.step < 0;
      // a brand-new game (or a save halfway through): after the intro, or straight away without one
      const go = () => { if (!this.active && !this.passed.has('done')) this.begin(); };
      if (g.cinematic) E.once('cinematicDone', go);
      else setTimeout(go, opt?.mode === 'continue' ? 4000 : 3500);
    });
  }
  begin() {
    this.active = true;
    this.go(Math.max(0, this.step));
  }
  go(i) {
    const g = this.g;
    // skip steps already done (you can do things out of order)
    while (i < this.steps.length && this.steps[i].done()) { this.passed.add(this.steps[i].id); i++; }
    this.step = i;
    this.stepT = 0; this.nagT = 0;
    if (i >= this.steps.length) { this.finish(); return; }
    const S = this.steps[i];
    S.enter?.();
    if (S.done()) { this.go(i + 1); return; }
    const hello = this.greet ? 'Hello, boss! Timmy here, your friendly floating science robot. ' : '';
    this.greet = false;
    g.holo?.say(hello + S.say(), { title: `TUTORIAL ${i + 1}/${this.steps.length}`, expr: 'happy', tag: 'tut' });
    g.journal && (g.journal.dirty = true);
  }
  pass() {
    const g = this.g, S = this.steps[this.step];
    this.passed.add(S.id);
    g.audio?.play('scan_done', { vol: 0.5 });
    g.timmy?.celebrate?.(1.2);
    g.journal && (g.journal.dirty = true);
    this.go(this.step + 1);
  }
  finish() {
    const g = this.g;
    if (this.passed.has('done')) return;
    this.passed.add('done');
    this.active = false;
    this.M.g.visible = false;
    this.arrow.classList.add('hidden');
    g.timmy?.guide(null);
    g.timmy?.celebrate?.(2.5);
    g.holo?.say('That is the basics, boss! Survive, scan everything, tame some friends and fix the van. Then we drive. The nearest research base is very, very far away, and it is our only way home.', { title: 'TUTORIAL COMPLETE', expr: 'love' });
    g.audio?.jingle?.('discover');
    g.journal && (g.journal.dirty = true);
  }
  skip() { for (const S of this.steps) this.passed.add(S.id); this.step = this.steps.length; this.finish(); }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g;
    this.t += dt;
    if (!this.active || g.titleMode || g.cinematic) { this.M.g.visible = false; this.arrow.classList.add('hidden'); return; }
    const S = this.steps[this.step];
    if (!S) return;
    this.stepT += dt;
    if (S.done()) { this.pass(); return; }
    // point at the target
    const tg = S.target?.() ?? null;
    this.showTarget(tg, dt);
    g.timmy?.guide(tg ? tg.pos : null);
    // a nudge if you seem stuck
    this.nagT += dt;
    if (S.nag && this.nagT > 45 && !g.holo?.line && !g.uiOpen) { this.nagT = 0; g.holo?.say(typeof S.nag === 'function' ? S.nag() : S.nag, { expr: 'normal', tag: 'tut' }); }
  }
  showTarget(tg, dt) {
    const g = this.g, M = this.M;
    M.g.visible = !!tg;
    if (!tg) { this.arrow.classList.add('hidden'); return; }
    const p = tg.live ? _v.copy(tg.live.pos).setY(tg.live.pos.y - 0.2) : tg.pos;
    M.g.position.lerp(p, M.g.visible && M.g.position.distanceTo(p) < 3 ? Math.min(1, dt * 10) : 1);
    const s = Math.max(0.6, tg.r ?? 0.6);
    M.ring.scale.setScalar(s * (1 + Math.sin(this.t * 4) * 0.06)); M.ring2.scale.setScalar(s); M.ring2.rotation.z = this.t * 1.6;
    M.chev.position.y = 1.6 + s * 0.6 + Math.sin(this.t * 3) * 0.12; M.chev.rotation.y = this.t * 1.2;
    M.beam.scale.y = M.chev.position.y; M.beam.position.y = M.chev.position.y / 2;
    // the edge-of-screen arrow when the target is off screen
    const cam = g.engine.camera;
    _w.copy(M.g.position); _w.y += 1;
    const dist = g.local.pos.distanceTo(M.g.position);
    const ndc = _w.clone().project(cam);
    const behind = _w.clone().sub(cam.position).dot(cam.getWorldDirection(_v)) < 0;
    const on = !behind && Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.85;
    const el = this.arrow;
    el.classList.toggle('hidden', on || g.uiOpen);
    if (!on) {
      let x = ndc.x, y = ndc.y;
      if (behind) { x = -x; y = -Math.abs(y) - 0.2; }
      const k = 0.86 / Math.max(Math.abs(x), Math.abs(y), 1e-3);
      x *= k; y *= k;
      const W = innerWidth, H = innerHeight;
      el.style.left = ((x * 0.5 + 0.5) * W).toFixed(0) + 'px';
      el.style.top = ((-y * 0.5 + 0.5) * H).toFixed(0) + 'px';
      el.querySelector('i').style.transform = `rotate(${Math.atan2(-y, x)}rad)`;
      el.querySelector('span').textContent = dist.toFixed(0) + ' m';
    }
  }
  // the journal's first chapter reads these
  goalDone(id) { return this.passed.has(id) || this.passed.has('done'); }
  serialize() { return { step: this.step, passed: [...this.passed], racked: this.flags.racked ?? 0 }; }
  load(d) {
    if (!d) return;
    this.step = d.step ?? -1; this.passed = new Set(d.passed ?? []); this.flags.racked = d.racked ?? 0;
  }
}

export async function install(g) {
  const T = new Tutorial(g);
  g.addSystem(T);
  g.saveables.tutorial = { save: () => T.serialize(), load: (d) => T.load(d) };
  return T;
}
