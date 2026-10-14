// Loading screen + title screen + character customiser.
import { PRESETS, OPTIONS, SKIN_TONES } from '../entities/character.js';

const TIPS = [
  'Tip: Punching trees works. It just takes a while and hurts a bit.',
  'Tip: Snoozeberries keep knocked-out dinos asleep while you feed them.',
  'Tip: Study a dino with binoculars to learn its favourite snack.',
  'Tip: The van runs on Dung-o-Diesel. Do not ask how we found out.',
  'Tip: Raptors hate bright light. Build lamps. Lots of lamps.',
  'Tip: Carry downed friends back to the van to revive them faster.',
  'Tip: Compys will steal food from your campfire. Little monsters.',
  'Tip: Rain fills your Rain Catchers with clean water.',
  'Tip: Research at the van computer unlocks new tech. Science!',
  'Tip: The Chrono-Scanner can read footprints. Follow the trail!',
  'Fact: Nobody knows how the time machine works. Least of all us.',
  'Fact: Triceratops is grumpy before breakfast. And after.',
];

function vanPixelArt() {
  const c = document.createElement('canvas'); c.width = 48; c.height = 24; c.className = 'van';
  const x = c.getContext('2d');
  const R = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  R('#17130e', 4, 4, 40, 15); R('#e8dcc0', 5, 5, 38, 7); R('#3a9a9a', 5, 12, 38, 6); R('#f2b630', 5, 11, 38, 1);
  R('#7ac8e0', 7, 6, 7, 5); R('#7ac8e0', 16, 6, 8, 5); R('#7ac8e0', 27, 6, 8, 5); R('#7ac8e0', 37, 6, 5, 4);
  R('#17130e', 9, 18, 7, 5); R('#17130e', 32, 18, 7, 5); R('#a8adb4', 11, 19, 3, 3); R('#a8adb4', 34, 19, 3, 3);
  R('#8a5a3a', 14, 2, 18, 2); R('#e8614f', 2, 13, 2, 2); R('#fff2a0', 44, 12, 2, 2);
  return c;
}

export class Loading {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'loading';
    this.el.innerHTML = `<div class="logo" style="font-size:44px;letter-spacing:3px">PREHIST<span style="color:var(--sun)">O</span>RIC</div>`;
    this.van = vanPixelArt();
    this.van.style.width = '192px'; this.van.style.height = '96px';
    this.el.appendChild(this.van);
    this.bar = document.createElement('div'); this.bar.className = 'lbar'; this.fill = document.createElement('i'); this.bar.appendChild(this.fill);
    this.el.appendChild(this.bar);
    this.msg = document.createElement('div'); this.msg.className = 'msg'; this.el.appendChild(this.msg);
    this.tip = document.createElement('div'); this.tip.className = 'tip'; this.el.appendChild(this.tip);
    document.body.appendChild(this.el);
    this.tipIdx = Math.floor(Math.random() * TIPS.length);
    this.tip.textContent = TIPS[this.tipIdx];
    this.tipT = setInterval(() => { this.tipIdx = (this.tipIdx + 1) % TIPS.length; this.tip.textContent = TIPS[this.tipIdx]; }, 4200);
    let f = 0;
    this.anim = setInterval(() => { f++; this.van.style.transform = `translateY(${f % 2 ? 2 : 0}px)`; }, 160);
    this.set(0, 'Warming up the flux capacitor');
  }
  set(p, msg) { this.fill.style.width = `calc(${Math.round(p * 100)}% - 6px)`; if (msg) this.msg.textContent = msg + '…'; }
  done() { clearInterval(this.tipT); clearInterval(this.anim); this.el.style.transition = 'opacity 0.6s'; this.el.style.opacity = 0; setTimeout(() => this.el.remove(), 650); }
}

