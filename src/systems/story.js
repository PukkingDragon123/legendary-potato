// Story beats: the Navigation Chip that flew out during the crash (hidden in
// the cave behind Thunder Falls, beeping), lore notes left around the island,
// and the time-jump ending with an epilogue card.
import * as THREE from 'three';

const NOTES = [
  { id: 'kev1', poi: 'camp', title: 'Kev\'s Soggy Notebook', text: 'Day ?? - Found an old camp. Someone was here before us?? The fire pit is ancient. There are footprints that are definitely not critter. Definitely not ours either. Spooky. Anyway I found a granola bar.' },
  { id: 'wanda1', poi: 'skeleton', title: 'Dr. Wanda\'s Field Notes', text: 'These bones are enormous. Femur alone is taller than Doug. Note to self: whatever this was, it was not the biggest thing here. The biggest thing here is still alive.' },
  { id: 'doug1', poi: 'tarpits', title: 'Doug\'s Diary', text: 'Dear diary. I lost a shoe in the tar. Then a stick. Then the stick I used to get the stick. There are bones in there. Ancient, shiny, tar-dipped bones. Good fuel apparently? Kev says the van could run on this. Kev says a lot of things.' },
  { id: 'pip1', poi: 'crystalcave', title: 'Pip\'s Doodle', text: 'The crystals hum. When I hum back they hum LOUDER. Wanda says that means "temporal resonance". I think it means they like me. (drawing of a crystal with a smiley face)' },
  { id: 'mystery', poi: 'deadtree', title: 'Carved Into The Tree', text: '"D + K + P + W WERE HERE - 1987". The carving looks really, really old. We have not carved anything yet.' },
];

