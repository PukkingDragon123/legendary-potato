// Painted textures for player-built structures and props: thatch, log walls,
// planks, bark, end grain, stone, brick and scrap metal, plus prop fabrics
// (canvas, red cloth, straw, soil, hide, patchwork). Smooth, detailed and
// linear-filtered, each with a normal map painted from height (grain,
// gaps, mortar, weave) and most with a roughness map. A tile maps to 2 m.
import * as THREE from 'three';
import { tileFbm, tileNoise, hash2i } from '../core/rng.js';
import { sstep, rgb, mix3, mul3, cell, paintSet } from './paint.js';

const cache = {};
const once = (k, f) => cache[k] ?? (cache[k] = f());
const fbm = (x, y, p, o, s) => tileFbm(x, y, p, o, s);

// ---------------------------------------------------------------- wood
function planks(seed = 63, vertical = false) {
  const N = 4; // boards per tile
  const light = rgb(0xb88a58), dark = rgb(0x7a5030), grey = rgb(0x8a8070);
  return paintSet(256, 256, (u, v) => {
    const a = vertical ? u : v, b = vertical ? v : u; // a: across the boards, b: along
    const board = Math.floor(a * N), la = a * N - board;
    const bb = (b + hash2i(board, 0, seed)) % 1;
    const tone = 0.86 + hash2i(board, 1, seed) * 0.26;
    let c = mix3(light, dark, hash2i(board, 2, seed) * 0.6);
    c = mix3(c, grey, hash2i(board, 3, seed) * 0.25); // some boards weathered grey
    // grain: long wavy figure lines along the board
    const g1 = fbm(bb * 4, la * 2 + board * 3.3, 4, 4, seed + board);
    // a knot in some boards: grain swirls around it
    const kb = hash2i(board, 4, seed), ka = 0.3 + hash2i(board, 5, seed) * 0.4;
    const hasKnot = hash2i(board, 6, seed) > 0.45;
    const kd = hasKnot ? Math.hypot((((bb - kb + 1.5) % 1) - 0.5) * N * 1.6, la - ka) : 9;
    const swirl = hasKnot ? Math.exp(-kd * 5) * 0.6 : 0;
    const w = la * 7 + g1 * 2.4 + swirl * Math.sin(Math.atan2(la - ka, bb - kb) * 2) + board * 1.7;
    const line = 1 - sstep(0.0, 0.22, Math.abs(Math.sin(w * Math.PI)));
    const fine = fbm(bb * 32, la * 2, 32, 2, seed + 9);
    c = mul3(c, tone * (0.82 + g1 * 0.32) * (1 - line * 0.22) * (0.95 + fine * 0.1));
    let h = 0.5 + g1 * 0.25 - line * 0.12;
    if (hasKnot && kd < 0.09) { const k = sstep(0.09, 0.03, kd); c = mix3(c, mul3(dark, 0.55), k); h -= k * 0.15; }
    // bevelled edges, dark gaps, butt joints, nails
    const edge = Math.min(la, 1 - la);
    const bevel = sstep(0.0, 0.07, edge);
    h *= bevel;
    c = mul3(c, 0.55 + 0.45 * bevel + (edge < 0.12 && edge > 0.03 ? 0.06 : 0));
    const joint = Math.min(bb, 1 - bb) * N;
    if (joint < 0.03) { h *= joint / 0.03; c = mul3(c, 0.5 + joint / 0.06); }
    for (const nb of [0.06, 0.94]) for (const na of [0.25, 0.75]) {
      const nd = Math.hypot((bb - nb) * N, la - na);
      if (nd < 0.05) { const k = sstep(0.05, 0.025, nd); c = mix3(c, nd < 0.02 ? [0.72, 0.7, 0.66] : [0.22, 0.2, 0.19], k); h += k * 0.05; }
    }
    return { c, h, r: 0.86 - line * 0.05 - (1 - bevel) * 0.1 };
  }, { normal: 3, rough: 0.85 });
}
function logs(seed = 62) {
  const N = 4;
  const wood = rgb(0xa47648), bark = rgb(0x5a3e2a), chink = rgb(0x7a705e);
  return paintSet(256, 256, (u, v) => {
    const row = Math.floor(v * N), la = v * N - row;
    const bu = (u + hash2i(row, 0, seed)) % 1;
    const prof = Math.sqrt(Math.max(0, 1 - (la * 2 - 1) ** 2));
    const g = fbm(bu * 3, la * 3 + row, 3, 4, seed + row);
    const streak = fbm(bu * 2, la * 24, 2, 3, seed + 50);
    let c = mul3(wood, (0.75 + g * 0.35) * (0.92 + hash2i(row, 2, seed) * 0.16));
    c = mul3(c, 0.9 + streak * 0.15);
    // drying checks (cracks) along the log
    const chk = 1 - sstep(0.0, 0.05, Math.abs(fbm(bu * 2, la * 3 + row * 5, 2, 3, seed + 70) - 0.5));
    c = mul3(c, 1 - chk * 0.5 * prof);
    // bark left near the top and bottom of each log
    const barkK = sstep(0.32, 0.2, Math.min(la, 1 - la)) * sstep(0.35, 0.65, g);
    c = mix3(c, mul3(bark, 0.8 + streak * 0.3), barkK);
    let h = prof * 1.0 - chk * 0.06 + barkK * 0.03;
    // chinking between the logs
    const e = Math.min(la, 1 - la);
    if (e < 0.06) { const k = sstep(0.06, 0.02, e); c = mix3(c, mul3(chink, 0.8 + fbm(u * 16, v * 16, 16, 2, seed) * 0.3), k); h = h * (1 - k) + 0.05 * k; }
    // log ends (saw cuts) at staggered places
    const ju = Math.min(bu, 1 - bu);
    if (ju < 0.012) { c = mul3(c, 0.45); h *= 0.6; }
    return { c: mul3(c, 0.55 + 0.45 * prof), h, r: 0.88 + barkK * 0.06 };
  }, { normal: 3.2, rough: 0.88 });
}
function bark(seed = 74) {
  const base = rgb(0x6a4a34), plate = rgb(0x8a7462), lichen = rgb(0x8a9a70);
  return paintSet(128, 256, (u, v) => {
    const n = fbm(u * 6, v * 2, 6, 4, seed);
    const ridge = 1 - Math.abs(n * 2 - 1);
    const fis = sstep(0.55, 0.85, ridge);
    let c = mix3(mul3(base, 0.45), plate, fis);
    c = mul3(c, 0.85 + fbm(u * 24, v * 8, 24, 2, seed + 3) * 0.3);
    const lc = cell(u, v, 6, 10, seed + 9);
    if (lc.id > 0.7 && lc.f1 < 0.28) c = mix3(c, lichen, sstep(0.28, 0.12, lc.f1) * 0.6 * fis);
    return { c, h: fis * 0.8 + n * 0.3, r: 0.92 };
  }, { normal: 4, rough: 0.92 });
}
function endgrain(seed = 75) {
  const light = rgb(0xd0aa78), dark = rgb(0xa47848), barkC = rgb(0x5a3e2a);
  return paintSet(128, 128, (u, v) => {
    const dx = u - 0.5, dy = v - 0.5;
    const d = Math.hypot(dx, dy) * 2 + (fbm(u * 4, v * 4, 4, 3, seed) - 0.5) * 0.08;
    const ring = 0.5 + 0.5 * Math.sin(d * 46);
    let c = mix3(dark, light, ring * 0.6 + 0.3);
    const ang = Math.atan2(dy, dx);
    const crack = d > 0.15 && d < 0.85 && Math.abs(Math.sin(ang * 1.5 + 0.7)) < 0.03 * (1 - d) ? 1 : 0;
    c = mul3(c, 1 - crack * 0.6);
    if (d > 0.88) c = mul3(barkC, 0.8 + fbm(u * 12, v * 12, 12, 2, seed) * 0.4);
    if (d > 1.0) c = mul3(barkC, 0.5);
    return { c, h: ring * 0.1 - crack * 0.3 + (d > 0.88 ? 0.2 : 0), r: 0.85 };
  }, { normal: 2, wrap: THREE.ClampToEdgeWrapping });
}
// ---------------------------------------------------------------- thatch + straw
function thatch(seed = 61) {
  const N = 4; // overlapping rows of straw bundles
  const gold = rgb(0xd2aa5c), old = rgb(0x9a8a68), deep = rgb(0x5a4628);
  return paintSet(256, 256, (u, v) => {
    const wav = (fbm(u * 8, 0.5, 8, 2, seed) - 0.5) * 0.12;
    const vv = v * N + wav;
    const row = Math.floor(vv), lv = vv - row;
    const ru = (u + hash2i(row, 0, seed) * 0.37) % 1;
    const strand = fbm(ru * 96, lv * 1.5 + row * 7, 96, 2, seed + row);
    const strand2 = tileNoise(ru * 160, lv * 3 + row * 11, 160, seed + 3);
    const age = fbm(u * 3, v * 3, 3, 3, seed + 5);
    let c = mix3(gold, old, sstep(0.35, 0.75, age));
    c = mul3(c, 0.7 + strand * 0.45 + strand2 * 0.12);
    // each row tucks under the one above: dark near its top, bright cut ends at the bottom
    const shade = 0.35 + 0.65 * sstep(0.0, 0.45, lv);
    c = mix3(mul3(deep, 0.8), c, shade);
    const tips = sstep(0.86, 1.0, lv) * (strand2 > 0.5 ? 1 : 0.6);
    c = mul3(c, 1 + tips * 0.15);
    // binding cord across some rows
    const cord = Math.abs(lv - 0.55) < 0.025 && row % 2 === 0;
    if (cord) c = mix3(c, [0.36, 0.24, 0.14], 0.85);
    return { c, h: lv * 0.7 + strand * 0.35 + (cord ? 0.15 : 0), r: 0.95 };
  }, { normal: 3, rough: 0.95 });
}
function straw(seed = 67) {
  const gold = rgb(0xdcbc68), shadow = rgb(0x8a6a34);
  return paintSet(128, 128, (u, v) => {
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const a = 0.4 + k * 1.1, ca = Math.cos(a), sa = Math.sin(a);
      const pu = (u * ca + v * sa), pv = (-u * sa + v * ca);
      s = Math.max(s, sstep(0.6, 0.9, tileNoise(pu * 48 + k * 5, pv * 6, 48, seed + k)));
    }
    const n = fbm(u * 4, v * 4, 4, 3, seed);
    const c = mix3(mul3(shadow, 0.8 + n * 0.3), mul3(gold, 0.85 + n * 0.3), s);
    return { c, h: s * 0.6 + n * 0.4, r: 0.95 };
  }, { normal: 2.5 });
}
// ---------------------------------------------------------------- masonry
function stone(seed = 64) {
  const R = 5; // rows per tile
  const base = rgb(0x9c978c), warm = rgb(0xa89a84), cool = rgb(0x8a9096), mortar = rgb(0x6e665a), moss = rgb(0x5a7a3a);
  return paintSet(256, 256, (u, v) => {
    const row = Math.floor(v * R), lv = v * R - row;
    // irregular block widths per row
    const off = hash2i(row, 0, seed);
    const su = (u + off) % 1;
    const nb = 3 + Math.floor(hash2i(row, 1, seed) * 2);
    const bi = Math.floor(su * nb), lu = su * nb - bi;
    const id = hash2i(bi, row, seed);
    let c = mix3(base, id > 0.5 ? warm : cool, Math.abs(id - 0.5) * 1.2);
    const n = fbm(u * 8, v * 8, 8, 4, seed), n2 = fbm(u * 24, v * 24, 24, 2, seed + 4);
    c = mul3(c, (0.82 + n * 0.3) * (0.94 + n2 * 0.12) * (0.92 + hash2i(bi, row, seed + 2) * 0.16));
    // edge distance (in block-relative units, scaled to metres-ish), chipped by noise
    const ex = Math.min(lu, 1 - lu) * (1 / nb) * R, ey = Math.min(lv, 1 - lv);
    const e = Math.min(ex * 1.0, ey) - (n2 - 0.5) * 0.05;
    const bevel = sstep(0.02, 0.12, e);
    let h = bevel * (0.7 + n * 0.3);
    c = mul3(c, 0.7 + 0.3 * bevel);
    if (e < 0.04) {
      const k = sstep(0.04, 0.015, e);
      c = mix3(c, mul3(mortar, 0.85 + n2 * 0.3), k);
      h = h * (1 - k);
      if (lv > 0.5 && n > 0.55) c = mix3(c, moss, k * sstep(0.55, 0.7, n)); // moss in the lower joints
    }
    return { c, h, r: 0.9 };
  }, { normal: 3.5, rough: 0.9 });
}
function brick(seed = 65) {
  const R = 8, C = 4;
  const red = rgb(0xb05a3c), dark = rgb(0x7a3a28), mortar = rgb(0xa89a86);
  return paintSet(256, 256, (u, v) => {
    const row = Math.floor(v * R), lv = v * R - row;
    const su = (u + (row % 2) * (0.5 / C)) % 1;
    const bi = Math.floor(su * C), lu = su * C - bi;
    const id = hash2i(bi, row, seed);
    const n = fbm(u * 12, v * 12, 12, 3, seed), sp = tileNoise(u * 96, v * 96, 96, seed + 3);
    let c = mix3(red, dark, id * 0.6);
    c = mul3(c, (0.85 + n * 0.25) * (sp > 0.85 ? 0.75 : 1));
    const e = Math.min(Math.min(lu, 1 - lu) * 2, Math.min(lv, 1 - lv)) - (n - 0.5) * 0.04;
    const bevel = sstep(0.03, 0.12, e);
    let h = bevel * (0.7 + n * 0.2);
    c = mul3(c, 0.75 + 0.25 * bevel);
    if (e < 0.06) { const k = sstep(0.06, 0.03, e); c = mix3(c, mul3(mortar, 0.85 + sp * 0.2), k); h *= 1 - k; }
    return { c, h, r: 0.88 };
  }, { normal: 3.5, rough: 0.88 });
}
// ---------------------------------------------------------------- scrap metal
function metal(seed = 66) {
  const zinc = rgb(0x9aa0a6), rust = rgb(0x9a4e2c), rustD = rgb(0x5a2c1a);
  return paintSet(256, 256, (u, v) => {
    const corr = Math.sin(u * Math.PI * 2 * 16);
    const panel = Math.floor(v * 2), lv = v * 2 - panel;
    let c = mul3(zinc, 0.85 + corr * 0.12 + (fbm(u * 6 + panel, v * 6, 6, 3, seed) - 0.5) * 0.2);
    // rust: patches plus streaks running down from the seams
    const rp = fbm(u * 5, v * 5, 5, 4, seed + 3);
    const streak = fbm(u * 40, v * 3, 40, 2, seed + 8) * sstep(0.35, 0.0, lv);
    const rk = sstep(0.58, 0.72, rp + streak * 0.35);
    c = mix3(c, mix3(rust, rustD, fbm(u * 20, v * 20, 20, 2, seed + 4)), rk);
    let h = corr * 0.5;
    if (lv < 0.025 || lv > 0.975) { c = mul3(c, 0.55); h -= 0.3; }
    // rivets along the seams
    const ru = (u * 16) % 1, rd = Math.hypot(ru - 0.5, (Math.min(lv, 1 - lv) - 0.06) * 16 * 0.5);
    if (rd < 0.18) { const k = sstep(0.18, 0.1, rd); c = mix3(c, [0.78, 0.8, 0.82], k * 0.7); h += k * 0.4; }
    return { c, h, r: 0.42 + rk * 0.45 };
  }, { normal: 2.5, rough: 0.45 });
}
// ---------------------------------------------------------------- fabrics + ground
function cloth(base, seed, stripes = false) {
  const col = rgb(base);
  return paintSet(128, 128, (u, v) => {
    const wx = Math.sin(u * Math.PI * 2 * 48), wy = Math.sin(v * Math.PI * 2 * 48);
    const weave = (wx * 0.5 + 0.5) * (wy > 0 ? 1 : 0.6) + (wy * 0.5 + 0.5) * (wx > 0 ? 0.6 : 1);
    const n = fbm(u * 4, v * 4, 4, 3, seed);
    let c = mul3(col, 0.82 + weave * 0.1 + (n - 0.5) * 0.18);
    if (stripes && Math.floor(v * 8) % 2) c = mul3(mix3(c, [0.95, 0.9, 0.82], 0.75), 1);
    return { c, h: weave * 0.4 + n * 0.3, r: 0.92 };
  }, { normal: 1.6 });
}
function soil(seed = 68) {
  const dark = rgb(0x4a3220), mid = rgb(0x6a4a30), pebble = rgb(0x9a9080);
  return paintSet(128, 128, (u, v) => {
    const furrow = Math.abs(Math.sin(v * Math.PI * 4));
    const n = fbm(u * 6, v * 6, 6, 4, seed), cl = fbm(u * 18, v * 18, 18, 2, seed + 2);
    let c = mix3(dark, mid, furrow * 0.7 + n * 0.3);
    c = mul3(c, 0.85 + cl * 0.3);
    const pc = cell(u, v, 14, 14, seed + 5);
    let h = furrow * 0.8 + cl * 0.3;
    if (pc.id > 0.82 && pc.f1 < 0.2) { const k = sstep(0.2, 0.12, pc.f1); c = mix3(c, mul3(pebble, 0.8 + pc.id * 0.3), k); h += k * 0.3; }
    return { c, h, r: 0.98 };
  }, { normal: 3 });
}
function hide(seed = 69) {
  const tan = rgb(0xa47a50), dark = rgb(0x6a4a30);
  return paintSet(128, 128, (u, v) => {
    const n = fbm(u * 3, v * 3, 3, 4, seed);
    const wr = cell(u, v, 7, 7, seed + 4);
    const wrinkle = 1 - sstep(0.0, 0.08, wr.f2 - wr.f1);
    let c = mix3(dark, tan, 0.55 + n * 0.45);
    c = mul3(c, 1 - wrinkle * 0.18);
    // stitched border
    const e = Math.min(v, 1 - v);
    if (e < 0.05 && Math.floor(u * 32) % 2 === 0 && e > 0.02) c = [0.85, 0.78, 0.62];
    return { c, h: n * 0.4 - wrinkle * 0.2, r: 0.78 };
  }, { normal: 2.2 });
}
function patchwork(seed = 70) {
  const cols = [0xc85a40, 0x4a7aaa, 0xdcb450, 0x6a9a5a, 0xb070a0, 0xe8dcc8].map(rgb);
  return paintSet(128, 128, (u, v) => {
    const px = Math.floor(u * 4), py = Math.floor(v * 4);
    let c = cols[(px * 3 + py * 5) % cols.length];
    const lu = u * 4 - px, lv = v * 4 - py;
    const weave = Math.sin(u * Math.PI * 2 * 40) * Math.sin(v * Math.PI * 2 * 40);
    c = mul3(c, 0.88 + weave * 0.05 + (fbm(u * 4, v * 4, 4, 2, seed) - 0.5) * 0.16);
    const e = Math.min(lu, 1 - lu, lv, 1 - lv);
    let h = 0.5 + weave * 0.1;
    if (e < 0.04) { c = mul3(c, 0.6); h = 0.1; } else if (e < 0.08 && Math.floor((lu + lv) * 24) % 2 === 0) c = [0.94, 0.92, 0.86];
    return { c, h: h + (e > 0.04 ? sstep(0.04, 0.2, e) * 0.3 : 0), r: 0.92 };
  }, { normal: 2 });
}

