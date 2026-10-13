// Renderer, cascaded sun shadows and a hand-rolled HDR post pipeline:
// MSAA HDR scene -> depth-only SAO (half res) -> bloom mip chain -> god rays
// from the sky mask -> composite (AO, bloom, rays, tone map, grading, vignette,
// grain, underwater + damage tints) straight to the canvas.
import * as THREE from 'three';
import { SunLight } from 'three/addons/lights/SunLight.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { G, patchMaterial } from '../gfx/shaderlib.js';

export const QUALITY = {
  low: { label: 'Low', pixelRatio: 0.75, shadowSize: 1024, shadowFar: 80, msaa: 0, ao: false, bloom: true, rays: false, grass: 0.35, drawDist: 420, treeDist: 300 },
  medium: { label: 'Medium', pixelRatio: 1, shadowSize: 1536, shadowFar: 120, msaa: 2, ao: false, bloom: true, rays: true, grass: 0.6, drawDist: 560, treeDist: 420 },
  high: { label: 'High', pixelRatio: 1, shadowSize: 2048, shadowFar: 170, msaa: 4, ao: true, bloom: true, rays: true, grass: 1, drawDist: 760, treeDist: 560 },
  ultra: { label: 'Ultra', pixelRatio: 2, shadowSize: 3072, shadowFar: 230, msaa: 4, ao: true, bloom: true, rays: true, grass: 1.5, drawDist: 1000, treeDist: 720 },
};

