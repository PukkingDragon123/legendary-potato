// Particles: chunky physical chips (instanced cubes that bounce on terrain) and
// pixel-sprite particles (points with a small sprite atlas): dust, smoke,
// sparks, fire, splashes, KO stars, hearts, Zzz, notes, fireflies.
import * as THREE from 'three';
import { PixelPainter } from './pixel.js';
import { G, patchMaterial } from './shaderlib.js';

const SPRITES = ['puff', 'smoke', 'spark', 'star', 'heart', 'zzz', 'note', 'drop', 'flame', 'glow', 'leaf', 'ring', 'skull', 'question', 'exclaim', 'bubble'];
function spriteAtlas() {
  const S = 16, N = SPRITES.length, cols = 4, rows = Math.ceil(N / cols);
  const p = new PixelPainter(S * cols, S * rows, 3).clear();
  const at = (i) => [(i % cols) * S, Math.floor(i / cols) * S];
  const draw = (i, fn) => { const [ox, oy] = at(i); fn((x, y, c, a = 255) => p.setc(ox + x, oy + y, c, a)); };
  draw(0, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 6.5) s(x, y, d < 3 ? [255, 255, 255] : [230, 230, 230], d < 5 ? 255 : 160); } });
  draw(1, (s) => { const bl = [[6, 7, 5], [10, 6, 4], [8, 10, 4], [4, 9, 3]]; for (const [cx, cy, r] of bl) for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - cx, y - cy) < r) s(x, y, [200, 200, 200], 200); });
  draw(2, (s) => { for (let k = -4; k <= 4; k++) { s(7 + k, 7, [255, 255, 255]); s(7, 7 + k, [255, 255, 255]); } s(6, 6, [255, 255, 255]); s(8, 8, [255, 255, 255]); s(6, 8, [255, 255, 255]); s(8, 6, [255, 255, 255]); });
  draw(3, (s) => { const pts = []; for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5; const r = k % 2 ? 3 : 7; pts.push([7.5 + Math.cos(a) * r, 7.5 + Math.sin(a) * r]); } for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { let inside = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside; } if (inside) s(x, y, [255, 230, 80]); } });
  draw(4, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const X = (x - 7.5) / 6, Y = -(y - 8) / 6; if ((X * X + Y * Y - 0.5) ** 3 - X * X * Y * Y * Y < 0) s(x, y, [255, 90, 120]); } });
  draw(5, (s) => { const Z = ['XXXXXX', '....X.', '...X..', '..X...', '.X....', 'XXXXXX']; Z.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') { s(x * 2 + 2, y * 2 + 2, [255, 255, 255]); s(x * 2 + 3, y * 2 + 2, [255, 255, 255]); s(x * 2 + 2, y * 2 + 3, [255, 255, 255]); s(x * 2 + 3, y * 2 + 3, [255, 255, 255]); } })); });
  draw(6, (s) => { for (let y = 2; y < 12; y++) s(10, y, [255, 255, 255]); for (let x = 10; x < 14; x++) s(x, 2, [255, 255, 255]); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (Math.hypot(x - 7.5, y - 12) < 2.8) s(x, y, [255, 255, 255]); });
  draw(7, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, (y - 9) * 1.1); if (d < 4.5 || (y < 9 && Math.abs(x - 7.5) < (y - 2) * 0.6)) s(x, y, [180, 220, 255]); } });
  draw(8, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot((x - 7.5) * 1.3, y - 10); const w = Math.max(0, (y - 2) / 14) * 6; if (Math.abs(x - 7.5) < w && y > 2 && d < 7) s(x, y, d < 3 ? [255, 250, 200] : d < 5 ? [255, 180, 60] : [240, 90, 30]); } });
  draw(9, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 7) s(x, y, [255, 255, 255], Math.round(255 * Math.pow(1 - d / 7, 1.6))); } });
  draw(10, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const X = x - 7.5, Y = y - 7.5; if ((X * X) / 30 + (Y * Y) / 8 < 1) s(x, y, Math.abs(Y) < 0.8 ? [190, 190, 190] : [255, 255, 255]); } });
  draw(11, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d > 5 && d < 7) s(x, y, [255, 255, 255]); } });
  draw(12, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 6.5); if (d < 5.5 || (y > 9 && y < 14 && Math.abs(x - 7.5) < 3)) s(x, y, [255, 255, 255]); } s(5, 6, [0, 0, 0]); s(10, 6, [0, 0, 0]); });
  draw(13, (s) => { const Q = ['.XXX.', 'X...X', '...X.', '..X..', '.....', '..X..']; Q.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) s(x * 2 + 3 + a, y * 2 + 2 + b, [255, 255, 255]); })); });
  draw(14, (s) => { for (let y = 1; y < 10; y++) for (let x = 6; x < 10; x++) s(x, y, [255, 255, 255]); for (let y = 12; y < 15; y++) for (let x = 6; x < 10; x++) s(x, y, [255, 255, 255]); });
  draw(15, (s) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.hypot(x - 7.5, y - 7.5); if (d < 6 && d > 4.5) s(x, y, [220, 240, 255]); if (Math.hypot(x - 5.5, y - 5.5) < 1.2) s(x, y, [255, 255, 255]); } });
  const tex = p.texture({ wrap: THREE.ClampToEdgeWrapping, srgb: true, nearest: true });
  tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  return { tex, cols, rows };
}

