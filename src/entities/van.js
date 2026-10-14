// The Chrono-Van: starting shelter, lab, workshop and (once repaired) a
// drivable mobile base. Owns the van model, its colliders (moving with it),
// every physical interaction (doors, seats, breakers, crank, glovebox, CRTs,
// storage, repairs, upgrades, time machine sockets + lever), the power
// network, and a raycast-suspension driving model with a chase camera.
import * as THREE from 'three';
import { buildVan, vanColliders, VAN, std, box, cyl, mk, at } from './vanModel.js';
import { REPAIRS, UPGRADES, upgradeById, DRIVE_NEEDS, buildDynamo, buildHarness, buildEngineBay, buildUpgrade } from './vanUpgrades.js';
import { VanAudio, STATIONS } from '../audio/vanAudio.js';
import { Inventory } from '../systems/inventory.js';
import { ITEMS } from '../data/items.js';
import { textTexture } from '../gfx/vanTextures.js';
import { buildItemModel } from '../gfx/itemModels.js';

const SW = { LIGHTS: 0, COMPUTER: 1, RADIO: 2, CHRONO: 3 };
const DRAW = [0.03, 0.05, 0.012, 0.22]; // battery % per second per breaker
const SOCKETS = ['temporal_coil', 'flux_crystal', 'nav_chip', 'power_core', 'stabilizer'];
const WHEELBASE = VAN.rearAxle - VAN.frontAxle, TRACK = 1.72;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _ray = new THREE.Ray(), _hit = new THREE.Vector3();
const _box = new THREE.Box3(), _c = new THREE.Vector3(), _sz = new THREE.Vector3();
const OCCLUDERS = new Set(['wallL', 'wallL_cab', 'wallR_cab', 'wallR_back', 'slide', 'rear', 'roof']);

export class Van {
  constructor(game) {
    this.name = 'van';
    this.g = game;
    const built = buildVan();
    this.root = built.root; this.body = built.body; this.parts = built.parts;
    game.engine.scene.add(this.root);
    this.audio = new VanAudio(game);
    this.lift = 0;
    // --------------------------------------------------------- state
    const c = game.crash;
    // rest at the end of the skid trench, nose to the south-west, slewed a bit sideways
    const yaw = Math.atan2(45, -41) + 0.38;
    this.s = {
      x: c.x + 3.2, z: c.z - 1.6, yaw,
      doors: {}, sw: [false, false, false, false], charge: 4, fuel: 0,
      repaired: {}, upgrades: {}, sockets: {}, glove: 'jammed', glovehits: 0, hood: false, radio: -1, hp: 100, odo: 0, firstPower: false,
    };
    this.pose = { x: 0, y: 0, z: 0, yaw, pitch: 0, roll: 0, vy: 0 };
    this.storage = new Inventory(12, { hotbar: 0 });
    this.fridge = new Inventory(8, { hotbar: 0 });
    this.shelf = new Inventory(6, { hotbar: 0 });
    this.dock = new Inventory(2, { hotbar: 0 });
    this.shelf.accept = (id) => ITEMS[id]?.cat === 'specimen';
    this.dock.accept = (id) => !!ITEMS[id]?.charge;
    this.fridge.accept = (id) => ITEMS[id]?.cat === 'food' || !!ITEMS[id]?.egg;
    // starting supplies in the lockers
    this.storage.add('noodles', 3, null, true); this.storage.add('scrap', 3, null, true); this.storage.add('rope', 2, null, true); this.storage.add('coffee', 1, null, true);
    this.fridge.add('energybar', 2, null, true); this.fridge.add('water_clean', 2, null, true);
    // --------------------------------------------------------- driving
    this.drive = { on: false, starting: 0, speed: 0, steer: 0, rpm: 0, throttle: 0, gear: 1, idleT: 0, airborne: false, lastHit: 0, stall: 0 };
    this.driver = null; this.passengers = new Map(); // seat -> player
    // --------------------------------------------------------- extra models
    this.extras = {};
    this.buildExtras();
    this.ia = [];
    this.buildInteractables();
    // lights
    this.bulbSrc = game.lightPool?.add({ pos: new THREE.Vector3(), color: 0xffd890, intensity: 0, range: 6.5, on: false, priority: 2 });
    this.machineSrc = game.lightPool?.add({ pos: new THREE.Vector3(), color: 0x60d8ff, intensity: 0, range: 5, on: false, priority: 1.5 });
    this.head = new THREE.SpotLight(0xfff2d0, 0, 45, 0.55, 0.5, 1.4);
    this.head.position.set(-0.72, 0.85, VAN.z0); this.head.target.position.set(-0.72, 0.2, VAN.z0 - 10);
    this.root.add(this.head, this.head.target);
    this.flood = new THREE.SpotLight(0xfff8e8, 0, 60, 0.9, 0.6, 1.2);
    this.flood.position.set(0, VAN.roof + 0.45, -1.6); this.flood.target.position.set(0, -1, -14);
    this.root.add(this.flood, this.flood.target);
    // --------------------------------------------------------- pose + colliders
    this.shapes = [];
    this.restOnGround(true);
    this.rebuildColliders();
    this.t = 0;
    this.fxT = 0;
    this.screenT = 0;
    this.boot = [0, 0, 0]; // per-screen boot progress (seconds since powered)
    this.holding = null;
    this.cursorBlink = 0;
    this.applyAll();
  }

  // ======================================================================== world pose
  wheelLocal(i) { const w = this.parts.wheels[i]; return _v.set(w.sx * 0.86, 0, w.az); }
  sampleWheels(x, z, yaw, out) {
    const cs = Math.cos(yaw), sn = Math.sin(yaw);
    const s = this.g.sampler;
    for (let i = 0; i < 4; i++) {
      const w = this.parts.wheels[i];
      const lx = w.sx * 0.86, lz = w.az;
      const wx = x + lx * cs + lz * sn, wz = z - lx * sn + lz * cs;
      let h = s.heightAt(wx, wz);
      if (i === 0 && !this.s.repaired.tire) h -= 0.12;
      out[i] = h;
    }
    return out;
  }
  restOnGround(snap = false) {
    const P = this.pose;
    const h = this.sampleWheels(this.s.x, this.s.z, this.s.yaw, [0, 0, 0, 0]);
    P.x = this.s.x; P.z = this.s.z; P.yaw = this.s.yaw;
    const ty = (h[0] + h[1] + h[2] + h[3]) / 4;
    const tp = Math.atan2((h[0] + h[1]) / 2 - (h[2] + h[3]) / 2, WHEELBASE);
    const tr = Math.atan2((h[1] + h[3]) / 2 - (h[0] + h[2]) / 2, TRACK);
    if (snap) { P.y = ty; P.pitch = tp; P.roll = tr; P.vy = 0; }
    return { ty, tp, tr };
  }
  applyPose() {
    const P = this.pose;
    this.root.position.set(P.x, P.y, P.z);
    this.root.rotation.set(P.pitch, P.yaw, P.roll, 'YXZ');
    this.root.updateMatrixWorld(true);
    this.updateShapes();
  }
  get pos() { return this.root.position; }
  localToWorld(v, out = new THREE.Vector3()) { return out.copy(v).applyMatrix4(this.root.matrixWorld); }
  worldToLocal(v, out = new THREE.Vector3()) { _m.copy(this.root.matrixWorld).invert(); return out.copy(v).applyMatrix4(_m); }
  near(p, r = 4.5) { return (p.x - this.pose.x) ** 2 + (p.z - this.pose.z) ** 2 < (r + 2.5) ** 2; }
  isInside(p) { const l = this.worldToLocal(p, _w); return Math.abs(l.x) < 0.95 && l.z > -1.0 && l.z < 2.4 && l.y > VAN.floor - 0.3 + this.lift && l.y < VAN.roof + this.lift; }
  isOnRoof(p) { if (!this.s.upgrades.roofdeck) return false; const l = this.worldToLocal(p, _w); return Math.abs(l.x) < 1.0 && l.z > -1.7 && l.z < 2.4 && l.y > VAN.roof + this.lift && l.y < VAN.roof + this.lift + 0.6; }

