// The Game: owns every system and runs the frame loop.
import * as THREE from 'three';
import { Events } from './core/events.js';
import { CollisionWorld } from './core/physics.js';
import { CameraRig } from './core/cameraRig.js';
import { makeSampler, BIOME, BIOME_NAMES } from './world/gen.js';
import { Terrain } from './world/terrain.js';
import { Water } from './world/water.js';
import { Sky } from './world/sky.js';
import { Flora } from './world/flora.js';
import { GroundCover } from './world/groundcover.js';
import { Nodes } from './world/nodes.js';
import { GameTime, Weather } from './world/time.js';
import { FX } from './gfx/fx.js';
import { Player } from './entities/player.js';
import { Inventory } from './systems/inventory.js';
import { ITEMS } from './data/items.js';
import { G } from './gfx/shaderlib.js';

export class Game {
  constructor(opt) {
    this.opt = opt;
    this.events = new Events();
    this.engine = opt.engine;
    this.world = opt.world;
    this.sampler = makeSampler(this.world);
    this.input = opt.input;
    this.players = new Map();
    this.isHost = opt.isHost !== false;
    this.paused = false;
    this.uiOpen = false;
    this.systems = [];
    this.interactables = new Set();
    this.lights = [];
  }

  async init(progress = () => {}) {
    const e = this.engine;
    progress(0.05, 'Laying down the dirt');
    this.terrain = new Terrain(e, this.world, this.sampler, this.opt.terrainTex ?? null);
    this.terrain.update(e.camera.position, true);
    progress(0.2, 'Filling rivers');
    this.water = new Water(e, this.world, this.sampler, this.terrain);
    this.sky = new Sky(e);
    progress(0.3, 'Growing ancient trees');
    await tick();
    this.flora = new Flora(e, this.world, this.sampler);
    progress(0.55, 'Planting ferns');
    await tick();
    this.ground = new GroundCover(e, this.world, this.terrain);
    this.physics = new CollisionWorld(this.sampler);
    this.physics.extraQuery = (x, z, r, out) => { this.flora.collidersNear(x, z, r, out); for (const f of this.extraColliders) f(x, z, r, out); };
    this.extraColliders = [];
    this.time = new GameTime({ dayLength: this.opt.dayLength ?? 1200, tod: 0.3 });
    this.weather = new Weather(this, this.world.seed + ':wx');
    this.fx = new FX(this);
    progress(0.65, 'Scattering rocks');
    this.nodes = new Nodes(this);
    this.rig = new CameraRig(e.camera, this.physics);
    this.envRefresh = 0;
    this.pmrem = new THREE.PMREMGenerator(e.renderer);
    // local player + inventory
    const crash = this.world.pois.find((p) => p.id === 'crash');
    this.crash = crash;
    this.inventory = new Inventory(32, { hotbar: 8 });
    this.local = new Player(this, { id: this.opt.playerId ?? 'local', name: this.opt.name ?? 'Explorer', outfit: this.opt.outfit, local: true });
    this.players.set(this.local.id, this.local);
    const sx = crash.x - 4, sz = crash.z + 6;
    this.local.teleport(sx, this.sampler.heightAt(sx, sz) + 0.05, sz);
    this.rig.yaw = Math.PI * 0.75;
    progress(0.75, 'Waking up the critters');
    for (const s of this.opt.systems ?? []) {
      const sys = await s(this);
      if (sys) this.systems.push(sys);
      await tick();
    }
    progress(0.95, 'Rebooting the time machine');
    this.events.emit('ready', this);
    return this;
  }

  allPlayers() { return [...this.players.values()]; }
  addSystem(sys) { this.systems.push(sys); return sys; }
  sys(name) { return this.systems.find((s) => s.name === name); }

  // ---------------------------------------------------------------- world queries
  biomeName(x, z) { return BIOME_NAMES[this.sampler.biomeAt(x, z)] ?? 'Wilds'; }
  isCameraSheltered() {
    const c = this.engine.camera.position;
    if (this.caves?.inside(c)) return true;
    const hit = this.physics.raycast(c, _up, 25, { terrain: false });
    return !!hit;
  }

