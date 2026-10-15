// Bean scientist models: one sculpted, skinned mesh shared by every explorer
// (see humanDesign.js), dressed by the skin shader. The vertex colours and
// aMat carry slot weights (suit, trim, skin / fabric, metal, gear, glow) and
// the shader mixes the outfit's colours from them, weaves the chosen fabric
// (nylon, quilted, puffer, ripstop, hex plate, leather, canvas, camo) with a
// matching relief, makes the metal parts shine, lights the chrono energy and
// draws the face's mouth (lips, teeth, tongue) straight onto the face plate.
// Eyes are the creatures' shader eyes; brows are little meshes on the head.
import * as THREE from 'three';
import { patchMaterial } from '../gfx/shaderlib.js';
import { speciesData, requestSpecies, eyeMaterial } from './creatureModel.js';
import { BEAN_SPECIES } from './humanDesign.js';

export const requestHuman = () => requestSpecies(BEAN_SPECIES);
export const humanData = () => speciesData(BEAN_SPECIES);

// ------------------------------------------------------------------ fabrics
// id, pattern scale (cycles per metre), sheen, roughness
export const FABRICS = {
  nylon: { id: 0, name: 'Nylon', sc: 260, sheen: 0.4, rough: 0.55 },
  quilted: { id: 1, name: 'Quilted', sc: 15, sheen: 0.5, rough: 0.68 },
  puffer: { id: 2, name: 'Puffer', sc: 23, sheen: 0.35, rough: 0.42 },
  ripstop: { id: 3, name: 'Ripstop', sc: 125, sheen: 0.3, rough: 0.74 },
  hex: { id: 4, name: 'Hex plate', sc: 24, sheen: 0.2, rough: 0.4 },
  leather: { id: 5, name: 'Leather', sc: 230, sheen: 0.25, rough: 0.46 },
  canvas: { id: 6, name: 'Canvas', sc: 340, sheen: 0.55, rough: 0.9 },
  camo: { id: 7, name: 'Camo', sc: 7, sheen: 0.4, rough: 0.82 },
};

