// Weapons + handheld gadgets: melee hits on dinos (clubs add torpor), aimed
// ranged weapons that fire physical projectiles (slingshot stones, tranq
// darts, rifle shells, bolas, nets, thrown spears), the torch and flashlight
// lights, and the dino whistle.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();
const PROJ = {
  sling: { ammo: 'stone', speed: 34, grav: 9, dmg: 4, torpor: 10, snd: 'throw', model: 'stone' },
  blowgun: { ammo: 'tranq_dart', speed: 42, grav: 5, dmg: 2, torpor: 0, dart: 45, snd: 'dart', model: 'dart' },
  rifle: { ammo: 'tranq_bullet', speed: 90, grav: 2, dmg: 6, torpor: 0, dart: 160, snd: 'rifle', model: 'shell' },
  bola: { ammo: 'bola', speed: 22, grav: 12, dmg: 1, torpor: 4, bola: true, snd: 'throw', model: 'bola' },
  net: { ammo: null, speed: 16, grav: 12, dmg: 0, torpor: 0, net: true, snd: 'throw', model: 'net', range: 9 },
  spear: { ammo: 'self', speed: 26, grav: 10, dmg: 22, torpor: 0, snd: 'throw', model: 'spear', keep: true },
};

export class Weapons {
  constructor(game) {
    this.name = 'weapons';
    this.g = game;
    this.proj = [];
    this.group = new THREE.Group(); game.engine.scene.add(this.group);
    this.cool = 0;
    this.mats = {
      stone: new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.9 }),
      dart: new THREE.MeshStandardMaterial({ color: 0xd04060, roughness: 0.5 }),
      shell: new THREE.MeshStandardMaterial({ color: 0xd8a840, roughness: 0.3, metalness: 0.8 }),
      rope: new THREE.MeshStandardMaterial({ color: 0xc8b080, roughness: 0.9 }),
      net: new THREE.MeshStandardMaterial({ color: 0xc8b080, roughness: 0.9, wireframe: true }),
      wood: new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: 0.8 }),
    };
    this.torchSrc = game.lightPool?.add({ pos: new THREE.Vector3(), color: 0xffa050, intensity: 0, range: 9, flicker: 0.5, on: false, priority: 3 });
    this.flash = new THREE.SpotLight(0xfff4e0, 0, 40, 0.42, 0.45, 1.2);
    this.flash.castShadow = false;
    game.engine.scene.add(this.flash, this.flash.target);
    this.flashOn = false;
    game.weapons = this;
  }
  makeMesh(kind) {
    const M = this.mats;
    const g = new THREE.Group();
    switch (kind) {
      case 'stone': g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), M.stone)); break;
      case 'dart': { const c = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.16, 5), M.dart); c.rotation.x = -Math.PI / 2; g.add(c); break; }
      case 'shell': { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.08, 6), M.shell); c.rotation.x = Math.PI / 2; g.add(c); break; }
      case 'bola': { for (const sx of [-1, 1]) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), M.stone); b.position.x = sx * 0.3; g.add(b); } const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.6, 4), M.rope); r.rotation.z = Math.PI / 2; g.add(r); g.userData.spin = 18; break; }
      case 'net': { const n = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6, 0, Math.PI * 2, 0, 1.2), M.net); n.rotation.x = Math.PI / 2; g.add(n); break; }
      case 'spear': { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.4, 6), M.wood); s.rotation.x = Math.PI / 2; g.add(s); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 5), M.stone); tip.rotation.x = -Math.PI / 2; tip.position.z = -0.76; g.add(tip); break; }
      default: g.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), M.stone));
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return g;
  }

  // ---------------------------------------------------------------- melee (via Interaction swings)
  melee(d, hdef, kind) {
    const g = this.g;
    const tool = hdef?.tool;
    const dmg = tool?.dmg ?? (kind === 'hand' ? 1.5 : 3);
    const torpor = tool?.torpor ?? (kind === 'hand' ? 1 : 2);
    g.act('dino_hit', { id: d.id, dmg, torpor });
    g.fx.chips_(d.pos.x, d.pos.y + d.rig.height * 0.5 * d.sizeK, d.pos.z, 3, [0xc84040, 0xffffff], { speed: 1.5, size: 0.04 });
    g.audio?.play(kind === 'club' ? 'bonk' : 'punch', { pos: d.pos, vol: 0.8 });
    g.rig.addTrauma(0.08);
    if (kind === 'hand' && d.sp.size > 3 && Math.random() < 0.5) g.ui?.toast('Punching a critter. Bold strategy.', 'warn');
  }

  // ---------------------------------------------------------------- ranged
  fire(kind, hdef) {
    const g = this.g, P = PROJ[kind];
    if (!P || this.cool > 0) return false;
    const inv = g.inventory;
    if (P.ammo === 'self') { if (!inv.removeAt(inv.selected, 1)) return false; }
    else if (P.ammo && P.ammo !== hdef.id) { if (!inv.remove(P.ammo, 1)) { g.ui?.toast(`Out of ${ITEMS[P.ammo].name}!`, 'warn', P.ammo); g.audio?.play('error', { vol: 0.4 }); return false; } }
    else if (P.ammo === hdef.id) { if (!inv.removeAt(inv.selected, 1)) return false; }
    const cam = g.engine.camera;
    const o = cam.position.clone(), dir = new THREE.Vector3(); cam.getWorldDirection(dir);
    // start from the player's hand but aim where the crosshair points
    const hit = g.physics.raycast(o, dir, 120, {});
    const aimAt = hit ? hit.point : o.clone().addScaledVector(dir, 120);
    const from = g.local.headPos(new THREE.Vector3()).add(new THREE.Vector3(-Math.sin(g.local.yaw) * 0.4, -0.15, -Math.cos(g.local.yaw) * 0.4));
    const vel = aimAt.clone().sub(from).normalize().multiplyScalar(P.speed);
    vel.y += (P.grav * Math.min(2, from.distanceTo(aimAt) / P.speed)) * 0.5; // compensate the drop
    const m = this.makeMesh(P.model);
    m.position.copy(from); this.group.add(m);
    this.proj.push({ kind, P, pos: from.clone(), vel, mesh: m, life: 6, by: g.local.id, hdef });
    this.cool = kind === 'rifle' ? 1.1 : kind === 'blowgun' ? 0.7 : 0.45;
    g.audio?.play(P.snd, { pos: from, vol: kind === 'rifle' ? 1 : 0.6 });
    g.local.startAction(kind === 'blowgun' || kind === 'rifle' ? 'aim' : 'throw', 0.4, null, 2, { faceCam: true });
    if (kind === 'rifle') { g.rig.addTrauma(0.2); g.rig.fovKick = 6; g.dinos?.noise(from, 70, 0.9); }
    if (hdef.durability && hdef.durability < 9999 && kind !== 'spear' && kind !== 'bola') inv.useDurability(inv.selected, 1);
    return true;
  }
  updateProj(dt) {
    const g = this.g;
    for (const pr of this.proj) {
      pr.life -= dt;
      const prev = pr.pos.clone();
      pr.vel.y -= pr.P.grav * dt;
      pr.pos.addScaledVector(pr.vel, dt);
      pr.mesh.position.copy(pr.pos);
      _d.copy(pr.vel).normalize();
      pr.mesh.lookAt(_v.copy(pr.pos).add(_d));
      if (pr.mesh.userData.spin) pr.mesh.rotateZ(dt * pr.mesh.userData.spin);
      if (pr.P.range && pr.pos.distanceTo(g.local.pos) > pr.P.range + 2) pr.vel.multiplyScalar(0.9);
      // dinos
      let hitD = null;
      for (const d of g.dinos?.list.values() ?? []) {
        if (d.state === 'dead') continue;
        const r = d.radius * d.sizeK + 0.15;
        for (const k of [-0.3, 0.1, 0.45]) {
          _v.set(d.pos.x - Math.sin(d.yaw) * d.rig.len * k * d.sizeK, d.pos.y + Math.min(d.rig.height * 0.55, 2.5) * d.sizeK, d.pos.z - Math.cos(d.yaw) * d.rig.len * k * d.sizeK);
          if (segSphere(prev, pr.pos, _v, r)) { hitD = d; break; }
        }
        if (hitD) break;
      }
      if (hitD) { this.impact(pr, hitD); pr.dead = true; continue; }
      // world
      const len = prev.distanceTo(pr.pos);
      const wh = g.physics.raycast(prev, _d, len + 0.05, {});
      if (wh || pr.life <= 0) {
        if (wh) { pr.pos.copy(wh.point); g.fx.dust(wh.point, 2, 0xb8a888, 0.4); g.audio?.play('clack', { pos: wh.point, vol: 0.4 }); }
        if (pr.P.keep || pr.kind === 'sling' || pr.kind === 'bola') g.drops?.spawn(pr.kind === 'spear' ? 'spear' : pr.kind === 'bola' ? 'bola' : 'stone', 1, pr.pos.clone().add(new THREE.Vector3(0, 0.2, 0)), new THREE.Vector3(0, 1, 0), { dur: pr.kind === 'spear' ? pr.hdef?.durability : undefined });
        pr.dead = true;
      }
    }
    for (const pr of this.proj) if (pr.dead) pr.mesh.removeFromParent();
    this.proj = this.proj.filter((p) => !p.dead);
  }
  impact(pr, d) {
    const g = this.g, P = pr.P;
    if (P.net) { g.act('dino_net', { id: d.id }); return; }
    if (P.bola) { g.act('dino_bola', { id: d.id }); }
    const torpor = (P.torpor ?? 0) + (P.dart ?? 0) * (d.sp.size > 8 ? 0.8 : 1);
    g.act('dino_hit', { id: d.id, dmg: P.dmg, torpor });
    g.audio?.play(P.dart ? 'dart' : 'bonk', { pos: d.pos, vol: 0.7 });
    if (P.dart) g.fx.sprite('exclaim', d.pos.x, d.pos.y + d.rig.height * d.sizeK + 0.4, d.pos.z, { life: 0.8, size: 0.5, vy: 0.5, color: 0xd04060 });
    if (pr.kind === 'spear') g.drops?.spawn('spear', 1, d.pos.clone().add(new THREE.Vector3(0, 0.5, 0)));
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g, p = g.local, inp = g.input;
    this.cool = Math.max(0, this.cool - dt);
    const held = g.inventory.held(), hdef = held ? ITEMS[held.id] : null, kind = hdef?.tool?.kind ?? hdef?.cat;
    // aiming (RMB) for ranged weapons
    const ranged = ['sling', 'blowgun', 'rifle', 'bola', 'spear', 'net'].includes(kind);
    g.aiming = ranged && inp.down('alt') && !g.uiOpen && !p.sitting;
    // torch light follows the hand
    const torch = kind === 'torch' && !p.swim;
    if (this.torchSrc) { this.torchSrc.on = torch; this.torchSrc.intensity = torch ? (held.id === 'lantern' ? 2.2 : 3) : 0; this.torchSrc.color = held?.id === 'lantern' ? 0xc8ff80 : 0xffa050; if (torch) p.headPos(this.torchSrc.pos).add(new THREE.Vector3(-Math.sin(p.yaw) * 0.3, 0.1, -Math.cos(p.yaw) * 0.3)); }
    if (torch && held.id === 'torch' && Math.random() < dt * 14) { const a = this.torchSrc.pos; g.fx.flame(_v.copy(a).add(new THREE.Vector3(0, 0.15, 0)), 0.3); }
    // flashlight (L or LMB while held), drains charge
    if (inp.pressed('flashlight') && !g.uiOpen && g.inventory.count('flashlight')) { this.flashOn = !this.flashOn; g.audio?.play('switch', { vol: 0.5 }); }
    if (kind === 'flashlight' && inp.pressed('use') && !g.uiOpen) { this.flashOn = !this.flashOn; g.audio?.play('switch', { vol: 0.5 }); }
    if (this.flashOn) {
      const idx = g.inventory.slots.findIndex((s) => s?.id === 'flashlight');
      if (idx < 0 || !g.inventory.useCharge(idx, 0) || (g.inventory.slots[idx].ch ?? 0) <= 0) { this.flashOn = false; g.ui?.toast('Flashlight battery is dead. Charge it in the van.', 'warn', 'flashlight'); }
      else { this._fl = (this._fl ?? 0) + dt; if (this._fl > 5) { this._fl = 0; g.inventory.useCharge(idx, 1); } }
    }
    const cam = g.engine.camera;
    this.flash.intensity += ((this.flashOn ? 30 : 0) - this.flash.intensity) * Math.min(1, dt * 12);
    if (this.flash.intensity > 0.1) { this.flash.position.copy(cam.position).add(new THREE.Vector3(0, -0.15, 0)); cam.getWorldDirection(_d); this.flash.target.position.copy(cam.position).addScaledVector(_d, 10); this.flash.target.updateMatrixWorld(); }
    // whistle: F commands tamed dinos nearby
    if (inp.pressed('whistle') && !g.uiOpen && !g.building?.active && !p.sitting) this.whistle();
    this.updateProj(dt);
  }
  whistle() {
    const g = this.g;
    const near = (g.dinos?.tamed() ?? []).filter((d) => d.owner === g.local.id && d.dist2(g.local.pos) < 40 * 40);
    g.audio?.play('whistle', { pos: g.local.pos, vol: 0.9 });
    g.local.startAction('interact', 0.5, null, 2);
    if (!near.length) { g.ui?.toast('*whistle* ...nobody came.'); return; }
    const cycle = ['follow', 'stay', 'wander'];
    const next = cycle[(cycle.indexOf(near[0].order) + 1) % cycle.length] ?? 'follow';
    for (const d of near) g.taming?.command(d, next);
    g.ui?.toast(`*whistle* ${near.length} critter${near.length > 1 ? 's' : ''}: ${next.toUpperCase()}`, '', 'dino');
  }
}
function segSphere(a, b, c, r) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz || 1e-6;
  const t = Math.max(0, Math.min(1, (acx * abx + acy * aby + acz * abz) / l2));
  const dx = a.x + abx * t - c.x, dy = a.y + aby * t - c.y, dz = a.z + abz * t - c.z;
  return dx * dx + dy * dy + dz * dz < r * r;
}

export async function install(g) {
  const W = new Weapons(g);
  g.addSystem(W);
  for (const k of ['sling', 'blowgun', 'rifle', 'bola', 'net', 'spear']) {
    g.heldHandlers[k] = (held, hdef, tgt) => {
      if (!g.input.pressed('use')) return true;
      // spears poke at close range unless aiming (RMB) to throw
      if (k === 'spear' && !g.aiming) return false;
      W.fire(k, hdef);
      return true;
    };
  }
  g.heldHandlers.flashlight = () => true;
  g.heldHandlers.whistle = () => { if (g.input.pressed('use')) W.whistle(); return true; };
  // melee on dinos via the normal swing: route Interaction onHit for dino targets
  const prevTarget = g.taming?.target?.bind(g.taming);
  if (g.taming && prevTarget) g.taming.target = (d, dist) => { const t = prevTarget(d, dist); if (d.tamed || d.state === 'dead') return t; t.onHit = ({ hdef, kind }) => W.melee(d, hdef, kind); t.use = t.use ?? 'Hit'; t.tool = 'any'; return t; };
  return W;
}
