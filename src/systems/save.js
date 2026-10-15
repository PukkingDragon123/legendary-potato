// Save / load: one save per world seed in IndexedDB (localStorage fallback),
// autosave every 2 minutes and when the tab hides. Every system that wants
// to persist registers itself in game.saveables.
import * as THREE from 'three';

const DB = 'prehistoric-saves', STORE = 'saves', VERSION = 1;
const META = 'prehistoric-save-meta';

function idb() {
  return new Promise((res, rej) => {
    if (!('indexedDB' in self)) { rej(new Error('no idb')); return; }
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function put(key, val) {
  try { const db = await idb(); await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); db.close(); }
  catch { localStorage.setItem('prehistoric-save:' + key, JSON.stringify(val)); }
}
async function get(key) {
  try { const db = await idb(); const v = await new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const q = tx.objectStore(STORE).get(key); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); db.close(); if (v) return v; }
  catch { /* fall through */ }
  try { return JSON.parse(localStorage.getItem('prehistoric-save:' + key) || 'null'); } catch { return null; }
}

export class SaveSystem {
  constructor(game) {
    this.name = 'save';
    this.g = game;
    this.t = 120;
    this.playtime = 0;
    this.key = 'world:' + game.world.seed;
  }
  meta() { try { return JSON.parse(localStorage.getItem(META) || '{}')[this.key] ?? null; } catch { return null; } }
  hasSave() { return !!this.meta(); }
  snapshot() {
    const g = this.g, p = g.local;
    const data = {
      v: VERSION, seed: g.world.seed, at: Date.now(), playtime: Math.round(this.playtime),
      time: { elapsed: g.time.elapsed, start: g.time.startTod },
      weather: { kind: g.weather.kind, timer: g.weather.timer },
      player: { x: p.pos.x, y: p.pos.y, z: p.pos.z, yaw: p.yaw, outfit: p.outfit, name: p.name },
      vitals: g.vitals?.serialize(), inventory: g.inventory.serialize(), crafted: g.crafting?.serialize(),
      trees: g.flora.trees.filter((t) => !t.alive).map((t) => [t.i, Math.round(t.regrowAt ?? 0)]),
      nodes: g.nodes.serialize(), drops: g.drops?.serialize(),
      discovered: [...(g.discovered ?? [])], fog: Array.from(g.fog ?? []).join(''), pins: g.pins ?? [], respawn: g.respawn ?? null,
      sys: {},
    };
    for (const [k, s] of Object.entries(g.saveables ?? {})) { try { data.sys[k] = s.save(); } catch (e) { console.warn('save failed for', k, e); } }
    return data;
  }
  async save(quiet = false) {
    const g = this.g;
    if (g.net && !g.isHost) return false; // clients don't own the world
    if (g.titleMode || this.saving) return false;
    this.saving = true;
    try {
      const data = this.snapshot();
      await put(this.key, data);
      const all = (() => { try { return JSON.parse(localStorage.getItem(META) || '{}'); } catch { return {}; } })();
      all[this.key] = { day: g.time.day, at: data.at, playtime: data.playtime, chapter: g.journal?.chapter ?? 0 };
      localStorage.setItem(META, JSON.stringify(all));
      if (!quiet) g.ui?.toast('Game saved.', '', 'star', 1800);
      g.events.emit('saved');
      return true;
    } catch (e) { console.error('save failed', e); g.ui?.toast('Could not save!', 'warn'); return false; }
    finally { this.saving = false; }
  }
  async load() {
    const g = this.g;
    const d = await get(this.key);
    if (!d) return false;
    this.playtime = d.playtime ?? 0;
    g.time.elapsed = d.time.elapsed; g.time.startTod = d.time.start;
    if (d.weather) { g.weather.kind = d.weather.kind; g.weather.timer = d.weather.timer; }
    const P = d.player;
    if (P) { g.local.teleport(P.x, P.y + 0.05, P.z); g.local.yaw = P.yaw; g.rig.yaw = P.yaw; }
    g.vitals?.load(d.vitals);
    // an old 32-slot backpack pours into the explorer's pockets; the rest waits in the van rack
    let spill = null;
    g.inventory.load(d.inventory, (arr) => { spill = arr; });
    g.crafting?.load(d.crafted);
    for (const [i, regrowAt] of d.trees ?? []) { const t = g.flora.trees[i]; if (t && t.alive) { t.alive = false; t.regrowAt = regrowAt; g.flora.detach(t); } }
    g.nodes.load(d.nodes);
    g.drops?.load(d.drops);
    g.discovered = new Set(d.discovered ?? ['crash']);
    for (const id of g.discovered) { const p = g.world.pois.find((x) => x.id === id); if (p) g.ui?.setMarker('poi:' + p.id, { icon: 'poi', x: p.x, z: p.z, label: p.name }); }
    if (d.fog && g.fog) for (let i = 0; i < d.fog.length && i < g.fog.length; i++) g.fog[i] = d.fog.charCodeAt(i) === 49 ? 1 : 0;
    g.pins = d.pins ?? [];
    g.respawn = d.respawn;
    // systems in dependency order
    const order = ['research', 'structures', 'building', 'van', 'dinos', 'journal', 'computer'];
    const keys = [...new Set([...order, ...Object.keys(d.sys ?? {})])];
    for (const k of keys) { const s = g.saveables?.[k]; if (s && d.sys?.[k] !== undefined) { try { s.load(d.sys[k]); } catch (e) { console.warn('load failed for', k, e); } } }
    if (spill && g.van?.storage) {
      let lost = 0;
      for (const s of spill) { const { id, n, ...extra } = s; lost += g.van.storage.add(id, n, Object.keys(extra).length ? extra : null, true); }
      g.van.storage.changed();
      setTimeout(() => g.ui?.toast(lost ? 'Your old backpack went into the van rack (some did not fit)' : 'Your old backpack went into the van rack', 'info'), 1500);
    }
    g.events.emit('loaded', d);
    return true;
  }
  update(dt) {
    const g = this.g;
    if (g.titleMode) return;
    this.playtime += dt;
    this.t -= dt;
    if (this.t <= 0) { this.t = 120; this.save(true); }
  }
}

export async function install(g) {
  const S = new SaveSystem(g);
  g.addSystem(S);
  g.saveSystem = S;
  g.save = () => S.save();
  g.loadGame = async () => { const ok = await S.load(); if (!ok) { g.ui?.toast('No save found, starting fresh.', 'warn'); g.newGame?.(); } };
  g.hasSave = () => S.hasSave();
  g.saveMeta = () => S.meta();
  const quick = () => { if (!g.titleMode) S.save(true); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') quick(); });
  window.addEventListener('beforeunload', quick);
  // respawn after bleeding out: wake at the bed / van
  g.events.on('bleedout', (p) => {
    if (p !== g.local) return;
    const r = g.respawn ?? (() => { const v = g.van?.pos ?? new THREE.Vector3(g.crash.x, 0, g.crash.z); return { x: v.x - 3, y: g.sampler.heightAt(v.x - 3, v.z + 3), z: v.z + 3 }; })();
    p.downed = false; p.downedT = 0;
    if (g.vitals) { g.vitals.hp = 40; g.vitals.hunger = Math.max(30, g.vitals.hunger); g.vitals.thirst = Math.max(30, g.vitals.thirst); }
    // drop a "backpack" of half your stuff where you fell
    const half = [];
    for (let i = 0; i < g.inventory.size; i++) { const s = g.inventory.slots[i]; if (s && i !== g.inventory.toolSlot && Math.random() < 0.5) { half.push(s); g.inventory.slots[i] = null; } }
    g.inventory.changed();
    for (const s of half) g.drops?.spawn(s.id, s.n, p.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), null, { dur: s.dur });
    p.teleport(r.x, r.y + 0.3, r.z);
    g.ui?.banner('YOU WOKE UP', 'Back at camp', half.length ? 'Some of your stuff is still where you fell' : 'That was close');
  });
  return S;
}
