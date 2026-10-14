// HUD + the CHRONO-PAL 2000 handheld (backpack, crafting, dinos, map, log),
// toasts, banners, loot popups, name tags, chat and pause menu.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { RECIPES, STATIONS } from '../data/recipes.js';
import { iconCanvas, iconURL } from './pixelIcons.js';
import { EFFECTS } from '../systems/vitals.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.name = 'ui';
    this.game = game;
    this.root = document.getElementById('ui') || document.body.appendChild(Object.assign(h('div'), { id: 'ui' }));
    this.root.innerHTML = '';
    this.icons = game.icons || {};
    this.buildHUD();
    this.pda = null;
    this.container = null;
    this.drag = null;
    this.consumesClick = false;
    game.ui = this;
    game.inventory.onChange(() => { this.renderHotbar(); if (this.pda && this.pdaTab === 'bag') this.renderBag(); if (this.pda && this.pdaTab === 'craft') this.renderCraft(); if (this.container) this.renderContainer(); });
    this.renderHotbar();
    game.events.on('loot', ({ id, n }) => { if (n > 0) this.loot(id, n); });
    game.events.on('effect', (name) => { const e = EFFECTS[name]; if (e && !['wet', 'cold', 'hot', 'warm', 'sleepy'].includes(name)) this.toast(e.name + '!', name === 'wellfed' || name === 'caffeinated' ? '' : 'warn'); });
    window.addEventListener('mousemove', (e) => this.onMouseMove(e));
    window.addEventListener('mouseup', (e) => this.onMouseUp(e));
    this.lastBiome = null;
    this.nametags = new Map();
  }

  icon(id) { return this.icons[id] ?? ''; }

  // ---------------------------------------------------------------- HUD
  buildHUD() {
    const R = this.root;
    this.hud = h('div', 'hud'); R.appendChild(this.hud);
    const H = this.hud;
    this.el = {};
    this.el.cross = h('div'); this.el.cross.id = 'crosshair'; H.appendChild(this.el.cross);
    this.el.prompt = h('div'); this.el.prompt.id = 'prompt'; H.appendChild(this.el.prompt);
    this.el.target = h('div', 'px-dark hidden'); this.el.target.id = 'target'; H.appendChild(this.el.target);
    this.el.hotbar = h('div', 'px'); this.el.hotbar.id = 'hotbar'; H.appendChild(this.el.hotbar);
    this.el.held = h('div', 'shadow-text'); this.el.held.id = 'heldname'; H.appendChild(this.el.held);
    // vitals
    const v = h('div', 'px-dark'); v.id = 'vitals'; H.appendChild(v);
    this.bars = {};
    for (const [k, icon, col] of [['hp', 'heart', '#e04a3a'], ['hunger', 'food', '#e8a040'], ['thirst', 'water', '#5ab0e0'], ['stamina', 'bolt', '#f2d040'], ['energy', 'zzz', '#9a90e0']]) {
      const c = iconCanvas(icon, 2); c.style.width = '20px'; c.style.height = '20px';
      const b = h('div', 'bar seg'); const fill = h('i'); fill.style.background = col; b.appendChild(fill);
      v.appendChild(c); v.appendChild(b);
      this.bars[k] = { b, fill };
    }
    this.el.temp = h('div', 'small shadow-text'); this.el.temp.style.cssText = 'grid-column: 1 / span 2; font-size: 12px; color: var(--lcd-dim); font-family: var(--font-small);';
    v.appendChild(this.el.temp);
    this.el.effects = h('div'); this.el.effects.id = 'effects'; H.appendChild(this.el.effects);
    // compass
    const cp = h('div'); cp.id = 'compass'; H.appendChild(cp);
    this.el.compassStrip = h('div', 'strip'); cp.appendChild(this.el.compassStrip);
    cp.appendChild(h('div', 'center'));
    this.el.clock = h('div', 'shadow-text'); this.el.clock.id = 'clock'; H.appendChild(this.el.clock);
    this.el.biome = h('div', 'shadow-text'); this.el.biome.id = 'biome'; H.appendChild(this.el.biome);
    // objective note
    this.el.obj = h('div'); this.el.obj.id = 'objective'; H.appendChild(this.el.obj);
    this.el.toasts = h('div'); this.el.toasts.id = 'toasts'; H.appendChild(this.el.toasts);
    this.el.banner = h('div'); this.el.banner.id = 'banner'; H.appendChild(this.el.banner);
    this.el.chat = h('div'); this.el.chat.id = 'chat'; H.appendChild(this.el.chat);
    this.el.voice = h('div'); this.el.voice.id = 'voice'; H.appendChild(this.el.voice);
    this.el.tame = h('div', 'px-dark hidden'); this.el.tame.id = 'tamepanel'; H.appendChild(this.el.tame);
    this.el.loot = h('div'); this.el.loot.style.cssText = 'position:absolute;left:calc(50% + 40px);top:calc(50% - 10px);'; H.appendChild(this.el.loot);
    this.el.tags = h('div'); H.appendChild(this.el.tags);
    this.buildCompass();
  }

  buildCompass() {
    const s = this.el.compassStrip;
    this.compassMarks = [];
    for (let deg = 0; deg < 360; deg += 15) {
      const t = h('div', 'tick' + (deg % 45 === 0 ? ' big' : ''));
      s.appendChild(t);
      this.compassMarks.push({ el: t, deg });
      if (deg % 45 === 0) {
        const l = h('div', 'lbl shadow-text', ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][deg / 45]);
        if (deg % 90 !== 0) l.style.fontSize = '11px';
        if (deg === 0) l.style.color = 'var(--nose)';
        s.appendChild(l);
        this.compassMarks.push({ el: l, deg });
      }
    }
    this.markers = new Map();
  }
  // markers: id -> { icon, x, z, label }
  setMarker(id, m) {
    let e = this.markers.get(id);
    if (!m) { if (e) { e.el.remove(); this.markers.delete(id); } return; }
    if (!e) {
      const el = iconCanvas(m.icon, 1); el.classList.add('mk'); el.style.width = '12px'; el.style.height = '12px';
      this.el.compassStrip.appendChild(el);
      e = { el };
      this.markers.set(id, e);
    }
    Object.assign(e, m);
  }

  updateCompass() {
    const yaw = this.game.rig.yaw; // 0 = facing -z (north)
    const heading = ((-yaw * 180) / Math.PI + 360 * 4) % 360;
    const W = 440, span = 160; // degrees visible
    const place = (el, deg) => {
      let d = deg - heading; d = ((d + 540) % 360) - 180;
      if (Math.abs(d) > span / 2 + 10) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.left = W / 2 + (d / span) * W + 'px';
    };
    for (const m of this.compassMarks) place(m.el, m.deg);
    const p = this.game.local.pos;
    for (const m of this.markers.values()) {
      const dx = m.x - p.x, dz = m.z - p.z;
      const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      place(m.el, deg);
      const dist = Math.hypot(dx, dz);
      m.el.style.opacity = dist < 4 ? 0.3 : 1;
      m.el.title = m.label ?? '';
    }
  }

  setPrompt(p) {
    const key = p ? JSON.stringify(p) : '';
    if (key === this._lastPrompt) return;
    this._lastPrompt = key;
    this.el.cross.classList.toggle('active', !!p);
    if (!p) { this.el.prompt.innerHTML = ''; return; }
    const row = (q) => `<div class="row shadow-text"><span class="key">${esc(q.key)}</span>${esc(q.text)}${q.progress !== null && q.progress !== undefined ? `<span class="hold"><i style="width:${Math.min(100, q.progress * 100).toFixed(1)}%"></i></span>` : ''}</div>`;
    this.el.prompt.innerHTML = (p.alt ? row(p.alt) : '') + row(p) + (p.warn ? `<div class="warn shadow-text">${esc(p.warn)}</div>` : '');
  }
  setTarget(t) {
    const el = this.el.target;
    if (!t || (!t.hp && !t.info)) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const key = (t.label ?? '') + (t.hp ?? '') + (t.info ?? '') + (t.torpor ?? '') + (t.tame ?? '');
    if (key === this._lastTarget) return;
    this._lastTarget = key;
    let html = `<div class="name">${esc(t.label)}</div>`;
    if (t.info) html += `<div class="sub">${esc(t.info)}</div>`;
    if (t.hp !== null && t.hp !== undefined) html += `<div class="bar seg"><i style="width:${Math.max(0, t.hp * 100)}%;background:${t.hpColor ?? '#7bc86c'}"></i></div>`;
    if (t.torpor !== undefined) html += `<div class="bar seg"><i style="width:${t.torpor * 100}%;background:#b07ad8"></i><div class="label">TORPOR</div></div>`;
    if (t.tame !== undefined) html += `<div class="bar seg"><i style="width:${t.tame * 100}%;background:#f2b630"></i><div class="label">TAMING</div></div>`;
    el.innerHTML = html;
  }

  toast(text, kind = '', icon = null, dur = 3200) {
    const t = h('div', 'toast px-dark ' + kind);
    if (icon) { const img = h('img'); img.src = icon.startsWith('data:') ? icon : this.icon(icon) || iconURL(icon); t.appendChild(img); }
    t.appendChild(h('span', '', esc(text)));
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 6) this.el.toasts.firstChild.remove();
    setTimeout(() => t.classList.add('out'), dur);
    setTimeout(() => t.remove(), dur + 450);
  }
  loot(id, n) {
    const now = performance.now();
    // merge rapid repeats
    const last = this._lastLoot;
    if (last && last.id === id && now - last.at < 900 && last.el.isConnected) { last.n += n; last.span.textContent = `+${last.n} ${ITEMS[id]?.name ?? id}`; last.at = now; return; }
    const el = h('div', 'loot shadow-text');
    const img = h('img'); img.src = this.icon(id); el.appendChild(img);
    const span = h('span', '', `+${n} ${esc(ITEMS[id]?.name ?? id)}`); el.appendChild(span);
    el.style.top = this.el.loot.children.length * 26 + 'px';
    this.el.loot.appendChild(el);
    this._lastLoot = { id, n, el, span, at: now };
    setTimeout(() => el.remove(), 1350);
    this.game.audio?.play('loot', { vol: 0.35 });
  }
  banner(b1, b2, b3 = '') {
    const b = this.el.banner;
    b.className = '';
    b.innerHTML = `<div class="b1 shadow-text">${esc(b1)}</div><div class="b2 shadow-text">${esc(b2)}</div>${b3 ? `<div class="b3 shadow-text">${esc(b3)}</div>` : ''}`;
    void b.offsetWidth;
    b.className = 'show';
  }
  // scanner result card (slides in at the right)
  scanCard(d, first) {
    const cats = { bio: ['BIO', '#7bc86c'], geo: ['GEO', '#c8a070'], zoo: ['ZOO', '#f2b630'], paleo: ['PALEO', '#b090e0'] };
    const c = cats[d.cat];
    const el = h('div', 'scancard px-dark');
    el.innerHTML = `<div class="sc-top"><span class="sc-tag" style="background:${c ? c[1] : '#8a8a8a'}">${c ? c[0] : 'SCAN'}</span><span class="sc-new">${first ? 'NEW!' : 'SCANNED'}</span></div><div class="sc-title">${esc(d.title)}</div><div class="sc-fact">${esc(d.fact)}</div>${first && d.rp && c ? `<div class="sc-rp">+${d.rp} ${c[0]} DATA</div>` : ''}`;
    this.root.appendChild(el);
    (this._cards = this._cards || []).push(el);
    while (this._cards.length > 2) this._cards.shift().remove();
    this._cards.forEach((x, i) => { x.style.top = 150 + i * 0 + 'px'; });
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => el.classList.remove('in'), 6500);
    setTimeout(() => { el.remove(); this._cards = this._cards.filter((x) => x !== el); }, 7000);
  }
  setObjective(o) {
    const el = this.el.obj;
    if (!o) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    el.innerHTML = `<div class="ch">${esc(o.chapter ?? '')}</div><div class="title">${esc(o.title)}</div><ul>${(o.items ?? []).map((it) => `<li class="${it.done ? 'done' : ''}"><span class="cb"></span><span>${esc(it.text)}${it.count ? ` (${it.count})` : ''}</span></li>`).join('')}</ul>`;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
  chat(from, text, color) {
    const m = h('div', 'msg shadow-text', `<b style="${color ? 'color:' + color : ''}">${esc(from)}:</b> ${esc(text)}`);
    this.el.chat.appendChild(m);
    while (this.el.chat.querySelectorAll('.msg').length > 8) this.el.chat.querySelector('.msg').remove();
    setTimeout(() => m.remove(), 9500);
  }
  openChatInput(onSend) {
    if (this.chatInput) return;
    const inp = h('input');
    inp.maxLength = 140;
    inp.placeholder = 'Say something... (Enter to send, Esc to cancel)';
    this.el.chat.appendChild(inp);
    this.chatInput = inp;
    this.game.input.enabled = false;
    setTimeout(() => inp.focus(), 0);
    inp.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = inp.value.trim(); if (v) onSend(v); this.closeChat(); }
      if (e.key === 'Escape') this.closeChat();
    });
  }
  closeChat() { if (!this.chatInput) return; this.chatInput.remove(); this.chatInput = null; this.game.input.enabled = true; this.game.input.keys.clear(); }

  renderHotbar() {
    const inv = this.game.inventory;
    const hb = this.el.hotbar;
    if (!this._slots) {
      hb.innerHTML = '';
      this._slots = [];
      for (let i = 0; i < 8; i++) { const s = h('div', 'slot'); hb.appendChild(s); this._slots.push(s); }
    }
    for (let i = 0; i < 8; i++) this.fillSlot(this._slots[i], inv.slots[i], i + 1, i === inv.selected);
    const held = inv.held();
    const name = held ? ITEMS[held.id]?.name ?? '' : '';
    if (name !== this._heldName) {
      this._heldName = name;
      this.el.held.textContent = name;
      this.el.held.style.opacity = 1;
      clearTimeout(this._heldT);
      this._heldT = setTimeout(() => (this.el.held.style.opacity = 0), 1600);
    }
  }
  fillSlot(el, s, keyN, sel) {
    const key = s ? s.id + ':' + s.n + ':' + (s.dur ?? '') + ':' + Math.round(s.ch ?? -1) + ':' + sel : 'empty:' + sel;
    if (el._k === key) return;
    el._k = key;
    el.className = 'slot' + (sel ? ' sel' : '');
    el.innerHTML = '';
    if (keyN) el.appendChild(h('span', 'k', keyN));
    if (!s) return;
    const img = h('img'); img.src = this.icon(s.id); img.draggable = false; el.appendChild(img);
    if (s.n > 1) el.appendChild(h('span', 'n', s.n));
    const d = ITEMS[s.id];
    if (s.dur !== undefined && d?.durability && d.durability < 9999) {
      const bar = h('div', 'dur'); const f = h('i'); const k = s.dur / d.durability;
      f.style.width = k * 100 + '%'; f.style.background = k < 0.25 ? '#e05040' : k < 0.5 ? '#f2b630' : '#7bc86c';
      bar.appendChild(f); el.appendChild(bar);
    }
    if (s.ch !== undefined && d?.charge) {
      const bar = h('div', 'dur charge'); const f = h('i'); const k = s.ch / d.charge;
      f.style.width = k * 100 + '%'; f.style.background = k < 0.2 ? '#e05040' : '#5ab0e0';
      bar.appendChild(f); el.appendChild(bar);
    }
  }

  update(dt) {
    const g = this.game;
    const v = g.vitals;
    if (v) {
      for (const k of ['hp', 'hunger', 'thirst', 'stamina', 'energy']) {
        const frac = v[k] / v.max[k];
        const B = this.bars[k];
        B.fill.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
        B.b.classList.toggle('low', frac < 0.2);
      }
      const tt = v.temp;
      const tlabel = tt < 0.22 ? 'FREEZING' : tt < 0.34 ? 'CHILLY' : tt > 0.82 ? 'SCORCHING' : tt > 0.68 ? 'WARM' : 'COMFY';
      const wet = v.wetness > 0.35 ? ' · SOAKED' : '';
      const txt = `${tlabel}${wet}`;
      if (txt !== this._tempTxt) { this._tempTxt = txt; this.el.temp.textContent = txt; this.el.temp.style.color = tt < 0.22 ? '#a0d0ff' : tt > 0.82 ? '#ff9a60' : 'var(--lcd-dim)'; }
      // effects row
      const fxKey = [...v.effects.keys()].filter((k) => !['warm'].includes(k)).join(',');
      if (fxKey !== this._fxKey) {
        this._fxKey = fxKey;
        this.el.effects.innerHTML = '';
        for (const k of v.effects.keys()) {
          const e = EFFECTS[k]; if (!e || k === 'warm') continue;
          const d = h('div', 'effect px-dark', `<span style="color:${e.color}">■</span>${esc(e.name)}`);
          d.title = e.desc;
          this.el.effects.appendChild(d);
        }
      }
    }
    this.updateCompass();
    const ck = `DAY ${g.time.day} · ${g.time.clock()}`;
    if (ck !== this._clock) { this._clock = ck; this.el.clock.textContent = ck; }
    // biome toast when entering a new region
    const bn = g.biomeName(g.local.pos.x, g.local.pos.z);
    if (bn !== this.lastBiome) {
      this._biomeT = (this._biomeT ?? 0) + dt;
      if (this._biomeT > 2.5 || this.lastBiome === null) { this.lastBiome = bn; this._biomeT = 0; this.el.biome.textContent = bn; this.el.biome.style.opacity = 1; clearTimeout(this._bt); this._bt = setTimeout(() => (this.el.biome.style.opacity = 0), 3200); }
    } else this._biomeT = 0;
    this.updateNametags();
    if (this.pda && this.pdaTab === 'craft' && g.crafting?.job) this.renderCraftProgress();
    if (this.pda && this.pdaTab === 'map') this.drawMapMarkers();
  }

  updateNametags() {
    const g = this.game, cam = g.engine.camera;
    const seen = new Set();
    for (const p of g.players.values()) {
      if (p.local) continue;
      seen.add(p.id);
      let t = this.nametags.get(p.id);
      if (!t) { t = h('div', 'nametag shadow-text'); this.el.tags.appendChild(t); this.nametags.set(p.id, t); }
      const pos = p.pos.clone().add(new THREE.Vector3(0, 1.55, 0)).project(cam);
      const vis = pos.z < 1 && Math.abs(pos.x) < 1.1 && Math.abs(pos.y) < 1.1;
      t.style.display = vis ? '' : 'none';
      if (!vis) continue;
      t.style.left = (pos.x * 0.5 + 0.5) * innerWidth + 'px';
      t.style.top = (-pos.y * 0.5 + 0.5) * innerHeight + 'px';
      const dist = p.pos.distanceTo(g.local.pos);
      const label = (p.downed ? '✚ ' : '') + p.name + (dist > 30 ? ` · ${Math.round(dist)}m` : '');
      if (t._l !== label) { t._l = label; t.textContent = label; t.classList.toggle('downed', p.downed); }
      t.style.opacity = dist > 200 ? 0.5 : 1;
    }
    for (const [id, t] of this.nametags) if (!seen.has(id)) { t.remove(); this.nametags.delete(id); }
  }

  // ---------------------------------------------------------------- PDA
  isOpen() { return !!(this.pda || this.container || this.menuOpen || this.crtOpen); }
  togglePDA(tab) { if (this.pda) { if (tab && tab !== this.pdaTab) this.showTab(tab); else this.closePDA(); } else this.openPDA(tab ?? 'bag'); }
  openPDA(tab = 'bag') {
    if (this.pda) return;
    const g = this.game;
    g.uiOpen = true;
    g.input.unlock();
    const P = h('div', 'px opening'); P.id = 'pda';
    P.innerHTML = `<div class="pda-body"><div class="pda-top"><div class="pda-brand">CHRONO-PAL <b>2000</b> · <span class="pda-sub">PERSONAL FIELD ASSISTANT</span></div><div class="pda-tabs"></div><div class="pda-led"></div></div><div class="pda-screen"></div><div class="pda-foot">PROPERTY OF THE CHRONO-VAN EXPEDITION · IF FOUND RETURN TO 1987</div></div>`;
    for (const [x, y] of [[8, 8], [8, 'b'], ['r', 8], ['r', 'b']]) { const s = h('div', 'screw'); s.style[x === 'r' ? 'right' : 'left'] = '8px'; s.style[y === 'b' ? 'bottom' : 'top'] = '8px'; P.firstChild.appendChild(s); }
    this.root.appendChild(P);
    this.pda = P;
    const tabs = P.querySelector('.pda-tabs');
    for (const [k, label] of [['bag', 'BAG'], ['craft', 'CRAFT'], ['dinos', 'DINOS'], ['map', 'MAP'], ['log', 'LOG']]) {
      const b = h('div', 'pda-tab', label); b.dataset.tab = k;
      b.onclick = () => { this.showTab(k); g.audio?.play('ui_click'); };
      tabs.appendChild(b);
    }
    this.showTab(tab);
    g.audio?.play('pda_open');
  }
  closePDA() {
    if (!this.pda) return;
    this.pda.remove(); this.pda = null;
    this.hideTooltip();
    if (this.drag) this.cancelDrag();
    if (!this.container && !this.menuOpen && !this.crtOpen) { this.game.uiOpen = false; this.game.input.lock(); }
    this.game.audio?.play('pda_close');
  }
  showTab(tab) {
    this.pdaTab = tab;
    for (const b of this.pda.querySelectorAll('.pda-tab')) b.classList.toggle('on', b.dataset.tab === tab);
    this.screen = this.pda.querySelector('.pda-screen');
    this.screen.innerHTML = '';
    ({ bag: () => this.renderBag(), craft: () => this.renderCraft(), dinos: () => this.renderDinos(), map: () => this.renderMap(), log: () => this.renderLog() })[tab]();
  }

  // --- backpack
  renderBag() {
    const g = this.game, inv = g.inventory;
    const S = this.screen;
    S.innerHTML = '';
    const pane = h('div', 'pane');
    const left = h('div');
    left.appendChild(h('div', 'section-title', 'HOTBAR'));
    const hot = h('div', 'grid'); hot.style.gridTemplateColumns = 'repeat(8, 50px)';
    left.appendChild(hot);
    left.appendChild(h('div', 'section-title', 'BACKPACK'));
    const bag = h('div', 'grid'); bag.style.gridTemplateColumns = 'repeat(8, 50px)';
    left.appendChild(bag);
    for (let i = 0; i < inv.size; i++) {
      const el = h('div', 'slot' + (i < 8 ? ' hot' : ''));
      this.fillSlot(el, inv.slots[i], i < 8 ? i + 1 : null, false);
      if (this.bagSel === i) el.classList.add('picked');
      this.bindSlot(el, inv, i);
      (i < 8 ? hot : bag).appendChild(el);
    }
    pane.appendChild(left);
    const det = h('div', 'detail');
    pane.appendChild(det);
    S.appendChild(pane);
    this.renderItemDetail(det, inv.slots[this.bagSel] ?? null, inv, this.bagSel);
  }
  renderItemDetail(det, s, inv, idx) {
    det.innerHTML = '';
    if (!s) { det.innerHTML = '<div class="section-title">SELECT AN ITEM</div><p class="stats">Click a slot to inspect it. Drag to move, right-click to split a stack, shift-click to quick-move.</p>'; return; }
    const d = ITEMS[s.id];
    det.innerHTML = `<div class="big"><img src="${this.icon(s.id)}"><div><div class="cat">${esc(d.cat.toUpperCase())}</div><h3>${esc(d.name)}</h3></div></div><p>${esc(d.desc ?? '')}</p>`;
    const stats = [];
    if (d.food) { const f = d.food; if (f.hunger) stats.push(`Food ${f.hunger > 0 ? '+' : ''}${f.hunger}`); if (f.thirst) stats.push(`Water ${f.thirst > 0 ? '+' : ''}${f.thirst}`); if (f.hp) stats.push(`Health ${f.hp > 0 ? '+' : ''}${f.hp}`); if (f.stamina) stats.push(`Stamina +${f.stamina}`); if (f.sick) stats.push('Might upset tummy'); }
    if (d.tool) { if (d.tool.dmg) stats.push(`Power ${d.tool.dmg}`); if (d.tool.torpor) stats.push(`Knockout ${d.tool.torpor}`); if (s.dur !== undefined && d.durability) stats.push(`Durability ${Math.ceil(s.dur)}/${d.durability}`); }
    if (d.fuel) stats.push(`Burns ${d.fuel}s`);
    if (stats.length) det.appendChild(h('div', 'stats', stats.join(' · ')));
    const row = h('div');
    const g = this.game;
    if (d.food || d.med) { const b = h('button', 'btn green', d.food ? (['water_clean', 'water_dirty', 'coffee'].includes(d.id) ? 'Drink' : 'Eat') : 'Use'); b.onclick = () => { if (inv.remove(d.id, 1)) { if (d.food) g.vitals.eat(d.id); else g.vitals.useMed(d.id); g.audio?.play(d.food ? 'munch' : 'heal'); } }; row.appendChild(b); }
    if (idx >= 8) { const b = h('button', 'btn', 'To hotbar'); b.onclick = () => { const e = inv.slots.slice(0, 8).findIndex((x) => !x); if (e >= 0) inv.swap(idx, e); else inv.swap(idx, inv.selected); this.bagSel = null; }; row.appendChild(b); }
    if (s.n > 1) { const b = h('button', 'btn', 'Split'); b.onclick = () => this.split(inv, idx); row.appendChild(b); }
    const drop = h('button', 'btn red', 'Drop'); drop.onclick = () => { const out = inv.removeAt(idx, s.n); if (out && g.drops) g.drops.throwFromPlayer(out); this.bagSel = null; }; row.appendChild(drop);
    det.appendChild(row);
  }
  split(inv, idx) {
    const s = inv.slots[idx];
    if (!s || s.n < 2) return;
    const e = inv.firstEmpty();
    if (e < 0) return;
    const half = Math.floor(s.n / 2);
    s.n -= half;
    inv.slots[e] = { ...s, n: half };
    inv.changed();
  }
  bindSlot(el, inv, i, opt = {}) {
    el.onmousedown = (e) => {
      e.preventDefault();
      const s = inv.slots[i];
      if (e.button === 2) { this.split(inv, i); return; }
      if (e.shiftKey && opt.other) { inv.moveTo(opt.other, i); this.game.audio?.play('ui_click'); return; }
      if (!s) { this.bagSel = null; if (this.pdaTab === 'bag' && this.pda) this.renderBag(); return; }
      this.bagSel = i;
      this.drag = { inv, i, start: [e.clientX, e.clientY], moved: false, el: null };
    };
    el.oncontextmenu = (e) => e.preventDefault();
    el.onmouseenter = (e) => { const s = inv.slots[i]; if (s) this.showTooltip(e, ITEMS[s.id].name + (s.n > 1 ? ` ×${s.n}` : '')); };
    el.onmouseleave = () => this.hideTooltip();
    el.dataset.slot = i;
    el._inv = inv;
  }
  onMouseMove(e) {
    if (this.tooltip) { this.tooltip.style.left = e.clientX + 14 + 'px'; this.tooltip.style.top = e.clientY + 14 + 'px'; }
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.start[0], e.clientY - d.start[1]) > 4) {
      d.moved = true;
      const s = d.inv.slots[d.i];
      if (!s) { this.drag = null; return; }
      d.el = h('img', 'drag'); d.el.src = this.icon(s.id); document.body.appendChild(d.el);
    }
    if (d.el) { d.el.style.left = e.clientX + 'px'; d.el.style.top = e.clientY + 'px'; }
  }
  onMouseUp(e) {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (d.el) d.el.remove();
    if (!d.moved) { if (this.pda && this.pdaTab === 'bag') this.renderBag(); if (this.container) this.renderContainer(); return; }
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.slot');
    if (target && target._inv) {
      const ti = +target.dataset.slot, tinv = target._inv;
      const a0 = d.inv.slots[d.i], b0 = tinv.slots[ti];
      if (tinv !== d.inv && ((a0 && tinv.accept && !tinv.accept(a0.id)) || (b0 && d.inv.accept && !d.inv.accept(b0.id)))) { this.game.audio?.play('error', { vol: 0.5 }); this.toast('That doesn\'t go in there.', 'warn'); this.bagSel = null; return; }
      if (tinv === d.inv) d.inv.swap(d.i, ti);
      else {
        const a = d.inv.slots[d.i], b = tinv.slots[ti];
        if (b && a && b.id === a.id && ITEMS[a.id].stack > 1) { const k = Math.min(ITEMS[a.id].stack - b.n, a.n); b.n += k; a.n -= k; if (a.n <= 0) d.inv.slots[d.i] = null; }
        else { d.inv.slots[d.i] = b ?? null; tinv.slots[ti] = a; }
        d.inv.changed(); tinv.changed();
      }
      this.game.audio?.play('ui_click');
    } else if (!e.target.closest('#pda') && !e.target.closest('.container-ui')) {
      const out = d.inv.removeAt(d.i, d.inv.slots[d.i]?.n ?? 1);
      if (out && this.game.drops) this.game.drops.throwFromPlayer(out);
    }
    this.bagSel = null;
  }
  cancelDrag() { if (this.drag?.el) this.drag.el.remove(); this.drag = null; }
  showTooltip(e, text) { this.hideTooltip(); const t = h('div', 'tooltip px-dark', esc(text)); document.body.appendChild(t); t.style.left = e.clientX + 14 + 'px'; t.style.top = e.clientY + 14 + 'px'; this.tooltip = t; }
  hideTooltip() { if (this.tooltip) { this.tooltip.remove(); this.tooltip = null; } }

  // --- crafting
  renderCraft() {
    const g = this.game, inv = g.inventory, C = g.crafting;
    const S = this.screen;
    S.innerHTML = '';
    const pane = h('div', 'pane');
    const cats = h('div', 'cats');
    const catList = [['all', 'All'], ['basics', 'Basics'], ['tools', 'Tools'], ['camp', 'Camp'], ['food', 'Food'], ['medical', 'Medical'], ['farm', 'Farming'], ['dinos', 'Dinos'], ['materials', 'Materials'], ['power', 'Power'], ['tech', 'Tech'], ['van', 'Van Parts'], ['defense', 'Defense'], ['science', 'Science'], ['decor', 'Decor']];
    this.craftCat = this.craftCat ?? 'all';
    for (const [k, label] of catList) { const c = h('div', 'c' + (this.craftCat === k ? ' on' : ''), label); c.onclick = () => { this.craftCat = k; this.renderCraft(); }; cats.appendChild(c); }
    pane.appendChild(cats);
    const mid = h('div'); mid.style.cssText = 'width:340px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;';
    const near = C.nearStations();
    mid.appendChild(h('div', 'section-title', 'NEARBY: ' + [...near].map((s) => STATIONS[s]?.name ?? s).join(', ').toUpperCase()));
    const grid = h('div', 'grid'); grid.style.gridTemplateColumns = 'repeat(6, 50px)';
    const list = RECIPES.filter((r) => !r.hidden && (this.craftCat === 'all' || r.cat === this.craftCat));
    // sort: craftable first, then available, then locked
    const score = (r) => (C.isUnlocked(r) ? (C.canCraft(r) ? 0 : near.has(r.station) ? 1 : 2) : 3);
    list.sort((a, b) => score(a) - score(b));
    const seenOut = new Set();
    for (const r of list) {
      if (seenOut.has(r.out + r.station) && score(r) >= 2) continue;
      seenOut.add(r.out + r.station);
      const el = h('div', 'slot');
      const unlocked = C.isUnlocked(r);
      if (!unlocked) el.classList.add('locked');
      else if (!C.canCraft(r)) el.classList.add('missing');
      if (this.craftSel === r.id) el.classList.add('picked');
      const img = h('img'); img.src = this.icon(r.out); el.appendChild(img);
      if (r.n > 1) el.appendChild(h('span', 'n', r.n));
      el.onclick = () => { this.craftSel = r.id; this.renderCraft(); g.audio?.play('ui_tick'); };
      el.onmouseenter = (e) => this.showTooltip(e, unlocked ? ITEMS[r.out].name : '??? (research to unlock)');
      el.onmouseleave = () => this.hideTooltip();
      grid.appendChild(el);
    }
    mid.appendChild(grid);
    pane.appendChild(mid);
    const det = h('div', 'detail');
    pane.appendChild(det);
    S.appendChild(pane);
    this.craftDetail = det;
    this.renderCraftDetail();
  }
  renderCraftDetail() {
    const g = this.game, C = g.crafting, inv = g.inventory;
    const det = this.craftDetail;
    if (!det) return;
    const r = RECIPES.find((x) => x.id === this.craftSel);
    det.innerHTML = '';
    if (!r) { det.innerHTML = '<div class="section-title">RECIPES</div><p class="stats">Pick a recipe. Some need a station nearby (workbench, campfire...). Locked ones are unlocked through research at the van.</p>'; return; }
    const d = ITEMS[r.out];
    const unlocked = C.isUnlocked(r);
    det.innerHTML = `<div class="big"><img src="${this.icon(r.out)}"><div><div class="cat">${esc((STATIONS[r.station]?.name ?? '').toUpperCase())}</div><h3>${esc(unlocked ? d.name : '???')}${r.n > 1 ? ' ×' + r.n : ''}</h3></div></div><p>${esc(unlocked ? d.desc ?? '' : 'Locked. ' + (C.unlockHint(r) ?? 'Research at the van computer.'))}</p>`;
    if (unlocked) {
      for (const [id, n] of Object.entries(r.in)) {
        const have = inv.count(id);
        const q = h('div', 'req' + (have < n ? ' no' : ''), `<img src="${this.icon(id)}"><span>${n} × ${esc(ITEMS[id]?.name ?? id)}</span><span class="have">${have}</span>`);
        det.appendChild(q);
      }
      const near = C.nearStations().has(r.station);
      if (!near) det.appendChild(h('p', 'stats', `Needs: ${STATIONS[r.station]?.name}`));
      const row = h('div');
      const b = h('button', 'btn primary', 'Craft');
      b.disabled = !C.canCraft(r) || !!C.job;
      b.onclick = () => { C.start(r); this.renderCraftDetail(); };
      row.appendChild(b);
      const b5 = h('button', 'btn', 'Craft ×5');
      b5.disabled = !C.canCraft(r, 5) || !!C.job;
      b5.onclick = () => { C.start(r, 5); this.renderCraftDetail(); };
      row.appendChild(b5);
      det.appendChild(row);
      const pr = h('div', 'progress'); pr.appendChild(h('i')); pr.style.visibility = C.job ? 'visible' : 'hidden';
      det.appendChild(pr);
      this.craftProg = pr;
    }
  }
  renderCraftProgress() {
    const j = this.game.crafting.job;
    if (!this.craftProg) return;
    this.craftProg.style.visibility = j ? 'visible' : 'hidden';
    if (j) this.craftProg.firstChild.style.width = Math.min(100, (j.t / j.time) * 100) + '%';
  }

  // --- dinos
  renderDinos() {
    const S = this.screen, g = this.game;
    S.innerHTML = '';
    const pane = h('div', 'pane');
    const list = h('div', 'list'); list.style.width = '330px';
    const tames = g.dinos ? g.dinos.tamed() : [];
    if (!tames.length) list.innerHTML = '<p class="stats" style="padding:8px">No tamed dinosaurs yet.<br><br>Find one, study it with binoculars or the scanner, knock it out (or befriend it) and feed it what it likes.</p>';
    for (const d of tames) {
      const c = h('div', 'row-card' + (this.dinoSel === d.id ? ' on' : ''));
      c.innerHTML = `<div style="width:34px;height:34px;background:${d.sp.colorCss ?? '#4a8a40'};box-shadow:0 0 0 2px #17130e"></div><div><div>${esc(d.name)}</div><div class="meta">${esc(d.sp.name)} · ${esc(d.order)} · ${esc(d.personality ?? '')}</div></div>`;
      c.onclick = () => { this.dinoSel = d.id; this.renderDinos(); };
      list.appendChild(c);
    }
    pane.appendChild(list);
    const det = h('div', 'detail');
    const d = tames.find((x) => x.id === this.dinoSel);
    if (d) {
      det.innerHTML = `<div class="cat">${esc(d.sp.name.toUpperCase())} · LV ${d.level ?? 1}</div><h3>${esc(d.name)}</h3><p>${esc(d.sp.blurb ?? '')}</p>`;
      const bars = [['Health', d.hp / d.maxHp, '#e04a3a'], ['Food', d.food / 100, '#e8a040'], ['Happiness', (d.happy ?? 70) / 100, '#f2b630']];
      for (const [n, k, c] of bars) det.appendChild(h('div', '', `<div class="stats">${n}</div><div class="bar seg"><i style="width:${Math.max(0, k) * 100}%;background:${c}"></i></div>`));
      det.appendChild(h('div', 'stats', `Trait: ${esc(d.personality)} · Job: ${esc(d.sp.jobName ?? 'none')} · ${Math.round(d.pos.distanceTo(g.local.pos))}m away`));
      const row = h('div');
      for (const o of ['Follow', 'Stay', 'Wander', 'Work', 'Guard']) {
        if (o === 'Work' && !d.sp.job) continue;
        const b = h('button', 'btn' + (d.order === o.toLowerCase() ? ' primary' : ''), o);
        b.onclick = () => { g.dinos.command(d, o.toLowerCase()); this.renderDinos(); };
        row.appendChild(b);
      }
      det.appendChild(row);
      const rn = h('button', 'btn', 'Rename'); rn.onclick = () => { const n = prompt('Name your dino', d.name); if (n) { g.dinos.rename(d, n.slice(0, 18)); this.renderDinos(); } };
      det.appendChild(rn);
    } else det.innerHTML = '<div class="section-title">YOUR HERD</div><p class="stats">Select a dino to give orders. Tip: use the Dino Whistle to command dinos near you.</p>';
    pane.appendChild(det);
    S.appendChild(pane);
  }

  // --- map
  renderMap() {
    const S = this.screen, g = this.game;
    S.innerHTML = '';
    const pane = h('div', 'pane');
    const wrap = h('div', 'map-wrap');
    pane.appendChild(wrap);
    const legend = h('div', 'map-legend');
    pane.appendChild(legend);
    S.appendChild(pane);
    const mapC = g.mapCanvas?.() ?? null;
    if (mapC) {
      const W = wrap.clientWidth || 560, H = wrap.clientHeight || 430;
      const scale = Math.min(W, H) / mapC.width;
      this.mapScale = this.mapScale ?? 1.6;
      const c = h('canvas'); c.width = mapC.width; c.height = mapC.height;
      c.getContext('2d').drawImage(mapC, 0, 0);
      const fog = g.mapFog?.();
      if (fog) c.getContext('2d').drawImage(fog, 0, 0);
      c.style.width = mapC.width * scale * this.mapScale + 'px';
      c.style.height = mapC.height * scale * this.mapScale + 'px';
      wrap.appendChild(c);
      const mk = h('canvas'); mk.width = mapC.width * 2; mk.height = mapC.height * 2; mk.style.width = c.style.width; mk.style.height = c.style.height;
      wrap.appendChild(mk);
      this.mapEls = { wrap, c, mk, scale, base: mapC.width };
      wrap.onwheel = (e) => { this.mapScale = Math.max(1, Math.min(4, this.mapScale * (e.deltaY < 0 ? 1.2 : 1 / 1.2))); this.renderMap(); };
      wrap.oncontextmenu = (e) => { e.preventDefault(); const r = c.getBoundingClientRect(); const u = (e.clientX - r.left) / r.width, v = (e.clientY - r.top) / r.height; const w = g.world; g.events.emit('pin', { x: -w.half + u * w.size, z: -w.half + v * w.size }); this.renderMap(); };
      this.drawMapMarkers();
    }
    legend.innerHTML = `<div class="section-title">LEGEND</div>`;
    for (const [ic, label] of [['friend', 'You & friends'], ['van', 'The Van'], ['dino', 'Tamed dinos / trail'], ['poi', 'Discovered places'], ['skull', 'Alpha lairs'], ['pin', 'Pins (right-click)']]) {
      const row = h('div', 'req'); row.appendChild(iconCanvas(ic, 2)); row.appendChild(h('span', '', label)); legend.appendChild(row);
    }
    legend.appendChild(h('div', 'stats', 'Scroll to zoom. Explore to reveal the map.'));
    const p = g.local.pos;
    legend.appendChild(h('div', 'stats', `You: ${Math.round(p.x)}, ${Math.round(p.z)} · ${esc(g.biomeName(p.x, p.z))}`));
  }
  drawMapMarkers() {
    const M = this.mapEls, g = this.game;
    if (!M || !M.mk.isConnected) return;
    const ctx = M.mk.getContext('2d');
    ctx.clearRect(0, 0, M.mk.width, M.mk.height);
    const w = g.world, k = M.mk.width / w.size;
    const put = (icon, x, z) => { const ic = iconCanvas(icon, 2); ctx.drawImage(ic, (x + w.half) * k - 12, (z + w.half) * k - 12); };
    for (const poi of g.discoveredPOIs?.() ?? []) put(g.bosses?.lairOf?.(poi.id) ? 'skull' : 'poi', poi.x, poi.z);
    if (g.tracks?.trail) put('dino', g.tracks.trail.mx ?? g.tracks.trail.x, g.tracks.trail.mz ?? g.tracks.trail.z);
    for (const pin of g.pins ?? []) put('pin', pin.x, pin.z);
    if (g.van) put('van', g.van.pos.x, g.van.pos.z);
    for (const d of g.dinos?.tamed() ?? []) put('dino', d.pos.x, d.pos.z);
    for (const pl of g.players.values()) put('friend', pl.pos.x, pl.pos.z);
    // keep you centred
    const lp = g.local.pos;
    const cx = ((lp.x + w.half) / w.size) * M.c.clientWidth, cy = ((lp.z + w.half) / w.size) * M.c.clientHeight;
    const W = M.wrap.clientWidth, H = M.wrap.clientHeight;
    const left = Math.min(0, Math.max(W - M.c.clientWidth, W / 2 - cx)), top = Math.min(0, Math.max(H - M.c.clientHeight, H / 2 - cy));
    M.c.style.left = M.mk.style.left = left + 'px';
    M.c.style.top = M.mk.style.top = top + 'px';
  }

  // --- log / journal
  renderLog() {
    const S = this.screen, g = this.game;
    S.innerHTML = '';
    const pane = h('div', 'pane');
    const list = h('div', 'list'); list.style.width = '300px';
    const entries = g.journal?.entries() ?? [];
    this.logSel = this.logSel ?? entries[0]?.id;
    for (const e of entries) {
      const c = h('div', 'row-card' + (this.logSel === e.id ? ' on' : ''), `<div><div>${esc(e.title)}</div><div class="meta">${esc(e.kind)}</div></div>`);
      c.onclick = () => { this.logSel = e.id; this.renderLog(); };
      list.appendChild(c);
    }
    pane.appendChild(list);
    const det = h('div', 'detail');
    const e = entries.find((x) => x.id === this.logSel);
    if (e) { det.innerHTML = `<div class="cat">${esc(e.kind.toUpperCase())}</div><h3>${esc(e.title)}</h3>`; det.appendChild(h('div', '', e.html)); det.style.overflowY = 'auto'; }
    else det.innerHTML = '<p class="stats">Your journal is empty. Go discover something!</p>';
    pane.appendChild(det);
    S.appendChild(pane);
  }

  // ---------------------------------------------------------------- containers (storage, stations)
  openContainer(cont, title, opt = {}) {
    const g = this.game;
    if (this.container) this.closeContainer();
    g.uiOpen = true; g.input.unlock();
    const el = h('div', 'px container-ui');
    el.style.cssText = 'position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:860px;padding:16px 18px;pointer-events:auto;';
    this.root.appendChild(el);
    this.container = { cont, title, el, opt };
    this.renderContainer();
    g.audio?.play('box_open');
  }
  renderContainer() {
    const C = this.container;
    if (!C) return;
    const g = this.game, inv = g.inventory;
    const el = C.el;
    el.innerHTML = '';
    const top = h('div', '', `<div class="pda-brand" style="margin-bottom:10px">${esc(C.title.toUpperCase())}</div>`);
    el.appendChild(top);
    const row = h('div'); row.style.cssText = 'display:flex;gap:18px;';
    const scr = h('div', 'pda-screen'); scr.style.cssText = 'position:relative;inset:auto;padding:10px;flex:1;';
    scr.appendChild(h('div', 'section-title', 'YOUR BACKPACK'));
    const g1 = h('div', 'grid'); g1.style.gridTemplateColumns = 'repeat(8, 50px)';
    for (let i = 0; i < inv.size; i++) { const s = h('div', 'slot' + (i < 8 ? ' hot' : '')); this.fillSlot(s, inv.slots[i], null, false); this.bindSlot(s, inv, i, { other: C.cont.inv }); g1.appendChild(s); }
    scr.appendChild(g1);
    row.appendChild(scr);
    const scr2 = h('div', 'pda-screen'); scr2.style.cssText = 'position:relative;inset:auto;padding:10px;width:320px;';
    if (C.cont.inv) {
      scr2.appendChild(h('div', 'section-title', (C.opt.label ?? 'CONTENTS').toUpperCase()));
      const g2 = h('div', 'grid'); g2.style.gridTemplateColumns = `repeat(${C.opt.cols ?? 5}, 50px)`;
      for (let i = 0; i < C.cont.inv.size; i++) { const s = h('div', 'slot'); this.fillSlot(s, C.cont.inv.slots[i], null, false); this.bindSlot(s, C.cont.inv, i, { other: inv }); g2.appendChild(s); }
      scr2.appendChild(g2);
    }
    if (C.opt.extra) scr2.appendChild(C.opt.extra(C));
    row.appendChild(scr2);
    el.appendChild(row);
    el.appendChild(h('div', 'small', 'Shift-click to quick-move · drag to swap · Esc / Tab to close'));
  }
  closeContainer() {
    if (!this.container) return;
    const c = this.container;
    this.container = null;
    c.el.remove();
    if (c.opt.onClose) c.opt.onClose();
    this.hideTooltip();
    if (!this.pda && !this.menuOpen && !this.crtOpen) { this.game.uiOpen = false; this.game.input.lock(); }
    this.game.audio?.play('box_close');
  }

  // ---------------------------------------------------------------- pause / settings
  openPause() {
    const g = this.game;
    if (this.menuOpen) return;
    this.menuOpen = true; g.uiOpen = true; g.input.unlock();
    const s = h('div', 'screen dim');
    const m = h('div', 'menu px');
    m.innerHTML = `<h2>Paused</h2><div class="small">${esc(g.net?.roomCode ? 'Co-op room: ' + g.net.roomCode + ' · ' + g.players.size + ' explorer(s)' : 'Single player · press Invite to play with friends')}</div>`;
    const add = (label, fn, cls = '') => { const b = h('button', 'btn ' + cls, label); b.onclick = fn; m.appendChild(b); return b; };
    add('Resume', () => this.closePause(), 'primary');
    if (g.onInvite) add('Invite Friends', () => g.onInvite());
    add('Save Game', () => { g.save?.(); this.toast('Game saved.', '', 'star'); });
    add('Settings', () => this.openSettings(m));
    add('Controls', () => this.openControls(m));
    add('Quit to Title', () => { g.save?.(); location.href = location.pathname; }, 'red');
    s.appendChild(m);
    this.root.appendChild(s);
    this.pauseEl = s;
    if (!g.net || !g.net.connected) g.paused = true;
  }
  closePause() {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.pauseEl.remove();
    this.game.paused = false;
    if (!this.pda && !this.container && !this.crtOpen) { this.game.uiOpen = false; this.game.input.lock(); }
  }
  openSettings(m) {
    const g = this.game, st = g.settings;
    m.innerHTML = '<h2>Settings</h2>';
    const row = (label, input) => { const l = h('label', '', `<span>${label}</span>`); l.appendChild(input); m.appendChild(l); return input; };
    const sel = h('select'); for (const q of ['low', 'medium', 'high', 'ultra']) { const o = h('option', '', q[0].toUpperCase() + q.slice(1)); o.value = q; if (st.quality === q) o.selected = true; sel.appendChild(o); }
    row('Graphics', sel).onchange = () => { st.quality = sel.value; g.applySettings?.(); };
    const mk = (min, max, step, val, fn) => { const r = h('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = val; r.oninput = () => fn(+r.value); return r; };
    row('Mouse sensitivity', mk(0.4, 3, 0.05, st.sens, (v) => { st.sens = v; g.applySettings?.(); }));
    row('Field of view', mk(55, 95, 1, st.fov, (v) => { st.fov = v; g.applySettings?.(); }));
    row('Master volume', mk(0, 1, 0.01, st.volume, (v) => { st.volume = v; g.applySettings?.(); }));
    row('Music volume', mk(0, 1, 0.01, st.music, (v) => { st.music = v; g.applySettings?.(); }));
    row('Voice chat volume', mk(0, 2, 0.01, st.voice, (v) => { st.voice = v; g.applySettings?.(); }));
    const inv = h('input'); inv.type = 'checkbox'; inv.checked = st.invertY; row('Invert mouse Y', inv).onchange = () => { st.invertY = inv.checked; g.applySettings?.(); };
    const ptt = h('input'); ptt.type = 'checkbox'; ptt.checked = st.pushToTalk; row('Push-to-talk (V)', ptt).onchange = () => { st.pushToTalk = ptt.checked; g.applySettings?.(); };
    const back = h('button', 'btn primary', 'Back'); back.onclick = () => { this.pauseEl.remove(); this.menuOpen = false; this.openPause(); };
    m.appendChild(back);
  }
  openControls(m) {
    const inp = this.game.input;
    m.innerHTML = '<h2>Controls</h2>';
    const list = [['Move', 'WASD'], ['Jump / swim up', 'Space'], ['Sprint', 'Shift'], ['Crouch', 'Ctrl / C'], ['Use / swing', 'LMB'], ['Aim / alt', 'RMB'], ['Interact', 'E'], ['Inventory (CHRONO-PAL)', 'Tab'], ['Build menu (hammer)', 'B'], ['Rotate piece', 'R'], ['Map', 'M'], ['Journal', 'J'], ['Hotbar', '1-8 / wheel'], ['Drop', 'Q'], ['Chat', 'Enter'], ['Emotes', 'G'], ['Voice (push to talk)', 'V'], ['Whistle to dinos', 'F'], ['Camera zoom', 'Ctrl + wheel'], ['First / third person', 'P'], ['Horn (in van)', 'H']];
    for (const [a, k] of list) m.appendChild(h('label', '', `<span>${esc(a)}</span><span class="key">${esc(k)}</span>`));
    void inp;
    const back = h('button', 'btn primary', 'Back'); back.onclick = () => { this.pauseEl.remove(); this.menuOpen = false; this.openPause(); };
    m.appendChild(back);
  }

  closeAll() { this.closePDA(); this.closeContainer(); if (this.crtOpen && this.game.computer) this.game.computer.close(); }
}
