// Van repairs + upgrades: data and the bolted-on homemade visuals for each.
// Every upgrade is a crazy contraption made from scrap, planks and hope.
import * as THREE from 'three';
import { VAN, std, box, cyl, mk, at } from './vanModel.js';
import { PixelPainter } from '../gfx/pixel.js';
import { textTexture } from '../gfx/vanTextures.js';

// ------------------------------------------------------------------ repairs
// where: which interactable on the van accepts the part
export const REPAIRS = {
  dynamo: { name: 'Hand-Crank Dynamo', item: 'crank_dynamo', where: 'bench', verb: 'Bolt on', time: 2.2, desc: 'Charges the dead batteries. Elbow grease sold separately.' },
  tire: { name: 'Flat Tire', item: 'spare_tire', where: 'wheel', verb: 'Swap', time: 3.2, desc: 'Front-left is flatter than a pancake.' },
  axle: { name: 'Bent Axle', item: 'axle', where: 'wheel', verb: 'Hammer in', time: 3.6, desc: 'The front wheel points at the sky a little.' },
  engine: { name: 'Engine', item: 'engine_parts', where: 'hood', verb: 'Rebuild', time: 4.0, desc: 'Coughing smoke. Missing several important pistons.' },
  wiring: { name: 'Fried Wiring', item: 'wiring_harness', where: 'breaker', verb: 'Rewire', time: 3.0, desc: 'Sparks. So many sparks. Ignition and CHRONO circuits are dead.' },
  crt: { name: 'Side Monitors', item: 'crt_part', where: 'screens', verb: 'Fix', time: 2.6, desc: 'Two of the three monitors only show a sad dot.' },
  headlight: { name: 'Smashed Headlight', cost: { glass: 1, scrap: 1 }, where: 'headlight', verb: 'Replace', time: 1.6, desc: 'Something with a beak headbutted it.' },
  windshield: { name: 'Cracked Windshield', cost: { glass: 3, resin: 2 }, where: 'windshield', verb: 'Patch', time: 2.4, desc: 'The crack looks like a map of nowhere.' },
};
export const DRIVE_NEEDS = ['tire', 'axle', 'engine', 'wiring'];

// ------------------------------------------------------------------ upgrades
export const UPGRADES = [
  { id: 'roofdeck', name: 'Roof Deck', cost: { plank: 16, rope: 6, scrap: 4 }, unlock: null, desc: 'Plank platform, rope railings and a ladder. The best seat in the Cretaceous.' },
  { id: 'horn', name: 'Air Horn of Doom', cost: { scrap: 4, wire: 2, hide: 1 }, unlock: null, desc: 'Twin trumpet horns. Small critters scatter. Big ones get curious.' },
  { id: 'storage', name: 'Cargo Pods', cost: { plank: 10, hide: 4, rope: 4 }, unlock: null, desc: '+12 storage slots in the van.' },
  { id: 'battery2', name: 'Battery Bank II', cost: { battery: 3, wire: 4, scrap: 2 }, unlock: 'electrics', desc: 'Doubles battery capacity.' },
  { id: 'floodlights', name: 'Night Floodlights', cost: { lamp: 2, wire: 4, scrap: 4 }, unlock: 'electrics', desc: 'Roof light bar. Night predators avoid the van.' },
  { id: 'solar', name: 'Solar Roof', cost: { glass: 4, circuit: 2, wire: 4, scrap: 4 }, unlock: 'solar', desc: 'Charges the batteries during the day.' },
  { id: 'microscope', name: 'Microscope Rig', cost: { glass: 2, circuit: 2, scrap: 3, ingot_copper: 1 }, unlock: 'lab', desc: 'Research runs 50% faster. Enables DNA work.' },
  { id: 'coffee', name: 'Coffee Maker', cost: { coffee_machine: 1 }, unlock: 'comfort', desc: 'Brews Van Coffee from clean water. Morale +1000.' },
  { id: 'generator', name: 'Dung-o-Matic Generator', cost: { scrap: 10, ingot_iron: 4, wire: 6, circuit: 1 }, unlock: 'biofuel', desc: 'Burns Dung-o-Diesel from the tank to charge the batteries.' },
  { id: 'dish', name: 'Fixed Satellite Dish', cost: { scrap: 6, wire: 6, circuit: 2 }, unlock: 'radio', desc: 'Shows critters near the van on the map. Gets one (1) radio station.' },
  { id: 'armor', name: 'Scrap Armor + Bull Bar', cost: { scrap: 20, ingot_iron: 6, rope: 4 }, unlock: 'mechanics', desc: 'Bolted plates and a spiky bull bar. Ram things. Take less damage.' },
  { id: 'wheels', name: 'Monster Wheels', cost: { hide: 10, tar: 8, ingot_iron: 6 }, unlock: 'mechanics', needs: ['axle', 'tire'], desc: 'Lifted suspension and huge tires. Drives through rivers and over logs.' },
];
export const upgradeById = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

