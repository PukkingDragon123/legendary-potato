// Journal: the story chapters + objectives shown on the sticky note, the
// achievement toasts that land every 20-30 minutes, and the log of notes,
// scans and lab reports shown in the CHRONO-PAL LOG tab.
import { ITEMS } from '../data/items.js';

// objective checks receive (g, J) and return true/false or [have, need]
const inv = (id, n = 1) => (g) => [Math.min(n, g.inventory.count(id)), n];
const ev = (name, n = 1) => (g, J) => [Math.min(n, J.counts[name] ?? 0), n];
const built = (type) => (g) => !!g.structures && g.structures.all(type).length > 0;
const tech = (id) => (g) => !!g.research?.has(id) && g.research.done.has(id);

export const CHAPTERS = [
  {
    id: 'crash', title: 'Crash Landing', blurb: 'The van works. Sort of. Time to get the lights on.',
    goals: [
      { id: 'door', text: 'Get inside the van', check: ev('vanDoor') },
      { id: 'glove', text: 'Get the scanner out of the glovebox', check: (g) => g.van?.s.glove === 'empty' },
      { id: 'scrap', text: 'Salvage van debris', check: ev('debris', 3) },
      { id: 'dynamo', text: 'Build + bolt on the Hand-Crank Dynamo', check: (g) => !!g.van?.s.repaired.dynamo },
      { id: 'crank', text: 'Crank the battery to 25%', check: (g) => !!g.van && g.van.pct() >= 25 || !!g.van?.s.firstBoot },
      { id: 'boot', text: 'Switch on the COMPUTER breaker', check: (g) => !!g.van?.s.firstBoot },
    ],
    reward: { title: 'IT\'S ALIVE!', text: 'The Chrono-Van has power again.' },
  },
  {
    id: 'stone', title: 'Stone Age Starter Pack', blurb: 'Tools, fire, food and a place to sleep.',
    goals: [
      { id: 'hatchet', text: 'Craft a Stone Hatchet', check: (g, J) => J.crafted.has('stone_hatchet') },
      { id: 'pick', text: 'Craft a Stone Pickaxe', check: (g, J) => J.crafted.has('stone_pick') },
      { id: 'logs', text: 'Chop down trees for logs', check: ev('treeFelled', 2) },
      { id: 'fire', text: 'Build a Campfire', check: built('campfire') },
      { id: 'cook', text: 'Cook something on the fire', check: ev('cooked') },
      { id: 'scan', text: 'Scan 5 different things', check: (g) => [Math.min(5, g.research?.scanned.size ?? 0), 5] },
    ],
    reward: { title: 'FIRE BAD? FIRE GOOD.', text: 'You have mastered the hardest part of the stone age.' },
  },
  {
    id: 'home', title: 'Home Sweet Hut', blurb: 'Survive your first night and build a real shelter.',
    goals: [
      { id: 'bed', text: 'Craft a Bedroll and place it', check: (g) => built('bedroll')(g) || built('bed')(g) || built('hammock')(g) },
      { id: 'night', text: 'Sleep through the night', check: ev('nightSkipped') },
      { id: 'bench', text: 'Build a Workbench', check: built('workbench') },
      { id: 'hammer', text: 'Craft a Builder\'s Hammer (B to build)', check: (g, J) => J.crafted.has('hammer') },
      { id: 'hut', text: 'Build a hut: foundation, walls and a roof', check: (g) => { const b = g.building; if (!b) return false; let f = 0, w = 0, r = 0; for (const p of b.pieces.values()) { if (p.kind === 'foundation') f++; else if (['wall', 'window', 'doorway'].includes(p.kind)) w++; else if (p.kind === 'roof') r++; } return [Math.min(1, f) + Math.min(3, w) + Math.min(1, r), 5]; } },
      { id: 'crate', text: 'Build a Storage Crate', check: built('storage_box') },
    ],
    reward: { title: 'LANDLORD', text: 'First prehistoric property. No neighbours. Yet.' },
  },
  {
    id: 'science', title: 'Science, Mostly', blurb: 'Use the van computer to understand this place.',
    goals: [
      { id: 'rd1', text: 'Research Dino Psychology 101', check: tech('tame_basics') },
      { id: 'rd3', text: 'Research 4 technologies', check: (g) => [Math.min(4, g.research?.done.size ?? 0), 4] },
      { id: 'analyse', text: 'Analyse a specimen at the van', check: ev('analysed') },
      { id: 'dex', text: 'Scan 3 dinosaur species', check: (g) => [Math.min(3, g.research?.dex.size ?? 0), 3] },
    ],
    reward: { title: 'CERTIFIED NERD', text: 'Dr. Wanda is almost proud.' },
  },
  {
    id: 'tame', title: 'Dino Whisperer', blurb: 'Make a friend. A big, scaly friend.',
    goals: [
      { id: 'tame1', text: 'Tame your first dinosaur', check: ev('tamed') },
      { id: 'trough', text: 'Build a Feeding Trough', check: built('feed_trough') },
      { id: 'job', text: 'Give a tamed dino a job', check: ev('dinoJob') },
      { id: 'pen', text: 'Build fences for a dino pen', check: (g) => { let n = 0; for (const p of g.building?.pieces.values() ?? []) if (p.kind === 'fence' || p.kind === 'gate') n++; return [Math.min(6, n), 6]; } },
    ],
    reward: { title: 'GOOD BOY', text: 'Or girl. Or "it". Dino sexing is hard.' },
  },
  {
    id: 'metal', title: 'Space Metal', blurb: 'There is iron in the meteor crater. Smelt it.',
    goals: [
      { id: 'kiln', text: 'Build a Clay Kiln', check: built('kiln') },
      { id: 'iron', text: 'Mine Meteoric Iron in the crater', check: ev('gotIron') },
      { id: 'forge', text: 'Build a Forge', check: built('forge') },
      { id: 'ingot', text: 'Smelt Iron Ingots', check: (g, J) => J.crafted.has('ingot_iron') },
      { id: 'mtool', text: 'Craft a metal tool', check: (g, J) => J.crafted.has('metal_hatchet') || J.crafted.has('metal_pick') },
    ],
    reward: { title: 'IRON AGE (EARLY ACCESS)', text: 'You skipped about 65,997,000 years of progress.' },
  },
  {
    id: 'wheels', title: 'Get The Van Rolling', blurb: 'Repair the van and teach it to love dino poo.',
    goals: [
      { id: 'mech', text: 'Research Van Mechanics', check: tech('mechanics') },
      { id: 'tire', text: 'Swap the flat tire', check: (g) => !!g.van?.s.repaired.tire },
      { id: 'axle', text: 'Fix the bent axle', check: (g) => !!g.van?.s.repaired.axle },
      { id: 'engine', text: 'Rebuild the engine', check: (g) => !!g.van?.s.repaired.engine },
      { id: 'wire', text: 'Rewire the fried loom', check: (g) => !!g.van?.s.repaired.wiring },
      { id: 'fuel', text: 'Fuel up with Dung-o-Diesel', check: (g) => (g.van?.s.fuel ?? 0) > 0 || (g.van?.s.odo ?? 0) > 50 },
      { id: 'drive', text: 'Drive the van 500 m', check: (g) => [Math.min(500, Math.floor(g.van?.s.odo ?? 0)), 500] },
    ],
    reward: { title: 'ROAD TRIP', text: 'The first car on Earth. You are 66 million years early for traffic.' },
  },
  {
    id: 'power', title: 'Power Up', blurb: 'Electricity, comfort, and crazy van inventions.',
    goals: [
      { id: 'elec', text: 'Research Electrical Engineering', check: tech('electrics') },
      { id: 'crt', text: 'Fix the side monitors', check: (g) => !!g.van?.s.repaired.crt },
      { id: 'gen', text: 'Build a power source (solar / generator)', check: (g) => built('solar_panel')(g) || built('generator')(g) || !!g.van?.s.upgrades.solar || !!g.van?.s.upgrades.generator },
      { id: 'ups', text: 'Install 3 van upgrades', check: (g) => [Math.min(3, Object.keys(g.van?.s.upgrades ?? {}).length), 3] },
    ],
    reward: { title: 'MAD SCIENTIST', text: 'The van now has more features than a 1987 Cadillac.' },
  },
  {
    id: 'chrono', title: 'The Time Machine', blurb: 'Five parts stand between you and 1987.',
    goals: [
      { id: 'tt', text: 'Research Temporal Theory', check: tech('temporal_theory') },
      { id: 'chip', text: 'Find the Navigation Chip', check: (g) => !!g.van?.s.sockets.nav_chip || g.inventory.count('nav_chip') > 0 },
      { id: 'coil', text: 'Install the Temporal Coil', check: (g) => !!g.van?.s.sockets.temporal_coil },
      { id: 'flux', text: 'Install the Flux Crystal Matrix', check: (g) => !!g.van?.s.sockets.flux_crystal },
      { id: 'stab', text: 'Install the Timeline Stabilizer', check: (g) => !!g.van?.s.sockets.stabilizer },
      { id: 'core', text: 'Install a Charged Power Core', check: (g) => !!g.van?.s.sockets.power_core },
    ],
    reward: { title: 'TIME LORDS (PROBATIONARY)', text: 'The CHRONO-DRIVE is complete.' },
  },
  {
    id: 'home2', title: 'Going Home?', blurb: 'Full battery. CHRONO on. Everyone inside. Pull the lever.',
    goals: [
      { id: 'charge', text: 'Charge the battery to 100%', check: (g) => (g.van?.pct() ?? 0) >= 99 },
      { id: 'chronoon', text: 'Switch on the CHRONO breaker', check: (g) => !!g.van?.s.sw[3] },
      { id: 'lever', text: 'Pull the ENGAGE lever', check: ev('timeJump') },
    ],
    reward: { title: 'BACK TO THE... PAST?', text: 'You did it. Probably.' },
  },
];
const ACH = [
  ['firstTree', 'TIMBER!', 'Felled your first tree.', (J) => (J.counts.treeFelled ?? 0) >= 1],
  ['bonk', 'NOT LIKE THIS', 'Got hit by your own falling tree.', (J) => (J.counts.treeBonk ?? 0) >= 1],
  ['scan20', 'SCANNER ENTHUSIAST', 'Scanned 20 different things.', (J, g) => (g.research?.scanned.size ?? 0) >= 20],
  ['dex8', 'PALAEONTOLOGIST', 'Scanned 8 dinosaur species.', (J, g) => (g.research?.dex.size ?? 0) >= 8],
  ['tame3', 'ZOOKEEPER', 'Tamed 3 dinosaurs.', (J) => (J.counts.tamed ?? 0) >= 3],
  ['storey', 'UPSTAIRS NEIGHBOUR', 'Built a two-storey building.', (J, g) => [...(g.building?.pieces.values() ?? [])].some((p) => p.k >= 1 && p.kind === 'floor')],
  ['km', 'ROAD WARRIOR', 'Drove the van 2 km.', (J, g) => (g.van?.s.odo ?? 0) >= 2000],
  ['radio', 'DJ DINO', 'Listened to every radio station.', (J) => (J.counts.radioStations ?? 0) >= 3],
  ['snake', 'SNAKE-O-SAURUS PRO', 'Scored 15 in Snake-o-saurus.', (J) => (J.counts.snakeBest ?? 0) >= 15],
  ['coffee', 'CAFFEINATED', 'Brewed coffee 66 million years before coffee.', (J) => (J.counts.coffee ?? 0) >= 1],
  ['nights5', 'SURVIVOR', 'Survived 5 nights.', (J) => (J.counts.nightSkipped ?? 0) >= 5],
  ['egg', 'PROUD PARENT', 'Hatched a dino egg.', (J) => (J.counts.eggHatched ?? 0) >= 1],
];

