// CHRONO-OS 0.9: the van's computer, a full-screen green-phosphor CRT.
// Apps: MAIL (story + hints), R&D (tech tree), ANALYZE (specimen mini-games:
// microscope focus, DNA pairing, fossil brushing), DINO-DEX, VAN-CAD
// (upgrades), DIAGNOSTICS and SNAKE-O-SAURUS. The 3D monitor mirrors it.
import * as THREE from 'three';
import { TECHS, CATS, INSIGHTS, techById } from '../systems/research.js';
import { ITEMS } from '../data/items.js';
import { REPAIRS, DRIVE_NEEDS } from '../entities/vanUpgrades.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const APPS = [
  { id: 'mail', name: 'MAIL', desc: 'Messages from the crew' },
  { id: 'rd', name: 'R&D', desc: 'Spend field data on breakthroughs' },
  { id: 'lab', name: 'ANALYZE', desc: 'Study specimens' },
  { id: 'dex', name: 'DINO-DEX', desc: 'Everything you scanned' },
  { id: 'cad', name: 'VAN-CAD', desc: 'Homemade van upgrades' },
  { id: 'diag', name: 'DIAGNOSTICS', desc: 'Van + time machine status' },
  { id: 'snake', name: 'SNAKE-O-SAURUS', desc: 'Very important science' },
];
export const MAILS = [
  { id: 'welcome', from: 'DOUG', subj: 'IT WORKED (kind of)', when: () => true, body: 'Guys!!! The machine WORKED. We went back in time!\n\nBad news: 66 million years back. Also the van is on fire a bit.\n\nThe scanner thingy is in the glovebox. It is jammed. Hit it.\n\n- Doug\n\nPS. who ate my mints' },
  { id: 'todo', from: 'KEV', subj: 'TODO.TXT', when: () => true, body: 'OK DON\'T PANIC. List:\n\n1. Batteries flat -> build the HAND-CRANK DYNAMO at the van workbench (scrap + wire + sticks, the debris along the skid trench has plenty)\n2. Crank it. Crank it good.\n3. Computer on (you did that, nice)\n4. Do science (ask Wanda)\n5. Fix van\n6. Go home\n7. Never tell anyone about this' },
  { id: 'science', from: 'DR. WANDA', subj: 'How research works', when: () => true, body: 'Listen up, idiots.\n\nPoint the CHRONO-SCANNER (LMB) at anything new: plants, rocks, critters, footprints, nests. Each new scan gives BIO / GEO / ZOO / PALEO data.\n\nBring specimens (fossils, amber, DNA swabs, samples) back here and use ANALYZE.\n\nSpend data in R&D to unlock new tech. Some breakthroughs need a specific discovery (an INSIGHT) first.\n\nAnd charge the scanner at the CHARGE-O-TRON. It eats batteries.' },
  { id: 'dinos', from: 'DOUG', subj: 'RE: can we keep one', when: (g) => g.research?.has('tame_basics'), body: 'Wanda says critters can be tamed!!!\n\nEach species is different. Little ones you can bribe with snacks (hold the right food and be patient). Big angry ones need to be knocked out first (club, slingshot, bola, tranq darts), then fed while they snooze. Snoozeberries keep them asleep.\n\nOnce tamed they can WORK. Carry logs. Plough fields. Guard the camp. Be ridden. Doug Jr. is the name of my first one.' },
  { id: 'tracking', from: 'KEV', subj: 'how 2 catch a critter (by kev)', when: (g) => g.research?.has('tame_basics'), body: 'step 1: find FOOTPRINTS. look at the ground lol. fresh ones are dark.\n\nstep 2: scan them with the chrono-scanner. it says who made them and marks the trail on ur compass. follow it.\n\nstep 3: build a SNARE TRAP at the workbench. put food on it that the critter likes (check the CRITTER-DEX). hide behind a tree.\n\nstep 4: SNAP. it is stuck. bonk it with the club or feed it.\n\nstep 5: name it kevin jr\n\n- kev\n\nps critter poo is good for crops AND for the van apparently. dont ask how i know' },
  { id: 'alphas', from: 'DR. WANDA', subj: 'Three VERY big problems', when: (g) => (g.journal?.chapter ?? 0) >= 4, body: 'Scanner readings show three ALPHAS on this island. They are bigger, meaner and smarter than the rest.\n\n1. OLD GNASHER - a Magmaw in the Magmaw Wastes. Roars, stomps, charges.\n2. BIG MOMMA - a Riptide in Mirror Lake. Dives and comes up next to you.\n3. RAZOR - the Voltfang alpha at the Voltfang Den. Calls his pack. He is the reason for the night raids.\n\nDefeat them, or (I dare you) knock them out and tame them. Their trophies keep predators away from camp.\n\nBring friends. Bring tranqs. Bring a spare pair of trousers.' },
  { id: 'vanfix', from: 'KEV', subj: 'Getting the van moving', when: (g) => g.research?.has('metallurgy'), body: 'Van Mechanics research unlocks the van parts:\n\n- PATCHED TIRE (resin, hide, tar) -> front left wheel\n- REINFORCED AXLE (iron) -> same wheel, it\'s bent\n- ENGINE PARTS (iron, bone, resin) -> under the front hatch\n- WIRING HARNESS (copper wire) -> the sparky breaker panel\n\nAlso it needs fuel. I have an idea involving critter poo. You will not like it.' },
  { id: 'navchip', from: 'DR. WANDA', subj: 'Missing: Navigation Chip', when: (g) => g.research?.has('temporal_theory'), body: 'The NAVIGATION CHIP got ejected during the crash. Without it we could end up anywhen.\n\nThe chip has a homing beacon. The DIAGNOSTICS app shows its bearing.\n\nI also need: a TEMPORAL COIL, a FLUX CRYSTAL MATRIX (chrono crystals from the crystal cave), a TIMELINE STABILIZER and a charged POWER CORE.\n\nInstall all five in the machine at the back of the van.' },
  { id: 'final', from: 'EVERYONE', subj: 'FINAL CHECKLIST', when: (g) => g.van && Object.values(g.van.s.sockets).filter(Boolean).length >= 4, body: '[ ] All 5 parts installed\n[ ] Battery at 100%\n[ ] CHRONO breaker ON\n[ ] Everyone inside the van\n[ ] Pull the ENGAGE lever\n[ ] Scream\n\nSee you in 1987.' },
];

