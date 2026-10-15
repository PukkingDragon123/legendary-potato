// Research: scan the world with the Chrono-Scanner, analyse specimens at the
// van (CHRONO-OS mini-games), earn BIO / GEO / ZOO / PALEO data and spend it
// on a tech tree that unlocks recipes, building tiers, van parts and the
// time machine. Discoveries ("insights") gate the bigger breakthroughs.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { SPECIES } from '../world/plantModels.js';

export const CATS = { bio: { name: 'BIO', color: '#7bc86c' }, geo: { name: 'GEO', color: '#c8a070' }, zoo: { name: 'ZOO', color: '#f2b630' }, paleo: { name: 'PALEO', color: '#b090e0' } };

export const INSIGHTS = {
  snoozeberry: 'Scan a Snoozeberry Bush',
  clay: 'Scan a Clay Bank',
  copper: 'Scan a Copper Vein',
  meteorite: 'Scan a Meteorite Chunk',
  crystal: 'Scan Chrono Crystals',
  herb: 'Analyse a Healing Herb or plant sample',
  eggshell: 'Analyse an Eggshell Fragment',
  amber: 'Analyse Amber',
  amber_bug: 'Sequence the DNA in Amber with Mosquito',
  dung: 'Scan critter dung or analyse a Coprolite',
  seeds: 'Find seeds',
  tamed: 'Tame any critter',
  predator: 'Scan a predator',
  rex: 'Scan a Tyrannosaurus',
  ptera: 'Scan a Gustail',
  brachio: 'Scan a Treeneck',
  storm: 'Witness a thunderstorm',
  fossil: 'Clean a fossil at the research table',
};