export class Journal {
  constructor(game) {
    this.name = 'journal';
    this.g = game;
    this.chapter = 0;
    this.done = new Set(); // goal ids "chapter:goal"
    this.counts = {};
    this.crafted = new Set();
    this.ach = new Set();
    this.log = [];
    this.t = 0;
    game.journal = this;
    this.hook();
  }
  hook() {
    const g = this.g, E = g.events;
    const inc = (k, n = 1) => { this.counts[k] = (this.counts[k] ?? 0) + n; this.dirty = true; };
    E.on('vanDoor', ({ open }) => { if (open) inc('vanDoor'); });
    E.on('nodeDepleted', ({ node, by }) => { if (by === g.local.id && node.def?.model === 'debris') inc('debris'); });
    E.on('loot', ({ id, from, n }) => { if (from === 'Van Debris') inc('debris', 0); if (id === 'iron' && n > 0) inc('gotIron'); });
    E.on('crafted', ({ id }) => { this.crafted.add(id); const r = g.crafting?.job?.r; void r; if (['meat_cooked', 'steak', 'fish_cooked', 'egg_cooked', 'ginkgo_roast', 'cycad_roast', 'kebab', 'water_clean', 'stew', 'jerky'].includes(id)) inc('cooked'); this.dirty = true; });
    E.on('treeFelled', ({ by }) => { if (by === g.local.id) inc('treeFelled'); });
    E.on('nightSkipped', () => inc('nightSkipped'));
    E.on('tamed', () => inc('tamed'));
    E.on('dinoJob', () => inc('dinoJob'));
    E.on('analysed', () => inc('analysed'));
    E.on('timeJump', () => inc('timeJump'));
    E.on('eggHatched', () => inc('eggHatched'));
    E.on('vanCoffee', () => inc('coffee'));
    E.on('snake', ({ score }) => { this.counts.snakeBest = Math.max(this.counts.snakeBest ?? 0, score); this.dirty = true; });
    E.on('vanSwitch', ({ i, on }) => { if (i === 1 && on && g.van && g.van.s.charge > 0 && !g.van.s.firstBoot) { g.van.s.firstBoot = true; this.dirty = true; } });
    E.on('note', (n) => this.addEntry({ id: 'note:' + n.id, kind: 'NOTE', title: n.title, html: `<p>${n.text}</p>` }));
    E.on('discover', (p) => this.addEntry({ id: 'poi:' + p.id, kind: 'PLACE', title: p.name, html: `<p>Discovered on day ${g.time.day}.</p><p>${p.blurb ?? ''}</p>` }));
    E.on('researched', ({ t }) => this.addEntry({ id: 'tech:' + t.id, kind: 'RESEARCH', title: t.name, html: `<p>${t.desc}</p><p><b>Unlocked:</b> ${t.unlocks}</p>` }));
    E.on('started', () => { this.dirty = true; this.showChapter(true); });
    E.on('treeLanded', ({ tree }) => { const lp = g.local.pos; if (Math.hypot(lp.x - tree.x, lp.z - tree.z) < tree.height && g.vitals?.hp < 100) void 0; });
    E.on('damage', (d) => { if (d?.kind === 'tree') inc('treeBonk'); });
    let radioSeen = new Set();
    E.on('radioTune', ({ st }) => { if (st >= 0 && !radioSeen.has(st)) { radioSeen.add(st); inc('radioStations'); } });
    void radioSeen;
  }
  addEntry(e) {
    if (this.log.find((x) => x.id === e.id)) return;
    this.log.unshift({ ...e, day: this.g.time.day });
    if (this.log.length > 200) this.log.pop();
  }
  entries() {
    const ch = CHAPTERS[this.chapter];
    const cur = ch ? [{ id: 'chapter', kind: 'CURRENT CHAPTER', title: `Ch. ${this.chapter + 1}: ${ch.title}`, html: `<p>${ch.blurb}</p><ul>${ch.goals.map((gl) => `<li>${this.goalDone(ch, gl) ? '✓' : '○'} ${gl.text}</li>`).join('')}</ul>` }] : [];
    return [...cur, ...this.log];
  }
  goalDone(ch, gl) { return this.done.has(ch.id + ':' + gl.id); }
  evalGoal(gl) {
    let r = false;
    try { r = gl.check(this.g, this); } catch { r = false; }
    if (Array.isArray(r)) return { done: r[0] >= r[1], count: `${r[0]}/${r[1]}` };
    return { done: !!r };
  }
  showChapter(force = false) {
    const ch = CHAPTERS[this.chapter];
    if (!ch) { this.g.ui?.setObjective({ chapter: 'THE END?', title: 'Free play', items: [{ text: 'Keep exploring, taming and building!', done: false }] }); return; }
    const items = ch.goals.map((gl) => { const e = this.evalGoal(gl); const done = this.goalDone(ch, gl) || e.done; return { text: gl.text, done, count: done ? null : e.count }; });
    const key = JSON.stringify(items);
    if (!force && key === this._last) return;
    this._last = key;
    this.g.ui?.setObjective({ chapter: `CHAPTER ${this.chapter + 1}`, title: ch.title, items });
  }
  update(dt) {
    const g = this.g;
    this.t -= dt;
    if (this.t > 0 && !this.dirty) return;
    this.t = 0.75; this.dirty = false;
    if (g.titleMode) return;
    const ch = CHAPTERS[this.chapter];
    if (ch) {
      let all = true;
      for (const gl of ch.goals) {
        const key = ch.id + ':' + gl.id;
        if (this.done.has(key)) continue;
        if (this.evalGoal(gl).done) { this.done.add(key); g.audio?.play('craft_done', { vol: 0.45 }); g.ui?.toast('✓ ' + gl.text, '', 'star', 2500); }
        else all = false;
      }
      if (all) this.completeChapter(ch);
      else this.showChapter();
    }
    for (const [id, title, text, fn] of ACH) {
      if (this.ach.has(id)) continue;
      let ok = false; try { ok = fn(this, g); } catch { ok = false; }
      if (ok) { this.ach.add(id); g.ui?.toast(`ACHIEVEMENT: ${title} — ${text}`, '', 'star', 5000); g.audio?.jingle?.('discover'); this.addEntry({ id: 'ach:' + id, kind: 'ACHIEVEMENT', title, html: `<p>${text}</p>` }); }
    }
  }
  completeChapter(ch) {
    const g = this.g;
    this.addEntry({ id: 'chapter:' + ch.id, kind: 'CHAPTER COMPLETE', title: ch.reward.title, html: `<p>${ch.reward.text}</p>` });
    g.ui?.banner('CHAPTER COMPLETE', ch.reward.title, ch.reward.text);
    g.audio?.jingle?.('tame');
    g.events.emit('chapterDone', { id: ch.id, n: this.chapter + 1 });
    this.chapter++;
    // a little data bonus to keep the research loop moving
    g.research?.addRP?.(['bio', 'geo', 'zoo', 'paleo'][this.chapter % 4], 3, 'chapter bonus');
    setTimeout(() => this.showChapter(true), 4500);
  }
  serialize() { return { chapter: this.chapter, done: [...this.done], counts: this.counts, crafted: [...this.crafted], ach: [...this.ach], log: this.log.slice(0, 120) }; }
  load(d) { if (!d) return; this.chapter = d.chapter ?? 0; this.done = new Set(d.done ?? []); this.counts = d.counts ?? {}; this.crafted = new Set(d.crafted ?? []); this.ach = new Set(d.ach ?? []); this.log = d.log ?? []; this.showChapter(true); }
}

export async function install(g) {
  const J = new Journal(g);
  g.addSystem(J);
  g.saveables.journal = { save: () => J.serialize(), load: (d) => J.load(d) };
  void ITEMS;
  return J;
}
