// Touch controls for phones and tablets: a floating move stick on the left,
// drag-to-look on the right, thumb buttons for use / jump / interact / aim,
// a top bar for the backpack, map, journal, build and menu, build-mode
// buttons, tappable hotbar slots, and a close button while a screen is open.
// Buttons fire the same key codes as the keyboard, so every system (and
// every menu that listens for keys) works without knowing about touch.
const BTN = {
  use: { label: 'USE', mouse: 'Mouse0', hold: true },
  jump: { label: 'JUMP', code: 'Space', hold: true },
  interact: { label: 'E', code: 'KeyE', hold: true },
  aim: { label: 'AIM', mouse: 'Mouse2', hold: true },
  crouch: { label: 'DUCK', code: 'KeyC', toggle: true },
  ride: { label: 'RIDE', code: 'KeyZ' },
  bag: { label: 'BAG', code: 'Tab' },
  map: { label: 'MAP', code: 'KeyM' },
  log: { label: 'LOG', code: 'KeyJ' },
  build: { label: 'BUILD', code: 'KeyB' },
  light: { label: 'LIGHT', code: 'KeyL' },
  cam: { label: 'CAM', code: 'KeyP' },
  menu: { label: '☰', code: 'Escape' },
  close: { label: '✕', code: 'Escape' },
  prev: { label: '◀', wheel: -1 },
  next: { label: '▶', wheel: 1 },
  mat: { label: 'MAT', code: 'KeyF' },
  rot: { label: 'ROT', code: 'KeyR' },
  horn: { label: 'HORN', code: 'KeyH', hold: true },
};

export function isTouchDevice() {
  const qs = new URLSearchParams(location.search);
  if (qs.get('touch') === '1') return true;
  if (qs.get('touch') === '0') return false;
  return (window.matchMedia?.('(pointer: coarse)').matches ?? false) || 'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 1;
}

