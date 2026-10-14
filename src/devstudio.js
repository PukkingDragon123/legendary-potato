// Dev-only character/prop studio: quick scene for close-up screenshots.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Sky } from './world/sky.js';
import { Character, PRESETS } from './entities/character.js';
import { patchMaterial } from './gfx/shaderlib.js';

export function runStudio(qs) {
  const engine = new Engine(document.getElementById('app'), qs.get('q') || 'high');
  const sky = new Sky(engine);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), patchMaterial(new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 0.95 }), {}));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  engine.scene.add(ground);
  const cam = engine.camera;
  const cp = (qs.get('cam') || '0,1.0,3.2').split(',').map(Number);
  const lk = (qs.get('look') || '0,0.75,0').split(',').map(Number);
  cam.position.set(...cp); cam.lookAt(...lk);
  const acts = (qs.get('acts') || 'none,wave,none,talk').split(',');
  // ?props=greenhouse,trap_net lines up structure models instead of the crew
  if (qs.get('props')) {
    import('./world/structureModels.js').then(({ buildStructure }) => {
      const ids = qs.get('props').split(','), gap = parseFloat(qs.get('gap') || '3');
      ids.forEach((id, i) => { const b = buildStructure(id); if (!b) return; b.g.position.set((i - (ids.length - 1) / 2) * gap, 0, 0); b.g.rotation.y = parseFloat(qs.get('rot') || '0'); b.g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); engine.scene.add(b.g); });
    });
  }
  const chars = (qs.get('props') ? [] : PRESETS).map((pr, i) => {
    const c = new Character(pr);
    c.root.position.set((i - 1.5) * 0.85, 0, 0);
    c.root.rotation.y = (i - 1.5) * -0.18 + parseFloat(qs.get('rot') || '0');
    engine.scene.add(c.root);
    return c;
  });
  const tod = parseFloat(qs.get('t') || '0.42');
  const weather = { cover: 0.2, storm: 0, fog: 0, rain: 0 };
  const maxFrames = parseInt(qs.get('frames') || '0', 10);
  let frame = 0;
  const T0 = parseFloat(qs.get('at') || '0.3');
  function loop() {
    frame++;
    if (maxFrames && frame > maxFrames) { window.__done = true; return; }
    const dt = 1 / 30;
    sky.update(tod, weather, cam.position, dt);
    chars.forEach((c, i) => c.update(dt, { action: acts[i] && acts[i] !== 'none' && acts[i] !== 'talk' ? { name: acts[i], t: T0 } : null, talk: acts[i] === 'talk' ? 0.8 : 0, speed: parseFloat(qs.get('speed') || '0'), expr: qs.get('expr') || undefined }));
    engine.render(dt);
    requestAnimationFrame(loop);
  }
  loop();
}