const T = (id, name, cost, opt = {}) => ({ id, name, cost, needs: opt.needs ?? [], insight: opt.insight ?? [], desc: opt.desc ?? '', tier: opt.tier ?? 1, unlocks: opt.unlocks ?? '' });
export const TECHS = [
  T('tame_basics', 'Critter Psychology 101', { zoo: 3 }, { desc: 'They are basically big chickens with feelings.', unlocks: 'Bola, Slingshot, Catch Net, Whistle, Trough, Critter Bed' }),
  T('cooking', 'Fire Cuisine', { bio: 3 }, { desc: 'Applying fire to food. Revolutionary.', unlocks: 'Cooking Pot, Smoker, Cooler, boiling water' }),
  T('pottery', 'Ceramics', { geo: 4 }, { insight: ['clay'], desc: 'Mud + fire = bowls, bricks and pride.', unlocks: 'Clay Kiln, Lantern, Brick building tier' }),
  T('farming', 'Agriculture (Again)', { bio: 6 }, { insight: ['seeds'], desc: 'Invent farming 66 million years early. History is now confused.', unlocks: 'Crop Plot, Rain Catcher' }),
  T('comfort', 'Home Comforts', { bio: 4, geo: 4 }, { needs: ['cooking'], desc: 'A bed. A real bed.', unlocks: 'Comfy Bed, Coffee Machine, Coffee Maker (van)' }),
  T('medicine', 'Prehistoric Pharmacy', { bio: 8 }, { insight: ['herb'], needs: ['cooking'], desc: 'Leaves that fix you. Mostly.', unlocks: 'Med Kit' }),
  T('tranquilizers', 'Sleepy Juice', { bio: 5, zoo: 5 }, { insight: ['snoozeberry'], needs: ['tame_basics'], desc: 'Snoozeberry extract, extremely concentrated. Do not lick.', unlocks: 'Blowgun, Tranquilizer Darts' }),
  T('defense', 'Pointy Sticks', { zoo: 6 }, { insight: ['predator'], desc: 'Predators hate this one weird trick.', unlocks: 'Spike Wall' }),
  T('lab', 'Field Laboratory', { bio: 5, geo: 3, paleo: 3 }, { desc: 'A proper desk for proper science.', unlocks: 'Research Table, Microscope Rig (van)' }),
  T('eggs', 'Egg-xperiments', { paleo: 4, zoo: 4 }, { insight: ['eggshell'], needs: ['tame_basics'], desc: 'Warm eggs + patience = baby critters.', unlocks: 'Egg Incubator' }),
  T('saddles', 'Saddle Up', { zoo: 10 }, { insight: ['tamed'], needs: ['tame_basics'], desc: 'Ride the critter. Live the dream.', unlocks: 'Small Saddle, Big Saddle' }),
  T('metallurgy', 'Space Metal', { geo: 10 }, { insight: ['meteorite'], needs: ['pottery'], desc: 'Smelt the iron that fell from the sky.', unlocks: 'Forge, metal tools, Scrap Metal building tier' }),
  T('electrics', 'Electrical Engineering', { geo: 6, bio: 2 }, { insight: ['copper'], desc: 'Electrons are just very small critters.', unlocks: 'Wiring Harness, CRT Kit, batteries, lamps, Battery Bank II' }),
  T('mechanics', 'Van Mechanics', { geo: 12, zoo: 4 }, { needs: ['metallurgy'], desc: 'Pistons from bone. Tires from tar. What could go wrong.', unlocks: 'Engine Parts, Patched Tire, Axle, Armor, Monster Wheels' }),
  T('radio', 'Radio Waves', { geo: 8 }, { needs: ['electrics'], desc: 'Talk to friends across the island.', unlocks: 'Walkie-Talkie, Scanner Tower, Satellite Dish' }),
  T('solar', 'Photovoltaics', { geo: 10 }, { needs: ['electrics'], desc: 'Free power from the big hot ball.', unlocks: 'Solar Panel, Solar Roof (van)' }),
  T('biofuel', 'Dung-o-Diesel', { bio: 10, zoo: 6 }, { insight: ['dung'], needs: ['electrics'], desc: 'The van runs on critter poo now. Progress.', unlocks: 'Dung-o-Diesel, Dung Generator' }),
  T('automation', 'Lazy Engineering', { geo: 14, bio: 6 }, { needs: ['electrics', 'farming'], desc: 'Machines that do chores so you can do naps.', unlocks: 'Sprinkler, Auto-Harvester' }),
  T('dino_power', 'Hamster Wheel Theory', { zoo: 15, geo: 6 }, { needs: ['electrics', 'tame_basics'], desc: 'One raptor = 2.5 horsepower.', unlocks: 'Critter Wheel' }),
  T('big_game', 'Big Game Taming', { zoo: 20 }, { insight: ['rex'], needs: ['tranquilizers', 'metallurgy'], desc: 'For when a blowgun is not enough.', unlocks: 'Tranq Rifle, Tranq Shells, Rex Saddle' }),
  T('flight', 'Avian Engineering', { zoo: 18 }, { insight: ['ptera'], needs: ['saddles'], desc: 'Strap a harness to a flying lizard. Scream.', unlocks: 'Flyer Harness' }),
  T('sauropod', 'Walking Fortress', { zoo: 25, geo: 10 }, { insight: ['brachio'], needs: ['saddles', 'metallurgy'], desc: 'A house. On a critter.', unlocks: 'Platform Saddle' }),
  T('lightning', 'Catch Lightning', { geo: 20 }, { insight: ['storm'], needs: ['electrics'], desc: '1.21 gigawatts, but from the sky.', unlocks: 'Lightning Rod, Capacitor Bank, Power Core' }),
  T('temporal_theory', 'Temporal Theory', { paleo: 10, geo: 10 }, { insight: ['amber'], needs: ['electrics'], desc: 'Time is a flat circle. Or a coil. Probably a coil.', tier: 3, unlocks: 'Temporal Coil' }),
  T('crystal_resonance', 'Crystal Resonance', { geo: 25 }, { insight: ['crystal'], needs: ['temporal_theory'], desc: 'The crystals hum next Tuesday. We can tune that.', tier: 3, unlocks: 'Flux Crystal Matrix' }),
  T('timeline_math', 'Timeline Mathematics', { paleo: 20, zoo: 20 }, { insight: ['amber_bug'], needs: ['crystal_resonance'], desc: 'Do not arrive as a smoothie. Do the maths.', tier: 3, unlocks: 'Timeline Stabilizer' }),
];
export const techById = Object.fromEntries(TECHS.map((t) => [t.id, t]));