const HUMAN = {
  vertex: {
    head: 'attribute vec4 aMat; attribute float aAO; varying vec4 vMat; varying float vAO; varying vec3 vRest; varying vec3 vRestN;',
    main: 'vMat = aMat; vAO = aAO; vRest = position; vRestN = normal;',
  },
  fragment: {
    head: /* glsl */ `
      varying vec4 vMat; varying float vAO; varying vec3 vRest; varying vec3 vRestN;
      uniform vec3 uSuit; uniform vec3 uTrim; uniform vec3 uSkin; uniform vec3 uGear; uniform vec3 uDark; uniform vec3 uMetal; uniform vec3 uGlowCol;
      uniform vec4 uFab; uniform vec4 uFlash; uniform vec4 uMouthA; uniform vec4 uMouthB; uniform vec4 uFace; uniform vec4 uCore; uniform vec4 uMisc;
      float hm_h31( vec3 p ) { p = fract( p * 0.3183099 + 0.1 ); p *= 17.0; return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) ); }
      float hm_vn( vec3 x ) {
        vec3 i = floor( x ); vec3 f = fract( x ); f = f * f * ( 3.0 - 2.0 * f );
        return mix( mix( mix( hm_h31( i ), hm_h31( i + vec3( 1, 0, 0 ) ), f.x ), mix( hm_h31( i + vec3( 0, 1, 0 ) ), hm_h31( i + vec3( 1, 1, 0 ) ), f.x ), f.y ),
                    mix( mix( hm_h31( i + vec3( 0, 0, 1 ) ), hm_h31( i + vec3( 1, 0, 1 ) ), f.x ), mix( hm_h31( i + vec3( 0, 1, 1 ) ), hm_h31( i + vec3( 1, 1, 1 ) ), f.x ), f.y ), f.z );
      }
      vec2 hm_cell( vec3 x ) {
        vec3 i = floor( x ); vec3 f = fract( x ); float d1 = 8.0, d2 = 8.0;
        for ( int k = -1; k <= 1; k++ ) for ( int j = -1; j <= 1; j++ ) for ( int l = -1; l <= 1; l++ ) {
          vec3 g = vec3( float( l ), float( j ), float( k ) );
          vec3 o = vec3( hm_h31( i + g ), hm_h31( i + g + 17.31 ), hm_h31( i + g + 41.7 ) );
          vec3 r = g + o - f; float d = dot( r, r );
          if ( d < d1 ) { d2 = d1; d1 = d; } else if ( d < d2 ) d2 = d;
        }
        return sqrt( vec2( d1, d2 ) );
      }
      vec3 hm_bump( vec3 surf_pos, vec3 surf_norm, float hgt ) {
        vec3 vSigmaX = dFdx( surf_pos ), vSigmaY = dFdy( surf_pos );
        vec3 R1 = cross( vSigmaY, surf_norm ), R2 = cross( surf_norm, vSigmaX );
        float fDet = dot( vSigmaX, R1 );
        vec2 dH = vec2( dFdx( hgt ), dFdy( hgt ) );
        vec3 vGrad = sign( fDet ) * ( dH.x * R1 + dH.y * R2 );
        return normalize( abs( fDet ) * surf_norm - vGrad );
      }
      // distance to the nearest whole number (seams sit on the integers)
      float hm_ds( float v ) { return 0.5 - abs( fract( v ) - 0.5 ); }
      // fabric relief: x height, y seam (darkens), z second colour (camo), w seam glow (hex)
      vec4 hm_fabric( vec3 p, vec3 n, float type, float sc ) {
        vec3 q = p * sc;
        vec3 an = abs( n );
        vec3 tw = an * an * an * an; tw /= dot( tw, vec3( 1.0 ) );
        float fw = max( max( fwidth( q.x ), fwidth( q.y ) ), fwidth( q.z ) );
        float fade = 1.0 - smoothstep( 0.12, 0.4, fw );
        float sfade = 1.0 - smoothstep( 0.06, 0.22, fw ); // seams thinner than a pixel fade away
        float aa = clamp( fw * 1.5, 0.004, 0.25 );
        vec4 r = vec4( 0.5, 0.0, 0.0, 0.0 );
        if ( type < 0.5 ) {
          // nylon: a fine diagonal twill with soft slubs
          float t = sin( ( q.x + q.y * 0.9 - q.z ) * 6.2831 ) * 0.5 + 0.5;
          r.x = 0.5 + ( t - 0.5 ) * 0.3 * fade + ( hm_vn( p * 60.0 ) - 0.5 ) * 0.3;
        } else if ( type < 1.5 || type > 3.5 && type < 4.5 ) {
          // quilted diamonds / hex plates, in the plane facing each axis
          float h = 0.0, s = 0.0, g = 0.0;
          for ( int k = 0; k < 3; k++ ) {
            vec2 uv = k == 0 ? q.zy : k == 1 ? q.xz : q.xy;
            float d;
            if ( type < 1.5 ) d = min( hm_ds( uv.x + uv.y ), hm_ds( uv.x - uv.y ) );
            else {
              vec2 hs = vec2( 1.0, 1.7320508 );
              vec2 a = mod( uv, hs ) - hs * 0.5, b = mod( uv - hs * 0.5, hs ) - hs * 0.5;
              vec2 c = dot( a, a ) < dot( b, b ) ? a : b;
              c = abs( c );
              d = 0.5 - max( dot( c, normalize( hs ) ), c.x );
            }
            float wk = tw[ k ];
            h += ( type < 1.5 ? sqrt( smoothstep( 0.0, 0.32, d ) ) : smoothstep( 0.0, 0.07, d ) ) * wk;
            s += ( 1.0 - smoothstep( 0.022 - aa, 0.022 + aa, d ) ) * wk;
            // a stitched thread along quilting seams
            g += ( 1.0 - smoothstep( 0.012, 0.012 + aa, d ) ) * step( 0.5, fract( ( uv.x - uv.y ) * 4.0 ) ) * wk;
          }
          r.x = mix( 0.5, h, fade * ( type < 1.5 ? 0.9 : 1.0 ) + ( type < 1.5 ? 0.1 : 0.0 ) );
          r.y = s * 0.7 * sfade;
          r.w = type < 1.5 ? -g * fade * sfade : s * sfade;
        } else if ( type < 2.5 ) {
          // puffer: horizontal channels
          float d = hm_ds( q.y );
          r.x = sqrt( smoothstep( 0.0, 0.42, d ) );
          r.y = ( 1.0 - smoothstep( 0.025 - aa, 0.025 + aa, d ) ) * sfade;
        } else if ( type < 3.5 ) {
          // ripstop: a raised grid of thicker threads over a fine weave
          vec3 lw = 1.0 - an * an;
          float l = max( max( ( 1.0 - smoothstep( 0.06 - aa, 0.06 + aa, hm_ds( q.x ) ) ) * lw.x, ( 1.0 - smoothstep( 0.06 - aa, 0.06 + aa, hm_ds( q.y ) ) ) * lw.y ), ( 1.0 - smoothstep( 0.06 - aa, 0.06 + aa, hm_ds( q.z ) ) ) * lw.z );
          r.x = 0.45 + l * 0.5 * fade + ( hm_vn( q * 3.1 ) - 0.5 ) * 0.1 * fade;
          r.y = l * 0.35 * fade;
        } else if ( type < 5.5 ) {
          // leather: pebbled grain
          vec2 c = hm_cell( q * 0.25 );
          float pb = 1.0 - smoothstep( 0.15, 0.8, c.x );
          r.x = 0.5 + ( pb - 0.5 ) * 0.7 * ( 0.3 + 0.7 * fade );
          r.y = ( 1.0 - smoothstep( 0.02, 0.12, c.y - c.x ) ) * 0.3 * fade;
        } else if ( type < 6.5 ) {
          // canvas: a coarse basket weave
          float h = 0.0;
          for ( int k = 0; k < 3; k++ ) {
            vec2 uv = k == 0 ? q.zy : k == 1 ? q.xz : q.xy;
            h += ( sin( uv.x * 6.2831 ) * sin( uv.y * 6.2831 ) * 0.5 + 0.5 ) * tw[ k ];
          }
          r.x = 0.5 + ( h - 0.5 ) * 0.6 * fade + ( hm_vn( p * 45.0 ) - 0.5 ) * 0.35;
        } else {
          // camo blotches in the trim colour and a darker shade
          float c = hm_vn( q ) * 0.6 + hm_vn( q * 2.3 + 4.1 ) * 0.4;
          r.z = smoothstep( 0.55, 0.58, c );
          r.y = ( 1.0 - smoothstep( 0.3, 0.33, c ) ) * 0.6;
          r.x = 0.5 + ( hm_vn( p * 180.0 ) - 0.5 ) * 0.4;
        }
        return r;
      }
      // the mouth, drawn on the face plate: x across, y up, metres from its centre
      vec4 hm_mouth( vec2 q, out float hmMouthIn ) {
        float W = max( 0.006, uMouthA.x ), O = uMouthA.y, S = uMouthA.z, A = uMouthA.w;
        float P = uMouthB.x, Tt = uMouthB.y, G = uMouthB.z, sty = uMouthB.w;
        float aa = max( fwidth( q.x ), fwidth( q.y ) ) * 1.1 + 2e-5;
        float u = clamp( q.x / W, -1.0, 1.0 );
        float ends = u * u;
        float corner = ( S * 0.0147 + A * u * 0.0126 ) * ends;
        float rU = sqrt( max( 0.0, 1.0 - ends ) );
        float openU = O * ( P > 0.01 ? ( 1.0 - P ) * pow( max( 0.0, 1.0 - ends ), 0.7 ) + P * rU : pow( max( 0.0, 1.0 - ends ), 0.75 ) );
        float yu = corner + openU * 0.28 + S * 0.0017 * ( 1.0 - ends );
        float yl = corner - openU * 0.95 - max( 0.0, -S ) * 0.0034 * ( 1.0 - ends ) - 0.0007;
        yl = min( yl, yu - 0.0009 * ( 1.0 - ends ) );
        float dv = min( yu - q.y, q.y - yl );
        float dh = ( 1.0 - abs( q.x / W ) ) * W;
        float din = min( dv, dh * 0.6 );
        float inside = smoothstep( -aa, aa, din );
        hmMouthIn = inside;
        // lips: a darker band around the opening, fuller when it is open
        float th = 0.0016 + O * 0.045 + max( 0.0, P ) * 0.002;
        float lips = ( 1.0 - smoothstep( th - aa, th + aa, -din ) ) * ( 1.0 - inside );
        lips *= smoothstep( 1.25, 0.95, abs( q.x / W ) );
        // corner dimples when smiling
        float dimple = 0.0;
        for ( int s2 = -1; s2 <= 1; s2 += 2 ) {
          vec2 c = vec2( float( s2 ) * W * 1.04, corner + 0.003 * S );
          float dd = length( q - c );
          dimple += ( 1.0 - smoothstep( 0.0018, 0.0018 + aa * 2.0, abs( dd - 0.0045 ) ) ) * step( q.y, c.y + 0.002 ) * step( 0.0, float( s2 ) * ( q.x - c.x ) + 0.002 ) * max( 0.0, S - 0.3 ) * 0.8;
        }
        // inside: dark, a little lighter towards the bottom
        float open = yu - yl;
        vec3 col = mix( vec3( 0.07, 0.012, 0.02 ), vec3( 0.3, 0.05, 0.08 ), smoothstep( yu, yl, q.y ) * 0.6 );
        col *= 0.55 + 0.45 * smoothstep( 0.0, 0.004, din );
        // upper teeth
        float gapH = max( 0.0, O * 1.2 - 0.0017 );
        float th2 = min( 0.0105, gapH * 0.55 ) * Tt;
        float um = u;
        if ( sty > 0.5 && sty < 1.5 ) th2 *= abs( um ) < 0.15 ? 1.9 : 0.3;
        if ( sty > 1.5 && sty < 2.5 && abs( um - 0.07 ) < 0.07 ) th2 = 0.0;
        float fang = sty > 2.5 ? 1.0 - smoothstep( 0.0, 0.09, abs( abs( um ) - 0.45 ) ) : 0.0;
        th2 *= 1.0 + fang * 1.4;
        float toothY = yu - th2 * ( 1.0 - fang * 0.5 * smoothstep( 0.0, 0.08, abs( abs( um ) - 0.45 ) ) );
        float teeth = smoothstep( toothY - aa, toothY + aa, q.y ) * step( abs( um ), 0.82 ) * step( 0.0001, th2 );
        float gaps = 1.0 - smoothstep( 0.0, 0.05 + aa * 6.0 / W, abs( fract( um * 3.2 + 0.5 ) - 0.5 ) );
        vec3 tooth = vec3( 0.95, 0.93, 0.86 ) * ( 0.78 + 0.22 * smoothstep( yu, toothY, q.y ) );
        tooth = mix( tooth, vec3( 0.55, 0.45, 0.42 ), gaps * 0.7 );
        col = mix( col, tooth, teeth );
        // lower teeth peek out of a wide grin
        float lth = min( 0.006, gapH * 0.3 ) * Tt * smoothstep( 0.6, 1.0, S );
        col = mix( col, vec3( 0.9, 0.88, 0.8 ) * 0.85, smoothstep( yl + lth + aa, yl + lth - aa, q.y ) * step( abs( um ), 0.6 ) * step( 0.0001, lth ) );
        // tongue: at the bottom of the mouth, flopping out over the chin when it is out
        vec2 tc = vec2( A * W * 0.3, yl + 0.0045 - G * 0.017 );
        vec2 tr = vec2( min( W * 0.55, 0.026 ) * ( 1.0 + G * 0.15 ), 0.0075 + G * 0.012 );
        float td = length( ( q - tc ) / tr );
        float tongue = 1.0 - smoothstep( 1.0 - aa / tr.y, 1.0 + aa / tr.y, td );
        vec3 tcol = vec3( 0.86, 0.36, 0.42 ) * ( 0.7 + 0.3 * smoothstep( 1.0, 0.2, td ) );
        tcol *= 1.0 - ( 1.0 - smoothstep( 0.0, 0.0012 + aa, abs( q.x - tc.x ) ) ) * smoothstep( 0.2, 0.6, ( q.y - tc.y + tr.y ) / tr.y ) * 0.25;
        float tIn = tongue * inside * ( 1.0 - teeth );
        float tOut = tongue * step( q.y, yl ) * smoothstep( 0.25, 0.45, G );
        col = mix( col, tcol, tIn );
        float alpha = max( inside, max( lips, tOut ) );
        vec3 lipCol = uSkin * vec3( 0.62, 0.5, 0.5 ) * uMisc.w + vec3( 0.06, 0.0, 0.01 );
        vec3 outC = mix( lipCol, col, inside );
        outC = mix( outC, tcol, tOut * ( 1.0 - inside ) );
        alpha = max( alpha, dimple );
        outC = mix( outC, lipCol, dimple * ( 1.0 - max( inside, lips ) ) );
        return vec4( outC, alpha );
      }`,
    main: /* glsl */ `
      float hmS = vColor.r, hmT = vColor.g, hmK = vColor.b, hmG = vMat.z;
      float hmR = max( 0.0, 1.0 - hmS - hmT - hmK - hmG );
      float hmMet = clamp( vMat.y / max( hmR, 1e-3 ), 0.0, 1.0 );
      float hmGlow = vMat.w;
      float hmFabK = clamp( vMat.x, 0.0, 1.0 );
      vec4 hmF = hm_fabric( vRest, vRestN, uFab.x, uFab.y );
      vec3 hmSuit = mix( uSuit, uTrim, hmF.z );
      hmSuit = mix( hmSuit, uSuit * 0.55, hmF.y * step( 6.5, uFab.x ) );
      vec3 hmBase = hmSuit * hmS + uTrim * hmT + uSkin * hmK + uGear * hmG + mix( uDark, uMetal, hmMet ) * hmR;
      // seams sink into shadow; glow lights the seams of hex plates
      hmBase *= 1.0 - hmF.y * 0.2 * hmFabK * step( uFab.x, 6.5 );
      hmBase = mix( hmBase, hmBase * 1.25 + 0.04, clamp( -hmF.w, 0.0, 1.0 ) * hmFabK * 0.6 );
      // gear (gloves, boots) and rubber get a fine grain
      float hmGrain = hm_vn( vRest * 420.0 ) * 0.6 + hm_vn( vRest * 90.0 ) * 0.4;
      hmBase *= 1.0 + ( hmGrain - 0.5 ) * 0.12 * ( hmG + hmR * ( 1.0 - hmMet ) );
      // the face: blush and the mouth
      float hmMouthIn = 0.0;
      float hmFaceK = smoothstep( 0.6, 0.9, hmK ) * uFace.w;
      if ( hmFaceK > 0.0 ) {
        vec2 hmCk = vec2( abs( vRest.x ) - uMisc.y, vRest.y - uMisc.z );
        hmBase = mix( hmBase, mix( hmBase, vec3( 0.92, 0.3, 0.34 ), 0.55 ), uFace.z * ( 1.0 - smoothstep( 0.008, 0.032, length( hmCk ) ) ) * hmFaceK );
        vec4 hmM = hm_mouth( vRest.xy - uFace.xy, hmMouthIn );
        hmBase = mix( hmBase, hmM.rgb, hmM.a * hmFaceK );
        hmMouthIn *= hmFaceK;
      }
      // trail dust on boots and shins
      float hmDirt = uMisc.x * ( 1.0 - smoothstep( 0.02, 0.36, vRest.y ) ) * ( 0.5 + 0.5 * hm_vn( vRest * 24.0 ) ) * ( 1.0 - hmGlow ) * ( 1.0 - hmMet * hmR );
      hmBase = mix( hmBase, vec3( 0.36, 0.3, 0.22 ), hmDirt * 0.55 );
      // the chrono energy parts glow from inside
      hmBase = mix( hmBase, uGlowCol * 0.55 + 0.25, hmGlow );
      hmBase *= 1.0 - 0.25 * uWetness * ( hmFabK + hmG );
      diffuseColor.rgb = hmBase * mix( 1.0, vAO, 0.55 );`,
    emissive: /* glsl */ `
      {
        // fabric relief (fades with distance) and the bump of the seams
        float hmD = length( vViewPosition );
        float hmBk = ( hmFabK * ( 0.003 * ( 1.0 - smoothstep( 3.0, 14.0, hmD ) ) ) + ( hmG + hmR * ( 1.0 - hmMet ) ) * 0.0006 * ( 1.0 - smoothstep( 1.0, 5.0, hmD ) ) * 3.0 ) * ( 1.0 - hmMouthIn );
        float hmHgt = ( hmF.x * hmFabK + hmGrain * ( 1.0 - hmFabK ) ) * hmBk;
        if ( hmBk > 1e-6 ) normal = hm_bump( -vViewPosition, normal, hmHgt );
        float hmRough = uFab.w * hmS + mix( uFab.w, 0.6, 0.5 ) * hmT + 0.46 * hmK + 0.58 * hmG + mix( 0.72, 0.3, hmMet ) * hmR;
        hmRough = mix( hmRough, 0.12, hmGlow );
        hmRough = mix( hmRough, 0.25, hmMouthIn );
        roughnessFactor = clamp( hmRough * ( 1.0 - 0.5 * uWetness ), 0.08, 1.0 );
        metalnessFactor = hmR * hmMet * 0.9 * ( 1.0 - hmGlow );
        vec3 hmV = normalize( vViewPosition );
        float hmFr = 1.0 - clamp( dot( normal, hmV ), 0.0, 1.0 );
        float hmDay = 1.0 - uNight * 0.85;
        // velvety sheen on fabric, a soft warm rim on skin
        totalEmissiveRadiance += diffuseColor.rgb * pow( hmFr, 2.4 ) * uFab.z * ( hmFabK * ( hmS + hmT ) ) * 0.8 * hmDay;
        totalEmissiveRadiance += vec3( 1.0, 0.45, 0.35 ) * uSkin * pow( hmFr, 3.0 ) * 0.22 * hmK * hmDay;
        // chrono energy: a slow pulse, a swirl in the chest core, bubbles rising in the tubes
        float hmPulse = 0.8 + 0.2 * sin( uTime * 2.2 + vRest.y * 6.0 );
        vec3 hmCd = vRest - uCore.xyz;
        float hmCr = length( hmCd.xy );
        if ( hmCr < 0.04 && hmCd.z < 0.02 ) {
          float a = atan( hmCd.y, hmCd.x );
          float sw = sin( a * 3.0 + hmCr * 160.0 - uTime * 3.5 ) * 0.5 + 0.5;
          hmPulse *= 0.7 + 0.6 * sw + 0.6 * ( 1.0 - smoothstep( 0.0, 0.012, hmCr ) );
        }
        hmPulse *= 0.85 + 0.3 * smoothstep( 0.6, 1.0, sin( vRest.y * 90.0 - uTime * 4.0 ) );
        totalEmissiveRadiance += uGlowCol * hmGlow * uCore.w * hmPulse * ( 1.0 + uNight * 1.6 );
        // hex plates glow faintly along their seams
        totalEmissiveRadiance += uGlowCol * clamp( hmF.w, 0.0, 1.0 ) * step( 3.5, uFab.x ) * step( uFab.x, 4.5 ) * hmFabK * 0.35 * uCore.w * ( 0.6 + uNight );
        totalEmissiveRadiance += uFlash.rgb * uFlash.w;
      }`,
    lights: /* glsl */ `
      reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO;
      {
        vec3 hmL = normalize( ( viewMatrix * vec4( uSunDir, 0.0 ) ).xyz );
        float hmNL = dot( normal, hmL );
        // soft wrap on skin and padded fabric
        float hmWrap = max( 0.0, ( hmNL + 0.45 ) / 1.45 ) - max( 0.0, hmNL );
        reflectedLight.directDiffuse += diffuseColor.rgb * uSunColor * hmWrap * ( hmK * 0.5 + hmFabK * 0.25 ) * ( 1.0 - uNight ) * vAO;
        #if NUM_HEMI_LIGHTS > 0 && !defined( USE_ENVMAP )
        // no environment map: metal and gloss mirror a soft sky and ground
        vec3 hmVd = normalize( vViewPosition );
        vec3 hmRv = reflect( -hmVd, normal );
        float hmUp = dot( hmRv, hemisphereLights[ 0 ].direction );
        vec3 hmSky = mix( hemisphereLights[ 0 ].groundColor * 0.6, hemisphereLights[ 0 ].skyColor * 1.25, smoothstep( -0.25, 0.5, hmUp ) );
        hmSky += hemisphereLights[ 0 ].skyColor * 0.9 * ( 1.0 - smoothstep( 0.0, 0.18, abs( hmUp - 0.05 ) ) );
        float hmFr2 = 0.04 + 0.96 * pow( 1.0 - max( dot( normal, hmVd ), 0.0 ), 5.0 );
        float hmMk = hmR * hmMet;
        vec3 hmSpecC = mix( vec3( hmFr2 ), diffuseColor.rgb * ( 0.6 + 0.4 * hmFr2 ), hmMk );
        reflectedLight.indirectSpecular += hmSky * hmSpecC * ( hmMk * 0.9 + hmGlow * 0.3 + hmMouthIn * 0.2 + 0.05 ) * vAO;
        #endif
      }`,
  },
};

