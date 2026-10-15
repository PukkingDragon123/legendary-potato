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

// Worn, bare patches where the soil shows through the plants, and steep
// banks where it erodes. Shared with the ground cover so no grass grows on them.
export const GLSL_BARE = /* glsl */ `
float bareGround( vec2 xz, float slope ) {
  float worn = vnoise( xz * 0.055 + 11.0 ) * 0.55 + vnoise( xz * 0.19 + 4.0 ) * 0.3 + vnoise( xz * 0.7 + 1.7 ) * 0.15;
  return clamp( smoothstep( 0.6, 0.7, worn ) + smoothstep( 0.28, 0.55, slope ) * 0.85, 0.0, 1.0 );
}
`;
// ground types that are plant cover (grass, forest floor, moss, dry grass, needles)
export const VEGETATED = [1, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 0, 0];
// ground types that turn to mud along the water (beaches, rock and snow stay as they are)
export const MUDDY_BANK = [1, 1, 1, 0, 0, 1, 0, 0, 0, 1, 0.6, 1, 1, 0, 0, 1, 0, 0];
// sandstone bed colours (linear), muted toward one orange
const _lin = (h) => new THREE.Color(h);
const STRATA = [0xb9603f, 0xcf8352, 0xdca873, 0xc56f48, 0xa95a3e, 0xe2bb8a].map((h) => _lin(h).lerp(_lin(0xc47a4e), 0.35));

