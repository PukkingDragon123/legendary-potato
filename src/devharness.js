// Dev harness (temporary): renders the world from a URL-specified camera.
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { generateWorld, makeSampler } from './world/gen.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { Flora } from './world/flora.js';
import { GroundCover } from './world/groundcover.js';
import { Character, PRESETS } from './entities/character.js';

export function runHarness(qs) {
const engine = new Engine(document.getElementById('app'), qs.get('q') || 'high');
const world = generateWorld('prehistoric');
const sampler = makeSampler(world);
console.log('world gen ms', world.genMs);
const terrain = new Terrain(engine, world, sampler);
const sky = new Sky(engine);
const water = new Water(engine, world, sampler, terrain);
const t0f = performance.now();
const flora = new Flora(engine, world, sampler);
console.log('flora trees', flora.trees.length, 'ms', Math.round(performance.now() - t0f));
const ground = new GroundCover(engine, world, terrain);
const cam = engine.camera;
const cp = (qs.get('cam') || '0,0,0').split(',').map(Number);
const look = (qs.get('look') || '0,0,-100').split(',').map(Number);
let tod = parseFloat(qs.get('t') || '0.38');
const crash = world.pois.find((p) => p.id === 'crash');
const base = qs.get('rel') === '0' ? { x: 0, z: 0 } : crash;
cam.position.set(base.x + cp[0], sampler.heightAt(base.x + cp[0], base.z + cp[2]) + cp[1], base.z + cp[2]);
cam.lookAt(base.x + look[0], sampler.heightAt(base.x + look[0], base.z + look[2]) + look[1], base.z + look[2]);
window.__cam = cam; window.__world = world; window.__sampler = sampler; window.__engine = engine;
terrain.update(cam.position, true);
const weather = { cover: parseFloat(qs.get('cover') || '0.3'), storm: 0, fog: parseFloat(qs.get('fog') || '0'), rain: 0 };
sky.update(tod, weather, cam.position, 0);
// sky env map for water reflections
const pmrem = new THREE.PMREMGenerator(engine.renderer);
const envScene = new THREE.Scene();
envScene.add(sky.mesh.clone());
const envRT = pmrem.fromScene(envScene, 0, 1, 2000);
water.setEnvMap(envRT.texture);
const chars = [];
if (qs.get('chars')) {
  const c0 = (qs.get('chars')).split(',').map(Number);
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  PRESETS.forEach((pr, i) => {
    const c = new Character(pr);
    const pos = cam.position.clone().addScaledVector(fwd, c0[0]).addScaledVector(right, (i - 1.5) * (c0[1] || 0.75));
    pos.y = sampler.heightAt(pos.x, pos.z);
    c.root.position.copy(pos);
    c.root.rotation.y = Math.atan2(-fwd.x, -fwd.z) + (i - 1.5) * 0.25;
    engine.scene.add(c.root);
    const acts = (qs.get('acts') || 'none,wave,none,none').split(',');
    chars.push({ c, act: acts[i] });
  });
}
let last = performance.now();
const maxFrames = parseInt(qs.get('frames') || '0', 10);
let frameNo = 0;
function frame() {
  frameNo++;
  if (maxFrames && frameNo > maxFrames) { window.__done = true; return; }
  const now = performance.now();
  const dt = maxFrames ? 1 / 30 : Math.min(0.1, (now - last) / 1000); last = now;
  sky.update(tod, weather, cam.position, dt);
  terrain.update(cam.position);
  water.update(cam.position);
  flora.update(cam.position, dt);
  ground.update(cam.position);
  for (const { c, act } of chars) c.update(dt, { action: act && act !== 'none' ? { name: act, t: (performance.now() / 1000) % 1 } : null, talk: act === 'talk' ? 0.8 : 0 });
  engine.render(dt);
  requestAnimationFrame(frame);
}
frame();
}