export const BTEX = {
  bark: () => once('bark', () => bark()),
  endgrain: () => once('endgrain', () => endgrain()),
  thatch: () => once('thatch', () => thatch()),
  logs: () => once('logs', () => logs()),
  plank: () => once('plank', () => planks()),
  plankV: () => once('plankV', () => planks(71, true)),
  stone: () => once('stone', () => stone()),
  brick: () => once('brick', () => brick()),
  metal: () => once('metal', () => metal()),
  canvas: () => once('canvas', () => cloth(0xd8ccaa, 72)),
  red: () => once('redcloth', () => cloth(0xc84a3a, 73, true)),
  straw: () => once('straw', () => straw()),
  soil: () => once('soil', () => soil()),
  hide: () => once('hide', () => hide()),
  patch: () => once('patch', () => patchwork()),
};
// the colour map; its normal / roughness maps ride along in userData
export function bTex(key) {
  const set = BTEX[key]();
  const t = set.map;
  t.userData.normalMap = set.normalMap; t.userData.roughnessMap = set.roughnessMap;
  return t;
}
// material params with the painted normal + roughness maps filled in
export function withMaps(o) {
  const t = o.map;
  if (!t?.userData?.normalMap || o.normalMap) return o;
  const out = { ...o, normalMap: t.userData.normalMap, normalScale: new THREE.Vector2(0.9, 0.9) };
  if (t.userData.roughnessMap && o.metalness === undefined) { out.roughnessMap = t.userData.roughnessMap; out.roughness = 1; }
  return out;
}
