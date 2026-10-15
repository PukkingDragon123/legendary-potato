// Shared material factory for texture-array based plant materials and other
// common surfaces. All are patched stock materials (lights, CSM shadows, fog).
import * as THREE from 'three';
import { patchMaterial } from './shaderlib.js';

const ARRAY_HEAD_V = /* glsl */ `
attribute float aLayer;
varying float vLayer;
varying vec2 vUvA;
`;
const ARRAY_MAIN_V = 'vLayer = aLayer; vUvA = uv;';
const ARRAY_HEAD_F = /* glsl */ `
precision highp sampler2DArray;
uniform sampler2DArray tArr;
varying float vLayer;
varying vec2 vUvA;
`;
const ARRAY_MAP = /* glsl */ `
vec4 arrTex = texture( tArr, vec3( vUvA, floor( vLayer + 0.5 ) ) );
diffuseColor *= arrTex;
`;

function batchWindFix(shader) {
  // the stock patch handles instancing; add batching transform for wind world position
  shader.vertexShader = shader.vertexShader.replace(
    'mat3 im = mat3( 1.0 );',
    `mat3 im = mat3( 1.0 );
        #ifdef USE_BATCHING
          wlocal = batchingMatrix * wlocal;
          im = mat3( batchingMatrix );
        #endif`,
  );
}

// opt.normalArr: a matching array of normal maps (relief), applied with a
// screen-space cotangent frame so the geometry needs no tangents.
export function makeArrayMaterial(arrTex, opt = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: opt.roughness ?? 0.9, metalness: 0, vertexColors: true,
    side: opt.side ?? THREE.FrontSide, alphaTest: opt.alphaTest ?? 0, transparent: false,
  });
  if (opt.alphaToCoverage) mat.alphaToCoverage = true;
  patchMaterial(mat, {
    wind: opt.wind,
    translucency: opt.translucency,
    wet: opt.wet,
    uniforms: { tArr: { value: arrTex }, ...(opt.normalArr ? { tArrN: { value: opt.normalArr }, uArrNK: { value: opt.normalScale ?? 1 } } : {}) },
    vertex: { head: ARRAY_HEAD_V, main: ARRAY_MAIN_V },
    fragment: {
      head: ARRAY_HEAD_F + (opt.normalArr ? 'uniform sampler2DArray tArrN;\nuniform float uArrNK;\n' : ''),
      map: ARRAY_MAP,
      emissive: opt.normalArr ? /* glsl */ `{
        vec3 mapN = texture( tArrN, vec3( vUvA, floor( vLayer + 0.5 ) ) ).xyz * 2.0 - 1.0;
        mapN.xy *= uArrNK;
        vec3 q0 = dFdx( - vViewPosition ), q1 = dFdy( - vViewPosition );
        vec2 st0 = dFdx( vUvA ), st1 = dFdy( vUvA );
        vec3 q1p = cross( q1, normal ), q0p = cross( normal, q0 );
        vec3 T = q1p * st0.x + q0p * st1.x, Bt = q1p * st0.y + q0p * st1.y;
        float det = max( dot( T, T ), dot( Bt, Bt ) );
        float sc = det == 0.0 ? 0.0 : inversesqrt( det );
        normal = normalize( T * ( mapN.x * sc ) + Bt * ( mapN.y * sc ) + normal * mapN.z );
      }` : undefined,
    },
  });
  const prev = mat.onBeforeCompile;
  const twoSided = mat.side === THREE.DoubleSide;
  mat.onBeforeCompile = (shader, r) => {
    prev(shader, r); batchWindFix(shader);
    // foliage keeps its sky-leaning normals on both faces, so the undersides
    // of fronds and leaves are not lit like the ground under them
    if (twoSided) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal *= faceDirection;');
  };
  return mat;
}

// Depth material for alpha-cut foliage shadows (same wind + cutout).
export function makeArrayDepthMaterial(arrTex, opt = {}) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaTest: opt.alphaTest ?? 0.5, side: THREE.DoubleSide });
  patchMaterial(mat, {
    wind: opt.wind,
    uniforms: { tArr: { value: arrTex } },
    vertex: { head: ARRAY_HEAD_V, main: ARRAY_MAIN_V },
    fragment: { head: ARRAY_HEAD_F, map: 'diffuseColor.a *= texture( tArr, vec3( vUvA, floor( vLayer + 0.5 ) ) ).a;' },
  });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => { prev(shader, r); batchWindFix(shader); };
  return mat;
}

export function makeWindDepthMaterial(opt = {}) {
  const mat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patchMaterial(mat, { wind: opt.wind });
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => { prev(shader, r); batchWindFix(shader); };
  return mat;
}
