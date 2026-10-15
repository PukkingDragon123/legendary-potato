// Creature models. Every species is a small sculpting script (see
// creatureDesigns.js) that places bones and blends signed-distance shapes
// into one smooth skin, like clay over an armature. The sculpt is meshed once
// per species (two levels of detail, on a worker when possible), skinned to
// the bones and painted; instances share the geometry and get their own
// skeleton, a skin material (hit flash, blush) and two shader-drawn eyes with
// lids, gaze, pupils and cartoon expressions (happy arcs, sleepy lines, KO
// crosses, swirls, hearts).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { ELEMENTS, crystalGeo, crystalMat, flameGeo, flameMat, leafGeo, leafMat, flower } from './elements.js';
import { sculptSpecies } from './creatureSculpt.js';

// ======================================================================== species data (cached)
const cache = new Map(), pending = new Map();
const keyOf = (sp) => sp.matKey ?? sp.id;
export function speciesReady(sp) { return cache.has(keyOf(sp)); }
// synchronous: builds on this thread if the worker has not delivered yet
export function speciesData(sp) {
  const key = keyOf(sp);
  if (!cache.has(key)) cache.set(key, fromRaw(sculptSpecies(sp)));
  return cache.get(key);
}
export function clearSpeciesCache() { cache.clear(); }
let worker = null, wid = 0;
const waiting = new Map();
function getWorker() {
  if (worker !== null) return worker;
  try {
    worker = new Worker(new URL('./sculpt.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const { id, D, error } = e.data;
      const w = waiting.get(id); waiting.delete(id);
      if (!w) return;
      if (error || !D) { console.warn('sculpt worker', error); w.reject(error); return; }
      w.resolve(D);
    };
    worker.onerror = (e) => { console.warn('sculpt worker failed', e.message); worker = false; for (const w of waiting.values()) w.reject(e); waiting.clear(); };
  } catch { worker = false; }
  return worker;
}
// asynchronous: sculpt on the worker, resolve when the species can spawn
export function requestSpecies(sp) {
  const key = keyOf(sp);
  if (cache.has(key)) return Promise.resolve(cache.get(key));
  if (pending.has(key)) return pending.get(key);
  const W = getWorker();
  const p = (W
    ? new Promise((resolve, reject) => { const id = ++wid; waiting.set(id, { resolve, reject }); W.postMessage({ id, sp: plainSpecies(sp) }); })
    : new Promise((resolve) => setTimeout(() => resolve(sculptSpecies(sp)), 0)))
    .then((raw) => { if (!cache.has(key)) cache.set(key, fromRaw(raw)); pending.delete(key); return cache.get(key); })
    .catch(() => { pending.delete(key); return speciesData(sp); });
  pending.set(key, p);
  return p;
}
// species objects are plain data; drop anything that cannot be cloned
function plainSpecies(sp) { return JSON.parse(JSON.stringify(sp)); }
function fromRaw(D) {
  D.geo = D.lods.map(toGeo);
  D.boneInverses = D.bones.map((x) => new THREE.Matrix4().makeTranslation(-x.pos[0], -x.pos[1], -x.pos[2]));
  D.teeth = buildTeeth(D);
  delete D.lods;
  return D;
}

function toGeo(R) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(R.pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(R.nrm, 3));
  g.setAttribute('color', new THREE.BufferAttribute(R.col, 3));
  g.setAttribute('aMat', new THREE.BufferAttribute(R.mat, 4));
  g.setAttribute('aAO', new THREE.BufferAttribute(R.ao, 1));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(R.skinI, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(R.skinW, 4));
  g.setIndex(new THREE.BufferAttribute(R.nv < 65535 ? Uint16Array.from(R.idx) : R.idx, 1));
  g.computeBoundingSphere();
  return g;
}
function buildTeeth(D) {
  const per = new Map();
  for (const t of D.teeth) {
    const len = t.len, r = t.r;
    const g = t.flat ? new THREE.BoxGeometry(r * 2, len, r * 0.7) : new THREE.ConeGeometry(r, len, 6, 1);
    g.translate(0, -len / 2, 0); // base at the origin, tip down (-Y)
    const dir = new THREE.Vector3(...(t.dir ?? [0, -1, 0])).normalize();
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir));
    const bp = D.bones[D.bi[t.b]].pos;
    g.translate(t.p[0] - bp[0], t.p[1] - bp[1], t.p[2] - bp[2]);
    g.deleteAttribute('uv');
    if (!per.has(t.b)) per.set(t.b, []);
    per.get(t.b).push(g);
  }
  return [...per.entries()].map(([bone, list]) => ({ bone, geo: mergeGeometries(list) }));
}

