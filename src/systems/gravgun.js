// The gravity gun: aim at a log, rock chunk, crate, oil barrel or van part and
// hold LMB to lift it on a beam. The wheel reels it in and out, RMB flings it,
// letting go drops it where it is. Things heavier than one gun can lift drag
// along the ground until a friend puts their beam on it too, or until you hand
// it to a tamed creature (Z), which carries it on its back and follows you.
// Drop things into the van rack (behind the back doors) to store them.
//
// Co-op: the host runs the props; a client streams its beam target (propHold)
// and draws its own beam from the positions the host sends back.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { LIFT } from './props.js';

const REACH = 9, MIN_D = 1.4, MAX_D = 7;
const SEG = 28;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3(), _m = new THREE.Vector3();

// a camera-facing ribbon along a curve, with a scrolling energy pattern
function beamRibbon() {
  const n = (SEG + 1) * 2;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  const uv = new Float32Array(n * 2), idx = [];
  for (let i = 0; i <= SEG; i++) { uv.set([i / SEG, 0, i / SEG, 1], i * 4); if (i < SEG) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uK: { value: 1 }, uStrain: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT, uK, uStrain;
      void main(){
        float v = vUv.y * 2.0 - 1.0, u = vUv.x;
        float core = exp(-v * v * 26.0);
        float glow = exp(-v * v * 3.5) * 0.35;
        // two strands twisting round the core, racing towards the prop
        float s1 = exp(-pow((v - 0.55 * sin(u * 26.0 - uT * 16.0)) * 7.0, 2.0));
        float s2 = exp(-pow((v + 0.55 * sin(u * 26.0 - uT * 16.0 + 1.6)) * 7.0, 2.0));
        float pulse = 0.6 + 0.4 * sin(u * 60.0 - uT * 30.0);
        float ends = smoothstep(0.0, 0.06, u) * (0.55 + 0.45 * smoothstep(1.0, 0.85, u));
        vec3 cool = vec3(0.32, 0.92, 1.0), hot = vec3(1.0, 0.55, 0.22);
        vec3 col = mix(cool, hot, uStrain);
        float a = (core * 1.6 * pulse + glow + (s1 + s2) * 0.7) * ends * uK;
        gl_FragColor = vec4(col * a * 1.6 + vec3(core * 0.6 * a), a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; mesh.renderOrder = 9;
  return mesh;
}

// a little ring of light that hugs the held prop
function grabGlow() {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT, uK;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p), a0 = atan(p.y, p.x);
        float ring = exp(-pow((r - 0.62 - 0.04 * sin(a0 * 6.0 + uT * 8.0)) * 14.0, 2.0));
        float dot = exp(-r * r * 16.0) * 1.2;
        float ticks = step(0.7, fract(a0 * 1.9099 + uT * 0.8)) * exp(-pow((r - 0.86) * 18.0, 2.0));
        float a = (ring + dot + ticks * 0.8) * uK;
        gl_FragColor = vec4(vec3(0.35, 0.95, 1.0) * a * 1.8, a);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), m);
  mesh.frustumCulled = false; mesh.renderOrder = 9;
  return mesh;
}