// ------------------------------------------------------------------ scan fact library
const TREE_FACTS = {
  araucaria: ['Monkey Puzzle (Araucaria)', 'Spiky, ancient and very much still around in 1987. Sauropods ate these like celery.'],
  treefern: ['Tree Fern', 'A fern that decided to become a tree. Ambitious.'],
  cycad: ['Cycad', 'Looks like a palm, is not a palm. Its cones are toxic raw. Roast them.'],
  ginkgo: ['Ginkgo', 'A living fossil. Its nuts smell like old socks but roast up nicely.'],
  redwood: ['Dawn Redwood', 'Tall, proud, and drops a LOT of needles.'],
  giant: ['Giant Jungle Tree', 'Older than the van, the radio and Kev combined.'],
  palm: ['Early Palm', 'Hairy fruit, refreshing inside. Coconut ancestor, probably.'],
  horsetail: ['Giant Horsetail', 'Basically a 3 m tall asparagus. Do not eat.'],
  conifer: ['Mountain Conifer', 'Smells like a car air freshener. Nature\'s original.'],
  cypress: ['Swamp Cypress', 'Loves wet feet. Its knees poke out of the water.'],
  dead: ['Dead Tree', 'Deceased. Good firewood though.'],
};
const NODE_FACTS = {
  dung: ['zoo', 'Critter Dung', 'Fresh-ish. Rich in methane. Could power a van, honestly. Also great for crops.', 'dung'],
  boulder: ['geo', 'Granite boulder', 'A rock. You scanned a rock. The scanner is unimpressed.'],
  boulder_big: ['geo', 'Glacial erratic', 'A very big rock, dropped here by something very big.'],
  rock_small: ['geo', 'River stones', 'Smooth, throwable, emotionally supportive.'],
  flint: ['geo', 'Flint nodule', 'Sharp when broken. Sparks when struck. Cavemen\'s favourite.'],
  fiber: ['bio', 'Fiber grass', 'Grass existed with the critters! Barely. It was the new thing.'],
  fern: ['bio', 'Ground fern', 'Herbivores love fiddleheads. You can grow them too.'],
  bush_red: ['bio', 'Redberry bush', 'Tart berries most critters happily eat.'],
  bush_blue: ['bio', 'Blueberry bush', 'Sweet and staining. Hornpipes go nuts for these.'],
  bush_sun: ['bio', 'Sunberry bush', 'Tingly little berries. Gives you a burst of energy.'],
  bush_snooze: ['bio', 'Snoozeberry bush', 'A powerful natural sedative. Keeps knocked-out critters asleep. Key ingredient for tranquilizers!', 'snoozeberry'],
  herb: ['bio', 'Healing herb', 'Bitter leaves full of anti-inflammatory compounds.'],
  mushrooms: ['bio', 'Mushroom cluster', 'The brown ones are fine. The red ones are a journey.'],
  scrap: [null, 'Van debris', 'That is part of your van. You should feel bad.'],
  crate: [null, 'Supply box', 'Kev packed this. It contains mostly noodles.'],
  ore_iron: ['geo', 'Meteorite chunk', 'Iron-nickel from space! Smelt it in a forge for the good stuff.', 'meteorite'],
  ore_copper: ['geo', 'Copper vein', 'Great conductor. Electrics research starts here.', 'copper'],
  sulfur: ['geo', 'Sulfur crust', 'Smells like eggs. Useful for batteries and boom.'],
  obsidian: ['geo', 'Obsidian', 'Volcanic glass. Sharper than a scalpel.'],
  crystal: ['geo', 'Chrono crystals', 'They resonate at 66,000,000 Hz. They are the reason you are here.', 'crystal'],
  clay: ['geo', 'Clay bank', 'Fine sediment. Fire it in a kiln for bricks and pots.', 'clay'],
  fossil: ['paleo', 'Fossil-bearing rock', 'Bones of things that were already ancient to the critters.'],
  tar: ['geo', 'Tar seep', 'Sticky natural asphalt. Waterproofs everything. Traps critters.'],
  salt: ['geo', 'Salt crust', 'Evaporated sea. Preserves meat, seasons regrets.'],
  driftwood: ['bio', 'Driftwood', 'A tree that went on an adventure.'],
  hive: ['bio', 'Wild beehive', 'Prehistoric bees. They are not happy to be scanned.'],
  sand: ['geo', 'Sand', 'Melts into glass in a kiln. Gets everywhere else.'],
};

