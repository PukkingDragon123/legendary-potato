// Sky dome + time-of-day lighting palette.
import * as THREE from 'three';
import { G } from '../gfx/shaderlib.js';
import { GLSL_HASH } from './terrain.js';

const KEYS = [
  // elev, zenith, horizon, ground, sun color, sun intensity, hemi sky, hemi ground, hemi intensity, fog density
  { e: -0.35, zen: 0x0a1028, hor: 0x1e2c4c, gnd: 0x0a0c14, sun: 0x9ab4ec, si: 0.8, hs: 0x3a5288, hg: 0x182030, hi: 0.95, fog: 0.0022 },
  { e: -0.12, zen: 0x162252, hor: 0x5b4a6e, gnd: 0x10121c, sun: 0x9ab0e8, si: 0.35, hs: 0x48588e, hg: 0x1c1e2a, hi: 0.75, fog: 0.0022 },
  { e: -0.02, zen: 0x2a3b78, hor: 0xd8735a, gnd: 0x1a1414, sun: 0xff8a50, si: 0.6, hs: 0x6c6a96, hg: 0x2a2018, hi: 0.6, fog: 0.0022 },
  { e: 0.06, zen: 0x3a5ea8, hor: 0xffa66a, gnd: 0x2a2018, sun: 0xffb27a, si: 2.0, hs: 0x8fa2c8, hg: 0x3c3220, hi: 0.75, fog: 0.002 },
  { e: 0.22, zen: 0x4a82d0, hor: 0xc8d8e4, gnd: 0x3a3428, sun: 0xffe6c4, si: 3.0, hs: 0xa8c4ec, hg: 0x5a5236, hi: 1.25, fog: 0.0017 },
  { e: 0.6, zen: 0x3d7ad6, hor: 0xb6d6ee, gnd: 0x40402e, sun: 0xfff6ea, si: 3.4, hs: 0xb0ccf0, hg: 0x5e563a, hi: 1.35, fog: 0.0015 },
  { e: 1.0, zen: 0x3a76d4, hor: 0xb0d4ef, gnd: 0x40402e, sun: 0xfffaf2, si: 3.5, hs: 0xb0ccf0, hg: 0x5e563a, hi: 1.35, fog: 0.0015 },
];
const _c1 = new THREE.Color(), _c2 = new THREE.Color();
function lerpKey(e, prop, out) {
  let a = KEYS[0], b = KEYS[KEYS.length - 1];
  for (let i = 0; i < KEYS.length - 1; i++) if (e >= KEYS[i].e && e <= KEYS[i + 1].e) { a = KEYS[i]; b = KEYS[i + 1]; break; }
  if (e < KEYS[0].e) { a = b = KEYS[0]; }
  if (e > KEYS[KEYS.length - 1].e) { a = b = KEYS[KEYS.length - 1]; }
  const t = a === b ? 0 : (e - a.e) / (b.e - a.e);
  if (out instanceof THREE.Color) {
    _c1.setHex(a[prop]); _c2.setHex(b[prop]);
    return out.copy(_c1).lerp(_c2, t);
  }
  return a[prop] + (b[prop] - a[prop]) * t;
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  gl_Position = p.xyww;
  #ifdef USE_REVERSED_DEPTH_BUFFER
    gl_Position.z = 0.0;
  #endif
}
`;
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uGround, uSunColor, uMoonDir, uCloudLit, uCloudShade;
uniform vec3 uSunDir;
uniform float uTime, uNight, uCover, uSunDisk, uStorm, uFlash;
uniform vec2 uWindOff;
${GLSL_HASH}
float fbm( vec2 p ) { float s = 0.0, a = 0.5; for ( int i = 0; i < 5; i++ ) { s += a * vnoise( p ); p = p * 2.03 + 7.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize( vDir );
  float h = d.y;
  float t = pow( clamp( h, 0.0, 1.0 ), 0.5 );
  vec3 col = mix( uHorizon, uZenith, t );
  col = mix( col, uGround, smoothstep( 0.0, -0.2, h ) );
  float sd = max( dot( d, uSunDir ), 0.0 );
  float day = 1.0 - uNight;
  // atmospheric glow around the sun + warm band along the horizon at golden hour
  col += uSunColor * ( pow( sd, 5.0 ) * 0.22 + pow( sd, 48.0 ) * 0.5 ) * day * ( 1.0 - uStorm * 0.8 );
  float golden = clamp( 1.0 - abs( uSunDir.y ) * 5.0, 0.0, 1.0 );
  col += uSunColor * golden * pow( 1.0 - abs( h ), 8.0 ) * pow( sd, 2.0 ) * 0.35 * day;
  // sun disk with crisp pixel rim
  float disk = smoothstep( 0.99935, 0.9996, sd );
  col += uSunColor * disk * 22.0 * uSunDisk * ( 1.0 - uStorm );
  // moon
  float md = max( dot( d, uMoonDir ), 0.0 );
  float moon = smoothstep( 0.99955, 0.99975, md );
  vec2 mq = floor( ( d.xz - uMoonDir.xz ) * 3000.0 );
  float crater = hash21( mq ) > 0.75 ? 0.82 : 1.0;
  col += vec3( 0.85, 0.9, 1.0 ) * moon * 3.2 * uNight * crater * ( 1.0 - uStorm );
  col += vec3( 0.25, 0.32, 0.5 ) * pow( md, 40.0 ) * 0.35 * uNight;
  // pixel stars
  if ( h > 0.0 && uNight > 0.01 ) {
    vec3 sp = d * 420.0;
    vec2 cell = floor( vec2( atan( sp.z, sp.x ) * 220.0, sp.y * 1.4 ) );
    float s = hash21( cell );
    float tw = 0.6 + 0.4 * sin( uTime * ( 2.0 + s * 6.0 ) + s * 50.0 );
    float star = step( 0.9965, s ) * tw * smoothstep( 0.0, 0.25, h );
    col += vec3( 0.9, 0.95, 1.0 ) * star * 2.2 * uNight * ( 1.0 - uCover );
    // milky way band
    float band = exp( - pow( dot( d, normalize( vec3( 0.3, 0.55, 0.78 ) ) ), 2.0 ) * 30.0 );
    col += vec3( 0.18, 0.2, 0.32 ) * band * fbm( d.xz * 9.0 ) * uNight * 0.6 * ( 1.0 - uCover );
  }
  // clouds (planar projection), slightly pixelated + dithered edges
  if ( h > -0.02 ) {
    vec2 cuv = d.xz / ( h + 0.12 ) * 0.9 + uWindOff;
    vec2 q = floor( cuv * 90.0 ) / 90.0;
    float n = fbm( q * 1.6 );
    float n2 = fbm( q * 1.6 + uSunDir.xz * 0.06 );
    float cover = mix( 0.62, 0.3, uCover );
    float dens = smoothstep( cover, cover + 0.22, n );
    float bay = hash21( floor( gl_FragCoord.xy ) ) * 0.12;
    dens = clamp( dens + ( bay - 0.06 ) * step( 0.02, dens ) * step( dens, 0.98 ), 0.0, 1.0 );
    float shade = clamp( ( n - n2 ) * 6.0 + 0.55, 0.0, 1.0 );
    vec3 cc = mix( uCloudShade, uCloudLit, shade );
    cc += uSunColor * pow( sd, 8.0 ) * 0.45 * day * ( 1.0 - dens * 0.5 );
    float fade = smoothstep( -0.02, 0.18, h );
    col = mix( col, cc, dens * fade * ( 0.92 ) );
  }
  // distant cumulus banks along the horizon give the sky depth (seamless around the compass)
  if ( h > -0.03 && h < 0.32 ) {
    vec2 ring = normalize( d.xz + vec2( 1e-5 ) );
    float big = fbm( ring * 2.6 + vec2( uWindOff.x * 0.15, 3.0 ) );
    float top = ( 0.025 + 0.15 * smoothstep( 0.42, 0.8, big ) ) * ( 0.55 + uCover * 0.9 );
    float puff = fbm( ring * 11.0 + vec2( h * 26.0, uWindOff.y * 0.5 ) );
    float edge = h - ( puff - 0.5 ) * 0.045;
    float m = smoothstep( top + 0.012, top - 0.012, edge ) * smoothstep( -0.03, 0.005, h );
    vec2 sunH = normalize( uSunDir.xz + vec2( 1e-5 ) );
    float lit = clamp( 0.35 + ( edge / max( top, 0.01 ) ) * 0.55 + dot( ring, sunH ) * 0.22 + ( puff - 0.5 ) * 0.6, 0.0, 1.0 );
    vec3 cb = mix( uCloudShade, uCloudLit, lit );
    cb += uSunColor * pow( sd, 6.0 ) * 0.35 * day;
    // far banks sink into the haze
    cb = mix( cb, uHorizon, 0.38 );
    col = mix( col, cb, m * 0.88 );
  }
  col = mix( col, col * 0.45 + vec3( 0.05 ), uStorm * 0.6 );
  col += vec3( 0.7, 0.75, 0.9 ) * uFlash;
  gl_FragColor = vec4( col, 1.0 );
}
`;

