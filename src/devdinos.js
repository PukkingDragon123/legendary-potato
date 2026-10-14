// Dev-only dinosaur studio: species lineup for close-up screenshots.
// ?dinos=1&sp=raptor,trike&cam=x,y,z&look=x,y,z&state=idle|sleep|ko&speed=0&act=roar&t=0.42&frames=N
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Sky } from './world/sky.js';
import { patchMaterial } from './gfx/shaderlib.js';
import { SPECIES } from './entities/dinoSpecies.js';
import { buildDino, DinoRig } from './entities/dinoModel.js';
import { alphaSpecies } from './systems/bosses.js';
import { Character, PRESETS } from './entities/character.js';

export function runDinoStudio(qs) {
  const engine = new Engine(document.getElementById('app'), qs.get('q') || 'high');
  const sky = new Sky(engine);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), patchMaterial(new THREE.MeshStandardMaterial({ color: 0x6a8a44, roughness: 0.95 }), {}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  engine.scene.add(ground);
  const ids = (qs.get('sp') || 'compy,microraptor,raptor,gallimimus,proto,pachy,dilo,parasaur').split(',');
  const gap = parseFloat(qs.get('gap') || '2.6');
  const list = [];
  let x = 0;
  // 'alpha:gnasher' shows an alpha
  const spOf = (id) => (id.startsWith('alpha:') ? alphaSpecies(id.slice(6)) : SPECIES[id]);
  const widths = ids.map((id) => Math.max(1.2, spOf(id).size * 0.55));
  const total = widths.reduce((a, b) => a + b, 0) + gap * (ids.length - 1);
  x = -total / 2;
  for (const [i, id] of ids.entries()) {
    const sp = spOf(id);
    const rig = buildDino(sp, { baby: qs.get('baby') === '1' });
    x += widths[i] / 2;
    rig.root.position.set(x, 0, 0);
    rig.root.rotation.y = parseFloat(qs.get('rot') || '-1.2');
    x += widths[i] / 2 + gap;
    engine.scene.add(rig.root);
    list.push({ rig, anim: new DinoRig(rig, sp), sp });
  }
  if (qs.get('human')) { const c = new Character(PRESETS[0]); c.root.position.set(-total / 2 - 1.2, 0, 1); c.root.rotation.y = -0.6; engine.scene.add(c.root); list.push({ char: c }); }
  const cam = engine.camera;
  const cp = (qs.get('cam') || `0,${Math.max(2, total * 0.12)},${Math.max(6, total * 0.75)}`).split(',').map(Number);
  const lk = (qs.get('look') || '0,1,0').split(',').map(Number);
  cam.position.set(...cp); cam.lookAt(...lk);
  const tod = parseFloat(qs.get('t') || '0.42');
  const weather = { cover: 0.2, storm: 0, fog: 0, rain: 0 };
  const maxFrames = parseInt(qs.get('frames') || '0', 10);
  const state = qs.get('state') || 'idle', act = qs.get('act'), speed = parseFloat(qs.get('speed') || '0');
  let frame = 0;
  window.studio = { list, engine };
  function loop() {
    frame++;
    if (maxFrames && frame > maxFrames) { window.__done = true; return; }
    const dt = 1 / 30;
    sky.update(tod, weather, cam.position, dt);
    for (const d of list) {
      if (d.char) { d.char.update(dt, {}); continue; }
      d.anim.update(dt, { speed: speed * d.sp.stats.speed, yaw: d.rig.root.rotation.y, state, action: act ? { name: act, t: parseFloat(qs.get('at') || '0.5') } : null, look: { yaw: 0, pitch: 0 }, alert: parseFloat(qs.get('alert') || '0'), mood: qs.get('mood') || undefined, fly: qs.get('fly') === '1' });
    }
    engine.render(dt);
    requestAnimationFrame(loop);
  }
  loop();
}
