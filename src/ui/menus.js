// Loading screen + the main menu (laid over the lab scene, see world/lab.js)
// + the wardrobe: colours and fabrics are free, gear unlocks with achievements.
import { PRESETS, PALETTE, TEETH, FABRIC_IDS, normalizeOutfit } from '../entities/character.js';
import { FABRICS } from '../entities/humanModel.js';
import { ACCESSORIES, ACC_SLOTS, isUnlocked } from '../entities/accessories.js';
import { ACH } from '../systems/journal.js';

const TIPS = [
  'Tip: Punching trees works. It just takes a while and hurts a bit.',
  'Tip: Snoozeberries keep knocked-out critters asleep while you feed them.',
  'Tip: Study a critter with binoculars to learn its favourite snack.',
  'Tip: The van runs on Dung-o-Diesel. Do not ask how we found out.',
  'Tip: Voltfangs hate bright light. Build lamps. Lots of lamps.',
  'Tip: Carry downed friends back to the van to revive them faster.',
  'Tip: Snatchets will steal food from your campfire. Little monsters.',
  'Tip: Rain fills your Rain Catchers with clean water.',
  'Tip: Research at the van computer unlocks new tech. Science!',
  'Tip: The Chrono-Scanner can read footprints. Follow the trail!',
  'Tip: Bait a Snare Trap with a critter\'s favourite food, then hide behind a tree.',
  'Tip: Critter dung feeds your crops AND your van. Nature is beautiful.',
  'Tip: Old Gnasher\'s stomp has a long reach. Do not stand still near him.',
  'Tip: Big Momma dives. Watch the water. Then watch the other water.',
  'Tip: Stampedes go around rocks, not around you.',
  'Fact: Nobody knows how the time machine works. Least of all us.',
  'Fact: Grumblets are grumpy before breakfast. And after.',
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

const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };
const hex = (v) => '#' + (v >>> 0).toString(16).padStart(6, '0');
const ACH_BY_ID = Object.fromEntries(ACH.map(([id, title, text]) => [id, { title, text }]));

