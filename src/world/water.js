// Water: ocean, flowing river ribbons (with whitewater on the falls), lake and
// pool discs. Stock MeshStandardMaterial patched with pixel-snapped flowing
// ripples, depth absorption, shoreline foam and sky reflections, so it still
// receives sun shadows and fog like everything else.
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';
import { GLSL_HASH } from './terrain.js';

const WATER_GLSL = /* glsl */ `
${GLSL_HASH}
uniform sampler2D tHeight;
uniform float uHalf;
uniform float uSize;
uniform float uWaterKind; // 0 ocean, 1 river, 2 still
uniform sampler2D tWaterLvl;
varying vec3 vWW;
varying vec2 vFlow;
varying float vFoamA;
float terrainH( vec2 xz ) { return texture2D( tHeight, ( xz + uHalf + 0.5 ) / ( uSize + 1.0 ) ).r; }
float waveH( vec2 p, float t ) {
  float h = 0.0;
  h += sin( dot( p, vec2( 0.72, 0.31 ) ) * 1.3 + t * 1.6 ) * 0.5;
  h += sin( dot( p, vec2( -0.41, 0.83 ) ) * 2.1 + t * 2.1 ) * 0.3;
  h += sin( dot( p, vec2( 0.19, -0.95 ) ) * 3.7 + t * 2.9 ) * 0.18;
  h += ( vnoise( p * 1.7 + t * 0.6 ) - 0.5 ) * 0.5;
  h += ( vnoise( p * 3.9 - t * 0.9 ) - 0.5 ) * 0.22;
  return h;
}
`;

export class Water {
  constructor(engine, world, sampler, terrain) {
    this.engine = engine;
    this.world = world;
    this.s = sampler;
    this.group = new THREE.Group();
    this.group.name = 'water';
    engine.scene.add(this.group);
    this.envMap = null;
    const common = { tHeight: { value: terrain.heightTex }, tWaterLvl: { value: terrain.waterTex }, uHalf: { value: world.half }, uSize: { value: world.size } };
    this.oceanMat = this.makeMaterial(0, common);
    this.riverMat = this.makeMaterial(1, common);
    this.stillMat = this.makeMaterial(2, common);
    this.buildOcean();
    this.buildRiver();
    this.buildStill();
  }