const lin = (hex) => new THREE.Color(hex);
export function humanMaterial(D) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 });
  const A = D.anim;
  const u = {
    uSuit: { value: lin(0xd8742a) }, uTrim: { value: lin(0x2e3440) }, uSkin: { value: lin(0xf0c8a0) }, uGear: { value: lin(0x3a3028) },
    uDark: { value: lin(0x1e1e22) }, uMetal: { value: lin(0xb4bcc4) }, uGlowCol: { value: lin(0x46e0ff) },
    uFab: { value: new THREE.Vector4(0, 260, 0.4, 0.55) },
    uFlash: { value: new THREE.Vector4(1, 1, 1, 0) },
    uMouthA: { value: new THREE.Vector4(0.06, 0.005, 0.35, 0) },
    uMouthB: { value: new THREE.Vector4(0, 0.15, 0, 0) },
    uFace: { value: new THREE.Vector4(D.mouth.c[0], D.mouth.c[1], 0, 1) },
    uCore: { value: new THREE.Vector4(...A.core, 1.6) },
    uMisc: { value: new THREE.Vector4(0.35, A.cheek[0], A.cheek[1], 1) },
  };
  patchMaterial(m, { ...HUMAN, uniforms: u });
  m.userData.u = u;
  return m;
}
// colours from an outfit (sRGB hex) into the material
export function dressMaterial(m, o) {
  const u = m.userData.u;
  u.uSuit.value.set(o.suit); u.uTrim.value.set(o.trim); u.uSkin.value.set(o.skin); u.uGear.value.set(o.gear); u.uGlowCol.value.set(o.glow);
  const f = FABRICS[o.fabric] ?? FABRICS.nylon;
  u.uFab.value.set(f.id, f.sc, f.sheen, f.rough);
}