// ======================================================================== materials
const SKIN = {
  wet: true,
  vertex: {
    head: 'attribute vec4 aMat; attribute float aAO; varying vec4 vMat; varying float vAO; varying vec3 vRest; varying vec3 vRestN;',
    main: 'vMat = aMat; vAO = aAO; vRest = position; vRestN = normal;',
  },
  fragment: {
    head: /* glsl */ `
      varying vec4 vMat; varying float vAO; varying vec3 vRest; varying vec3 vRestN;
      uniform vec4 uPat; uniform vec3 uPatCol; uniform vec3 uGlowCol; uniform vec4 uGlow;
      uniform vec4 uFlash; uniform vec4 uBlush; uniform vec4 uRim;
      float cr_h31( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
      float cr_vn( vec3 x ) {
        vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( mix( cr_h31( i ), cr_h31( i + vec3( 1, 0, 0 ) ), f.x ), mix( cr_h31( i + vec3( 0, 1, 0 ) ), cr_h31( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                    mix( mix( cr_h31( i + vec3( 0, 0, 1 ) ), cr_h31( i + vec3( 1, 0, 1 ) ), f.x ), mix( cr_h31( i + vec3( 0, 1, 1 ) ), cr_h31( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
      }
      vec2 cr_cell( vec3 x ) {
        vec3 i = floor( x ); vec3 f = fract( x ); float d1 = 8.0, d2 = 8.0;
        for ( int k = -1; k <= 1; k++ ) for ( int j = -1; j <= 1; j++ ) for ( int l = -1; l <= 1; l++ ) {
          vec3 g = vec3( float( l ), float( j ), float( k ) );
          vec3 o = vec3( cr_h31( i + g ), cr_h31( i + g + 17.31 ), cr_h31( i + g + 41.7 ) );
          vec3 r = g + o - f; float d = dot( r, r );
          if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
        }
        return sqrt( vec2( d1, d2 ) );
      }
      // screen-space bump from a procedural height (curly wool, fur grain)
      vec3 cr_bump( vec3 surf_pos, vec3 surf_norm, float hgt ) {
        vec3 vSigmaX = dFdx( surf_pos ), vSigmaY = dFdy( surf_pos );
        vec3 R1 = cross( vSigmaY, surf_norm ), R2 = cross( surf_norm, vSigmaX );
        float fDet = dot( vSigmaX, R1 );
        vec2 dH = vec2( dFdx( hgt ), dFdy( hgt ) );
        vec3 vGrad = sign( fDet ) * ( dH.x * R1 + dH.y * R2 );
        return normalize( abs( fDet ) * surf_norm - vGrad );
      }
      float cr_pattern( vec3 p, vec3 n ) {
        int t = int( uPat.x + 0.5 );
        vec3 q = p * uPat.y + uPat.w;
        float m = 0.0, th = uPat.z;
        if ( t == 1 ) { float s = sin( q.z * 6.2831 + cr_vn( q * 1.7 ) * 3.0 ); m = smoothstep( th - 0.12, th + 0.12, s ) * smoothstep( -0.35, 0.25, n.y ); }
        else if ( t == 2 ) { vec2 c = cr_cell( q ); m = ( 1.0 - smoothstep( th - 0.06, th + 0.06, c.x ) ) * smoothstep( -0.55, 0.0, n.y ); }
        else if ( t == 3 ) { float v = cr_vn( q ) * 0.65 + cr_vn( q * 2.3 ) * 0.35; m = smoothstep( th - 0.04, th + 0.04, v ); }
        else if ( t == 4 ) { float s = abs( sin( q.z * 3.1416 + cr_vn( q * 2.0 ) * 2.5 + q.y * 0.6 ) ); m = ( 1.0 - smoothstep( th - 0.06, th + 0.06, s ) ) * smoothstep( -0.25, 0.35, n.y ); }
        else if ( t == 5 ) { float zz = abs( fract( q.y * 1.4 + abs( fract( q.z * 1.8 ) - 0.5 ) * 1.7 ) - 0.5 ); m = ( 1.0 - smoothstep( th - 0.04, th + 0.04, zz ) ) * smoothstep( -0.3, 0.2, n.y ); }
        else if ( t == 6 ) { vec2 c = cr_cell( q ); m = 1.0 - smoothstep( th - 0.03, th + 0.03, c.y - c.x ); }
        else if ( t == 7 ) { float s = sin( q.z * 6.2831 + cr_vn( q * 1.3 ) * 1.5 ); m = smoothstep( th - 0.1, th + 0.1, s ); }
        return m;
      }`,
    main: /* glsl */ `
      float crPat = vMat.z > 0.01 ? cr_pattern( vRest, vRestN ) * vMat.z : 0.0;
      diffuseColor.rgb = mix( diffuseColor.rgb, uPatCol, crPat * ( 1.0 - uGlow.z * 0.6 ) );
      // soft fur breakup and cheek blush
      float crFur = cr_vn( vRest * 60.0 ) * 0.6 + cr_vn( vRest * 140.0 ) * 0.4;
      diffuseColor.rgb *= 1.0 - vMat.x * 0.14 * ( crFur - 0.5 );
      vec3 crCk = vec3( abs( vRest.x ), vRest.yz ) - uBlush.xyz;
      diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.95, 0.32, 0.36 ), uBlush.w * ( 1.0 - smoothstep( 0.0, 1.0, length( crCk ) / max( 1e-3, uRim.w ) ) ) * 0.75 );
      diffuseColor.rgb *= mix( 1.0, vAO, 0.5 );`,
    emissive: /* glsl */ `
      // curls on wool, a fine grain on fur (fades out with distance)
      if ( vMat.x > 0.05 ) {
        float crD = length( vViewPosition );
        float crFade = 1.0 - smoothstep( 4.0, 14.0, crD );
        if ( crFade > 0.0 ) {
          vec3 crQ = vRest * ( vMat.x > 0.85 ? 34.0 : 90.0 );
          vec2 crC = cr_cell( crQ );
          float crH = ( vMat.x > 0.85 ? ( 1.0 - crC.x ) * 0.6 + cr_vn( crQ * 2.7 ) * 0.4 : cr_vn( crQ * vec3( 1.0, 3.0, 1.0 ) ) ) * 0.0035 * vMat.x * crFade;
          normal = cr_bump( -vViewPosition, normal, crH );
        }
      }
      roughnessFactor = mix( roughnessFactor, 0.16, vMat.y );
      roughnessFactor = mix( roughnessFactor, min( 1.0, roughnessFactor + 0.2 ), vMat.x );
      {
        vec3 crV = normalize( vViewPosition );
        float crFr = 1.0 - clamp( dot( normal, crV ), 0.0, 1.0 );
        float crDay = 1.0 - uNight * 0.85;
        // velvet sheen on fur, a glossy rim on smooth skin
        totalEmissiveRadiance += diffuseColor.rgb * pow( crFr, 2.2 ) * uRim.y * vMat.x * crDay;
        totalEmissiveRadiance += uRim.x * pow( crFr, 4.0 ) * 0.12 * ( 1.0 - vMat.x ) * crDay * vec3( 1.0 );
        float crPulse = 0.78 + 0.22 * sin( uTime * uGlow.y + vRest.z * 3.0 );
        float crG = ( vMat.w + crPat * uGlow.z ) * uGlow.x * crPulse * ( 1.0 + uNight * uGlow.w );
        totalEmissiveRadiance += uGlowCol * crG;
        totalEmissiveRadiance += uFlash.rgb * uFlash.w;
      }`,
    lights: /* glsl */ `
      reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO;
      {
        // fur lets the light wrap past the terminator: soft, fluffy shading
        vec3 crL = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
        float crNL = dot( normal, crL );
        float crWrap = max( 0.0, ( crNL + 0.55 ) / 1.55 ) - max( 0.0, crNL );
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * crWrap * vMat.x * 0.55 * ( 1.0 - uNight ) * vAO;
      }`,
  },
};
const PAT_IDS = { stripes: 1, spots: 2, patches: 3, tiger: 4, zigzag: 5, cracks: 6, bands: 7 };
export function skinMaterial(D, sp) {
  const E = ELEMENTS[sp.element];
  const pt = D.pat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0 });
  const glowK = { fire: 2.2, electric: 2.0, toxic: 1.7, water: 1.4, crystal: 1.5, earth: 1.8, grass: 0.9, wind: 0.8 }[sp.element] ?? 1.2;
  const u = {
      uPat: { value: new THREE.Vector4(pt ? PAT_IDS[pt.type] ?? 0 : 0, pt?.scale ?? 3, pt?.th ?? 0.4, pt?.seed ?? 3.1) },
      uPatCol: { value: new THREE.Color(pt?.col !== undefined ? (typeof pt.col === 'number' ? pt.col : D.P[pt.col]) : D.P.pat) },
      uGlowCol: { value: new THREE.Color(D.P.glow) },
      uGlow: { value: new THREE.Vector4(E ? glowK * (D.glowK ?? 1) : 0, sp.element === 'electric' ? 6 : 1.6, D.glowPat ? 1 : 0, 0.8) },
      uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
      uBlush: { value: new THREE.Vector4(...(D.blush ?? [0, -9, 0]), 0) },
      uRim: { value: new THREE.Vector4(D.rim ?? 1, D.sheen, 0, (D.blush?.[3] ?? 0.05)) },
  };
  patchMaterial(m, { ...SKIN, uniforms: u });
  m.userData.u = u;
  return m;
}
const EYE = {
  vertex: { head: 'varying vec3 vEyeP;', main: 'vEyeP = position;' },
  fragment: {
    head: /* glsl */ `
      varying vec3 vEyeP;
      uniform vec4 uLid; uniform vec4 uLook; uniform vec4 uMode; uniform vec2 uPupS;
      uniform vec3 uIris; uniform vec3 uIris2; uniform vec3 uSclera; uniform vec3 uLidCol; uniform float uIrisGlow;
      float ey_seg( vec2 p, vec2 a, vec2 b ) { vec2 pa = p - a, ba = b - a; float h = clamp( dot( pa, ba ) / dot( ba, ba ), 0.0, 1.0 ); return length( pa - ba * h ); }
      float ey_heart( vec2 p ) {
        p.x = abs( p.x );
        if ( p.y + p.x > 1.0 ) return sqrt( dot( p - vec2( 0.25, 0.75 ), p - vec2( 0.25, 0.75 ) ) ) - 0.35355;
        vec2 a = p - vec2( 0.0, 1.0 ), b = p - 0.5 * max( p.x + p.y, 0.0 );
        return sqrt( min( dot( a, a ), dot( b, b ) ) ) * sign( p.x - p.y );
      }`,
    map: /* glsl */ `
      vec3 eyN = normalize( vEyeP );
      vec2 eyQ = eyN.xy;
      float eyAA = max( fwidth( eyQ.x ), fwidth( eyQ.y ) ) * 1.3 + 1e-4;
      float eyMode = uMode.x, eyK = uMode.y;
      // the iris rides on the ball towards the gaze
      vec3 eyGz = normalize( vec3( uLook.xy, 1.0 ) );
      vec3 eyGx = normalize( cross( vec3( 0.0, 1.0, 0.0 ), eyGz ) );
      vec3 eyGy = cross( eyGz, eyGx );
      vec2 eyIp = vec2( dot( eyN, eyGx ), dot( eyN, eyGy ) );
      float eyIr = uLook.w;
      float eyId = length( eyIp ) / eyIr;
      vec3 eyC = uSclera * ( 0.74 + 0.26 * smoothstep( -0.3, 0.95, eyN.z ) );
      float eyIris = ( 1.0 - smoothstep( 1.0 - eyAA * 2.0 / eyIr, 1.0 + eyAA * 2.0 / eyIr, eyId ) ) * step( 0.0, dot( eyN, eyGz ) );
      vec3 eyIc = mix( uIris2, uIris, smoothstep( -1.0, 0.7, eyIp.y / eyIr ) );
      eyIc *= 0.58 + 0.42 * smoothstep( 1.0, 0.5, eyId );
      eyIc *= 0.9 + 0.1 * sin( atan( eyIp.y, eyIp.x ) * 19.0 + eyId * 5.0 );
      eyC = mix( eyC, eyIc, eyIris );
      vec2 eyPp = eyIp / ( eyIr * 0.56 * uLook.z ) / uPupS;
      float eyPup = ( 1.0 - smoothstep( 0.9, 1.08, length( eyPp ) ) ) * eyIris;
      if ( eyMode > 4.5 && eyMode < 5.5 ) {
        // smitten: a heart where the pupil was
        float hd = ey_heart( vec2( eyIp.x, eyIp.y + eyIr * 0.62 ) / ( eyIr * 1.05 ) );
        float hm = ( 1.0 - smoothstep( -0.02, 0.04, hd ) ) * eyK;
        eyC = mix( eyC, vec3( 0.95, 0.12, 0.28 ), hm ); eyPup *= 1.0 - hm;
      }
      eyC = mix( eyC, vec3( 0.012, 0.01, 0.018 ), eyPup );
      if ( eyMode > 3.5 && eyMode < 4.5 ) {
        // dizzy swirl
        float r = length( eyQ ), a = atan( eyQ.y, eyQ.x );
        float sw = abs( fract( a / 6.2831 + r * 2.4 - uMode.z * 1.3 ) - 0.5 ) * 2.0;
        eyC = mix( eyC, mix( vec3( 0.04 ), uSclera, smoothstep( 0.42, 0.58, sw ) ), eyK );
      }
      float eyHL = ( 1.0 - smoothstep( 0.12 - eyAA, 0.12 + eyAA, length( ( eyQ - vec2( -0.3, 0.36 ) - uLook.xy * 0.22 ) * vec2( 1.0, 1.2 ) ) ) );
      eyHL += ( 1.0 - smoothstep( 0.05 - eyAA, 0.05 + eyAA, length( eyQ - vec2( 0.27, -0.2 ) - uLook.xy * 0.22 ) ) ) * 0.8;
      eyHL *= step( 0.0, eyN.z );
      // lids
      float eyShut = ( ( eyMode > 0.5 && eyMode < 3.5 ) || eyMode > 5.5 ) ? eyK : 0.0;
      float eyX = eyQ.x;
      float eyTop = mix( uLid.x - uLid.w * eyX * eyX + uLid.z * eyX, -0.08, eyShut );
      float eyBot = mix( uLid.y + uLid.w * 0.45 * eyX * eyX - uLid.z * 0.3 * eyX, -0.08, eyShut );
      float eyLid = max( smoothstep( eyTop - eyAA * 1.5, eyTop + eyAA * 1.5, eyQ.y ), 1.0 - smoothstep( eyBot - eyAA * 1.5, eyBot + eyAA * 1.5, eyQ.y ) );
      if ( eyTop < eyBot ) eyLid = 1.0;
      vec3 eyLc = uLidCol * ( 0.7 + 0.3 * smoothstep( -0.6, 0.9, eyN.z ) );
      float eyLash = ( 1.0 - smoothstep( 0.035, 0.035 + eyAA * 2.0, abs( eyQ.y - max( eyTop, eyBot ) ) ) ) * ( 1.0 - eyShut );
      eyLash = max( eyLash, ( 1.0 - smoothstep( 0.02, 0.02 + eyAA * 2.0, abs( eyQ.y - eyBot ) ) ) * 0.5 * step( eyBot, eyTop ) * ( 1.0 - eyShut ) );
      eyC = mix( eyC, eyLc, eyLid );
      eyC = mix( eyC, vec3( 0.05, 0.035, 0.04 ), eyLash * step( abs( eyX ), 0.98 ) );
      // closed-eye cartoon marks: ^ happy, ‿ asleep, X knocked out, > squeezed
      float eyLine = 0.0;
      if ( eyMode > 0.5 && eyMode < 1.5 ) eyLine = ( 1.0 - smoothstep( 0.055, 0.055 + eyAA * 2.0, abs( eyQ.y - ( 0.2 - 1.15 * eyX * eyX ) ) ) ) * step( abs( eyX ), 0.62 );
      else if ( eyMode > 1.5 && eyMode < 2.5 ) eyLine = ( 1.0 - smoothstep( 0.045, 0.045 + eyAA * 2.0, abs( eyQ.y - ( -0.14 + 0.5 * eyX * eyX ) ) ) ) * step( abs( eyX ), 0.6 );
      else if ( eyMode > 2.5 && eyMode < 3.5 ) eyLine = 1.0 - smoothstep( 0.065, 0.065 + eyAA * 2.0, min( ey_seg( eyQ, vec2( -0.4, -0.4 ), vec2( 0.4, 0.4 ) ), ey_seg( eyQ, vec2( -0.4, 0.4 ), vec2( 0.4, -0.4 ) ) ) );
      else if ( eyMode > 5.5 ) eyLine = 1.0 - smoothstep( 0.06, 0.06 + eyAA * 2.0, min( ey_seg( eyQ, vec2( 0.45, 0.38 ), vec2( -0.3, 0.0 ) ), ey_seg( eyQ, vec2( -0.3, 0.0 ), vec2( 0.45, -0.38 ) ) ) );
      eyC = mix( eyC, vec3( 0.05, 0.035, 0.04 ), eyLine * eyK );
      diffuseColor.rgb = eyC;
      totalEmissiveRadiance += vec3( 1.0 ) * eyHL * ( 1.0 - eyLid ) * 0.95;
      totalEmissiveRadiance += eyIc * eyIris * ( 1.0 - eyPup ) * ( 1.0 - eyLid ) * uIrisGlow * ( 0.4 + uNight );`,
  },
};
const PUPIL = { round: [1, 1], slit: [0.32, 1.08], bar: [1.25, 0.42], big: [1.15, 1.15] };
export function eyeMaterial(D, sp) {
  const st = D.eyeStyle;
  const slot = (v, def) => (typeof v === 'string' ? D.P[v] : v ?? def);
  const iris = new THREE.Color(slot(st.iris, D.P.eye));
  const iris2 = st.iris2 !== undefined ? new THREE.Color(slot(st.iris2)) : iris.clone().multiplyScalar(0.45);
  const m = new THREE.MeshStandardMaterial({ roughness: 0.08, metalness: 0 });
  const u = {
      uLid: { value: new THREE.Vector4(0.7, -0.75, 0, 0.2) },
      uLook: { value: new THREE.Vector4(0, 0, 1, st.irisR ?? 0.62) },
      uMode: { value: new THREE.Vector4(0, 0, 0, 0) },
      uPupS: { value: new THREE.Vector2(...(PUPIL[st.pupil ?? 'round'] ?? PUPIL.round)) },
      uIris: { value: iris }, uIris2: { value: iris2 },
      uSclera: { value: new THREE.Color(slot(st.sclera, D.P.sclera)) },
      uLidCol: { value: new THREE.Color(slot(st.lid, D.P.lid)) },
      uIrisGlow: { value: st.glow ?? (['electric', 'fire', 'toxic', 'crystal'].includes(sp.element) ? 0.6 : 0.15) },
  };
  patchMaterial(m, { ...EYE, uniforms: u });
  m.userData.u = u;
  return m;
}
const shared = {};
const toothMat = () => (shared.tooth ??= patchMaterial(new THREE.MeshStandardMaterial({ color: 0xf4eedc, roughness: 0.3 }), {}));
const tongueMat = () => (shared.tongue ??= patchMaterial(new THREE.MeshStandardMaterial({ color: 0xe0607a, roughness: 0.45 }), {}));
const eyeGeo = () => (shared.eyeGeo ??= new THREE.SphereGeometry(1, 28, 18));
const tongueGeo = () => (shared.tongueGeo ??= (() => { const g = new THREE.SphereGeometry(1, 14, 10); g.translate(0, 0, -1); return g; })());