export class Computer {
  constructor(game) {
    this.name = 'computer';
    this.g = game;
    this.isOpen = false;
    this.app = null; this.sel = 0; this.sub = null;
    this.read = new Set();
    game.computer = this;
    this._key = (e) => this.onKey(e);
  }

  // ---------------------------------------------------------------- open / close
  open(van, screen = 0, app = null) {
    const g = this.g, ui = g.ui;
    if (this.isOpen) return;
    if (ui.pda) ui.closePDA();
    if (ui.container) ui.closeContainer();
    this.isOpen = true; ui.crtOpen = true; g.uiOpen = true; g.input.unlock();
    this.van = van;
    const el = document.createElement('div'); el.id = 'crt';
    const W = Math.min(1040, innerWidth * 0.92), H = Math.min(W * 0.72, innerHeight * 0.88);
    el.style.cssText = `left:50%;top:50%;width:${W}px;height:${H}px;transform:translate(-50%,-50%) scale(0.92);opacity:0;transition:transform .25s, opacity .25s;`;
    el.innerHTML = '<div class="inner"></div>';
    ui.root.appendChild(el);
    requestAnimationFrame(() => { el.style.transform = 'translate(-50%,-50%) scale(1)'; el.style.opacity = '1'; });
    this.el = el; this.inner = el.firstChild;
    window.addEventListener('keydown', this._key, true);
    g.audio?.play('crt_on', { vol: 0.5 });
    // camera leans in toward the monitor
    if (van) {
      const s = van.parts.screens[screen] ?? van.parts.mainScreen;
      const look = s.g.localToWorld(new THREE.Vector3(0, 0, 0));
      const pos = s.g.localToWorld(new THREE.Vector3(0, 0.05, 0.85));
      g.rig.override = { pos, look, fov: 48 };
    }
    if (!this.booted) this.bootSeq(); else this.go(app ?? (this.app || 'desk'));
    if (app) this.go(app);
  }
  close() {
    const g = this.g;
    if (!this.isOpen) return;
    this.isOpen = false;
    window.removeEventListener('keydown', this._key, true);
    if (this.game) this.game = null;
    this.stopMini();
    this.el?.remove(); this.el = null;
    g.ui.crtOpen = false;
    g.rig.override = null;
    if (!g.ui.pda && !g.ui.container && !g.ui.menuOpen) { g.uiOpen = false; g.input.lock(); }
    g.audio?.play('boop', { vol: 0.4 });
    g.input.keys.clear();
  }
  bootSeq() {
    this.booted = true;
    const lines = ['CHRONO-OS v0.9 (C) 1987 DOUG & KEV LABS', 'MEMORY TEST..... 640K OK', 'MOUSE.COM........ LOADED', 'FLUX CAPACITY.... ????', 'TEMPORAL DRIVE... <span class="bad">OFFLINE</span>', 'DATE............. <span class="warn">ERROR: YEAR -66,000,000</span>', '', 'WELCOME BACK, IDIOTS.'];
    this.inner.innerHTML = '<pre></pre>';
    const pre = this.inner.firstChild;
    let i = 0;
    const step = () => {
      if (!this.isOpen) return;
      if (i < lines.length) { pre.innerHTML += lines[i++] + '\n'; this.g.audio?.play('ui_tick', { vol: 0.2 }); setTimeout(step, 160); }
      else setTimeout(() => this.isOpen && this.go('desk'), 500);
    };
    step();
  }
  header(title) { return `<div class="hdr"><span>CHRONO-OS 0.9 · ${esc(title)}</span><span>${esc(this.g.time.clock())} · PWR ${this.van ? this.van.pct() + '%' : '--'}</span></div>`; }
  footer(t = '↑↓ select · ENTER open · ESC back') { return `<div class="dim" style="position:absolute;left:28px;bottom:16px;right:28px;display:flex;justify-content:space-between"><span>${t}</span><span>R&D DATA: ${Object.entries(CATS).map(([k, c]) => `<span style="color:${c.color}">${c.name} ${Math.floor(this.g.research?.rp[k] ?? 0)}</span>`).join(' ')}</span></div>`; }