const PARTICLE_VERT = /* glsl */ `
attribute vec4 aCol;
attribute float aSize;
attribute float aSprite;
attribute float aRot;
varying vec4 vCol;
varying float vSprite;
varying float vRot;
uniform float uScale;
void main() {
  vCol = aCol; vSprite = aSprite; vRot = aRot;
  vec4 mv = modelViewMatrix * vec4( position, 1.0 );
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uScale / max( 0.1, -mv.z );
}
`;
const PARTICLE_FRAG = /* glsl */ `
uniform sampler2D tAtlas;
uniform vec2 uGrid;
varying vec4 vCol;
varying float vSprite;
varying float vRot;
void main() {
  vec2 pc = gl_PointCoord - 0.5;
  float c = cos( vRot ), s = sin( vRot );
  pc = vec2( c * pc.x - s * pc.y, s * pc.x + c * pc.y ) + 0.5;
  if ( pc.x < 0.0 || pc.y < 0.0 || pc.x > 1.0 || pc.y > 1.0 ) discard;
  float sid = floor( vSprite + 0.5 );
  vec3 rgb; float a;
  if ( sid < 1.5 || abs( sid - 9.0 ) < 0.5 ) {
    // puffs, smoke and glows are soft, billowy and smooth
    vec2 d = pc - 0.5;
    float r = length( d ) * 2.0;
    if ( sid > 8.5 ) a = pow( max( 0.0, 1.0 - r ), 2.2 );
    else {
      float n = sin( d.x * 13.0 + vRot * 3.0 + 1.7 ) * sin( d.y * 11.0 - vRot * 2.0 ) * 0.5 + 0.5;
      n = n * 0.6 + ( sin( ( d.x + d.y ) * 23.0 + vRot ) * 0.5 + 0.5 ) * 0.4;
      a = smoothstep( 1.0, 0.2, r + n * 0.3 ) * ( 0.75 + 0.25 * n );
    }
    rgb = vCol.rgb * ( sid < 1.5 ? 0.92 + 0.08 * ( 1.0 - r ) : 1.0 );
    a *= vCol.a;
    if ( a < 0.01 ) discard;
  } else {
    // everything else stays a crisp 16px pixel sprite
    pc = ( floor( pc * 16.0 ) + 0.5 ) / 16.0;
    float col = mod( vSprite, uGrid.x ), row = floor( vSprite / uGrid.x );
    vec2 uv = ( vec2( col, row ) + pc ) / uGrid;
    vec4 t = texture2D( tAtlas, uv );
    a = t.a * vCol.a;
    if ( a < 0.04 ) discard;
    rgb = t.rgb * vCol.rgb;
  }
  gl_FragColor = vec4( rgb, a );
  #include <colorspace_fragment>
}
`;

