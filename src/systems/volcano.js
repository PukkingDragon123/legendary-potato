// The volcano: a bubbling lava lake in the summit crater, a smoke plume you
// can see from the beach, embers and an orange glow at night, and lava that
// really does not like you.
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';

const LAVA_HEAD = /* glsl */ `
varying vec3 vLavaW;
float lavaH( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float lavaN( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f ); return mix( mix( lavaH( i ), lavaH( i + vec2( 1.0, 0.0 ) ), f.x ), mix( lavaH( i + vec2( 0.0, 1.0 ) ), lavaH( i + 1.0 ), f.x ), f.y ); }
`;
// chunky pixel lava: glowing cracks between drifting dark crust plates
const LAVA_EMISSIVE = /* glsl */ `
{
  vec2 q = floor( vLavaW.xz * 3.0 ) / 3.0;
  float t = uTime;
  float n = lavaN( q * 0.3 + vec2( t * 0.045, t * 0.028 ) ) * 0.6 + lavaN( q * 0.75 - vec2( t * 0.06, -t * 0.035 ) ) * 0.4;
  float crust = smoothstep( 0.42, 0.54, n );
  float pulse = 0.85 + 0.15 * sin( t * 1.7 + n * 9.0 );
  vec3 hot = mix( vec3( 2.4, 0.62, 0.08 ), vec3( 3.6, 1.5, 0.25 ), smoothstep( 0.3, 0.1, n ) );
  totalEmissiveRadiance = hot * ( 1.0 - crust ) * pulse;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.07, 0.035, 0.025 ), crust );
}
`;

export class Volcano {
  constructor(game) {
    this.name = 'volcano';
    this.g = game;
    const v = game.world.layout?.volcano, s = game.sampler;
    if (!v) return;
    // the crater floor, and how far the bowl stays under the lava line
    let floor = Infinity;
    for (let k = 0; k < 80; k++) { const a = k * 2.4, r = (k / 80) * v.crater * 0.5; floor = Math.min(floor, s.heightAt(v.x + Math.cos(a) * r, v.z + Math.sin(a) * r)); }
    this.y = floor + 4;
    this.c = new THREE.Vector3(v.x, this.y, v.z);
    let R = 6;
    for (let r = 6; r < v.crater; r++) {
      let below = 0;
      for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; if (s.heightAt(v.x + Math.cos(a) * r, v.z + Math.sin(a) * r) < this.y) below++; }
      if (below < 4) break;
      R = r;
    }
    this.R = R + 3;
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a140c, roughness: 0.55, emissive: 0xffffff });
    patchMaterial(mat, {
      vertex: { head: 'varying vec3 vLavaW;', post: 'vLavaW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;' },
      fragment: { head: LAVA_HEAD, emissive: LAVA_EMISSIVE },
    });
    this.mesh = new THREE.Mesh(new THREE.CircleGeometry(this.R, 56).rotateX(-Math.PI / 2), mat);
    this.mesh.position.copy(this.c);
    this.mesh.receiveShadow = false; this.mesh.castShadow = false; this.mesh.name = 'lava';
    game.engine.scene.add(this.mesh);
    // physically based falloff: a big lake of lava needs a big number to light the crater walls
    this.light = game.lightPool?.add({ pos: this.c.clone().add(new THREE.Vector3(0, 9, 0)), color: 0xff5a1a, intensity: 700, range: 90, flicker: 0.2, on: true, priority: 0.8 });
    this.smokeT = 0; this.emberT = 0; this.hurtT = 0;
  }
  update(dt) {
    const g = this.g;
    if (!this.mesh) return;
    const cam = g.engine.camera.position, c = this.c;
    const d = Math.hypot(cam.x - c.x, cam.z - c.z);
    // the plume: visible from most of the island
    if (d < 2600) {
      // rises fast and spreads high up, so the crater itself stays clear
      this.smokeT += dt * 1.4;
      while (this.smokeT > 1) {
        this.smokeT -= 1;
        const a = Math.random() * 6.28, r = Math.random() * this.R * 0.6;
        g.fx.sprite('smoke', c.x + Math.cos(a) * r, c.y + 6, c.z + Math.sin(a) * r, { vx: 1.2 + Math.random(), vy: 7 + Math.random() * 3, vz: (Math.random() - 0.5) * 1.5, life: 20 + Math.random() * 6, size: 8 + Math.random() * 5, grow: 1.5, alpha: 0.26, color: 0x55504a, drag: 0.02, fadeIn: 0.15, wobble: 0.25 });
      }
    }
    // embers + bubbles up close
    if (d < 260) {
      this.emberT += dt * 9;
      while (this.emberT > 1) {
        this.emberT -= 1;
        const a = Math.random() * 6.28, r = Math.random() * this.R * 0.85;
        const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
        if (Math.random() < 0.6) g.fx.sprite('spark', x, c.y + 0.3, z, { vx: (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 6, vz: (Math.random() - 0.5) * 2, life: 1.8 + Math.random() * 1.6, size: 0.18, color: 0xffa040, grav: 2.5, wobble: 2 });
        else g.fx.sprite('glow', x, c.y + 0.15, z, { life: 0.7, size: 0.8 + Math.random() * 1.4, grow: 0.8, color: 0xff7a20, alpha: 0.85 });
      }
    }
    // lava burns
    const me = g.local;
    this.hurtT -= dt;
    if (!me.downed && Math.hypot(me.pos.x - c.x, me.pos.z - c.z) < this.R - 0.5 && me.pos.y < this.y + 0.6) {
      g.vitals?.damage(32 * dt, { kind: 'lava' });
      g.vitals?.add('hot', 6);
      me.vel.y = Math.max(me.vel.y, 7.5);
      if (Math.random() < dt * 20) g.fx.flame(me.pos, 1.2);
      if (this.hurtT <= 0) { this.hurtT = 8; g.ui?.toast('LAVA! That is very, very hot. Get out!', 'warn', 'skull', 3000); g.audio?.play('sizzle', { pos: me.pos, vol: 1.2 }); }
    }
  }
}

export async function install(g) {
  const V = new Volcano(g);
  g.volcano = V;
  g.addSystem(V);
  return V;
}
