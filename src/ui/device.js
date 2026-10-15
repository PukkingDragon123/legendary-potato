// The Pocket Prof: a tamagotchi-like gadget from Nubbins Atomic Labs that
// replaces the floating HUD. Its little green phosphor screen (rendered into
// the 3D device in your left hand) shows your "pet" (you: its face and bars
// are your health, food, water, stamina and energy), the clock, a compass to
// your next task, what you are looking at and a ticker of news. Professor
// Nubbins calls you on it with tasks, hints and praise. Raise it (Tab) and
// the whole screen comes up in front of you: comms, backpack, crafting,
// pals, map and log live inside it, lined up exactly with the 3D screen.
import * as THREE from 'three';
import { LCD_W, LCD_H } from '../entities/viewmodel.js';
import { ITEMS } from '../data/items.js';

// ------------------------------------------------------------------ a 3x5 pixel font
const GLYPHS = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
  G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
  4: '101101111001001', 5: '111100110001110', 6: '011100110101010', 7: '111001010010010', 8: '010101010101010', 9: '010101011001110',
  ':': '000010000010000', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '110001010000010', '-': '000000111000000',
  '+': '000010111010000', '/': '001001010100100', "'": '010010000000000', '(': '010100100100010', ')': '010001001001010', '%': '101001010100101',
  '#': '101111101111101', '<': '001010100010001', '>': '100010001010100', '=': '000111000111000', '*': '000101010101000', '&': '010101010101011',
};
function text(ctx, s, x, y, col, scale = 1, max = 999) {
  ctx.fillStyle = col;
  s = String(s).toUpperCase();
  let cx = x;
  for (const ch of s) {
    if (cx - x > max) break;
    const gl = GLYPHS[ch];
    if (gl) for (let i = 0; i < 15; i++) if (gl[i] === '1') ctx.fillRect(cx + (i % 3) * scale, y + Math.floor(i / 3) * scale, scale, scale);
    cx += 4 * scale;
  }
  return cx - x;
}
const textW = (s, scale = 1) => String(s).length * 4 * scale;

// phosphor palette
const P = { bg: '#071409', dim: '#163a1c', mid: '#2f7a3a', hi: '#7fe07a', top: '#d2ffc4', warn: '#ffd36a' };

// tiny 5x5 icons
const ICONS = {
  heart: '0101011111111110111000100', food: '0011001110111110111001110', drop: '0010001110011101111101110', bolt: '0001000110011100011001000',
  zzz: '1111100010001000100011111', mail: '1111111011101011000111111', skull: '0111011111101010111001010', star: '0010001110111110111010001',
  sun: '1010101110110110111010101', moon: '0111011000110001100001111', target: '0111010001101011000101110',
};
function icon(ctx, name, x, y, col) { const g = ICONS[name]; if (!g) return; ctx.fillStyle = col; for (let i = 0; i < 25; i++) if (g[i] === '1') ctx.fillRect(x + (i % 5), y + Math.floor(i / 5), 1, 1); }

// the professor's portrait for the comms screen
function profPortrait() {
  const c = document.createElement('canvas'); c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  const px = (a, b, w, h, col) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  px(0, 0, 32, 32, '#0b2410');
  // wild white hair
  for (const [a, b, r] of [[6, 7, 5], [11, 4, 5], [17, 3, 6], [24, 5, 5], [27, 10, 4], [4, 12, 4]]) { x.fillStyle = '#c8ffc0'; x.beginPath(); x.arc(a, b, r, 0, 6.3); x.fill(); }
  // bean head
  x.fillStyle = '#5fbf5a'; x.beginPath(); x.ellipse(16, 19, 11, 12, 0, 0, 6.3); x.fill();
  // goggles + googly eyes
  px(5, 12, 22, 3, '#2f7a3a');
  for (const ex of [11, 21]) { x.fillStyle = '#e8ffe0'; x.beginPath(); x.arc(ex, 16, 4, 0, 6.3); x.fill(); x.fillStyle = '#071409'; x.beginPath(); x.arc(ex + (ex < 16 ? 1 : -1), 17.5, 2, 0, 6.3); x.fill(); }
  // moustache + grin
  x.fillStyle = '#c8ffc0'; x.beginPath(); x.ellipse(12, 23, 5, 2, 0.3, 0, 6.3); x.fill(); x.beginPath(); x.ellipse(20, 23, 5, 2, -0.3, 0, 6.3); x.fill();
  px(12, 26, 8, 2, '#071409'); px(14, 26, 2, 1, '#e8ffe0');
  return c.toDataURL();
}