  // give items to the local player (spills to the ground if full)
  give(id, n = 1, opt = {}) {
    const left = this.inventory.add(id, n);
    if (left > 0 && this.drops) this.drops.spawn(id, left, this.local.pos.clone().add(new THREE.Vector3(0, 1, 0)));
    if (!opt.quiet) this.events.emit('loot', { id, n: n - left, from: opt.from });
    return n - left;
  }

  // ---------------------------------------------------------------- frame
  update(dt) {
    const e = this.engine;
    dt = Math.min(dt, 0.1);
    this.frame = (this.frame ?? 0) + 1;
    this.input.pollGamepad();
    if (!this.paused) {
      this.time.update(dt);
      const wx = this.weather.update(dt);
      if (!this.uiOpen) {
        const { dx, dy } = this.input.look();
        this.rig.look(dx, dy);
        if (this.input.wheel && !this.wheelCaptured) this.rig.zoom(this.input.wheel);
      }
      this.local.updateLocal(dt, this.input, this.rig, { uiOpen: this.uiOpen, aiming: this.aiming });
      for (const p of this.players.values()) if (!p.local) p.updateRemote(dt, performance.now() / 1000);
      for (const s of this.systems) if (s.update) s.update(dt);
      this.nodes.update(dt);
      this.fx.update(dt);
      for (const p of this.players.values()) p.updateVisual(dt);
      void wx;
    }
    // camera + world streaming
    const head = this.local.headPos(_h);
    const vehicleCam = this.cameraOverride?.();
    this.rig.update(dt, vehicleCam?.pos ?? head, { sprint: this.local.sprint, aim: this.aiming, firstPerson: this.forceFirstPerson, vehicleDist: vehicleCam?.dist });
    // in first person you are the camera: your own bean is hidden (the viewmodel shows your hands)
    this.local.char.root.visible = !(this.rig.firstPerson || this.forceFirstPerson) || !!vehicleCam || !!this.rig.override;
    const cam = e.camera.position;
    const ws = this.weather.state();
    this.sky.update(this.time.tod, ws, cam, dt);
    e.post.compMat.uniforms.uUnderwater.value = this.local.underwater ? 1 : 0;
    e.raysScale = 1 - ws.cover * 0.7;
    this.sky.uniforms.uFlash.value = this.weather.flash * 0.6;
    if (this.weather.flash > 0) e.sun.intensity += this.weather.flash * 6;
    this.terrain.update(cam);
    this.water.update(cam);
    this.ground.update(cam);
    this.flora.update(cam, dt);
    // grass pushers: players (dinos add themselves)
    let pi = 0;
    for (const p of this.players.values()) { if (pi < 3) G.uPushers.value[pi++].set(p.pos.x, p.pos.y, p.pos.z, 0.7); }
    this.pusherBase = pi;
    // refresh sky reflections for water occasionally
    this.envRefresh -= dt;
    if (this.envRefresh <= 0) { this.envRefresh = 8; this.refreshEnv(); }
    for (const s of this.systems) if (s.lateUpdate) s.lateUpdate(dt);
    e.render(dt);
    this.input.endFrame();
  }

  refreshEnv() {
    if (!this._envScene) { this._envScene = new THREE.Scene(); this._envSky = this.sky.mesh.clone(); this._envSky.position.set(0, 0, 0); this._envScene.add(this._envSky); }
    this._envSky.material = this.sky.mesh.material;
    if (this._envRT) this._envRT.dispose();
    this._envRT = this.pmrem.fromScene(this._envScene, 0, 1, 2000);
    this.water.setEnvMap(this._envRT.texture);
    this.events.emit('envmap', this._envRT.texture);
  }
}
const _h = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const tick = () => new Promise((r) => setTimeout(r, 0));
export { BIOME, ITEMS };