export class Research {
  constructor(game) {
    this.name = 'research';
    this.g = game;
    this.rp = { bio: 0, geo: 0, zoo: 0, paleo: 0 };
    this.done = new Set();
    this.insights = new Set();
    this.scanned = new Map(); // key -> { title, fact, cat, n }
    this.analysed = new Map();
    this.dex = new Map(); // species -> info
    this.scanJob = null;
    game.research = this;
  }
  has(id) { return !id || this.done.has(id); }
  techName(id) { return techById[id]?.name ?? id; }
  hintFor(id) { const t = techById[id]; if (!t) return null; return `Research "${t.name}" on the van computer (R&D).`; }
  missing(t) {
    const m = [];
    for (const [c, n] of Object.entries(t.cost)) if (this.rp[c] < n) m.push(`${n - Math.floor(this.rp[c])} more ${CATS[c].name}`);
    for (const n of t.needs) if (!this.done.has(n)) m.push(`tech: ${this.techName(n)}`);
    for (const i of t.insight) if (!this.insights.has(i)) m.push(INSIGHTS[i]);
    return m;
  }
  canResearch(t) { return !this.done.has(t.id) && !this.missing(t).length; }
  research(id) {
    const t = techById[id];
    if (!t || !this.canResearch(t)) return false;
    this.g.act('research', { id });
    return true;
  }
  applyResearch(id, by) {
    const t = techById[id];
    if (!t || this.done.has(id)) return;
    for (const [c, n] of Object.entries(t.cost)) this.rp[c] = Math.max(0, this.rp[c] - n);
    this.done.add(id);
    const g = this.g;
    g.ui?.banner('EUREKA!', t.name, 'Unlocked: ' + t.unlocks);
    g.audio?.jingle?.('tame');
    g.events.emit('researched', { id, t, by });
    g.net?.broadcast?.('researchState', this.netState());
  }
  addRP(cat, n, why) {
    if (!cat || n <= 0) return;
    this.rp[cat] += n;
    this.g.ui?.toast(`+${n} ${CATS[cat].name} data${why ? ' · ' + why : ''}`, '', 'star', 2200);
    this.g.events.emit('rp', { cat, n });
    this.checkAvailable();
  }
  addInsight(id) {
    if (!id || this.insights.has(id)) return;
    this.insights.add(id);
    this.g.ui?.toast(`Insight: ${INSIGHTS[id] ?? id} ✓`, '', 'star', 3000);
    this.g.events.emit('insight', { id });
    this.checkAvailable();
  }
  checkAvailable() {
    // tell the player when a new tech became researchable
    const avail = TECHS.filter((t) => this.canResearch(t)).map((t) => t.id);
    for (const id of avail) if (!this._told?.has(id)) { (this._told = this._told || new Set()).add(id); this.g.ui?.toast(`New research available: ${this.techName(id)} (van computer)`, '', 'van', 4200); }
  }