// ------------------------------------------------------------------ the device system
export class Device {
  constructor(game) {
    this.name = 'device';
    this.g = game;
    this.raised = false; this.peek = false; this.peekT = 0; this.alert = false;
    this.notices = []; this.msgs = []; this.unread = 0;
    this.tasks = null; this.target = null;
    this.held = { name: '', t: 0, slot: 0 };
    this.signal = 0.7;
    this.t = 0; this.lcdT = 0;
    this.portrait = profPortrait();
    this.pet = { y: 0, vy: 0, blinkT: 2, mood: 'happy', eye: [0, 0] };
    game.device = this;
    document.body.classList.add('diegetic');
    this.hookUI();
    this.hookEvents();
  }
  // ---------------------------------------------------------------- messages + notices
  notice(textS, kind = '') {
    const s = String(textS).replace(/[^\x20-\x7e]/g, '').trim();
    if (!s) return;
    const last = this.notices[this.notices.length - 1];
    if (last && last.text === s && this.t - last.at < 2) { last.at = this.t; return; }
    this.notices.push({ text: s, at: this.t, kind });
    if (this.notices.length > 6) this.notices.shift();
    if (kind === 'warn') this.beep(2);
  }
  message(title, body, opt = {}) {
    const m = { id: 'm' + Date.now() + Math.random(), title: String(title), body: String(body ?? ''), from: opt.from ?? 'PROF. NUBBINS', day: this.g.time?.day ?? 1, read: false, kind: opt.kind ?? 'msg' };
    this.msgs.unshift(m);
    if (this.msgs.length > 60) this.msgs.pop();
    this.unread++;
    this.alert = true;
    this.beep(opt.quiet ? 0 : 1);
    if (!opt.quiet) { this.peek = true; this.peekT = opt.peek ?? 4.5; this.peekMsg = m; }
    if (this.g.ui?.pda && this.g.ui.pdaTab === 'comms') this.g.ui.showTab('comms');
    return m;
  }
  beep(n = 1) {
    const a = this.g.audio;
    if (!a || n <= 0) return;
    for (let i = 0; i < n; i++) setTimeout(() => a.play('ui_tick', { vol: 0.5, rate: 1.6 + i * 0.25 }), i * 140);
  }
  // ---------------------------------------------------------------- reroute the old HUD into the device
  hookUI() {
    const g = this.g, ui = g.ui;
    if (!ui) return;
    ui.toast = (txt, kind = '') => this.notice(txt, kind);
    const loot = ui.loot.bind(ui);
    ui.loot = (id, n) => { this.notice(`+${n} ${ITEMS[id]?.name ?? id}`); void loot; g.audio?.play('loot', { vol: 0.35 }); };
    ui.banner = (b1, b2, b3 = '') => { this.message(b1, [b2, b3].filter(Boolean).join(' - '), { peek: 4 }); };
    ui.setObjective = (o) => { this.setTasks(o); };
    const setTarget = ui.setTarget.bind(ui);
    ui.setTarget = (t) => { this.target = t && (t.hp !== undefined || t.info || t.label) ? t : null; void setTarget; };
    ui.scanCard = (d, first) => { this.message(first ? 'NEW SCAN!' : 'SCANNED', `${d.title}: ${d.fact}${first && d.rp ? ` (+${d.rp} ${String(d.cat).toUpperCase()} DATA)` : ''}`, { quiet: !first, peek: 3.5, kind: 'scan' }); };
  }
  setTasks(o) {
    const prev = this.tasks;
    this.tasks = o;
    if (!o) return;
    // a new chapter: the professor explains it
    if (!prev || prev.title !== o.title) {
      const ch = o.chapter ?? '';
      const intro = PROF_LINES[o.title] ?? 'New orders, kid. Check your to-do list.';
      if (this.g.titleMode) { this._pendingChapter = { ch, o, intro }; return; }
      this.message(`${ch}: ${o.title}`, intro + '\n\nTO DO:\n' + (o.items ?? []).map((it) => '- ' + it.text).join('\n'), { peek: 5 });
    }
  }
  hookEvents() {
    const g = this.g, E = g.events;
    E.on('started', () => {
      setTimeout(() => {
        this.message('INCOMING CALL', 'Kid! KID! Can you hear me? It is me, Professor Nubbins, calling through your Pocket Prof. Your van went 66 million years backwards. Do not panic. Well, panic a LITTLE. Lift the gadget (TAB) any time to see my notes, your bag, the map and everything else.', { peek: 6 });
        if (this._pendingChapter) { const { ch, o, intro } = this._pendingChapter; this._pendingChapter = null; setTimeout(() => this.message(`${ch}: ${o.title}`, intro + '\n\nTO DO:\n' + (o.items ?? []).map((it) => '- ' + it.text).join('\n'), { peek: 5 }), 7000); }
      }, 1500);
    });
    E.on('damaged', ({ amount }) => { if (amount > 25) this.notice('OUCH! BIG HIT', 'warn'); });
    E.on('downed', () => this.message('KID?!', 'You have been knocked flat. Hang on. Your friends can revive you, or you will wake up back at camp.', { peek: 3 }));
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g;
    this.t += dt;
    if (this.peekT > 0) { this.peekT -= dt; if (this.peekT <= 0) this.peek = false; }
    if (this.raised && this.g.ui?.pdaTab === 'comms') { this.unread = 0; this.alert = false; for (const m of this.msgs) m.read = true; }
    // held item changes show up on the screen for a moment
    const held = g.inventory?.held?.();
    const name = held ? ITEMS[held.id]?.name ?? '' : '';
    if (name !== this.held.name) { this.held = { name, t: 1.8, slot: (g.inventory?.selected ?? 0) + 1 }; }
    else this.held.t -= dt;
    // the signal needle drifts (the professor's line is not great)
    this.signal = 0.55 + Math.sin(this.t * 0.3) * 0.2 + (this.alert ? 0.25 : 0);
  }
  lateUpdate(dt) {
    const g = this.g, V = g.viewmodel;
    if (!V) return;
    // draw the little screen ~20 times a second
    this.lcdT -= dt;
    if (this.lcdT <= 0) { this.lcdT = 0.05; this.drawLCD(V.device.userData.device); }
    this.placeScreen();
  }
  // ---------------------------------------------------------------- the 160x120 phosphor screen
  drawLCD(D) {
    const g = this.g, x = D.ctx, v = g.vitals, t = this.t;
    x.fillStyle = P.bg; x.fillRect(0, 0, LCD_W, LCD_H);
    // faint grid + bezel shadow
    x.fillStyle = '#0a1b0d'; for (let yy = 0; yy < LCD_H; yy += 2) x.fillRect(0, yy, LCD_W, 1);
    if (this.raised) { text(x, 'POCKET PROF', 46, 54, P.mid, 1); D.tex.needsUpdate = true; return; }
    // ---- status bar
    const day = g.time?.day ?? 1, clock = g.time?.clock?.() ?? '';
    text(x, `D${day} ${clock}`, 3, 3, P.hi);
    icon(x, (g.time?.tod ?? 0.5) > 0.25 && (g.time?.tod ?? 0.5) < 0.75 ? 'sun' : 'moon', 74, 3, P.hi);
    for (let i = 0; i < 4; i++) { x.fillStyle = i < Math.round(this.signal * 4) ? P.hi : P.dim; x.fillRect(132 + i * 3, 8 - i * 1.5, 2, 1 + i * 1.5); }
    if (this.unread) { if (Math.sin(t * 8) > -0.3) icon(x, 'mail', 146, 3, P.warn); }
    x.fillStyle = P.dim; x.fillRect(0, 11, LCD_W, 1);
    // ---- the pet (you)
    this.drawPet(x, 6, 16, v);
    // ---- bars or what you are looking at
    if (this.target && (this.target.hp !== undefined || this.target.info)) {
      const T = this.target;
      icon(x, 'target', 64, 16, P.hi);
      text(x, T.label ?? '', 72, 16, P.top, 1, 84);
      if (T.info) text(x, T.info, 64, 24, P.mid, 1, 92);
      let yy = 33;
      const bar = (k, label, col) => { text(x, label, 64, yy, P.mid); x.fillStyle = P.dim; x.fillRect(88, yy, 66, 5); x.fillStyle = col; x.fillRect(88, yy, Math.round(66 * Math.max(0, Math.min(1, k))), 5); yy += 8; };
      if (T.hp !== undefined && T.hp !== null) bar(T.hp, 'HP', P.hi);
      if (T.torpor !== undefined) bar(T.torpor, 'ZZZ', P.top);
      if (T.tame !== undefined) bar(T.tame, 'TAME', P.warn);
    } else if (v) {
      const rows = [['heart', v.hp / v.max.hp], ['food', v.hunger / v.max.hunger], ['drop', v.thirst / v.max.thirst], ['bolt', v.stamina / v.max.stamina], ['zzz', v.energy / v.max.energy]];
      rows.forEach(([ic, k], i) => {
        const yy = 15 + i * 9;
        const low = k < 0.2;
        const col = low ? (Math.sin(t * 10) > 0 ? P.warn : P.dim) : P.hi;
        icon(x, ic, 66, yy, col);
        x.fillStyle = P.dim; x.fillRect(74, yy + 1, 80, 3);
        // segmented bar
        const n = Math.round(Math.max(0, Math.min(1, k)) * 20);
        x.fillStyle = low ? P.warn : P.hi;
        for (let s = 0; s < n; s++) x.fillRect(74 + s * 4, yy, 3, 5);
      });
      // temperature / effects line
      const tt = v.temp ?? 0.5;
      const tl = tt < 0.22 ? 'FREEZING!' : tt < 0.34 ? 'CHILLY' : tt > 0.82 ? 'SCORCHING!' : tt > 0.68 ? 'WARM' : 'COMFY';
      const fx = [...(v.effects?.keys?.() ?? [])].filter((k) => k !== 'warm').slice(0, 2).join(' ').toUpperCase();
      text(x, (v.wetness > 0.35 ? 'SOAKED ' : '') + tl + (fx ? ' ' + fx : ''), 64, 60, tt < 0.22 || tt > 0.82 ? P.warn : P.mid, 1, 94);
    }
    x.fillStyle = P.dim; x.fillRect(0, 68, LCD_W, 1);
    // ---- ticker: the newest notice, or the next task
    const n = this.notices[this.notices.length - 1];
    let line = '', lc = P.hi;
    if (this.held.t > 0 && this.held.name) { line = `[${this.held.slot}] ${this.held.name}`; lc = P.top; }
    else if (n && t - n.at < 4) { line = n.text; lc = n.kind === 'warn' ? P.warn : P.hi; }
    else if (this.tasks) { const it = (this.tasks.items ?? []).find((i) => !i.done); if (it) line = 'TODO: ' + it.text + (it.count ? ` ${it.count}` : ''); lc = P.mid; }
    if (line) {
      const w = textW(line);
      const off = w > 152 ? Math.floor(((t * 22) % (w + 40))) : 0;
      x.save(); x.beginPath(); x.rect(3, 71, 154, 7); x.clip();
      text(x, line, 4 - off, 72, lc);
      if (w > 152) text(x, line, 4 - off + w + 40, 72, lc);
      x.restore();
    }
    // ---- compass with the objective marker
    this.drawCompass(x, 82);
    // ---- the professor calling
    if (this.peek && this.peekMsg) {
      x.fillStyle = P.bg; x.fillRect(4, 14, 152, 52);
      x.strokeStyle = P.hi; x.strokeRect(4.5, 14.5, 151, 51);
      text(x, this.peekMsg.from, 9, 18, P.mid);
      const words = this.peekMsg.title.toUpperCase();
      text(x, words.slice(0, 18), 9, 27, P.top, 2, 140);
      const body = this.peekMsg.body.replace(/\s+/g, ' ');
      text(x, body.slice(0, 36), 9, 42, P.hi, 1, 144); text(x, body.slice(36, 72), 9, 49, P.hi, 1, 144);
      if (Math.sin(t * 6) > 0) text(x, 'TAB TO READ', 9, 57, P.warn);
    }
    D.tex.needsUpdate = true;
  }
  drawPet(x, ox, oy, v) {
    const t = this.t, pet = this.pet;
    // mood from your vitals
    let mood = 'happy';
    if (v) {
      if (this.g.local.downed) mood = 'ko';
      else if (v.hp / v.max.hp < 0.3) mood = 'hurt';
      else if (v.thirst / v.max.thirst < 0.2) mood = 'thirsty';
      else if (v.hunger / v.max.hunger < 0.2) mood = 'hungry';
      else if (v.energy / v.max.energy < 0.2) mood = 'sleepy';
      else if ((v.temp ?? 0.5) < 0.25) mood = 'cold';
      else if ((v.temp ?? 0.5) > 0.82) mood = 'hot';
    }
    if (this.unread && mood === 'happy') mood = 'mail';
    pet.mood = mood;
    // bounce
    const bounce = mood === 'happy' || mood === 'mail' ? 1 : mood === 'cold' ? 0.3 : 0.15;
    pet.vy += (-pet.y * 120 - pet.vy * 4) * 0.05;
    if (pet.y >= -0.1 && Math.random() < 0.04 * bounce) pet.vy -= 6;
    pet.y += pet.vy * 0.05; if (pet.y > 0) { pet.y = 0; pet.vy *= -0.3; }
    const shake = mood === 'cold' ? Math.round(Math.sin(t * 40)) : 0;
    const bx = ox + 26 + shake, by = oy + 26 + Math.round(pet.y);
    // ground
    x.fillStyle = P.dim; x.fillRect(ox, oy + 44, 54, 1);
    // the bean (squashes when it lands)
    const sq = pet.y > -0.5 ? 1.08 : 0.94;
    x.fillStyle = P.hi; x.beginPath(); x.ellipse(bx, by, 12 * sq, 17 / sq, 0, 0, 6.3); x.fill();
    x.fillStyle = P.mid; x.fillRect(bx - 1, by - 16, 1, 32); // the stitched seam
    // googly eyes with wobbling pupils
    pet.blinkT -= 0.05; const blink = pet.blinkT < 0.15; if (pet.blinkT < 0) pet.blinkT = 2 + Math.random() * 3;
    for (const [i, ex] of [[0, bx - 5], [1, bx + 5]]) {
      x.fillStyle = P.top; x.beginPath(); x.arc(ex, by - 7, 4, 0, 6.3); x.fill();
      if (mood === 'ko') { text(x, 'X', ex - 1, by - 9, P.bg); continue; }
      if (blink || mood === 'sleepy') { x.fillStyle = P.hi; x.fillRect(ex - 4, by - 9, 8, mood === 'sleepy' ? 3 : 4); }
      const pe = pet.eye; pe[i] = (pe[i] ?? 0) + (Math.sin(t * 3 + i) * 0.5 - pe[i]) * 0.2;
      x.fillStyle = P.bg; x.fillRect(Math.round(ex - 1 + pe[i] * 2), by - 7 + (mood === 'hungry' || mood === 'thirsty' ? 1 : 0), 2, 2);
    }
    // the mouth
    x.fillStyle = P.bg;
    if (mood === 'happy' || mood === 'mail') { x.fillRect(bx - 4, by + 3, 8, 1); x.fillRect(bx - 5, by + 2, 1, 1); x.fillRect(bx + 4, by + 2, 1, 1); x.fillRect(bx - 3, by + 4, 6, 1); }
    else if (mood === 'hungry') { x.fillRect(bx - 3, by + 2, 6, 4); x.fillStyle = P.top; x.fillRect(bx + 1, by + 6, 1, 2 + Math.round((t * 3) % 3)); }
    else if (mood === 'thirsty') { x.fillRect(bx - 3, by + 2, 6, 3); x.fillStyle = P.top; x.fillRect(bx - 1, by + 4, 3, 3); }
    else if (mood === 'cold') { x.fillRect(bx - 4, by + 3, 8, 2); x.fillStyle = P.top; for (let k = 0; k < 4; k++) x.fillRect(bx - 4 + k * 2, by + 3, 1, 2); }
    else if (mood === 'hot') { x.fillRect(bx - 3, by + 3, 6, 2); x.fillStyle = P.top; x.fillRect(bx + 10, by - 10 + Math.round((t * 6) % 6), 1, 2); }
    else { x.fillRect(bx - 3, by + 4, 6, 1); x.fillRect(bx - 4, by + 5, 1, 1); x.fillRect(bx + 3, by + 5, 1, 1); }
    // little thought icons
    const thought = { hungry: 'food', thirsty: 'drop', sleepy: 'zzz', hurt: 'heart', mail: 'mail', ko: 'skull' }[mood];
    if (thought && Math.sin(t * 3) > -0.2) { x.fillStyle = P.dim; x.fillRect(ox + 42, oy, 9, 8); icon(x, thought, ox + 44, oy + 1, mood === 'mail' ? P.warn : P.top); }
    if (mood === 'cold') text(x, 'BRR', ox + 38, oy + 2, P.top);
  }
  drawCompass(x, y) {
    const g = this.g;
    const yaw = g.rig?.yaw ?? 0;
    const heading = ((-yaw * 180) / Math.PI + 360 * 4) % 360;
    const W = 152, span = 140;
    x.fillStyle = P.dim; x.fillRect(4, y + 8, W, 1);
    const place = (deg) => { let d = deg - heading; d = ((d + 540) % 360) - 180; return Math.abs(d) > span / 2 ? null : 80 + (d / span) * W; };
    for (let deg = 0; deg < 360; deg += 15) {
      const px = place(deg); if (px === null) continue;
      const big = deg % 45 === 0;
      x.fillStyle = big ? P.hi : P.mid; x.fillRect(Math.round(px), y + (big ? 3 : 5), 1, big ? 5 : 3);
      if (deg % 90 === 0) text(x, ['N', 'E', 'S', 'W'][deg / 90], Math.round(px) - 1, y + 10, deg === 0 ? P.warn : P.hi);
    }
    // markers: your next goal / trail / pins
    const marks = [...(g.ui?.markers?.values?.() ?? [])];
    const lp = g.local.pos;
    for (const m of marks) {
      const dx = m.x - lp.x, dz = m.z - lp.z;
      const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360;
      const px = place(deg);
      if (px === null) continue;
      x.fillStyle = P.top; x.fillRect(Math.round(px) - 1, y, 3, 3); x.fillRect(Math.round(px), y + 3, 1, 2);
    }
    // centre caret + distance to the nearest marker
    x.fillStyle = P.warn; x.fillRect(79, y + 17, 3, 1); x.fillRect(80, y + 16, 1, 1);
    if (marks.length) {
      let best = Infinity; for (const m of marks) best = Math.min(best, Math.hypot(m.x - lp.x, m.z - lp.z));
      if (best < 9999) text(x, `${Math.round(best)}M`, 128, y + 17, P.mid);
    }
    const bn = g.biomeName?.(lp.x, lp.z) ?? '';
    text(x, bn, 4, y + 17, P.mid, 1, 90);
  }
  // ---------------------------------------------------------------- line the HTML screen up with the 3D one
  placeScreen() {
    const ui = this.g.ui, V = this.g.viewmodel;
    const el = ui?.pda;
    if (!el) return;
    const W = 640, H = 480;
    const fp = V.visible() && V.raise > 0.02;
    el.classList.toggle('flat', !fp);
    if (!fp) {
      // no hands to hold it (in the van, etc.): show it flat in the middle of the screen
      const s = Math.min(innerWidth * 0.94 / W, innerHeight * 0.94 / H);
      el.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - H * s) / 2}px) scale(${s})`;
      el.style.opacity = 1;
      return;
    }
    const q = V.screenQuad(this._q ?? (this._q = []));
    el.style.transform = quadMatrix(W, H, q);
    el.style.opacity = Math.max(0, Math.min(1, (V.raise - 0.82) / 0.15));
  }
}

// CSS matrix3d that maps a W x H box onto four screen points (homography)
function quadMatrix(w, h, q) {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q;
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
  const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
  const g = (sx * dy2 - dx2 * sy) / den, hh = (dx1 * sy - sx * dy1) / den;
  const a = x1 - x0 + g * x1, b = x3 - x0 + hh * x3, c = x0;
  const d = y1 - y0 + g * y1, e = y3 - y0 + hh * y3, f = y0;
  // scale the unit square to the box
  const m = [a / w, d / w, 0, g / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, c, f, 0, 1];
  return `matrix3d(${m.map((v) => +v.toFixed(8)).join(',')})`;
}

// what Professor Nubbins says when a chapter starts
const PROF_LINES = {
  'Crash Landing': 'First things first: get inside the van, find the scanner in the glovebox and get some power back. The battery is flat as a pancake. A dinosaur pancake.',
  'Stone Age Starter Pack': 'You need tools, a fire and a place to sleep. Punch bushes, chop trees, smash rocks. Very scientific.',
  'Home Sweet Hut': 'Nights here are long and LOUD. Build a proper shelter before something with teeth finds you.',
  'Science, Mostly': 'Use the van computer. Scan EVERYTHING. Plants, rocks, the creatures, their poop. Science is mostly poop.',
  'Dino Whisperer': 'Make a friend! Study a creature, then knock it out or win it over and feed it what it likes.',
  'Space Metal': 'There is iron in the meteor crater. Smelt it and we can build real machines.',
  'Get The Van Rolling': 'The van needs repairs and fuel. Yes, the fuel is dung. I do not make the rules. Well, I did make that one.',
  'Power Up': 'Electricity! Comfort! Crazy inventions! Bolt things onto the van.',
  'The Time Machine': 'Five parts stand between you and home. Find them, build them, install them.',
  'Going Home?': 'Full battery, CHRONO on, everyone inside. Pull the lever. What could go wrong?',
};

export async function install(g) {
  const D = new Device(g);
  g.addSystem(D);
  // keep the professor's messages in the save
  g.saveables.device = { save: () => ({ msgs: D.msgs.slice(0, 40) }), load: (d) => { if (d?.msgs) { D.msgs = d.msgs; D.unread = 0; } } };
  void THREE;
  return D;
}