// ------------------------------------------------------------------ brows
let _browGeo = null;
function browGeo() {
  if (_browGeo) return _browGeo;
  const g = new THREE.CapsuleGeometry(0.0078, 0.04, 4, 10);
  g.rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    p.setY(i, p.getY(i) * 0.78 - 8 * x * x);
    p.setZ(i, p.getZ(i) * 0.6 - 6 * x * x);
  }
  g.computeVertexNormals();
  return (_browGeo = g);
}
const _bm = new Map();
function browMat(hex) {
  if (!_bm.has(hex)) _bm.set(hex, patchMaterial(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8 }), {}));
  return _bm.get(hex);
}
export const browColor = (skin) => { const c = new THREE.Color(skin); const hsl = {}; c.getHSL(hsl); return new THREE.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.8), Math.max(0.08, hsl.l * 0.32)).getHex(); };

// ------------------------------------------------------------------ an instance
const _q = new THREE.Quaternion(), _m4 = new THREE.Matrix4(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
export function buildHuman(outfit, opt = {}) {
  const D = humanData();
  const root = new THREE.Group(); root.name = 'human';
  const bones = D.bones.map((x) => { const bn = new THREE.Bone(); bn.name = x.name; return bn; });
  const roots = [];
  for (const [i, x] of D.bones.entries()) {
    const bn = bones[i];
    if (x.parent < 0) { bn.position.set(...x.pos); roots.push(bn); }
    else { const pp = D.bones[x.parent].pos; bn.position.set(x.pos[0] - pp[0], x.pos[1] - pp[1], x.pos[2] - pp[2]); bones[x.parent].add(bn); }
  }
  const skel = new THREE.Skeleton(bones, D.boneInverses);
  const mat = opt.material ?? humanMaterial(D);
  const lods = D.geo.map((geo, i) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.castShadow = true; m.receiveShadow = true;
    if (i === 0) for (const r of roots) m.add(r);
    m.bind(skel, new THREE.Matrix4());
    m.boundingSphere = geo.boundingSphere.clone();
    m.boundingSphere.radius *= 1.6;
    m.visible = i === 0;
    root.add(m);
    return m;
  });
  const B = Object.fromEntries(bones.map((b) => [b.name, b]));
  const bp = (n) => D.bones[D.bi[n]].pos;
  const onBone = (name, obj, p) => { const q = bp(name); obj.position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]); B[name].add(obj); return obj; };
  // eyes
  const eyeMats = [], eyes = [];
  const eyeGeo = new THREE.SphereGeometry(1, 30, 20);
  for (const e of D.eyes) {
    const em = eyeMaterial(D, { element: null }); eyeMats.push(em);
    const m = new THREE.Mesh(eyeGeo, em);
    m.castShadow = false; m.receiveShadow = true;
    onBone('head', m, e.c);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(...e.dir).normalize());
    m.scale.set(e.r * (e.side < 0 ? -1 : 1), e.r * (e.sy ?? 1), e.r * (e.depth ?? 0.8));
    m.userData.side = e.side;
    eyes.push(m);
  }
  // brows: a pivot on the face, oriented to its surface
  const brows = D.anim.brows.map((b) => {
    const piv = new THREE.Group();
    onBone('head', piv, b.p);
    _z.set(...b.n).normalize(); _x.set(0, 1, 0).cross(_z).normalize(); _y.crossVectors(_z, _x);
    piv.quaternion.setFromRotationMatrix(_m4.makeBasis(_x, _y, _z));
    const bar = new THREE.Mesh(browGeo(), browMat(0x3a2a22));
    bar.position.z = 0.004; bar.castShadow = false;
    piv.add(bar);
    piv.userData.side = b.side; piv.userData.bar = bar; piv.userData.base = piv.position.clone();
    return piv;
  });
  // grips: where held things sit in each fist, in the old wrist-socket frame (arm down -Y, front -Z)
  const A = 0.7;
  const grips = {};
  for (const [n, sd] of [['R', 1], ['L', -1]]) {
    const g = new THREE.Group();
    const th = sd * A, c = Math.cos(th), s = Math.sin(th);
    const cx = sd * -0.026, cy = -0.074;
    g.position.set(cx * c - cy * s, cx * s + cy * c, -0.004);
    g.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), th);
    B['hand' + n].add(g);
    grips[n] = g;
  }
  const H = {
    root, lods, skel, bones: B, D, mat, eyeMats, eyes, brows, grips,
    rest: Object.fromEntries(bones.map((b) => [b.name, { p: b.position.clone(), q: b.quaternion.clone() }])),
    dispose() { if (!opt.material) mat.dispose(); for (const m of eyeMats) m.dispose(); },
  };
  if (outfit) dressHuman(H, outfit);
  return H;
}
export function dressHuman(H, o) {
  if (H.mat.userData.u) dressMaterial(H.mat, o);
  for (const em of H.eyeMats) {
    const u = em.userData.u;
    const iris = new THREE.Color(o.eye);
    u.uIris.value.copy(iris); u.uIris2.value.copy(iris).multiplyScalar(0.38);
    u.uLidCol.value.set(o.skin);
  }
  const bm = browMat(browColor(o.skin));
  for (const b of H.brows) b.userData.bar.material = bm;
}