const chrome = () => std('chrome', {});
const metal = () => std('metal', {});

// ------------------------------------------------------------------ repair visuals
export function buildDynamo() {
  const g = new THREE.Group(); g.name = 'dynamo';
  // drum mounted on the bench front, crank arm pointing into the aisle
  g.position.set(-0.36, 0.82, -0.62);
  const housing = cyl(0.11, 0.11, 0.16, std('dynamo', { color: 0x3a6a9a, roughness: 0.45, metalness: 0.4 }), 14);
  housing.rotation.z = Math.PI / 2; g.add(housing);
  g.add(at(cyl(0.115, 0.115, 0.02, chrome(), 14), 0.08, 0, 0, 0, 0, Math.PI / 2));
  // copper coil window
  const win = box(0.002, 0.08, 0.1, std('copper', {}), 0.0, 0.06, 0, 0, 0); win.rotation.z = 0.0; g.add(win);
  const crank = new THREE.Group(); crank.position.set(0.12, 0, 0); g.add(crank);
  const arm = box(0.03, 0.2, 0.03, metal(), 0.02, 0.09, 0, 0.008, 0); crank.add(arm);
  const handle = cyl(0.022, 0.022, 0.11, std('dynhandle', { color: 0xc8302a, roughness: 0.5 }), 8); handle.rotation.z = Math.PI / 2; handle.position.set(0.08, 0.18, 0); crank.add(handle);
  // tape + label
  const lab = mk(new THREE.PlaneGeometry(0.1, 0.03), std('dynlabel', { map: textTexture(['CRANK ME'], { w: 96, h: 28, bg: '#f2efe6', fg: '#c8302a', size: 15 }) }), false);
  lab.position.set(0, 0.115, 0); lab.rotation.x = -Math.PI / 2; g.add(lab);
  // cable down to the batteries
  const pts = [new THREE.Vector3(-0.05, -0.08, 0), new THREE.Vector3(-0.1, -0.2, 0.05), new THREE.Vector3(-0.2, -0.3, 0.2)];
  g.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.012, 5), std('cable' + 0xd03030, {}), false));
  g.userData.crank = crank;
  return g;
}

export function buildHarness() {
  // neatly zip-tied loom along the ceiling, colour-coded like a responsible adult did it
  const g = new THREE.Group(); g.name = 'harness';
  const pts = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector3(-0.55 + Math.sin(t * 3) * 0.04, VAN.roof - 0.13, -0.95 + t * 2.75)); }
  pts.push(new THREE.Vector3(-0.2, VAN.roof - 0.4, 1.95));
  const curve = new THREE.CatmullRomCurve3(pts);
  const cols = [0xd03030, 0x2a50a0, 0xf2d040, 0x30a050];
  cols.forEach((c, k) => {
    const off = new THREE.Vector3(Math.cos(k * 1.57) * 0.018, Math.sin(k * 1.57) * 0.018, 0);
    const p2 = curve.getPoints(40).map((p) => p.clone().add(off));
    g.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p2), 40, 0.011, 5), std('cable' + c, { color: c, roughness: 0.6 }), false));
  });
  for (let i = 1; i < 12; i++) { const p = curve.getPoint(i / 12); const z = mk(new THREE.TorusGeometry(0.034, 0.006, 4, 8), std('ziptie', { color: 0x161616, roughness: 0.6 }), false); z.position.copy(p); z.lookAt(curve.getPoint(i / 12 + 0.01)); g.add(z); }
  // new breaker bus bar
  g.add(box(0.36, 0.03, 0.02, std('copper', {}), -0.55, 1.29, -0.95, 0, 0));
  return g;
}

