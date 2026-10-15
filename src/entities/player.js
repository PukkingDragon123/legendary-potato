// Player: local (input-driven, physics) or remote (network-interpolated).
// Owns the cartoon Character visual, movement, swimming, jumping, tool use
// timelines and the downed/carried states for co-op rescues.
import * as THREE from 'three';
import { Character, PRESETS } from './character.js';
import { buildItemModel } from '../gfx/itemModels.js';
import { ITEMS } from '../data/items.js';

const GRAVITY = 21;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3();

export class Player {
  constructor(game, opt = {}) {
    this.game = game;
    this.id = opt.id ?? 'local';
    this.name = opt.name ?? 'Explorer';
    this.local = !!opt.local;
    this.outfit = opt.outfit ?? PRESETS[0];
    this.char = new Character(this.outfit, { local: this.local });
    this.char.fx = game.fx;
    this.root = this.char.root;
    game.engine.scene.add(this.root);
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; // body facing
    this.lookYaw = 0; this.lookPitch = 0;
    this.grounded = true;
    this.state = { pos: this.pos, vel: this.vel, grounded: true };
    this.swim = false; this.underwater = false;
    this.crouch = false; this.sprint = false;
    this.action = null; // { name, t, dur, onImpact, impacted }
    this.emote = null;
    this.downed = false; this.downedT = 0;
    this.carriedBy = null; this.carrying = null;
    this.sitting = null; // { seat }
    this.sleeping = false;
    this.talk = 0;
    this.expr = 'neutral'; this.exprT = 0;
    this.heldId = null;
    this.airTime = 0; this.fallStartY = 0;
    this.stepDist = 0;
    this.panic = 0;
    // network interpolation
    this.netBuf = [];
    this.nameTag = null;
  }

  setOutfit(o) {
    this.outfit = o;
    const p = this.root.position.clone(), r = this.root.rotation.y;
    this.root.removeFromParent();
    this.char = new Character(o, { local: this.local });
    this.char.fx = this.game.fx;
    this.root = this.char.root;
    this.root.position.copy(p); this.root.rotation.y = r;
    this.game.engine.scene.add(this.root);
    this.heldId = null;
  }

  teleport(x, y, z) { this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.root.position.copy(this.pos); }