export class TouchControls {
  constructor(game) {
    this.name = 'touch';
    this.g = game;
    this.inp = game.input;
    this.root = document.createElement('div');
    this.root.id = 'touch';
    document.body.classList.add('touch');
    document.body.appendChild(this.root);
    this.btns = {};
    this.stick = null; // { id, x0, y0, x, y }
    this.looks = new Map(); // pointerId -> { x, y }
    this.toggled = new Set();
    this.build();
  }
  key(code, down) {
    const type = down ? 'keydown' : 'keyup';
    window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Escape' ? 'Escape' : code, bubbles: true }));
  }
  build() {
    const R = this.root;
    // zones
    this.moveZone = this.el('div', 'tz tz-move'); R.appendChild(this.moveZone);
    this.lookZone = this.el('div', 'tz tz-look'); R.appendChild(this.lookZone);
    this.stickBase = this.el('div', 'tstick'); this.stickKnob = this.el('div', 'tknob'); this.stickBase.appendChild(this.stickKnob); R.appendChild(this.stickBase);
    // button clusters
    const thumb = this.el('div', 'tcluster tc-thumb'); R.appendChild(thumb);
    for (const k of ['aim', 'interact', 'crouch', 'jump', 'ride', 'use']) thumb.appendChild(this.button(k));
    const top = this.el('div', 'tcluster tc-top'); R.appendChild(top);
    for (const k of ['light', 'cam', 'build', 'log', 'map', 'bag', 'menu']) top.appendChild(this.button(k));
    const bld = this.el('div', 'tcluster tc-build'); R.appendChild(bld);
    for (const k of ['prev', 'next', 'mat', 'rot']) bld.appendChild(this.button(k));
    const veh = this.el('div', 'tcluster tc-veh'); R.appendChild(veh);
    veh.appendChild(this.button('horn'));
    this.closeBtn = this.button('close'); this.closeBtn.classList.add('tclose'); R.appendChild(this.closeBtn);
    this.clusters = { thumb, top, bld, veh };
    // move stick
    this.moveZone.addEventListener('pointerdown', (e) => {
      if (this.stick) return;
      e.preventDefault();
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.stickBase.style.left = e.clientX + 'px'; this.stickBase.style.top = e.clientY + 'px';
      this.stickBase.classList.add('on');
      this.capture(this.moveZone, e);
    });
    // look drag
    this.lookZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.looks.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 });
      this.capture(this.lookZone, e);
    });
    window.addEventListener('pointermove', (e) => {
      if (this.stick && e.pointerId === this.stick.id) { this.stick.x = e.clientX; this.stick.y = e.clientY; }
      const L = this.looks.get(e.pointerId);
      if (L) {
        const dx = e.clientX - L.x, dy = e.clientY - L.y;
        L.x = e.clientX; L.y = e.clientY; L.moved += Math.abs(dx) + Math.abs(dy);
        const k = 1.9 * (this.g.settings?.touchSens ?? 1);
        this.inp.mdx += dx * k; this.inp.mdy += dy * k;
      }
    }, { passive: true });
    const end = (e) => {
      if (this.stick && e.pointerId === this.stick.id) { this.stick = null; this.stickBase.classList.remove('on'); }
      const L = this.looks.get(e.pointerId);
      if (L) {
        this.looks.delete(e.pointerId);
        // a quick tap on the world swings / uses, like a click
        if (L.moved < 10 && performance.now() - L.t < 260 && !this.g.uiOpen) this.inp.tap('Mouse0');
      }
    };
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    // hotbar slots become tappable
    const hb = this.g.ui?.el?.hotbar;
    if (hb) {
      hb.classList.add('tappable');
      hb.addEventListener('pointerdown', (e) => {
        const slot = e.target.closest('.slot');
        if (!slot) return;
        e.preventDefault(); e.stopPropagation();
        const i = [...hb.querySelectorAll('.slot')].indexOf(slot);
        if (i >= 0) { const code = 'Digit' + (i + 1); this.key(code, true); this.inp.tap(code); setTimeout(() => this.key(code, false), 60); }
      });
    }
  }
  // a very quick tap can already be over by the time we ask for the capture
  capture(el, e) { try { el.setPointerCapture?.(e.pointerId); } catch { /* released already */ } }
  el(tag, cls) { const e = document.createElement(tag); e.className = cls; return e; }
  button(k) {
    const def = BTN[k];
    const b = this.el('button', 'tbtn tb-' + k);
    b.type = 'button';
    b.textContent = def.label;
    b.setAttribute('aria-label', k);
    const press = (on) => {
      if (def.wheel) { if (on) this.inp.wheel += def.wheel; return; }
      if (def.mouse) { if (on) { this.inp.keys.add(def.mouse); this.inp.tap(def.mouse); } else this.inp.keys.delete(def.mouse); return; }
      this.key(def.code, on);
      if (on) this.inp.tap(def.code); // a quick tap still counts on a slow frame
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      this.g.audio?.init?.(); // a touch is a user gesture: wake the audio up
      if (def.toggle) {
        if (this.toggled.has(k)) { this.toggled.delete(k); press(false); b.classList.remove('lit'); } else { this.toggled.add(k); press(true); b.classList.add('lit'); }
        return;
      }
      b.classList.add('down');
      press(true);
      if (!def.hold) setTimeout(() => press(false), 70);
      this.capture(b, e);
    });
    const up = (e) => { if (def.toggle) return; b.classList.remove('down'); if (def.hold) press(false); e?.stopPropagation?.(); };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    this.btns[k] = b;
    return b;
  }
  update() {
    const g = this.g, inp = this.inp;
    // move stick -> analog axis (+ digital keys for code that asks for them)
    let ax = 0, ay = 0;
    if (this.stick) {
      const R = 58;
      let dx = this.stick.x - this.stick.x0, dy = this.stick.y - this.stick.y0;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      this.stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      ax = dx / R; ay = -dy / R;
      if (Math.hypot(ax, ay) < 0.12) { ax = 0; ay = 0; }
    }
    inp.touchAxis = { x: ax, y: ay };
    const set = (a, on) => { if (on) inp.virtual.add('@' + a); else inp.virtual.delete('@' + a); };
    set('forward', ay > 0.35); set('back', ay < -0.35); set('left', ax < -0.35); set('right', ax > 0.35);
    set('sprint', Math.hypot(ax, ay) > 0.93);
    // what is on screen
    const ui = g.ui, menu = !!(g.uiOpen || g.titleMode || ui?.pda || ui?.container || ui?.menuOpen || ui?.crtOpen);
    this.root.classList.toggle('t-screen', menu);
    this.root.classList.toggle('t-title', !!g.titleMode);
    const building = !!g.building?.active;
    this.clusters.bld.classList.toggle('on', building && !menu);
    const seat = g.local?.sitting;
    this.clusters.veh.classList.toggle('on', !!seat?.van && !menu);
    // the interact button shows what it will do
    this._lt = (this._lt ?? 0) - 1;
    if (this._lt <= 0) {
      this._lt = 6;
      const t = g.interaction?.target;
      const txt = t?.prompt?.text ?? (t?.interact ? `${t.interact}` : null);
      const lab = txt ? (txt.length > 14 ? txt.slice(0, 13) + '…' : txt) : 'E';
      if (this.btns.interact.textContent !== lab) this.btns.interact.textContent = lab;
      this.btns.interact.classList.toggle('ready', !!txt);
      const use = t?.use ?? (g.inventory?.heldDef?.()?.tool?.kind === 'scanner' ? 'Scan' : null);
      const ul = use ? use.toUpperCase().slice(0, 6) : 'USE';
      if (this.btns.use.textContent !== ul) this.btns.use.textContent = ul;
      this.btns.ride.classList.toggle('dim', !t?.alt && !g.local?.sitting?.dino);
    }
  }
}

export async function install(g) {
  if (!isTouchDevice()) return null;
  const T = new TouchControls(g);
  g.touch = T;
  g.addSystem(T);
  return T;
}
