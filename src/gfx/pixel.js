// PixelPainter: a tiny pixel-art paint program used to hand-paint every texture
// in the game procedurally. Works on raw RGBA buffers (wrap-around aware so
// textures tile seamlessly), with hue-shifted palettes and ordered dithering.
import * as THREE from 'three';
import { RNG, tileFbm } from '../core/rng.js';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER4[(y & 3) * 4 + (x & 3)];

export function hexToRgb(hex) {
  if (Array.isArray(hex)) return hex;
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}
export function rgbToHex([r, g, b]) {
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}
export function mixRgb(a, b, t) {
  a = hexToRgb(a); b = hexToRgb(b);
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
export function shadeRgb(c, f) {
  c = hexToRgb(c);
  return [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)];
}

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}
function hslToRgb([h, s, l]) {
  h = ((h % 1) + 1) % 1;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  if (s === 0) return [l * 255, l * 255, l * 255];
  const hue2 = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2(p, q, h + 1 / 3) * 255, hue2(p, q, h) * 255, hue2(p, q, h - 1 / 3) * 255];
}

// Hue-shifted ramp, the classic pixel-art trick: shadows drift cool and
// saturated, highlights drift warm and soft. Returns array of rgb, dark->light.
const towardHue = (h, target, amt) => {
  let d = target - h;
  d = ((((d + 0.5) % 1) + 1) % 1) - 0.5;
  return h + d * amt;
};
export function ramp(baseHex, steps = 5, opt = {}) {
  const { hueShift = 0.22, light = 0.3, sat = 0.14 } = opt;
  const [h, s, l] = rgbToHsl(hexToRgb(baseHex));
  const out = [];
  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1) - 0.5; // -0.5 (dark) .. 0.5 (light)
    const hh = t > 0 ? towardHue(h, 0.14, t * 2 * hueShift) : towardHue(h, 0.64, -t * 2 * hueShift);
    const ss = t > 0 ? s - t * sat : s - t * sat * 1.2;
    out.push(hslToRgb([hh, ss, l + t * light * 2]));
  }
  return out;
}

export class PixelPainter {
  constructor(w, h = w, seed = 1) {
    this.w = w; this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
    this.rng = new RNG(seed);
    this.seed = seed;
  }