export class GravGun {
  constructor(game) {
    this.name = 'gravgun';
    this.g = game;
    this.hold = null; // { pid, dist }
    this.beams = new Map(); // holder id -> { ribbon, glow, k }
    this.group = new THREE.Group(); this.group.name = 'gravbeams';
    game.engine.scene.add(this.group);
    this.netT = 0; this.t = 0;
    this.remoteHolds = new Map(); // on clients: what other players are holding (for their beams)
    game.gravgun = this;
  }
  busy() { return !!this.hold; }
  heldGun() { const s = this.g.inventory.held(); return s && ITEMS[s.id]?.tool?.kind === 'gravgun'; }
  // where the beam leaves the gun, in world space
  muzzle(pl, out) {
    const g = this.g;
    if (pl === g.local && g.viewmodel?.group.visible) {
      const m = g.viewmodel.held?.getObjectByName('muzzle');
      if (m) return m.getWorldPosition(out);
    }
    const m = pl.char?.heldGroup?.getObjectByName('muzzle') ?? pl.char?.handR;
    if (m) return m.getWorldPosition(out);
    return out.copy(pl.pos).add(_v.set(0, 1.1, 0));
  }
  aim() {
    const r = this.g.interaction.aimRay();
    _o.copy(r.o); _d.copy(r.d);
    return { o: _o, d: _d };
  }
  // ---------------------------------------------------------------- local control
  update(dt) {
    const g = this.g, P = g.props, inp = g.input, me = g.local;
    this.t += dt;
    if (!P) return;
    const gun = this.heldGun() && !g.uiOpen && !me.downed && !me.sitting && !me.sleeping && !g.building?.active && !g.titleMode && !g.cinematic;
    if (!gun) { if (this.hold) this.drop(); this.claim(false); this.updateBeams(dt); return; }
    const { o, d } = this.aim();
    if (this.hold) {
      const prop = P.list.get(this.hold.pid);
      if (!prop) { this.hold = null; }
      else {
        if (inp.wheel) this.hold.dist = THREE.MathUtils.clamp(this.hold.dist - Math.sign(inp.wheel) * 0.45, MIN_D, MAX_D);
        const target = _c.copy(o).addScaledVector(d, this.hold.dist);
        // never pull it into the ground
        const gy = g.sampler.heightAt(target.x, target.z) + 0.25;
        if (target.y < gy) target.y = gy;
        this.setTarget(target);
        const heavy = !this.liftable(prop);
        this.prompt({ key: 'RMB', text: 'Throw', alt: { key: inp.keyName('command'), text: 'Hand to a creature' }, warn: heavy ? `Too heavy to lift alone (${prop.mass} kg). Get a friend's beam on it!` : null });
        if (!inp.down('use')) this.drop();
        else if (inp.pressed('alt')) this.throw(d);
        else if (inp.pressed('command')) this.giveToDino(prop);
        else if (prop.pos.distanceTo(me.pos) > REACH + 3) { this.drop(); g.ui?.toast('Lost the beam: too far away', 'warn'); }
      }
    }
    if (!this.hold) {
      const hit = P.raycast(o, d, REACH);
      const onDino = hit && this.dinoCarrying(hit.prop.id);
      if (hit) {
        const iname = ITEMS[hit.prop.item]?.name ?? '';
        const nm = hit.prop.T.name + (hit.prop.item && hit.prop.n > 1 ? (iname === hit.prop.T.name ? ` x${hit.prop.n}` : ` (${iname} x${hit.prop.n})`) : '');
        this.prompt({ key: 'LMB', text: (onDino ? 'Take back ' : 'Lift ') + nm, info: `${hit.prop.mass} kg` });
        if (inp.pressed('use')) this.grab(hit);
      } else this.claim(false);
    }
    this.updateBeams(dt);
  }
  liftable(prop) { return this.g.props.holdersOf(prop.id) * LIFT * 1.2 > prop.mass * 9.8; }
  prompt(p) { const g = this.g; g.promptClaim = 'gravgun'; g.ui?.setPrompt(p); }
  claim(on) { const g = this.g; if (!on && g.promptClaim === 'gravgun') { g.promptClaim = null; } }
  grab(hit) {
    const g = this.g, P = g.props;
    const dist = THREE.MathUtils.clamp(hit.dist, MIN_D, MAX_D);
    this.hold = { pid: hit.prop.id, dist };
    // a creature carrying it lets go
    const dh = this.dinoCarrying(hit.prop.id);
    if (dh) this.releaseHolder(dh);
    if (g.net && !g.isHost) g.net.send('propHold', { pid: hit.prop.id, p: hit.point.toArray(), dist, t: hit.point.toArray() });
    else P.grab(g.local.id, hit.prop.id, hit.point, dist);
    g.audio?.play('grav_on', { pos: hit.point, vol: 0.7 });
    g.events.emit('gravGrab', { prop: hit.prop });
  }
  setTarget(t) {
    const g = this.g;
    if (g.net && !g.isHost) {
      this.netT -= g.dtLast ?? 0.016;
      if (this.netT <= 0) { this.netT = 1 / 15; g.net.send('propHold', { pid: this.hold.pid, p: t.toArray(), dist: this.hold.dist, t: t.toArray() }); }
    } else g.props.setTarget(g.local.id, t);
  }
  drop(impulse = null) {
    const g = this.g;
    if (!this.hold) return;
    const pid = this.hold.pid;
    this.hold = null;
    if (g.net && !g.isHost) g.net.send('propHold', { release: true, imp: impulse?.toArray() });
    else g.props.release(g.local.id, impulse);
    g.audio?.play('grav_off', { vol: 0.5 });
    g.events.emit('gravDrop', { pid });
  }
  throw(d) {
    const g = this.g, prop = g.props.list.get(this.hold.pid);
    const imp = d.clone().multiplyScalar(Math.min((prop?.mass ?? 20) * 11, 380)).add(_v.set(0, 60, 0));
    this.drop(imp);
    g.audio?.play('whoosh', { pos: g.local.pos, vol: 0.6, rate: 0.8 });
    g.rig?.addTrauma?.(0.08);
  }
  // ---------------------------------------------------------------- creatures carry things
  dinoCarrying(pid) {
    for (const [k, h] of this.g.props.holds) if (h.pid === pid && String(k).startsWith('dino:')) return k;
    return null;
  }
  releaseHolder(k) {
    const g = this.g;
    if (g.net && !g.isHost) g.net.send('dinoCarry', { pid: null, dino: k.slice(5) });
    else g.props.release(k);
  }
  giveToDino(prop) {
    const g = this.g, me = g.local;
    let best = null, bd = 14 * 14;
    for (const dn of g.dinos?.tamed?.() ?? []) {
      if (dn.owner && dn.owner !== me.id) continue;
      if (dn.baby && dn.growth < 0.6) continue;
      const d2 = dn.pos.distanceToSquared(me.pos);
      if (d2 < bd) { bd = d2; best = dn; }
    }
    if (!best) { g.ui?.toast('No tamed creature nearby to carry it', 'warn'); return; }
    if ((best.rig.height ?? 1) < 0.7) { g.ui?.toast(`${best.displayName} is too small to carry that`, 'warn'); return; }
    const pid = prop.id;
    this.drop();
    if (g.net && !g.isHost) g.net.send('dinoCarry', { pid, dino: best.id });
    else this.dinoTake(best, pid);
    g.ui?.toast(`${best.displayName} is carrying the ${prop.T.name.toLowerCase()}`, 'good');
    g.audio?.play(best.sp.call ?? 'grunt', { pos: best.pos, vol: 0.7 });
  }
  dinoTake(dn, pid) {
    const P = this.g.props, prop = P.list.get(pid);
    if (!prop) return;
    for (const [k, h] of P.holds) if (h.pid === pid) P.holds.delete(k);
    const top = this.dinoBack(dn, new THREE.Vector3());
    P.grab('dino:' + dn.id, pid, prop.pos.clone(), 0);
    P.setTarget('dino:' + dn.id, top);
  }
  dinoBack(dn, out) { return out.copy(dn.pos).add(_w.set(0, (dn.rig.height ?? 1) * (dn.sizeK ?? 1) + 0.35, 0)); }
  // host: keep creature-carried props on their backs (creatures are strong: they always lift)
  hostCarry() {
    const g = this.g, P = g.props;
    for (const [k, h] of P.holds) {
      if (!String(k).startsWith('dino:')) continue;
      const dn = g.dinos?.list.get(k.slice(5));
      if (!dn || dn.state === 'dead' || dn.state === 'ko') { P.holds.delete(k); continue; }
      const prop = P.list.get(h.pid);
      if (!prop) continue;
      this.dinoBack(dn, h.target);
      // the creature's own strength: pull the prop up onto its back however heavy it is
      if (prop.pos.distanceTo(h.target) > 4) { prop.pos.copy(h.target); prop.vel.set(0, 0, 0); }
      h.strong = true; // props.step: no strength limit for a creature
    }
  }
  // ---------------------------------------------------------------- beams (everyone's)
  updateBeams(dt) {
    const g = this.g, P = g.props;
    if (g.isHost || !g.net) this.hostCarry();
    const live = new Set();
    const holds = g.net && !g.isHost ? this.clientHolds() : P.holds;
    for (const [k, h] of holds) {
      if (String(k).startsWith('dino:')) continue;
      const pl = g.players.get(k);
      const prop = P.list.get(h.pid);
      if (!pl || !prop) continue;
      live.add(k);
      let b = this.beams.get(k);
      if (!b) { b = { ribbon: beamRibbon(), glow: grabGlow(), k: 0 }; this.group.add(b.ribbon, b.glow); this.beams.set(k, b); }
      b.k = Math.min(1, b.k + dt * 8);
      const a = this.muzzle(pl, _v);
      const end = _w.copy(h.local).applyQuaternion(prop.quat).add(prop.pos);
      const strain = 1 - Math.min(1, Math.max(0, (P.holdersOf(prop.id) * LIFT * 1.2 - prop.mass * 9.8) / 120 + 0.5));
      this.drawBeam(b, a, end, h.target ?? end, strain);
    }
    for (const [k, b] of this.beams) if (!live.has(k)) {
      b.k -= dt * 6;
      if (b.k <= 0) { b.ribbon.removeFromParent(); b.glow.removeFromParent(); b.ribbon.geometry.dispose(); this.beams.delete(k); }
      else { b.ribbon.material.uniforms.uK.value = b.k; b.glow.material.uniforms.uK.value = b.k; }
    }
  }
  // on a client: our own hold + what the host tells us others hold
  clientHolds() {
    const m = new Map(this.remoteHolds);
    if (this.hold) { const prop = this.g.props.list.get(this.hold.pid); if (prop) m.set(this.g.local.id, { pid: this.hold.pid, local: _m.set(0, 0, 0).clone(), target: null }); }
    return m;
  }
  drawBeam(b, a, end, target, strain) {
    const cam = this.g.engine.camera;
    // a quadratic curve that bows towards where the beam wants the prop to be
    const ctrl = _c.copy(a).lerp(end, 0.5).lerp(target, 0.5).add(_m.copy(target).sub(end).multiplyScalar(0.6));
    const pos = b.ribbon.geometry.attributes.position;
    const len = a.distanceTo(end);
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG, it = 1 - t;
      const x = it * it * a.x + 2 * it * t * ctrl.x + t * t * end.x;
      const y = it * it * a.y + 2 * it * t * ctrl.y + t * t * end.y;
      const z = it * it * a.z + 2 * it * t * ctrl.z + t * t * end.z;
      // tangent and the side vector that faces the camera
      const tx = 2 * it * (ctrl.x - a.x) + 2 * t * (end.x - ctrl.x);
      const ty = 2 * it * (ctrl.y - a.y) + 2 * t * (end.y - ctrl.y);
      const tz = 2 * it * (ctrl.z - a.z) + 2 * t * (end.z - ctrl.z);
      const vx = cam.position.x - x, vy = cam.position.y - y, vz = cam.position.z - z;
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const sl = Math.hypot(sx, sy, sz) || 1;
      // thin at the muzzle, wider in the middle, a little flare at the prop
      const w = (0.018 + 0.05 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.03 * t * t) * Math.min(1, 0.4 + len * 0.15);
      sx *= w / sl; sy *= w / sl; sz *= w / sl;
      pos.setXYZ(i * 2, x - sx, y - sy, z - sz);
      pos.setXYZ(i * 2 + 1, x + sx, y + sy, z + sz);
    }
    pos.needsUpdate = true;
    const U = b.ribbon.material.uniforms;
    U.uT.value = this.t; U.uK.value = b.k; U.uStrain.value += (strain - U.uStrain.value) * 0.1;
    b.glow.position.copy(end);
    b.glow.quaternion.copy(cam.quaternion);
    b.glow.scale.setScalar(0.42);
    b.glow.material.uniforms.uT.value = this.t; b.glow.material.uniforms.uK.value = b.k;
    // sparks now and then
    if (Math.random() < 0.3) this.g.fx?.glow?.(_v.copy(end).add(_m.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5)), 0x5ef2ff, 0.12, 0.35);
  }
}