export class Story {
  constructor(game) {
    this.name = 'story';
    this.g = game;
    this.items = [];
    this.found = new Set();
    this.chipTaken = false;
    this.beepT = 0;
    this.build();
  }
  build() {
    const g = this.g;
    const cave = g.world.pois.find((p) => p.id === 'fallcave');
    if (cave) {
      const y = (cave.floorY ?? g.sampler.heightAt(cave.x, cave.z)) + 0.15; // on the grotto floor when there is one
      const grp = new THREE.Group(); grp.position.set(cave.x, y, cave.z);
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.03, 0.16), new THREE.MeshStandardMaterial({ color: 0x1a6a50, emissive: 0x30c090, emissiveIntensity: 0.5, roughness: 0.4 }));
      board.rotation.set(0.2, 0.6, 0.15); grp.add(board);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshStandardMaterial({ color: 0x400808, emissive: 0xff3030, emissiveIntensity: 2 }));
      led.position.set(0.06, 0.03, 0.03); grp.add(led);
      g.engine.scene.add(grp);
      this.chip = { grp, led, pos: new THREE.Vector3(cave.x, y, cave.z) };
      this.chipLight = g.lightPool?.add({ pos: new THREE.Vector3(cave.x, y + 0.4, cave.z), color: 0x40ffb0, intensity: 1.4, range: 5, flicker: 0.2, on: true, priority: 0.6 });
    }
    for (const n of NOTES) {
      const p = g.world.pois.find((x) => x.id === n.poi);
      if (!p) continue;
      const a = (n.id.length * 1.7) % 6.28, x = p.x + Math.cos(a) * Math.min(6, p.radius * 0.3), z = p.z + Math.sin(a) * Math.min(6, p.radius * 0.3);
      const y = g.sampler.heightAt(x, z);
      const page = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.36), new THREE.MeshStandardMaterial({ color: 0xf2ecd8, roughness: 0.95, side: THREE.DoubleSide }));
      page.rotation.set(-Math.PI / 2, 0, a); page.position.set(x, y + 0.03, z);
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshStandardMaterial({ color: 0x8a8780, roughness: 0.9, flatShading: true })); rock.position.set(x + 0.08, y + 0.06, z + 0.05);
      g.engine.scene.add(page, rock);
      this.items.push({ note: n, pos: new THREE.Vector3(x, y + 0.05, z), meshes: [page, rock] });
    }
  }
  raycast(o, d, reach) {
    const g = this.g;
    const cand = [];
    if (this.chip && !this.chipTaken) cand.push({ pos: this.chip.pos, r: 0.45, t: { label: 'Navigation Chip', info: 'Beeping. Slightly singed. VERY important.', prompt: { key: g.input.keyName('interact'), text: 'Take the Navigation Chip' }, onInteract: () => this.takeChip() } });
    for (const it of this.items) if (!this.found.has(it.note.id)) cand.push({ pos: it.pos, r: 0.4, t: { label: it.note.title, prompt: { key: g.input.keyName('interact'), text: 'Read' }, onInteract: () => this.read(it) } });
    let best = null;
    for (const c of cand) {
      const tt = Math.max(0, c.pos.clone().sub(o).dot(d));
      if (tt > reach) continue;
      const cl = o.clone().addScaledVector(d, tt);
      if (cl.distanceTo(c.pos) < c.r && (!best || tt < best.dist)) best = { dist: tt, kind: 'story', ...c.t };
    }
    return best;
  }
  takeChip() {
    const g = this.g;
    if (this.chipTaken) return;
    g.local.startAction('pickup', 0.5, () => {
      this.chipTaken = true;
      this.chip.grp.visible = false;
      if (this.chipLight) this.chipLight.on = false;
      g.give('nav_chip', 1, { from: 'Cave' });
      g.ui?.banner('FOUND IT!', 'The Navigation Chip', 'Install it in the time machine');
      g.audio?.jingle?.('discover');
      g.events.emit('navChip');
      g.net?.broadcast?.('storyChip', {});
    });
  }
  read(it) {
    const g = this.g;
    this.found.add(it.note.id);
    for (const m of it.meshes) m.visible = false;
    g.events.emit('note', { id: it.note.id, title: it.note.title, text: it.note.text });
    g.ui?.toast(`Found: ${it.note.title} (in your LOG)`, '', 'star', 4000);
    g.research?.addRP?.('paleo', 2, 'lore');
    g.audio?.play('pda_open', { vol: 0.5 });
  }
  update(dt) {
    const g = this.g;
    // the chip beeps when you're near (louder with the scanner out)
    if (this.chip && !this.chipTaken) {
      this.beepT -= dt;
      const d = g.local.pos.distanceTo(this.chip.pos);
      this.chip.led.material.emissiveIntensity = Math.sin(performance.now() / 160) > 0 ? 2.5 : 0.2;
      if (this.beepT <= 0 && d < 45) { this.beepT = Math.max(0.35, d / 25); g.audio?.play('beep', { pos: this.chip.pos, vol: 0.5, ref: 4 }); }
    }
  }
  // ---------------------------------------------------------------- ending
  ending() {
    const g = this.g;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;transition:opacity 1.8s;z-index:50;pointer-events:auto;display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '1'));
    g.audio?.play('time_boom', { vol: 1.2 });
    setTimeout(() => {
      const S = this.stats();
      el.style.background = '#0d0f0c';
      el.innerHTML = `<div class="px" style="max-width:640px;padding:28px 32px;text-align:center;color:var(--ink)"><div style="font-size:14px;letter-spacing:2px">OCTOBER 26, 1987 · 1:21 AM</div><h2 style="margin:10px 0 6px;font-size:34px">BACK TO THE... PAST?</h2><p>The van lands in a supermarket parking lot in a cloud of smoke. Everyone is alive. The radio is still playing K-REX 66.6.</p><p>Then something in the back goes <b>"chirp"</b>.</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;text-align:left;margin:16px 0;font-size:15px"><div>Days survived</div><b>${S.days}</b><div>Critters tamed</div><b>${S.tamed}</b><div>Technologies</div><b>${S.tech}</b><div>Things built</div><b>${S.built}</b><div>Things scanned</div><b>${S.scans}</b><div>Van odometer</div><b>${S.km} km</b></div><button class="btn primary" id="endgo">Go back for the rest of the critters</button><div class="small" style="margin-top:8px">(the expedition continues: your world is still there)</div></div>`;
      el.style.opacity = '1';
      el.querySelector('#endgo').onclick = () => { el.style.opacity = '0'; setTimeout(() => el.remove(), 1500); g.ui?.banner('66 MILLION YEARS AGO', 'Again', 'The time machine needs a recharge'); if (g.van) { g.van.s.charge = 10; g.van.s.sw[3] = false; } g.input.lock(); };
      g.input.unlock();
      g.audio?.jingle?.('tame');
    }, 3200);
  }
  stats() {
    const g = this.g;
    return { days: g.time.day, tamed: g.journal?.counts.tamed ?? 0, tech: g.research?.done.size ?? 0, built: (g.building?.pieces.size ?? 0) + (g.structures?.list.size ?? 0), scans: g.research?.scanned.size ?? 0, km: ((g.van?.s.odo ?? 0) / 1000).toFixed(1) };
  }
  serialize() { return { chip: this.chipTaken, found: [...this.found] }; }
  load(d) {
    if (!d) return;
    this.found = new Set(d.found ?? []);
    for (const it of this.items) if (this.found.has(it.note.id)) for (const m of it.meshes) m.visible = false;
    if (d.chip) { this.chipTaken = true; if (this.chip) this.chip.grp.visible = false; if (this.chipLight) this.chipLight.on = false; }
  }
}

export async function install(g) {
  const S = new Story(g);
  g.addSystem(S);
  g.interaction.handlers.push((o, d, reach) => S.raycast(o, d, reach));
  g.saveables.story = { save: () => S.serialize(), load: (d) => S.load(d) };
  g.navChipPos = () => (S.chipTaken ? null : S.chip?.pos);
  g.netHandlers.storyChip = () => { S.chipTaken = true; if (S.chip) S.chip.grp.visible = false; if (S.chipLight) S.chipLight.on = false; };
  g.events.on('timeJumpFlash', () => S.ending());
  return S;
}
