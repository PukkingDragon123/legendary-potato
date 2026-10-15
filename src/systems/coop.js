// Co-op rescue: getting knocked down, friends reviving you (hold E) or
// throwing you over their shoulder and carrying you to safety, plus the
// solo fallback (wake up back at camp) and night raids on your base.
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Coop {
  constructor(game) {
    this.name = 'coop';
    this.g = game;
    this.reviving = null;
    this.raidDay = 0;
  }
  // interaction target: a downed / carried friend
  raycast(o, d, reach) {
    const g = this.g;
    let best = null;
    for (const p of g.players.values()) {
      if (p.local || !p.downed) continue;
      _v.copy(p.pos).add(new THREE.Vector3(0, 0.3, 0));
      const t = Math.max(0, _v.clone().sub(o).dot(d));
      if (t > reach + 0.5) continue;
      if (o.clone().addScaledVector(d, t).distanceTo(_v) < 0.7 && (!best || t < best.dist)) best = { dist: t, p };
    }
    if (!best) return null;
    const p = best.p, key = g.input.keyName('interact');
    const prog = this.reviving?.p === p ? this.reviving.t / 3 : null;
    return {
      dist: best.dist, kind: 'player', label: `${p.name} (knocked out)`, info: 'Hold to revive · or carry them to safety',
      prompt: { key, text: 'Hold to revive', progress: prog, alt: { key: g.input.keyName('command'), text: g.local.carrying ? 'Put down' : 'Carry' } },
      onInteract: () => { this.reviving = { p, t: 0 }; },
      onCommand: () => this.carry(p),
    };
  }
  carry(p) {
    const g = this.g;
    if (g.local.carrying) { this.drop(); return; }
    g.local.carrying = p.id;
    g.net?.sendTo?.(p.id, 'carried', { by: g.local.id });
    g.audio?.play('whoosh', { pos: g.local.pos, vol: 0.6 });
    g.ui?.toast(`Carrying ${p.name}. ${g.input.keyName('command')} to put them down.`, '', 'friend');
  }
  drop() {
    const g = this.g, id = g.local.carrying;
    if (!id) return;
    g.local.carrying = null;
    g.net?.sendTo?.(id, 'carried', { by: null, x: g.local.pos.x + Math.sin(g.local.yaw) * 0.8, y: g.local.pos.y, z: g.local.pos.z + Math.cos(g.local.yaw) * 0.8 });
  }
  update(dt) {
    const g = this.g, me = g.local, inp = g.input;
    // reviving a friend: hold E
    if (this.reviving) {
      const R = this.reviving;
      if (!inp.down('interact') || !R.p.downed || R.p.pos.distanceTo(me.pos) > 3) this.reviving = null;
      else {
        R.t += dt;
        if (!me.action) me.startAction('pet', 0.6, null, 2);
        if (R.t >= 3) { g.net?.sendTo?.(R.p.id, 'revive', { by: me.id }); g.fx.hearts(R.p.pos.clone().add(new THREE.Vector3(0, 0.8, 0)), 5); g.audio?.play('revive', { pos: R.p.pos }); this.reviving = null; g.events.emit('revivedFriend', { p: R.p }); }
      }
    }
    // carry key on a targeted friend
    const tgt = g.interaction?.target;
    if (tgt?.kind === 'player' && tgt.onCommand && inp.pressed('command') && !g.uiOpen) tgt.onCommand();
    else if (me.carrying && inp.pressed('command') && !g.uiOpen) this.drop();
    // being carried: ride on the carrier's shoulder
    if (me.carriedBy) {
      const c = g.players.get(me.carriedBy);
      if (!c) me.carriedBy = null;
      else {
        me.pos.copy(c.pos).add(new THREE.Vector3(0, 1.05, 0)).addScaledVector(new THREE.Vector3(Math.sin(c.yaw), 0, Math.cos(c.yaw)), 0.12);
        me.root.position.copy(me.pos); me.root.rotation.y = c.yaw + Math.PI / 2; me.yaw = c.yaw;
      }
    }
    // solo: nobody can save you, so wake up at camp after a short blackout
    if (me.downed && !g.anyFriendNear?.() && me.downedT > (g.players.size > 1 ? 75 : 5) && !this.bled) { this.bled = true; g.events.emit('bleedout', me); setTimeout(() => (this.bled = false), 1000); }
    if (me.downed && me.downedT > 0.1 && me.downedT < 0.2) g.ui?.toast(g.players.size > 1 ? 'You are down! A friend can revive you (hold E).' : 'You blacked out...', 'warn');
    this.nightRaid(dt);
  }
  // raptor packs probe the camp after the second night
  nightRaid() {
    const g = this.g;
    if (!g.isHost || !g.dinos || !g.time.isNight || g.time.day < 2 || this.raidDay === g.time.day) return;
    if (g.bosses?.isDown('razor')) return; // the packs lost their alpha
    const hour = g.time.hour;
    if (!(hour > 21.5 || hour < 3)) return;
    if (Math.random() > 0.002) return;
    this.raidDay = g.time.day;
    // target: the biggest cluster of structures, or the van
    const S = [...(g.structures?.list.values() ?? [])];
    const c = S.length ? S.reduce((a, s) => a.add(new THREE.Vector3(s.x, 0, s.z)), new THREE.Vector3()).multiplyScalar(1 / S.length) : g.van?.pos.clone() ?? g.local.pos.clone();
    const a = Math.random() * 6.28, R = 70;
    const x = c.x + Math.cos(a) * R, z = c.z + Math.sin(a) * R;
    const herd = { id: 'raid' + g.time.day, leader: null, members: [], home: c.clone(), alarm: 0 };
    const n = Math.min(5, 2 + Math.floor(g.time.day / 3));
    for (let k = 0; k < n; k++) { const d = g.dinos.spawn('raptor', x + k * 1.5, z + (k % 2) * 2, { herd, home: c.clone() }); herd.members.push(d); herd.leader = herd.leader ?? d; d.target = g.local; d.setState('stalk', 30); d.food = 10; }
    g.audio?.play('screech', { pos: new THREE.Vector3(x, g.sampler.heightAt(x, z) + 2, z), vol: 1.2, ref: 40 });
    g.ui?.toast('You hear screeching in the dark... Voltfangs are coming! Light fires, grab torches!', 'warn', 'dino', 7000);
    g.events.emit('nightRaid', { n });
  }
}

export async function install(g) {
  const C = new Coop(g);
  g.addSystem(C);
  g.interaction.handlers.push((o, d, reach) => C.raycast(o, d, reach));
  g.netHandlers.revive = () => g.vitals?.revive(0.35);
  g.netHandlers.carried = ({ by, x, y, z }) => {
    const me = g.local;
    me.carriedBy = by;
    if (!by && x !== undefined) me.teleport(x, Math.max(y, g.sampler.heightAt(x, z)) + 0.1, z);
  };
  return C;
}
