// Smooth painting helpers for the higher-detail textures (creatures, props,
// structures): tileable cellular noise, colour maths, linear-filtered data
// textures and normal maps derived from painted height.
import * as THREE from 'three';
import { hash2i } from '../core/rng.js';

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const sstep = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const rgb = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
export const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const put = (arr, i, c) => { arr[i] = clamp01(c[0]) * 255; arr[i + 1] = clamp01(c[1]) * 255; arr[i + 2] = clamp01(c[2]) * 255; arr[i + 3] = 255; };

// tileable cellular noise over the unit square: f1/f2 distances (in cells),
// the random id of the nearest cell and the offset to its centre
export function cell(u, v, nx, ny, seed) {
  const x = u * nx, y = v * ny;
  const xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9, id = 0, dx1 = 0, dy1 = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = xi + dx, cy = yi + dy;
    const wx = ((cx % nx) + nx) % nx, wy = ((cy % ny) + ny) % ny;
    const px = cx + 0.12 + hash2i(wx, wy, seed) * 0.76, py = cy + 0.12 + hash2i(wx, wy, seed + 7) * 0.76;
    const d = Math.hypot(x - px, y - py);
    if (d < f1) { f2 = f1; f1 = d; id = hash2i(wx, wy, seed + 13); dx1 = x - px; dy1 = y - py; } else if (d < f2) f2 = d;
  }
  return { f1, f2, id, dx: dx1, dy: dy1 };
}

export function dataTex(data, w, h, srgb = true, opt = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = opt.wrap ?? THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = opt.anisotropy ?? 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
export function normalTex(hgt, w, h, k, opt) {
  const out = new Uint8Array(w * h * 4);
  const H = (x, y) => hgt[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    out[i] = (-dx / l * 0.5 + 0.5) * 255; out[i + 1] = (dy / l * 0.5 + 0.5) * 255; out[i + 2] = (1 / l * 0.5 + 0.5) * 255; out[i + 3] = 255;
  }
  return dataTex(out, w, h, false, opt);
}
// a grey roughness map (green channel is what three.js reads)
export function roughTex(rough, w, h, opt) {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = clamp01(rough[i]) * 255; out[i * 4] = v; out[i * 4 + 1] = v; out[i * 4 + 2] = v; out[i * 4 + 3] = 255; }
  return dataTex(out, w, h, false, opt);
}

// Paint a texture set with fn(u, v, x, y) -> { c: [r,g,b], h: height, r: roughness }
export function paintSet(w, h, fn, opt = {}) {
  const col = new Uint8Array(w * h * 4), hgt = new Float32Array(w * h), rough = opt.rough ? new Float32Array(w * h) : null;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = fn(x / w, y / h, x, y);
    const i = y * w + x;
    put(col, i * 4, o.c);
    hgt[i] = o.h ?? 0;
    if (rough) rough[i] = o.r ?? opt.rough;
  }
  return {
    map: dataTex(col, w, h, true, opt),
    normalMap: normalTex(hgt, w, h, opt.normal ?? 2, opt),
    roughnessMap: rough ? roughTex(rough, w, h, opt) : null,
  };
}