  idx(x, y) {
    x = ((Math.round(x) % this.w) + this.w) % this.w;
    y = ((Math.round(y) % this.h) + this.h) % this.h;
    return (y * this.w + x) * 4;
  }
  set(x, y, c, a = 255) {
    const i = this.idx(x, y), d = this.data;
    c = hexToRgb(c);
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = a;
  }
  // Clipped set (no wrap) for non-tiling art like decals/stickers.
  setc(x, y, c, a = 255) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.set(x, y, c, a);
  }
  get(x, y) {
    const i = this.idx(x, y), d = this.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }
  blend(x, y, c, t) {
    const i = this.idx(x, y), d = this.data;
    c = hexToRgb(c);
    d[i] += (c[0] - d[i]) * t; d[i + 1] += (c[1] - d[i + 1]) * t; d[i + 2] += (c[2] - d[i + 2]) * t;
    if (d[i + 3] < 255) d[i + 3] = Math.max(d[i + 3], 255 * t);
  }
  mul(x, y, f) {
    const i = this.idx(x, y), d = this.data;
    d[i] *= f; d[i + 1] *= f; d[i + 2] *= f;
  }
  alpha(x, y) { return this.data[this.idx(x, y) + 3]; }
  fill(c, a = 255) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c, a);
    return this;
  }
  clear() { this.data.fill(0); return this; }

  // Tileable fbm mapped through a palette with ordered dithering.
  noiseFill(palette, opt = {}) {
    const { scale = 4, octaves = 4, contrast = 1, bias = 0, dither = 1, seed = this.seed, stretchX = 1, stretchY = 1, warp = 0, mask } = opt;
    const n = palette.length;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (mask && !mask(x, y)) continue;
        let u = (x / this.w) * scale * stretchX, v = (y / this.h) * scale * stretchY;
        if (warp) {
          u += warp * (tileFbm(u * 0.5 + 3.1, v * 0.5, scale * stretchX * 0.5, 2, seed + 7) - 0.5);
          v += warp * (tileFbm(u * 0.5, v * 0.5 + 8.2, scale * stretchY * 0.5, 2, seed + 9) - 0.5);
        }
        let f = tileFbm(u, v, Math.max(1, Math.round(scale * stretchX)), octaves, seed);
        f = (f - 0.5) * contrast + 0.5 + bias;
        f += (bayer(x, y) - 0.5) * dither / n;
        const k = Math.max(0, Math.min(n - 1, Math.floor(f * n)));
        this.set(x, y, palette[k]);
      }
    }
    return this;
  }

  // Per-pixel jitter: subtle brightness speckle (kept tiny so it reads as texture, not noise).
  speckle(amount = 0.06, prob = 0.3) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.rng.next() < prob && this.alpha(x, y) > 0) this.mul(x, y, 1 + (this.rng.next() - 0.5) * 2 * amount);
    }
    return this;
  }

  rect(x0, y0, w, h, c, a = 255) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, c, a);
    return this;
  }
  rectc(x0, y0, w, h, c, a = 255) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.setc(x, y, c, a);
    return this;
  }

  line(x0, y0, x1, y1, c, opt = {}) {
    const { clip = false, a = 255, blend = 1 } = opt;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4096; guard++) {
      if (blend < 1) this.blend(x0, y0, c, blend);
      else if (clip) this.setc(x0, y0, c, a); else this.set(x0, y0, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  disc(cx, cy, r, c, opt = {}) {
    const { clip = false, a = 255, ry = r } = opt;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        const dx = (x - cx) / r, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) clip ? this.setc(x, y, c, a) : this.set(x, y, c, a);
      }
    }
    return this;
  }

  // Shaded blob (pebble, berry, scale, spot): palette dark->light, lit from top-left.
  blob(cx, cy, rx, ry, pal, opt = {}) {
    const { clip = false, outline = null, lx = -0.6, ly = -0.7, rough = 0.15, a = 255 } = opt;
    const n = pal.length;
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const nz = Math.sqrt(Math.max(0, 1 - d));
        let lit = (-dx * lx - dy * ly) * 0.55 + nz * 0.55;
        lit += (bayer(x, y) - 0.5) * 0.3 + (this.rng.next() - 0.5) * rough;
        const k = Math.max(0, Math.min(n - 1, Math.floor(lit * n)));
        clip ? this.setc(x, y, pal[k], a) : this.set(x, y, pal[k], a);
        if (outline && d > 0.62 && dx * lx + dy * ly > 0.2) clip ? this.setc(x, y, outline, a) : this.set(x, y, outline, a);
      }
    }
    return this;
  }

  // Scatter callback n times with random position.
  scatter(n, fn) {
    for (let i = 0; i < n; i++) fn(this.rng.next() * this.w, this.rng.next() * this.h, i, this.rng);
    return this;
  }

  // Random-walk crack line with dark core + light lip.
  crack(x, y, len, dark, light, opt = {}) {
    let ang = opt.angle ?? this.rng.next() * Math.PI * 2;
    for (let i = 0; i < len; i++) {
      this.set(x, y, dark);
      if (light) this.set(x + 1, y + 1, light);
      ang += (this.rng.next() - 0.5) * (opt.wiggle ?? 0.9);
      x += Math.cos(ang); y += Math.sin(ang);
      if (opt.branch && this.rng.next() < opt.branch) this.crack(x, y, Math.floor(len * 0.4), dark, light, { ...opt, branch: 0, angle: ang + (this.rng.next() < 0.5 ? 1 : -1) * 0.9 });
    }
    return this;
  }

  // Darken pixels next to transparent pixels (1px outline inside the shape).
  innerOutline(c, alphaThreshold = 128, onlyBottomRight = false) {
    const out = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.alpha(x, y) < alphaThreshold) continue;
      const nb = onlyBottomRight ? [[1, 0], [0, 1]] : [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dy] of nb) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= this.w || yy >= this.h || this.alpha(xx, yy) < alphaThreshold) { out.push([x, y]); break; }
      }
    }
    for (const [x, y] of out) this.set(x, y, c);
    return this;
  }

  // Vertical gradient multiply (e.g. AO at bottom of grass/bark).
  vGradient(top, bottom, opt = {}) {
    const { blend = 1 } = opt;
    for (let y = 0; y < this.h; y++) {
      const t = y / (this.h - 1);
      const f = top + (bottom - top) * t;
      for (let x = 0; x < this.w; x++) {
        const d = bayer(x, y) * 0.04 * blend;
        this.mul(x, y, f + d);
      }
    }
    return this;
  }

  // Map every pixel's luminance through a palette (posterize + recolor).
  posterize(pal, opt = {}) {
    const { dither = 0.6 } = opt;
    const n = pal.length;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const [r, g, b, a] = this.get(x, y);
      if (a === 0) continue;
      let l = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
      l += (bayer(x, y) - 0.5) * dither / n;
      const k = Math.max(0, Math.min(n - 1, Math.floor(l * n)));
      this.set(x, y, pal[k], a);
    }
    return this;
  }

  copyFrom(other, ox = 0, oy = 0, opt = {}) {
    const { clip = true, alphaOnly = false } = opt;
    for (let y = 0; y < other.h; y++) for (let x = 0; x < other.w; x++) {
      const [r, g, b, a] = other.get(x, y);
      if (a < 8) continue;
      if (clip) this.setc(x + ox, y + oy, [r, g, b], alphaOnly ? a : 255);
      else this.set(x + ox, y + oy, [r, g, b], 255);
    }
    return this;
  }

  // Build a THREE texture with crisp pixel magnification and smooth mips.
  texture(opt = {}) {
    const { repeat = [1, 1], srgb = true, wrap = THREE.RepeatWrapping, nearestMin = false, anisotropy = 8, flipY = false } = opt;
    const tex = new THREE.DataTexture(this.data, this.w, this.h, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = wrap;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = nearestMin ? THREE.NearestMipmapLinearFilter : THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = anisotropy;
    tex.flipY = flipY;
    tex.repeat.set(repeat[0], repeat[1]);
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  // Derive a crude normal map from luminance (for bumpy pixel surfaces).
  normalTexture(strength = 2, opt = {}) {
    const w = this.w, h = this.h;
    const lum = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const [r, g, b] = this.get(x, y);
      lum[y * w + x] = (0.3 * r + 0.59 * g + 0.11 * b) / 255;
    }
    const out = new Uint8ClampedArray(w * h * 4);
    const L = (x, y) => lum[(((y % h) + h) % h) * w + (((x % w) + w) % w)];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (L(x + 1, y) - L(x - 1, y)) * strength;
      const dy = (L(x, y + 1) - L(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out[i] = (-dx / len * 0.5 + 0.5) * 255;
      out[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      out[i + 3] = 255;
    }
    const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
    tex.wrapS = tex.wrapT = opt.wrap ?? THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }
}

// Stack many same-size painters into a texture array (used by terrain).
export function makeArrayTexture(painters, opt = {}) {
  const w = painters[0].w, h = painters[0].h;
  const data = new Uint8Array(w * h * 4 * painters.length);
  painters.forEach((p, i) => data.set(p.data, i * w * h * 4));
  const tex = new THREE.DataArrayTexture(data, w, h, painters.length);
  tex.format = THREE.RGBAFormat;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = opt.anisotropy ?? 8;
  if (opt.srgb !== false) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
