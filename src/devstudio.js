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
  // ?exprs=happy,derp,angry,... gives each bean its own face (beans face -Z, so turn them to the camera)
  const exprs = (qs.get('exprs') || '').split(',').filter(Boolean);
  // ?strip=8 lines up one explorer per phase of the gait (side on), to read a whole cycle at once
  const strip = parseInt(qs.get('strip') || '0', 10);
  const crew = qs.get('props') ? [] : strip ? Array.from({ length: strip }, () => PRESETS[parseInt(qs.get('preset') || '0', 10)]) : exprs.length ? exprs.map((_, i) => PRESETS[i % PRESETS.length]) : PRESETS;
  const gapX = parseFloat(qs.get('gap') || '0.85');
  const chars = crew.map((pr, i) => {
    const c = new Character(pr);
    c.root.position.set((i - (crew.length - 1) / 2) * gapX, 0, 0);
    c.root.rotation.y = Math.PI + (i - (crew.length - 1) / 2) * -0.12 + parseFloat(qs.get('rot') || '0');
    c.studioExpr = exprs[i];
    if (strip) { c.phase = i / strip; c.root.rotation.y = Math.PI / 2; c.stripPhase = i / strip; }
    engine.scene.add(c.root);
    return c;
  });
  // ?fp=1 is the first-person view: the viewmodel's sleeves and gloves in front of the camera
  // (&held=stone_hatchet, &act=chop&at=0.3, &emote=wave, &raised=1 brings the gadget up)
  let fpv = null;
  if (qs.get('fp') && chars[0]) {
    const c = chars[0];
    c.root.visible = false;
    const local = { char: c, heldId: qs.get('held') || null, action: qs.get('act') ? { name: qs.get('act'), t: parseFloat(qs.get('at') || '0.3') } : null, emote: qs.get('emote') || null, vel: new THREE.Vector3(), grounded: true, swim: false, sprint: false };
    const fake = { engine, local, rig: { firstPerson: true, yaw: 0, pitch: 0 }, device: { raised: !!qs.get('raised') }, titleMode: false };
    import('./entities/viewmodel.js').then(({ Viewmodel }) => { fpv = new Viewmodel(fake); });
  }
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
    if (strip) chars.forEach((c) => { c.phase = c.stripPhase - (1.6 + parseFloat(qs.get('speed') || '0') * 0.62) * dt; });
    chars.forEach((c, i) => c.update(dt, { action: !exprs.length && acts[i] && acts[i] !== 'none' && acts[i] !== 'talk' ? { name: acts[i], t: T0 } : null, talk: !exprs.length && acts[i] === 'talk' ? 0.8 : 0, speed: parseFloat(qs.get('speed') || '0'), expr: c.studioExpr || qs.get('expr') || undefined, yaw: c.root.rotation.y }));
    if (fpv) fpv.lateUpdate(dt);
    engine.render(dt);
    requestAnimationFrame(loop);
  }
  loop();
}