export class Sky {
  constructor(engine) {
    this.engine = engine;
    this.uniforms = {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: G.uSunDir,
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uCloudLit: { value: new THREE.Color() },
      uCloudShade: { value: new THREE.Color() },
      uTime: G.uTime,
      uNight: { value: 0 },
      uCover: { value: 0.25 },
      uSunDisk: { value: 1 },
      uStorm: { value: 0 },
      uFlash: { value: 0 },
      uWindOff: { value: new THREE.Vector2() },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uniforms,
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), mat);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sky';
    engine.scene.add(this.mesh);
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.state = { elev: 0, night: 0 };
    this._col = new THREE.Color();
  }

  // t: 0..1 time of day (0 = midnight, 0.25 = 6am, 0.5 = noon). weather: { cover, storm, fog, rain }
  update(t, weather, camPos, dt) {
    const ang = (t - 0.25) * Math.PI * 2;
    const tilt = 0.42;
    this.sunDir.set(Math.cos(ang), Math.sin(ang) * Math.cos(tilt), Math.sin(ang) * Math.sin(tilt) + 0.08).normalize();
    this.moonDir.set(-Math.cos(ang + 0.25), -Math.sin(ang + 0.25) * Math.cos(tilt) + 0.15, -Math.sin(ang + 0.25) * Math.sin(tilt)).normalize();
    const e = this.sunDir.y;
    const night = THREE.MathUtils.smoothstep(-e, 0.02, 0.2);
    this.state.elev = e;
    this.state.night = night;
    const u = this.uniforms;
    const cover = weather.cover, storm = weather.storm;
    lerpKey(e, 'zen', u.uZenith.value);
    lerpKey(e, 'hor', u.uHorizon.value);
    lerpKey(e, 'gnd', u.uGround.value);
    lerpKey(e, 'sun', u.uSunColor.value);
    // overcast desaturation
    const grey = this._col.setRGB(0.55, 0.58, 0.62).multiplyScalar(1 - night * 0.85);
    u.uZenith.value.lerp(grey, cover * 0.55 + storm * 0.3);
    u.uHorizon.value.lerp(grey, cover * 0.45 + storm * 0.3);
    u.uMoonDir.value.copy(this.moonDir);
    u.uNight.value = night;
    u.uCover.value = cover;
    u.uStorm.value = storm;
    u.uCloudLit.value.copy(u.uSunColor.value).lerp(u.uHorizon.value, 0.35).multiplyScalar(1.15 - night * 0.8).lerp(grey, storm * 0.6);
    u.uCloudShade.value.copy(u.uZenith.value).lerp(u.uGround.value, 0.25).multiplyScalar(0.85).lerp(grey.clone().multiplyScalar(0.6), storm * 0.5);
    u.uWindOff.value.x += (G.uWind.value.x * 0.0012 + 0.0004) * dt;
    u.uWindOff.value.y += (G.uWind.value.z * 0.0012) * dt;
    this.mesh.position.copy(camPos);

    // ---- drive engine lights
    const eng = this.engine;
    const useMoon = e < -0.02;
    const lightDir = useMoon ? this.moonDir : this.sunDir;
    eng.setSunDirection(lightDir);
    G.uSunDir.value.copy(this.sunDir); // fog sun glow follows the real sun
    if (useMoon) G.uSunDir.value.copy(this.moonDir);
    const si = lerpKey(e, 'si');
    const cloudDim = 1 - cover * 0.55 - storm * 0.3;
    eng.sun.color.copy(useMoon ? this._col.setHex(0x9ab4f0) : u.uSunColor.value);
    const horizonFade = useMoon ? THREE.MathUtils.smoothstep(this.moonDir.y, 0.0, 0.15) : THREE.MathUtils.smoothstep(e, -0.02, 0.06);
    eng.sun.intensity = (useMoon ? 0.45 : si) * cloudDim * horizonFade;
    lerpKey(e, 'hs', eng.hemi.color);
    lerpKey(e, 'hg', eng.hemi.groundColor);
    eng.hemi.color.lerp(grey, cover * 0.4);
    eng.hemi.intensity = lerpKey(e, 'hi') * (1 - storm * 0.25);
    G.uSunColor.value.copy(eng.sun.color).multiplyScalar(eng.sun.intensity / 3.2);
    // fog
    const fog = eng.scene.fog;
    fog.color.copy(u.uHorizon.value).lerp(u.uZenith.value, 0.15);
    fog.density = lerpKey(e, 'fog') * (1 + cover * 0.4 + weather.fog * 2.5 + storm * 0.8);
    G.uFogSunColor.value.copy(u.uSunColor.value).lerp(fog.color, 0.35).multiplyScalar(day(night));
    // low valley mist pools at dawn and burns off as the sun climbs
    const dawn = THREE.MathUtils.smoothstep(e, -0.12, 0.0) * (1 - THREE.MathUtils.smoothstep(e, 0.08, 0.3)) * (t < 0.5 ? 1 : 0.25);
    G.uFogHeightDensity.value = 0.0035 + weather.fog * 0.03 + (1 - Math.abs(e)) * 0.002 + dawn * 0.018;
    G.uNight.value = night;
    // cloud shadows drift with the wind; stronger when it is cloudier, gone at night
    const cs = G.uCloudSh.value;
    cs.x -= (G.uWind.value.x * 6 + 2.5) * dt; cs.y -= (G.uWind.value.z * 6 + 1) * dt;
    if (Math.abs(cs.x) > 9e4) cs.x %= 9e4; if (Math.abs(cs.y) > 9e4) cs.y %= 9e4; // keep shader precision
    cs.z = THREE.MathUtils.clamp(0.22 + cover * 0.55, 0, 0.7) * (1 - night) * (1 - storm * 0.7) * horizonFade;
    cs.w = THREE.MathUtils.lerp(0.62, 0.36, cover);
    return this.state;
  }
}
const day = (n) => 1 - n * 0.7;
