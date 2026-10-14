// Installs gameplay systems and wires cross-system glue (start flow, title
// camera, footsteps, tree impacts, map, saves, journal).
import * as THREE from 'three';
import { MAT, BIOME } from '../world/gen.js';
import { SPECIES } from '../world/plantModels.js';
import { LightPool } from './lights.js';

const SYSTEMS = [];
export function registerSystem(fn) { SYSTEMS.push(fn); }

export async function installExtras(game) {
  const g = game;
  // ---------------------------------------------------------------- shared hooks used by the systems below
  g.stationProviders = g.stationProviders ?? [];
  g.heldHandlers = g.heldHandlers ?? {};
  g.actionHandlers = g.actionHandlers ?? {};
  g.saveables = g.saveables ?? {};
  g.netHandlers = g.netHandlers ?? {};
  g.lightPool = new LightPool(g.engine.scene, 6);
  g.addSystem({ name: 'lights', lateUpdate: (dt) => g.lightPool.update(dt, g.engine.camera.position) });
  // ---------------------------------------------------------------- optional big systems (loaded lazily)
  const mods = await Promise.allSettled([
    import('./structures.js'), import('./building.js'), import('../entities/van.js'), import('./research.js'),
    import('../ui/computer.js'), import('./journal.js'), import('../entities/dinos.js'), import('./save.js'), import('../net/net.js'), import('./taming.js'), import('./weapons.js'),
  ]);
  for (const m of mods) {
    if (m.status === 'fulfilled' && m.value.install) { try { await m.value.install(g); } catch (e) { console.error('install failed', e); } }
    else if (m.status === 'rejected') console.warn('system not available:', m.reason?.message ?? m.reason);
  }
  for (const fn of SYSTEMS) await fn(g);

  // ---------------------------------------------------------------- footsteps by surface
  g.events.on('footstep', ({ who, pos, sprint }) => {
    let snd = 'step_grass';
    const onStruct = who.state.grounded && pos.y > g.sampler.heightAt(pos.x, pos.z) + 0.15;
    if (onStruct) snd = g.structures?.surfaceAt?.(pos) ?? 'step_wood';
    else {
      const wl = g.sampler.waterAt(pos.x, pos.z);
      if (wl > pos.y - 0.05 && wl > -999) snd = 'step_water';
      else {
        const m = g.sampler.matAt(pos.x, pos.z);
        snd = { [MAT.SAND]: 'step_sand', [MAT.REDSAND]: 'step_sand', [MAT.ROCK]: 'step_stone', [MAT.CLIFF]: 'step_stone', [MAT.SANDSTONE]: 'step_stone', [MAT.BASALT]: 'step_stone', [MAT.GRAVEL]: 'step_stone', [MAT.SNOW]: 'step_snow', [MAT.MUD]: 'step_mud', [MAT.DIRT]: 'step_dirt', [MAT.CLAY]: 'step_dirt', [MAT.ASH]: 'step_dirt', [MAT.NEEDLES]: 'step_dirt' }[m] ?? 'step_grass';
      }
    }
    g.audio?.play(snd, { pos, vol: (sprint ? 0.55 : 0.38) * (who.local ? 1 : 0.8), gap: 0 });
    if (snd === 'step_water') g.fx.splash(pos.x, pos.y + 0.05, pos.z, 0.3);
    else if (sprint && (snd === 'step_dirt' || snd === 'step_sand')) g.fx.dust(pos, 1, snd === 'step_sand' ? 0xe0d0a0 : 0xb8a080, 0.35);
  });

  // ---------------------------------------------------------------- tree feedback
  g.events.on('treeFelled', ({ tree }) => {
    const pos = new THREE.Vector3(tree.x, tree.y + 2, tree.z);
    g.audio?.play('creak', { pos, vol: 0.9, ref: 8 });
    if (tree.height > 6) setTimeout(() => g.audio?.play('timber', { pos: g.local.pos, vol: 0.4 }), 150);
  });
  g.flora.onTreeImpact = (tree, n) => {
    const f = g.flora.falling.find((x) => x.t === tree);
    const dir = f ? new THREE.Vector3(-f.axis.z, 0, f.axis.x) : new THREE.Vector3(1, 0, 0);
    const tip = new THREE.Vector3(tree.x, tree.y, tree.z).addScaledVector(dir, Math.min(tree.height * 0.7, 14));
    if (n === 1) {
      g.audio?.play('tree_crash', { pos: tip, vol: Math.min(1.2, 0.4 + tree.height / 20), ref: 10 });
      g.rig.addTrauma(Math.min(0.5, tree.height / 40) * Math.max(0, 1 - g.local.pos.distanceTo(tip) / 40));
      for (let k = 0; k < 5; k++) g.fx.dust(new THREE.Vector3(tree.x, tree.y, tree.z).addScaledVector(dir, (k / 5) * tree.height * 0.8), 3, 0xb8a888, 1.2);
      g.fx.leaves(tip.clone().add(new THREE.Vector3(0, 1.5, 0)), 20, tree.key === 'ginkgo' && tree.variant === 3 ? 0xd9a93a : 0x5a9a3a);
      // anything under the tree gets bonked
      const lp = g.local.pos;
      const toP = lp.clone().sub(new THREE.Vector3(tree.x, tree.y, tree.z));
      const along = toP.dot(dir);
      const side = Math.abs(toP.x * dir.z - toP.z * dir.x);
      if (along > 0 && along < tree.height && side < 1.4 && tree.height > 5) { g.vitals?.damage(25, { kind: 'tree' }); g.ui?.toast('TIMBER! Right on the head.', 'warn'); }
      g.events.emit('treeLanded', { tree, tip, dir });
    } else g.audio?.play('thud', { pos: tip, vol: 0.5 });
  };
  g.flora.onTreeSettled = (tree) => { /* stump remains (rendered by structures? stumps) */ void tree; };

  // ---------------------------------------------------------------- regrowth of trees
  g.addSystem({
    name: 'regrow', t: 0,
    update(dt) {
      this.t -= dt; if (this.t > 0) return; this.t = 5;
      if (!g.isHost) return;
      const now = g.time.elapsed;
      for (const t of g.flora.trees) if (!t.alive && t.regrowAt && now > t.regrowAt) {
        const lp = g.local.pos;
        if ((t.x - lp.x) ** 2 + (t.z - lp.z) ** 2 < 900) continue; // never pop in right next to someone
        g.flora.regrow(t); t.regrowAt = 0;
        g.net?.broadcast?.('treeRegrow', { i: t.i });
      }
    },
  });

  // ---------------------------------------------------------------- map
  g.mapCanvas = () => {
    if (g._mapCanvas) return g._mapCanvas;
    const w = g.world, M = 512, c = document.createElement('canvas'); c.width = c.height = M;
    const ctx = c.getContext('2d'); const img = ctx.createImageData(M, M);
    const cols = { 0: [38, 74, 120], 1: [222, 204, 150], 2: [58, 116, 52], 3: [120, 168, 70], 4: [70, 96, 48], 5: [86, 98, 58], 6: [176, 156, 92], 7: [138, 168, 92], 8: [196, 112, 72], 9: [128, 122, 112], 10: [236, 238, 246], 11: [74, 58, 60], 12: [90, 140, 120], 13: [160, 132, 104] };
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -w.half + (i + 0.5) * (w.size / M), z = -w.half + (j + 0.5) * (w.size / M);
      const h = g.sampler.heightAt(x, z), hx = g.sampler.heightAt(x + 4, z) - h, hz = g.sampler.heightAt(x, z + 4) - h;
      let col = cols[g.sampler.biomeAt(x, z)] ?? [255, 0, 255];
      const wl = g.sampler.waterAt(x, z);
      if (wl > h) col = wl > 0.5 ? [70, 132, 196] : [36, 70, 128];
      const shade = Math.max(0.55, Math.min(1.35, 1 - (hx * 0.6 + hz * 0.35) * 0.18)) * (1 + Math.floor(h / 20) * 0.015);
      const k = (j * M + i) * 4;
      // posterize for a pixel map look
      img.data[k] = Math.round(Math.min(255, col[0] * shade) / 16) * 16; img.data[k + 1] = Math.round(Math.min(255, col[1] * shade) / 16) * 16; img.data[k + 2] = Math.round(Math.min(255, col[2] * shade) / 16) * 16; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    // trails
    ctx.strokeStyle = 'rgba(232, 214, 160, 0.55)'; ctx.lineWidth = 1.5;
    for (const tr of w.trails) { ctx.beginPath(); tr.pts.forEach(([x, z], i) => { const u = ((x + w.half) / w.size) * M, v = ((z + w.half) / w.size) * M; i ? ctx.lineTo(u, v) : ctx.moveTo(u, v); }); ctx.stroke(); }
    g._mapCanvas = c;
    return c;
  };
  // fog of war
  g.fog = new Uint8Array(128 * 128);
  g.mapFog = () => {
    const c = g._fogCanvas || (g._fogCanvas = document.createElement('canvas'));
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0e1820'; ctx.fillRect(0, 0, 512, 512);
    ctx.globalCompositeOperation = 'destination-out';
    for (let j = 0; j < 128; j++) for (let i = 0; i < 128; i++) if (g.fog[j * 128 + i]) ctx.fillRect(i * 4 - 1, j * 4 - 1, 6, 6);
    ctx.globalCompositeOperation = 'source-over';
    return c;
  };
  g.addSystem({
    name: 'fog', t: 0,
    update(dt) {
      this.t -= dt; if (this.t > 0) return; this.t = 0.5;
      const w = g.world;
      for (const p of g.players.values()) {
        const ci = Math.floor(((p.pos.x + w.half) / w.size) * 128), cj = Math.floor(((p.pos.z + w.half) / w.size) * 128);
        const R = 4 + Math.floor(Math.max(0, p.pos.y - 30) / 25);
        for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) if (i * i + j * j <= R * R) { const a = ci + i, b = cj + j; if (a >= 0 && b >= 0 && a < 128 && b < 128) g.fog[b * 128 + a] = 1; }
      }
    },
  });
  g.pins = [];
  g.events.on('pin', (p) => { g.pins.push(p); if (g.pins.length > 6) g.pins.shift(); g.ui?.toast('Map pin placed', '', 'pin'); g.pins.forEach((pp, i) => g.ui?.setMarker('pin' + i, { icon: 'pin', x: pp.x, z: pp.z, label: 'Pin' })); });
  g.discovered = new Set(['crash']);
  g.discoveredPOIs = () => g.world.pois.filter((p) => g.discovered.has(p.id));
  g.addSystem({
    name: 'discover', t: 0,
    update(dt) {
      this.t -= dt; if (this.t > 0) return; this.t = 1;
      const lp = g.local.pos;
      for (const p of g.world.pois) {
        if (g.discovered.has(p.id) || p.secret && p.id === 'fallcave' && lp.distanceTo(new THREE.Vector3(p.x, p.y, p.z)) > 6) continue;
        const d = Math.hypot(lp.x - p.x, lp.z - p.z);
        if (d < Math.max(20, p.radius + 10)) {
          g.discovered.add(p.id);
          g.ui?.banner('DISCOVERED', p.name, g.biomeName(p.x, p.z));
          g.audio?.jingle('discover');
          g.events.emit('discover', p);
          g.ui?.setMarker('poi:' + p.id, { icon: 'poi', x: p.x, z: p.z, label: p.name });
        }
      }
    },
  });

  // ---------------------------------------------------------------- title camera
  const crash = g.crash;
  g.addSystem({
    name: 'titlecam', t: 0,
    update(dt) {
      if (!g.titleMode) return;
      this.t += dt;
      const fall = g.world.pois.find((p) => p.id === 'waterfall');
      const a = this.t * 0.035 + 2.2;
      const R = 26;
      const pos = new THREE.Vector3(crash.x + Math.cos(a) * R, 0, crash.z + Math.sin(a) * R);
      pos.y = Math.max(g.sampler.heightAt(pos.x, pos.z), g.sampler.waterAt(pos.x, pos.z)) + 4.5 + Math.sin(this.t * 0.1) * 1.2;
      const look = g.titleLook ?? new THREE.Vector3(crash.x, crash.y + 1.6, crash.z);
      if (fall && !g.titleLook) look.lerp(new THREE.Vector3(fall.x, fall.y + 12, fall.z), 0.0);
      g.rig.override = { pos, look, fov: 62 };
      g.uiOpen = true;
    },
  });
  g.previewOutfit = (o) => {
    if (!o) { g.titleLook = null; return; }
    g.local.setOutfit(o);
    g.titleLook = g.local.pos.clone().add(new THREE.Vector3(0, 0.8, 0));
  };

  // ---------------------------------------------------------------- start flow
  g.start = async (opt) => {
    g.uiOpen = false;
    if (opt.mode === 'continue' && g.loadGame) await g.loadGame();
    else if (opt.mode === 'join' && g.netJoin) await g.netJoin(opt.code);
    else {
      if (opt.host && g.netHost) await g.netHost();
      g.newGame?.();
      // starting kit: crash supplies
      if (!g.inventory.count('scanner')) {
        g.give('noodles', 2, { quiet: true });
        g.give('energybar', 2, { quiet: true });
        g.give('canteen', 1, { quiet: true });
      }
    }
    g.events.emit('started', opt);
    g.ui?.banner('66 MILLION YEARS AGO', 'Day ' + g.time.day, 'Somewhere very, very far from home');
  };

  // misc helpers used by systems
  g.anyFriendNear = () => { for (const p of g.players.values()) if (!p.local && p.pos.distanceTo(g.local.pos) < 60) return true; return false; };
  g.sendChat = (text) => { g.ui?.chat(g.local.name, text, '#f2b630'); g.net?.send?.('chat', { text }); g.local.talk = 0.9; setTimeout(() => (g.local.talk = 0), Math.min(3000, text.length * 70)); };
  void BIOME; void SPECIES;
}
