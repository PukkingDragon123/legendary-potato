// Shared shader plumbing: global uniforms (time, wind, sun, fog, wetness,
// grass pushers) and a material patcher that injects atmospheric height fog,
// wind sway and leaf translucency into the stock three.js materials so
// everything still gets real lights + cascaded shadows.
import * as THREE from 'three';

export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
  uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
  uFogSunColor: { value: new THREE.Color(1, 0.85, 0.6) },
  uFogHeight: { value: 4 },
  uFogFalloff: { value: 0.06 },
  uFogHeightDensity: { value: 0.006 },
  uWind: { value: new THREE.Vector3(1, 0.35, 0.3) }, // x,z = direction*strength, y = gust
  uWetness: { value: 0 },
  uPushers: { value: Array.from({ length: 8 }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uNight: { value: 0 },
  uSnowLine: { value: 175 },
};

// ---------------------------------------------------------------- global fog override
THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
#endif
`;
THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vec4 fogWP = vec4( transformed, 1.0 );
  #ifdef USE_BATCHING
    fogWP = batchingMatrix * fogWP;
  #endif
  #ifdef USE_INSTANCING
    fogWP = instanceMatrix * fogWP;
  #endif
  vFogWorldPos = ( modelMatrix * fogWP ).xyz;
#endif
`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorldPos;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  uniform vec3 uFogSunColor;
  uniform vec3 uSunDir;
  uniform float uFogHeight;
  uniform float uFogFalloff;
  uniform float uFogHeightDensity;
  vec3 applyAtmosphere( vec3 col, vec3 worldPos ) {
    vec3 ray = worldPos - cameraPosition;
    float dist = length( ray );
    vec3 dir = ray / max( dist, 1e-4 );
    #ifdef FOG_EXP2
      float d = fogDensity * dist;
      float distFog = 1.0 - exp( - d * d );
    #else
      float distFog = smoothstep( fogNear, fogFar, dist );
    #endif
    // analytic exponential height fog: thick in valleys, thin on peaks
    float camH = cameraPosition.y - uFogHeight;
    float k = uFogFalloff;
    float base = uFogHeightDensity * exp( - k * camH );
    float dy = ray.y * k;
    float integ = abs( dy ) > 1e-3 ? ( 1.0 - exp( - dy ) ) / dy : 1.0;
    float heightFog = 1.0 - exp( - base * dist * integ );
    float f = clamp( 1.0 - ( 1.0 - distFog ) * ( 1.0 - heightFog ), 0.0, 1.0 );
    float sunAmt = pow( max( dot( dir, uSunDir ), 0.0 ), 6.0 );
    vec3 fc = mix( fogColor, uFogSunColor, sunAmt * 0.85 );
    return mix( col, fc, f );
  }
#endif
`;
THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  gl_FragColor.rgb = applyAtmosphere( gl_FragColor.rgb, vFogWorldPos );
#endif
`;

// ---------------------------------------------------------------- wind
// Returns a world-space offset. weight is 0 at the root, 1 at the tip.
const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec3 uWind;
uniform vec4 uPushers[8];
vec3 windOffset( vec3 wp, float weight, float amp, float flutter ) {
  vec2 dir = uWind.xz;
  float strength = length( dir );
  dir = strength > 0.0 ? dir / strength : vec2( 1.0, 0.0 );
  float phase = dot( wp.xz, vec2( 0.071, 0.053 ) );
  float sway = sin( uTime * 1.3 + phase ) * 0.6 + sin( uTime * 2.7 + phase * 1.7 ) * 0.3;
  float gust = ( sin( uTime * 0.37 + wp.x * 0.012 ) * 0.5 + 0.5 ) * uWind.y;
  float bend = ( sway * 0.5 + 0.55 + gust ) * strength * weight * amp;
  vec3 off = vec3( dir.x * bend, 0.0, dir.y * bend );
  // small chaotic flutter for leaves
  off += flutter * weight * strength * vec3(
    sin( uTime * 7.1 + wp.y * 3.0 + wp.x * 2.1 ),
    sin( uTime * 6.3 + wp.x * 2.7 ) * 0.5,
    sin( uTime * 7.9 + wp.z * 2.3 ) );
  off.y -= length( off.xz ) * 0.25 * weight;
  return off;
}
vec3 pusherOffset( vec3 wp, float weight ) {
  vec3 o = vec3( 0.0 );
  for ( int i = 0; i < 8; i++ ) {
    vec4 p = uPushers[ i ];
    vec2 d = wp.xz - p.xz;
    float dist = length( d );
    float r = p.w;
    if ( r <= 0.0 || abs( wp.y - p.y ) > 2.5 ) continue;
    float f = clamp( 1.0 - dist / r, 0.0, 1.0 );
    o.xz += ( d / max( dist, 1e-3 ) ) * f * r * 0.6 * weight;
    o.y -= f * 0.35 * weight;
  }
  return o;
}
`;

// ---------------------------------------------------------------- patcher
let _patchId = 0;
// Materials patched the same way share one shader program (colours, textures
// and uniform values differ per material, the GLSL does not). The key is the
// material type plus the patch options.
const _shared = new Map();
function sharedKey(opts, type) {
  let s;
  try {
    s = JSON.stringify(opts, (k, v) => {
      if (k === 'uniforms' && v) return Object.keys(v).sort().join(',');
      if (typeof v === 'function') return 'fn:' + String(v);
      if (v && typeof v === 'object' && (v.isTexture || v.isColor || v.isVector2 || v.isVector3 || v.isVector4 || v.isMatrix3 || v.isMatrix4)) return '#';
      return v;
    });
  } catch { return null; }
  const full = type + '|' + s;
  if (!_shared.has(full)) _shared.set(full, 'pms' + _shared.size);
  return _shared.get(full);
}

/**
 * Patch a stock material.
 * opts.wind: { amp (metres of sway at weight 1), flutter, push }
 *   - per-vertex weight comes from the 'aWind' attribute (0 root .. 1 tip)
 * opts.translucency: amount of fake back-lit subsurface glow (leaves, grass, ears)
 * opts.wet: respond to global wetness (darker, glossier)
 * opts.vertex/fragment: { head, main, post } raw snippets
 */
export function patchMaterial(mat, opts = {}) {
  const key = `pm${_patchId++}`;
  const prev = mat.onBeforeCompile;
  // a material that already had its own hook keeps a private program
  const ownHook = typeof prev === 'function' && prev !== THREE.Material.prototype.onBeforeCompile;
  mat.userData.patchOpts = opts;
  const patched = (shader, renderer) => {
    if (prev) prev(shader, renderer);
    shader.uniforms.uTime = G.uTime;
    shader.uniforms.uWind = G.uWind;
    shader.uniforms.uPushers = G.uPushers;
    shader.uniforms.uSunDir = G.uSunDir;
    shader.uniforms.uSunColor = G.uSunColor;
    shader.uniforms.uFogSunColor = G.uFogSunColor;
    shader.uniforms.uFogHeight = G.uFogHeight;
    shader.uniforms.uFogFalloff = G.uFogFalloff;
    shader.uniforms.uFogHeightDensity = G.uFogHeightDensity;
    shader.uniforms.uWetness = G.uWetness;
    shader.uniforms.uNight = G.uNight;
    if (opts.uniforms) Object.assign(shader.uniforms, opts.uniforms);

    let vs = shader.vertexShader;
    let fs = shader.fragmentShader;

    const w = opts.wind;
    let vhead = WIND_GLSL + '\nuniform vec3 uSunDir;\n' + (opts.vertex?.head ?? '');
    if (w) vhead += '\nattribute float aWind;\n';
    vs = vs.replace('#include <common>', '#include <common>\n' + vhead);

    let vmain = opts.vertex?.main ?? '';
    if (w) {
      const stiff = (w.amp ?? 0.3).toFixed(3);
      const flutter = (w.flutter ?? 0).toFixed(3);
      const push = w.push ? 'true' : 'false';
      vmain += /* glsl */ `
      {
        vec4 wlocal = vec4( transformed, 1.0 );
        mat3 im = mat3( 1.0 );
        #ifdef USE_INSTANCING
          wlocal = instanceMatrix * wlocal;
          im = mat3( instanceMatrix );
        #endif
        vec3 wpos = ( modelMatrix * wlocal ).xyz;
        float ww = aWind;
        vec3 off = windOffset( wpos, ww, ${stiff}, ${flutter} );
        if ( ${push} ) off += pusherOffset( wpos, ww );
        mat3 mm = mat3( modelMatrix ) * im;
        float s2 = dot( mm[ 0 ], mm[ 0 ] );
        transformed += transpose( mm ) * off / max( s2, 1e-6 );
      }`;
    }
    vs = vs.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + vmain);
    if (opts.vertex?.post) vs = vs.replace('#include <fog_vertex>', '#include <fog_vertex>\n' + opts.vertex.post);

    // fragment
    const fhead = '\nuniform float uTime;\nuniform vec3 uSunColor;\nuniform float uWetness;\nuniform float uNight;\n#ifndef USE_FOG\nuniform vec3 uSunDir;\n#endif\n' + (opts.fragment?.head ?? '');
    fs = fs.replace('#include <common>', '#include <common>\n' + fhead);
    if (opts.fragment?.map) fs = fs.replace('#include <map_fragment>', opts.fragment.map);
    if (opts.fragment?.main) fs = fs.replace('#include <color_fragment>', '#include <color_fragment>\n' + opts.fragment.main);
    if (opts.wet) {
      fs = fs.replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix( roughnessFactor, roughnessFactor * 0.35, uWetness );`);
      fs = fs.replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 1.0 - 0.28 * uWetness;`);
    }
    if (opts.translucency) {
      const t = opts.translucency.toFixed(3);
      fs = fs.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
        {
          vec3 vdir = normalize( vViewPosition );
          vec3 sunView = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
          float back = pow( max( dot( vdir, sunView ), 0.0 ), 3.0 );
          float wrap = max( 0.0, dot( -normal, sunView ) ) * 0.35;
          reflectedLight.indirectDiffuse += diffuseColor.rgb * uSunColor * ( back * 0.9 + wrap ) * ${t} * ( 1.0 - uNight );
        }`);
    }
    if (opts.fragment?.post) fs = fs.replace('#include <fog_fragment>', opts.fragment.post + '\n#include <fog_fragment>');
    if (opts.fragment?.emissive) fs = fs.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + opts.fragment.emissive);
    shader.vertexShader = vs;
    shader.fragmentShader = fs;
    mat.userData.shader = shader;
  };
  mat.onBeforeCompile = patched;
  let ck = null;
  mat.customProgramCacheKey = () => {
    if (ck === null) {
      // hooks wrapped on top after patching (terrain, water, ground cover) can depend on
      // closure values we cannot see, so those keep a private program
      ck = (!ownHook && mat.onBeforeCompile === patched && sharedKey(opts, mat.type)) || key;
    }
    return ck;
  };
  return mat;
}

// Compute per-vertex wind weight from height for a geometry (tip moves, root fixed).
export function addWindWeights(geo, opt = {}) {
  const { minY = 0, maxY = null, power = 2, base = 0 } = opt;
  const pos = geo.attributes.position;
  let top = maxY;
  if (top === null) {
    top = -Infinity;
    for (let i = 0; i < pos.count; i++) top = Math.max(top, pos.getY(i));
  }
  const arr = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, (pos.getY(i) - minY) / Math.max(1e-4, top - minY));
    arr[i] = base + Math.pow(t, power) * (1 - base);
  }
  geo.setAttribute('aWind', new THREE.BufferAttribute(arr, 1));
  return geo;
}

export function setConstAttr(geo, name, value, size = 1) {
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * size);
  for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) arr[i * size + k] = Array.isArray(value) ? value[k] : value;
  geo.setAttribute(name, new THREE.BufferAttribute(arr, size));
  return geo;
}