export async function install(g) {
  const S = new GravGun(g);
  g.addSystem(S);
  g.heldHandlers.gravgun = () => true; // the gun does its own thing in update(); no swinging
  // host: a client gives a prop to its creature
  g.netHandlers.dinoCarry = (d, from) => {
    if (!g.isHost) return;
    if (!d.pid) { g.props.release('dino:' + d.dino); return; }
    const dn = g.dinos?.list.get(d.dino);
    if (dn && dn.tamed && (!dn.owner || dn.owner === from)) { g.props.release(from); S.dinoTake(dn, d.pid); }
  };
  // host: tell clients who holds what so everyone sees everyone's beams
  let t = 0;
  g.addSystem({
    name: 'gravbeamsync',
    update(dt) {
      if (!g.net?.isHost || !g.net.connected) return;
      t -= dt; if (t > 0) return; t = 0.2;
      const arr = [];
      for (const [k, h] of g.props.holds) if (!String(k).startsWith('dino:')) arr.push([k, h.pid, +h.local.x.toFixed(2), +h.local.y.toFixed(2), +h.local.z.toFixed(2)]);
      g.net.broadcast('gravHolds', arr);
    },
  });
  g.netHandlers.gravHolds = (arr) => {
    if (g.isHost) return;
    S.remoteHolds.clear();
    for (const [k, pid, x, y, z] of arr) if (k !== g.local.id) S.remoteHolds.set(k, { pid, local: new THREE.Vector3(x, y, z), target: null });
  };
  return S;
}