export function buildEngineBay(repaired) {
  // visible when the hood hatch is open
  const g = new THREE.Group(); g.name = 'engine';
  g.position.set(0, 0.62, VAN.z0 + 0.42);
  const block = box(0.62, 0.32, 0.3, std(repaired ? 'engineNew' : 'engineOld', { color: repaired ? 0x8a8e94 : 0x4a3c34, roughness: repaired ? 0.35 : 0.9, metalness: 0.6 }), 0, 0.16, 0, 0.03, 0);
  g.add(block);
  const filter = cyl(0.12, 0.12, 0.07, std(repaired ? 'airfilter' : 'airfilterOld', { color: repaired ? 0xd03030 : 0x6a2a20, roughness: 0.5 }), 14); filter.position.set(-0.12, 0.36, 0); g.add(filter);
  const belt = mk(new THREE.TorusGeometry(0.08, 0.012, 4, 14), std('rubber', {})); belt.position.set(0.24, 0.18, -0.16); g.add(belt);
  if (repaired) {
    // bone pistons poking out (as advertised)
    for (let k = 0; k < 3; k++) { const b = cyl(0.025, 0.03, 0.14, std('bonewhite', { color: 0xe8dcc0, roughness: 0.6 }), 8); b.position.set(-0.18 + k * 0.16, 0.36, 0.08); g.add(b); }
    g.add(box(0.08, 0.02, 0.12, std('duct', { color: 0xa8acb0, roughness: 0.7 }), 0.22, 0.33, 0.02, 0, 0));
  } else {
    g.add(box(0.22, 0.02, 0.2, std('scorch', {}), 0.08, 0.33, 0, 0, 0));
  }
  return g;
}

// ------------------------------------------------------------------ upgrade visuals
function solarTex() {
  const p = new PixelPainter(64, 32, 41);
  p.fill([22, 34, 70]);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 64; x++) {
    if (x % 8 === 0 || y % 8 === 0) p.set(x, y, [180, 190, 200]);
    else if ((x + y) % 7 === 0) p.set(x, y, [40, 60, 120]);
  }
  p.scatter(10, (x, y) => p.set(x, y, [120, 150, 220]));
  return p.texture();
}
function plateTex() {
  const p = new PixelPainter(32, 32, 43);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const n = ((x * 7 + y * 13) % 11) / 11; p.set(x, y, [110 + n * 20, 108 + n * 18, 100 + n * 14]); }
  for (const [x, y] of [[2, 2], [29, 2], [2, 29], [29, 29], [15, 2], [15, 29]]) { p.set(x, y, [200, 200, 196]); p.set(x + 1, y + 1, [60, 58, 54]); }
  p.scatter(6, (x, y) => p.disc(x, y, 1.5, [130, 70, 40]));
  return p.texture();
}