// ======================================================================== an instance
export function buildCreature(sp, opt = {}) {
  const D = speciesData(sp);
  const root = new THREE.Group(); root.name = 'creature:' + sp.id;
  const bones = D.bones.map((x) => { const bn = new THREE.Bone(); bn.name = x.name; return bn; });
  const roots = [];
  for (const [i, x] of D.bones.entries()) {
    const bn = bones[i];
    if (x.parent < 0) { bn.position.set(...x.pos); roots.push(bn); }
    else { const pp = D.bones[x.parent].pos; bn.position.set(x.pos[0] - pp[0], x.pos[1] - pp[1], x.pos[2] - pp[2]); bones[x.parent].add(bn); }
  }
  const skel = new THREE.Skeleton(bones, D.boneInverses);
  const mat = skinMaterial(D, sp);
  const lods = D.geo.map((geo, i) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (i === 0) for (const r of roots) m.add(r);
    m.bind(skel, new THREE.Matrix4());
    m.boundingSphere = geo.boundingSphere.clone();
    m.boundingSphere.radius *= 1.45;
    m.visible = i === 0;
    root.add(m);
    return m;
  });
  const B = Object.fromEntries(bones.map((b) => [b.name, b]));
  const idx = D.bi;
  const bonePos = D.bones.map((x) => new THREE.Vector3(...x.pos));
  const onBone = (name, obj, p) => { const bp = D.bones[idx[name]].pos; obj.position.set(p[0] - bp[0], p[1] - bp[1], p[2] - bp[2]); B[name].add(obj); return obj; };
  // ---- eyes
  const eyeMats = [];
  const eyes = D.eyes.map((e) => {
    const em = eyeMaterial(D, sp); eyeMats.push(em);
    const m = new THREE.Mesh(eyeGeo(), em);
    m.castShadow = false; m.receiveShadow = true;
    onBone(e.b ?? 'head', m, e.c);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...e.dir).normalize());
    m.scale.set(e.r * (e.side < 0 ? -1 : 1), e.r * (e.sy ?? 1), e.r * (e.depth ?? 0.8));
    m.userData.side = e.side;
    return m;
  });
  // ---- teeth, tongue, extras
  const teeth = D.teeth.map((t) => { const m = new THREE.Mesh(t.geo, toothMat()); m.castShadow = false; B[t.bone].add(m); return m; });
  let tongue = null;
  if (D.tongue) {
    const T = D.tongue;
    const holder = new THREE.Object3D();
    onBone(T.b ?? 'jaw', holder, T.p);
    tongue = new THREE.Mesh(tongueGeo(), tongueMat());
    tongue.scale.set(T.r[0], T.r[1], T.r[2]);
    holder.add(tongue);
    tongue.userData.holder = holder;
    tongue.userData.len = T.r[2];
  }
  const extras = [];
  const E = ELEMENTS[sp.element];
  for (const a of D.attach) {
    let o;
    if (a.kind === 'crystal') { o = new THREE.Mesh(crystalGeo(), crystalMat(E ?? ELEMENTS.crystal, a.tint)); o.scale.set(a.s * 1.1, a.s, a.s * 1.1); o.castShadow = true; }
    else if (a.kind === 'flame') {
      o = new THREE.Group();
      const outer = new THREE.Mesh(flameGeo(), flameMat(a.col ?? 0xff5a10, a.core ?? 0xffe080)); outer.scale.set(a.s, a.s * 1.6, a.s);
      const inner = new THREE.Mesh(flameGeo(), flameMat(a.core ?? 0xffe080, 0xffffff)); inner.scale.set(a.s * 0.55, a.s, a.s * 0.55);
      outer.renderOrder = 5; inner.renderOrder = 6; o.add(outer, inner); o.userData.flame = true;
    } else if (a.kind === 'flower') { o = flower(null, a.s, a.col ?? 0xf0a0c0); o.traverse((m) => { m.castShadow = false; }); }
    else if (a.kind === 'leaf') { o = new THREE.Mesh(leafGeo(a.curl ?? 0.25), leafMat(a.col ?? D.P.accent)); o.scale.setScalar(a.s); o.castShadow = true; }
    else continue;
    onBone(a.b, o, a.p);
    if (a.rot) o.rotation.set(...a.rot);
    if (a.dir) o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...a.dir).normalize());
    o.userData.kind = a.kind;
    extras.push(o);
  }
  root.userData.dino = true;
  const rig = {
    root, body: lods[0], lods, skel, bones: B, bonePos, idx, D, sp,
    boneSpec: D.bones.map((x) => ({ name: x.name })),
    mats: { skin: mat, eyes: eyeMats },
    parts: { eyes, teeth, tongue, extras, flames: extras.filter((x) => x.userData.flame) },
    height: D.height, len: D.len, br: D.br, quad: D.quad, scale: 1,
    baby: !!opt.baby,
    dispose() { mat.dispose(); for (const m of eyeMats) m.dispose(); },
  };
  return rig;
}

