// Slot-based inventory with stacking, durability and change notifications.
// The explorer's own one is tiny: a tool slot (tools and weapons only) and
// three pockets that refuse bulky things (logs live in the van rack and in
// crates; you drag those around with the gravity gun).
import { ITEMS } from '../data/items.js';

export class Inventory {
  constructor(size = 32, opt = {}) {
    this.size = size;
    this.slots = new Array(size).fill(null);
    this.hotbarSize = opt.hotbar ?? 8;
    this.toolSlot = opt.tool ?? null;
    this.noBulk = !!opt.noBulk;
    this.listeners = new Set();
    this.selected = 0;
  }
  // may this item sit in slot i?
  acceptAt(i, id) {
    if (!id) return true;
    if (this.accept && !this.accept(id)) return false;
    const d = ITEMS[id];
    if (!d) return false;
    if (this.toolSlot !== null && i === this.toolSlot) return d.cat === 'tool' || d.cat === 'weapon';
    if (this.noBulk && d.bulk) return false;
    return true;
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  changed() { for (const f of this.listeners) f(this); }
  stackOf(id) { return ITEMS[id]?.stack ?? 50; }
  makeSlot(id, n, extra) {
    const d = ITEMS[id];
    const s = { id, n };
    if (d?.durability) s.dur = d.durability;
    if (d?.charge) s.ch = d.charge;
    if (extra) Object.assign(s, extra);
    return s;
  }
  // returns how many could NOT be added
  add(id, n = 1, extra = null, quiet = false) {
    if (!ITEMS[id]) { console.warn('unknown item', id); return n; }
    if (this.accept && !this.accept(id)) return n;
    const max = this.stackOf(id);
    let left = n;
    if (max > 1) {
      for (let i = 0; i < this.size && left > 0; i++) {
        const s = this.slots[i];
        if (s && s.id === id && s.n < max && !s.unique && this.acceptAt(i, id)) {
          const k = Math.min(max - s.n, left);
          s.n += k; left -= k;
        }
      }
    }
    // prefer hotbar for tools/weapons, backpack for resources
    const preferHot = ['tool', 'weapon', 'food', 'placeable', 'med'].includes(ITEMS[id].cat);
    const order = preferHot ? [...Array(this.size).keys()] : [...Array(this.size).keys()].slice(this.hotbarSize).concat([...Array(this.hotbarSize).keys()]);
    for (const i of order) {
      if (left <= 0) break;
      if (!this.slots[i] && this.acceptAt(i, id)) {
        const k = Math.min(max, left);
        this.slots[i] = this.makeSlot(id, k, extra);
        left -= k;
      }
    }
    if (!quiet) this.changed();
    return left;
  }
  canAdd(id, n = 1) {
    const max = this.stackOf(id);
    let room = 0;
    for (const s of this.slots) { if (!s) room += max; else if (s.id === id) room += max - s.n; if (room >= n) return true; }
    return room >= n;
  }
  count(id) { let c = 0; for (const s of this.slots) if (s && s.id === id) c += s.n; return c; }
  has(req) { for (const [id, n] of Object.entries(req)) if (this.count(id) < n) return false; return true; }
  remove(id, n = 1, quiet = false) {
    if (this.count(id) < n) return false;
    let left = n;
    for (let i = this.size - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s && s.id === id) { const k = Math.min(s.n, left); s.n -= k; left -= k; if (s.n <= 0) this.slots[i] = null; }
    }
    if (!quiet) this.changed();
    return true;
  }
  take(req) { if (!this.has(req)) return false; for (const [id, n] of Object.entries(req)) this.remove(id, n, true); this.changed(); return true; }
  removeAt(i, n = 1) { const s = this.slots[i]; if (!s) return null; const k = Math.min(n, s.n); s.n -= k; const out = { ...s, n: k }; if (s.n <= 0) this.slots[i] = null; this.changed(); return out; }
  swap(a, b) {
    if (!this.acceptAt(a, this.slots[b]?.id) || !this.acceptAt(b, this.slots[a]?.id)) return false;
    [this.slots[a], this.slots[b]] = [this.slots[b], this.slots[a]]; this.changed(); return true;
  }
  moveTo(other, i) {
    const s = this.slots[i];
    if (!s) return;
    const { id: _id, n: _n, ...extra } = s; void _id; void _n;
    const left = other.add(s.id, s.n, Object.keys(extra).length ? extra : null);
    if (left <= 0) this.slots[i] = null; else s.n = left;
    this.changed();
  }
  held() { return this.slots[this.selected]; }
  heldDef() { const s = this.held(); return s ? ITEMS[s.id] : null; }
  useDurability(i, amt = 1) {
    const s = this.slots[i];
    if (!s || s.dur === undefined) return false;
    s.dur -= amt;
    if (s.dur <= 0) { this.slots[i] = null; this.changed(); return true; }
    this.changed();
    return false;
  }
  useCharge(i, amt = 1) {
    const s = this.slots[i];
    if (!s || s.ch === undefined) return true;
    if (s.ch < amt) return false;
    s.ch -= amt;
    this.changed();
    return true;
  }
  firstEmpty() { return this.slots.findIndex((s) => !s); }
  serialize() { return { size: this.size, slots: this.slots.map((s) => (s ? { ...s } : null)), selected: this.selected }; }
  // a save from a different layout (the old 32-slot backpack) is poured back in; what does not
  // fit is handed to onOverflow (the van rack takes it)
  load(d, onOverflow = null) {
    if (!d) return;
    const items = d.slots.filter((s) => s && ITEMS[s.id]);
    if ((d.size ?? this.size) === this.size) { this.slots = d.slots.map((s) => (s && ITEMS[s.id] ? { ...s } : null)); while (this.slots.length < this.size) this.slots.push(null); }
    else {
      this.slots = new Array(this.size).fill(null);
      const spill = [];
      for (const s of items) { const { id, n, ...extra } = s; const left = this.add(id, n, Object.keys(extra).length ? extra : null, true); if (left > 0) spill.push({ ...s, n: left }); }
      if (spill.length) onOverflow?.(spill);
    }
    this.selected = Math.min(d.selected ?? 0, this.size - 1);
    this.changed();
  }
  clear() { this.slots.fill(null); this.changed(); }
}
