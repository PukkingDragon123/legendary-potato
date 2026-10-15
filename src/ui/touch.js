// Touch controls for phones and tablets: a floating move stick on the left,
// drag-to-look on the right, thumb buttons for use / jump / interact / aim,
// a top bar for the backpack, map, journal, build and menu, build-mode
// buttons, tappable hotbar slots, and a close button while a screen is open.
// Buttons fire the same key codes as the keyboard, so every system (and
// every menu that listens for keys) works without knowing about touch.
// chunky icons (24x24, stroked) for the bakelite buttons
const I = {
  fist: '<path d="M6 10.5V8a2 2 0 0 1 4 0v-.5a2 2 0 0 1 4 0V8a2 2 0 0 1 4 0v6a6 6 0 0 1-6 6h-1a5 5 0 0 1-5-5v-1.5a2 2 0 0 1 4 0"/><path d="M10 8v3M14 8v3"/>',
  jump: '<path d="M5 14l7-7 7 7"/><path d="M5 19l7-7 7 7"/>',
  hand: '<path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 10.5V9a1.5 1.5 0 0 1 3 0v2"/><path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4.3-2.5L5 14.5a1.6 1.6 0 0 1 2.6-1.8L9 14"/>',
  aim: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  duck: '<path d="M5 10l7 7 7-7"/><path d="M5 4h14"/>',
  paw: '<circle cx="7" cy="9" r="2"/><circle cx="12" cy="6.5" r="2"/><circle cx="17" cy="9" r="2"/><path d="M8 17c0-3 2-5 4-5s4 2 4 5c0 2-2 2.5-4 2.5S8 19 8 17z"/>',
  light: '<path d="M8 3h8l-1.5 5h-5z"/><rect x="9.5" y="8" width="5" height="12" rx="1"/><path d="M4 2l2 2M20 2l-2 2"/>',
  eye: '<path d="M2 12s4-6.5 10-6.5S22 12 22 12s-4 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  hammer: '<path d="M14 4l6 6-2.5 2.5-6-6z"/><path d="M12.5 7.5L3 17l3 3 9.5-9.5"/>',
  map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
  prof: '<path d="M12 2.5c4.6 0 7.5 4.2 7.5 9.5s-3 9.5-7.5 9.5S4.5 17.3 4.5 12 7.4 2.5 12 2.5z"/><rect x="8" y="7.5" width="8" height="6" rx="1"/><circle cx="9" cy="17" r="0.8" fill="currentColor"/><circle cx="12" cy="17.5" r="0.8" fill="currentColor"/><circle cx="15" cy="17" r="0.8" fill="currentColor"/>',
  menu: '<path d="M5 7h14M5 12h14M5 17h14"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  mat: '<rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/>',
  rot: '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/>',
  horn: '<path d="M3 10v4h3l6 4V6L6 10z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${I[k] ?? ''}</svg>`;
const BTN = {
  use: { label: 'USE', icon: 'fist', mouse: 'Mouse0', hold: true },
  jump: { label: 'JUMP', icon: 'jump', code: 'Space', hold: true },
  interact: { label: 'E', icon: 'hand', code: 'KeyE', hold: true },
  aim: { label: 'AIM', icon: 'aim', mouse: 'Mouse2', hold: true },
  crouch: { label: 'DUCK', icon: 'duck', code: 'KeyC', toggle: true },
  ride: { label: 'RIDE', icon: 'paw', code: 'KeyZ' },
  bag: { label: 'PROF', icon: 'prof', code: 'Tab' },
  map: { label: 'MAP', icon: 'map', code: 'KeyM' },
  log: { label: 'LOG', icon: 'menu', code: 'KeyJ' },
  build: { label: 'BUILD', icon: 'hammer', code: 'KeyB' },
  light: { label: 'LIGHT', icon: 'light', code: 'KeyL' },
  cam: { label: 'VIEW', icon: 'eye', code: 'KeyP' },
  menu: { label: 'MENU', icon: 'menu', code: 'Escape' },
  close: { label: 'CLOSE', icon: 'close', code: 'Escape' },
  prev: { label: '', icon: 'left', wheel: -1 },
  next: { label: '', icon: 'right', wheel: 1 },
  iprev: { label: '', icon: 'left', wheel: -1 },
  inext: { label: '', icon: 'right', wheel: 1 },
  mat: { label: 'MAT', icon: 'mat', code: 'KeyF' },
  rot: { label: 'ROT', icon: 'rot', code: 'KeyR' },
  horn: { label: 'HORN', icon: 'horn', code: 'KeyH', hold: true },
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
    for (const k of ['light', 'cam', 'build', 'map', 'bag', 'menu']) top.appendChild(this.button(k));
    // what is in your hand (there is no hotbar on screen any more): flick through it here
    const item = this.el('div', 'tcluster tc-item'); R.appendChild(item);
    item.appendChild(this.button('iprev'));
    this.itemSlot = this.el('div', 'titem'); item.appendChild(this.itemSlot);
    item.appendChild(this.button('inext'));
    this.clusters_item = item;
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
    b.innerHTML = `<span class="ti">${svg(def.icon)}</span>${def.label ? `<span class="tl">${def.label}</span>` : ''}`;
    b.setAttribute('aria-label', def.label || k);
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
      const lab = txt ? (txt.length > 12 ? txt.slice(0, 11) + '…' : txt) : '';
      const tl = this.btns.interact.querySelector('.tl');
      if (tl && tl.textContent !== lab) tl.textContent = lab;
      this.btns.interact.classList.toggle('ready', !!txt);
      const use = t?.use ?? (g.inventory?.heldDef?.()?.tool?.kind === 'scanner' ? 'Scan' : null);
      const ul = use ? use.toUpperCase().slice(0, 6) : 'USE';
      const ut = this.btns.use.querySelector('.tl');
      if (ut && ut.textContent !== ul) ut.textContent = ul;
      // the item in your hand
      const held = g.inventory?.held?.();
      const hk = held ? held.id + ':' + held.n : '';
      if (hk !== this._hk) { this._hk = hk; this.itemSlot.innerHTML = held && g.icons?.[held.id] ? `<img src="${g.icons[held.id]}">${held.n > 1 ? `<b>${held.n}</b>` : ''}` : ''; }
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
