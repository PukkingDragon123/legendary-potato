// Keyboard + mouse (pointer lock) + gamepad, mapped to named actions with
// per-frame edge detection. Rebindable.
export const DEFAULT_BINDS = {
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], crouch: ['ControlLeft', 'KeyC'],
  interact: ['KeyE'], use: ['Mouse0'], alt: ['Mouse2'], drop: ['KeyQ'], reload: ['KeyR'],
  inventory: ['Tab', 'KeyI'], build: ['KeyB'], map: ['KeyM'], journal: ['KeyJ'], chat: ['Enter', 'KeyT'],
  emote: ['KeyG'], voice: ['KeyV'], camera: ['KeyF5', 'F5', 'KeyP'], pause: ['Escape'], whistle: ['KeyF'],
  horn: ['KeyH'], dismount: ['KeyX'], rotate: ['KeyR'], hot1: ['Digit1'], hot2: ['Digit2'], hot3: ['Digit3'], hot4: ['Digit4'],
  hot5: ['Digit5'], hot6: ['Digit6'], hot7: ['Digit7'], hot8: ['Digit8'], command: ['KeyZ'], flashlight: ['KeyL'],
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
    try { const b = JSON.parse(localStorage.getItem('prehistoric-binds') || 'null'); if (b) Object.assign(this.binds, b); } catch { /* ignore */ }
    this.keys = new Set();
    this.prev = new Set();
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
    this.sensitivity = 0.0022;
    this.invertY = false;
    this.locked = false;
    this.enabled = true; // false while typing in UI
    this.listeners = [];
    this.gp = null;
    this.virtual = new Set(); // scripted presses (tests / touch)
    this.taps = new Set(); // short presses that must last at least one frame (touch buttons)
    const on = (t, e, f, o) => { t.addEventListener(e, f, o); this.listeners.push([t, e, f, o]); };
    on(window, 'keydown', (e) => {
      if (!this.enabled && e.code !== 'Escape' && e.code !== 'Enter') return;
      if (['Tab', 'Space', 'F5', 'ArrowUp', 'ArrowDown'].includes(e.code) || (e.ctrlKey && e.code === 'KeyW')) e.preventDefault();
      this.keys.add(e.code);
    });
    on(window, 'keyup', (e) => this.keys.delete(e.code));
    on(window, 'blur', () => this.keys.clear());
    on(canvas, 'mousedown', (e) => {
      if (!this.enabled) return;
      this.keys.add('Mouse' + e.button);
      if (!this.locked && this.wantLock) this.lock();
    });
    on(window, 'mouseup', (e) => this.keys.delete('Mouse' + e.button));
    on(window, 'mousemove', (e) => { if (this.locked) { this.mdx += e.movementX; this.mdy += e.movementY; } });
    on(window, 'wheel', (e) => { if (this.locked || this.enabled) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    on(window, 'contextmenu', (e) => { if (this.locked) e.preventDefault(); });
    on(document, 'pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (this.onLockChange) this.onLockChange(this.locked); });
    this.wantLock = true;
  }
  lock() { try { const p = this.canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => this.canvas.requestPointerLock()); } catch { /* not supported */ } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  _isDown(code) { return this.keys.has(code) || this.virtual.has(code) || this.taps.has(code); }
  tap(code) { this.taps.add(code); }
  down(action) {
    if (this.virtual.has('@' + action)) return true;
    const b = this.binds[action];
    if (b) for (const c of b) if (this._isDown(c)) return true;
    return this.gpDown(action);
  }
  pressed(action) {
    if (this.virtual.has('@' + action) && !this.prev.has('@' + action)) return true;
    const b = this.binds[action];
    if (!b) return false;
    for (const c of b) if (this._isDown(c) && !this.prev.has(c)) return true;
    return this.gpPressed(action);
  }
  released(action) {
    const b = this.binds[action];
    if (!b) return false;
    for (const c of b) if (!this._isDown(c) && this.prev.has(c)) return true;
    return false;
  }
  axis() {
    let x = 0, y = 0;
    if (this.down('left')) x -= 1; if (this.down('right')) x += 1;
    if (this.down('forward')) y += 1; if (this.down('back')) y -= 1;
    if (this.gp) { const ax = this.gp.axes; if (Math.hypot(ax[0], ax[1]) > 0.18) { x = ax[0]; y = -ax[1]; } }
    // analog touch stick wins over the digital keys it also presses
    if (this.touchAxis && (this.touchAxis.x || this.touchAxis.y)) { x = this.touchAxis.x; y = this.touchAxis.y; }
    const l = Math.hypot(x, y);
    return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }
  look() {
    let dx = this.mdx * this.sensitivity, dy = this.mdy * this.sensitivity * (this.invertY ? -1 : 1);
    if (this.gp) { const ax = this.gp.axes; if (Math.abs(ax[2]) > 0.15) dx += ax[2] * 0.045; if (Math.abs(ax[3]) > 0.15) dy += ax[3] * 0.035; }
    return { dx, dy };
  }
  // gamepad (standard mapping)
  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((p) => p && p.connected);
    this.gpPrev = this.gpButtons || [];
    this.gp = gp || null;
    this.gpButtons = gp ? gp.buttons.map((b) => b.pressed) : [];
  }
  static GP = { jump: 0, interact: 2, use: 7, alt: 6, inventory: 3, build: 1, sprint: 10, crouch: 11, pause: 9, drop: 4, map: 8, emote: 12, voice: 5 };
  gpDown(action) { const i = Input.GP[action]; return i !== undefined && !!this.gpButtons?.[i]; }
  gpPressed(action) { const i = Input.GP[action]; return i !== undefined && !!this.gpButtons?.[i] && !this.gpPrev?.[i]; }

  endFrame() {
    this.prev = new Set([...this.keys, ...this.virtual, ...this.taps]);
    this.taps.clear();
    this.mdx = 0; this.mdy = 0; this.wheel = 0;
  }
  rebind(action, code) {
    this.binds[action] = [code];
    try { localStorage.setItem('prehistoric-binds', JSON.stringify(this.binds)); } catch { /* ignore */ }
  }
  keyName(action) {
    const c = (this.binds[action] || [])[0] || '?';
    return c.replace('Key', '').replace('Digit', '').replace('Mouse0', 'LMB').replace('Mouse2', 'RMB').replace('ShiftLeft', 'Shift').replace('ControlLeft', 'Ctrl').replace('Space', 'Space');
  }
}