export class Title {
  constructor(root, opt) {
    this.opt = opt;
    this.el = document.createElement('div');
    this.el.id = 'title';
    this.el.innerHTML = `<div class="logo">PREHIST<span>O</span>RIC</div><div class="tag shadow-text">You built a time machine in a van. It worked. Sort of. Survive, tame dinosaurs, build a base and fix the van before something eats you.</div>`;
    const m = document.createElement('div'); m.className = 'menu px';
    this.menu = m;
    this.el.appendChild(m);
    const ver = document.createElement('div'); ver.className = 'ver'; ver.textContent = 'V0.9 · MADE OF 100% PROCEDURAL PIXELS · NO DINOSAURS WERE HARMED';
    this.el.appendChild(ver);
    root.appendChild(this.el);
    this.main();
  }
  btn(label, fn, cls = '') { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = () => { this.opt.click?.(); fn(); }; this.menu.appendChild(b); return b; }
  clear(title) { this.menu.innerHTML = title ? `<h2>${title}</h2>` : ''; }
  main() {
    this.clear();
    if (this.opt.hasSave) this.btn('Continue Expedition', () => this.opt.onStart({ mode: 'continue', host: !!this.opt.serverAvailable }), 'primary');
    this.btn(this.opt.hasSave ? 'New Expedition' : 'Start Expedition', () => this.newGame(), this.opt.hasSave ? '' : 'primary');
    this.btn('Join Friends', () => this.join());
    this.btn('Customise Explorer', () => this.customise());
    this.btn('How to Play', () => this.help());
  }
  newGame() {
    this.clear('New Expedition');
    const name = this.field('Your name', this.opt.profile.name);
    const host = document.createElement('label'); host.innerHTML = '<span>Host co-op room</span>';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!this.opt.serverAvailable; cb.disabled = !this.opt.serverAvailable; host.appendChild(cb); this.menu.appendChild(host);
    if (!this.opt.serverAvailable) this.menu.insertAdjacentHTML('beforeend', '<div class="small">Co-op needs the game server (npm start). Playing solo.</div>');
    this.btn('Begin!', () => { this.opt.profile.name = name.value.trim() || 'Explorer'; this.opt.onStart({ mode: 'new', host: cb.checked }); }, 'primary');
    this.btn('Back', () => this.main());
  }
  join() {
    this.clear('Join Friends');
    const name = this.field('Your name', this.opt.profile.name);
    const code = this.field('Room code', '');
    code.style.textTransform = 'uppercase';
    if (!this.opt.serverAvailable) this.menu.insertAdjacentHTML('beforeend', '<div class="small">No server detected. Run the game with "npm start" and open the address it prints.</div>');
    this.btn('Join', () => { this.opt.profile.name = name.value.trim() || 'Explorer'; this.opt.onStart({ mode: 'join', code: code.value.trim().toUpperCase() }); }, 'primary');
    this.btn('Back', () => this.main());
  }
  field(label, val) { const l = document.createElement('label'); l.innerHTML = `<span>${label}</span>`; const i = document.createElement('input'); i.type = 'text'; i.value = val ?? ''; i.maxLength = 16; l.appendChild(i); this.menu.appendChild(l); return i; }
  customise() {
    this.clear('Customise Explorer');
    const prof = this.opt.profile;
    const row = (label, key, opts, fmt = (v) => v) => {
      const l = document.createElement('label'); l.innerHTML = `<span>${label}</span>`;
      const wrap = document.createElement('span');
      const prev = document.createElement('button'); prev.className = 'btn'; prev.textContent = '<'; prev.style.cssText = 'width:auto;padding:4px 10px;margin:0 4px';
      const val = document.createElement('span'); val.style.minWidth = '110px'; val.style.display = 'inline-block'; val.style.textAlign = 'center';
      const next = prev.cloneNode(); next.textContent = '>';
      const upd = () => { val.textContent = fmt(prof.outfit[key]); this.opt.onPreview?.(prof.outfit); };
      const step = (d) => { const i = opts.indexOf(prof.outfit[key]); prof.outfit[key] = opts[(i + d + opts.length) % opts.length]; upd(); this.opt.click?.(); };
      prev.onclick = () => step(-1); next.onclick = () => step(1);
      wrap.append(prev, val, next); l.appendChild(wrap); this.menu.appendChild(l); upd();
    };
    const presetRow = document.createElement('div'); presetRow.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap';
    PRESETS.forEach((p) => { const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'width:auto;font-size:15px;padding:5px 9px'; b.textContent = p.name; b.onclick = () => { prof.outfit = { ...p }; this.customise(); this.opt.onPreview?.(prof.outfit); }; presetRow.appendChild(b); });
    this.menu.appendChild(presetRow);
    const nice = (s) => (s ?? 'none').replace(/^./, (c) => c.toUpperCase());
    row('Hat', 'hat', OPTIONS.hat, nice);
    row('Shirt', 'top', OPTIONS.top, nice);
    row('Over', 'overlay', OPTIONS.overlay, nice);
    row('Legs', 'bottom', OPTIONS.bottom, nice);
    row('Pack', 'pack', OPTIONS.pack, nice);
    row('Extra', 'extra', OPTIONS.extra, nice);
    row('Skin', 'skin', SKIN_TONES.map((_, i) => i), (v) => `Tone ${v + 1}`);
    row('Nose', 'nose', [0, 1, 2, 3], (v) => ['Rosy', 'Button', 'Pink', 'Sunburnt'][v]);
    this.btn('Done', () => { this.opt.onSaveProfile?.(prof); this.main(); this.opt.onPreview?.(null); }, 'primary');
    this.opt.onPreview?.(prof.outfit);
  }
  help() {
    this.clear('How to Play');
    this.menu.insertAdjacentHTML('beforeend', `<div style="font-size:15px;line-height:20px">
      <p>You and your friends crashed a homemade time-machine van 66 million years ago.</p>
      <p><b>Survive</b>: eat, drink, sleep, stay warm. <b>Gather</b>: punch bushes, chop trees, mine rocks. <b>Craft</b> in your CHRONO-PAL (Tab).</p>
      <p><b>Build</b> a base with the hammer (B). <b>Tame</b> dinosaurs: study, knock out or befriend, then feed them what they like.</p>
      <p><b>Research</b> at the van computer to unlock tech and repair the time machine. Then go home. Maybe.</p></div>`);
    this.btn('Back', () => this.main());
  }
  close() { this.el.style.transition = 'opacity 0.5s'; this.el.style.opacity = 0; setTimeout(() => this.el.remove(), 520); }
}
