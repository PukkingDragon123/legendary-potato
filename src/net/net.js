// Co-op networking over the game server's WebSocket relay. The host runs the
// world simulation; clients send their player state and "act" requests and
// receive world updates. Joiners get a full world snapshot. Clients pre-pay
// item costs before asking the host to do something (so nobody duplicates
// items), and the host sends "give" back for anything they earn.
import * as THREE from 'three';
import { Player } from '../entities/player.js';
import { ITEMS } from '../data/items.js';
import { COSTS } from '../systems/building.js';
import { REPAIRS, upgradeById } from '../entities/vanUpgrades.js';
import { Voice } from './voice.js';

const RATE = 1 / 15;

export class Net {
  constructor(game) {
    this.name = 'net';
    this.g = game;
    this.ws = null; this.connected = false; this.isHost = true; this.id = null; this.roomCode = null;
    this.t = 0; this.hostId = null;
    this.handlers = {};
    this.pending = new Map();
    this.ping = 0;
  }
  url() {
    const qs = new URLSearchParams(location.search);
    const s = qs.get('server');
    if (s) return s.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws';
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }
  async probe() {
    try {
      const qs = new URLSearchParams(location.search);
      const base = qs.get('server') ?? '';
      const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 1200);
      const r = await fetch(base.replace(/\/$/, '') + '/api/ping', { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(tm);
      return r.ok && (await r.json()).ok;
    } catch { return false; }
  }
  open() {
    return new Promise((res, rej) => {
      const ws = new WebSocket(this.url());
      this.ws = ws;
      ws.onopen = () => { this.connected = true; res(); };
      ws.onerror = () => rej(new Error('Could not reach the game server'));
      ws.onclose = () => this.onClose();
      ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.onMessage(m); };
    });
  }
  raw(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  wait(type, timeout = 8000) { return new Promise((res, rej) => { const tm = setTimeout(() => { this.pending.delete(type); rej(new Error('Timed out waiting for ' + type)); }, timeout); this.pending.set(type, (d) => { clearTimeout(tm); res(d); }); }); }

  // ---------------------------------------------------------------- host / join
  async host() {
    const g = this.g;
    await this.open();
    this.raw({ t: 'host', d: { name: g.local.name } });
    const d = await this.wait('hosted');
    this.isHost = true; g.isHost = true;
    this.roomCode = d.code; this.setLocalId(d.id); this.hostId = d.id;
    g.ui?.banner('CO-OP ROOM OPEN', d.code, 'Friends join from the title screen with this code');
    g.ui?.toast(`Room code: ${d.code}`, '', 'friend', 10000);
    this.voice = new Voice(g, this);
    return d.code;
  }
  async join(code) {
    const g = this.g;
    await this.open();
    this.raw({ t: 'join', d: { code, name: g.local.name, outfit: g.local.outfit } });
    const d = await this.wait('joined').catch((e) => { throw e; });
    this.isHost = false; g.isHost = false;
    this.roomCode = d.code; this.setLocalId(d.id); this.hostId = d.host;
    g.ui?.toast('Joined room ' + d.code + '. Downloading the world...', '', 'friend');
    const snap = await this.wait('welcome', 20000);
    this.applyWelcome(snap);
    this.voice = new Voice(g, this);
    return true;
  }
  setLocalId(id) {
    const g = this.g;
    g.players.delete(g.local.id);
    g.local.id = id;
    g.players.set(id, g.local);
  }
  onClose() {
    const g = this.g;
    if (!this.connected) return;
    this.connected = false;
    if (!this.isHost) { g.ui?.banner('DISCONNECTED', 'Lost the connection to the host', 'Your progress lives in the host\'s world'); }
    for (const p of [...g.players.values()]) if (!p.local) this.removePlayer(p.id);
    this.voice?.close();
  }

  // ---------------------------------------------------------------- messaging API used by the systems
  send(type, d) { if (!this.connected) return; if (this.isHost) { this.dispatch(type, d, this.id); return; } this.raw({ t: type, d }); }
  broadcast(type, d, except) { if (!this.connected || !this.isHost) return; this.raw({ t: type, d, except }); }
  sendTo(id, type, d) { if (!this.connected) return; if (id === this.id || id === this.g.local.id) { this.dispatch(type, d, this.id); return; } this.raw({ t: type, d, to: id }); }

  onMessage(m) {
    const { t, d, from } = m;
    const w = this.pending.get(t);
    if (w) { this.pending.delete(t); w(d); return; }
    this.dispatch(t, d, from);
  }
  dispatch(t, d, from) {
    const g = this.g;
    switch (t) {
      case 'joinError': { const w = this.pending.get('joined'); if (w) { this.pending.delete('joined'); w(Promise.reject(new Error(d.reason))); } return; }
      case 'peerJoin': if (this.isHost) this.onPeerJoin(from, d); return;
      case 'peerLeave': this.removePlayer(from); if (this.isHost) this.broadcast('playerGone', { id: from }); return;
      case 'playerGone': this.removePlayer(d.id); return;
      case 'hostLeft': g.ui?.banner('HOST LEFT', 'The expedition is over', 'Start your own from the title screen'); this.onClose(); return;
      case 'ps': this.onPlayerState(from, d); if (this.isHost) this.broadcast('ps', { ...d, id: from }, from); return;
      case 'act': if (this.isHost) { const fn = g.interaction.actions[d.type] ?? g.actionHandlers?.[d.type]; if (fn) fn({ ...d.data, by: from }); } return;
      case 'give': for (const [id, n] of d.items ?? []) g.give(id, n, { from: d.from, ...(d.dur !== undefined ? {} : {}) }); return;
      case 'hurt': g.vitals?.damage(d.dmg, { kind: d.kind }); return;
      case 'chat': { const p = g.players.get(d.id ?? from); g.ui?.chat(p?.name ?? 'Friend', d.text, '#9ad0ff'); if (p) { p.talk = 0.9; setTimeout(() => (p.talk = 0), Math.min(3000, d.text.length * 70)); } if (this.isHost) this.broadcast('chat', { ...d, id: from }, from); return; }
      case 'emote': { const p = g.players.get(d.id ?? from); if (p) { p.emote = d.e; setTimeout(() => { if (p.emote === d.e) p.emote = null; }, 2500); } if (this.isHost) this.broadcast('emote', { ...d, id: from }, from); return; }
      case 'treeFell': { const tr = g.flora.trees[d.i]; if (tr?.alive) { g.flora.fell(tr, d.dirX, d.dirZ); g.events.emit('treeFelled', { tree: tr, by: from }); } return; }
      case 'treeHp': { const tr = g.flora.trees[d.i]; if (tr) tr.hp = d.hp; return; }
      case 'treeRegrow': { const tr = g.flora.trees[d.i]; if (tr && !tr.alive) g.flora.regrow(tr); return; }
      case 'nodeState': g.nodes.applyState(d.id, d.until ?? 0, 0); return;
      case 'dropSpawn': if (this.isHost && from !== this.id) g.drops?.spawn(d.id, d.n, new THREE.Vector3(d.x, d.y, d.z), new THREE.Vector3(d.vx, d.vy, d.vz), { dur: d.dur }); else if (!this.isHost) g.drops?.spawn(d.id, d.n, new THREE.Vector3(d.x, d.y, d.z), new THREE.Vector3(d.vx, d.vy, d.vz), { dur: d.dur, nid: d.nid, fromNet: true }); return;
      case 'dropGone': g.drops?.remove(d.nid); return;
      case 'dropPick': if (this.isHost) { const dr = g.drops?.list.get(d.nid); if (dr) g.drops.give(dr, from); } return;
      case 'rtc': this.voice?.onSignal(from, d); return;
      case 'pinfo': { const p = g.players.get(d.id ?? from); if (p && d.outfit) { p.name = d.name; p.setOutfit(d.outfit); } if (this.isHost) this.broadcast('pinfo', { ...d, id: from }, from); return; }
      case 'time': if (!this.isHost) { if (Math.abs(g.time.elapsed - d.e) > 2) g.time.elapsed = d.e; g.weather.kind = d.w ?? g.weather.kind; } return;
      default: { const h = g.netHandlers?.[t]; if (h) h(d, from); }
    }
  }

  // ---------------------------------------------------------------- players
  ensurePlayer(id, info = {}) {
    const g = this.g;
    let p = g.players.get(id);
    if (!p) {
      p = new Player(g, { id, name: info.name ?? 'Friend', outfit: info.outfit, local: false });
      g.players.set(id, p);
      g.ui?.toast(`${p.name} joined the expedition!`, '', 'friend');
      g.audio?.jingle?.('discover');
    }
    return p;
  }
  removePlayer(id) {
    const g = this.g, p = g.players.get(id);
    if (!p || p.local) return;
    g.ui?.toast(`${p.name} left.`, '', 'friend');
    p.dispose(); g.players.delete(id);
    this.voice?.drop(id);
  }
  onPlayerState(id, s) {
    if (s.id) id = s.id;
    if (id === this.g.local.id) return;
    const p = this.ensurePlayer(id, s);
    p.pushNet(s, performance.now() / 1000);
    if (s.name && p.name !== s.name) p.name = s.name;
    p.walkie = !!s.wk;
  }
  onPeerJoin(id, info) {
    const g = this.g;
    const p = this.ensurePlayer(id, info);
    // spawn them next to the host
    void p;
    this.sendTo(id, 'welcome', this.snapshot());
    // tell everyone else about each other
    this.broadcast('pinfo', { id, name: info.name, outfit: info.outfit }, id);
    for (const q of g.players.values()) if (q.id !== id) this.sendTo(id, 'pinfo', { id: q.id, name: q.name, outfit: q.outfit });
  }
  snapshot() {
    const g = this.g;
    const sys = {};
    for (const k of ['van', 'structures', 'building', 'research']) { try { sys[k] = g.saveables[k]?.save(); } catch (e) { console.warn(e); } }
    return {
      time: { e: g.time.elapsed, s: g.time.startTod }, weather: g.weather.kind,
      trees: g.flora.trees.filter((t) => !t.alive).map((t) => t.i),
      nodes: g.nodes.serialize(),
      drops: [...(g.drops?.list.values() ?? [])].map((d) => ({ nid: d.nid, id: d.id, n: d.n, x: d.pos.x, y: d.pos.y, z: d.pos.z })),
      spawn: { x: g.local.pos.x + 2, y: g.local.pos.y + 0.5, z: g.local.pos.z + 2 },
      discovered: [...(g.discovered ?? [])], sys,
    };
  }
  applyWelcome(s) {
    const g = this.g;
    g.time.elapsed = s.time.e; g.time.startTod = s.time.s; g.weather.kind = s.weather;
    for (const i of s.trees ?? []) { const t = g.flora.trees[i]; if (t?.alive) { t.alive = false; g.flora.detach(t); } }
    g.nodes.load(s.nodes);
    for (const d of s.drops ?? []) g.drops?.spawn(d.id, d.n, new THREE.Vector3(d.x, d.y, d.z), new THREE.Vector3(), { nid: d.nid, fromNet: true });
    for (const k of ['research', 'structures', 'building', 'van']) { const sv = g.saveables[k]; if (sv && s.sys?.[k] !== undefined) { try { sv.load(s.sys[k]); } catch (e) { console.warn('welcome load', k, e); } } }
    g.discovered = new Set(s.discovered ?? ['crash']);
    if (s.spawn) g.local.teleport(s.spawn.x, s.spawn.y, s.spawn.z);
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g;
    if (!this.connected) return;
    this.t -= dt;
    if (this.t <= 0) {
      this.t = RATE;
      const st = g.local.netState();
      st.name = g.local.name;
      st.wk = g.inventory.heldDef()?.tool?.kind === 'walkie' ? 1 : 0;
      if (this.isHost) this.broadcast('ps', { ...st, id: this.id });
      else this.raw({ t: 'ps', d: st });
      this.timeT = (this.timeT ?? 0) - RATE;
      if (this.isHost && this.timeT <= 0) { this.timeT = 5; this.broadcast('time', { e: g.time.elapsed, w: g.weather.kind }); }
    }
    this.voice?.update(dt);
  }
}

// ---------------------------------------------------------------- client pre-payment
// Clients remove the items an action costs before asking the host, because
// the host only takes items from its own inventory.
function prepay(g, type, data) {
  const inv = g.inventory;
  const take = (req) => (inv.take(req) ? true : (g.ui?.toast('Missing materials!', 'warn'), false));
  switch (type) {
    case 'st_place': return inv.remove(data.item ?? data.type, 1);
    case 'st_plant': return inv.remove(data.seed, 1);
    case 'st_egg': return inv.remove(data.egg, 1);
    case 'b_place': return take(COSTS[data.kind][data.mat]);
    case 'van_repair': { const R = REPAIRS[data.id]; return take(R.cost ?? { [R.item]: 1 }); }
    case 'van_socket': return inv.remove(data.id, 1);
    case 'van_refuel': return inv.remove('biofuel', 1);
    case 'van_upgrade': return take(upgradeById[data.id].cost);
    case 'van_coffee': return inv.remove('water_clean', 1);
    case 'dino_saddle': return inv.remove(data.item, 1);
    default: return true;
  }
}

export async function install(g) {
  const N = new Net(g);
  g.addSystem(N);
  g.serverAvailable = await N.probe();
  g.netHost = async () => { try { await N.host(); g.net = N; } catch (e) { g.ui?.toast('Could not open a co-op room: ' + e.message, 'warn'); } };
  g.netJoin = async (code) => { try { g.net = N; await N.join(code); } catch (e) { g.net = null; g.isHost = true; g.ui?.toast('Could not join: ' + e.message, 'warn'); g.newGame?.(); } };
  g.onInvite = () => { if (N.roomCode) { navigator.clipboard?.writeText?.(N.roomCode); g.ui?.toast(`Room code ${N.roomCode} copied. Friends: Join Expedition on the title screen.`, '', 'friend', 6000); } else g.netHost(); };
  // clients pay for actions locally before the request goes out
  const act = g.interaction.act.bind(g.interaction);
  g.act = (type, data) => {
    if (g.net?.connected && !g.isHost) { if (!prepay(g, type, data)) return; }
    return act(type, data);
  };
  void ITEMS;
  return N;
}