  // ======================================================================== colliders
  rebuildColliders() {
    const d = this.s.doors;
    const local = vanColliders({ slideOpen: !!d.door_slide, rearOpen: !!(d.door_rear_l || d.door_rear_r), cabL: !!d.door_cab_l, cabR: !!d.door_cab_r, roofdeck: !!this.s.upgrades.roofdeck, lift: this.lift });
    this.shapes = local.map((c) => ({ type: 'box', local: c, x: 0, y: 0, z: 0, hx: c.hx, hy: c.hy, hz: c.hz, yaw: 0, cos: 1, sin: 0, walk: c.walk, solid: c.solid, id: 'van_' + c.id, ref: this, kind: 'van' }));
    this.updateShapes();
  }
  updateShapes() {
    const P = this.pose;
    const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw);
    const tilt = Math.abs(Math.sin(P.pitch)), roll = Math.abs(Math.sin(P.roll));
    for (const s of this.shapes) {
      const c = s.local;
      _v.set(c.x, c.y, c.z).applyMatrix4(this.root.matrixWorld);
      s.x = _v.x; s.y = _v.y; s.z = _v.z; s.yaw = P.yaw; s.cos = cs; s.sin = sn;
      // walls grow vertically a little when tilted so there are no gaps
      s.hy = c.walk ? c.hy : c.hy + tilt * c.hz + roll * c.hx;
    }
    this._bx = P.x; this._bz = P.z;
  }
  collidersNear(x, z, r, out) {
    if ((x - this.pose.x) ** 2 + (z - this.pose.z) ** 2 > (r + 4) ** 2) return;
    for (const s of this.shapes) out.push(s);
  }

  // ======================================================================== extra visuals
  buildExtras() {
    const B = this.body, P = this.parts;
    // charge dock on the bench
    const dock = new THREE.Group(); dock.position.set(-0.62, 1.0, -0.15); B.add(dock);
    dock.add(box(0.2, 0.07, 0.3, std('dockgrey', { color: 0x5a5e66, roughness: 0.5, metalness: 0.3 }), 0, 0.035, 0, 0.012, 0));
    P.dockLeds = [];
    for (let k = 0; k < 2; k++) {
      dock.add(box(0.12, 0.012, 0.09, std('black', {}), 0, 0.072, -0.07 + k * 0.14, 0, 0));
      const led = mk(new THREE.BoxGeometry(0.015, 0.012, 0.015), std('dockled' + k, { color: 0x101810, emissive: 0x40ff60, emissiveIntensity: 0 }), false);
      led.position.set(0.09, 0.07, -0.07 + k * 0.14); dock.add(led); P.dockLeds.push(led);
    }
    const lab = mk(new THREE.PlaneGeometry(0.2, 0.04), std('docklabel', { map: textTexture(['CHARGE-O-TRON'], { w: 128, h: 28, bg: '#d8d0b8', fg: '#17130e', size: 14 }) }), false);
    lab.position.set(0.101, 0.035, 0); lab.rotation.y = Math.PI / 2; dock.add(lab);
    P.dock = dock; P.dockItems = [null, null];
    // cabinet doors (storage) on the bench front
    const cab = new THREE.Group(); cab.position.set(-0.415, 0.78, 0.25); B.add(cab);
    for (let k = 0; k < 3; k++) {
      const door = box(0.02, 0.34, 0.5, std('cabdoor', { color: 0xd8c8a0, roughness: 0.7 }), 0, 0, -0.55 + k * 0.55, 0.008, 0); cab.add(door);
      cab.add(box(0.025, 0.03, 0.08, std('chrome', {}), 0.015, 0.1, -0.55 + k * 0.55 + 0.17, 0.005, 0));
    }
    P.cabinet = cab;
    // fuel cap on the rear-left side
    const cap = cyl(0.06, 0.06, 0.03, std('fuelcap', { color: 0x2a2826, roughness: 0.5 }), 12); cap.rotation.z = Math.PI / 2; cap.position.set(-VAN.W / 2 - 0.01, 0.9, 1.95); B.add(cap); P.fuelCap = cap;
    // engine bay under the hood
    this.engineBay = buildEngineBay(false); this.engineBay.visible = false; B.add(this.engineBay);
    // dangling broken wires at the breaker (removed when rewired)
    const sparks = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const pts = [new THREE.Vector3(-0.6 + k * 0.08, 1.3, -0.95), new THREE.Vector3(-0.58 + k * 0.1, 1.05, -0.9), new THREE.Vector3(-0.55 + k * 0.12, 0.9 - k * 0.05, -0.8)];
      sparks.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.01, 4), std('cable' + [0xd03030, 0x2a50a0, 0xf2d040][k], {}), false));
    }
    B.add(sparks); P.brokenWires = sparks;
  }

  // ======================================================================== interactables
  // Each: { id, obj, box (local to obj), label(), prompt() -> {text, key?, hold?}, act(), hold?: {...}, hit?() }
  buildInteractables() {
    const P = this.parts, g = this.g, S = this.s;
    const ia = (o) => { o.box = new THREE.Box3(new THREE.Vector3(...o.min), new THREE.Vector3(...o.max)); this.ia.push(o); return o; };
    const hasItem = (id) => g.inventory.count(id) > 0;
    // doors ------------------------------------------------------------
    const doorBoxes = {
      door_cab_l: [[-0.06, 0.45, 0], [0.08, 2.0, 0.86]], door_cab_r: [[-0.08, 0.45, 0], [0.06, 2.0, 0.86]],
      door_slide: [[-0.04, 0.45, 0], [0.08, 2.1, 1.42]],
      door_rear_l: [[0, 0.5, -0.06], [0.98, 2.05, 0.06]], door_rear_r: [[-0.98, 0.5, -0.06], [0, 2.05, 0.06]],
    };
    const doorNames = { door_cab_l: 'Driver Door', door_cab_r: 'Passenger Door', door_slide: 'Sliding Door', door_rear_l: 'Back Doors', door_rear_r: 'Back Doors' };
    for (const [name, [mn, mx]] of Object.entries(doorBoxes)) {
      ia({ id: name, obj: P.doors[name].g, min: mn, max: mx, label: () => doorNames[name], prompt: () => ({ text: (S.doors[name] ? 'Close ' : 'Open ') + doorNames[name] }), act: () => this.request('door', { name, open: !S.doors[name] }) });
    }
    // seats --------------------------------------------------------------
    for (const [name, label] of [['seat_driver', 'Driver Seat'], ['seat_pass', 'Passenger Seat']]) {
      const seat = P.seats[name];
      ia({ id: name, obj: seat.g, min: [-0.3, 0.2, -0.3], max: [0.3, 1.2, 0.35], label: () => label, prompt: () => (this.seatTaken(name) ? { text: 'Seat taken', key: '-' } : { text: 'Sit in ' + label }), act: () => this.sit(g.local, name) });
    }
    // breaker switches -----------------------------------------------------
    P.switches.forEach((sw, i) => {
      ia({ id: 'sw' + i, obj: sw.g, min: [-0.042, -0.12, 0], max: [0.042, 0.14, 0.045], label: () => 'Breaker: ' + sw.label, info: () => this.powerInfo(), prompt: () => ({ text: (S.sw[i] ? 'Switch OFF ' : 'Switch ON ') + sw.label }), act: () => this.request('switch', { i, on: !S.sw[i] }) });
    });
    // battery bank + dynamo ------------------------------------------------
    ia({
      id: 'battery', obj: this.body, min: [-0.8, 0.55, -0.45], max: [-0.36, 0.95, 0.9], label: () => 'Battery Bank', info: () => this.powerInfo(),
      prompt: () => S.repaired.dynamo ? { text: 'Hold to crank the dynamo', hold: true } : hasItem('crank_dynamo') ? { text: 'Hold to bolt on the Hand-Crank Dynamo', hold: true } : { text: 'Batteries are flat. Needs a Hand-Crank Dynamo', key: '-', warn: 'Craft it at the van workshop (scrap, wire, sticks)' },
      hold: () => S.repaired.dynamo ? { time: Infinity, anim: 'crank', tick: (dt) => this.crank(dt), end: () => this.crankEnd() } : hasItem('crank_dynamo') ? { time: REPAIRS.dynamo.time, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'dynamo'), done: () => this.request('repair', { id: 'dynamo' }) } : null,
    });
    // dynamo crank (once installed it is its own target, easier to aim at)
    ia({ id: 'crank', obj: this.body, min: [-0.42, 0.6, -0.8], max: [-0.12, 1.05, -0.45], enabled: () => !!S.repaired.dynamo, label: () => 'Hand-Crank Dynamo', info: () => this.powerInfo(), prompt: () => ({ text: 'Hold to crank', hold: true }), hold: () => ({ time: Infinity, anim: 'crank', tick: (dt) => this.crank(dt), end: () => this.crankEnd() }) });
    // computer screens -------------------------------------------------------
    P.screens.forEach((scr, i) => {
      ia({
        id: 'screen' + i, obj: scr.g, min: [-scr.w / 2, -scr.h / 2, -0.1], max: [scr.w / 2, scr.h / 2, 0.25], label: () => (i === 0 ? 'Main Computer' : i === 1 ? 'DINO-DEX Monitor' : 'Flux Monitor'),
        info: () => (this.screenOn(i) ? 'CHRONO-OS 0.9' : !S.sw[SW.COMPUTER] ? 'Computer breaker is off' : S.charge <= 0 ? 'No power' : i > 0 && !S.repaired.crt ? 'Broken monitor' : 'Booting...'),
        prompt: () => {
          if (i > 0 && !S.repaired.crt) return hasItem('crt_part') ? { text: 'Hold to fix the monitors', hold: true } : { text: 'Broken monitor', key: '-', warn: 'Needs a CRT Repair Kit' };
          return this.screenOn(i) ? { text: 'Use Computer' } : { text: 'Computer is off', key: '-', warn: S.charge <= 0 ? 'Charge the batteries first' : 'Flip the COMPUTER breaker' };
        },
        act: () => { if (this.screenOn(i) && (i === 0 || S.repaired.crt)) this.useComputer(i); },
        hold: () => (i > 0 && !S.repaired.crt && hasItem('crt_part') ? { time: REPAIRS.crt.time, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'crt'), done: () => this.request('repair', { id: 'crt' }) } : null),
        hit: () => { if (!this.screenOn(i)) return; g.audio?.play('degauss', { pos: this.localToWorld(_v.set(-0.7, 1.2, 0.15)), vol: 0.5 }); this.boot[i] = Math.min(this.boot[i], 0.3); g.ui?.toast('You smacked the monitor. It works better now. Probably.'); },
      });
    });
    // glovebox ---------------------------------------------------------------------
    ia({
      id: 'glovebox', obj: P.glovebox, min: [-0.2, -0.09, -0.05], max: [0.2, 0.09, 0.08], label: () => 'Glovebox',
      prompt: () => (S.glove === 'jammed' ? { text: 'Open Glovebox' } : S.glove === 'open' ? { text: 'Grab stuff from Glovebox' } : { text: 'Glovebox (empty)', key: '-' }),
      act: () => { if (S.glove === 'jammed') { g.ui?.toast('It\'s jammed shut. Give it a good whack!', 'warn'); g.audio?.play('clack', { pos: this.localToWorld(_v.set(0.48, 0.92, -1.81)) }); } else if (S.glove === 'open') this.request('glove', {}); },
      hit: () => { if (S.glove !== 'jammed') return; S.glovehits++; g.audio?.play('thud', { pos: this.localToWorld(_v.set(0.48, 0.92, -1.81)), vol: 0.6 }); this.bobbleKick(1.5); if (S.glovehits >= 3) this.request('gloveOpen', {}); else g.ui?.toast(['Bonk.', 'BONK!'][S.glovehits - 1]); },
    });
    // radio -----------------------------------------------------------------------
    ia({ id: 'radio', obj: this.body, min: [-0.18, 0.98, -1.88], max: [0.18, 1.14, -1.75], label: () => 'Cassette Radio', info: () => (S.radio >= 0 ? STATIONS[S.radio].name : 'Off'), prompt: () => (!S.sw[SW.RADIO] || S.charge <= 0 ? { text: 'Radio has no power', key: '-', warn: 'Flip the RADIO breaker' } : { text: S.radio < 0 ? 'Turn on Radio' : S.radio < STATIONS.length - 1 ? 'Next Station' : 'Turn off Radio' }), act: () => { if (S.sw[SW.RADIO] && S.charge > 0) this.request('radio', { st: S.radio + 1 >= STATIONS.length ? -1 : S.radio + 1 }); } });
    // bobblehead + dice ---------------------------------------------------------
    ia({ id: 'bobble', obj: this.body, min: [0.15, 1.16, -2.0], max: [0.25, 1.32, -1.9], label: () => 'Dino Bobblehead', info: () => 'His name is Gerald', prompt: () => ({ text: 'Poke Gerald' }), act: () => { this.bobbleKick(3); g.audio?.play('squeak', { pos: this.localToWorld(_v.set(0.2, 1.25, -1.95)), vol: 0.5 }); }, hit: () => this.bobbleKick(5) });
    // storage ------------------------------------------------------------------
    ia({ id: 'cabinet', obj: this.body, min: [-0.45, 0.58, -0.6], max: [-0.36, 0.98, 1.1], label: () => 'Van Lockers', prompt: () => ({ text: 'Open Lockers' }), act: () => g.ui?.openContainer({ inv: this.storage }, 'Van Lockers', { label: 'Lockers', cols: 4 }) });
    ia({ id: 'fridge', obj: this.body, min: [0.5, 0.58, 1.34], max: [0.94, 1.08, 1.86], label: () => 'Cooler', info: () => 'Food spoils 3x slower', prompt: () => ({ text: 'Open Cooler' }), act: () => g.ui?.openContainer({ inv: this.fridge }, 'Cooler', { label: 'Cooler', cols: 4 }) });
    ia({ id: 'shelf', obj: this.body, min: [0.56, 1.18, 0.52], max: [0.94, 1.75, 1.38], label: () => 'Specimen Shelf', info: () => 'Store specimens for the lab', prompt: () => ({ text: 'Open Specimen Shelf' }), act: () => g.ui?.openContainer({ inv: this.shelf }, 'Specimen Shelf', { label: 'Specimen Jars', cols: 3 }) });
    ia({ id: 'dock', obj: P.dock, min: [-0.11, 0, -0.16], max: [0.11, 0.1, 0.16], label: () => 'CHARGE-O-TRON 3000', info: () => this.dockInfo(), prompt: () => ({ text: 'Open Charging Dock' }), act: () => g.ui?.openContainer({ inv: this.dock }, 'Charge-O-Tron 3000', { label: 'Charging Slots', cols: 2, extra: () => this.dockPanel() }) });
    // fuel cap ------------------------------------------------------------------
    ia({ id: 'fuel', obj: this.body, min: [-1.12, 0.78, 1.82], max: [-0.96, 1.02, 2.08], label: () => 'Fuel Tank', info: () => `Dung-o-Diesel: ${S.fuel.toFixed(1)} / 10`, prompt: () => (hasItem('biofuel') ? { text: 'Pour in Dung-o-Diesel' } : { text: 'Fuel tank', key: '-', warn: S.fuel <= 0 ? 'Empty. Needs Dung-o-Diesel' : null }), act: () => { if (hasItem('biofuel') && S.fuel <= 9) this.request('refuel', {}); } });
    // hood / engine ------------------------------------------------------------
    ia({
      id: 'hood', obj: this.body, min: [-0.97, 0.75, -2.5], max: [0.97, 1.12, -1.95], label: () => 'Engine Hatch', info: () => (S.repaired.engine ? 'Engine: rebuilt' : 'Engine: smoking, missing pistons'),
      prompt: () => (!S.hood ? { text: 'Open Engine Hatch' } : !S.repaired.engine ? (hasItem('engine_parts') ? { text: 'Hold to rebuild the Engine', hold: true } : { text: 'Close Engine Hatch', warn: 'Engine needs Engine Parts' }) : { text: 'Close Engine Hatch' }),
      act: () => this.request('hood', { open: !S.hood }),
      hold: () => (S.hood && !S.repaired.engine && hasItem('engine_parts') ? { time: REPAIRS.engine.time, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'engine'), done: () => this.request('repair', { id: 'engine' }) } : null),
    });
    // wheels -------------------------------------------------------------------
    ia({
      id: 'wheel_fl', obj: this.body, min: [-1.1, 0, -2.0], max: [-0.6, 0.8, -1.1], label: () => 'Front-Left Wheel',
      info: () => [!S.repaired.tire ? 'Flat tire' : null, !S.repaired.axle ? 'Bent axle' : null].filter(Boolean).join(' · ') || 'Good as new',
      prompt: () => {
        if (!S.repaired.tire) return hasItem('spare_tire') ? { text: 'Hold to swap the tire', hold: true } : { text: 'Flat tire', key: '-', warn: 'Needs a Patched Tire' };
        if (!S.repaired.axle) return hasItem('axle') ? { text: 'Hold to fix the axle', hold: true } : { text: 'Bent axle', key: '-', warn: 'Needs a Reinforced Axle' };
        return null;
      },
      hold: () => {
        if (!S.repaired.tire && hasItem('spare_tire')) return { time: REPAIRS.tire.time, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'tire'), done: () => this.request('repair', { id: 'tire' }) };
        if (S.repaired.tire && !S.repaired.axle && hasItem('axle')) return { time: REPAIRS.axle.time, anim: 'hammer', tick: (dt, t) => this.repairTick(dt, t, 'axle'), done: () => this.request('repair', { id: 'axle' }) };
        return null;
      },
    });
    ia({ id: 'headlight', obj: this.body, min: [0.55, 0.7, -2.55], max: [0.9, 1.0, -2.4], enabled: () => !S.repaired.headlight, label: () => 'Smashed Headlight', prompt: () => (g.inventory.has(REPAIRS.headlight.cost) ? { text: 'Hold to replace (glass + scrap)', hold: true } : { text: 'Smashed headlight', key: '-', warn: 'Needs 1 glass + 1 scrap' }), hold: () => (g.inventory.has(REPAIRS.headlight.cost) ? { time: REPAIRS.headlight.time, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'headlight'), done: () => this.request('repair', { id: 'headlight' }) } : null) });
    ia({ id: 'windshield', obj: this.body, min: [-0.95, 1.15, -2.2], max: [0.95, 2.1, -1.85], enabled: () => !S.repaired.windshield && !this.driverIs(g.local), label: () => 'Cracked Windshield', prompt: () => (g.inventory.has(REPAIRS.windshield.cost) ? { text: 'Hold to patch (glass + resin)', hold: true } : { text: 'Cracked windshield', key: '-', warn: 'Needs 3 glass + 2 resin' }), hold: () => (g.inventory.has(REPAIRS.windshield.cost) ? { time: REPAIRS.windshield.time, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'windshield'), done: () => this.request('repair', { id: 'windshield' }) } : null) });
    // breaker panel itself (rewire) --------------------------------------------
    ia({ id: 'loom', obj: this.body, min: [-0.72, 0.85, -1.0], max: [-0.38, 1.3, -0.78], enabled: () => !S.repaired.wiring, label: () => 'Fried Wiring', info: () => 'Ignition + CHRONO circuits dead', prompt: () => (hasItem('wiring_harness') ? { text: 'Hold to rewire', hold: true } : { text: 'Sparking wires', key: '-', warn: 'Needs a Wiring Harness' }), hold: () => (hasItem('wiring_harness') ? { time: REPAIRS.wiring.time, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'wiring'), done: () => this.request('repair', { id: 'wiring' }) } : null) });
    // time machine sockets + lever ----------------------------------------------
    for (const id of SOCKETS) {
      const sk = P.sockets[id];
      ia({ id: 'sock_' + id, obj: sk.g, min: [-0.1, -0.1, -0.06], max: [0.1, 0.1, 0.06], label: () => ITEMS[id].name + ' Socket', info: () => (S.sockets[id] ? 'Installed' : 'Empty'), prompt: () => (S.sockets[id] ? { text: 'Installed', key: '-' } : hasItem(id) ? { text: 'Hold to install ' + ITEMS[id].name, hold: true } : { text: 'Empty socket', key: '-', warn: 'Needs ' + ITEMS[id].name }), hold: () => (!S.sockets[id] && hasItem(id) ? { time: 2.5, anim: 'wrench', tick: (dt, t) => this.repairTick(dt, t, 'socket'), done: () => this.request('socket', { id }) } : null) });
    }
    ia({ id: 'lever', obj: P.lever, min: [-0.06, -0.02, -0.06], max: [0.06, 0.36, 0.06], label: () => 'ENGAGE Lever', info: () => this.chronoInfo(), prompt: () => ({ text: 'Pull the ENGAGE lever' }), act: () => this.request('lever', {}) });
    ia({ id: 'tmdisplay', obj: P.machine, min: [-0.15, 0.9, -0.45], max: [0.4, 1.1, -0.36], label: () => 'Destination Display', info: () => 'DEST: OCT 26 1987 · 01:21', prompt: () => null });
    // roof ladder (upgrade) -------------------------------------------------------
    ia({ id: 'ladder', obj: this.body, min: [0.4, 0.3, 2.4], max: [0.85, 2.3, 2.75], enabled: () => !!S.upgrades.roofdeck, label: () => 'Ladder', prompt: () => ({ text: this.isOnRoof(g.local.pos) ? 'Climb down' : 'Climb up to the Roof Deck' }), act: () => this.climb(g.local) });
    ia({ id: 'coffee', obj: this.body, min: [-0.8, 1.0, -0.7], max: [-0.55, 1.35, -0.42], enabled: () => !!S.upgrades.coffee, label: () => 'Coffee Maker', info: () => 'Clean water → Van Coffee', prompt: () => (hasItem('water_clean') ? { text: 'Hold to brew Van Coffee', hold: true } : { text: 'Coffee Maker', key: '-', warn: 'Needs Clean Water' }), hold: () => (hasItem('water_clean') && S.charge > 2 ? { time: 3, anim: 'interact', tick: (dt) => { S.charge = Math.max(0, S.charge - dt * 0.6); }, done: () => this.request('coffee', {}) } : null) });
  }

  // nearest hit against the van's walls (local-space ray), used so you can't
  // reach through panels / closed doors / glass
  wallHit(o, d, reach) {
    _m.copy(this.root.matrixWorld).invert();
    _ray.origin.copy(o).applyMatrix4(_m);
    _ray.direction.copy(d).transformDirection(_m);
    let best = Infinity;
    for (const s of this.shapes) {
      const c = s.local;
      if (!OCCLUDERS.has(c.id)) continue;
      _box.min.set(c.x - c.hx, c.y - c.hy, c.z - c.hz); _box.max.set(c.x + c.hx, c.y + c.hy, c.z + c.hz);
      if (_box.containsPoint(_ray.origin)) continue;
      if (_ray.intersectBox(_box, _hit)) { const t = _ray.origin.distanceTo(_hit); if (t < best && t <= reach) best = t; }
    }
    return best;
  }
  // returns the best interaction target for the Interaction system
  raycastInteract(o, d, reach) {
    if ((o.x - this.pose.x) ** 2 + (o.z - this.pose.z) ** 2 > (reach + 5) ** 2) return null;
    const wall = this.wallHit(o, d, reach);
    const hits = [];
    for (const it of this.ia) {
      if (it.enabled && !it.enabled()) continue;
      const obj = it.obj;
      _m.copy(obj.matrixWorld).invert();
      _ray.origin.copy(o).applyMatrix4(_m);
      _ray.direction.copy(d).transformDirection(_m);
      if (!_ray.intersectBox(it.box, _hit)) continue;
      const dist = _ray.origin.distanceTo(_hit);
      if (dist > reach) continue;
      if (dist > wall + 0.04 && !it.onWall) continue;
      it.box.getCenter(_c);
      hits.push({ dist, it, off: _ray.distanceToPoint(_c) / Math.max(0.05, it.box.getSize(_sz).length()) });
    }
    if (!hits.length) return null;
    // small neighbouring targets (switches, sockets): prefer the one the ray passes closest to the middle of
    const near = Math.min(...hits.map((h) => h.dist));
    const best = hits.filter((h) => h.dist < near + 0.22).sort((a, b) => a.off - b.off)[0];
    const it = best.it;
    const pr = it.prompt ? it.prompt() : null;
    const holdSpec = pr?.hold && it.hold ? it.hold() : null;
    const holding = this.holding && this.holding.it === it;
    const key = this.g.input.keyName('interact');
    const prompt = pr ? { key: pr.key ?? key, text: (pr.hold ? '' : '') + pr.text, warn: pr.warn ?? null, progress: holding && isFinite(this.holding.spec.time) ? this.holding.t / this.holding.spec.time : null } : null;
    return {
      dist: best.dist, kind: 'van', vanIA: it, label: it.label(), info: it.info ? it.info() : null, prompt,
      onInteract: () => { if (holdSpec) this.beginHold(it, holdSpec); else if (it.act) it.act(); },
      onHit: it.hit ? () => it.hit() : null,
    };
  }

  beginHold(it, spec) {
    if (this.holding) return;
    this.holding = { it, spec, t: 0 };
  }
  updateHold(dt) {
    const H = this.holding;
    if (!H) return;
    const g = this.g, p = g.local;
    const still = g.input.down('interact') && g.interaction?.target?.vanIA === H.it && !g.uiOpen;
    if (!still) { H.spec.end?.(); this.holding = null; return; }
    H.t += dt;
    if (H.spec.anim && (!p.action || p.action.name !== H.spec.anim)) p.startAction(H.spec.anim, 0.6, null, 2);
    if (p.action && p.action.name === H.spec.anim) p.action.t = Math.min(p.action.t, 0.5);
    H.spec.tick?.(dt, H.t);
    if (H.t >= H.spec.time) { H.spec.done?.(); H.spec.end?.(); this.holding = null; if (p.action?.name === H.spec.anim) p.action = null; }
  }

  // ======================================================================== actions (host-authoritative)
  request(type, data) { this.g.act('van_' + type, data); }
  registerActions() {
    const g = this.g, S = this.s;
    const A = g.actionHandlers;
    const sync = () => g.net?.broadcast?.('vanState', this.netState());
    A.van_door = ({ name, open }) => { this.setDoor(name, open); sync(); };
    A.van_switch = ({ i, on }) => { this.setSwitch(i, on); sync(); };
    A.van_hood = ({ open }) => { S.hood = open; this.applyHood(true); sync(); };
    A.van_radio = ({ st }) => { S.radio = st; this.applyRadio(); sync(); };
    A.van_charge = ({ amt }) => { S.charge = Math.min(this.cap(), S.charge + amt); sync(); };
    A.van_repair = ({ id, by }) => this.doRepair(id, by);
    A.van_socket = ({ id, by }) => this.doSocket(id, by);
    A.van_gloveOpen = () => { if (S.glove !== 'jammed') return; S.glove = 'open'; this.applyGlove(true); sync(); };
    A.van_glove = ({ by }) => this.doGlove(by);
    A.van_refuel = ({ by }) => this.doRefuel(by);
    A.van_lever = ({ by }) => this.pullLever(by);
    A.van_upgrade = ({ id, by }) => this.doUpgrade(id, by);
    A.van_coffee = ({ by }) => { if (by === g.local.id && g.inventory.remove('water_clean', 1)) { g.give('coffee', 1); g.audio?.play('coffee', { pos: this.localToWorld(_v.set(-0.68, 1.1, -0.56)) }); g.events.emit('vanCoffee'); } };
    A.van_seat = ({ seat, by, sit }) => { this.seatOwner = this.seatOwner || {}; if (sit) { if (!this.seatOwner[seat]) this.seatOwner[seat] = by; } else if (this.seatOwner[seat] === by) delete this.seatOwner[seat]; sync(); };
  }
  // pay for something from the local inventory (by = who asked; only the asker pays)
  pay(by, cost) {
    const g = this.g;
    if (by !== g.local.id) return true; // remote players pay on their side before asking
    return g.inventory.take(cost);
  }

  setDoor(name, open) {
    const S = this.s, g = this.g;
    if (!!S.doors[name] === !!open) return;
    // the rear barn doors open together
    const names = name.startsWith('door_rear') ? ['door_rear_l', 'door_rear_r'] : [name];
    for (const n of names) S.doors[n] = !!open;
    const pos = this.localToWorld(name === 'door_slide' ? _v.set(1, 1.2, -0.3) : name.startsWith('door_rear') ? _v.set(0, 1.2, 2.45) : _v.set(name.endsWith('_l') ? -1 : 1, 1.2, -1.5));
    if (name === 'door_slide') g.audio?.play('van_slide', { pos, vol: 0.9 });
    else g.audio?.play(open ? 'door_open' : 'door_slam', { pos, vol: 0.8 });
    if (!open) setTimeout(() => this.rebuildColliders(), name === 'door_slide' ? 380 : 250); else this.rebuildColliders();
    if (!open && name !== 'door_slide') setTimeout(() => this.bobbleKick(2), 200);
    g.events.emit('vanDoor', { name, open });
  }
  setSwitch(i, on) {
    const S = this.s, g = this.g;
    const sw = this.parts.switches[i];
    const pos = this.localToWorld(_v.set(-0.55, 1.45, -0.98));
    g.audio?.play('switch', { pos, vol: 0.7 });
    S.sw[i] = !!on;
    if (on && S.charge <= 0) { g.ui?.toast('Click. Nothing happens. The batteries are flat.', 'warn'); setTimeout(() => { S.sw[i] = false; g.audio?.play('clack', { pos, vol: 0.5 }); }, 350); return; }
    if (on && i === SW.CHRONO && !S.repaired.wiring) {
      g.audio?.play('zap', { pos, vol: 0.9 }); g.audio?.play('spark', { pos });
      for (let k = 0; k < 12; k++) g.fx.sprite('spark', pos.x, pos.y, pos.z, { vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.35, size: 0.1, color: 0x9ae0ff, grav: 9 });
      setTimeout(() => { S.sw[i] = false; g.audio?.play('clack', { pos, vol: 0.6 }); }, 220);
      g.ui?.toast('BZZT! The CHRONO circuit is fried. Needs new wiring.', 'warn');
      if (g.local.pos.distanceTo(pos) < 1.6) { g.vitals?.damage(3, { kind: 'shock' }); g.local.setExpr('surprised', 1.5); }
      return;
    }
    if (i === SW.COMPUTER) { if (on) { this.boot = [0, 0, 0]; g.audio?.play('degauss', { pos: this.localToWorld(_v.set(-0.7, 1.2, 0.15)), vol: 0.7 }); setTimeout(() => g.audio?.play('crt_on', { pos, vol: 0.6 }), 250); } else if (g.computer?.isOpen) g.computer.close(); }
    if (i === SW.RADIO && !on) { S.radio = -1; this.applyRadio(); }
    if (i === SW.CHRONO && on) { g.audio?.play('time_charge', { pos: this.localToWorld(this.parts.anchors.machine), vol: 0.5 }); }
    void sw;
    g.events.emit('vanSwitch', { i, on, label: sw.label });
  }
  doRepair(id, by) {
    const S = this.s, g = this.g, R = REPAIRS[id];
    if (!R || S.repaired[id]) return;
    if (!this.pay(by, R.cost ?? { [R.item]: 1 })) return;
    S.repaired[id] = true;
    this.applyRepairs(true, id);
    this.rebuildColliders();
    g.net?.broadcast?.('vanState', this.netState());
    g.events.emit('vanRepair', { id, by });
    if (by === g.local.id) {
      g.ui?.toast(`Repaired: ${R.name}`, '', 'van');
      g.audio?.jingle?.('discover');
      if (this.canDrive()) setTimeout(() => g.ui?.banner('THE VAN RUNS!', 'Hop in the driver seat', 'W/S drive · A/D steer · Space handbrake · H horn'), 900);
    }
  }
  doSocket(id, by) {
    const S = this.s, g = this.g;
    if (S.sockets[id]) return;
    if (!this.pay(by, { [id]: 1 })) return;
    S.sockets[id] = true;
    this.applySockets(true);
    g.net?.broadcast?.('vanState', this.netState());
    const n = SOCKETS.filter((k) => S.sockets[k]).length;
    g.events.emit('vanSocket', { id, by, n });
    if (by === g.local.id) g.ui?.toast(`Installed ${ITEMS[id].name} (${n}/5)`, '', id);
    const pos = this.localToWorld(this.parts.anchors.machine);
    g.audio?.play('time_charge', { pos, vol: 0.6 });
    g.fx.glow(pos, 0x60e0ff, 1.2, 0.6);
  }
  doGlove(by) {
    const S = this.s, g = this.g;
    if (S.glove !== 'open') return;
    S.glove = 'empty';
    this.applyGlove(false);
    g.net?.broadcast?.('vanState', this.netState());
    const items = [['scanner', 1], ['flashlight', 1], ['energybar', 1]];
    if (by === g.local.id) {
      for (const [id, n] of items) g.give(id, n, { from: 'Glovebox' });
      g.events.emit('note', { id: 'glovebox', title: 'Note from the glovebox', text: 'Doug\'s Emergency Kit: 1 (one) Chrono-Scanner, 1 flashlight, 3 mints (eaten). If found, return to Doug. Reward: high five.' });
      g.ui?.toast('Found Doug\'s emergency kit!', '', 'scanner');
    } else g.net?.sendTo?.(by, 'give', { items, from: 'Glovebox' });
    g.events.emit('vanGlovebox', { by });
  }
  doRefuel(by) {
    const S = this.s, g = this.g;
    if (S.fuel > 9) return;
    if (!this.pay(by, { biofuel: 1 })) return;
    S.fuel = Math.min(10, S.fuel + 2.5);
    g.audio?.play('fill', { pos: this.localToWorld(_v.set(-1, 0.9, 1.95)) });
    g.net?.broadcast?.('vanState', this.netState());
    if (by === g.local.id) g.ui?.toast(`Fuel: ${S.fuel.toFixed(1)} / 10  (it smells exactly like you think)`);
  }
  doUpgrade(id, by) {
    const S = this.s, g = this.g, U = upgradeById[id];
    if (!U || S.upgrades[id]) return false;
    if (U.unlock && !g.research?.has?.(U.unlock)) return false;
    if (U.needs && !U.needs.every((r) => S.repaired[r])) return false;
    if (!this.pay(by, U.cost)) return false;
    S.upgrades[id] = true;
    this.applyUpgrades(true, id);
    this.rebuildColliders();
    g.net?.broadcast?.('vanState', this.netState());
    g.events.emit('vanUpgrade', { id, by });
    if (by === g.local.id) { g.ui?.toast('Van upgrade: ' + U.name, '', 'van'); g.audio?.jingle?.('discover'); }
    g.audio?.play('build', { pos: this.pos });
    for (let k = 0; k < 6; k++) g.fx.dust(this.localToWorld(_v.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 4)), 2, 0xc8c0b0, 0.6);
    return true;
  }
  upgradeList() {
    const g = this.g, S = this.s;
    return UPGRADES.map((u) => ({ ...u, have: !!S.upgrades[u.id], locked: !!(u.unlock && !g.research?.has?.(u.unlock)), blocked: u.needs && !u.needs.every((r) => S.repaired[r]), afford: g.inventory.has(u.cost) }));
  }
  installUpgrade(id) { const u = upgradeById[id]; if (!u || !this.g.inventory.has(u.cost)) return false; this.request('upgrade', { id }); return true; }

  // ======================================================================== power
  cap() { return this.s.upgrades.battery2 ? 200 : 100; }
  pct() { return Math.round((this.s.charge / this.cap()) * 100); }
  powerInfo() { const S = this.s; return `Battery ${this.pct()}%` + (S.repaired.dynamo ? '' : ' · no charger'); }
  dockInfo() { const n = this.dock.slots.filter(Boolean).length; return n ? `Charging ${n} item${n > 1 ? 's' : ''}` : 'Put a scanner or flashlight in to charge'; }
  chronoInfo() { const S = this.s; const n = SOCKETS.filter((k) => S.sockets[k]).length; return `Parts ${n}/5 · Battery ${this.pct()}% · CHRONO ${S.sw[SW.CHRONO] ? 'ON' : 'OFF'}`; }
  dockPanel() {
    const el = document.createElement('div');
    el.className = 'small'; el.style.marginTop = '10px';
    el.innerHTML = `Charges batteries in gadgets using van power.<br>Van battery: <b>${this.pct()}%</b>`;
    return el;
  }
  screenOn(i) { const S = this.s; return S.sw[SW.COMPUTER] && S.charge > 0 && (i === 0 || S.repaired.crt); }
  crank(dt) {
    const g = this.g, S = this.s;
    const v = g.vitals;
    if (v && v.stamina < 2) { if (!this._tiredT || this.t - this._tiredT > 3) { g.ui?.toast('Arms... like... noodles...', 'warn'); this._tiredT = this.t; } this.crankV = Math.max(0, (this.crankV ?? 0) - dt * 3); this.audio.crankSpeed(this.crankV); return; }
    v?.useStamina(dt * 7);
    this.crankV = Math.min(1, (this.crankV ?? 0) + dt * 2.2);
    const amt = dt * 2.6 * this.crankV;
    if (S.charge < this.cap()) {
      if (this.g.isHost || !this.g.net) S.charge = Math.min(this.cap(), S.charge + amt);
      else { this._pend = (this._pend ?? 0) + amt; if (this._pend > 0.5) { this.request('charge', { amt: this._pend }); this._pend = 0; } }
    }
    this.audio.crankSpeed(this.crankV);
    this.crankAngle = (this.crankAngle ?? 0) + dt * 10 * this.crankV;
    if (!S.firstPower && S.charge > 5) { S.firstPower = true; g.events.emit('vanPowered'); }
    this._crankTick = (this._crankTick ?? 0) + dt * this.crankV;
    if (this._crankTick > 0.25) { this._crankTick = 0; g.audio?.play('ratchet', { pos: this.localToWorld(_v.set(-0.3, 0.85, -0.62)), vol: 0.25 }); }
  }
  crankEnd() { this.crankV = 0; this.audio.crankSpeed(0); }
  repairTick(dt, t, id) {
    const g = this.g;
    this._repT = (this._repT ?? 0) - dt;
    if (this._repT <= 0) {
      this._repT = 0.32 + Math.random() * 0.2;
      const p = g.local.pos;
      _v.set(-Math.sin(g.local.yaw), 0, -Math.cos(g.local.yaw)).multiplyScalar(0.55).add(p); _v.y += 0.9;
      g.audio?.play(id === 'axle' ? 'clink' : Math.random() < 0.5 ? 'wrench' : 'ratchet', { pos: _v, vol: 0.5 });
      if (Math.random() < 0.5) for (let k = 0; k < 4; k++) g.fx.sprite('spark', _v.x, _v.y, _v.z, { vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2.5, vz: (Math.random() - 0.5) * 3, life: 0.25, size: 0.08, color: 0xffd080, grav: 9 });
    }
  }
  updatePower(dt) {
    const S = this.s, g = this.g;
    let draw = 0;
    for (let i = 0; i < 4; i++) if (S.sw[i]) draw += DRAW[i];
    if (S.sw[SW.COMPUTER] && S.repaired.crt) draw += 0.025;
    if (S.sw[SW.LIGHTS] && S.upgrades.floodlights && g.time.isNight) draw += 0.05;
    // gadget charging
    let charging = 0;
    for (const s of this.dock.slots) if (s && ITEMS[s.id]?.charge && (s.ch ?? 0) < ITEMS[s.id].charge) charging++;
    if (charging && S.charge > 0) {
      draw += 0.06 * charging;
      for (const s of this.dock.slots) if (s && ITEMS[s.id]?.charge) s.ch = Math.min(ITEMS[s.id].charge, (s.ch ?? 0) + dt * 2.2);
      this._dockDirty = (this._dockDirty ?? 0) + dt;
      if (this._dockDirty > 1) { this._dockDirty = 0; this.dock.changed(); }
    }
    // gains: solar + generator
    let gain = 0;
    if (S.upgrades.solar) { const sun = Math.max(0, g.sky?.sunDir?.y ?? (g.time.isNight ? 0 : 0.6)); gain += 0.09 * Math.min(1, sun * 2) * (1 - (g.weather.state?.().cover ?? 0) * 0.7); }
    if (S.upgrades.generator && S.fuel > 0 && S.charge < this.cap() - 0.5) { gain += 0.6; S.fuel = Math.max(0, S.fuel - dt / 120); this.genOn = true; } else this.genOn = false;
    if (g.isHost || !g.net) {
      S.charge = Math.max(0, Math.min(this.cap(), S.charge + (gain - draw) * dt));
      if (S.charge <= 0 && S.sw.some(Boolean)) {
        // brown-out: breakers pop
        S.sw = [false, false, false, false];
        g.audio?.play('clack', { pos: this.localToWorld(_v.set(-0.55, 1.45, -0.98)), vol: 0.8 });
        if (this.anyLocalNear(8)) g.ui?.toast('The batteries died. Everything shuts off with a sad clunk.', 'warn');
        S.radio = -1; this.applyRadio();
        if (g.computer?.isOpen) g.computer.close();
        g.net?.broadcast?.('vanState', this.netState());
      }
    }
    this.charging = charging;
  }
  anyLocalNear(r) { return this.g.local.pos.distanceTo(this.pos) < r; }

  // ======================================================================== seats + driving
  seatTaken(name) { return [...this.g.players.values()].some((p) => p.sitting?.seat === name && p.sitting?.van === this); }
  driverIs(p) { return p.sitting?.van === this && p.sitting.seat === 'seat_driver'; }
  sit(p, seat) {
    const g = this.g;
    if (this.seatTaken(seat) || p.sitting) return;
    const side = seat === 'seat_driver' ? 'door_cab_l' : 'door_cab_r';
    if (!this.s.doors[side]) { this.request('door', { name: side, open: true }); setTimeout(() => this.request('door', { name: side, open: false }), 900); }
    p.sitting = { seat, seatObj: this.parts.seats[seat].g, van: this, ride: false, drive: seat === 'seat_driver' ? 0 : null, since: this.t };
    p.vel.set(0, 0, 0);
    p.action = null;
    this.request('seat', { seat, sit: true });
    if (p.local) {
      g.cameraOverride = () => (g.rig.firstPerson ? null : { pos: this.camPivot(), dist: 7.2 });
      if (seat === 'seat_driver') {
        const why = this.whyCantDrive();
        g.ui?.toast(why ? 'The van won\'t drive yet: ' + why : 'W to start the engine. E to get out.', why ? 'warn' : '');
      }
      g.events.emit('vanSit', { seat });
    }
  }
  unsit(p) {
    const g = this.g;
    if (!p.sitting || p.sitting.van !== this) return;
    const seat = p.sitting.seat;
    const sx = seat === 'seat_driver' ? -1 : 1;
    if (seat === 'seat_driver' && this.drive.on) this.engineOff();
    const side = sx < 0 ? 'door_cab_l' : 'door_cab_r';
    if (!this.s.doors[side]) { this.request('door', { name: side, open: true }); setTimeout(() => this.request('door', { name: side, open: false }), 900); }
    p.sitting = null;
    const out = this.localToWorld(_v.set(sx * 1.55, 0.2, -1.45));
    const gy = g.physics.groundAt(out.x, out.z, out.y + 2, 3);
    p.teleport(out.x, Math.max(gy, g.sampler.heightAt(out.x, out.z)) + 0.02, out.z);
    p.yaw = this.pose.yaw + (sx < 0 ? Math.PI / 2 : -Math.PI / 2);
    this.request('seat', { seat, sit: false });
    if (p.local) { g.cameraOverride = null; g.events.emit('vanUnsit', { seat }); }
  }
  camPivot() { return this.localToWorld(_w.set(0, 1.4 + this.lift, 0.2)); }
  canDrive() { return DRIVE_NEEDS.every((r) => this.s.repaired[r]); }
  whyCantDrive() {
    const S = this.s;
    const miss = DRIVE_NEEDS.filter((r) => !S.repaired[r]).map((r) => REPAIRS[r].name.toLowerCase());
    if (miss.length) return miss.join(', ');
    if (S.fuel <= 0) return 'no fuel (Dung-o-Diesel)';
    return null;
  }
  engineStart() {
    const g = this.g, D = this.drive;
    if (D.on || D.starting > 0) return;
    const why = this.whyCantDrive();
    g.audio?.play('engine_start', { pos: this.pos, vol: 0.9 });
    if (why) {
      D.starting = -1.4; // cooldown
      setTimeout(() => { g.audio?.play('engine_fail', { pos: this.pos, vol: 0.8 }); for (let k = 0; k < 6; k++) g.fx.smoke(this.localToWorld(this.parts.anchors.engine), 0x3a3a3a, 0.8); }, 700);
      g.ui?.toast('*cough cough* Needs: ' + why, 'warn');
      return;
    }
    D.starting = 1.2;
  }
  engineOff() { const D = this.drive; D.on = false; D.starting = 0; D.throttle = 0; this.audio.engine(false, 0, 0); this.g.events.emit('vanEngine', { on: false }); }

  updateDriving(dt) {
    const g = this.g, D = this.drive, P = this.pose, S = this.s;
    const me = g.local;
    const iDrive = this.driverIs(me);
    // ---- input (driver only)
    let thr = 0, steerIn = 0, brake = false;
    if (iDrive && !g.uiOpen) {
      const ax = g.input.axis();
      thr = ax.y; steerIn = -ax.x; brake = g.input.down('jump');
      if (thr !== 0 && !D.on && D.starting === 0) this.engineStart();
      if (g.input.pressed('horn')) this.honk();
      if (g.input.pressed('flashlight')) { this.headOn = !this.headOn; g.audio?.play('switch', { pos: this.pos, vol: 0.5 }); }
    }
    if (D.starting > 0) { D.starting -= dt; if (D.starting <= 0) { D.starting = 0; D.on = true; g.events.emit('vanEngine', { on: true }); for (let k = 0; k < 5; k++) g.fx.smoke(this.localToWorld(this.parts.anchors.exhaust), 0x2a2a2a, 1.1); g.rig.addTrauma(0.15); } }
    else if (D.starting < 0) D.starting = Math.min(0, D.starting + dt);
    if (!D.on) thr = 0;
    D.throttle += (thr - D.throttle) * Math.min(1, dt * 6);
    // ---- longitudinal
    const big = !!S.upgrades.wheels;
    const top = big ? 17 : 14.5, accel = big ? 6.2 : 5.2;
    const sinP = Math.sin(P.pitch);
    let sp = D.speed;
    if (D.throttle * sp >= 0) sp += D.throttle * accel * dt * (1 - Math.min(1, Math.abs(sp) / top) ** 2) * (D.throttle < 0 ? 0.55 : 1);
    else sp += D.throttle * 11 * dt; // braking against motion
    const parked = !this.driver || (!D.on && D.starting === 0);
    if (!parked) sp -= 9.8 * sinP * dt * 0.85; // gravity along slope (nose up = positive pitch slows forward motion)
    else sp -= Math.sign(sp) * Math.min(Math.abs(sp), 9 * dt); // handbrake on
    sp -= sp * (0.12 + (D.on ? 0 : 0.5)) * dt;
    const roll = 0.5 * Math.sign(sp) * dt; if (Math.abs(sp) > Math.abs(roll)) sp -= roll; else if (Math.abs(D.throttle) < 0.05) sp = 0;
    if (brake) sp -= Math.sign(sp) * Math.min(Math.abs(sp), 13 * dt);
    if (sp < -6) sp = -6;
    // water: shallow slows, deep floods
    const wl = g.sampler.waterAt(P.x, P.z), depth = wl > -999 ? wl - P.y : 0;
    if (depth > 0.15) sp *= 1 - Math.min(0.9, depth * (big ? 0.6 : 1.4)) * dt;
    if (D.on && depth > (big ? 1.25 : 0.75)) { this.engineOff(); g.ui?.toast('Glug. The engine flooded. Push it out of the water... somehow.', 'warn'); g.audio?.play('engine_fail', { pos: this.pos }); }
    // steep uphill: traction loss
    if (P.pitch > 0.42 && sp > 0) sp -= (P.pitch - 0.42) * 30 * dt;
    if (P.pitch < -0.42 && sp < 0) sp += (-P.pitch - 0.42) * 30 * dt;
    // fuel
    if (D.on && Math.abs(sp) > 0.3) { S.fuel = Math.max(0, S.fuel - Math.abs(sp) * dt / 700); if (S.fuel <= 0) { this.engineOff(); g.ui?.toast('Sputter... out of Dung-o-Diesel!', 'warn'); } }
    D.speed = sp;
    // ---- steering (less lock at speed)
    const lock = 0.55 / (1 + Math.abs(sp) * 0.06);
    D.steer += (steerIn * lock - D.steer) * Math.min(1, dt * 5);
    const yawRate = (sp * Math.tan(D.steer)) / WHEELBASE;
    if (this.unsettled > 0) this.unsettled -= dt;
    if (Math.abs(sp) < 0.01 && P.vy === 0 && !D.on && D.starting === 0 && Math.abs(D.steer) < 0.001 && !(this.unsettled > 0)) { this.updateIdleVisuals(dt); return false; }
    // ---- integrate planar motion
    if (!D.airborne) P.yaw += yawRate * dt;
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    const ox = P.x, oz = P.z, oyaw = P.yaw - (!D.airborne ? yawRate * dt : 0);
    P.x += fx * sp * dt; P.z += fz * sp * dt;
    // ---- world collisions (3 circles along the van)
    this.collide(dt, fx, fz);
    // ---- terrain following with springy suspension
    const h = this.sampleWheels(P.x, P.z, P.yaw, this._wh || (this._wh = [0, 0, 0, 0]));
    const ty = (h[0] + h[1] + h[2] + h[3]) / 4;
    const tp = Math.atan2((h[0] + h[1]) / 2 - (h[2] + h[3]) / 2, WHEELBASE);
    const tr = Math.atan2((h[1] + h[3]) / 2 - (h[0] + h[2]) / 2, TRACK);
    P.vy -= 21 * dt;
    P.y += P.vy * dt;
    if (P.y <= ty) {
      const imp = -P.vy;
      if (D.airborne && imp > 4) { g.audio?.play('thud', { pos: this.pos, vol: Math.min(1, imp / 10) }); g.rig.addTrauma(Math.min(0.5, imp / 18)); this.bobbleKick(imp); this.bounce = (this.bounce ?? 0) + imp * 0.03; }
      P.y += (ty - P.y) * Math.min(1, dt * 30);
      if (P.y < ty - 0.3) P.y = ty - 0.3;
      P.vy = Math.max(0, (ty - P.y) * 8);
      D.airborne = false;
    } else if (P.y - ty > 0.25) D.airborne = true;
    else { P.y += (ty - P.y) * Math.min(1, dt * 18); P.vy = Math.min(P.vy, 0); D.airborne = false; }
    if (!D.airborne) {
      this.bounce = (this.bounce ?? 0) * Math.max(0, 1 - dt * 3);
      P.pitch += (tp - P.pitch) * Math.min(1, dt * 8);
      P.roll += (tr - P.roll + Math.sin(this.t * 17) * this.bounce * 0.02 - D.steer * sp * 0.004) * Math.min(1, dt * 8);
    }
    // ---- carry everyone standing in or on the van
    this.carryRiders(ox, oz, oyaw);
    // ---- wheels, steering wheel, engine sound, fx
    const spin = (sp * dt) / (VAN.wheelR * (big ? 1.35 : 1));
    for (const w of this.parts.wheels) { w.spin.rotation.x -= spin; if (w.front) w.pivot.rotation.y = D.steer; }
    this.parts.steering.rotation.z = -D.steer * 3;
    if (this.driver) this.driver.sitting.drive = D.steer * 1.6;
    // engine audio: three fake gears
    const asp = Math.abs(sp) / top;
    const gear = asp < 0.3 ? 0 : asp < 0.62 ? 1 : 2;
    const gl = [0, 0.3, 0.62][gear], gh = [0.3, 0.62, 1.05][gear];
    const target = D.on ? 0.15 + ((asp - gl) / (gh - gl)) * 0.75 + Math.abs(D.throttle) * 0.1 : 0;
    D.rpm += (target - D.rpm) * Math.min(1, dt * 5);
    this.audio.engine(D.on || D.starting > 0, D.starting > 0 ? 0.15 + Math.random() * 0.2 : D.rpm, Math.abs(D.throttle), S.fuel < 0.5 ? 0.5 : 0);
    this.fxT -= dt;
    if (D.on && this.fxT <= 0) {
      this.fxT = 0.14 / (0.4 + Math.abs(D.throttle));
      g.fx.smoke(this.localToWorld(this.parts.anchors.exhaust), Math.abs(D.throttle) > 0.5 ? 0x4a4a4a : 0x8a8a8a, 0.35 + Math.abs(D.throttle) * 0.4);
      if (Math.abs(sp) > 4 && !D.airborne) {
        const w = this.parts.wheels[2 + Math.floor(Math.random() * 2)];
        const wp = this.localToWorld(_v.set(w.sx * 0.86, 0.1, w.az));
        if (depth > 0.1) g.fx.splash(wp.x, wl, wp.z, 0.6); else g.fx.dust(wp, 1, 0xb8a080, 0.6);
      }
    }
    // dinos / anything else can react to a moving van
    if (Math.abs(sp) > 2) g.events.emit('vanSweep', { van: this, x: P.x, z: P.z, r: 2.6, speed: sp, fx, fz });
    S.odo += Math.abs(sp) * dt;
    S.x = P.x; S.z = P.z; S.yaw = P.yaw;
    // auto camera: swing behind the van when moving and the mouse is idle
    if (iDrive) {
      if (Math.abs(g.input.mdx ?? 0) > 0.5) D.idleT = 0; else D.idleT += dt;
      if (D.idleT > 1.2 && Math.abs(sp) > 3) { let d = P.yaw - g.rig.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); g.rig.yaw += d * Math.min(1, dt * 1.5); }
    }
    // network: driver streams pose
    this.netT = (this.netT ?? 0) - dt;
    if (iDrive && this.netT <= 0 && g.net?.send) { this.netT = 1 / 15; g.net.send('vanPose', { x: +P.x.toFixed(3), y: +P.y.toFixed(3), z: +P.z.toFixed(3), yaw: +P.yaw.toFixed(4), p: +P.pitch.toFixed(4), r: +P.roll.toFixed(4), sp: +sp.toFixed(2), st: +D.steer.toFixed(3), on: D.on ? 1 : 0, th: +D.throttle.toFixed(2) }); }
    return true;
  }

  collide(dt, fx, fz) {
    const g = this.g, P = this.pose, D = this.drive;
    const list = g.physics.query(P.x, P.z, 4.5, this._q || (this._q = []));
    const centres = [-1.65, 0, 1.65];
    let hitAny = null;
    for (const lz of centres) {
      const cx = P.x + fx * -lz, cz = P.z + fz * -lz;
      const p = { x: cx, y: P.y + 0.15, z: cz };
      for (const s of list) {
        if (s.ref === this || !s.solid || s.ignore) continue;
        // small trees snap under the bumper
        if (s.tree) {
          const t = s.tree;
          const d = Math.hypot(t.x - cx, t.z - cz);
          if (d > s.r + 1.05) continue;
          if (t.radius < 0.42 && Math.abs(D.speed) > 5) {
            g.act('hitTree', { i: t.i, dmg: 9999, dirX: fx * Math.sign(D.speed), dirZ: fz * Math.sign(D.speed) });
            D.speed *= 0.72; g.rig.addTrauma(0.25); g.audio?.play('tree_crash', { pos: this.pos, vol: 0.7 });
            this.bobbleKick(4);
            continue;
          }
        }
        const before = { x: p.x, z: p.z };
        const hit = g.physics.resolve(p, 1.02, 2.0, 0.55, [s]);
        if (hit) {
          const dx = p.x - before.x, dz = p.z - before.z;
          P.x += dx; P.z += dz;
          const nlen = Math.hypot(hit.nx, hit.nz) || 1;
          const along = (fx * hit.nx + fz * hit.nz) / nlen * Math.sign(D.speed);
          hitAny = { along, s };
        }
      }
    }
    if (hitAny && Math.abs(D.speed) > 0.5) {
      const imp = Math.abs(D.speed) * Math.max(0.2, -hitAny.along);
      if (this.t - D.lastHit > 0.4 && imp > 2) {
        D.lastHit = this.t;
        g.audio?.play(imp > 7 ? 'tree_crash' : 'thud', { pos: this.pos, vol: Math.min(1, imp / 9) });
        g.rig.addTrauma(Math.min(0.6, imp / 14));
        this.bobbleKick(imp);
        if (imp > 9 && !this.s.upgrades.armor) { this.s.hp = Math.max(0, this.s.hp - imp * 0.6); }
        g.fx.dust(this.localToWorld(_v.set(0, 0.8, D.speed > 0 ? VAN.z0 : VAN.z1)), 4, 0xb8a888, 1);
      }
      D.speed *= -hitAny.along > 0.5 ? -0.25 : 0.7;
    }
  }

  // move players standing on the van floor/roof along with it
  carryRiders(ox, oz, oyaw) {
    const P = this.pose;
    const dyaw = P.yaw - oyaw;
    const cs = Math.cos(dyaw), sn = Math.sin(dyaw);
    for (const p of this.g.players.values()) {
      if (!p.local || p.sitting) continue;
      const rx = p.pos.x - ox, rz = p.pos.z - oz;
      if (rx * rx + rz * rz > 9) continue;
      // inside/onroof test against the *previous* pose (approximate with the current matrix minus delta)
      const inside = this._riding?.has(p) || this.isInside(p.pos) || this.isOnRoof(p.pos);
      if (!inside) continue;
      p.pos.x = P.x + rx * cs + rz * sn;
      p.pos.z = P.z - rx * sn + rz * cs;
      p.yaw += dyaw;
      if (p === this.g.local) this.g.rig.yaw += dyaw;
    }
    this._riding = new Set([...this.g.players.values()].filter((p) => p.local && !p.sitting && (this.isInside(p.pos) || this.isOnRoof(p.pos))));
  }

  honk() {
    const g = this.g;
    const big = !!this.s.upgrades.horn;
    g.audio?.play('horn', { pos: this.pos, vol: big ? 1.2 : 0.8, rate: big ? 0.8 : 1 });
    if (big) setTimeout(() => g.audio?.play('horn', { pos: this.pos, vol: 1.1, rate: 1.06 }), 180);
    g.events.emit('vanHorn', { van: this, x: this.pose.x, z: this.pose.z, r: big ? 40 : 18 });
    g.net?.broadcast?.('vanHorn', {});
  }
  climb(p) {
    const g = this.g;
    const top = this.isOnRoof(p.pos);
    const target = top ? this.localToWorld(_v.set(0.62, 0.05, VAN.z1 + 0.7)) : this.localToWorld(_v.set(0.62, VAN.roof + this.lift + 0.24, 1.9));
    if (top) target.y = g.sampler.heightAt(target.x, target.z) + 0.02;
    p.startAction('interact', 0.5, null, 2);
    const from = p.pos.clone();
    let t = 0;
    const step = (dt) => { t += dt / 0.55; const k = Math.min(1, t); p.pos.lerpVectors(from, target, k); p.pos.y += Math.sin(k * Math.PI) * 0.3; p.vel.set(0, 0, 0); return k >= 1; };
    this.climbing = step;
    g.audio?.play('step_metal', { pos: p.pos, vol: 0.6 });
  }

  // ======================================================================== computer
  useComputer(i) {
    const g = this.g;
    if (g.computer) g.computer.open(this, i);
    else g.ui?.toast('CHRONO-OS: ERROR 0x66 — RESEARCH MODULE NOT FOUND', 'warn');
  }

  // ======================================================================== time machine
  pullLever(by) {
    const g = this.g, S = this.s, P = this.parts;
    const pos = this.localToWorld(P.anchors.machine);
    this.leverAnim = 1;
    g.audio?.play('clack', { pos, vol: 0.9 });
    const n = SOCKETS.filter((k) => S.sockets[k]).length;
    const ready = n === 5 && S.sw[SW.CHRONO] && S.charge >= this.cap() * 0.98;
    if (!ready) {
      const msgs = [];
      if (n < 5) msgs.push(`${5 - n} part${5 - n > 1 ? 's' : ''} missing`);
      if (!S.sw[SW.CHRONO]) msgs.push('CHRONO breaker is off');
      if (S.charge < this.cap() * 0.98) msgs.push(`battery must be 100% (${this.pct()}%)`);
      setTimeout(() => {
        g.audio?.play(n >= 3 ? 'time_charge' : 'engine_fail', { pos, vol: 0.6 });
        g.audio?.play('spark', { pos });
        for (let k = 0; k < 10; k++) g.fx.sprite('spark', pos.x, pos.y, pos.z, { vx: (Math.random() - 0.5) * 4, vy: Math.random() * 3, vz: (Math.random() - 0.5) * 4, life: 0.4, size: 0.1, color: 0x9ae0ff, grav: 6 });
        g.fx.smoke(pos, 0x4a4a4a, 0.8);
        if (by === g.local.id) g.ui?.toast('CHRONO-DRIVE says no: ' + msgs.join(', '), 'warn');
        g.events.emit('vanLeverFail', { n, msgs, by });
      }, 300);
      return;
    }
    // the real thing
    g.events.emit('timeJump', { van: this, by });
    g.net?.broadcast?.('timeJump', {});
    this.jumping = 0.001;
  }
  updateJump(dt) {
    if (!this.jumping) return;
    const g = this.g;
    this.jumping += dt;
    const t = this.jumping;
    const pos = this.localToWorld(this.parts.anchors.roofTube);
    g.rig.addTrauma(Math.min(0.08, t * 0.01));
    if (Math.random() < t * 0.25) g.fx.sprite('spark', pos.x + (Math.random() - 0.5) * 3, pos.y + Math.random(), pos.z + (Math.random() - 0.5) * 5, { vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6, life: 0.4, size: 0.18, color: 0x9ae0ff, grav: 3 });
    if (t > 1 && !this._jmp1) { this._jmp1 = true; g.audio?.play('time_charge', { pos, vol: 1.2 }); }
    if (t > 6 && !this._jmp2) { this._jmp2 = true; g.audio?.play('time_boom', { vol: 1.2 }); g.events.emit('timeJumpFlash'); }
    if (t > 9) { this.jumping = 0; this._jmp1 = this._jmp2 = false; }
  }
  timeGlow() { return this.jumping ? Math.min(6, this.jumping * 0.9) : 0; }

  // ======================================================================== visual state application
  applyAll() {
    for (const [n, d] of Object.entries(this.parts.doors)) { d.t = this.s.doors[n] ? 1 : 0; this.poseDoor(n, d); }
    this.applyRepairs(false);
    this.applyUpgrades(false);
    this.applySockets(false);
    this.applyGlove(false);
    this.applyHood(false);
    this.applyRadio();
    this.rebuildColliders();
  }
  poseDoor(name, d) {
    const k = d.t * d.t * (3 - 2 * d.t);
    if (d.kind === 'hinge') d.g.rotation.y = d.open * k;
    else {
      // pop out first, then slide back
      const out = Math.min(1, k * 4), sl = Math.max(0, (k - 0.2) / 0.8);
      d.g.position.set(d.closed.x + (d.opened.x - d.closed.x) * out, 0, d.closed.z + (d.opened.z - d.closed.z) * sl);
    }
  }
  applyRepairs(anim, justId) {
    const S = this.s, P = this.parts, g = this.g;
    // tire + axle
    const fl = P.flatTire;
    fl.tire.scale.set(S.repaired.tire ? 1 : 1.08, S.repaired.tire ? 1 : 0.7, S.repaired.tire ? 1.5 : 1.62);
    fl.pivot.rotation.z = S.repaired.axle ? 0 : 0.2;
    // dynamo
    if (S.repaired.dynamo && !this.dynamo) { this.dynamo = buildDynamo(); this.body.add(this.dynamo); }
    // wiring
    P.brokenWires.visible = !S.repaired.wiring;
    if (S.repaired.wiring && !this.harness) { this.harness = buildHarness(); this.body.add(this.harness); }
    // engine
    if (S.repaired.engine && !this.engineBay.userData.new) { const v = this.engineBay.visible; this.body.remove(this.engineBay); this.engineBay = buildEngineBay(true); this.engineBay.userData.new = true; this.engineBay.visible = v; this.body.add(this.engineBay); }
    // headlight + windshield
    if (S.repaired.headlight) P.headlights[1].material = P.headlights[0].material;
    if (P.crack) P.crack.visible = !S.repaired.windshield;
    if (anim && justId) {
      const where = { tire: _v.set(-0.86, 0.4, VAN.frontAxle), axle: _v.set(-0.86, 0.4, VAN.frontAxle), engine: _v.set(0, 1.0, VAN.z0 + 0.4), wiring: _v.set(-0.55, 1.3, -0.95), crt: _v.set(-0.7, 1.4, 0.4), dynamo: _v.set(-0.36, 0.82, -0.62), headlight: _v.set(0.72, 0.85, VAN.z0), windshield: _v.set(0, 1.6, -2.0) }[justId] ?? _v.set(0, 1, 0);
      const wp = this.localToWorld(where);
      g.fx.stars(wp, 6); g.fx.dust(wp, 3, 0xd0c8b8, 0.5);
      g.audio?.play('build', { pos: wp });
      if (justId === 'tire' || justId === 'axle') { this.pose.vy = 2.2; this.unsettled = 2.5; }
    }
  }
  applyUpgrades(anim, justId) {
    const S = this.s, P = this.parts;
    this.upGroups = this.upGroups || {};
    for (const u of UPGRADES) {
      if (S.upgrades[u.id] && !this.upGroups[u.id]) {
        const grp = buildUpgrade(u.id);
        this.body.add(grp); this.upGroups[u.id] = grp;
        if (u.id === 'storage' && grp.userData.rearBox) P.doors.door_rear_l.g.add(at(grp.userData.rearBox, 0.48, 1.25, 0.15));
        if (u.id === 'storage') { const inv = new Inventory(24, { hotbar: 0 }); inv.slots.splice(0, this.storage.size, ...this.storage.slots); inv.slots.length = 24; for (let i = 0; i < 24; i++) inv.slots[i] = inv.slots[i] ?? null; this.storage = inv; }
        if (u.id === 'dish') { P.dish.children[1].rotation.set(-0.6, 0, 0); P.dish.userData.fixed = true; }
        if (u.id === 'wheels') { this.lift = 0.22; this.body.position.y = this.lift; for (const w of P.wheels) { w.pivot.position.y = VAN.wheelR * 1.35; w.spin.scale.setScalar(1.35); } }
      }
    }
    if (anim && justId) { this.pose.vy = 1.6; this.unsettled = 2.5; }
  }
  applySockets(anim) {
    const S = this.s, P = this.parts;
    for (const id of SOCKETS) {
      const sk = P.sockets[id];
      sk.led.material = std('sockled_on_' + (S.sockets[id] ? 1 : 0), { color: S.sockets[id] ? 0x103010 : 0x401010, emissive: S.sockets[id] ? 0x40ff60 : 0xff2020, emissiveIntensity: 1.6 });
      if (S.sockets[id] && !sk.model) {
        const m = buildItemModel(ITEMS[id]);
        if (m) { m.scale.setScalar(0.75); m.traverse((o) => { if (o.isMesh) o.userData.van = true; }); sk.g.add(m); sk.model = m; }
      }
    }
    void anim;
  }
  applyGlove(anim) {
    const g = this.parts.glovebox;
    this.gloveTarget = this.s.glove === 'jammed' ? 0 : 1;
    if (!anim) g.rotation.x = this.gloveTarget * 1.1;
    if (anim && this.s.glove === 'open') {
      const p = this.localToWorld(_v.set(0.48, 0.92, -1.75));
      this.g.audio?.play('box_open', { pos: p }); this.g.fx.stars(p, 4);
      this.g.ui?.toast('POP! The glovebox flies open.');
    }
  }
  applyHood(anim) {
    this.engineBay.visible = this.s.hood;
    if (anim) this.g.audio?.play(this.s.hood ? 'creak' : 'door_slam', { pos: this.localToWorld(this.parts.anchors.engine), vol: 0.6 });
  }
  applyRadio() {
    const S = this.s;
    this.audio.tune(S.sw[SW.RADIO] && S.charge > 0 ? S.radio : -1);
    this.g.events.emit('radioTune', { st: S.radio });
    this.parts.radio.lcd.material.emissiveIntensity = S.radio >= 0 ? 1.4 : 0;
  }
  bobbleKick(a) { const b = this.parts.bobble; b.v.x += (Math.random() - 0.5) * a * 2; b.v.y += (Math.random() - 0.5) * a * 2; }

  // ======================================================================== per-frame visuals
  updateVisuals(dt) {
    const S = this.s, P = this.parts, g = this.g;
    const t = this.t;
    // doors ease
    for (const [n, d] of Object.entries(P.doors)) {
      const target = S.doors[n] ? 1 : 0;
      if (d.t !== target) { d.t += Math.sign(target - d.t) * Math.min(Math.abs(target - d.t), dt * (d.kind === 'slide' ? 2.2 : 3.2)); this.poseDoor(n, d); }
    }
    // hood hatch
    const ht = S.hood ? -1.1 : 0;
    P.hood.rotation.x += (ht - P.hood.rotation.x) * Math.min(1, dt * 6);
    // glovebox
    P.glovebox.rotation.x += ((this.gloveTarget ?? 0) * 1.1 - P.glovebox.rotation.x) * Math.min(1, dt * 10);
    // switches
    S.sw.forEach((on, i) => {
      const sw = P.switches[i];
      sw.lever.rotation.x += ((on ? -0.6 : 0.6) - sw.lever.rotation.x) * Math.min(1, dt * 20);
      sw.led.material.emissiveIntensity = on && S.charge > 0 ? 2 : 0;
    });
    // power indicator
    const pc = S.charge / this.cap();
    P.battLed.material.emissive.setHex(pc < 0.15 ? 0xff2020 : pc < 0.5 ? 0xffb020 : 0x40ff60);
    P.battLed.material.emissiveIntensity = pc < 0.15 ? (Math.sin(t * 6) > 0 ? 2 : 0.3) : 1.8;
    const powered = S.charge > 0;
    const lights = S.sw[SW.LIGHTS] && powered;
    // interior bulb + lava lamp + xmas chase
    P.bulb.material.emissiveIntensity = lights ? 2.5 : 0;
    P.lava.material.emissiveIntensity = lights ? 1.2 + Math.sin(t * 0.7) * 0.3 : 0;
    P.xmas.forEach((b, k) => { b.material.emissiveIntensity = lights ? (Math.floor(t * 3 + k / 2) % 3 === 0 ? 3 : 0.6) : 0; });
    if (this.bulbSrc) { this.bulbSrc.on = lights; this.bulbSrc.intensity = lights ? 3.2 : 0; this.localToWorld(_v.set(0.1, VAN.roof - 0.4 + this.lift, 0.3), this.bulbSrc.pos); }
    // chrono glow
    const chrono = S.sw[SW.CHRONO] && powered;
    const glow = this.timeGlow();
    P.fluxTube.material.emissiveIntensity = (chrono ? 1.2 + Math.sin(t * 5) * 0.5 : 0.15 + (S.repaired.wiring ? 0 : Math.random() < 0.03 ? 1.5 : 0)) + glow;
    P.roofTube.material.emissiveIntensity = (chrono ? 1 + Math.sin(t * 3) * 0.4 : 0.4 + (Math.random() < 0.02 ? 1 : 0)) + glow;
    P.coil.material.emissive?.setHex?.(chrono ? 0x401800 : 0x000000);
    if (this.machineSrc) { this.machineSrc.on = chrono || glow > 0; this.machineSrc.intensity = (chrono ? 1.2 + Math.sin(t * 5) * 0.4 : 0) + glow * 2; this.localToWorld(_v.set(0, VAN.floor + 1.3 + this.lift, 1.5), this.machineSrc.pos); }
    // ENGAGE lever spring
    if (this.leverAnim) { this.leverAnim = Math.max(0, this.leverAnim - dt * 1.2); P.lever.rotation.x = 0.6 - Math.sin(Math.min(1, (1 - this.leverAnim) * 3) * Math.PI) * 1.4; }
    // jars show stored specimens
    const nSpec = this.shelf.slots.filter(Boolean).length;
    P.jars.forEach((j, k) => { j.visible = k < nSpec; });
    // dock LEDs
    this.dock.slots.forEach((s, k) => { const led = P.dockLeds[k]; const full = s && (s.ch ?? 0) >= (ITEMS[s.id]?.charge ?? 0); led.material.emissive.setHex(full ? 0x40ff60 : 0xffb020); led.material.emissiveIntensity = s && powered ? (full ? 1.5 : Math.sin(t * 5) > 0 ? 1.5 : 0.2) : 0; });
    // dynamo crank spin
    if (this.dynamo) this.dynamo.userData.crank.rotation.x = -(this.crankAngle ?? 0);
    // bobblehead spring
    const b = P.bobble;
    const lat = this.drive.speed * this.drive.steer * 0.1;
    b.a.set(-b.head.rotation.z * 60 - b.v.x * 3 + lat, -b.head.rotation.x * 60 - b.v.y * 3 - (this.drive.throttle * 2));
    b.v.addScaledVector(b.a, dt);
    b.head.rotation.z += b.v.x * dt; b.head.rotation.x += b.v.y * dt;
    b.head.rotation.z = Math.max(-0.7, Math.min(0.7, b.head.rotation.z)); b.head.rotation.x = Math.max(-0.7, Math.min(0.7, b.head.rotation.x));
    P.dice.rotation.z += ((-lat * 0.05) - P.dice.rotation.z) * Math.min(1, dt * 3) + Math.sin(t * 2.3) * 0.002;
    P.dice.rotation.x += ((this.drive.throttle * -0.15) - P.dice.rotation.x) * Math.min(1, dt * 3);
    // headlights
    const headOn = (this.drive.on && (this.headOn ?? g.time.isNight)) || (lights && g.time.isNight && this.drive.on);
    this.head.intensity += ((headOn ? 40 : 0) - this.head.intensity) * Math.min(1, dt * 8);
    P.headlights[0].material.emissive?.setHex?.(headOn ? 0xfff2c8 : 0x000000);
    if (P.headlights[0].material.emissive) P.headlights[0].material.emissiveIntensity = headOn ? 2 : 0;
    // upgrades animation
    const U = this.upGroups || {};
    if (U.floodlights) { const on = lights && g.time.isNight; for (const l of U.floodlights.userData.lamps) l.material.emissiveIntensity = on ? 3 : 0; this.flood.intensity += ((on ? 60 : 0) - this.flood.intensity) * Math.min(1, dt * 6); }
    if (U.generator) { U.generator.userData.fan.rotation.x += dt * (this.genOn ? 30 : 0); if (this.genOn && Math.random() < dt * 6) g.fx.smoke(this.localToWorld(_v.set(-0.65, 1.74 + this.lift, VAN.z1 + 0.52)), 0x6a6460, 0.5); }
    if (U.roofdeck?.userData.flag) { const f = U.roofdeck.userData.flag; const pa = f.geometry.attributes.position; if (!f.userData.base) f.userData.base = pa.array.slice(); const base = f.userData.base; for (let i = 0; i < pa.count; i++) { const x = base[i * 3]; pa.setZ(i, Math.sin(t * 6 + x * 9) * 0.05 * (x + 0.23) * 2.2); } pa.needsUpdate = true; }
    if (U.microscope) U.microscope.userData.seqLeds.forEach((l, k) => { l.material.emissiveIntensity = S.sw[SW.COMPUTER] && powered && Math.sin(t * (3 + k) + k) > 0.3 ? 1.6 : 0; });
    if (P.dish.userData.fixed && powered) P.dish.rotation.y += dt * 0.5;
    // ambient fx: engine smoke until repaired, sparks from the fried loom
    this.fxIdle = (this.fxIdle ?? 0) - dt;
    if (this.fxIdle <= 0) {
      this.fxIdle = 0.22;
      if (!S.repaired.engine && g.local.pos.distanceTo(this.pos) < 90) g.fx.smoke(this.localToWorld(_v.copy(P.anchors.engine).add(new THREE.Vector3(0, 0.25 + this.lift, 0))), 0x5a5856, 0.9);
      if (!S.repaired.wiring && Math.random() < 0.18) {
        const sp = this.localToWorld(_v.set(-0.55 + Math.random() * 0.12, 0.9, -0.8));
        for (let k = 0; k < 5; k++) g.fx.sprite('spark', sp.x, sp.y, sp.z, { vx: (Math.random() - 0.5) * 2.5, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 2.5, life: 0.3, size: 0.07, color: 0xffe0a0, grav: 9 });
        if (g.local.pos.distanceTo(sp) < 10) g.audio?.play('spark', { pos: sp, vol: 0.35, gap: 300 });
      }
    }
    // audio emitters
    this.audio.setPos({ engine: this.localToWorld(P.anchors.engine, this._ae || (this._ae = new THREE.Vector3())), crank: this.localToWorld(_v.set(-0.3, 0.85, -0.62), this._ac || (this._ac = new THREE.Vector3())), hum: this.localToWorld(_v.set(-0.7, 1.2, 0.2), this._ah || (this._ah = new THREE.Vector3())), radio: this.localToWorld(_v.set(0, 1.1, -1.8), this._ar || (this._ar = new THREE.Vector3())) });
    this.audio.humLevel(S.sw[SW.COMPUTER] && powered ? 1 : 0);
    this.audio.update();
  }
  updateIdleVisuals(dt) {
    // engine idle sound off, keep the bobblehead settling etc.
    if (!this.drive.on) this.audio.engine(false, 0, 0);
    void dt;
  }

  // ======================================================================== CRT screens (3D canvases)
  updateScreens(dt) {
    const S = this.s, P = this.parts;
    this.screenT -= dt;
    for (let i = 0; i < 3; i++) if (this.screenOn(i)) this.boot[i] += dt; else this.boot[i] = 0;
    // dead side monitors: flickering dot
    if (this.screenT > 0) return;
    this.screenT = 0.2;
    P.screens.forEach((scr, i) => {
      const on = this.screenOn(i);
      const dead = i > 0 && !S.repaired.crt && S.sw[SW.COMPUTER] && S.charge > 0;
      scr.mat.emissiveIntensity = on ? 1.25 : dead ? 0.8 : 0;
      if (!on && !dead) return;
      const ctx = scr.scr.ctx, W = scr.scr.c.width, H = scr.scr.c.height;
      ctx.fillStyle = '#071408'; ctx.fillRect(0, 0, W, H);
      if (dead) { if (Math.random() < 0.7) { ctx.fillStyle = '#c8ffc8'; ctx.fillRect(W / 2 - 1, H / 2 - 1, 2, 2); } scr.scr.tex.needsUpdate = true; return; }
      if (i === 0 && this.g.computer?.drawScreen && this.boot[0] > 3.2) this.g.computer.drawScreen(ctx, W, H, this);
      else this.drawScreen(ctx, W, H, i, this.boot[i]);
      // scanlines
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < H; y += 2) ctx.fillRect(0, y, W, 1);
      scr.scr.tex.needsUpdate = true;
    });
    // time display
    const d = P.timeDisplay, c = d.ctx;
    c.fillStyle = '#100604'; c.fillRect(0, 0, 128, 32);
    c.font = '14px VT323'; c.textBaseline = 'top';
    const chrono = S.sw[SW.CHRONO] && S.charge > 0;
    c.fillStyle = chrono ? '#ff6a3a' : '#5a2a1a';
    c.fillText('DEST 10-26-1987', 3, 2);
    c.fillStyle = chrono ? '#40ff60' : '#1a4a1a';
    c.fillText(Math.floor(this.t * 2) % 2 && !chrono ? 'NOW  ??-??-????' : 'NOW  -66,000,000', 3, 16);
    d.tex.needsUpdate = true;
  }
  drawScreen(ctx, W, H, i, bt) {
    const S = this.s, g = this.g;
    ctx.font = '11px VT323'; ctx.textBaseline = 'top';
    const line = (txt, y, col = '#8dff9a') => { ctx.fillStyle = col; ctx.fillText(txt, 5, y); };
    if (bt < 3.2) {
      const lines = ['CHRONO-OS BIOS v0.9', '(C) 1987 DOUG & KEV LABS', '', 'MEM TEST ' + Math.min(640, Math.floor(bt * 400)) + 'K', bt > 1.6 ? 'FLUX CAPACITY.... ??' : '', bt > 2.0 ? 'TEMPORAL DRIVE... FAIL' : '', bt > 2.5 ? 'LOADING DINO.SYS' : ''];
      lines.forEach((l, k) => line(l, 4 + k * 11, l.includes('FAIL') ? '#ff7060' : '#8dff9a'));
      if (Math.floor(bt * 4) % 2) ctx.fillRect(5, 4 + lines.length * 11, 6, 9);
      return;
    }
    if (i === 0) {
      line('CHRONO-OS 0.9', 4, '#c8ffc8');
      ctx.fillStyle = '#c8ffc8'; ctx.fillText(g.time.clock(), W - 48, 4);
      ctx.fillStyle = '#3a8a44'; ctx.fillRect(5, 16, W - 10, 1);
      const pc = S.charge / this.cap();
      line('POWER', 22);
      ctx.fillStyle = '#1a3a1e'; ctx.fillRect(40, 24, 80, 7);
      ctx.fillStyle = pc < 0.15 ? '#ff7060' : '#8dff9a'; ctx.fillRect(40, 24, Math.floor(80 * pc), 7);
      ctx.fillText(this.pct() + '%', 125, 22);
      line('PARTS ' + SOCKETS.filter((k) => S.sockets[k]).length + '/5', 36);
      line('ENGINE ' + (S.repaired.engine ? 'OK' : 'ERR'), 48, S.repaired.engine ? '#8dff9a' : '#ff7060');
      line('> PRESS E TO LOG IN', 66, Math.floor(this.t * 2) % 2 ? '#8dff9a' : '#4a9a54');
      // tiny walking pixel dino
      const x = (this.t * 14) % (W + 30) - 20, y = H - 26;
      ctx.fillStyle = '#8dff9a';
      const px = (a, b, w = 2, h = 2) => ctx.fillRect(Math.floor(x + a), y + b, w, h);
      px(8, 0, 6, 4); px(4, 4, 10, 6); px(0, 6, 4, 2); px(12, 2, 2, 2); const st = Math.floor(this.t * 6) % 2; px(5 + st * 2, 10, 2, 4); px(10 - st * 2, 10, 2, 4);
      ctx.fillStyle = '#071408'; px(11, 1, 1, 1);
      return;
    }
    if (i === 1) {
      line('DINO-DEX', 4, '#c8ffc8');
      const list = g.dinos?.nearbySummary?.(this.pos, 80) ?? [];
      if (!list.length) line('NO LIFEFORMS', 20, '#4a9a54');
      list.slice(0, 6).forEach((d, k) => line(d, 18 + k * 11));
      // radar sweep
      const cx = W - 30, cy = H - 30, a = this.t * 2;
      ctx.strokeStyle = '#3a8a44'; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, 6.283); ctx.stroke();
      ctx.strokeStyle = '#8dff9a'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22); ctx.stroke();
      return;
    }
    line('FLUX MONITOR', 4, '#c8ffc8');
    ctx.strokeStyle = '#8dff9a'; ctx.beginPath();
    const amp = S.sw[SW.CHRONO] ? 18 : 4;
    for (let x = 0; x < W; x += 2) { const y = H / 2 + Math.sin(x * 0.12 + this.t * 6) * amp * Math.sin(x * 0.02 + this.t) + (Math.random() - 0.5) * 2; x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    line('1.21 GW REQ', H - 14, S.sw[SW.CHRONO] ? '#ffd060' : '#4a9a54');
  }

  // ======================================================================== frame
  update(dt) {
    this.t += dt;
    const g = this.g;
    if (this.climbing) { if (this.climbing(dt)) this.climbing = null; }
    this.updateHold(dt);
    this.updatePower(dt);
    const moved = this.updateDriving(dt);
    if (moved) this.applyPose();
    // seated players follow their seats
    this.driver = null;
    for (const p of g.players.values()) {
      const st = p.sitting;
      if (!st || st.van !== this) continue;
      if (st.seat === 'seat_driver') this.driver = p;
      const seat = this.parts.seats[st.seat];
      this.localToWorld(_v.copy(seat.seatPos).add(new THREE.Vector3(0, this.lift - 0.42, 0)), p.pos);
      p.root.position.copy(p.pos);
      p.root.quaternion.copy(this.root.quaternion);
      p.yaw = this.pose.yaw;
      if (p.local && !g.uiOpen && this.t - (st.since ?? 0) > 0.35 && (g.input.pressed('interact') || g.input.pressed('dismount'))) this.unsit(p);
    }
    // seated prompt for the local player
    const ls = g.local.sitting;
    if (ls?.van === this && !g.uiOpen) {
      const drive = ls.seat === 'seat_driver';
      const why = drive ? this.whyCantDrive() : null;
      g.ui?.setPrompt(drive ? { key: g.input.keyName('interact'), text: 'Get out', alt: why ? { key: '-', text: 'Needs: ' + why } : { key: 'W/S', text: this.drive.on ? `Drive · ${Math.abs(this.drive.speed * 3.6).toFixed(0)} km/h · fuel ${this.s.fuel.toFixed(1)}` : 'Start engine' } } : { key: g.input.keyName('interact'), text: 'Get out', alt: { key: 'H', text: 'Honk (you are not the driver, but who cares)' } });
      if (!drive && g.input.pressed('horn')) this.honk();
    }
    this.updateJump(dt);
    this.updateVisuals(dt);
    this.updateScreens(dt);
  }

  // ======================================================================== network + save
  netState() {
    const S = this.s;
    return { s: JSON.parse(JSON.stringify(S)), storage: this.storage.serialize(), fridge: this.fridge.serialize(), shelf: this.shelf.serialize(), dock: this.dock.serialize() };
  }
  applyNetState(d) {
    const before = JSON.stringify(this.s.doors);
    const prevRadio = this.s.radio;
    Object.assign(this.s, d.s);
    if (d.storage) this.storage.load(d.storage);
    if (d.fridge) this.fridge.load(d.fridge);
    if (d.shelf) this.shelf.load(d.shelf);
    if (d.dock) this.dock.load(d.dock);
    this.applyRepairs(false); this.applyUpgrades(false); this.applySockets(false); this.applyGlove(false); this.applyHood(false);
    if (prevRadio !== this.s.radio) this.applyRadio();
    if (before !== JSON.stringify(this.s.doors)) this.rebuildColliders();
    if (!this.driverIs(this.g.local)) { this.pose.x = this.s.x; this.pose.z = this.s.z; this.pose.yaw = this.s.yaw; }
  }
  applyNetPose(m) {
    if (this.driverIs(this.g.local)) return;
    const P = this.pose;
    const ox = P.x, oz = P.z, oyaw = P.yaw;
    P.x = m.x; P.y = m.y; P.z = m.z; P.yaw = m.yaw; P.pitch = m.p; P.roll = m.r;
    this.drive.speed = m.sp; this.drive.steer = m.st; this.drive.on = !!m.on; this.drive.throttle = m.th;
    this.s.x = m.x; this.s.z = m.z; this.s.yaw = m.yaw;
    this.applyPose();
    this.carryRiders(ox, oz, oyaw);
    for (const w of this.parts.wheels) { w.spin.rotation.x -= (m.sp / 15) / VAN.wheelR; if (w.front) w.pivot.rotation.y = m.st; }
    this.audio.engine(this.drive.on, Math.min(1, Math.abs(m.sp) / 14), Math.abs(m.th));
  }
  serialize() {
    const S = this.s;
    S.x = this.pose.x; S.z = this.pose.z; S.yaw = this.pose.yaw;
    return this.netState();
  }
  load(d) {
    if (!d) return;
    this.applyNetState(d);
    this.pose.x = this.s.x; this.pose.z = this.s.z; this.pose.yaw = this.s.yaw;
    this.restOnGround(true);
    this.applyPose();
    this.applyRadio();
  }
}

// ========================================================================== install
export async function install(g) {
  const van = new Van(g);
  g.van = van;
  van.registerActions();
  g.addSystem(van);
  g.interaction.handlers.push((o, d, reach) => van.raycastInteract(o, d, reach));
  g.extraColliders.push((x, z, r, out) => van.collidersNear(x, z, r, out));
  g.stationProviders.push((p) => (van.near(p, 4) ? ['van'] : []));
  g.saveables.van = { save: () => van.serialize(), load: (d) => van.load(d) };
  g.netHandlers.vanState = (d) => van.applyNetState(d);
  g.netHandlers.vanPose = (d, from) => { van.applyNetPose(d); if (g.isHost) g.net?.broadcast?.('vanPose', d, from); };
  g.netHandlers.vanHorn = () => g.audio?.play('horn', { pos: van.pos, vol: 0.9 });
  g.netHandlers.timeJump = () => { van.jumping = 0.001; g.events.emit('timeJump', { van }); };
  // when the local player is inside, the van counts as shelter (rain/cold)
  g.isInVan = (p = g.local.pos) => van.isInside(p);
  g.events.on('started', () => van.applyPose());
  return van;
}