// a little swatch of each fabric's weave, drawn in pixels
function fabricSwatch(id, col) {
  const c = document.createElement('canvas'); c.width = c.height = 24;
  const x = c.getContext('2d');
  const base = hex(col);
  x.fillStyle = base; x.fillRect(0, 0, 24, 24);
  const dark = 'rgba(0,0,0,0.28)', lite = 'rgba(255,255,255,0.22)';
  const px = (a, b, s) => { x.fillStyle = s; x.fillRect(a, b, 1, 1); };
  for (let j = 0; j < 24; j++) for (let i = 0; i < 24; i++) {
    if (id === 'quilted' && ((i + j) % 8 === 0 || (i - j + 24) % 8 === 0)) px(i, j, dark);
    if (id === 'puffer' && j % 6 === 0) px(i, j, dark); if (id === 'puffer' && j % 6 === 2) px(i, j, lite);
    if (id === 'ripstop' && (i % 6 === 0 || j % 6 === 0)) px(i, j, dark);
    if (id === 'hex' && ((j % 8 === 0 && (i + (j % 16 ? 4 : 0)) % 8 < 4) || ((i + (Math.floor(j / 8) % 2) * 4) % 8 === 0))) px(i, j, dark);
    if (id === 'leather' && ((i * 7 + j * 13) % 11 === 0)) px(i, j, dark);
    if (id === 'canvas' && ((i + j) % 2 === 0)) px(i, j, 'rgba(0,0,0,0.12)');
    if (id === 'nylon' && i === j % 24) px(i, j, lite);
  }
  if (id === 'camo') for (const [a, b, r, s] of [[5, 6, 4, dark], [16, 4, 3, lite], [12, 15, 5, dark], [3, 19, 3, lite], [20, 18, 3, dark]]) { x.fillStyle = s; x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
  return c.toDataURL();
}

export class Title {
  constructor(root, opt) {
    this.opt = opt;
    this.el = el('div'); this.el.id = 'title'; this.el.className = 'lab';
    this.el.innerHTML = `<div class="lab-left"><div class="logo">PREHIST<span>O</span>RIC</div><div class="lab-sub">A CHRONO-VAN EXPEDITION</div><div class="lab-menu"></div></div>
      <div class="lab-hint"><i></i>Click your scientist to customise</div>
      <div class="ver">V1.0 · THE LAB · 66,000,000 YEARS TO GO</div>`;
    this.menu = this.el.querySelector('.lab-menu');
    root.appendChild(this.el);
    this.main();
  }
  btn(label, fn, cls = '', sub = '') {
    const b = el('button', 'lab-btn ' + cls, `<b>${label}</b>${sub ? `<span>${sub}</span>` : ''}`);
    b.onclick = () => { this.opt.click?.(); fn(); };
    this.menu.appendChild(b);
    return b;
  }
  clear(title) { this.menu.innerHTML = title ? `<h2>${title}</h2>` : ''; }
  // the three big buttons
  main() {
    this.closeWardrobe(true);
    this.clear();
    this.btn('HOST', () => this.host(), 'primary', this.opt.hasSave ? 'Continue or start an expedition' : 'Start an expedition, friends can join');
    this.btn('JOIN', () => this.join(), '', 'Hop into a friend\'s expedition');
    this.btn('QUIT', () => this.quit(), 'warn', 'Leave the lab');
    const small = el('div', 'lab-small');
    const how = el('a', '', 'HOW TO PLAY'); how.onclick = () => { this.opt.click?.(); this.help(); };
    const look = el('a', '', 'WARDROBE'); look.onclick = () => { this.opt.click?.(); this.customise(); };
    small.append(how, look);
    this.menu.appendChild(small);
  }
  host() {
    this.clear('HOST AN EXPEDITION');
    const name = this.field('Your name', this.opt.profile.name);
    const row = el('label', 'lab-check'); row.innerHTML = '<span>Open a co-op room</span>';
    const cb = el('input'); cb.type = 'checkbox'; cb.checked = !!this.opt.serverAvailable; cb.disabled = !this.opt.serverAvailable; row.appendChild(cb); this.menu.appendChild(row);
    if (!this.opt.serverAvailable) this.menu.appendChild(el('div', 'small', 'Co-op needs the game server (npm start). Playing solo.'));
    const go = (mode) => { this.opt.profile.name = name.value.trim() || 'Explorer'; this.opt.onStart({ mode, host: cb.checked }); };
    if (this.opt.hasSave) this.btn('CONTINUE', () => go('continue'), 'primary', 'Back to where you left off');
    this.btn(this.opt.hasSave ? 'NEW EXPEDITION' : 'OPEN THE PORTAL', () => go('new'), this.opt.hasSave ? '' : 'primary', 'Fire up the time machine');
    this.btn('BACK', () => this.main(), 'ghost');
  }
  join() {
    this.clear('JOIN FRIENDS');
    const name = this.field('Your name', this.opt.profile.name);
    const code = this.field('Room code', '');
    code.style.textTransform = 'uppercase';
    if (!this.opt.serverAvailable) this.menu.appendChild(el('div', 'small', 'No server detected. Run the game with "npm start" and open the address it prints.'));
    this.btn('JOIN', () => { this.opt.profile.name = name.value.trim() || 'Explorer'; this.opt.onStart({ mode: 'join', code: code.value.trim().toUpperCase() }); }, 'primary');
    this.btn('BACK', () => this.main(), 'ghost');
  }
  quit() {
    const q = el('div', 'lab-quit', '<div><b>SHUTTING DOWN THE LAB...</b><p>The portal powers down. Timmy waves goodbye.<br>You can close this tab now.</p></div>');
    const back = el('button', 'lab-btn', '<b>BACK TO THE LAB</b>'); back.onclick = () => { this.opt.click?.(); q.remove(); };
    q.firstChild.appendChild(back);
    this.el.appendChild(q);
    this.opt.onQuit?.();
    try { window.close(); } catch { /* not a script-opened window */ }
  }
  field(label, val) { const l = el('label', 'lab-field'); l.innerHTML = `<span>${label}</span>`; const i = el('input'); i.type = 'text'; i.value = val ?? ''; i.maxLength = 16; l.appendChild(i); this.menu.appendChild(l); return i; }
  // ---------------------------------------------------------------- the wardrobe (a panel on the right; the lab camera walks up to you)
  customise() {
    const prof = this.opt.profile;
    prof.outfit = normalizeOutfit(prof.outfit);
    this.el.classList.add('wardrobe-on');
    this.opt.onWardrobe?.(true);
    this.clear();
    this.btn('DONE', () => { this.opt.onSaveProfile?.(prof); this.main(); }, 'primary', 'Looking sharp');
    if (!this.ward) { this.ward = el('div', 'wardrobe'); this.el.appendChild(this.ward); }
    this.tab = this.tab ?? 'colours';
    this.renderWardrobe();
  }
  closeWardrobe(quiet) {
    if (!this.ward) return;
    this.ward.remove(); this.ward = null;
    this.el.classList.remove('wardrobe-on');
    if (!quiet) this.opt.click?.();
    this.opt.onWardrobe?.(false);
  }
  renderWardrobe() {
    const W = this.ward, prof = this.opt.profile, o = prof.outfit;
    const preview = () => this.opt.onPreview?.(o);
    W.innerHTML = '<div class="w-head"><b>WARDROBE</b><span>Colours and fabrics are free. Gear unlocks with achievements.</span></div>';
    // presets
    const pr = el('div', 'w-presets');
    for (const p of PRESETS) { const b = el('button', 'w-chip', p.name); b.onclick = () => { this.opt.click?.(); const keep = Object.fromEntries(ACC_SLOTS.map((k) => [k, o[k]])); prof.outfit = normalizeOutfit({ ...p, ...keep }); this.renderWardrobe(); this.opt.onPreview?.(prof.outfit); }; pr.appendChild(b); }
    W.appendChild(pr);
    const tabs = el('div', 'w-tabs');
    for (const [k, label] of [['colours', 'COLOURS'], ['fabric', 'FABRIC'], ['gear', 'GEAR']]) { const t = el('button', 'w-tab' + (this.tab === k ? ' on' : ''), label); t.onclick = () => { this.opt.click?.(); this.tab = k; this.renderWardrobe(); }; tabs.appendChild(t); }
    W.appendChild(tabs);
    const body = el('div', 'w-body');
    W.appendChild(body);
    if (this.tab === 'colours') {
      for (const [key, label] of [['suit', 'SUIT'], ['trim', 'TRIM'], ['gear', 'GLOVES & BOOTS'], ['skin', 'BEAN'], ['eye', 'EYES'], ['glow', 'CHRONO GLOW']]) {
        const row = el('div', 'w-row');
        const cur = PALETTE[key].find((c) => c[0] === o[key]);
        row.appendChild(el('div', 'w-label', `${label}<i>${cur ? cur[1] : hex(o[key])}</i>`));
        const sw = el('div', 'w-swatches');
        for (const [c, name] of PALETTE[key]) {
          const b = el('button', 'w-sw' + (o[key] === c ? ' on' : '')); b.style.setProperty('--c', hex(c)); b.title = name;
          b.onclick = () => { this.opt.click?.(); o[key] = c; preview(); this.renderWardrobe(); };
          sw.appendChild(b);
        }
        row.appendChild(sw); body.appendChild(row);
      }
      const row = el('div', 'w-row');
      row.appendChild(el('div', 'w-label', `SMILE<i>${TEETH[o.teeth] ?? ''}</i>`));
      const sw = el('div', 'w-swatches');
      TEETH.forEach((t, i) => { const b = el('button', 'w-chip' + (o.teeth === i ? ' on' : ''), t); b.onclick = () => { this.opt.click?.(); o.teeth = i; preview(); this.renderWardrobe(); }; sw.appendChild(b); });
      row.appendChild(sw); body.appendChild(row);
    } else if (this.tab === 'fabric') {
      const grid = el('div', 'w-grid');
      for (const id of FABRIC_IDS) {
        const b = el('button', 'w-tile' + (o.fabric === id ? ' on' : ''), `<img src="${fabricSwatch(id, o.suit)}"><b>${FABRICS[id]?.name ?? id}</b>`);
        b.onclick = () => { this.opt.click?.(); o.fabric = id; preview(); this.renderWardrobe(); };
        grid.appendChild(b);
      }
      body.appendChild(grid);
    } else {
      let icons = {};
      try { icons = this.opt.accIcons?.() ?? {}; } catch (e) { console.warn('accessory icons', e); }
      for (const slot of ACC_SLOTS) {
        body.appendChild(el('div', 'w-label', ({ hat: 'HEAD', face: 'FACE', neck: 'NECK', back: 'BACK' })[slot]));
        const grid = el('div', 'w-grid gear');
        for (const a of ACCESSORIES[slot]) {
          const open = isUnlocked(slot, a.id);
          const ach = a.ach ? ACH_BY_ID[a.ach] : null;
          const ic = icons[slot + ':' + a.id];
          const b = el('button', 'w-tile' + (o[slot] === a.id ? ' on' : '') + (open ? '' : ' locked'), `${ic ? `<img src="${ic}">` : `<i class="w-none"></i>`}<b>${a.name}</b>${open ? '' : `<span>LOCKED · ${ach ? ach.title : ''}</span>`}`);
          b.title = open ? a.name : `Unlock: ${ach?.title ?? a.ach} — ${ach?.text ?? ''}`;
          b.onclick = () => {
            if (!open) { this.opt.error?.(); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
            this.opt.click?.(); o[slot] = a.id; preview(); this.renderWardrobe();
          };
          grid.appendChild(b);
        }
        body.appendChild(grid);
      }
    }
    W.appendChild(el('div', 'w-foot', 'Drag in the lab to spin your scientist'));
    preview();
  }
  help() {
    this.clear('HOW TO PLAY');
    this.menu.insertAdjacentHTML('beforeend', `<div class="lab-help">
      <p>Your homemade time machine worked. Sort of. You, your van and Timmy the robot land 66 million years ago.</p>
      <p><b>Travel light:</b> one tool slot and three pockets. Lift logs, rocks and barrels with the <b>gravity gun</b> and drop them in the <b>van rack</b>.</p>
      <p><b>Survive</b>, <b>craft</b> (Tab), <b>build</b> (B) and <b>scan</b> everything with Timmy (R).</p>
      <p><b>Catch pals:</b> knock a creature out, then feed it the treat it likes. Train them, level them, and take control with the Mind Link.</p>
      <p><b>Fix the van</b>, find oil for fuel and drive to the research base far away. It is your only way home.</p>
      <p class="small">WASD move · Shift sprint · Space jump · E use · LMB use/lift · RMB throw · R scan · Z command · Tab Chrono-Link · M map · B build · V talk</p></div>`);
    this.btn('BACK', () => this.main(), 'ghost');
  }
  close() { this.closeWardrobe(true); this.el.style.transition = 'opacity 0.5s'; this.el.style.opacity = 0; setTimeout(() => this.el.remove(), 520); }
}
