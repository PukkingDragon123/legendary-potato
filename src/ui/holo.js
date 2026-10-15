// The CHRONO-LINK: the hologram interface projected from the wrist gadget of
// your space-time suit. It replaces the old Pocket Prof. A light holographic
// HUD (vitals, loadout, compass, tasks, notices, what you are looking at)
// floats at the edges of your view, Timmy the robot talks to you through a
// dialogue box with his own pixel-art face, and Tab projects the full screens
// (Timmy's log, pack, crafting, pals, dex, map) as a hologram in front of you.
//
// Everything is pixel art drawn in code at load: the 9-slice frames of panels,
// buttons, slots and key caps (handed to the CSS as data URLs), Timmy's face
// and its expressions, and the little icons.
//
// The object also answers to g.device, so older systems that send messages,
// notices and tasks keep working.
import { ITEMS } from '../data/items.js';

// ------------------------------------------------------------------ palette
export const HC = {
  ink: '#02080c', deep: '#06202b', deep2: '#0a3442', line: '#1f8fa8', mid: '#3fd0e8', hi: '#8ff4ff', top: '#e6feff',
  warn: '#ffcf5a', bad: '#ff6a5a', good: '#8affa0', violet: '#c08aff',
};
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// ------------------------------------------------------------------ pixel frames (9-slice)
// c: corner size in pixels; the image is 3c x 3c and the CSS slices it at c.
function frame({ c = 6, fill, edge, hi, shade, corner, chamfer = 2, notch = false, glowFill = null }) {
  const S = c * 3;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const inside = (px, py) => {
    // chamfered corners: cut a stepped triangle off each corner
    const dx = Math.min(px, S - 1 - px), dy = Math.min(py, S - 1 - py);
    return dx + dy >= chamfer;
  };
  const edgeAt = (px, py) => inside(px, py) && (!inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py - 1) || !inside(px, py + 1) || px === 0 || py === 0 || px === S - 1 || py === S - 1);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    if (!inside(px, py)) continue;
    let col = fill;
    if (glowFill && (px === 1 || py === 1 || px === S - 2 || py === S - 2)) col = glowFill;
    if (edgeAt(px, py)) col = edge;
    else if (hi && (py === 1 || px === 1) && !edgeAt(px, py)) col = hi;
    else if (shade && (py === S - 2 || px === S - 2)) col = shade;
    if (!col) continue;
    x.fillStyle = col; x.fillRect(px, py, 1, 1);
  }
  // bright corner brackets
  if (corner) {
    x.fillStyle = corner;
    for (const [ax, ay, sx, sy] of [[0, 0, 1, 1], [S - 1, 0, -1, 1], [0, S - 1, 1, -1], [S - 1, S - 1, -1, -1]]) {
      for (let i = chamfer; i < c; i++) { x.fillRect(ax + sx * i, ay + sy * Math.max(0, chamfer - i), 1, 1); x.fillRect(ax + sx * Math.max(0, chamfer - i), ay + sy * i, 1, 1); }
      for (let i = 0; i <= chamfer; i++) x.fillRect(ax + sx * i, ay + sy * (chamfer - i), 1, 1);
    }
  }
  // a notch tick in the middle of the top and bottom edges
  if (notch) { x.fillStyle = corner ?? edge; x.fillRect(c, 0, c, 1); x.fillRect(c, S - 1, c, 1); }
  return cv.toDataURL();
}
let _framesDone = false;
export function installPixelFrames() {
  if (_framesDone) return;
  _framesDone = true;
  const R = document.documentElement.style;
  const set = (k, v) => R.setProperty(k, `url(${v})`);
  set('--fr-panel', frame({ c: 6, fill: rgba(HC.deep, 0.8), edge: HC.mid, hi: rgba(HC.hi, 0.35), shade: rgba(HC.ink, 0.5), corner: HC.top, chamfer: 3, notch: true }));
  set('--fr-panel-lite', frame({ c: 5, fill: rgba(HC.deep, 0.55), edge: rgba(HC.mid, 0.85), hi: rgba(HC.hi, 0.2), corner: HC.hi, chamfer: 2 }));
  set('--fr-btn', frame({ c: 5, fill: rgba(HC.deep2, 0.85), edge: HC.mid, hi: rgba(HC.hi, 0.45), shade: rgba(HC.ink, 0.6), chamfer: 2 }));
  set('--fr-btn-hot', frame({ c: 5, fill: rgba(HC.mid, 0.9), edge: HC.top, hi: HC.top, shade: rgba(HC.line, 0.9), chamfer: 2 }));
  set('--fr-btn-warn', frame({ c: 5, fill: rgba('#4a3606', 0.85), edge: HC.warn, hi: rgba('#fff0b0', 0.5), shade: rgba(HC.ink, 0.6), chamfer: 2 }));
  set('--fr-slot', frame({ c: 5, fill: rgba(HC.ink, 0.55), edge: rgba(HC.mid, 0.7), shade: rgba(HC.hi, 0.12), chamfer: 2 }));
  set('--fr-slot-sel', frame({ c: 5, fill: rgba(HC.deep2, 0.75), edge: HC.top, hi: rgba(HC.hi, 0.6), corner: HC.warn, chamfer: 2, glowFill: rgba(HC.mid, 0.45) }));
  set('--fr-slot-tool', frame({ c: 6, fill: rgba(HC.ink, 0.6), edge: HC.warn, hi: rgba('#fff0b0', 0.3), corner: '#fff6d0', chamfer: 3 }));
  set('--fr-key', frame({ c: 4, fill: HC.top, edge: HC.ink, shade: '#7ab8c8', chamfer: 1 }));
  set('--fr-chip', frame({ c: 4, fill: rgba(HC.deep, 0.7), edge: rgba(HC.mid, 0.6), chamfer: 1 }));
  set('--fr-talk', frame({ c: 7, fill: rgba(HC.deep, 0.86), edge: HC.mid, hi: rgba(HC.hi, 0.3), shade: rgba(HC.ink, 0.55), corner: HC.warn, chamfer: 3, notch: true }));
  set('--fr-bar', frame({ c: 3, fill: rgba(HC.ink, 0.7), edge: rgba(HC.mid, 0.8), chamfer: 1 }));
}

