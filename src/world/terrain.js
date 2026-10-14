// Chunked LOD heightfield terrain with a painted splat shader.
// Up close every spot picks its material through a noisy threshold, so
// borders between ground types are ragged and natural instead of blurry.
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';
import { buildTerrainTextures } from '../gfx/terrainTextures.js';

const CHUNK = 64;
const LODS = [1, 2, 4, 8, 16];

export const GLSL_HASH = /* glsl */ `
float hash21( vec2 p ) {
  uvec2 q = uvec2( ivec2( floor( p ) ) + ivec2( 100000 ) ) * uvec2( 1597334673u, 3812015801u );
  uint n = ( q.x ^ q.y ) * 1597334673u;
  return float( n ) * ( 1.0 / 4294967295.0 );
}
float vnoise( vec2 p ) {
  vec2 i = floor( p ), f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = hash21( i ), b = hash21( i + vec2( 1.0, 0.0 ) ), c = hash21( i + vec2( 0.0, 1.0 ) ), d = hash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
`;

export class Terrain {
  constructor(engine, world, sampler) {
    this.engine = engine;
    this.world = world;
    this.s = sampler;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    engine.scene.add(this.group);
    this.chunks = new Map(); // key -> { mesh, lod }
    this.geoCache = new Map();
    this.nChunks = world.size / CHUNK; // 32
    this.indexCache = {};
    this.buildQueue = [];

    // --- GPU data textures
    const { M, N } = world;
    this.splatTex = new THREE.DataTexture(world.splat, M, M, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.splatTex.magFilter = this.splatTex.minFilter = THREE.NearestFilter;
    this.splatTex.needsUpdate = true;
    this.heightTex = new THREE.DataTexture(world.height, N, N, THREE.RedFormat, THREE.FloatType);
    const floatLinear = engine.renderer.extensions.has('OES_texture_float_linear');
    this.heightTex.magFilter = this.heightTex.minFilter = floatLinear ? THREE.LinearFilter : THREE.NearestFilter;
    this.heightTex.needsUpdate = true;
    this.waterTex = new THREE.DataTexture(world.water, M, M, THREE.RedFormat, THREE.FloatType);
    this.waterTex.magFilter = this.waterTex.minFilter = THREE.NearestFilter;
    this.waterTex.needsUpdate = true;

    const tex = buildTerrainTextures();
    this.textures = tex;
    tex.albedo.anisotropy = engine.maxAniso;
    tex.normal.anisotropy = engine.maxAniso;

    this.uniforms = {
      tSplat: { value: this.splatTex },
      tAlbedo: { value: tex.albedo },
      tNormalArr: { value: tex.normal },
      uRough: { value: tex.rough },
      uHalf: { value: world.half },
      uSize: { value: world.size },
      tWaterLvl: { value: this.waterTex },
      uDitherDist: { value: 85 },
    };
    this.material = this.makeMaterial();
  }

  makeMaterial() {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 });
    patchMaterial(mat, {
      wet: true,
      uniforms: this.uniforms,
      vertex: {
        head: 'varying vec3 vTWorld;\nvarying vec3 vTNrm;',
        main: 'vTWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;\nvTNrm = normalize( mat3( modelMatrix ) * normal );',
      },
      fragment: {
        head: /* glsl */ `
          precision highp sampler2DArray;
          varying vec3 vTWorld;
          varying vec3 vTNrm;
          uniform sampler2D tSplat;
          uniform sampler2D tWaterLvl;
          uniform sampler2DArray tAlbedo;
          uniform sampler2DArray tNormalArr;
          uniform float uRough[18];
          uniform float uHalf;
          uniform float uSize;
          uniform float uDitherDist;
          ${GLSL_HASH}
          float tPick; float tRoughOut; vec3 tNrmWorld;
          vec3 tAlb;
          vec4 splatAt( vec2 xz ) {
            vec2 uv = ( xz + uHalf ) / uSize;
            return texture2D( tSplat, uv );
          }
          // projection uv (4 m tiles) for a world position + normal; returns layer-space uv and axis
          vec2 projUV( vec3 p, vec3 n, out int axis ) {
            vec3 an = abs( n );
            if ( an.y > 0.72 ) { axis = 1; return p.xz * 0.25; }
            if ( an.x > an.z ) { axis = 0; return vec2( p.z * sign( n.x ), -p.y ) * 0.25; }
            axis = 2; return vec2( -p.x * sign( n.z ), -p.y ) * 0.25;
          }
          void terrainSample() {
            vec3 wp = vTWorld;
            vec3 wn = normalize( vTNrm );
            float dist = distance( wp, cameraPosition );
            int axis;
            vec2 uv = projUV( wp, wn, axis );
            // organic jitter of the splat lookup, fades with distance
            float near = 1.0 - smoothstep( uDitherDist * 0.6, uDitherDist, dist );
            vec2 jit = ( vec2( vnoise( wp.xz * 0.9 ), vnoise( wp.xz * 0.9 + 31.7 ) ) - 0.5 ) * 2.6;
            jit += ( vec2( vnoise( wp.xz * 3.1 ), vnoise( wp.xz * 3.1 + 11.0 ) ) - 0.5 ) * 0.5;
            vec4 sp = splatAt( wp.xz + jit * mix( 0.35, 1.0, near ) );
            float id1 = floor( sp.r * 255.0 + 0.5 );
            float id2 = floor( sp.g * 255.0 + 0.5 );
            if ( axis != 1 ) {
              // dedicated cliff faces for side projections
              if ( id1 == 3.0 || id1 == 6.0 ) id1 = 16.0; else if ( id1 == 14.0 ) id1 = 17.0;
              if ( id2 == 3.0 ) id2 = 16.0; else if ( id2 == 14.0 ) id2 = 17.0;
            }
            float bl = sp.b;
            float sel = vnoise( wp.xz * 0.75 + 5.3 ) * 0.78 + vnoise( wp.xz * 4.3 + 3.0 ) * 0.22;
            vec3 c1 = texture( tAlbedo, vec3( uv, id1 ) ).rgb;
            vec3 c2 = texture( tAlbedo, vec3( uv, id2 ) ).rgb;
            // ragged but soft borders between ground types (sharper up close)
            float pickB = mix( bl, smoothstep( sel - 0.12, sel + 0.12, bl ), near );
            tAlb = mix( c1, c2, pickB );
            tPick = pickB > 0.5 ? id2 : id1;
            tRoughOut = mix( uRough[ int( id1 ) ], uRough[ int( id2 ) ], pickB );
            // normal map in the same projection
            vec3 nm1 = texture( tNormalArr, vec3( uv, id1 ) ).xyz * 2.0 - 1.0;
            vec3 nm2 = texture( tNormalArr, vec3( uv, id2 ) ).xyz * 2.0 - 1.0;
            vec3 nm = normalize( mix( nm1, nm2, pickB ) );
            nm.xy *= 0.9;
            vec3 T, B;
            if ( axis == 1 ) { T = vec3( 1.0, 0.0, 0.0 ); B = vec3( 0.0, 0.0, 1.0 ); }
            else if ( axis == 0 ) { T = vec3( 0.0, 0.0, sign( wn.x ) ); B = vec3( 0.0, -1.0, 0.0 ); }
            else { T = vec3( -sign( wn.z ), 0.0, 0.0 ); B = vec3( 0.0, -1.0, 0.0 ); }
            T = normalize( T - wn * dot( wn, T ) );
            B = normalize( B - wn * dot( wn, B ) - T * dot( T, B ) );
            tNrmWorld = normalize( T * nm.x + B * nm.y + wn * nm.z );
            // macro variation so tiles never look repetitive
            float m1 = vnoise( wp.xz * 0.018 ), m2 = vnoise( wp.xz * 0.07 + 17.0 );
            tAlb *= 0.9 + 0.17 * m1 + 0.06 * ( m2 - 0.5 );
            tAlb = mix( tAlb, tAlb * vec3( 1.06, 1.0, 0.86 ), smoothstep( 0.55, 0.9, m2 ) * 0.5 );
            // wet margin at water edges + caustics under water
            float wl = texture2D( tWaterLvl, ( wp.xz + uHalf ) / uSize ).r;
            float depth = wl - wp.y;
            if ( wl > -999.0 ) {
              float wet = 1.0 - smoothstep( -0.05, 0.55, -depth );
              tAlb *= 1.0 - 0.33 * wet;
              tRoughOut = mix( tRoughOut, 0.3, wet );
              if ( depth > 0.0 ) {
                vec2 q = floor( wp.xz * 12.0 ) / 12.0;
                float t = uTime * 0.8;
                float c = sin( q.x * 2.1 + sin( q.y * 1.7 + t ) * 1.3 + t ) + sin( q.y * 2.3 + sin( q.x * 1.9 - t * 1.1 ) * 1.2 - t * 0.7 );
                c = pow( clamp( 1.0 - abs( c ) * 0.9, 0.0, 1.0 ), 6.0 );
                float fade = exp( - depth * 0.35 ) * smoothstep( 0.0, 0.25, depth );
                tAlb += vec3( 0.55, 0.75, 0.7 ) * c * fade * 0.9;
                tAlb *= mix( vec3( 1.0 ), vec3( 0.55, 0.78, 0.8 ), smoothstep( 0.0, 3.0, depth ) );
              }
            }
          }
        `,
        map: 'terrainSample();\ndiffuseColor.rgb *= tAlb;',
      },
    });
    // hook normal + roughness after patch: append extra replacements
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = tRoughOut;')
        .replace('#include <normal_fragment_maps>', 'normal = normalize( ( viewMatrix * vec4( tNrmWorld, 0.0 ) ).xyz );');
    };
    return mat;
  }

  indexFor(lod) {
    if (this.indexCache[lod]) return this.indexCache[lod];
    const n = CHUNK / lod; // quads per side
    const vs = n + 1;
    const idx = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const a = j * vs + i, b = a + 1, c = a + vs, d = c + 1;
      // alternate diagonals for nicer shading
      if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
    }
    // skirts: ring of vertices after the grid, 4 edges
    const base = vs * vs;
    const ring = [];
    for (let i = 0; i < vs; i++) ring.push(i); // top edge (j=0)
    for (let j = 1; j < vs; j++) ring.push(j * vs + n); // right
    for (let i = n - 1; i >= 0; i--) ring.push(n * vs + i); // bottom
    for (let j = n - 1; j >= 1; j--) ring.push(j * vs); // left
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      const sa = base + k, sb = base + ((k + 1) % ring.length);
      idx.push(a, b, sb, a, sb, sa);
    }
    const attr = new THREE.Uint32BufferAttribute(idx, 1);
    this.indexCache[lod] = { attr, ring };
    return this.indexCache[lod];
  }

  buildGeometry(cx, cz, lod) {
    const n = CHUNK / lod, vs = n + 1;
    const { ring } = this.indexFor(lod);
    const total = vs * vs + ring.length;
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const x0 = -this.world.half + cx * CHUNK, z0 = -this.world.half + cz * CHUNK;
    const h = this.s.heightAt;
    const tmp = new THREE.Vector3();
    let minY = Infinity, maxY = -Infinity;
    for (let j = 0; j < vs; j++) for (let i = 0; i < vs; i++) {
      const x = x0 + i * lod, z = z0 + j * lod;
      const y = h(x, z);
      const k = (j * vs + i) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      this.s.normalAt(x, z, tmp);
      nrm[k] = tmp.x; nrm[k + 1] = tmp.y; nrm[k + 2] = tmp.z;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const skirt = 2 + lod * 1.5;
    for (let k = 0; k < ring.length; k++) {
      const src = ring[k] * 3, dst = (vs * vs + k) * 3;
      pos[dst] = pos[src]; pos[dst + 1] = pos[src + 1] - skirt; pos[dst + 2] = pos[src + 2];
      nrm[dst] = nrm[src]; nrm[dst + 1] = nrm[src + 1]; nrm[dst + 2] = nrm[src + 2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setIndex(this.indexFor(lod).attr);
    geo.boundingBox = new THREE.Box3(new THREE.Vector3(x0, minY - skirt, z0), new THREE.Vector3(x0 + CHUNK, maxY, z0 + CHUNK));
    geo.boundingSphere = geo.boundingBox.getBoundingSphere(new THREE.Sphere());
    return geo;
  }

  lodForDistance(d) {
    if (d < 110) return 0;
    if (d < 250) return 1;
    if (d < 480) return 2;
    if (d < 900) return 3;
    return 4;
  }

  update(camPos, force = false) {
    const nc = this.nChunks;
    const want = [];
    for (let cz = 0; cz < nc; cz++) for (let cx = 0; cx < nc; cx++) {
      const x0 = -this.world.half + cx * CHUNK, z0 = -this.world.half + cz * CHUNK;
      const dx = Math.max(x0 - camPos.x, 0, camPos.x - (x0 + CHUNK));
      const dz = Math.max(z0 - camPos.z, 0, camPos.z - (z0 + CHUNK));
      const d = Math.hypot(dx, dz, Math.max(0, Math.abs(camPos.y - 20) - 30) * 0.5);
      const lod = this.lodForDistance(d);
      const key = cz * nc + cx;
      const cur = this.chunks.get(key);
      if (!cur || cur.lod !== lod) want.push({ key, cx, cz, lod, d });
    }
    want.sort((a, b) => a.d - b.d);
    const budget = force ? want.length : 6;
    for (let i = 0; i < Math.min(budget, want.length); i++) {
      const w = want[i];
      const geo = this.buildGeometry(w.cx, w.cz, LODS[w.lod]);
      const cur = this.chunks.get(w.key);
      if (cur) {
        cur.mesh.geometry.dispose();
        cur.mesh.geometry = geo;
        cur.lod = w.lod;
      } else {
        const mesh = new THREE.Mesh(geo, this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.name = 'chunk';
        this.group.add(mesh);
        this.chunks.set(w.key, { mesh, lod: w.lod });
      }
    }
    return want.length;
  }
}