// ------------------------------------------------------------------ first-person arms
// The same mesh, cut down to one arm and glove (triangles whose vertices
// follow only that arm's bones), on its own skeleton so the viewmodel can
// pose it in front of the camera.
const _fpGeo = {};
function armSubsetGeo(D, n) {
  if (_fpGeo[n]) return _fpGeo[n];
  const geo = D.geo[0];
  const set = new Set(['upperArm', 'forearm', 'hand', 'idx1', 'idx2', 'fng1', 'fng2', 'thb1', 'thb2'].map((b) => D.bi[b + n]));
  const si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index.array;
  // a vertex belongs to the arm only if every bone that moves it does (the shoulder pads also lean on the chest)
  const ok = new Uint8Array(si.count);
  for (let v = 0; v < si.count; v++) { let all = 1; for (let k = 0; k < 4; k++) if (sw.getComponent(v, k) > 0.002 && !set.has(si.getComponent(v, k))) { all = 0; break; } ok[v] = all; }
  const keep = [];
  for (let i = 0; i < idx.length; i += 3) if (ok[idx[i]] && ok[idx[i + 1]] && ok[idx[i + 2]]) keep.push(idx[i], idx[i + 1], idx[i + 2]);
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(geo.attributes)) g.setAttribute(k, a);
  g.setIndex(keep);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
  return (_fpGeo[n] = g);
}
export function buildFPArm(H, n, mat) {
  const D = H.D;
  const bones = D.bones.map((x) => { const b = new THREE.Bone(); b.name = x.name; return b; });
  const B = Object.fromEntries(bones.map((b) => [b.name, b]));
  const rel = (c, p) => { const a = D.bones[D.bi[c]].pos, b = D.bones[D.bi[p]].pos; return new THREE.Vector3(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  for (const f of ['idx1', 'fng1', 'thb1']) { B[f + n].position.copy(rel(f + n, 'hand' + n)); B['hand' + n].add(B[f + n]); }
  for (const [c, p] of [['idx2', 'idx1'], ['fng2', 'fng1'], ['thb2', 'thb1']]) { B[c + n].position.copy(rel(c + n, p + n)); B[p + n].add(B[c + n]); }
  const skel = new THREE.Skeleton(bones, D.boneInverses);
  const mesh = new THREE.SkinnedMesh(armSubsetGeo(D, n), mat);
  mesh.bind(skel, new THREE.Matrix4());
  mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
  return { mesh, bones: B, skel, wristToElbow: rel('forearm' + n, 'hand' + n), wristToShoulder: rel('upperArm' + n, 'hand' + n) };
}