  makeMaterial(kind, common) {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.06, metalness: 0.0, transparent: true, depthWrite: true, envMapIntensity: kind === 0 ? 0.9 : 0.6 });
    mat.userData.kind = kind;
    patchMaterial(mat, {
      uniforms: { ...common, uWaterKind: { value: kind } },
      vertex: {
        head: /* glsl */ `
          uniform float uWaterKind;
          attribute vec2 aFlow;
          attribute float aFoam;
          varying vec3 vWW;
          varying vec2 vFlow;
          varying float vFoamA;
          ${kind === 0 ? GLSL_HASH + `
          float waveV( vec2 p, float t ) {
            return sin( dot( p, vec2( 0.06, 0.02 ) ) + t * 0.9 ) * 0.22 + sin( dot( p, vec2( -0.03, 0.07 ) ) + t * 1.3 ) * 0.14 + sin( dot( p, vec2( 0.11, -0.09 ) ) + t * 1.9 ) * 0.07;
          }` : ''}
        `,
        main: /* glsl */ `
          vec4 wwp = modelMatrix * vec4( transformed, 1.0 );
          ${kind === 0 ? 'float wv = waveV( wwp.xz, uTime ) * smoothstep( 600.0, 100.0, length( wwp.xz - cameraPosition.xz ) ); transformed.y += wv; wwp.y += wv;' : ''}
          vWW = wwp.xyz;
          ${kind === 1 ? 'vFlow = aFlow; vFoamA = aFoam;' : 'vFlow = vec2( 0.0 ); vFoamA = 0.0;'}
        `,
      },
      fragment: {
        head: WATER_GLSL + '\nfloat wAlpha; vec3 wNrmW; float wFoam;',
        map: /* glsl */ `
          {
            vec3 wp = vWW;
            float t = uTime;
            if ( uWaterKind > 1.5 ) {
              float wlv = texture2D( tWaterLvl, ( wp.xz + uHalf ) / uSize ).r;
              if ( abs( wlv - wp.y ) > 0.5 ) discard;
            }
            // pixel-snap the surface so ripples read as crisp pixel clusters (16 px/m)
            vec2 q = ( floor( wp.xz * 16.0 ) + 0.5 ) / 16.0;
            vec2 flow = vFlow;
            float speed = length( flow );
            float e = 0.12;
            vec2 grad;
            float foamStreak = 0.0;
            if ( uWaterKind > 0.5 && uWaterKind < 1.5 ) {
              // two-phase flow mapping
              float ph0 = fract( t * 0.35 ), ph1 = fract( t * 0.35 + 0.5 );
              float w0 = 1.0 - abs( ph0 * 2.0 - 1.0 ), w1 = 1.0 - w0;
              vec2 o0 = -flow * ph0 * 2.2, o1 = -flow * ph1 * 2.2;
              vec2 p0 = q * 1.2 + o0, p1 = q * 1.2 + o1 + 0.37;
              float h0 = waveH( p0, t * 0.5 ), h1 = waveH( p1, t * 0.5 );
              grad.x = ( waveH( p0 + vec2( e, 0.0 ), t * 0.5 ) - h0 ) / e * w0 + ( waveH( p1 + vec2( e, 0.0 ), t * 0.5 ) - h1 ) / e * w1;
              grad.y = ( waveH( p0 + vec2( 0.0, e ), t * 0.5 ) - h0 ) / e * w0 + ( waveH( p1 + vec2( 0.0, e ), t * 0.5 ) - h1 ) / e * w1;
              grad *= 0.18 + speed * 0.12;
              vec2 fd = speed > 0.001 ? flow / speed : vec2( 0.0, 1.0 );
              vec2 fpp = vec2( dot( q, vec2( -fd.y, fd.x ) ) * 2.4, dot( q, fd ) * 0.35 - t * ( 0.6 + speed * 1.4 ) );
              foamStreak = smoothstep( 0.62, 0.8, vnoise( fpp ) * 0.7 + vnoise( fpp * 2.3 + 4.0 ) * 0.3 );
            } else {
              float h0 = waveH( q * 0.8, t );
              grad.x = ( waveH( q * 0.8 + vec2( e, 0.0 ), t ) - h0 ) / e;
              grad.y = ( waveH( q * 0.8 + vec2( 0.0, e ), t ) - h0 ) / e;
              grad *= uWaterKind > 1.5 ? 0.08 : 0.16;
            }
            wNrmW = normalize( vec3( -grad.x, 1.0, -grad.y ) );
            // depth from terrain
            float th = terrainH( wp.xz );
            float depth = max( wp.y - th, 0.0 );
            vec3 shallow = vec3( 0.14, 0.46, 0.44 );
            vec3 deep = vec3( 0.012, 0.1, 0.19 );
            if ( uWaterKind > 0.5 && uWaterKind < 1.5 ) { shallow = vec3( 0.2, 0.42, 0.34 ); deep = vec3( 0.03, 0.15, 0.15 ); }
            if ( uWaterKind > 1.5 ) { shallow = vec3( 0.2, 0.4, 0.3 ); deep = vec3( 0.03, 0.12, 0.13 ); }
            vec3 wc = mix( deep, shallow, exp( - depth * 0.45 ) );
            // shoreline foam: animated pixel bands that lap the beach
            float shore = 1.0 - smoothstep( 0.0, uWaterKind < 0.5 ? 0.9 : 0.35, depth );
            float bands = step( 0.72, fract( depth * 2.5 - t * 0.35 + vnoise( q * 0.7 ) * 0.6 ) ) * smoothstep( 0.0, 0.25, shore );
            if ( uWaterKind > 0.5 ) bands *= 0.0;
            wFoam = max( bands * shore, smoothstep( 0.93, 1.0, shore ) * step( 0.45, vnoise( q * 2.0 + t * 0.3 ) ) * 0.7 );
            wFoam = max( wFoam, foamStreak * ( 0.35 + vFoamA ) );
            wFoam = max( wFoam, vFoamA * smoothstep( 0.35, 0.65, vnoise( q * 3.0 + vec2( 0.0, -t * 6.0 ) ) ) );
            wFoam = clamp( wFoam, 0.0, 1.0 );
            wAlpha = clamp( 1.0 - exp( - depth * 1.4 ), 0.18, 0.94 );
            wAlpha = max( wAlpha, wFoam * 0.95 );
            diffuseColor.rgb = mix( wc, vec3( 0.92, 0.96, 0.98 ), wFoam );
          }
        `,
      },
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( wNrmW, 0.0 ) ).xyz );')
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix( 0.05, 0.85, wFoam );')
        .replace('#include <opaque_fragment>', `
          #include <opaque_fragment>
          gl_FragColor.a = wAlpha;
        `);
    };
    return mat;
  }

  buildOcean() {
    // dense grid that follows the camera (snapped) + a big flat skirt to the horizon
    const near = new THREE.PlaneGeometry(1400, 1400, 140, 140);
    near.rotateX(-Math.PI / 2);
    this.oceanNear = new THREE.Mesh(near, this.oceanMat);
    this.oceanNear.frustumCulled = false;
    this.oceanNear.receiveShadow = true;
    this.oceanNear.renderOrder = 2;
    const ring = new THREE.RingGeometry(690, 9000, 64, 1);
    ring.rotateX(-Math.PI / 2);
    this.oceanFar = new THREE.Mesh(ring, this.oceanMat);
    this.oceanFar.frustumCulled = false;
    this.oceanFar.renderOrder = 2;
    this.group.add(this.oceanNear, this.oceanFar);
  }

  buildRiver() {
    const pts = this.world.river; // [x, z, level, width, fall]
    if (!pts || pts.length < 2) return;
    const pos = [], uv = [], flow = [], foam = [], idx = [];
    const n = pts.length;
    let along = 0;
    for (let i = 0; i < n; i++) {
      const [x, z, lvl, w, fall] = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz) || 1;
      dx /= len; dz /= len;
      const px = -dz, pz = dx;
      if (i > 0) along += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const half = w * 0.5 + 2.2;
      const drop = (a[2] - b[2]) / Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1]));
      const speed = 0.6 + Math.min(4, drop * 30);
      const f = fall || drop > 0.25 ? 1 : Math.min(1, drop * 12);
      for (const side of [-1, 1]) {
        pos.push(x + px * half * side, lvl + 0.02, z + pz * half * side);
        uv.push(side < 0 ? 0 : 1, along / 8);
        flow.push(dx * speed, dz * speed);
        foam.push(f);
      }
      if (i < n - 1) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    geo.setAttribute('aFoam', new THREE.Float32BufferAttribute(foam, 1));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.river = new THREE.Mesh(geo, this.riverMat);
    this.river.receiveShadow = true;
    this.river.renderOrder = 3;
    this.group.add(this.river);
  }

  buildStill() {
    const discs = [];
    const lk = this.world.lake;
    if (lk) discs.push([lk.x, lk.z, lk.r + 34, lk.level]);
    const pool = this.world.pool;
    if (pool) discs.push([pool.x, pool.z, pool.r + 10, pool.level]);
    for (const [x, z, r, lvl] of discs) {
      const g = new THREE.CircleGeometry(r, 64);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.riverMat.clone ? this.stillMat : this.stillMat);
      m.position.set(x, lvl + 0.01, z);
      m.receiveShadow = true;
      m.renderOrder = 3;
      this.group.add(m);
    }
    // swamp pools: one plane at the swamp water level clipped by terrain
    const lay = this.world.layout;
    if (lay) {
      const g = new THREE.PlaneGeometry(700, 560);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, this.stillMat);
      m.position.set(lay.low.swamp[0], 1.1, lay.low.swamp[1] + 40);
      m.receiveShadow = true;
      m.renderOrder = 3;
      this.group.add(m);
    }
  }

  setEnvMap(tex) {
    for (const m of [this.oceanMat, this.riverMat, this.stillMat]) { m.envMap = tex; m.needsUpdate = true; }
  }

  update(camPos) {
    const snap = 10;
    this.oceanNear.position.set(Math.round(camPos.x / snap) * snap, 0, Math.round(camPos.z / snap) * snap);
    this.oceanFar.position.set(this.oceanNear.position.x, -0.05, this.oceanNear.position.z);
  }
}