// ------------------------------------------------------------------ Timmy's face (pixel art)
// A white-and-orange ball robot with one big camera eye. Expressions:
// normal, happy, surprised, worried, scan, sleepy, angry, love.
const TIMMY_SIZE = 40;
export function drawTimmy(ctx, o = {}) {
  const S = TIMMY_SIZE;
  const expr = o.expr ?? 'normal', blink = o.blink ?? 0, lx = o.lx ?? 0, ly = o.ly ?? 0, t = o.t ?? 0, talk = o.talk ?? 0;
  ctx.clearRect(0, 0, S, S);
  const px = (a, b, w = 1, h = 1, col) => { ctx.fillStyle = col; ctx.fillRect(a, b, w, h); };
  const disc = (cx, cy, r, col) => { ctx.fillStyle = col; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y) + 0.35); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); } };
  const bob = Math.round(Math.sin(t * 2.4) * 1);
  const cx = 20, cy = 21 + bob;
  // antenna with a blinking bulb
  px(cx, cy - 18, 1, 5, '#7a8a94');
  px(cx - 1, cy - 20, 3, 2, Math.sin(t * 5) > 0 ? HC.warn : '#a07a20');
  // body: shaded white sphere with an orange equator band and panel lines
  disc(cx, cy, 14, '#1a2a33');
  disc(cx, cy, 13, '#c8d2d8');
  disc(cx - 2, cy - 2, 11, '#e6edf0');
  disc(cx - 4, cy - 5, 5, '#ffffff');
  for (let y = -2; y <= 2; y++) { const w = Math.floor(Math.sqrt(169 - (y + 4) * (y + 4))); px(cx - w, cy + 4 + y, w * 2 + 1, 1, y === -2 ? '#ffb070' : y === 2 ? '#a8501c' : '#f07a2a'); }
  px(cx - 13, cy + 4, 2, 1, '#1a2a33'); px(cx + 12, cy + 4, 2, 1, '#1a2a33');
  // ear thrusters
  for (const sx of [-1, 1]) { px(cx + sx * 14 - (sx < 0 ? 2 : 0), cy - 3, 3, 6, '#5a6a74'); px(cx + sx * 14 - (sx < 0 ? 2 : 0), cy - 2, 3, 1, '#9aa8b0'); px(cx + sx * 15 - (sx < 0 ? 1 : 0), cy + 3, 1, 1 + (Math.sin(t * 20 + sx) > 0 ? 1 : 0), HC.mid); }
  // the eye: a dark bezel, a glowing iris and a pupil that looks around
  const ex = cx + Math.round(lx * 2), ey = cy - 3 + Math.round(ly * 2);
  disc(cx, cy - 3, 8, '#0b1418');
  disc(cx, cy - 3, 7, '#14262e');
  const iris = expr === 'angry' ? HC.bad : expr === 'love' ? '#ff7ab0' : expr === 'scan' ? HC.good : HC.mid;
  const lid = Math.max(blink, expr === 'sleepy' ? 0.55 : 0);
  if (expr === 'happy') {
    // ^ ^ shaped eye
    for (let i = -4; i <= 4; i++) { const yy = ey + 1 - (4 - Math.abs(i)); px(ex + i, yy, 1, 2, iris); }
  } else if (lid > 0.85) {
    px(ex - 5, ey, 11, 1, iris);
  } else {
    const r = expr === 'surprised' ? 6 : 5;
    disc(ex, ey, r, iris);
    disc(ex, ey, r - 2, expr === 'love' ? '#ffd0e4' : HC.hi);
    if (expr === 'love') { px(ex - 2, ey - 1, 2, 2, '#ff4a8a'); px(ex + 1, ey - 1, 2, 2, '#ff4a8a'); px(ex - 1, ey + 1, 3, 1, '#ff4a8a'); px(ex, ey + 2, 1, 1, '#ff4a8a'); }
    else disc(ex, ey, expr === 'surprised' ? 1 : 2, '#06141a');
    px(ex - 3, ey - 3, 2, 1, '#ffffff'); px(ex - 3, ey - 2, 1, 1, '#ffffff');
    // lids: the upper one drops for worried/sleepy/angry
    const cut = expr === 'worried' ? 2 : expr === 'angry' ? 3 : 0;
    const lidRows = Math.round(lid * 9) + cut;
    for (let i = 0; i < lidRows; i++) {
      const tilt = expr === 'angry' ? 1 : expr === 'worried' ? -1 : 0;
      for (let k = -7; k <= 7; k++) { const yy = cy - 11 + i + Math.round(k * tilt * 0.25); px(cx + k, yy, 1, 1, '#14262e'); }
    }
  }
  // scan beam lines across the eye
  if (expr === 'scan') { const sy = cy - 9 + Math.floor((t * 24) % 12); px(cx - 7, sy, 15, 1, rgba(HC.good, 0.9)); }
  // a little speaker grille that flickers when he talks
  for (let i = 0; i < 5; i++) px(cx - 4 + i * 2, cy + 9, 1, 1 + (talk > 0 && Math.sin(t * 30 + i * 1.7) > 0 ? 1 : 0), talk > 0 ? HC.mid : '#7a8a94');
}
export function timmyPortraitURL(expr = 'happy') {
  const c = document.createElement('canvas'); c.width = c.height = TIMMY_SIZE;
  drawTimmy(c.getContext('2d'), { expr, t: 0.3 });
  return c.toDataURL();
}