  // ---------------------------------------------------------------- scanning
  describe(tgt) {
    // -> { key, title, fact, cat, rp, insight }
    const g = this.g;
    if (!tgt) return null;
    switch (tgt.kind) {
      case 'tree': { const k = tgt.tree.key; const f = TREE_FACTS[k] ?? [SPECIES[k]?.name ?? k, 'A tree.']; return { key: 'tree:' + k, title: f[0], fact: f[1], cat: 'bio', rp: 2 }; }
      case 'node': { const id = tgt.node.type ?? tgt.node.def?.id; const f = NODE_FACTS[id] ?? ['geo', tgt.node.def?.name ?? 'Thing', 'Interesting.']; return { key: 'node:' + id, title: f[1], fact: f[2], cat: f[0], rp: f[0] ? (id === 'crystal' || id === 'ore_iron' ? 4 : 2) : 0, insight: f[3] }; }
      case 'dino': { const d = tgt.dino, sp = d.sp; const info = g.dinos?.scanInfo?.(d) ?? { fact: sp.blurb ?? '', insight: null }; return { key: 'dino:' + sp.id, title: sp.name, fact: info.fact, cat: 'zoo', rp: sp.rp ?? 4, insight: info.insight, dino: d }; }
      case 'track': return { key: 'track:' + tgt.species, title: tgt.label ?? 'Footprints', fact: tgt.fact ?? 'Fresh tracks. Something big walked here.', cat: 'paleo', rp: 2, trail: tgt.trail };
      case 'nest': return { key: 'nest:' + tgt.species, title: tgt.label, fact: tgt.fact ?? 'A nest! The parents are probably nearby. Probably watching. Probably hungry.', cat: 'paleo', rp: 3 };
      case 'dung': return { key: 'dung:' + (tgt.species ?? 'x'), title: 'Critter Dung', fact: 'Fresh. Rich in methane. Could power a van, honestly.', cat: 'zoo', rp: 2, insight: 'dung' };
      case 'water': return { key: 'water', title: 'Water', fact: 'H2O, 3% tadpole. Boil before drinking.', cat: 'bio', rp: 1 };
      case 'van': return { key: 'van', title: 'The Chrono-Van', fact: 'A 1979 camper van containing one (1) time machine, three (3) CRTs and a disturbing amount of tinfoil.', cat: null, rp: 0 };
      case 'struct': return { key: 'struct:' + tgt.s.type, title: tgt.label, fact: 'You built this. We are proud of you.', cat: null, rp: 0 };
      case 'player': return { key: 'player', title: 'Homo idioticus', fact: 'Threat level: mostly to self. Diet: noodles.', cat: null, rp: 0 };
      default: return tgt.scan ? tgt.scan() : null;
    }
  }
  startScan(tgt) {
    const g = this.g;
    if (this.scanJob) return;
    const d = this.describe(tgt);
    if (!d) { g.ui?.toast('Nothing to scan there.', 'warn'); return; }
    const slot = g.inventory.selected;
    if (!g.inventory.useCharge(slot, 2)) { g.ui?.toast('Scanner battery is dead! Charge it at the van\'s CHARGE-O-TRON.', 'warn', 'scanner'); g.audio?.play('error'); return; }
    const p = g.local;
    const point = g.interaction.aimPoint(tgt.dist);
    this.scanJob = { d, t: 0, dur: d.key === this.lastKey ? 0.6 : 1.4, point, tgt };
    p.startAction('scan', this.scanJob.dur, null, 2, { faceCam: true, slow: 0.3 });
    g.audio?.play('scan', { pos: point, vol: 0.7 });
  }
  updateScan(dt) {
    const J = this.scanJob, g = this.g;
    if (!J) return;
    J.t += dt;
    // beam sparkles from the scanner to the target
    const from = g.local.headPos(new THREE.Vector3()).add(new THREE.Vector3(-Math.sin(g.local.yaw) * 0.35, -0.3, -Math.cos(g.local.yaw) * 0.35));
    for (let k = 0; k < 2; k++) { const t = Math.random(); g.fx.sprite('glow', from.x + (J.point.x - from.x) * t, from.y + (J.point.y - from.y) * t, from.z + (J.point.z - from.z) * t, { color: 0x60ffb0, size: 0.08, life: 0.18, alpha: 0.8 }); }
    if (Math.random() < 0.3) g.fx.sprite('ring', J.point.x, J.point.y, J.point.z, { color: 0x60ffb0, size: 0.25 + Math.random() * 0.2, life: 0.35, alpha: 0.6, grow: 1.5 });
    if (J.t >= J.dur) { this.scanJob = null; this.finishScan(J); }
  }
  finishScan(J) {
    const g = this.g, d = J.d;
    this.lastKey = d.key;
    g.audio?.play('scan_done', { vol: 0.6 });
    const prev = this.scanned.get(d.key);
    const first = !prev;
    this.scanned.set(d.key, { title: d.title, fact: d.fact, cat: d.cat, n: (prev?.n ?? 0) + 1 });
    if (first && d.rp) this.addRP(d.cat, d.rp, 'new scan');
    if (d.insight) this.addInsight(d.insight);
    if (d.dino) { this.dex.set(d.dino.sp.id, { name: d.dino.sp.name, fact: d.fact, sp: d.dino.sp }); if (d.dino.sp.predator) this.addInsight('predator'); if (['rex', 'ptera', 'brachio'].includes(d.dino.sp.id)) this.addInsight(d.dino.sp.id); }
    g.ui?.scanCard?.(d, first);
    if (!g.ui?.scanCard) g.ui?.toast(`${d.title}: ${d.fact}`, '', 'scanner', 6000);
    g.events.emit('scanned', { key: d.key, first, d });
    g.journal?.addEntry?.({ id: 'scan:' + d.key, kind: d.cat ? CATS[d.cat].name + ' SCAN' : 'SCAN', title: d.title, html: `<p>${d.fact}</p>` });
  }
  // analysing specimens (called by the CHRONO-OS mini-games when finished)
  analyse(itemId, quality = 1) {
    const g = this.g;
    const R = {
      plant_sample: ['bio', 4, 'herb', 'Chlorophyll levels: excessive. Photosynthesis: aggressive.'],
      herb: ['bio', 3, 'herb', 'Contains salicin, a natural painkiller. Grandma was right.'],
      fossil: ['paleo', 5, 'fossil', 'Trilobite. It was already a fossil when the critters showed up.'],
      amber: ['paleo', 4, 'amber', 'Fossilised resin with perfectly preserved... air bubbles. Temporal signatures detected!'],
      amber_bug: ['paleo', 8, 'amber_bug', 'Mosquito with critter blood inside. Life, uh... finds a way. Timeline data extracted!'],
      eggshell: ['paleo', 4, 'eggshell', 'Calcite structure suggests the parents were EXTREMELY protective.'],
      coprolite: ['zoo', 4, 'dung', 'Fossilised dung. Diet: ferns, regret. Methane potential: enormous.'],
      dna: ['zoo', 5, null, 'Genome sequenced. 98% critter, 2% cotton bud.'],
      mineral: ['geo', 4, null, 'Quartz with chrono-resonant inclusions. Ooooh.'],
      crystal: ['geo', 6, 'crystal', 'It hums when you are not looking at it. Definitely temporal.'],
      dung: ['zoo', 2, 'dung', 'Fresh critter dung. The lab now smells like a swamp.'],
    }[itemId];
    if (!R) return null;
    const [cat, rp, insight, fact] = R;
    const first = !this.analysed.has(itemId);
    this.analysed.set(itemId, (this.analysed.get(itemId) ?? 0) + 1);
    const gain = Math.max(1, Math.round(rp * quality * (first ? 1.5 : 1) * (g.van?.s.upgrades.microscope ? 1.5 : 1)));
    this.addRP(cat, gain, 'analysis');
    if (insight) this.addInsight(insight);
    g.events.emit('analysed', { id: itemId, first });
    g.journal?.addEntry?.({ id: 'lab:' + itemId, kind: 'LAB REPORT', title: ITEMS[itemId]?.name ?? itemId, html: `<p>${fact}</p>` });
    return { cat, gain, fact, insight };
  }
  update(dt) {
    this.updateScan(dt);
    // weather insight
    if (!this.insights.has('storm') && this.g.weather.cur.storm > 0.6 && !this.g.isCameraSheltered()) this.addInsight('storm');
  }
  netState() { return { rp: this.rp, done: [...this.done], insights: [...this.insights] }; }
  applyNet(d) { this.rp = d.rp; this.done = new Set(d.done); this.insights = new Set(d.insights); }
  serialize() { return { ...this.netState(), scanned: [...this.scanned], analysed: [...this.analysed], dex: [...this.dex].map(([k, v]) => [k, { name: v.name, fact: v.fact }]) }; }
  load(d) { if (!d) return; this.applyNet(d); this.scanned = new Map(d.scanned ?? []); this.analysed = new Map(d.analysed ?? []); this.dex = new Map(d.dex ?? []); this._told = new Set(TECHS.filter((t) => this.canResearch(t)).map((t) => t.id)); }
}

export async function install(g) {
  const R = new Research(g);
  g.addSystem(R);
  g.actionHandlers.research = ({ id, by }) => R.applyResearch(id, by);
  g.netHandlers.researchState = (d) => R.applyNet(d);
  g.saveables.research = { save: () => R.serialize(), load: (d) => R.load(d) };
  g.heldHandlers.scanner = (held, hdef, tgt) => { if (g.input.pressed('use')) R.startScan(tgt); return true; };
  // picking up seeds / taming feed insights
  g.events.on('loot', ({ id }) => { if (ITEMS[id]?.crop || id?.startsWith?.('seed_')) R.addInsight('seeds'); });
  g.events.on('tamed', () => R.addInsight('tamed'));
  g.events.on('discover', (p) => { const cat = { waterfall: 'geo', crater: 'geo', tarpits: 'geo', fallcave: 'paleo', crystalcave: 'geo', nest: 'zoo', volcano: 'geo' }[p.id] ?? 'bio'; R.addRP(cat, 2, p.name); });
  return R;
}