  // eyes of a 1 m bean: the world feels big from down here (higher while swimming so you see over the water)
  headPos(out = new THREE.Vector3()) { return out.copy(this.pos).add(_v.set(0, this.swim ? 1.02 : this.crouch ? 0.6 : 0.84, 0)); }

  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (!id) { this.char.setHeld(null); return; }
    const d = ITEMS[id];
    const m = buildItemModel(d);
    // grip: point tools forward from the fist
    const g = new THREE.Group();
    g.add(m);
    if (d.cat === 'tool' || d.cat === 'weapon') { m.rotation.x = Math.PI / 2; m.position.z = -0.06; m.position.y = -0.0; g.rotation.x = -Math.PI / 2 + 0.25; }
    else { m.scale.setScalar(0.8); m.position.set(0, -0.06, 0.04); }
    if (d.tool?.kind === 'scanner' || d.tool?.kind === 'flashlight' || d.tool?.kind === 'walkie' || d.tool?.kind === 'binoculars') { g.rotation.x = -Math.PI / 2; m.rotation.x = 0; m.position.set(0, -0.02, 0.03); g.rotation.set(-0.3, 0, 0); }
    this.char.setHeld(g);
    this.heldModel = g;
  }

  startAction(name, dur, onImpact, impactAt = 0.55, extra = {}) {
    if (this.action && !this.action.cancelable) return false;
    this.action = { name, t: 0, dur, onImpact, impactAt, impacted: false, ...extra };
    return true;
  }

  // ------------------------------------------------------------------ local update
  updateLocal(dt, input, rig, opt = {}) {
    const g = this.game;
    const phys = g.physics;
    const busy = opt.uiOpen;
    // vehicle / seat / carried: no walking
    if (this.sitting || this.carriedBy || this.sleeping) { this.vel.set(0, 0, 0); this.updateAction(dt); return; }
    if (this.downed) {
      this.downedT += dt;
      this.vel.x *= 0.9; this.vel.z *= 0.9; this.vel.y -= GRAVITY * dt;
      phys.moveCapsule(this.state, dt, { radius: 0.3, height: 0.5 });
      return;
    }
    const ax = busy ? { x: 0, y: 0 } : input.axis();
    rig.flatForward(_f);
    _r.set(-_f.z, 0, _f.x);
    const wish = _v.set(0, 0, 0).addScaledVector(_f, ax.y).addScaledVector(_r, ax.x);
    const wl = g.sampler.waterAt(this.pos.x, this.pos.z);
    const depth = wl > -999 ? wl - this.pos.y : -1;
    this.swim = depth > 0.85;
    this.underwater = rig.cam.position.y < wl - 0.05 && wl > -999;
    this.crouch = !this.swim && !busy && input.down('crouch');
    const v = g.vitals;
    const canSprint = v ? v.stamina > 2 && !v.exhausted : true;
    this.sprint = !busy && input.down('sprint') && wish.lengthSq() > 0.01 && canSprint && !this.crouch;
    let speed = this.swim ? 2.4 : this.crouch ? 1.9 : this.sprint ? 6.4 : 3.6;
    if (v) speed *= v.speedMul ?? 1;
    if (this.sprint && this.swim) speed = 3.6;
    if (this.action && this.action.slow) speed *= this.action.slow;
    if (this.panic > 0) { this.panic -= dt; }
    const accel = this.grounded || this.swim ? 14 : 3.5;
    let tx = wish.x * speed, tz = wish.z * speed;
    // the river carries you: wading tugs at your legs, swimming you go where it goes
    const flow = depth > 0.25 ? g.riverFlow?.(this.pos.x, this.pos.z, this._flow ?? (this._flow = {})) : null;
    this.current = flow;
    if (flow) {
      const k = this.swim ? 0.95 : Math.min(0.55, (depth - 0.25) * 0.9);
      tx += flow.vx * k; tz += flow.vz * k;
      // whitewater rolls you under now and then
      if (this.swim && flow.rapid > 0.35 && Math.random() < dt * flow.rapid * 0.55) { this.vel.y -= 3.5 + Math.random() * 3; this.tumble = 0.6; g.audio?.play('splash', { pos: this.pos, vol: 0.6 }); }
      if (flow.fall && this.swim) this.vel.y -= 14 * dt;
    }
    if (this.tumble > 0) this.tumble -= dt;
    this.vel.x += (tx - this.vel.x) * Math.min(1, dt * accel);
    this.vel.z += (tz - this.vel.z) * Math.min(1, dt * accel);
    if (this.swim) {
      // buoyancy toward the surface + paddle up with jump
      const target = wl - 0.95;
      this.vel.y += (target - this.pos.y) * 6 * dt - this.vel.y * 2.5 * dt;
      if (!busy && input.down('jump')) this.vel.y += 9 * dt;
      if (!busy && input.down('crouch')) this.vel.y -= 9 * dt;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (!busy && input.pressed('jump') && this.grounded && (!v || v.stamina > 4)) {
        this.vel.y = 7.2;
        this.grounded = false;
        if (v) v.useStamina(6);
        g.audio?.play('jump', { pos: this.pos, vol: 0.5 });
        g.events.emit('jump', this);
      }
    }
    const wasGrounded = this.grounded;
    const res = phys.moveCapsule(this.state, dt, { radius: 0.28, height: this.crouch ? 0.85 : 1.15, step: 0.45 });
    this.grounded = res.grounded || this.swim;
    if (!wasGrounded && this.grounded && !this.swim) {
      const fall = this.fallStartY - this.pos.y;
      if (fall > 0.6) g.audio?.play('land', { pos: this.pos, vol: Math.min(1, fall / 3) });
      if (fall > 5.5 && v) v.fallDamage(fall);
    }
    if (this.grounded) this.fallStartY = this.pos.y; else this.fallStartY = Math.max(this.fallStartY, this.pos.y);
    // facing: movement direction, or camera direction while aiming / using tools
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    const aimFacing = (this.action && this.action.faceCam) || opt.aiming || rig.firstPerson;
    let targetYaw = this.yaw;
    if (aimFacing) targetYaw = rig.yaw;
    else if (hspeed > 0.4) targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
    let d = targetYaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * (aimFacing ? 18 : 11));
    this.lookPitch = rig.pitch;
    let ly = rig.yaw - this.yaw; ly = Math.atan2(Math.sin(ly), Math.cos(ly));
    this.lookYaw = Math.max(-1.1, Math.min(1.1, ly));
    // footsteps
    if (this.grounded && !this.swim && hspeed > 0.6) {
      this.stepDist += hspeed * dt;
      const stride = this.sprint ? 0.75 : 0.5;
      if (this.stepDist > stride) { this.stepDist = 0; g.events.emit('footstep', { who: this, pos: this.pos, sprint: this.sprint }); }
    } else if (this.swim && hspeed > 0.5) {
      this.stepDist += hspeed * dt;
      if (this.stepDist > 1.2) { this.stepDist = 0; g.audio?.play('swim', { pos: this.pos, vol: 0.4 }); g.fx?.splash(this.pos.x, wl, this.pos.z, 0.5); }
    }
    this.updateAction(dt);
  }

  updateAction(dt) {
    const a = this.action;
    if (!a) return;
    a.t += dt / a.dur;
    if (!a.impacted && a.t >= a.impactAt) { a.impacted = true; if (a.onImpact) a.onImpact(this); }
    if (a.t >= 1) { this.action = null; if (a.onDone) a.onDone(this); }
  }

  // ------------------------------------------------------------------ remote update (interpolation)
  pushNet(s, now) {
    this.netBuf.push({ ...s, at: now });
    if (this.netBuf.length > 20) this.netBuf.shift();
  }
  updateRemote(dt, now) {
    const delay = 0.12;
    const t = now - delay;
    const b = this.netBuf;
    if (!b.length) return;
    let i = b.length - 1;
    while (i > 0 && b[i - 1].at > t) i--;
    const a = b[Math.max(0, i - 1)], c = b[i];
    const k = c.at === a.at ? 1 : Math.max(0, Math.min(1, (t - a.at) / (c.at - a.at)));
    const prev = this.pos.clone();
    this.pos.set(a.x + (c.x - a.x) * k, a.y + (c.y - a.y) * k, a.z + (c.z - a.z) * k);
    let dy = c.yaw - a.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw = a.yaw + dy * k;
    this.vel.copy(this.pos).sub(prev).divideScalar(Math.max(dt, 1e-3));
    const s = c;
    this.grounded = s.g; this.swim = s.sw; this.crouch = s.cr; this.sprint = s.sp;
    this.lookPitch = s.lp ?? 0; this.lookYaw = s.ly ?? 0;
    this.downed = !!s.dn; this.sleeping = !!s.sl; this.expr = s.ex ?? 'neutral';
    if (s.act && (!this.action || this.action.name !== s.act)) this.action = { name: s.act, t: s.at2 ?? 0, dur: s.ad ?? 0.6, impacted: true };
    if (!s.act) this.action = null; else if (this.action) this.action.t = Math.min(1, (this.action.t ?? 0) + dt / (this.action.dur || 0.6));
    if (s.held !== this.heldId) this.setHeld(s.held);
    this.sitting = s.sit ? { remote: true, ride: s.ride } : null;
  }
  netState() {
    return {
      x: +this.pos.x.toFixed(3), y: +this.pos.y.toFixed(3), z: +this.pos.z.toFixed(3), yaw: +this.yaw.toFixed(3),
      g: this.grounded, sw: this.swim, cr: this.crouch, sp: this.sprint, lp: +this.lookPitch.toFixed(2), ly: +this.lookYaw.toFixed(2),
      act: this.action?.name ?? null, at2: this.action ? +this.action.t.toFixed(2) : 0, ad: this.action?.dur ?? 0,
      held: this.heldId, dn: this.downed ? 1 : 0, sl: this.sleeping ? 1 : 0, ex: this.expr, sit: this.sitting ? 1 : 0, ride: this.sitting?.ride ? 1 : 0, talk: +this.talk.toFixed(2),
    };
  }

  // ------------------------------------------------------------------ visuals
  updateVisual(dt) {
    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) this.expr = 'neutral'; }
    if (!this.sitting?.seatObj && !this.carriedBy) {
      this.root.position.copy(this.pos);
      this.root.rotation.y = this.yaw;
    }
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    const panicking = this.panic > 0 && hspeed > 2;
    this.char.update(dt, {
      speed: this.swim ? hspeed : this.grounded ? hspeed : 0,
      grounded: this.grounded || this.swim, vy: this.vel.y, crouch: this.crouch, sprint: this.sprint, swim: this.swim,
      action: this.action ? { name: this.action.name, t: Math.min(1, this.action.t), side: this.action.side } : this.emote ? { name: this.emote, t: 0.5 } : this.carrying ? { name: 'carry', t: 0.5 } : null,
      talk: this.talk, expr: this.expr, downed: this.downed, carried: !!this.carriedBy, sitting: !!this.sitting, ride: this.sitting?.ride, drive: this.sitting?.drive ?? null,
      sleeping: this.sleeping, lookPitch: this.lookPitch, lookYaw: this.lookYaw, yaw: this.yaw, holding: !!this.heldId, panic: panickingFor(this, panicking), underwater: this.underwater,
    });
  }
  setExpr(e, t = 1.5) { this.expr = e; this.exprT = t; }
  dispose() { this.root.removeFromParent(); this.char.dispose(); }
}
function panickingFor(p, v) { return v; }