// ------------------------------------------------------------------ what Timmy says when a chapter starts
const TIMMY_LINES = {
  'First Steps': '', // the tutorial does the talking
  'Crash Landing': 'Rule one of time travel: get the van powered up. Find the scanner in the glovebox and crank that battery.',
  'Stone Age Starter Pack': 'Tools, fire, a place to sleep. Smack trees, smash rocks, collect EVERYTHING. I will be supervising. Loudly.',
  'Home Sweet Hut': 'Nights here are long and full of teeth. Build a shelter before something decides you are a snack.',
  'Science, Mostly': 'Scan everything! Plants, rocks, creatures, their poop. My databanks are hungry.',
  'Critter Whisperer': 'Make a friend: knock a creature out, then feed it the treat it likes best. That is the official capture protocol. I wrote it just now.',
  'Space Metal': 'There is meteor iron in the crater. Smelt it and we can build real machines.',
  'Get The Van Rolling': 'The van needs parts and fuel. Oil seeps out of the ground here and there. Find a vein and fill her up.',
  'Power Up': 'Electricity! Gadgets! Bolt things onto the van until it looks like a science fair.',
  'The Time Machine': 'Five parts stand between us and home. Find them, build them, install them.',
  'Going Home?': 'Full battery, CHRONO on, everyone inside. Pull the lever. What could possibly go wrong?',
};