export class FX {
  constructor(game) {
    this.game = game;
    const scene = game.engine.scene;
    // --- chips
    this.chipCap = 900;
    const cg = new THREE.BoxGeometry(1, 1, 1);
    const cm = patchMaterial(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 }), {});
    this.chips = new THREE.InstancedMesh(cg, cm, this.chipCap);
    this.chips.count = 0; this.chips.castShadow = true; this.chips.frustumCulled = false;
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.chips.setColorAt(0, new THREE.Color());
    scene.add(this.chips);
    this.chipList = [];
    // --- sprites (two layers: alpha-blended + additive)
    const { tex, cols, rows } = spriteAtlas();
    this.cap = 3000;
    const mkLayer = (blending) => {
      const geo = new THREE.BufferGeometry();
      const L = {
        pos: new Float32Array(this.cap * 3), col: new Float32Array(this.cap * 4), size: new Float32Array(this.cap), spr: new Float32Array(this.cap), rot: new Float32Array(this.cap),
        list: [],
      };
      geo.setAttribute('position', new THREE.BufferAttribute(L.pos, 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aCol', new THREE.BufferAttribute(L.col, 4).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSize', new THREE.BufferAttribute(L.size, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aSprite', new THREE.BufferAttribute(L.spr, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('aRot', new THREE.BufferAttribute(L.rot, 1).setUsage(THREE.DynamicDrawUsage));
      geo.setDrawRange(0, 0);
      const mat = new THREE.ShaderMaterial({
        vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, transparent: true, depthWrite: false, blending,
        uniforms: { tAtlas: { value: tex }, uGrid: { value: new THREE.Vector2(cols, rows) }, uScale: { value: 600 } },
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false; pts.renderOrder = 10;
      scene.add(pts);
      L.geo = geo; L.mat = mat; L.pts = pts;
      return L;
    };
    this.alpha = mkLayer(THREE.NormalBlending);
    this.add = mkLayer(THREE.AdditiveBlending);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._c = new THREE.Color();
    this.emitters = [];
  }

  // ------------------------------------------------------------------ chips
  chip(x, y, z, vx, vy, vz, color, size = 0.06, life = 2.5) {
    if (this.chipList.length >= this.chipCap) this.chipList.shift();
    this.chipList.push({ x, y, z, vx, vy, vz, color: new THREE.Color(color), size, life, max: life, rx: Math.random() * 6, ry: Math.random() * 6, rz: Math.random() * 6, spin: (Math.random() - 0.5) * 18, rest: false });
  }
  chips_(x, y, z, n, colors, opt = {}) {
    const sp = opt.speed ?? 3.5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = (opt.up ?? 0.6) + Math.random() * 0.8;
      const dx = opt.dir ? opt.dir.x : 0, dz = opt.dir ? opt.dir.z : 0;
      this.chip(x, y, z, (Math.cos(a) * 0.7 + dx) * sp * Math.random(), up * sp, (Math.sin(a) * 0.7 + dz) * sp * Math.random(), colors[Math.floor(Math.random() * colors.length)], (opt.size ?? 0.06) * (0.6 + Math.random() * 0.8), opt.life ?? 2.5);
    }
  }

  // ------------------------------------------------------------------ sprites
  sprite(name, x, y, z, opt = {}) {
    const additive = opt.additive ?? ['spark', 'glow', 'flame'].includes(name);
    const L = additive ? this.add : this.alpha;
    if (L.list.length >= this.cap) L.list.shift();
    const p = {
      x, y, z, vx: opt.vx ?? 0, vy: opt.vy ?? 0, vz: opt.vz ?? 0, life: opt.life ?? 1, max: opt.life ?? 1,
      size: opt.size ?? 0.4, grow: opt.grow ?? 0, spr: SPRITES.indexOf(name), color: new THREE.Color(opt.color ?? 0xffffff),
      alpha: opt.alpha ?? 1, drag: opt.drag ?? 0.5, grav: opt.grav ?? 0, rot: opt.rot ?? 0, spin: opt.spin ?? 0, fadeIn: opt.fadeIn ?? 0.05, wobble: opt.wobble ?? 0, t: 0,
    };
    L.list.push(p);
    return p;
  }

  // ------------------------------------------------------------------ presets
  hitWood(pos, dir) { this.chips_(pos.x, pos.y, pos.z, 10, [0xc89a5a, 0x8a5a30, 0xe8c890, 0x6a4424], { dir, speed: 3.2, size: 0.055 }); this.dust(pos, 2, 0xc8b090); }
  leaves(pos, n = 12, color = 0x5a9a3a) {
    for (let i = 0; i < n; i++) this.sprite('leaf', pos.x + (Math.random() - 0.5) * 3, pos.y + Math.random() * 2, pos.z + (Math.random() - 0.5) * 3, { color: this._c.set(color).offsetHSL((Math.random() - 0.5) * 0.06, 0, (Math.random() - 0.5) * 0.2).getHex(), vy: -0.4 - Math.random() * 0.5, vx: (Math.random() - 0.5) * 1, vz: (Math.random() - 0.5) * 1, life: 3 + Math.random() * 2, size: 0.25, spin: (Math.random() - 0.5) * 6, wobble: 1.5, drag: 1.5 });
  }
  hitStone(pos, dir, color = 0x8a8780) { this.chips_(pos.x, pos.y, pos.z, 9, [color, 0x6a6862, 0xa8a49c], { dir, speed: 3.6, size: 0.05 }); for (let i = 0; i < 6; i++) this.sprite('spark', pos.x, pos.y, pos.z, { vx: (Math.random() - 0.5) * 5, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 5, life: 0.25, size: 0.12, color: 0xffe0a0, grav: 9 }); this.dust(pos, 3, 0xb0aca4); }
  dust(pos, n = 4, color = 0xc8b8a0, size = 0.6) { for (let i = 0; i < n; i++) this.sprite('puff', pos.x + (Math.random() - 0.5) * 0.4, pos.y + Math.random() * 0.2, pos.z + (Math.random() - 0.5) * 0.4, { color, alpha: 0.55, vx: (Math.random() - 0.5) * 1.2, vy: 0.3 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 1.2, life: 0.9 + Math.random() * 0.6, size: size * (0.6 + Math.random() * 0.6), grow: 0.8, drag: 2 }); }
  splash(x, y, z, s = 1) {
    for (let i = 0; i < 10 * s; i++) this.sprite('drop', x, y + 0.05, z, { vx: (Math.random() - 0.5) * 3 * s, vy: 2 + Math.random() * 3 * s, vz: (Math.random() - 0.5) * 3 * s, grav: 12, life: 0.7, size: 0.16, color: 0xd8f0ff, alpha: 0.85 });
    this.sprite('ring', x, y + 0.03, z, { size: 0.6 * s, grow: 3 * s, life: 0.8, alpha: 0.6, color: 0xe8f8ff });
  }
  stars(pos, n = 5) { for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; this.sprite('star', pos.x + Math.cos(a) * 0.6, pos.y, pos.z + Math.sin(a) * 0.6, { life: 1.2, size: 0.32, vy: 0.6, color: 0xffe060, spin: 4 }); } }
  hearts(pos, n = 4) { for (let i = 0; i < n; i++) this.sprite('heart', pos.x + (Math.random() - 0.5) * 0.8, pos.y + Math.random() * 0.4, pos.z + (Math.random() - 0.5) * 0.8, { vy: 0.8 + Math.random() * 0.5, life: 1.6, size: 0.36, wobble: 2, drag: 1 }); }
  zzz(pos) { this.sprite('zzz', pos.x, pos.y, pos.z, { vy: 0.35, vx: 0.15, life: 2.2, size: 0.32 + Math.random() * 0.15, wobble: 1.5, fadeIn: 0.3, color: 0xe8f0ff }); }
  note(pos) { this.sprite('note', pos.x, pos.y, pos.z, { vy: 0.6, vx: (Math.random() - 0.5) * 0.6, life: 1.6, size: 0.3, wobble: 2, color: [0xffe070, 0x90e0ff, 0xff90c0][Math.floor(Math.random() * 3)] }); }
  icon(name, pos, color = 0xffffff, size = 0.5, life = 1.2) { return this.sprite(name, pos.x, pos.y, pos.z, { vy: 0.3, life, size, color, drag: 2 }); }
  smoke(pos, color = 0x9a9a9a, size = 1.0) { this.sprite('smoke', pos.x + (Math.random() - 0.5) * 0.2, pos.y, pos.z + (Math.random() - 0.5) * 0.2, { vy: 0.8 + Math.random() * 0.4, vx: (Math.random() - 0.5) * 0.3, life: 2.8, size: size * 0.6, grow: 1.4, alpha: 0.42, color, drag: 0.6, fadeIn: 0.3, wobble: 0.6 }); }
  flame(pos, s = 1) { this.sprite('flame', pos.x + (Math.random() - 0.5) * 0.25 * s, pos.y + 0.05, pos.z + (Math.random() - 0.5) * 0.25 * s, { vy: 1.2 + Math.random() * 0.8, life: 0.55 + Math.random() * 0.3, size: 0.5 * s, grow: -0.6 * s, color: 0xffffff, drag: 1, wobble: 2 }); }
  ember(pos) { this.sprite('spark', pos.x, pos.y + 0.3, pos.z, { vy: 1.5 + Math.random() * 1.5, vx: (Math.random() - 0.5) * 0.8, vz: (Math.random() - 0.5) * 0.8, life: 1.4, size: 0.08, color: 0xffa040, wobble: 3, drag: 0.8 }); }
  glow(pos, color, size = 0.5, life = 0.4) { return this.sprite('glow', pos.x, pos.y, pos.z, { color, size, life, alpha: 0.9 }); }
  firefly(pos) { return this.sprite('glow', pos.x, pos.y, pos.z, { color: 0xc8ff60, size: 0.18, life: 4 + Math.random() * 3, vx: (Math.random() - 0.5) * 0.4, vy: (Math.random() - 0.5) * 0.2, vz: (Math.random() - 0.5) * 0.4, wobble: 1.2, drag: 0, fadeIn: 0.5, alpha: 0.9 }); }

  // ------------------------------------------------------------------ update
  update(dt) {
    const h = this.game.sampler.heightAt;
    // chips
    const m = this._m, q = this._q, e = this._e;
    let n = 0;
    const keep = [];
    for (const c of this.chipList) {
      c.life -= dt;
      if (c.life <= 0) continue;
      if (!c.rest) {
        c.vy -= 16 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rx += c.spin * dt; c.rz += c.spin * dt * 0.7;
        const g = h(c.x, c.z);
        if (c.y < g + c.size * 0.5) {
          c.y = g + c.size * 0.5;
          if (Math.abs(c.vy) > 1.2) { c.vy = -c.vy * 0.35; c.vx *= 0.6; c.vz *= 0.6; c.spin *= 0.5; }
          else { c.rest = true; }
        }
      }
      const s = c.size * Math.min(1, c.life / 0.5);
      e.set(c.rx, c.ry, c.rz); q.setFromEuler(e);
      m.compose(_p.set(c.x, c.y, c.z), q, _s.set(s, s * 0.6, s * 1.3));
      this.chips.setMatrixAt(n, m);
      this.chips.setColorAt(n, c.color);
      n++;
      keep.push(c);
    }
    this.chipList = keep;
    this.chips.count = n;
    this.chips.instanceMatrix.needsUpdate = true;
    if (this.chips.instanceColor) this.chips.instanceColor.needsUpdate = true;
    // sprites
    const t = G.uTime.value;
    for (const L of [this.alpha, this.add]) {
      let k = 0;
      const live = [];
      for (const p of L.list) {
        p.t += dt; p.life -= dt;
        if (p.life <= 0) continue;
        const dr = Math.max(0, 1 - p.drag * dt);
        p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr - p.grav * dt;
        let wx = 0, wz = 0;
        if (p.wobble) { wx = Math.sin(t * 3 + p.max * 7 + k) * p.wobble * dt; wz = Math.cos(t * 2.6 + p.max * 5) * p.wobble * dt; }
        p.x += p.vx * dt + wx; p.y += p.vy * dt; p.z += p.vz * dt + wz;
        p.size = Math.max(0.01, p.size + p.grow * dt);
        p.rot += p.spin * dt;
        const life01 = p.life / p.max;
        const fade = Math.min(1, life01 * 3) * Math.min(1, p.t / Math.max(0.001, p.fadeIn));
        L.pos[k * 3] = p.x; L.pos[k * 3 + 1] = p.y; L.pos[k * 3 + 2] = p.z;
        L.col[k * 4] = p.color.r; L.col[k * 4 + 1] = p.color.g; L.col[k * 4 + 2] = p.color.b; L.col[k * 4 + 3] = p.alpha * fade;
        L.size[k] = p.size; L.spr[k] = p.spr; L.rot[k] = p.rot;
        k++;
        live.push(p);
      }
      L.list = live;
      L.geo.setDrawRange(0, k);
      for (const a of Object.values(L.geo.attributes)) a.needsUpdate = true;
      L.mat.uniforms.uScale.value = this.game.engine.renderer.domElement.height * 0.9;
    }
    // continuous emitters (campfires, fireflies...)
    for (const em of this.emitters) { em.acc = (em.acc ?? 0) + dt * em.rate; while (em.acc >= 1) { em.acc -= 1; em.fn(this); } }
  }
  addEmitter(rate, fn) { const em = { rate, fn }; this.emitters.push(em); return em; }
  removeEmitter(em) { this.emitters = this.emitters.filter((e) => e !== em); }
}
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