export function buildUpgrade(id) {
  const g = new THREE.Group(); g.name = 'up_' + id;
  const { roof, z0, z1 } = VAN;
  const W2 = VAN.W / 2;
  const plank = std('upplank', { color: 0xa87a4a, roughness: 0.8, map: (() => { const p = new PixelPainter(32, 32, 44); for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) { const k = Math.floor(y / 8); const n = ((x * 5 + k * 17) % 9) / 9; p.set(x, y, y % 8 === 0 ? [90, 60, 34] : [160 + n * 30, 112 + n * 22, 66 + n * 14]); } return p.texture(); })() });
  const ropeM = std('uprope', { color: 0xc8b080, roughness: 0.9 });
  switch (id) {
    case 'roofdeck': {
      const y = roof + 0.2;
      for (let k = 0; k < 10; k++) g.add(box(1.86, 0.04, 0.38, plank, 0, y, -1.45 + k * 0.4, 0.008, 1.2));
      // railing posts + rope rails
      const posts = [];
      for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) posts.push([sx * 0.9, -1.6 + k * 0.95]);
      for (const [x, z] of posts) g.add(box(0.05, 0.55, 0.05, plank, x, y + 0.3, z, 0.01, 0));
      for (const sx of [-1, 1]) for (const hy of [0.28, 0.52]) {
        const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new THREE.Vector3(sx * 0.9, y + hy - Math.sin(t * Math.PI * 4) ** 2 * 0.03, -1.6 + t * 3.8)); }
        g.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.015, 4), ropeM, false));
      }
      // ladder at the back right
      const lx = 0.62, lz = z1 + 0.16;
      for (const dx of [-0.17, 0.17]) g.add(box(0.04, roof + 0.25 - 0.3, 0.04, metal(), lx + dx, (roof + 0.25 + 0.3) / 2, lz, 0, 0));
      for (let k = 0; k < 6; k++) g.add(box(0.36, 0.03, 0.03, metal(), lx, 0.5 + k * 0.32, lz, 0, 0));
      // deck chair + flag, because of course
      const chair = new THREE.Group(); chair.position.set(-0.4, y + 0.02, 1.3); chair.rotation.y = 2.6; g.add(chair);
      const stripes = std('chairfab', { map: (() => { const p = new PixelPainter(16, 16, 45); for (let y2 = 0; y2 < 16; y2++) for (let x = 0; x < 16; x++) p.set(x, y2, Math.floor(x / 4) % 2 ? [240, 236, 220] : [60, 140, 200]); return p.texture(); })(), roughness: 0.9 });
      chair.add(box(0.45, 0.03, 0.42, stripes, 0, 0.25, 0, 0, 1));
      const back = box(0.45, 0.45, 0.03, stripes, 0, 0.45, 0.22, 0, 1); back.rotation.x = -0.4; chair.add(back);
      for (const sx of [-1, 1]) { const leg = box(0.02, 0.36, 0.02, chrome(), sx * 0.22, 0.17, 0, 0, 0); leg.rotation.x = 0.5; chair.add(leg); const leg2 = leg.clone(); leg2.rotation.x = -0.5; chair.add(leg2); }
      const pole = box(0.025, 1.3, 0.025, plank, 0.82, y + 0.65, 2.1, 0, 0); g.add(pole);
      const flag = mk(new THREE.PlaneGeometry(0.45, 0.28, 6, 1), std('flagfab', { map: textTexture(['TEAM VAN'], { w: 128, h: 80, bg: '#f2b630', fg: '#17130e', size: 20 }), side: THREE.DoubleSide, roughness: 0.9 }), false);
      flag.position.set(0.82 - 0.23, y + 1.18, 2.1); g.add(flag); g.userData.flag = flag;
      break;
    }
    case 'horn': {
      for (const sx of [-1, 1]) {
        const h = mk(new THREE.CylinderGeometry(0.02, 0.09, 0.42, 12, 1, true), std('hornbrass', { color: 0xd8a840, roughness: 0.25, metalness: 1, side: THREE.DoubleSide }));
        h.rotation.x = -Math.PI / 2; h.position.set(sx * 0.3, roof + 0.16, -1.62 - (sx > 0 ? 0.06 : 0)); g.add(h);
      }
      g.add(box(0.7, 0.06, 0.1, metal(), 0, roof + 0.1, -1.45, 0.01, 0));
      break;
    }
    case 'storage': {
      const pod = box(1.2, 0.36, 1.3, std('pod', { color: 0x2a2a2e, roughness: 0.4 }), 0, roof + 0.4, -0.85, 0.15, 0);
      g.add(pod);
      g.add(box(0.3, 0.06, 0.04, chrome(), 0, roof + 0.42, -0.85 - 0.66, 0, 0));
      const sticker = mk(new THREE.PlaneGeometry(0.4, 0.1), std('podlabel', { map: textTexture(['SNACKS'], { w: 128, h: 32, bg: '#e8614f', fg: '#ffffff', size: 18 }) }), false);
      sticker.position.set(0.61, roof + 0.4, -0.85); sticker.rotation.y = Math.PI / 2; g.add(sticker);
      // spare box on the back door
      const sb = box(0.62, 0.42, 0.24, std('sparebox', { color: 0x4a7a3a, roughness: 0.6 }), -0.48, 1.25, z1 + 0.15, 0.04, 0);
      g.userData.rearBox = sb;
      break;
    }
    case 'battery2': {
      for (let k = 0; k < 3; k++) {
        g.add(box(0.24, 0.2, 0.18, std('black', {}), -0.64, VAN.floor + 0.11, 0.38 + k * 0.22, 0.015, 0));
        for (const sx of [-1, 1]) g.add(at(cyl(0.018, 0.018, 0.03, sx < 0 ? std('red', {}) : std('black', {}), 8), -0.64 + sx * 0.07, VAN.floor + 0.23, 0.38 + k * 0.22));
      }
      break;
    }
    case 'floodlights': {
      const bar = box(1.6, 0.08, 0.1, std('black', {}), 0, roof + 0.32, -1.5, 0.02, 0); g.add(bar);
      for (const sx of [-1, 1]) g.add(box(0.04, 0.3, 0.04, std('black', {}), sx * 0.75, roof + 0.17, -1.5, 0, 0));
      g.userData.lamps = [];
      for (let k = 0; k < 4; k++) {
        const housing = box(0.24, 0.16, 0.14, std('black', {}), -0.6 + k * 0.4, roof + 0.43, -1.52, 0.02, 0); g.add(housing);
        const lens = mk(new THREE.PlaneGeometry(0.2, 0.12), std('floodlens' + k, { color: 0xf8f4e0, emissive: 0xfff2c8, emissiveIntensity: 0, roughness: 0.2 }), false);
        lens.position.set(-0.6 + k * 0.4, roof + 0.43, -1.595); lens.rotation.y = Math.PI; g.add(lens);
        g.userData.lamps.push(lens);
      }
      break;
    }
    case 'solar': {
      const tex = solarTex();
      const m = std('solarcells', { map: tex, roughness: 0.18, metalness: 0.4 });
      g.userData.panels = [];
      for (let k = 0; k < 2; k++) {
        const p = new THREE.Group(); p.position.set(0, roof + 0.3 + (k ? 0.0 : 0), 0.5 + k * 0.95); g.add(p);
        const frame = box(1.6, 0.04, 0.86, chrome(), 0, 0, 0, 0.01, 0); p.add(frame);
        const cells = mk(new THREE.PlaneGeometry(1.54, 0.8), m, false); cells.rotation.x = -Math.PI / 2; cells.position.y = 0.022; p.add(cells);
        p.rotation.x = -0.12; p.rotation.z = (k ? -1 : 1) * 0.03;
        g.userData.panels.push(p);
        for (const sx of [-0.7, 0.7]) g.add(box(0.03, 0.2, 0.03, metal(), sx, roof + 0.2, 0.5 + k * 0.95, 0, 0));
      }
      break;
    }
    case 'microscope': {
      const s = new THREE.Group(); s.position.set(-0.68, 1.0, 0.62); s.rotation.y = Math.PI / 2; g.add(s);
      const white = std('microwhite', { color: 0xe8e8e4, roughness: 0.4 });
      s.add(box(0.16, 0.03, 0.2, white, 0, 0.015, 0, 0.01, 0));
      s.add(box(0.04, 0.22, 0.04, white, 0, 0.13, 0.07, 0.01, 0));
      const tube = cyl(0.025, 0.03, 0.16, std('black', {}), 10); tube.position.set(0, 0.2, 0.0); tube.rotation.x = 0.4; s.add(tube);
      s.add(box(0.1, 0.012, 0.1, std('black', {}), 0, 0.1, 0, 0, 0));
      const slide = box(0.06, 0.004, 0.025, std('glass', {}), 0, 0.108, 0, 0, 0); s.add(slide);
      // DNA sequencer box with blinky lights
      const seq = box(0.22, 0.12, 0.18, std('beige', {}), 0, 0.06, -0.2, 0.01, 0); s.add(seq);
      g.userData.seqLeds = [];
      for (let k = 0; k < 5; k++) { const l = mk(new THREE.BoxGeometry(0.015, 0.015, 0.004), std('seqled' + k, { color: 0x103010, emissive: [0x40ff60, 0xffd040, 0xff4040, 0x40c0ff, 0x40ff60][k], emissiveIntensity: 0 }), false); l.position.set(-0.08 + k * 0.04, 0.09, -0.11); s.add(l); g.userData.seqLeds.push(l); }
      break;
    }
    case 'coffee': {
      const c = new THREE.Group(); c.position.set(-0.68, 1.0, -0.56); c.rotation.y = Math.PI / 2; g.add(c);
      c.add(box(0.2, 0.3, 0.18, std('coffeeblk', { color: 0x2a2826, roughness: 0.5 }), 0, 0.15, 0, 0.02, 0));
      c.add(box(0.2, 0.04, 0.22, std('coffeeblk', {}), 0, 0.31, 0.02, 0.01, 0));
      const pot = cyl(0.06, 0.07, 0.12, std('glass', {}), 12); pot.position.set(0, 0.08, 0.07); c.add(pot);
      const brew = cyl(0.055, 0.065, 0.06, std('coffeebrew', { color: 0x3a1a08, roughness: 0.2 }), 12); brew.position.set(0, 0.05, 0.07); c.add(brew);
      g.userData.brew = brew;
      const led = mk(new THREE.BoxGeometry(0.015, 0.015, 0.004), std('coffeeled', { color: 0x301010, emissive: 0xff3020, emissiveIntensity: 0 }), false); led.position.set(0.07, 0.25, 0.092); c.add(led);
      g.userData.led = led;
      break;
    }
    case 'generator': {
      const gen = new THREE.Group(); gen.position.set(-0.45, 0.62, z1 + 0.42); g.add(gen);
      gen.add(box(0.7, 0.04, 0.5, metal(), 0, -0.04, 0, 0, 0));
      for (const sx of [-0.3, 0.3]) gen.add(box(0.04, 0.2, 0.3, metal(), sx, -0.12, -0.25, 0, 0));
      gen.add(box(0.56, 0.42, 0.38, std('genred', { color: 0xc8402a, roughness: 0.5, metalness: 0.3 }), 0, 0.21, 0, 0.04, 0));
      const fan = new THREE.Group(); fan.position.set(0.29, 0.22, 0); gen.add(fan);
      for (let k = 0; k < 4; k++) { const b = box(0.005, 0.24, 0.06, metal(), 0, 0, 0, 0, 0); b.rotation.x = k * Math.PI / 4; fan.add(b); }
      gen.add(at(mk(new THREE.TorusGeometry(0.15, 0.012, 4, 16), chrome()), 0.3, 0.22, 0, 0, Math.PI / 2, 0));
      const pipe = cyl(0.03, 0.03, 0.7, std('rustpipe', { color: 0x6a4a3a, roughness: 0.8, metalness: 0.5 }), 8); pipe.position.set(-0.2, 0.75, 0.1); gen.add(pipe);
      const lab = mk(new THREE.PlaneGeometry(0.4, 0.1), std('genlabel', { map: textTexture(['DUNG-O-MATIC'], { w: 160, h: 40, bg: '#f2d040', fg: '#17130e', size: 18 }) }), false);
      lab.position.set(0, 0.25, 0.192); g.userData.label = lab; gen.add(lab);
      g.userData.fan = fan; g.userData.exhaust = new THREE.Vector3(-0.65, 0.62 + 1.12, z1 + 0.52);
      break;
    }
    case 'dish': break; // modifies the existing dish (see van.js)
    case 'armor': {
      const pm = std('armorplate', { map: plateTex(), roughness: 0.6, metalness: 0.6 });
      for (const side of [-1, 1]) {
        for (let k = 0; k < 4; k++) {
          const z = -1.0 + k * 0.95;
          if (side > 0 && z > -1.1 && z < 0.5) continue; // leave the sliding door clear
          const p = box(0.03, 0.42, 0.8, pm, side * (W2 + 0.03), 0.76, z, 0.01, 1.4);
          p.rotation.x = (k % 2 ? 1 : -1) * 0.03; g.add(p);
        }
      }
      // bull bar with spikes
      const bar = new THREE.Group(); bar.position.set(0, 0.55, z0 - 0.24); g.add(bar);
      for (const y of [0, 0.3]) bar.add(box(2.0, 0.06, 0.06, metal(), 0, y, 0, 0.02, 0));
      for (const x of [-0.8, -0.3, 0.3, 0.8]) bar.add(box(0.06, 0.4, 0.06, metal(), x, 0.15, 0.02, 0.02, 0));
      for (let k = 0; k < 7; k++) { const s = mk(new THREE.ConeGeometry(0.04, 0.2, 6), std('bonewhite', { color: 0xe8dcc0, roughness: 0.6 })); s.rotation.x = -Math.PI / 2; s.position.set(-0.9 + k * 0.3, 0.0, -0.1); bar.add(s); }
      // window grilles
      for (const side of [-1, 1]) for (let k = 0; k < 4; k++) g.add(box(0.015, 0.6, 0.015, metal(), side * (W2 + 0.02), 1.62, 1.2 + k * 0.25, 0, 0));
      break;
    }
    case 'wheels': break; // handled by van.js (tire scale + lift)
    default: break;
  }
  g.traverse((o) => { if (o.isMesh) o.userData.van = true; });
  return g;
}