// ------------------------------------------------------------------ the system
const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

export class Holo {
  constructor(game) {
    this.name = 'holo';
    this.g = game;
    installPixelFrames();
    // the old device's fields, still read by the screens
    this.raised = false; this.peek = false; this.alert = false;
    this.notices = []; this.msgs = []; this.unread = 0;
    this.tasks = null; this.target = null; this.signal = 0.8;
    this.t = 0;
    this.portrait = timmyPortraitURL('happy');
    // dialogue queue
    this.queue = []; this.line = null; this.face = { expr: 'normal', blink: 0, blinkT: 2, lx: 0, ly: 0 };
    game.device = this; game.holo = this;
    document.body.classList.add('holo');
    this.build();
    this.hookUI();
    this.hookEvents();
  }
  build() {
    const root = this.g.ui?.root ?? document.body;
    const talk = h('div', 'holo-talk hidden');
    talk.innerHTML = '<div class="ht-face"><canvas width="40" height="40"></canvas></div><div class="ht-body"><div class="ht-name">TIMMY</div><div class="ht-title"></div><div class="ht-text"></div><div class="ht-more">TAB: LOG</div></div>';
    (this.g.ui?.hud ?? root).appendChild(talk);
    this.el = { talk, face: talk.querySelector('canvas'), title: talk.querySelector('.ht-title'), text: talk.querySelector('.ht-text') };
    this.faceCtx = this.el.face.getContext('2d');
  }
  // ---------------------------------------------------------------- messages
  notice(textS, kind = '') {
    const s = String(textS).trim();
    if (!s) return;
    const last = this.notices[this.notices.length - 1];
    if (last && last.text === s && this.t - last.at < 2) { last.at = this.t; return; }
    this.notices.push({ text: s, at: this.t, kind });
    if (this.notices.length > 6) this.notices.shift();
    this._toast?.(s, kind);
  }
  // Timmy says something: it is typed out in the dialogue box and kept in the log
  message(title, body, opt = {}) {
    const m = { id: 'm' + Date.now() + Math.random(), title: String(title), body: String(body ?? ''), from: opt.from ?? 'TIMMY', day: this.g.time?.day ?? 1, read: false, kind: opt.kind ?? 'msg', expr: opt.expr };
    this.msgs.unshift(m);
    if (this.msgs.length > 60) this.msgs.pop();
    this.unread++;
    this.alert = true;
    if (!opt.quiet) this.say(m.body || m.title, { title: m.body ? m.title : '', expr: opt.expr ?? guessExpr(m), from: m.from, hold: opt.peek });
    if (this.g.ui?.pda && this.g.ui.pdaTab === 'comms') this.g.ui.showTab('comms');
    return m;
  }
  say(text, opt = {}) {
    const line = { text: String(text).replace(/\s+/g, ' ').trim(), title: opt.title ?? '', expr: opt.expr ?? 'normal', from: opt.from ?? 'TIMMY', hold: opt.hold, onDone: opt.onDone, tag: opt.tag };
    // a newer line with the same tag replaces a stale one (the tutorial moving on)
    if (opt.tag) { this.queue = this.queue.filter((l) => l.tag !== opt.tag); if (this.line?.tag === opt.tag && this.line.shown >= this.line.text.length) this.line.hold = Math.min(this.line.hold, 0.4); }
    if (opt.now) { this.queue.length = 0; this.line = null; }
    this.queue.push(line);
    while (this.queue.length > 4) this.queue.shift();
  }
  beep(n = 1, rate = 1.6) {
    const a = this.g.audio;
    if (!a || n <= 0) return;
    for (let i = 0; i < n; i++) setTimeout(() => a.play('ui_tick', { vol: 0.35, rate: rate + i * 0.25 }), i * 110);
  }
  // ---------------------------------------------------------------- reroute the old HUD calls
  hookUI() {
    const g = this.g, ui = g.ui;
    if (!ui) return;
    const toast = ui.toast.bind(ui);
    this._toast = (s, kind) => toast(s, kind);
    ui.toast = (txt, kind = '', icon = null, dur) => { this.notices.push({ text: String(txt), at: this.t, kind }); if (this.notices.length > 6) this.notices.shift(); toast(txt, kind, icon, dur); };
    const setObjective = ui.setObjective.bind(ui);
    ui.setObjective = (o) => { setObjective(o); this.setTasks(o); };
    const setTarget = ui.setTarget.bind(ui);
    ui.setTarget = (t) => { this.target = t; setTarget(t); };
    const scanCard = ui.scanCard.bind(ui);
    ui.scanCard = (d, first) => { scanCard(d, first); if (first) this.say(d.fact, { title: 'NEW SCAN: ' + d.title, expr: 'scan' }); };
  }
  setTasks(o) {
    const prev = this.tasks;
    this.tasks = o;
    if (!o) return;
    if (!prev || prev.title !== o.title) {
      const ch = o.chapter ?? '';
      const intro = TIMMY_LINES[o.title] ?? 'New orders! Check the task list.';
      if (!intro) return;
      if (this.g.titleMode) { this._pendingChapter = { ch, o, intro }; return; }
      this.message(`${ch}: ${o.title}`, intro, { expr: 'happy' });
    }
  }
  hookEvents() {
    const g = this.g, E = g.events;
    E.on('started', () => {
      if (g.skipGreeting) return;
      setTimeout(() => {
        if (!g.cinematic) this.message('CHRONO-LINK ONLINE', 'Hello, boss! Timmy here, your friendly floating science robot. Press TAB to open the Chrono-Link: my log, your pack, crafting, pals, the dex and the map.', { expr: 'happy' });
        if (this._pendingChapter) { const { ch, o, intro } = this._pendingChapter; this._pendingChapter = null; setTimeout(() => this.message(`${ch}: ${o.title}`, intro, { expr: 'happy' }), 6000); }
      }, 1500);
    });
    E.on('damaged', ({ amount }) => { if (amount > 25) { this.notice('OUCH! BIG HIT', 'warn'); this.face.expr = 'worried'; this.face.hold = 1.5; } });
    E.on('downed', () => this.message('BOSS?!', 'You are knocked flat! Hang on, your friends can revive you, or you will wake up back at camp.', { expr: 'worried' }));
  }
  // ---------------------------------------------------------------- per frame
  update(dt) {
    const g = this.g;
    this.t += dt;
    if (this.raised && this.g.ui?.pdaTab === 'comms') { this.unread = 0; this.alert = false; for (const m of this.msgs) m.read = true; }
    // dialogue: type the current line out, hold it, then move on
    const L = this.el;
    if (!this.line && this.queue.length) {
      this.line = this.queue.shift();
      this.line.shown = 0; this.line.hold = this.line.hold ?? Math.min(9, 2.4 + this.line.text.length / 22);
      L.talk.classList.remove('hidden', 'out');
      L.title.textContent = this.line.title;
      L.title.style.display = this.line.title ? '' : 'none';
      L.talk.querySelector('.ht-name').textContent = this.line.from;
      L.text.textContent = '';
      this.face.expr = this.line.expr;
      this.beep(1, 2.2);
    }
    const ln = this.line;
    let talking = 0;
    if (ln) {
      if (ln.shown < ln.text.length) {
        const before = Math.floor(ln.shown);
        ln.shown = Math.min(ln.text.length, ln.shown + dt * 48);
        const now = Math.floor(ln.shown);
        if (now !== before) {
          L.text.textContent = ln.text.slice(0, now);
          if (Math.floor(now / 3) !== Math.floor(before / 3) && /\w/.test(ln.text[now - 1] ?? '')) g.audio?.play('ui_tick', { vol: 0.12, rate: 2.4 + Math.random() * 0.6 });
        }
        talking = 1;
      } else {
        ln.hold -= dt;
        if (ln.hold <= 0) {
          ln.onDone?.();
          this.line = null;
          if (!this.queue.length) { L.talk.classList.add('out'); clearTimeout(this._hideT); this._hideT = setTimeout(() => { if (!this.line) L.talk.classList.add('hidden'); }, 350); }
        }
      }
    }
    // Timmy's face: blinks, glances, expression
    const F = this.face;
    F.blinkT -= dt;
    if (F.blinkT <= 0) { F.blink = 1; F.blinkT = 2 + Math.random() * 3; }
    F.blink = Math.max(0, F.blink - dt * 7);
    if (F.hold > 0) { F.hold -= dt; if (F.hold <= 0 && !this.line) F.expr = 'normal'; }
    F.lx += ((Math.sin(this.t * 0.7) * 0.8) - F.lx) * Math.min(1, dt * 3);
    F.ly += ((Math.sin(this.t * 0.45) * 0.4) - F.ly) * Math.min(1, dt * 3);
    if (!L.talk.classList.contains('hidden')) drawTimmy(this.faceCtx, { expr: F.expr, blink: F.blink > 0.5 ? 1 : 0, lx: F.lx, ly: F.ly, t: this.t, talk: talking });
    // while a screen is open the talk box steps aside
    L.talk.classList.toggle('dim', !!this.g.ui?.pda);
  }
  lateUpdate() { this.placeScreen(); }
  // the projected screen: centred, scaled to fit, tilted a touch like a hologram
  placeScreen() {
    const el = this.g.ui?.pda;
    if (!el) return;
    const W = 860, H = 540;
    const s = Math.min(innerWidth * 0.96 / W, innerHeight * 0.9 / H);
    el.style.transform = `translate(${(innerWidth - W * s) / 2}px, ${(innerHeight - H * s) / 2 - innerHeight * 0.02}px) scale(${s})`;
  }
}
function guessExpr(m) {
  const s = (m.title + ' ' + m.body).toLowerCase();
  if (/ouch|danger|careful|knocked|hurt|warning|!!/.test(s)) return 'worried';
  if (/scan|data|analy/.test(s)) return 'scan';
  if (/great|nice|yes|well done|eureka|new|unlocked|ready/.test(s)) return 'happy';
  return 'normal';
}

export async function install(g) {
  const H = new Holo(g);
  g.addSystem(H);
  g.saveables.device = { save: () => ({ msgs: H.msgs.slice(0, 40) }), load: (d) => { if (d?.msgs) { H.msgs = d.msgs; H.unread = 0; } } };
  void ITEMS;
  return H;
}