  go(app) {
    this.stopMini();
    this.app = app; this.sel = 0; this.sub = null;
    this.g.audio?.play('beep', { vol: 0.25 });
    this.render();
  }
  render() {
    if (!this.isOpen) return;
    const fn = { desk: () => this.rDesk(), mail: () => this.rMail(), rd: () => this.rRD(), lab: () => this.rLab(), dex: () => this.rDex(), cad: () => this.rCad(), diag: () => this.rDiag(), snake: () => this.rSnake() }[this.app] ?? (() => this.rDesk());
    fn();
    this.bind();
  }
  bind() {
    for (const el of this.inner.querySelectorAll('[data-i]')) { el.onmouseenter = () => { if (this.sel !== +el.dataset.i) { this.sel = +el.dataset.i; this.highlight(); } }; el.onclick = () => { this.sel = +el.dataset.i; this.enter(); }; }
    for (const el of this.inner.querySelectorAll('[data-act]')) el.onclick = () => this.action(el.dataset.act);
  }
  highlight() { for (const el of this.inner.querySelectorAll('[data-i]')) el.classList.toggle('sel', +el.dataset.i === this.sel); this.renderDetail?.(); this.g.audio?.play('ui_tick', { vol: 0.15 }); }
  count() { return this.inner.querySelectorAll('[data-i]').length; }
  onKey(e) {
    if (!this.isOpen) return;
    if (this.mini?.key && this.mini.key(e)) { e.preventDefault(); e.stopPropagation(); return; }
    const k = e.code;
    if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.app && this.app !== 'desk') this.go('desk'); else this.close(); return; }
    if (k === 'ArrowDown' || k === 'KeyS') { this.sel = (this.sel + 1) % Math.max(1, this.count()); this.highlight(); e.preventDefault(); }
    else if (k === 'ArrowUp' || k === 'KeyW') { this.sel = (this.sel - 1 + this.count()) % Math.max(1, this.count()); this.highlight(); e.preventDefault(); }
    else if (k === 'Enter' || k === 'Space') { this.enter(); e.preventDefault(); }
    e.stopPropagation();
  }
  enter() {
    const el = this.inner.querySelector(`[data-i="${this.sel}"]`);
    if (!el) return;
    if (el.dataset.go) this.go(el.dataset.go);
    else if (el.dataset.act) this.action(el.dataset.act);
  }

  // ---------------------------------------------------------------- desktop
  rDesk() {
    const unread = MAILS.filter((m) => m.when(this.g) && !this.read.has(m.id)).length;
    const avail = TECHS.filter((t) => this.g.research?.canResearch(t)).length;
    this.inner.innerHTML = this.header('DESKTOP') + `<div class="cols"><div style="width:52%">${APPS.map((a, i) => `<span class="menuitem${i === this.sel ? ' sel' : ''}" data-i="${i}" data-go="${a.id}">&gt; ${a.name}${a.id === 'mail' && unread ? ` <span class="warn">[${unread} NEW]</span>` : ''}${a.id === 'rd' && avail ? ` <span class="warn">[${avail} READY]</span>` : ''}</span>`).join('')}</div><div style="flex:1"><pre class="dim">${esc(this.ascii())}</pre><div id="dd" style="margin-top:10px"></div></div></div>` + this.footer();
    this.renderDetail = () => { const a = APPS[this.sel]; const d = this.inner.querySelector('#dd'); if (d && a) d.textContent = a.desc; };
    this.renderDetail();
  }
  ascii() { return '      __\n     / _)   <- you are here\n    / /\n  _/ /____\n /  _____/\n/__/  \\_\\\n\nYEAR: -66,000,000\nLOCATION: ???'; }

  // ---------------------------------------------------------------- mail
  rMail() {
    const list = MAILS.filter((m) => m.when(this.g));
    const m = list[this.sel] ?? list[0];
    if (m) this.read.add(m.id);
    this.inner.innerHTML = this.header('MAIL') + `<div class="cols"><div style="width:36%">${list.map((x, i) => `<span class="menuitem${i === this.sel ? ' sel' : ''}" data-i="${i}">${this.read.has(x.id) ? ' ' : '*'} ${esc(x.from)}: ${esc(x.subj)}</span>`).join('')}</div><div style="flex:1;border-left:2px solid #3a8a44;padding-left:16px;height:calc(100% - 128px);overflow-y:auto"><pre id="mailbody" style="white-space:pre-wrap"></pre></div></div>` + this.footer();
    this.renderDetail = () => { const mm = list[this.sel]; if (!mm) return; this.read.add(mm.id); const b = this.inner.querySelector('#mailbody'); if (b) b.textContent = `FROM: ${mm.from}\nSUBJ: ${mm.subj}\n\n${mm.body}`; };
    this.renderDetail();
  }

  // ---------------------------------------------------------------- R&D
  rRD() {
    const R = this.g.research;
    const order = TECHS.slice().sort((a, b) => (R.done.has(a.id) ? 2 : R.canResearch(a) ? 0 : 1) - (R.done.has(b.id) ? 2 : R.canResearch(b) ? 0 : 1));
    this.rdOrder = order;
    this.inner.innerHTML = this.header('R&D LAB') + `<div class="cols"><div style="width:44%;height:calc(100% - 128px);overflow-y:auto" id="rdlist">${order.map((t, i) => { const st = R.done.has(t.id) ? '<span class="dim">[✓]</span>' : R.canResearch(t) ? '<span class="warn">[!]</span>' : '[ ]'; return `<span class="menuitem${i === this.sel ? ' sel' : ''}" data-i="${i}" data-act="research">${st} ${esc(t.name)}</span>`; }).join('')}</div><div style="flex:1;border-left:2px solid #3a8a44;padding-left:16px" id="rddet"></div></div>` + this.footer('ENTER research · ESC back');
    this.renderDetail = () => {
      const t = order[this.sel], d = this.inner.querySelector('#rddet');
      if (!t || !d) return;
      const done = R.done.has(t.id);
      const cost = Object.entries(t.cost).map(([c, n]) => `<span style="color:${R.rp[c] >= n || done ? CATS[c].color : '#ff7060'}">${CATS[c].name} ${Math.floor(Math.min(R.rp[c], n))}/${n}</span>`).join('  ');
      const needs = t.needs.map((n) => `<div class="${R.done.has(n) ? 'dim' : 'bad'}">${R.done.has(n) ? '✓' : '✗'} TECH: ${esc(techById[n]?.name)}</div>`).join('');
      const ins = t.insight.map((n) => `<div class="${R.insights.has(n) ? 'dim' : 'bad'}">${R.insights.has(n) ? '✓' : '✗'} ${esc(INSIGHTS[n])}</div>`).join('');
      d.innerHTML = `<div style="color:#c8ffc8">${esc(t.name.toUpperCase())}</div><div class="dim" style="margin:6px 0 10px">${esc(t.desc)}</div><div>COST: ${cost}</div>${needs}${ins}<div style="margin-top:10px">UNLOCKS:</div><div class="dim">${esc(t.unlocks)}</div><div style="margin-top:14px">${done ? '<span class="dim">RESEARCHED</span>' : R.canResearch(t) ? '<span class="btnt" data-act="research">RESEARCH!</span>' : '<span class="bad">NOT ENOUGH DATA</span>'}</div>`;
      for (const el of d.querySelectorAll('[data-act]')) el.onclick = () => this.action(el.dataset.act);
    };
    this.renderDetail();
    const sel = this.inner.querySelector('.menuitem.sel'); sel?.scrollIntoView({ block: 'nearest' });
  }

  // ---------------------------------------------------------------- analyze
  specimens() {
    const g = this.g;
    const ids = ['plant_sample', 'herb', 'fossil', 'amber', 'amber_bug', 'eggshell', 'coprolite', 'dna', 'mineral', 'crystal', 'dung'];
    const out = [];
    for (const id of ids) { const n = g.inventory.count(id) + (this.van?.shelf.count(id) ?? 0); if (n) out.push({ id, n }); }
    return out;
  }
  rLab() {
    const list = this.specimens();
    this.labList = list;
    this.inner.innerHTML = this.header('SPECIMEN ANALYSIS') + `<div class="cols"><div style="width:40%">${list.length ? list.map((s, i) => `<span class="menuitem${i === this.sel ? ' sel' : ''}" data-i="${i}" data-act="analyze">${esc(ITEMS[s.id].name)} x${s.n}</span>`).join('') : '<div class="dim">NO SPECIMENS.<br><br>Collect fossils, amber, eggshells, DNA swabs and plant samples, then put them in your backpack or on the van\'s specimen shelf.</div>'}</div><div style="flex:1;border-left:2px solid #3a8a44;padding-left:16px" id="labdet"></div></div>` + this.footer('ENTER analyze · ESC back');
    this.renderDetail = () => {
      const s = list[this.sel], d = this.inner.querySelector('#labdet');
      if (!s || !d) return;
      const kind = this.miniFor(s.id);
      const done = this.g.research.analysed.get(s.id) ?? 0;
      d.innerHTML = `<div style="color:#c8ffc8">${esc(ITEMS[s.id].name.toUpperCase())}</div><div class="dim" style="margin:6px 0">${esc(ITEMS[s.id].desc ?? '')}</div><div>PROCEDURE: ${kind === 'micro' ? 'MICROSCOPE FOCUS' : kind === 'dna' ? 'DNA SEQUENCING' : 'FOSSIL CLEANING'}</div><div class="dim">ANALYSED: ${done}x ${done ? '' : '<span class="warn">(first analysis = bonus data)</span>'}</div><div style="margin-top:12px"><span class="btnt" data-act="analyze">START</span></div>`;
      for (const el of d.querySelectorAll('[data-act]')) el.onclick = () => this.action(el.dataset.act);
    };
    this.renderDetail();
  }
  miniFor(id) { return ['dna', 'amber_bug', 'eggshell'].includes(id) ? 'dna' : ['fossil', 'amber', 'coprolite'].includes(id) ? 'brush' : 'micro'; }
  takeSpecimen(id) { if (this.g.inventory.remove(id, 1)) return true; if (this.van?.shelf.remove(id, 1)) return true; return false; }
  startMini(id) {
    const kind = this.miniFor(id);
    if (!this.takeSpecimen(id)) return;
    this.app = 'mini';
    this.inner.innerHTML = this.header('ANALYZING: ' + ITEMS[id].name.toUpperCase()) + '<div id="mg" style="display:flex;gap:20px;align-items:flex-start"></div>' + this.footer('ESC abort');
    const host = this.inner.querySelector('#mg');
    const done = (quality) => {
      this.stopMini();
      const res = this.g.research.analyse(id, quality);
      this.g.audio?.play('scan_done', { vol: 0.6 });
      this.inner.innerHTML = this.header('ANALYSIS COMPLETE') + `<pre style="white-space:pre-wrap">${esc(ITEMS[id].name.toUpperCase())}\n\n${esc(res?.fact ?? '')}\n\nQUALITY: ${'█'.repeat(Math.round(quality * 10))}${'░'.repeat(10 - Math.round(quality * 10))}\nDATA:    +${res?.gain ?? 0} ${res ? CATS[res.cat].name : ''}${res?.insight ? '\nINSIGHT: ' + esc(INSIGHTS[res.insight]) : ''}</pre><div style="margin-top:16px"><span class="menuitem sel" data-i="0" data-go="lab">&gt; BACK TO ANALYSIS</span><span class="menuitem" data-i="1" data-go="rd">&gt; OPEN R&D</span></div>` + this.footer();
      this.app = 'labdone'; this.sel = 0; this.bind();
    };
    if (kind === 'micro') this.mini = microscope(host, done, this.g);
    else if (kind === 'dna') this.mini = dnaGame(host, done, this.g);
    else this.mini = brushGame(host, done, this.g);
  }
  stopMini() { if (this.mini) { this.mini.stop?.(); this.mini = null; } }

  // ---------------------------------------------------------------- dex / cad / diag
  rDex() {
    const R = this.g.research;
    const list = [...R.dex.entries()];
    const scans = [...R.scanned.entries()].filter(([k]) => !k.startsWith('dino:'));
    this.inner.innerHTML = this.header('DINO-DEX') + `<div class="cols"><div style="width:40%;height:calc(100% - 128px);overflow-y:auto">${list.length ? list.map(([, v], i) => `<span class="menuitem${i === this.sel ? ' sel' : ''}" data-i="${i}">${esc(v.name)}</span>`).join('') : '<div class="dim">NO SPECIES SCANNED.<br>Point the Chrono-Scanner at a critter.<br>(From a safe distance.)</div>'}<div class="dim" style="margin-top:14px">FIELD GUIDE: ${scans.length} OTHER ENTRIES</div></div><div style="flex:1;border-left:2px solid #3a8a44;padding-left:16px" id="dexdet"></div></div>` + this.footer();
    this.renderDetail = () => { const e = list[this.sel], d = this.inner.querySelector('#dexdet'); if (!e || !d) return; const v = e[1], sp = v.sp ?? this.g.dinos?.species?.[e[0]]; d.innerHTML = `<div style="color:#c8ffc8">${esc(v.name.toUpperCase())}</div><pre style="white-space:pre-wrap;margin-top:8px">${esc(v.fact)}</pre>${sp ? `<div class="dim" style="margin-top:8px">ELEMENT: ${esc((sp.elementName ?? '?').toUpperCase())}\nDIET: ${esc(sp.diet ?? '?')}\nTEMPER: ${esc(sp.temper ?? '?')}\nTAMING: ${esc(sp.tameHow ?? '?')}\nFAVOURITE: ${esc(ITEMS[sp.favorite]?.name ?? '?')}</div>` : ''}`; };
    this.renderDetail();
  }
  rCad() {
    const v = this.van;
    if (!v) { this.inner.innerHTML = this.header('VAN-CAD') + '<div class="bad">NO VAN CONNECTED</div>' + this.footer(); return; }
    const list = v.upgradeList();
    this.cadList = list;
    this.inner.innerHTML = this.header('VAN-CAD GARAGE') + `<div class="cols"><div style="width:44%">${list.map((u, i) => `<span class="menuitem${i === this.sel ? ' sel' : ''}" data-i="${i}" data-act="upgrade">${u.have ? '<span class="dim">[✓]</span>' : u.locked ? '[?]' : u.afford ? '<span class="warn">[+]</span>' : '[ ]'} ${esc(u.locked ? '??? (research)' : u.name)}</span>`).join('')}</div><div style="flex:1;border-left:2px solid #3a8a44;padding-left:16px" id="caddet"></div></div>` + this.footer('ENTER install · ESC back');
    this.renderDetail = () => {
      const u = list[this.sel], d = this.inner.querySelector('#caddet');
      if (!u || !d) return;
      const cost = Object.entries(u.cost).map(([id, n]) => { const have = this.g.inventory.count(id); return `<div class="${have >= n ? '' : 'bad'}">${n} x ${esc(ITEMS[id]?.name ?? id)} (${have})</div>`; }).join('');
      d.innerHTML = `<div style="color:#c8ffc8">${esc(u.locked ? '???' : u.name.toUpperCase())}</div><div class="dim" style="margin:6px 0 10px">${esc(u.locked ? 'Requires research: ' + this.g.research.techName(u.unlock) : u.desc)}</div>${u.locked ? '' : cost}${u.blocked ? `<div class="bad">Repair first: ${u.needs.join(', ')}</div>` : ''}<div style="margin-top:12px">${u.have ? '<span class="dim">INSTALLED</span>' : u.locked ? '' : `<span class="btnt" data-act="upgrade">INSTALL</span>`}</div><pre class="dim" style="margin-top:16px">${esc(this.blueprint(u.id))}</pre>`;
      for (const el of d.querySelectorAll('[data-act]')) el.onclick = () => this.action(el.dataset.act);
    };
    this.renderDetail();
  }
  blueprint(id) {
    return ({
      roofdeck: '  _||_||_||_\n |__________|\n |  [] [] []|=\n o----------o', horn: '   <|  |>\n  __|__|__\n |  VAN   |', storage: '   ______\n  (______)\n |  VAN   |', solar: '  /=/=/=/=/\n |  VAN   |',
      generator: ' |  VAN   |[#]~~\n o--------o', armor: '##|  VAN   |##\n>>o--------o', wheels: ' |  VAN   |\n  (O)    (O)', floodlights: ' \\ * * * * /\n |  VAN   |', dish: '    \\_/\n     |\n |  VAN   |',
    }[id] ?? '   [ ? ]');
  }
  rDiag() {
    const v = this.van, g = this.g;
    if (!v) { this.inner.innerHTML = this.header('DIAGNOSTICS') + '<div class="bad">NO VAN</div>' + this.footer(); return; }
    const S = v.s;
    const rep = Object.entries(REPAIRS).map(([id, r]) => `<div class="${S.repaired[id] ? 'dim' : DRIVE_NEEDS.includes(id) ? 'bad' : 'warn'}">${S.repaired[id] ? '[OK]' : '[!!]'} ${esc(r.name)}${S.repaired[id] ? '' : ' - ' + esc(r.desc)}</div>`).join('');
    const parts = ['temporal_coil', 'flux_crystal', 'nav_chip', 'power_core', 'stabilizer'].map((id) => `<div class="${S.sockets[id] ? 'dim' : 'bad'}">${S.sockets[id] ? '[OK]' : '[--]'} ${esc(ITEMS[id].name)}</div>`).join('');
    const chip = g.navChipPos?.();
    let bearing = '';
    if (chip && !S.sockets.nav_chip && g.research.has('temporal_theory')) { const dx = chip.x - g.local.pos.x, dz = chip.z - g.local.pos.z; const deg = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360; const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']; bearing = `<div class="warn" style="margin-top:8px">NAV CHIP BEACON: ${dirs[Math.round(deg / 45) % 8]} · ${Math.round(Math.hypot(dx, dz))} m</div>`; }
    this.inner.innerHTML = this.header('DIAGNOSTICS') + `<div class="cols"><div style="width:52%"><div style="color:#c8ffc8">VAN SYSTEMS</div>${rep}<div style="margin-top:8px">BATTERY ${v.pct()}% · FUEL ${S.fuel.toFixed(1)}/10 · ODO ${(S.odo / 1000).toFixed(2)} KM</div><div class="${v.canDrive() ? '' : 'bad'}">DRIVE: ${v.canDrive() ? 'READY' : 'NOT READY'}</div></div><div style="flex:1"><div style="color:#c8ffc8">CHRONO-DRIVE MK 0.9</div>${parts}${bearing}<div style="margin-top:8px" class="${S.sw[3] ? 'warn' : 'dim'}">CHRONO BREAKER: ${S.sw[3] ? 'ON' : 'OFF'}</div></div></div>` + this.footer('ESC back');
  }

  // ---------------------------------------------------------------- snake
  rSnake() {
    this.inner.innerHTML = this.header('SNAKE-O-SAURUS') + '<div style="display:flex;gap:20px"><canvas id="sn" width="300" height="200" style="width:600px;height:400px;box-shadow:0 0 0 2px #3a8a44"></canvas><div class="dim">Guide the sauropod to the eggs.<br><br>ARROWS to steer.<br>ESC to quit.<br><br>HIGH SCORE: <span id="hs">' + (this.hi ?? 0) + '</span></div></div>' + this.footer('ARROWS steer · ESC back');
    this.mini = snake(this.inner.querySelector('#sn'), (score) => { this.hi = Math.max(this.hi ?? 0, score); const hs = this.inner.querySelector('#hs'); if (hs) hs.textContent = this.hi; this.g.events.emit('snake', { score }); }, this.g);
  }

  // ---------------------------------------------------------------- actions
  action(a) {
    const g = this.g;
    if (a === 'research') { const t = this.rdOrder?.[this.sel]; if (t && g.research.research(t.id)) { g.audio?.play('craft_done'); setTimeout(() => this.isOpen && this.render(), 120); } else g.audio?.play('error', { vol: 0.4 }); }
    if (a === 'analyze') { const s = this.labList?.[this.sel]; if (s) this.startMini(s.id); }
    if (a === 'upgrade') { const u = this.cadList?.[this.sel]; if (u && !u.have && !u.locked && !u.blocked && u.afford) { this.van.installUpgrade(u.id); setTimeout(() => this.isOpen && this.render(), 200); } else g.audio?.play('error', { vol: 0.4 }); }
  }

  // ---------------------------------------------------------------- 3D monitor mirror
  drawScreen(ctx, W, H) {
    ctx.font = '11px VT323'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#c8ffc8'; ctx.fillText('CHRONO-OS 0.9', 5, 4);
    ctx.fillStyle = '#3a8a44'; ctx.fillRect(5, 16, W - 10, 1);
    ctx.fillStyle = '#8dff9a';
    if (!this.isOpen) {
      const unread = MAILS.filter((m) => m.when(this.g) && !this.read.has(m.id)).length;
      const avail = TECHS.filter((t) => this.g.research?.canResearch(t)).length;
      ctx.fillText('PWR ' + (this.g.van?.pct() ?? 0) + '%', 5, 22);
      ctx.fillText(unread ? unread + ' NEW MAIL' : 'NO NEW MAIL', 5, 34);
      ctx.fillStyle = avail ? '#ffd060' : '#8dff9a';
      ctx.fillText(avail ? avail + ' RESEARCH READY' : 'R&D: NEED DATA', 5, 46);
      ctx.fillStyle = Math.floor(performance.now() / 500) % 2 ? '#8dff9a' : '#4a9a54';
      ctx.fillText('> PRESS E TO LOG IN', 5, 64);
    } else {
      ctx.fillText('> ' + (APPS.find((a) => a.id === this.app)?.name ?? 'BUSY...'), 5, 22);
      for (let k = 0; k < 6; k++) { ctx.fillStyle = k === this.sel % 6 ? '#8dff9a' : '#2a5a30'; ctx.fillRect(5, 36 + k * 9, 60 + ((k * 37) % 70), 6); }
    }
  }
}