const DEPTH_HELPERS = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform vec4 uProj; // P00, P11, P20, P21 (for off-center safety)
bool isSky( float d ) {
  #ifdef USE_REVERSED_DEPTH_BUFFER
    return d <= 0.0000001;
  #else
    return d >= 0.9999999;
  #endif
}
float readViewZ( vec2 uv ) {
  float d = texture2D( tDepth, uv ).x;
  return perspectiveDepthToViewZ( d, cameraNear, cameraFar );
}
vec3 viewPosAt( vec2 uv ) {
  float vz = readViewZ( uv );
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3( ( ndc + uProj.zw ) * ( - vz ) / uProj.xy, vz );
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

const AO_FRAG = /* glsl */ `
${DEPTH_HELPERS}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uRadius;
uniform float uIntensity;
uniform float uBias;
uniform float uTime;
#define SAMPLES 12
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
void main() {
  float d = texture2D( tDepth, vUv ).x;
  if ( isSky( d ) ) { gl_FragColor = vec4( 1.0 ); return; }
  vec3 P = viewPosAt( vUv );
  vec2 px = 1.0 / uRes;
  vec3 Px = viewPosAt( vUv + vec2( px.x, 0.0 ) );
  vec3 Py = viewPosAt( vUv + vec2( 0.0, px.y ) );
  vec3 Pmx = viewPosAt( vUv - vec2( px.x, 0.0 ) );
  vec3 Pmy = viewPosAt( vUv - vec2( 0.0, px.y ) );
  vec3 dx = abs( Px.z - P.z ) < abs( Pmx.z - P.z ) ? Px - P : P - Pmx;
  vec3 dy = abs( Py.z - P.z ) < abs( Pmy.z - P.z ) ? Py - P : P - Pmy;
  vec3 N = normalize( cross( dx, dy ) );
  float screenR = uRadius * uProj.x * 0.5 * uRes.x / max( - P.z, 0.1 );
  screenR = min( screenR, 90.0 );
  float noise = hash12( gl_FragCoord.xy + fract( uTime ) * 17.0 ) * 6.2831;
  float occ = 0.0;
  float r2 = uRadius * uRadius;
  for ( int i = 0; i < SAMPLES; i++ ) {
    float fi = float( i );
    float rr = ( fi + 0.5 ) / float( SAMPLES );
    float ang = fi * 2.39996 + noise;
    vec2 off = vec2( cos( ang ), sin( ang ) ) * rr * screenR * px;
    vec3 S = viewPosAt( vUv + off );
    vec3 v = S - P;
    float vv = dot( v, v );
    float vn = dot( v, N );
    float f = max( r2 - vv, 0.0 ) / r2;
    occ += f * max( ( vn - uBias * - P.z * 0.02 ) / ( vv + 0.01 ), 0.0 );
  }
  occ = occ * uIntensity / float( SAMPLES );
  float ao = clamp( 1.0 - occ, 0.0, 1.0 );
  gl_FragColor = vec4( ao, ao, ao, 1.0 );
}
`;

const BLUR_FRAG = /* glsl */ `
${DEPTH_HELPERS}
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uDir;
void main() {
  float z0 = readViewZ( vUv );
  float sum = 0.0, wsum = 0.0;
  for ( int i = -3; i <= 3; i++ ) {
    vec2 uv = vUv + uDir * float( i );
    float z = readViewZ( uv );
    float w = exp( - float( i * i ) / 8.0 ) * ( 1.0 / ( 0.002 + abs( z - z0 ) / max( - z0, 0.5 ) ) );
    sum += texture2D( tInput, uv ).r * w;
    wsum += w;
  }
  float v = sum / wsum;
  gl_FragColor = vec4( v, v, v, 1.0 );
}
`;

const BRIGHT_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tInput;
uniform float uThreshold;
uniform vec2 uTexel;
void main() {
  // 4-tap box downsample while thresholding (soft knee)
  vec3 c = texture2D( tInput, vUv + uTexel * vec2( -0.5, -0.5 ) ).rgb;
  c += texture2D( tInput, vUv + uTexel * vec2( 0.5, -0.5 ) ).rgb;
  c += texture2D( tInput, vUv + uTexel * vec2( -0.5, 0.5 ) ).rgb;
  c += texture2D( tInput, vUv + uTexel * vec2( 0.5, 0.5 ) ).rgb;
  c *= 0.25;
  float br = max( c.r, max( c.g, c.b ) );
  float knee = uThreshold * 0.5;
  float soft = clamp( br - uThreshold + knee, 0.0, 2.0 * knee );
  soft = soft * soft / ( 4.0 * knee + 1e-4 );
  float contrib = max( soft, br - uThreshold ) / max( br, 1e-4 );
  gl_FragColor = vec4( min( c * contrib, vec3( 40.0 ) ), 1.0 );
}
`;

const DOWN_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uTexel;
void main() {
  vec3 a = texture2D( tInput, vUv + uTexel * vec2( -2.0, -2.0 ) ).rgb;
  vec3 b = texture2D( tInput, vUv + uTexel * vec2( 0.0, -2.0 ) ).rgb;
  vec3 c = texture2D( tInput, vUv + uTexel * vec2( 2.0, -2.0 ) ).rgb;
  vec3 d = texture2D( tInput, vUv + uTexel * vec2( -2.0, 0.0 ) ).rgb;
  vec3 e = texture2D( tInput, vUv ).rgb;
  vec3 f = texture2D( tInput, vUv + uTexel * vec2( 2.0, 0.0 ) ).rgb;
  vec3 g = texture2D( tInput, vUv + uTexel * vec2( -2.0, 2.0 ) ).rgb;
  vec3 h = texture2D( tInput, vUv + uTexel * vec2( 0.0, 2.0 ) ).rgb;
  vec3 i = texture2D( tInput, vUv + uTexel * vec2( 2.0, 2.0 ) ).rgb;
  vec3 j = texture2D( tInput, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb;
  vec3 k = texture2D( tInput, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb;
  vec3 l = texture2D( tInput, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb;
  vec3 m = texture2D( tInput, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
  vec3 o = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;
  gl_FragColor = vec4( o, 1.0 );
}
`;

const UP_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tInput;
uniform sampler2D tBase;
uniform vec2 uTexel;
uniform float uMix;
void main() {
  vec3 s = texture2D( tInput, vUv + uTexel * vec2( -1.0, -1.0 ) ).rgb;
  s += texture2D( tInput, vUv + uTexel * vec2( 0.0, -1.0 ) ).rgb * 2.0;
  s += texture2D( tInput, vUv + uTexel * vec2( 1.0, -1.0 ) ).rgb;
  s += texture2D( tInput, vUv + uTexel * vec2( -1.0, 0.0 ) ).rgb * 2.0;
  s += texture2D( tInput, vUv ).rgb * 4.0;
  s += texture2D( tInput, vUv + uTexel * vec2( 1.0, 0.0 ) ).rgb * 2.0;
  s += texture2D( tInput, vUv + uTexel * vec2( -1.0, 1.0 ) ).rgb;
  s += texture2D( tInput, vUv + uTexel * vec2( 0.0, 1.0 ) ).rgb * 2.0;
  s += texture2D( tInput, vUv + uTexel * vec2( 1.0, 1.0 ) ).rgb;
  s /= 16.0;
  gl_FragColor = vec4( texture2D( tBase, vUv ).rgb + s * uMix, 1.0 );
}
`;

const RAYS_FRAG = /* glsl */ `
${DEPTH_HELPERS}
varying vec2 vUv;
uniform sampler2D tColor;
uniform vec2 uSunUv;
uniform float uAspect;
uniform float uDensity;
uniform float uDecay;
uniform float uTime;
#define RAY_SAMPLES 40
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
float mask( vec2 uv ) {
  if ( uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0 ) return 0.0;
  float d = texture2D( tDepth, uv ).x;
  if ( !isSky( d ) ) return 0.0;
  vec2 dd = ( uv - uSunUv ) * vec2( uAspect, 1.0 );
  float near = 1.0 - smoothstep( 0.0, 0.65, length( dd ) );
  float lum = dot( texture2D( tColor, uv ).rgb, vec3( 0.3, 0.59, 0.11 ) );
  return near * near * min( lum, 4.0 );
}
void main() {
  vec2 delta = ( vUv - uSunUv ) * ( uDensity / float( RAY_SAMPLES ) );
  vec2 uv = vUv - delta * hash12( gl_FragCoord.xy + uTime * 13.0 );
  float illum = 0.0, decay = 1.0;
  for ( int i = 0; i < RAY_SAMPLES; i++ ) {
    illum += mask( uv ) * decay;
    decay *= uDecay;
    uv -= delta;
  }
  illum /= float( RAY_SAMPLES );
  gl_FragColor = vec4( vec3( illum ), 1.0 );
}
`;

const COMPOSITE_FRAG = /* glsl */ `
varying vec2 vUv;
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform sampler2D tBloom;
uniform sampler2D tRays;
uniform float uAO;
uniform float uBloom;
uniform float uRays;
uniform vec3 uRayColor;
uniform float uExposure;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform float uGrain;
uniform float uTime;
uniform float uUnderwater;
uniform float uDamage;
uniform float uDesat;
uniform float uBlur;
uniform float uFade;
uniform vec3 uFadeColor;
uniform vec2 uRes;
float hash12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
vec3 tonemap( vec3 c ) {
  // Khronos PBR neutral-ish shoulder, keeps hues rich for stylized art
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min( c.r, min( c.g, c.b ) );
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  c -= offset;
  float peak = max( c.r, max( c.g, c.b ) );
  if ( peak < startCompression ) return c;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / ( peak + d - startCompression );
  c *= newPeak / peak;
  float g = 1.0 - 1.0 / ( desaturation * ( peak - newPeak ) + 1.0 );
  return mix( c, newPeak * vec3( 1.0 ), g );
}
void main() {
  vec2 uv = vUv;
  if ( uUnderwater > 0.0 ) {
    uv += vec2( sin( uv.y * 30.0 + uTime * 2.0 ), cos( uv.x * 24.0 + uTime * 1.7 ) ) * 0.0025 * uUnderwater;
  }
  vec3 col = texture2D( tColor, uv ).rgb;
  if ( uBlur > 0.0 ) {
    vec2 px = uBlur * 3.0 / uRes;
    col = ( col + texture2D( tColor, uv + px ).rgb + texture2D( tColor, uv - px ).rgb + texture2D( tColor, uv + vec2( px.x, -px.y ) ).rgb + texture2D( tColor, uv + vec2( -px.x, px.y ) ).rgb ) / 5.0;
  }
  float ao = texture2D( tAO, uv ).r;
  col *= mix( 1.0, ao, uAO );
  col += texture2D( tBloom, uv ).rgb * uBloom;
  col += texture2D( tRays, uv ).r * uRayColor * uRays;
  col *= uExposure;
  if ( uUnderwater > 0.0 ) {
    col = mix( col, col * vec3( 0.25, 0.75, 0.85 ) + vec3( 0.0, 0.06, 0.09 ), uUnderwater );
  }
  col = tonemap( col );
  // grading in display-ish space
  col = max( col, 0.0 );
  col = col * uGain + uLift * ( 1.0 - col );
  float l = dot( col, vec3( 0.2126, 0.7152, 0.0722 ) );
  col = mix( vec3( l ), col, uSaturation * ( 1.0 - uDesat ) );
  col = ( col - 0.5 ) * uContrast + 0.5;
  // split toning: cool shadows, warm highlights
  col += ( vec3( -0.012, 0.0, 0.02 ) * ( 1.0 - l ) + vec3( 0.02, 0.008, -0.015 ) * l );
  vec2 vc = vUv - 0.5;
  float vig = 1.0 - dot( vc, vc ) * uVignette;
  col *= vig;
  if ( uDamage > 0.0 ) {
    float edge = smoothstep( 0.15, 0.75, length( vc ) * 1.4 );
    col = mix( col, vec3( 0.55, 0.03, 0.02 ), edge * uDamage * 0.8 );
  }
  col += ( hash12( gl_FragCoord.xy + fract( uTime * 7.13 ) * 100.0 ) - 0.5 ) * uGrain;
  col = mix( col, uFadeColor, uFade );
  gl_FragColor = vec4( clamp( col, 0.0, 1.0 ), 1.0 );
  #include <colorspace_fragment>
}
`;

function makeRT(w, h, opt = {}) {
  const o = {
    type: opt.type ?? THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: opt.depth ?? false,
    samples: opt.samples ?? 0,
    generateMipmaps: false,
  };
  if (opt.depthTexture) o.depthTexture = opt.depthTexture;
  return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), o);
}

class Post {
  constructor(renderer, quality) {
    this.r = renderer;
    this.q = quality;
    const sm = (frag, uniforms, defines = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, defines, depthTest: false, depthWrite: false });
    this.depthUniforms = () => ({
      tDepth: { value: null }, cameraNear: { value: 0.1 }, cameraFar: { value: 1000 }, uProj: { value: new THREE.Vector4(1, 1, 0, 0) },
    });
    this.aoMat = sm(AO_FRAG, { ...this.depthUniforms(), uRes: { value: new THREE.Vector2() }, uRadius: { value: 1.6 }, uIntensity: { value: 1.25 }, uBias: { value: 0.6 }, uTime: { value: 0 } });
    this.blurMat = sm(BLUR_FRAG, { ...this.depthUniforms(), tInput: { value: null }, uDir: { value: new THREE.Vector2() } });
    this.brightMat = sm(BRIGHT_FRAG, { tInput: { value: null }, uThreshold: { value: 1.15 }, uTexel: { value: new THREE.Vector2() } });
    this.downMat = sm(DOWN_FRAG, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = sm(UP_FRAG, { tInput: { value: null }, tBase: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    this.raysMat = sm(RAYS_FRAG, { ...this.depthUniforms(), tColor: { value: null }, uSunUv: { value: new THREE.Vector2() }, uAspect: { value: 1 }, uDensity: { value: 0.9 }, uDecay: { value: 0.965 }, uTime: { value: 0 } });
    this.compMat = sm(COMPOSITE_FRAG, {
      tColor: { value: null }, tAO: { value: null }, tBloom: { value: null }, tRays: { value: null },
      uAO: { value: 0.85 }, uBloom: { value: 0.32 }, uRays: { value: 0.35 }, uRayColor: { value: new THREE.Color(1, 0.86, 0.6) },
      uExposure: { value: 1.0 }, uSaturation: { value: 1.12 }, uContrast: { value: 1.06 },
      uLift: { value: new THREE.Vector3(0.012, 0.014, 0.022) }, uGain: { value: new THREE.Vector3(1.0, 0.99, 0.96) },
      uVignette: { value: 0.55 }, uGrain: { value: 0.018 }, uTime: { value: 0 }, uUnderwater: { value: 0 }, uDamage: { value: 0 },
      uDesat: { value: 0 }, uBlur: { value: 0 }, uFade: { value: 0 }, uFadeColor: { value: new THREE.Color(0, 0, 0) }, uRes: { value: new THREE.Vector2() },
    });
    this.quad = new FullScreenQuad(null);
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.white.needsUpdate = true;
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    this.black.needsUpdate = true;
    this.targets = [];
    this.w = 0; this.h = 0;
    this.sunUv = new THREE.Vector2();
    this.sunVisible = 0;
  }

  setSize(w, h) {
    if (w === this.w && h === this.h && this._msaa === this.q.msaa) return;
    this.w = w; this.h = h; this._msaa = this.q.msaa;
    for (const t of this.targets) t.dispose();
    this.targets = [];
    const depthTex = new THREE.DepthTexture(w, h, THREE.FloatType);
    this.sceneRT = makeRT(w, h, { depth: true, samples: this.q.msaa, depthTexture: depthTex });
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2);
    this.aoRT = makeRT(hw, hh, { type: THREE.UnsignedByteType });
    this.aoRT2 = makeRT(hw, hh, { type: THREE.UnsignedByteType });
    this.raysRT = makeRT(hw, hh, { type: THREE.HalfFloatType });
    this.bloomMips = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < 5; i++) {
      this.bloomMips.push(makeRT(bw, bh));
      bw = Math.max(1, Math.ceil(bw / 2)); bh = Math.max(1, Math.ceil(bh / 2));
    }
    this.bloomUp = this.bloomMips.map((m) => makeRT(m.width, m.height));
    this.targets.push(this.sceneRT, this.aoRT, this.aoRT2, this.raysRT, ...this.bloomMips, ...this.bloomUp);
    this.compMat.uniforms.uRes.value.set(w, h);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.quad.render(this.r);
  }

  bindDepth(mat, camera) {
    const u = mat.uniforms;
    u.tDepth.value = this.sceneRT.depthTexture;
    u.cameraNear.value = camera.near;
    u.cameraFar.value = camera.far;
    const e = camera.projectionMatrix.elements;
    u.uProj.value.set(e[0], e[5], e[8], e[9]);
  }

  render(scene, camera, time) {
    const r = this.r;
    const q = this.q;
    r.setRenderTarget(this.sceneRT);
    r.clear();
    r.render(scene, camera);

    const color = this.sceneRT.texture;
    // --- AO
    let aoTex = this.white;
    if (q.ao) {
      this.bindDepth(this.aoMat, camera);
      this.aoMat.uniforms.uRes.value.set(this.aoRT.width, this.aoRT.height);
      this.aoMat.uniforms.uTime.value = time;
      this.pass(this.aoMat, this.aoRT);
      this.bindDepth(this.blurMat, camera);
      this.blurMat.uniforms.tInput.value = this.aoRT.texture;
      this.blurMat.uniforms.uDir.value.set(1 / this.aoRT.width, 0);
      this.pass(this.blurMat, this.aoRT2);
      this.blurMat.uniforms.tInput.value = this.aoRT2.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1 / this.aoRT.height);
      this.pass(this.blurMat, this.aoRT);
      aoTex = this.aoRT.texture;
    }
    // --- bloom
    let bloomTex = this.black;
    if (q.bloom) {
      const m = this.bloomMips;
      this.brightMat.uniforms.tInput.value = color;
      this.brightMat.uniforms.uTexel.value.set(1 / this.w, 1 / this.h);
      this.pass(this.brightMat, m[0]);
      for (let i = 1; i < m.length; i++) {
        this.downMat.uniforms.tInput.value = m[i - 1].texture;
        this.downMat.uniforms.uTexel.value.set(1 / m[i - 1].width, 1 / m[i - 1].height);
        this.pass(this.downMat, m[i]);
      }
      let src = m[m.length - 1];
      for (let i = m.length - 2; i >= 0; i--) {
        this.upMat.uniforms.tInput.value = src.texture;
        this.upMat.uniforms.tBase.value = m[i].texture;
        this.upMat.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        this.upMat.uniforms.uMix.value = 0.85;
        this.pass(this.upMat, this.bloomUp[i]);
        src = this.bloomUp[i];
      }
      bloomTex = this.bloomUp[0].texture;
    }
    // --- god rays
    let raysTex = this.black;
    if (q.rays && this.sunVisible > 0.01) {
      this.bindDepth(this.raysMat, camera);
      this.raysMat.uniforms.tColor.value = color;
      this.raysMat.uniforms.uSunUv.value.copy(this.sunUv);
      this.raysMat.uniforms.uAspect.value = this.w / this.h;
      this.raysMat.uniforms.uTime.value = time;
      this.pass(this.raysMat, this.raysRT);
      raysTex = this.raysRT.texture;
    }
    // --- composite
    const cu = this.compMat.uniforms;
    cu.tColor.value = color;
    cu.tAO.value = aoTex;
    cu.tBloom.value = bloomTex;
    cu.tRays.value = raysTex;
    cu.uTime.value = time;
    cu.uAO.value = q.ao ? 0.9 : 0;
    this._raysBase = this._raysBase ?? cu.uRays.value;
    const raysStrength = cu.uRays.value;
    cu.uRays.value = raysStrength * this.sunVisible;
    this.pass(this.compMat, null);
    cu.uRays.value = raysStrength;
  }
}

export class Engine {
  constructor(container, qualityName = 'high') {
    this.qualityName = qualityName;
    this.quality = { ...QUALITY[qualityName] };
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false, reversedDepthBuffer: true, preserveDrawingBuffer: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 1);
    this.renderer = renderer;
    container.appendChild(renderer.domElement);
    renderer.domElement.id = 'game-canvas';
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x9fb8c8, 0.0018);
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.06, 4000);
    this.camera.position.set(0, 50, 0);
    this.scene.add(this.camera);

    // sun + sky light
    this.sun = new SunLight(0xfff1dc, 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.camera.far = this.quality.shadowFar;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.radius = 2.5;
    this.scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a4a30, 1.0);
    this.scene.add(this.hemi);

    this.post = new Post(renderer, this.quality);
    this.time = 0;
    this._tmpV = new THREE.Vector3();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setQuality(name) {
    this.qualityName = name;
    Object.assign(this.quality, QUALITY[name]);
    this.sun.shadow.mapSize.set(this.quality.shadowSize, this.quality.shadowSize);
    this.sun.shadow.camera.far = this.quality.shadowFar;
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    this.resize(true);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = w + 'px';
    this.renderer.domElement.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(Math.floor(w * pr), Math.floor(h * pr));
  }

  // Sun position (direction from origin) — SunLight shines from position toward origin.
  setSunDirection(dir) {
    this.sun.position.copy(dir).multiplyScalar(100);
    this.sun.updateMatrixWorld();
    G.uSunDir.value.copy(dir).normalize();
  }

  // every lit material needs the shared fog/wind uniforms; patch strays
  ensurePatched() {
    this.scene.traverse((o) => {
      const ms = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of ms) {
        if (!m || m.userData.patchOpts || m.isShaderMaterial || m.isPointsMaterial || m.isLineBasicMaterial || m.isSpriteMaterial) continue;
        if (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshBasicMaterial || m.isMeshPhongMaterial) { patchMaterial(m, {}); m.needsUpdate = true; }
      }
    });
  }

  render(dt) {
    this.time += dt;
    this._patchT = (this._patchT ?? 0) - dt;
    if (this._patchT <= 0) { this._patchT = 1.0; this.ensurePatched(); }
    G.uTime.value = this.time;
    // sun screen position for god rays
    const cam = this.camera;
    const sd = G.uSunDir.value;
    const p = this._tmpV.copy(cam.position).addScaledVector(sd, 1000).project(cam);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const facing = fwd.dot(sd);
    this.post.sunUv.set(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const onScreen = Math.max(0, 1 - Math.max(Math.abs(p.x), Math.abs(p.y)) * 0.6);
    this.post.sunVisible = facing > 0 ? Math.min(1, facing * 1.6) * onScreen * Math.min(1, Math.max(0, sd.y * 6 + 0.3)) * (this.raysScale ?? 1) : 0;
    this.post.render(this.scene, cam, this.time);
  }
}
