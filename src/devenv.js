// Dev-only environment studio: the island's terrain, water, sky, trees,
// ground cover, rocks and rapids without the rest of the game, so the
// landscape can be looked at (and screenshotted) in a fraction of the load.
// ?env=1&seed=prehistoric&q=low&t=0.42
// Views (also callable later as window.env.view({...}) from a test script):
//   &cam=x,y,z&look=x,y,z            absolute camera
//   &at=x,z&h=1.7&yaw=0&pitch=-0.15  stand on the ground at x,z
//   &river=150&side=3&h=1.7&yaw=0.5  stand beside river point i (side metres past the bank, yaw from downstream)
//   &poi=crash                       stand at a point of interest
//   &hide=grass,flora,water,nodes,rapids   switch layers off
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { CollisionWorld } from './core/physics.js';
import { loadWorld } from './world/worldLoader.js';
import { makeSampler } from './world/gen.js';
import { Terrain } from './world/terrain.js';
import { paintTerrainInWorker } from './gfx/terrainTextures.js';
import { Water } from './world/water.js';
import { Sky } from './world/sky.js';
import { Flora } from './world/flora.js';
import { GroundCover } from './world/groundcover.js';
import { Nodes } from './world/nodes.js';
import { Rapids } from './world/rapids.js';
import { G } from './gfx/shaderlib.js';

export async function runEnvStudio(qs) {
  const engine = new Engine(document.getElementById('app'), qs.get('q') || 'high');
  const t0 = performance.now();
  const texP = paintTerrainInWorker();
  const world = await loadWorld(qs.get('seed') || 'prehistoric');
  const texData = await texP;
  const sampler = makeSampler(world);
  const hide = new Set((qs.get('hide') || '').split(',').filter(Boolean));
  const stamp = (k) => console.log(`[env] ${k} ${Math.round(performance.now() - t0)}ms`);
  stamp('world');
  const terrain = new Terrain(engine, world, sampler, texData);
  stamp('terrain');
  const water = new Water(engine, world, sampler, terrain);
  const sky = new Sky(engine);
  const flora = new Flora(engine, world, sampler);
  stamp('flora');
  const ground = new GroundCover(engine, world, terrain);
  stamp('ground');
  const physics = new CollisionWorld(sampler);
  const cam = engine.camera;
  // just enough of a game for the systems that expect one
  const g = {
    engine, world, sampler, terrain, water, sky, flora, ground, physics,
    time: { elapsed: 0, tod: 0.42 }, events: { emit() {}, on() {} },
    allPlayers: () => [{ pos: cam.position }],
    addSystem: (s) => s,
  };
  physics.extraQuery = (x, z, r, out) => flora.collidersNear(x, z, r, out);
  g.nodes = new Nodes(g);
  stamp('nodes');
  const rapids = new Rapids(g);
  stamp('rapids');
  water.group.visible = !hide.has('water');
  for (const m of Object.values(flora.bm)) m.visible = !hide.has('flora');
  ground.group.visible = !hide.has('grass');
  g.nodes.group.visible = !hide.has('nodes');
  if (rapids.group) rapids.group.visible = !hide.has('rapids');

  const R = world.river ?? [];
  const pt = (i) => R[Math.max(0, Math.min(R.length - 1, i))];
  // place the camera from a view description; returns where it ended up
  function view(v = {}) {
    const h = v.h ?? 1.7;
    let x = 0, z = 0, yaw = v.yaw ?? 0, pitch = v.pitch ?? -0.12;
    if (v.cam) {
      cam.position.set(...v.cam);
      if (v.look) cam.lookAt(...v.look);
      return { x: v.cam[0], z: v.cam[2] };
    }
    if (v.river !== undefined) {
      const i = v.river, a = pt(i - 3), b = pt(i + 3), c = pt(i);
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      const px = -dz / l, pz = dx / l, side = v.side ?? 3;
      const off = side === 0 ? 0 : Math.sign(side) * (c[3] * 0.5 + Math.abs(side));
      x = c[0] + px * off; z = c[1] + pz * off;
      // yaw 0 looks downstream
      yaw = Math.atan2(-dx / l, -dz / l) + (v.yaw ?? 0);
    } else if (v.poi) {
      const p = world.pois.find((q) => q.id === v.poi);
      x = (p?.x ?? 0) + (v.dx ?? 0); z = (p?.z ?? 0) + (v.dz ?? 0);
    } else if (v.at) { [x, z] = v.at; }
    const ground0 = sampler.heightAt(x, z);
    const wl = sampler.waterAt(x, z);
    const y = (v.onWater && wl > ground0 ? wl : ground0) + h;
    cam.position.set(x, y, z);
    cam.rotation.set(pitch, yaw, 0, 'YXZ');
    return { x, y, z, ground: ground0, water: wl };
  }
  const parseV = () => {
    const num = (k, d) => (qs.get(k) !== null ? parseFloat(qs.get(k)) : d);
    const v = { h: num('h', 1.7), yaw: num('yaw', 0), pitch: num('pitch', -0.12), side: num('side', 3), onWater: qs.get('onwater') === '1' };
    if (qs.get('cam')) { v.cam = qs.get('cam').split(',').map(Number); v.look = (qs.get('look') || '0,0,0').split(',').map(Number); }
    else if (qs.get('river')) v.river = parseInt(qs.get('river'), 10);
    else if (qs.get('poi')) { v.poi = qs.get('poi'); v.dx = num('dx', 0); v.dz = num('dz', 0); }
    else if (qs.get('at')) v.at = qs.get('at').split(',').map(Number);
    else v.poi = 'crash';
    return v;
  };
  view(parseV());
  if (qs.get('fov')) { cam.fov = parseFloat(qs.get('fov')); cam.updateProjectionMatrix(); }
  terrain.update(cam.position, true);

  const weather = { cover: parseFloat(qs.get('cover') || '0.2'), storm: 0, fog: parseFloat(qs.get('fog') || '0'), rain: 0 };
  const state = { tod: parseFloat(qs.get('t') || '0.42'), frame: 0 };
  const pmrem = new THREE.PMREMGenerator(engine.renderer);
  let envRT = null, envT = 0;
  const envScene = new THREE.Scene();
  const envSky = sky.mesh.clone();
  envScene.add(envSky);
  window.env = { g, view, state, world, sampler, rapids, terrain, ground, flora, water, sky, engine };
  window.game = state; // the screenshot harness counts frames on window.game.frame
  stamp('ready');
  const maxFrames = parseInt(qs.get('frames') || '0', 10);
  function loop() {
    state.frame++;
    if (maxFrames && state.frame > maxFrames) { window.__done = true; return; }
    const dt = 1 / 30;
    g.time.elapsed += dt; g.time.tod = state.tod;
    sky.update(state.tod, weather, cam.position, dt);
    terrain.update(cam.position);
    water.update(cam.position);
    ground.update(cam.position);
    flora.update(cam.position, dt);
    g.nodes.update(dt);
    rapids.update(dt);
    G.uPushers.value[0].set(0, -9999, 0, 0);
    envT -= dt;
    if (envT <= 0) {
      envT = 8;
      envSky.material = sky.mesh.material;
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, 0, 1, 2000);
      water.setEnvMap(envRT.texture);
    }
    engine.render(dt);
    requestAnimationFrame(loop);
  }
  loop();
}