// a round portrait of a species for the dex (rendered once, cached)
const portraits = new Map();
export function creaturePortrait(renderer, sp, size = 128) {
  const key = (sp.matKey ?? sp.id) + ':' + size;
  if (portraits.has(key)) return portraits.get(key);
  const rig = buildCreature(sp);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x4a4438, 1.8));
  const d = new THREE.DirectionalLight(0xfff4e0, 2.6); d.position.set(-1.5, 2.2, -2.4); scene.add(d);
  scene.add(rig.root);
  rig.root.rotation.y = Math.PI * 0.8;
  rig.root.updateMatrixWorld(true);
  const H = rig.height, Ln = rig.len;
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 200);
  const r = Math.max(H, Ln) * 0.62;
  cam.position.set(0, H * 0.62, -r / Math.tan((14 * Math.PI) / 180));
  cam.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), -0.25);
  cam.lookAt(0, H * 0.5, 0);
  const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4 });
  const buf = new Uint8Array(size * size * 4);
  const prevTone = renderer.toneMapping;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, cam);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  renderer.toneMapping = prevTone;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 1);
  rt.dispose();
  rig.dispose();
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = ((size - 1 - y) * size + x) * 4, o = (y * size + x) * 4;
    img.data[o] = buf[k]; img.data[o + 1] = buf[k + 1]; img.data[o + 2] = buf[k + 2]; img.data[o + 3] = buf[k + 3];
  }
  ctx.putImageData(img, 0, 0);
  const out = { canvas: c, url: c.toDataURL() };
  portraits.set(key, out);
  return out;
}