export class Terrain {
  // texData: ground textures already painted in a worker (optional)
  constructor(engine, world, sampler, texData = null) {
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

    const tex = buildTerrainTextures(texData);
    this.textures = tex;
    tex.albedo.anisotropy = engine.maxAniso;
    tex.normal.anisotropy = engine.maxAniso;

    tex.detail.anisotropy = engine.maxAniso;
    this.uniforms = {
      tSplat: { value: this.splatTex },
      tAlbedo: { value: tex.albedo },
      tNormalArr: { value: tex.normal },
      tDetail: { value: tex.detail },
      uDetailK: { value: tex.detailK },
      uVeg: { value: VEGETATED },
      uMudOK: { value: MUDDY_BANK },
      uStrata: { value: STRATA },
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
    const detail = this.engine.quality.groundDetail !== false;
    patchMaterial(mat, {
      wet: true,
      uniforms: this.uniforms,
      vertex: {
        head: 'varying vec3 vTWorld;\nvarying vec3 vTNrm;',
        main: 'vTWorld = ( modelMatrix * vec4( position, 1.0 ) ).xyz;\nvTNrm = normalize( mat3( modelMatrix ) * normal );',
      },
      fragment: {
        head: /* glsl */ `
          ${detail ? '#define GROUND_DETAIL' : ''}
          precision highp sampler2DArray;
          varying vec3 vTWorld;
          varying vec3 vTNrm;
          uniform sampler2D tSplat;
          uniform sampler2D tWaterLvl;
          uniform sampler2DArray tAlbedo;
          uniform sampler2DArray tNormalArr;
          uniform sampler2D tDetail;
          uniform vec2 uDetailK[18];
          uniform float uVeg[18];
          uniform float uMudOK[18];
          uniform vec3 uStrata[6];
          uniform float uRough[18];
          uniform float uHalf;
          uniform float uSize;
          uniform float uDitherDist;
          ${GLSL_HASH}
          ${GLSL_BARE}
          // badland sandstone beds from world height: always level, of varied
          // thickness, gently warped, each with a lit top edge and a dark underside
          vec3 strataAt( vec3 p ) {
            float y = p.y * 1.25 + vnoise( p.xz * 0.035 ) * 2.4 + vnoise( p.xz * 0.15 + 9.0 ) * 0.5;
            y += sin( y * 0.83 ) * 0.35;
            float L = floor( y ), f = fract( y );
            float h = hash21( vec2( L, 5.3 ) );
            vec3 c = uStrata[ int( h * 5.999 ) ];
            c *= 1.0 + 0.14 * smoothstep( 0.82, 1.0, f ) - 0.32 * smoothstep( 0.14, 0.0, f );
            return c;
          }
          float tPick; float tRoughOut; vec3 tNrmWorld;
          vec3 tAlb;
          vec4 splatAt( vec2 xz ) {
            vec2 uv = ( xz + uHalf ) / uSize;
            return texture2D( tSplat, uv );
          }
          float waterAt( vec2 xz ) { return texture2D( tWaterLvl, ( xz + uHalf ) / uSize ).r; }
          // projection uv (4 m tiles) for a world position + normal; returns layer-space uv and axis
          vec2 projUV( vec3 p, vec3 n, float topT, out int axis ) {
            vec3 an = abs( n );
            if ( an.y > topT ) { axis = 1; return p.xz * 0.25; }
            if ( an.x > an.z ) { axis = 0; return vec2( p.z * sign( n.x ), -p.y ) * 0.25; }
            axis = 2; return vec2( -p.x * sign( n.z ), -p.y ) * 0.25;
          }
          // one ground type: colour+roughness, with a rotated second lookup mixed in
          // patches so the 4 m tile never repeats visibly
          vec4 albedoAT( vec2 uv, vec2 uv2, float id, float mt, vec2 gx, vec2 gy, vec2 g2x, vec2 g2y ) {
            vec4 a = textureGrad( tAlbedo, vec3( uv, id ), gx, gy );
            #ifdef GROUND_DETAIL
              vec4 b = textureGrad( tAlbedo, vec3( uv2, id ), g2x, g2y );
              a = mix( a, b, mt );
            #endif
            return a;
          }
          void terrainSample() {
            vec3 wp = vTWorld;
            vec3 wn = normalize( vTNrm );
            float dist = distance( wp, cameraPosition );
            // organic jitter of the splat lookup, fades with distance
            float near = 1.0 - smoothstep( uDitherDist * 0.6, uDitherDist, dist );
            vec2 jit = ( vec2( vnoise( wp.xz * 0.9 ), vnoise( wp.xz * 0.9 + 31.7 ) ) - 0.5 ) * 2.6;
            jit += ( vec2( vnoise( wp.xz * 3.1 ), vnoise( wp.xz * 3.1 + 11.0 ) ) - 0.5 ) * 0.5;
            vec4 sp = splatAt( wp.xz + jit * mix( 0.35, 1.0, near ) );
            float id1 = floor( sp.r * 255.0 + 0.5 );
            float id2 = floor( sp.g * 255.0 + 0.5 );
            // dry or frozen ground never grows moss on its rock faces
            float dryRock = ( id1 == 8.0 || id1 == 13.0 || id1 == 7.0 || id1 == 14.0 || id1 == 6.0 || id1 == 4.0 ) ? 1.0 : 0.0;
            // layered sandstone keeps its strata level: side projection on any real slope
            int axis;
            vec2 uv = projUV( wp, wn, ( id1 == 8.0 || id2 == 8.0 ) ? 0.96 : 0.72, axis );
            // gradients from the continuous projection (lookups use them explicitly, so
            // the per-row shifts below and the branches never upset the mip level)
            vec2 gx = dFdx( uv ), gy = dFdy( uv );
            // rock faces: every 4 m row of the tile slides sideways by a random amount,
            // so joints and stains never line up into stripes down a whole cliff
            if ( axis != 1 ) uv.x += hash21( vec2( floor( uv.y ), 7.0 + float( axis ) ) ) * 0.73;
            mat2 rot2 = mat2( 0.8, -0.6, 0.6, 0.8 );
            vec2 uv2 = rot2 * uv * 0.73 + vec2( 0.37, 0.61 );
            vec2 g2x = rot2 * gx * 0.73, g2y = rot2 * gy * 0.73;
            float mt = smoothstep( 0.42, 0.58, vnoise( wp.xz * 0.045 + 3.7 ) * 0.75 + vnoise( wp.xz * 0.2 ) * 0.25 );
            if ( axis != 1 ) {
              // dedicated cliff faces for side projections
              if ( id1 == 3.0 || id1 == 6.0 ) id1 = 16.0; else if ( id1 == 14.0 ) id1 = 17.0;
              if ( id2 == 3.0 ) id2 = 16.0; else if ( id2 == 14.0 ) id2 = 17.0;
            }
            float bl = sp.b;
            float sel = vnoise( wp.xz * 0.75 + 5.3 ) * 0.78 + vnoise( wp.xz * 4.3 + 3.0 ) * 0.22;
            vec4 c1 = albedoAT( uv, uv2, id1, mt, gx, gy, g2x, g2y ), c2 = albedoAT( uv, uv2, id2, mt, gx, gy, g2x, g2y );
            vec3 bed = vec3( 1.0 );
            if ( id1 == 8.0 || id2 == 8.0 ) {
              // the painted sandstone is grain only; its colour comes from the beds
              bed = strataAt( wp ) / vec3( 0.552, 0.195, 0.076 );
              if ( id1 == 8.0 ) c1.rgb *= bed;
              if ( id2 == 8.0 ) c2.rgb *= bed;
            }
            vec4 n1 = textureGrad( tNormalArr, vec3( uv, id1 ), gx, gy ), n2 = textureGrad( tNormalArr, vec3( uv, id2 ), gx, gy );
            // height blend: the higher relief wins at the border (stones poke through
            // grass, soil fills the hollows), ragged and soft further away
            float pickB = mix( bl, smoothstep( sel - 0.12, sel + 0.12, bl ), near );
            float hb = clamp( ( n2.a - n1.a ) * 0.8 + ( pickB * 2.0 - 1.0 ) * 1.4 + 0.5, 0.0, 1.0 );
            hb = mix( pickB, smoothstep( 0.3, 0.7, hb ), near );
            vec4 cc = mix( c1, c2, hb );
            vec4 nn = mix( n1, n2, hb );
            float vegW = mix( uVeg[ int( id1 ) ], uVeg[ int( id2 ) ], hb );
            vec2 dK = mix( uDetailK[ int( id1 ) ], uDetailK[ int( id2 ) ], hb );
            float rgh = mix( uRough[ int( id1 ) ], uRough[ int( id2 ) ], hb );
            tPick = hb > 0.5 ? id2 : id1;
            // bare soil through the plant cover, and mud along the water
            float wl = waterAt( wp.xz );
            float wlN = wl;
            #ifdef GROUND_DETAIL
              wlN = max( max( waterAt( wp.xz + vec2( 3.0, 0.0 ) ), waterAt( wp.xz - vec2( 3.0, 0.0 ) ) ), max( waterAt( wp.xz + vec2( 0.0, 3.0 ) ), waterAt( wp.xz - vec2( 0.0, 3.0 ) ) ) );
              wlN = max( wlN, wl );
            #endif
            float bank = wlN > -999.0 ? 1.0 - smoothstep( 0.25, 0.95, wp.y - wlN ) : 0.0;
            bank *= mix( uMudOK[ int( id1 ) ], uMudOK[ int( id2 ) ], hb );
            float ov = max( bareGround( wp.xz, 1.0 - wn.y ) * vegW, bank * 0.95 );
            // far away, big rock faces get a second, much larger lookup so the
            // tile's strata and joints stop repeating across a whole mountain
            float farK = smoothstep( 60.0, 220.0, dist );
            if ( axis != 1 && farK > 0.0 ) {
              vec2 uvF = uv * 0.21 + vec2( 0.13, 0.71 );
              uvF.x += hash21( vec2( floor( uvF.y ), 3.0 + float( axis ) ) ) * 0.61;
              vec4 cF = mix( textureGrad( tAlbedo, vec3( uvF, id1 ), gx * 0.21, gy * 0.21 ), textureGrad( tAlbedo, vec3( uvF, id2 ), gx * 0.21, gy * 0.21 ), hb );
              float sandW = mix( id1 == 8.0 ? 1.0 : 0.0, id2 == 8.0 ? 1.0 : 0.0, hb );
              cF.rgb *= mix( vec3( 1.0 ), bed, sandW );
              cc = mix( cc, cF, farK * 0.6 );
            }
            if ( axis == 1 && ov > 0.002 ) {
              float idO = bank > 0.35 ? 5.0 : 2.0;
              vec4 c3 = textureGrad( tAlbedo, vec3( uv, idO ), gx, gy );
              #ifdef GROUND_DETAIL
                c3 = mix( c3, textureGrad( tAlbedo, vec3( uv2, idO ), g2x, g2y ), mt );
              #endif
              vec4 n3 = textureGrad( tNormalArr, vec3( uv, idO ), gx, gy );
              float ob = clamp( ( n3.a - nn.a ) * 0.8 + ( ov * 2.0 - 1.0 ) * 1.4 + 0.5, 0.0, 1.0 );
              ob = smoothstep( 0.3, 0.7, ob );
              cc = mix( cc, c3, ob ); nn = mix( nn, n3, ob );
              dK = mix( dK, uDetailK[ int( idO ) ], ob );
              rgh = mix( rgh, uRough[ int( idO ) ], ob );
              vegW *= 1.0 - ob;
              if ( ob > 0.5 ) tPick = idO;
            }
            tAlb = cc.rgb;
            tRoughOut = cc.a * rgh;
            if ( axis != 1 ) {
              // big rock faces: dark water stains streaking down, paler ledge bands,
              // moss and grass wherever the face leans back
              vec2 fw = vec2( axis == 0 ? wp.z : wp.x, wp.y );
              float streak = vnoise( vec2( fw.x * 0.11, fw.y * 0.012 ) ) * 0.6 + vnoise( vec2( fw.x * 0.37, fw.y * 0.03 + 5.0 ) ) * 0.4;
              tAlb *= mix( 1.0, 0.7, smoothstep( 0.55, 0.85, streak ) );
              float ledge = smoothstep( 0.78, 0.96, sin( fw.y * 0.55 + vnoise( fw * 0.05 ) * 5.0 ) * 0.5 + 0.5 );
              tAlb *= 1.0 + ledge * 0.12;
              float lean = smoothstep( 0.3, 0.62, wn.y ) * smoothstep( 0.35, 0.6, vnoise( fw * 0.21 + 3.0 ) + ledge * 0.3 ) * ( 1.0 - dryRock );
              if ( lean > 0.01 ) {
                vec3 moss = textureGrad( tAlbedo, vec3( uv, 9.0 ), gx, gy ).rgb;
                tAlb = mix( tAlb, moss * 0.85, lean * 0.85 );
                tRoughOut = mix( tRoughOut, 0.9, lean );
              }
            }
            // relief: hollows a little darker
            tAlb *= mix( 0.8, 1.04, smoothstep( 0.05, 0.6, nn.a ) );
            vec3 nm = nn.xyz * 2.0 - 1.0;
            #ifdef GROUND_DETAIL
              // close-up grit and fibres from the shared 1 m tile
              float dFade = 1.0 - smoothstep( 10.0, 32.0, dist );
              if ( dFade > 0.0 ) {
                vec4 dt = textureGrad( tDetail, uv * 4.0, gx * 4.0, gy * 4.0 );
                nm.xy += ( ( dt.rg * 2.0 - 1.0 ) * dK.x + ( dt.ba * 2.0 - 1.0 ) * dK.y ) * dFade * 0.9;
              }
            #endif
            // far ground keeps its colour but drops most of its fine relief (no shimmer)
            nm.xy *= 1.0 - smoothstep( 120.0, 420.0, dist ) * 0.7;
            nm = normalize( nm );
            vec3 T, B;
            if ( axis == 1 ) { T = vec3( 1.0, 0.0, 0.0 ); B = vec3( 0.0, 0.0, 1.0 ); }
            else if ( axis == 0 ) { T = vec3( 0.0, 0.0, sign( wn.x ) ); B = vec3( 0.0, -1.0, 0.0 ); }
            else { T = vec3( -sign( wn.z ), 0.0, 0.0 ); B = vec3( 0.0, -1.0, 0.0 ); }
            T = normalize( T - wn * dot( wn, T ) );
            B = normalize( B - wn * dot( wn, B ) - T * dot( T, B ) );
            tNrmWorld = normalize( T * nm.x + B * nm.y + wn * nm.z );
            // macro variation so tiles never look repetitive
            float m1 = vnoise( wp.xz * 0.018 ), m2 = vnoise( wp.xz * 0.07 + 17.0 ), m3 = vnoise( wp.xz * 0.011 + 7.0 );
            tAlb *= 0.9 + 0.17 * m1 + 0.06 * ( m2 - 0.5 );
            tAlb = mix( tAlb, tAlb * vec3( 1.06, 1.0, 0.86 ), smoothstep( 0.55, 0.9, m2 ) * 0.5 );
            // meadows drift between sun-yellowed and deep cool green
            tAlb = mix( tAlb, tAlb * vec3( 1.14, 1.04, 0.72 ), smoothstep( 0.58, 0.85, m3 ) * vegW * 0.55 );
            tAlb = mix( tAlb, tAlb * vec3( 0.84, 0.96, 0.92 ), smoothstep( 0.42, 0.15, m3 ) * vegW * 0.45 );
            // wet margin at water edges + caustics under water
            float depth = wl - wp.y;
            if ( wlN > -999.0 ) {
              float wet = max( 1.0 - smoothstep( -0.05, 0.55, -depth ), bank * 0.45 );
              tAlb *= 1.0 - 0.3 * wet;
              tRoughOut = mix( tRoughOut, max( tRoughOut * 0.55, 0.18 ), wet );
            }
            if ( wl > -999.0 && depth > 0.0 ) {
              vec2 q = floor( wp.xz * 12.0 ) / 12.0;
              float t = uTime * 0.8;
              float c = sin( q.x * 2.1 + sin( q.y * 1.7 + t ) * 1.3 + t ) + sin( q.y * 2.3 + sin( q.x * 1.9 - t * 1.1 ) * 1.2 - t * 0.7 );
              c = pow( clamp( 1.0 - abs( c ) * 0.9, 0.0, 1.0 ), 6.0 );
              float fade = exp( - depth * 0.35 ) * smoothstep( 0.0, 0.25, depth );
              tAlb += vec3( 0.55, 0.75, 0.7 ) * c * fade * 0.9;
              tAlb *= mix( vec3( 1.0 ), vec3( 0.55, 0.78, 0.8 ), smoothstep( 0.0, 3.0, depth ) );
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
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp( tRoughOut, 0.1, 1.0 );')
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