// ========================================================================== mini-games
function microscope(host, done, g) {
  const c = document.createElement('canvas'); c.width = 160; c.height = 120; c.style.cssText = 'width:560px;height:420px;box-shadow:0 0 0 2px #3a8a44;cursor:crosshair';
  const side = document.createElement('div'); side.className = 'dim'; side.style.width = '300px';
  side.innerHTML = 'MICROSCOPE<br><br>MOUSE WHEEL / ← → to focus.<br>When sharp, CLICK the 3 blinking nuclei.<br><br><div id="mfocus"></div><div id="mfound"></div>';
  host.appendChild(c); host.appendChild(side);
  const ctx = c.getContext('2d');
  // a field of cells
  const cells = [];
  for (let i = 0; i < 14; i++) cells.push({ x: 15 + Math.random() * 130, y: 12 + Math.random() * 96, r: 7 + Math.random() * 9, nx: (Math.random() - 0.5) * 4, ny: (Math.random() - 0.5) * 4 });
  const targets = cells.slice(0, 3).map((q) => ({ q, found: false }));
  const goal = 0.25 + Math.random() * 0.5;
  let focus = goal > 0.5 ? 0.05 : 0.95, t = 0, run = true, quality = 1;
  const base = document.createElement('canvas'); base.width = 160; base.height = 120;
  const bx = base.getContext('2d');
  const draw = () => {
    bx.fillStyle = '#071408'; bx.fillRect(0, 0, 160, 120);
    for (const q of cells) {
      bx.fillStyle = '#1a4a22'; bx.beginPath(); bx.arc(q.x, q.y, q.r, 0, 6.283); bx.fill();
      bx.strokeStyle = '#4a9a54'; bx.lineWidth = 1.5; bx.stroke();
      const tg = targets.find((x) => x.q === q);
      const blink = tg && !tg.found && Math.abs(focus - goal) < 0.06 && Math.floor(t * 4) % 2;
      bx.fillStyle = tg?.found ? '#ffd060' : blink ? '#c8ffc8' : '#8dff9a';
      bx.beginPath(); bx.arc(q.x + q.nx, q.y + q.ny, q.r * 0.3, 0, 6.283); bx.fill();
    }
    const blur = Math.min(6, Math.abs(focus - goal) * 22);
    ctx.filter = `blur(${blur.toFixed(1)}px)`;
    ctx.drawImage(base, 0, 0);
    ctx.filter = 'none';
    // vignette circle
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, 160, 120); ctx.arc(80, 60, 58, 0, 6.283, true); ctx.fill();
    side.querySelector('#mfocus').textContent = 'FOCUS ' + '█'.repeat(Math.max(0, 10 - Math.round(Math.abs(focus - goal) * 25))).padEnd(10, '░');
    side.querySelector('#mfound').textContent = `NUCLEI: ${targets.filter((x) => x.found).length}/3`;
  };
  const loop = () => { if (!run) return; t += 1 / 30; draw(); setTimeout(loop, 33); };
  loop();
  const wheel = (e) => { e.preventDefault(); focus = Math.max(0, Math.min(1, focus + Math.sign(e.deltaY) * 0.025)); g.audio?.play('ui_tick', { vol: 0.1, gap: 40 }); };
  c.addEventListener('wheel', wheel, { passive: false });
  c.onclick = (e) => {
    const r = c.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * 160, y = ((e.clientY - r.top) / r.height) * 120;
    if (Math.abs(focus - goal) > 0.06) { g.audio?.play('error', { vol: 0.3 }); quality = Math.max(0.4, quality - 0.1); return; }
    const hit = targets.find((tg) => !tg.found && Math.hypot(tg.q.x + tg.q.nx - x, tg.q.y + tg.q.ny - y) < tg.q.r * 0.6 + 2);
    if (hit) { hit.found = true; g.audio?.play('beep', { vol: 0.4 }); if (targets.every((x2) => x2.found)) { run = false; setTimeout(() => done(quality), 400); } }
    else { quality = Math.max(0.4, quality - 0.08); g.audio?.play('boop', { vol: 0.3 }); }
  };
  return { stop: () => { run = false; }, key: (e) => { if (e.code === 'ArrowLeft') { focus = Math.max(0, focus - 0.025); return true; } if (e.code === 'ArrowRight') { focus = Math.min(1, focus + 0.025); return true; } return false; } };
}
function dnaGame(host, done, g) {
  const pairs = { A: 'T', T: 'A', C: 'G', G: 'C' };
  const seq = Array.from({ length: 10 }, () => 'ATCG'[Math.floor(Math.random() * 4)]);
  let i = 0, errors = 0, t0 = performance.now(), run = true;
  const el = document.createElement('div');
  host.appendChild(el);
  const render = () => {
    const left = Math.max(0, 25 - (performance.now() - t0) / 1000);
    el.innerHTML = `<div>DNA SEQUENCER · type the matching base (A↔T, C↔G)</div><pre style="font-size:34px;line-height:40px;margin-top:20px">${seq.map((b, k) => `<span class="${k < i ? 'dim' : k === i ? 'warn' : ''}">${b}</span>`).join(' ')}\n${seq.map((b, k) => (k < i ? pairs[b] : k === i ? '_' : '·')).join(' ')}</pre><div style="margin-top:20px">ERRORS: ${errors} · TIME ${left.toFixed(1)}s</div><div class="dim">Mutations so far: ${errors ? `${errors * 3}% banana` : 'none'}</div>`;
    if (left <= 0 && run) { run = false; done(Math.max(0.3, (i / seq.length) * (1 - errors * 0.08))); }
  };
  const tick = () => { if (!run) return; render(); setTimeout(tick, 100); };
  tick();
  return {
    stop: () => { run = false; },
    key: (e) => {
      const k = e.key?.toUpperCase();
      if (!'ATCG'.includes(k) || k.length !== 1) return false;
      if (pairs[seq[i]] === k) { i++; g.audio?.play('ui_tick', { vol: 0.3 }); if (i >= seq.length && run) { run = false; render(); setTimeout(() => done(Math.max(0.4, 1 - errors * 0.08)), 300); } }
      else { errors++; g.audio?.play('error', { vol: 0.3 }); }
      render();
      return true;
    },
  };
}
function brushGame(host, done, g) {
  const c = document.createElement('canvas'); c.width = 120; c.height = 90; c.style.cssText = 'width:560px;height:420px;box-shadow:0 0 0 2px #3a8a44;cursor:pointer';
  const side = document.createElement('div'); side.className = 'dim'; side.style.width = '300px';
  side.innerHTML = 'FOSSIL CLEANING<br><br>Hold the mouse and brush away the dirt.<br>Careful: scrubbing the bone itself scratches it.<br><br><div id="bp"></div>';
  host.appendChild(c); host.appendChild(side);
  const ctx = c.getContext('2d');
  // fossil shape mask (a little spiral ammonite or a skull)
  const mask = new Uint8Array(120 * 90), dirt = new Float32Array(120 * 90).fill(1);
  const ammo = Math.random() < 0.5;
  for (let y = 0; y < 90; y++) for (let x = 0; x < 120; x++) {
    const dx = x - 60, dy = y - 45, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
    if (ammo) { const sp = (r - (a + Math.PI) * 4) % 9; if (r < 34 && (sp < 3 || r < 4)) mask[y * 120 + x] = 1; }
    else { if ((dx * dx) / 900 + (dy * dy) / 400 < 1 && !(Math.hypot(dx + 10, dy + 4) < 5) && !(dy > 8 && Math.abs(dx) < 18 && (x % 5) < 2)) mask[y * 120 + x] = 1; }
  }
  let down = false, scratches = 0, run = true;
  const draw = () => {
    const img = ctx.createImageData(120, 90);
    let cleared = 0, total = 0;
    for (let i = 0; i < mask.length; i++) {
      const bone = mask[i], d = dirt[i];
      let col = bone ? [200, 255, 200] : [20, 60, 30];
      if (d > 0.05) col = [40 + d * 30, 90 + d * 20, 40];
      img.data[i * 4] = col[0]; img.data[i * 4 + 1] = col[1]; img.data[i * 4 + 2] = col[2]; img.data[i * 4 + 3] = 255;
      if (bone) { total++; if (d < 0.1) cleared++; }
    }
    ctx.putImageData(img, 0, 0);
    const pct = cleared / Math.max(1, total);
    side.querySelector('#bp').textContent = `REVEALED: ${Math.floor(pct * 100)}%  SCRATCHES: ${scratches}`;
    if (pct > 0.85 && run) { run = false; setTimeout(() => done(Math.max(0.4, 1 - scratches * 0.01)), 400); }
  };
  const brush = (e) => {
    if (!down) return;
    const r = c.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * 120, y = ((e.clientY - r.top) / r.height) * 90;
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      const px = Math.round(x + i), py = Math.round(y + j);
      if (px < 0 || py < 0 || px >= 120 || py >= 90 || i * i + j * j > 16) continue;
      const k = py * 120 + px;
      if (dirt[k] <= 0 && mask[k]) { if (Math.random() < 0.02) scratches++; continue; }
      dirt[k] = Math.max(0, dirt[k] - 0.18);
    }
    if (Math.random() < 0.3) g.audio?.play('rustle', { vol: 0.15, gap: 60 });
    draw();
  };
  c.onmousedown = (e) => { down = true; brush(e); };
  const up = () => { down = false; };
  window.addEventListener('mouseup', up);
  c.onmousemove = brush;
  draw();
  return { stop: () => { run = false; window.removeEventListener('mouseup', up); } };
}
function snake(c, onScore, g) {
  const ctx = c.getContext('2d');
  const W = 30, H = 20;
  let body = [[10, 10], [9, 10], [8, 10]], dir = [1, 0], next = [1, 0], egg = [20, 10], run = true, score = 0, dead = false;
  const place = () => { do { egg = [Math.floor(Math.random() * W), Math.floor(Math.random() * H)]; } while (body.some(([x, y]) => x === egg[0] && y === egg[1])); };
  const draw = () => {
    ctx.fillStyle = '#071408'; ctx.fillRect(0, 0, 300, 200);
    ctx.fillStyle = '#ffd060'; ctx.fillRect(egg[0] * 10 + 2, egg[1] * 10 + 1, 6, 8);
    body.forEach(([x, y], i) => { ctx.fillStyle = i === 0 ? '#c8ffc8' : '#8dff9a'; ctx.fillRect(x * 10 + 1, y * 10 + 1, 8, 8); });
    ctx.fillStyle = '#4a9a54'; ctx.font = '12px VT323'; ctx.fillText('EGGS: ' + score, 4, 196);
    if (dead) { ctx.fillStyle = '#ff7060'; ctx.font = '20px VT323'; ctx.fillText('EXTINCT. PRESS SPACE', 60, 100); }
  };
  const step = () => {
    if (!run) return;
    if (!dead) {
      dir = next;
      const h = [(body[0][0] + dir[0] + W) % W, (body[0][1] + dir[1] + H) % H];
      if (body.some(([x, y]) => x === h[0] && y === h[1])) { dead = true; g.audio?.play('roar', { vol: 0.3, rate: 2 }); onScore(score); }
      else { body.unshift(h); if (h[0] === egg[0] && h[1] === egg[1]) { score++; g.audio?.play('chirp', { vol: 0.25 }); place(); } else body.pop(); }
    }
    draw();
    setTimeout(step, Math.max(55, 120 - score * 3));
  };
  step();
  return {
    stop: () => { run = false; onScore(score); },
    key: (e) => {
      const m = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.code];
      if (m && !(m[0] === -dir[0] && m[1] === -dir[1])) { next = m; return true; }
      if (e.code === 'Space' && dead) { body = [[10, 10], [9, 10], [8, 10]]; dir = next = [1, 0]; score = 0; dead = false; place(); return true; }
      return !!m;
    },
  };
}

export async function install(g) {
  const C = new Computer(g);
  g.saveables.computer = { save: () => ({ read: [...C.read], hi: C.hi ?? 0, booted: C.booted }), load: (d) => { C.read = new Set(d?.read ?? []); C.hi = d?.hi ?? 0; } };
  return C;
}
