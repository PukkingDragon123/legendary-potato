// The lab: the main menu is a living scene in the bean scientists' secret
// laboratory, the night they test the time machine. The Chrono-Van is parked
// on the launch pad in front of the portal ring, Kev pokes at the shelf of
// glowing samples, Pip wrenches the portal's capacitors, Dr. Wanda scribbles
// on the whiteboard, Timmy floats about, and your scientist sits at the main
// console typing. Click them to step into the wardrobe.
//
// It is its own scene with its own camera and lights; while it is up the
// engine renders it instead of the world. The intro cinematic starts here:
// the portal opens and swallows the van (see cinematic.js).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Character, PRESETS } from '../entities/character.js';
import { buildVan } from '../entities/vanModel.js';
import { buildTimmy, drawEye } from '../entities/timmy.js';
import { buildItemModel } from '../gfx/itemModels.js';
import { ITEMS } from '../data/items.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

// ------------------------------------------------------------------ canvas textures
function canvasTex(w, h, draw, opt = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  draw(x, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opt.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opt.repeat); }
  if (opt.nearest) { t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; }
  return t;
}
// a little seeded noise for grime
function rnd(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

function floorTex() {
  return canvasTex(512, 512, (x, W) => {
    const r = rnd(7), n = 4, S = W / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = 52 + Math.floor(r() * 10);
      x.fillStyle = `rgb(${v},${v + 6},${v + 14})`; x.fillRect(i * S, j * S, S, S);
      // anti-slip dimples
      x.fillStyle = 'rgba(255,255,255,0.05)';
      for (let k = 0; k < 6; k++) for (let l = 0; l < 6; l++) { x.beginPath(); x.arc(i * S + 12 + k * 20, j * S + 12 + l * 20, 2.4, 0, 7); x.fill(); }
      x.fillStyle = 'rgba(0,0,0,0.12)';
      for (let k = 0; k < 6; k++) for (let l = 0; l < 6; l++) { x.beginPath(); x.arc(i * S + 12.8 + k * 20, j * S + 13 + l * 20, 2.4, 0, 7); x.fill(); }
      // bevel
      x.fillStyle = 'rgba(255,255,255,0.09)'; x.fillRect(i * S, j * S, S, 3); x.fillRect(i * S, j * S, 3, S);
      x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(i * S, j * S + S - 3, S, 3); x.fillRect(i * S + S - 3, j * S, 3, S);
    }
    // grout and scuffs
    x.strokeStyle = '#15181d'; x.lineWidth = 3;
    for (let i = 0; i <= n; i++) { x.beginPath(); x.moveTo(i * S, 0); x.lineTo(i * S, W); x.stroke(); x.beginPath(); x.moveTo(0, i * S); x.lineTo(W, i * S); x.stroke(); }
    for (let k = 0; k < 40; k++) { x.strokeStyle = `rgba(0,0,0,${0.05 + r() * 0.1})`; x.lineWidth = 1 + r() * 2; x.beginPath(); const a = r() * W, b = r() * W; x.moveTo(a, b); x.quadraticCurveTo(a + r() * 60 - 30, b + r() * 20 - 10, a + r() * 80 - 40, b + r() * 30 - 15); x.stroke(); }
  }, { repeat: [5, 4] });
}
function wallTex() {
  return canvasTex(512, 512, (x, W) => {
    const r = rnd(3);
    x.fillStyle = '#4a535e'; x.fillRect(0, 0, W, W);
    const P = W / 2;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const v = 70 + Math.floor(r() * 12);
      const g = x.createLinearGradient(0, j * P, 0, j * P + P); g.addColorStop(0, `rgb(${v + 12},${v + 18},${v + 26})`); g.addColorStop(1, `rgb(${v - 6},${v},${v + 8})`);
      x.fillStyle = g; x.fillRect(i * P + 6, j * P + 6, P - 12, P - 12);
      x.fillStyle = 'rgba(255,255,255,0.14)'; x.fillRect(i * P + 6, j * P + 6, P - 12, 2); x.fillRect(i * P + 6, j * P + 6, 2, P - 12);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(i * P + 6, j * P + P - 8, P - 12, 2); x.fillRect(i * P + P - 8, j * P + 6, 2, P - 12);
      // rivets
      for (const [a, b] of [[16, 16], [P - 16, 16], [16, P - 16], [P - 16, P - 16]]) { x.fillStyle = '#2a3036'; x.beginPath(); x.arc(i * P + a + 1, j * P + b + 1, 4, 0, 7); x.fill(); x.fillStyle = '#8a96a2'; x.beginPath(); x.arc(i * P + a, j * P + b, 3.4, 0, 7); x.fill(); }
      // vent slots on some panels
      if (r() < 0.4) { x.fillStyle = '#1e2328'; for (let k = 0; k < 6; k++) x.fillRect(i * P + 40, j * P + 60 + k * 18, P - 80, 6); }
    }
    for (let k = 0; k < 30; k++) { x.fillStyle = `rgba(20,16,10,${0.03 + r() * 0.05})`; const a = r() * W; x.fillRect(a, r() * W, 2 + r() * 3, 30 + r() * 90); }
  }, { repeat: [6, 2] });
}
function hazardTex() {
  return canvasTex(256, 32, (x, W, H) => {
    x.fillStyle = '#f2c230'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#1e1e22';
    for (let i = -2; i < 12; i++) { x.beginPath(); x.moveTo(i * 32, H); x.lineTo(i * 32 + 16, H); x.lineTo(i * 32 + 32, 0); x.lineTo(i * 32 + 16, 0); x.fill(); }
    x.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 40; i++) x.fillRect(Math.random() * W, Math.random() * H, 3, 2);
  }, { repeat: [8, 1] });
}
function whiteboardTex() {
  return canvasTex(1024, 576, (x, W, H) => {
    x.fillStyle = '#f4f6f2'; x.fillRect(0, 0, W, H);
    const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(200,210,220,0.3)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.lineCap = 'round'; x.lineJoin = 'round';
    const ink = (c, w) => { x.strokeStyle = c; x.fillStyle = c; x.lineWidth = w; };
    x.font = 'bold 44px "Comic Sans MS", "Marker Felt", cursive';
    ink('#1a3a8a', 4); x.fillText('PROJECT CHRONO-VAN', 40, 70);
    x.font = '30px "Comic Sans MS", "Marker Felt", cursive';
    ink('#2a2a2a', 3);
    x.fillText('Δt = -66,000,000 yr  (±3 days??)', 40, 130);
    x.fillText('E = m·c² · (flux / dung)', 40, 180);
    x.fillText('v ≥ 88 mph   ← do NOT', 40, 230);
    ink('#c8283a', 3); x.fillText('ask Kev about the dung', 40, 280);
    // doodle: van going into a portal, a dino waiting on the other side
    ink('#2a2a2a', 4);
    x.beginPath(); x.ellipse(720, 260, 90, 120, 0, 0, Math.PI * 2); x.stroke();
    for (let i = 0; i < 4; i++) { x.beginPath(); x.ellipse(720, 260, 70 - i * 16, 95 - i * 22, 0.2 * i, 0, Math.PI * 1.6); x.stroke(); }
    x.strokeRect(520, 300, 120, 54); x.beginPath(); x.arc(548, 360, 13, 0, 7); x.stroke(); x.beginPath(); x.arc(612, 360, 13, 0, 7); x.stroke();
    x.beginPath(); x.moveTo(640, 330); x.lineTo(660, 330); x.moveTo(500, 320); x.lineTo(470, 320); x.moveTo(500, 340); x.lineTo(460, 340); x.stroke();
    ink('#2a7a3a', 4);
    x.beginPath(); x.moveTo(860, 380); x.quadraticCurveTo(880, 300, 920, 290); x.quadraticCurveTo(960, 285, 960, 310); x.lineTo(925, 318); x.quadraticCurveTo(930, 360, 950, 400); x.moveTo(880, 380); x.lineTo(870, 420); x.moveTo(930, 395); x.lineTo(935, 420); x.stroke();
    x.beginPath(); x.arc(940, 300, 3, 0, 7); x.fill();
    ink('#c8283a', 3); x.font = '26px "Comic Sans MS", cursive'; x.fillText('friendly??', 860, 460);
    ink('#1a3a8a', 3); x.beginPath(); x.moveTo(820, 455); x.lineTo(760, 400); x.stroke();
    // sticky notes
    for (const [px, py, c, t] of [[60, 380, '#fff27a', 'BUY MORE\nNOODLES'], [260, 400, '#ffb0c8', 'TIMMY: stop\nscanning the\ncat'], [380, 470, '#a8f0ff', 'flux cap. #4\nis haunted']]) {
      x.save(); x.translate(px, py); x.rotate((Math.random() - 0.5) * 0.12);
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(5, 6, 160, 130); x.fillStyle = c; x.fillRect(0, 0, 160, 130);
      x.fillStyle = '#2a2a2a'; x.font = '22px "Comic Sans MS", cursive'; t.split('\n').forEach((l, i) => x.fillText(l, 12, 36 + i * 28));
      x.restore();
    }
  });
}
function labelTex(text, bg = '#f2c230', fg = '#1e1e22') {
  return canvasTex(256, 64, (x, W, H) => {
    x.fillStyle = bg; x.fillRect(0, 0, W, H); x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(5, 5, W - 10, H - 10);
    x.fillStyle = fg; x.font = 'bold 30px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, W / 2, H / 2 + 2);
  });
}

// ------------------------------------------------------------------ materials & mesh helpers
const std = (o) => new THREE.MeshStandardMaterial(o);
const emissive = (c, k = 2) => new THREE.MeshStandardMaterial({ color: 0x101010, emissive: c, emissiveIntensity: k, roughness: 0.4 });
function mk(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
const box = (w, h, d, mat, r = 0) => mk(r > 0 ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), mat);
const cyl = (rt, rb, h, mat, seg = 24, open = false) => mk(new THREE.CylinderGeometry(rt, rb, h, seg, 1, open), mat);
const at = (o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };

// the time portal's surface: a swirling vortex that wakes up as uOpen rises
function portalMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uOpen: { value: 0 }, uK: { value: 1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uT, uOpen, uK;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
        float a = atan(p.y, p.x);
        float spin = uT * (0.5 + uOpen * 3.5);
        float tw = a + (1.0 - r) * (3.0 + uOpen * 7.0) + spin;
        float bands = 0.5 + 0.5 * sin(tw * 6.0);
        float nn = n2(vec2(tw * 1.6, r * 6.0 - uT * (1.0 + uOpen * 4.0))) * 0.6 + n2(vec2(tw * 4.0, r * 14.0 - uT * 3.0)) * 0.4;
        vec3 cyan = vec3(0.22, 0.85, 1.0), violet = vec3(0.55, 0.25, 1.0), white = vec3(1.0, 0.97, 0.9);
        vec3 col = mix(violet, cyan, bands * nn + 0.2);
        col *= 0.35 + 0.9 * nn;
        float core = pow(max(0.0, 1.0 - r), 3.0);
        col += white * core * (0.3 + uOpen * 2.5);
        float rim = exp(-pow((r - 0.97) * 30.0, 2.0));
        col += cyan * rim * 1.5;
        float idle = 0.25 + 0.75 * uOpen;
        float al = smoothstep(1.0, 0.93, r) * (0.55 + 0.45 * idle);
        gl_FragColor = vec4(col * uK * (0.6 + idle * 1.8), al);
      }`,
  });
}

// ------------------------------------------------------------------ the lab
export class Lab {
  constructor(game, opt = {}) {
    this.g = game;
    this.opt = opt;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.camera = new THREE.PerspectiveCamera(46, game.engine.camera.aspect, 0.05, 120);
    this.t = 0;
    this.active = false;
    this.mode = 'menu'; // menu | wardrobe | cinematic
    this.screens = [];
    this.anims = [];
    this.build();
    this.shot('menu', true);
  }
  // ---------------------------------------------------------------- building
  build() {
    const S = this.scene;
    const pm = new THREE.PMREMGenerator(this.g.engine.renderer);
    S.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    S.environmentIntensity = 0.45;
    pm.dispose();
    // lights: a cool ambient, a key light from the ceiling with shadows, and coloured practicals
    S.add(new THREE.HemisphereLight(0x9ab8e0, 0x3a3028, 0.8));
    const key = new THREE.DirectionalLight(0xfff4e6, 2.2);
    key.position.set(2, 9, 5); key.target.position.set(0, 0, -1.5);
    key.castShadow = true;
    const sh = key.shadow; sh.mapSize.set(2048, 2048); sh.camera.left = -9; sh.camera.right = 9; sh.camera.top = 8; sh.camera.bottom = -8; sh.camera.near = 1; sh.camera.far = 22; sh.bias = -0.0004; sh.normalBias = 0.03; sh.radius = 3;
    S.add(key, key.target);
    this.portalLight = new THREE.PointLight(0x5ae0ff, 18, 12, 2); this.portalLight.position.set(0.6, 2.3, -5.2); S.add(this.portalLight);
    const deskLight = new THREE.PointLight(0x6ab8ff, 4, 5, 2); deskLight.position.set(3.0, 1.6, -2.3); S.add(deskLight);
    const fill = new THREE.PointLight(0xffe8d0, 7, 13, 2); fill.position.set(4.5, 3.6, 2.2); S.add(fill);
    const fill2 = new THREE.PointLight(0xc8dcff, 5, 12, 2); fill2.position.set(-4.5, 3.4, 1.5); S.add(fill2);
    const benchLight = new THREE.PointLight(0xffb060, 6, 6, 2); benchLight.position.set(-5.6, 2.4, -4.4); S.add(benchLight);
    this.deskLight = deskLight;

    // room shell: floor, walls, ceiling
    const W = 16, D = 12, Hh = 5, z0 = -7, z1 = 5;
    const floor = mk(new THREE.PlaneGeometry(W, D), std({ map: floorTex(), roughness: 0.62, metalness: 0.15 }), false, true);
    floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (z0 + z1) / 2); S.add(floor);
    const wm = std({ map: wallTex(), roughness: 0.55, metalness: 0.35 });
    const back = mk(new THREE.PlaneGeometry(W, Hh), wm, false, true); back.position.set(0, Hh / 2, z0); S.add(back);
    for (const sx of [-1, 1]) { const side = mk(new THREE.PlaneGeometry(D, Hh), wm, false, true); side.rotation.y = -sx * Math.PI / 2; side.position.set(sx * W / 2, Hh / 2, (z0 + z1) / 2); S.add(side); }
    const front = mk(new THREE.PlaneGeometry(W, Hh), wm, false, true); front.rotation.y = Math.PI; front.position.set(0, Hh / 2, z1); S.add(front);
    const ceil = mk(new THREE.PlaneGeometry(W, D), std({ color: 0x1e2228, roughness: 0.8, metalness: 0.3 }), false, true); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, Hh, (z0 + z1) / 2); S.add(ceil);
    // skirting with hazard stripes
    const hz = std({ map: hazardTex(), roughness: 0.6 });
    for (const [x, z, ry, len] of [[0, z0 + 0.02, 0, W], [-W / 2 + 0.02, (z0 + z1) / 2, Math.PI / 2, D], [W / 2 - 0.02, (z0 + z1) / 2, -Math.PI / 2, D]]) { const s = mk(new THREE.PlaneGeometry(len, 0.22), hz, false, true); s.position.set(x, 0.11, z); s.rotation.y = ry; S.add(s); }
    // ceiling light panels and beams
    const panelM = emissive(0xeaf4ff, 2.6), beamM = std({ color: 0x2a3038, roughness: 0.5, metalness: 0.7 });
    for (const x of [-4.5, 0, 4.5]) for (const z of [-4, 0.5]) { const p = box(2.2, 0.06, 0.6, panelM); p.position.set(x, Hh - 0.04, z); p.castShadow = false; S.add(p); const fr = box(2.36, 0.08, 0.76, beamM); fr.position.set(x, Hh - 0.02, z); S.add(fr); }
    for (const z of [-6, -2, 2]) { const b = box(W, 0.3, 0.24, beamM); b.position.set(0, Hh - 0.15, z); S.add(b); }
    // pipes along the back wall
    const pipeM = std({ color: 0x8a6a3a, roughness: 0.35, metalness: 0.9 }), pipe2 = std({ color: 0x3a6a8a, roughness: 0.4, metalness: 0.8 });
    for (const [y, m, r] of [[4.3, pipeM, 0.09], [4.05, pipe2, 0.07]]) { const p = cyl(r, r, W, m, 14); p.rotation.z = Math.PI / 2; p.position.set(0, y, z0 + 0.25); S.add(p); for (let i = -3; i <= 3; i++) { const c = cyl(r + 0.025, r + 0.025, 0.08, beamM, 14); c.rotation.z = Math.PI / 2; c.position.set(i * 2.2, y, z0 + 0.25); S.add(c); } }

    this.buildPortal(0.6, -5.9);
    this.buildVan();
    this.buildDesk();
    this.buildBench();
    this.buildWhiteboard();
    this.buildProps();
    this.buildCrew();
    this.buildTimmy();
    S.traverse((o) => { if (o.isMesh && o.material?.isMeshStandardMaterial) o.material.envMapIntensity = o.material.envMapIntensity ?? 1; });
  }
  buildPortal(px, pz) {
    const S = this.scene, G = new THREE.Group(); G.position.set(px, 0, pz); S.add(G);
    const R = 1.85, cy = 2.25;
    const gun = std({ color: 0x3a424c, roughness: 0.32, metalness: 0.9 }), dark = std({ color: 0x15181c, roughness: 0.6, metalness: 0.6 }), brass = std({ color: 0xc89a4a, roughness: 0.3, metalness: 1 });
    // the launch pad: stepped discs with a glowing ring and hazard edge
    const pad = cyl(2.6, 2.75, 0.18, gun, 64); pad.position.y = 0.09; G.add(pad);
    const pad2 = cyl(2.2, 2.3, 0.1, dark, 64); pad2.position.y = 0.23; G.add(pad2);
    const padRing = mk(new THREE.TorusGeometry(2.0, 0.025, 8, 96), emissive(0x5ae0ff, 3), false); padRing.rotation.x = Math.PI / 2; padRing.position.y = 0.285; G.add(padRing);
    // the ring itself, standing on two legs
    const ring = mk(new THREE.TorusGeometry(R + 0.2, 0.2, 28, 120), gun); ring.position.y = cy; G.add(ring);
    const ring2 = mk(new THREE.TorusGeometry(R + 0.2, 0.12, 16, 120), dark); ring2.position.set(0, cy, -0.16); G.add(ring2);
    const inner = mk(new THREE.TorusGeometry(R + 0.02, 0.035, 10, 120), emissive(0x5ae0ff, 3.5), false); inner.position.y = cy; G.add(inner);
    this.portalInner = inner;
    // segment lights around the ring
    this.portalLeds = [];
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const l = box(0.14, 0.07, 0.06, emissive(0xffa040, 2.5), 0.015); l.castShadow = false;
      l.position.set(Math.cos(a) * (R + 0.2), cy + Math.sin(a) * (R + 0.2), 0.2); l.rotation.z = a + Math.PI / 2; G.add(l); this.portalLeds.push(l);
      if (i % 3 === 0) { const c = box(0.2, 0.28, 0.5, gun, 0.03); c.position.set(Math.cos(a) * (R + 0.34), cy + Math.sin(a) * (R + 0.34), -0.05); c.rotation.z = a; G.add(c); }
    }
    for (const sx of [-1, 1]) {
      const leg = box(0.42, 1.1, 0.7, gun, 0.06); leg.position.set(sx * 1.25, 0.75, 0); leg.rotation.z = sx * 0.35; G.add(leg);
      // capacitor towers: a column with glowing coils
      const tw = new THREE.Group(); tw.position.set(sx * 3.3, 0, 0.2); G.add(tw);
      tw.add(at(cyl(0.38, 0.45, 0.3, dark, 24), 0, 0.15, 0));
      tw.add(at(cyl(0.18, 0.18, 2.7, gun, 20), 0, 1.65, 0));
      for (let k = 0; k < 7; k++) { const c = mk(new THREE.TorusGeometry(0.27, 0.05, 10, 28), k % 2 ? brass : emissive(0x5ae0ff, 2.2), true); c.rotation.x = Math.PI / 2; c.position.y = 0.6 + k * 0.32; tw.add(c); }
      tw.add(at(mk(new THREE.SphereGeometry(0.26, 24, 16), std({ color: 0xd8dce0, roughness: 0.15, metalness: 1 })), 0, 3.15, 0));
      const spark = mk(new THREE.SphereGeometry(0.1, 12, 8), emissive(0xb8f4ff, 4), false); spark.position.y = 3.15; tw.add(spark);
      this.anims.push((t, k) => { spark.scale.setScalar(0.6 + 0.6 * Math.abs(Math.sin(t * 13 + sx)) * (0.4 + k)); });
      // fat cables from the towers to the ring
      const pts = [new THREE.Vector3(sx * 3.3, 0.35, 0.2), new THREE.Vector3(sx * 2.8, 0.05, 0.6), new THREE.Vector3(sx * 2.0, 0.05, 0.4), new THREE.Vector3(sx * 1.5, 0.4, 0.1)];
      G.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.06, 8), std({ color: 0x1a1a1e, roughness: 0.7 })));
    }
    // the vortex
    const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 96), portalMaterial());
    disc.position.set(0, cy, 0.02); disc.renderOrder = 4; G.add(disc);
    this.portal = { G, disc, R, cy, center: new THREE.Vector3(px, cy, pz) };
    // a warning sign
    const sign = mk(new THREE.PlaneGeometry(1.4, 0.35), std({ map: labelTex('TEMPORAL HAZARD'), roughness: 0.6 }), false); sign.position.set(-3.3, 3.6, 0.45); G.add(sign);
  }
  buildVan() {
    const v = buildVan();
    v.root.position.set(-2.9, 0, -2.0);
    v.root.rotation.y = -0.78;
    v.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(v.root);
    this.van = v;
  }
  buildDesk() {
    const S = this.scene, G = new THREE.Group(); G.position.set(3.4, 0, -2.3); G.rotation.y = Math.PI / 2; S.add(G); // the monitors face -X
    const top = std({ color: 0xd8d2c4, roughness: 0.6 }), leg = std({ color: 0x2a3038, roughness: 0.4, metalness: 0.8 }), bezel = std({ color: 0x24282e, roughness: 0.5, metalness: 0.3 });
    G.add(at(box(2.8, 0.06, 0.95, top, 0.02), 0, 0.76, 0));
    for (const sx of [-1, 1]) G.add(at(box(0.06, 0.74, 0.8, leg, 0.01), sx * 1.32, 0.37, 0));
    G.add(at(box(0.7, 0.62, 0.8, std({ color: 0x5a6470, roughness: 0.5, metalness: 0.5 }), 0.02), -1.0, 0.36, 0));
    // three monitors with live screens
    const mons = [[-0.75, 0.2, 'graph'], [0, 0, 'code'], [0.75, -0.2, 'dna']];
    for (const [x, ry, kind] of mons) {
      const m = new THREE.Group(); m.position.set(x, 0.79, 0.22); m.rotation.y = ry; G.add(m);
      m.add(at(box(0.66, 0.42, 0.05, bezel, 0.015), 0, 0.42, 0));
      m.add(at(cyl(0.03, 0.03, 0.2, leg, 10), 0, 0.12, 0.05));
      m.add(at(box(0.24, 0.02, 0.16, leg, 0.006), 0, 0.01, 0.05));
      const scr = this.makeScreen(kind);
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), scr.mat); sm.position.set(0, 0.42, -0.026); sm.rotation.y = Math.PI; m.add(sm);
      this.screens.push(scr);
    }
    // keyboard, mug, papers, a lamp
    G.add(at(box(0.5, 0.025, 0.17, std({ color: 0x2a2e34, roughness: 0.5 }), 0.008), 0, 0.8, -0.18));
    for (let i = 0; i < 4; i++) for (let k = 0; k < 12; k++) G.add(at(box(0.032, 0.012, 0.03, std({ color: i === 3 && k > 3 && k < 8 ? 0x5a6470 : 0xe8e8e2, roughness: 0.6 })), -0.2 + k * 0.037, 0.818, -0.24 + i * 0.037));
    const mug = new THREE.Group(); mug.position.set(0.85, 0.79, -0.25); G.add(mug);
    mug.add(at(cyl(0.045, 0.04, 0.11, std({ color: 0xd8442a, roughness: 0.4 }), 18), 0, 0.055, 0));
    mug.add(at(mk(new THREE.TorusGeometry(0.03, 0.009, 8, 16), std({ color: 0xd8442a, roughness: 0.4 })), 0.05, 0.06, 0, 0, 0, Math.PI / 2));
    mug.add(at(cyl(0.04, 0.04, 0.005, std({ color: 0x3a2010, roughness: 0.2 }), 18), 0, 0.1, 0));
    for (let i = 0; i < 3; i++) G.add(at(box(0.21, 0.004, 0.3, std({ color: 0xf4f2ea, roughness: 0.9 })), -0.8 + i * 0.03, 0.795 + i * 0.004, -0.2, 0, 0.2 + i * 0.2, 0));
    // the office chair the player sits on
    const ch = new THREE.Group(); ch.position.set(3.4 - 0.95, 0, -2.3); ch.rotation.y = -Math.PI / 2; S.add(ch); this.chair = ch;
    const seatM = std({ color: 0x2a5a8a, roughness: 0.8 }), base = std({ color: 0x22262c, roughness: 0.4, metalness: 0.7 });
    ch.add(at(box(0.5, 0.08, 0.48, seatM, 0.03), 0, 0.36, 0));
    ch.add(at(box(0.46, 0.55, 0.07, seatM, 0.03), 0, 0.72, 0.24, -0.1, 0, 0));
    ch.add(at(cyl(0.03, 0.03, 0.3, base, 10), 0, 0.2, 0));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ch.add(at(box(0.3, 0.03, 0.04, base), Math.cos(a) * 0.15, 0.05, Math.sin(a) * 0.15, 0, -a, 0)); ch.add(at(mk(new THREE.SphereGeometry(0.03, 8, 6), base), Math.cos(a) * 0.29, 0.03, Math.sin(a) * 0.29)); }
  }
  // a live monitor: drawn into a canvas a few times a second
  makeScreen(kind) {
    const c = document.createElement('canvas'); c.width = 320; c.height = 192;
    const x = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    mat.color.setScalar(1.6);
    const lines = [
      'import chrono.flux as fx', 'def jump(van, dt=-66e6):', '  fx.charge(core=4)', '  if dung < 2: panic()', '  portal.open(r=1.85)', '  van.brakes = None  # lol', '  for t in timeline:', '    stabilise(t, k=0.7)', '  return "see you in the past"', '# TODO: tell Kev', 'assert timmy.is_good_boy', 'fx.capacitor[4].exorcise()',
    ];
    const S = { kind, c, x, tex, mat, t: 0, typed: 0, lines, scroll: 0 };
    S.draw = (dt) => {
      S.t += dt;
      x.fillStyle = '#04121a'; x.fillRect(0, 0, 320, 192);
      x.font = '14px monospace';
      if (kind === 'code') {
        S.typed += dt * 18;
        const all = lines.join('\n');
        const n = Math.floor(S.typed) % (all.length + 60);
        const shown = all.slice(0, Math.min(all.length, n)).split('\n');
        const off = Math.max(0, shown.length - 10);
        shown.slice(off).forEach((l, i) => { x.fillStyle = l.startsWith('#') ? '#6a8a9a' : l.startsWith('def') || l.startsWith('import') ? '#ffcf5a' : '#8ff4ff'; x.fillText(l, 10, 22 + i * 17); });
        if (Math.floor(S.t * 2) % 2) { const last = shown[shown.length - 1] ?? ''; x.fillStyle = '#e6feff'; x.fillRect(10 + x.measureText(last).width + 2, 10 + (shown.length - 1 - off) * 17, 8, 15); }
      } else if (kind === 'graph') {
        x.strokeStyle = '#123a48'; x.lineWidth = 1;
        for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(i * 40, 0); x.lineTo(i * 40, 192); x.stroke(); }
        for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(0, i * 38); x.lineTo(320, i * 38); x.stroke(); }
        for (const [col, f, a, ph] of [['#5ef2ff', 0.05, 40, 0], ['#ffa040', 0.11, 18, 2], ['#8affa0', 0.023, 28, 4]]) {
          x.strokeStyle = col; x.lineWidth = 2; x.beginPath();
          for (let px = 0; px <= 320; px += 4) { const y = 96 + Math.sin(px * f + S.t * 3 + ph) * a * (0.6 + 0.4 * Math.sin(S.t * 0.7 + ph)); px ? x.lineTo(px, y) : x.moveTo(px, y); }
          x.stroke();
        }
        x.fillStyle = '#e6feff'; x.fillText(`FLUX  ${(97 + Math.sin(S.t) * 2).toFixed(1)}%`, 10, 20); x.fillStyle = '#ffcf5a'; x.fillText('CORE TEMP  NOMINAL-ISH', 10, 182);
      } else {
        // a spinning DNA helix: dino genes!
        for (let i = 0; i < 24; i++) {
          const y = 10 + i * 7.5, a = S.t * 2 + i * 0.45;
          const x1 = 160 + Math.sin(a) * 60, x2 = 160 - Math.sin(a) * 60, front = Math.cos(a) > 0;
          x.strokeStyle = 'rgba(143,244,255,0.5)'; x.lineWidth = 2; x.beginPath(); x.moveTo(x1, y); x.lineTo(x2, y); x.stroke();
          x.fillStyle = front ? '#8affa0' : '#3a7a5a'; x.beginPath(); x.arc(x1, y, 4, 0, 7); x.fill();
          x.fillStyle = front ? '#ff8ac8' : '#7a3a5a'; x.beginPath(); x.arc(x2, y, 4, 0, 7); x.fill();
        }
        x.fillStyle = '#e6feff'; x.fillText('SAMPLE: DODO-SAURUS?', 10, 20);
      }
      // scanlines
      x.fillStyle = 'rgba(0,0,0,0.18)'; for (let y = 0; y < 192; y += 3) x.fillRect(0, y, 320, 1);
      tex.needsUpdate = true;
    };
    S.draw(0);
    return S;
  }
  buildBench() {
    const S = this.scene, G = new THREE.Group(); G.position.set(-7.45, 0, -4.4); G.rotation.y = -Math.PI / 2; S.add(G); // against the left wall, facing +X
    const top = std({ color: 0x2a2e34, roughness: 0.3, metalness: 0.2 }), frame = std({ color: 0xd8dce0, roughness: 0.35, metalness: 0.8 });
    G.add(at(box(3, 0.08, 0.9, top, 0.02), 0, 0.9, 0));
    G.add(at(box(2.9, 0.82, 0.8, std({ color: 0xe8e4da, roughness: 0.55 }), 0.03), 0, 0.43, 0.02));
    // shelf above with glowing sample jars
    for (const y of [1.65, 2.25]) G.add(at(box(3, 0.05, 0.4, frame, 0.01), 0, y, 0.25));
    const cols = [0x5ef2ff, 0x8affa0, 0xff8ac8, 0xffcf5a, 0xb07aff, 0xff6a5a];
    const glassM = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.32, metalness: 0, depthWrite: false });
    let k = 0;
    for (const y of [1.675, 2.275]) for (let i = 0; i < 7; i++) {
      const c = cols[(k++) % cols.length], h = 0.16 + ((i * 7 + y * 10) % 5) * 0.03, r = 0.05 + (i % 3) * 0.015;
      const jx = -1.25 + i * 0.42;
      G.add(at(cyl(r, r, h, glassM, 16), jx, y + h / 2, 0.25));
      const liq = cyl(r * 0.88, r * 0.88, h * 0.7, emissive(c, 1.4), 16); liq.castShadow = false; G.add(at(liq, jx, y + h * 0.36, 0.25));
      G.add(at(cyl(r * 0.6, r * 0.6, 0.03, std({ color: 0x3a3a40, roughness: 0.5 }), 12), jx, y + h + 0.015, 0.25));
    }
    // a microscope, a flask stand and a fossil skull on the bench
    const mic = new THREE.Group(); mic.position.set(0.9, 0.94, 0); G.add(mic);
    mic.add(at(box(0.2, 0.04, 0.26, frame, 0.01), 0, 0.02, 0));
    mic.add(at(box(0.05, 0.36, 0.06, frame, 0.01), 0, 0.2, 0.08, 0.15, 0, 0));
    mic.add(at(cyl(0.035, 0.03, 0.22, std({ color: 0x24282e, roughness: 0.3, metalness: 0.6 }), 14), 0, 0.3, -0.02, 0.35, 0, 0));
    mic.add(at(box(0.12, 0.012, 0.12, std({ color: 0x24282e, roughness: 0.4 })), 0, 0.12, -0.02));
    const flask = new THREE.Group(); flask.position.set(-0.6, 0.94, -0.05); G.add(flask);
    flask.add(at(mk(new THREE.SphereGeometry(0.1, 20, 14), glassM), 0, 0.1, 0));
    const fl = mk(new THREE.SphereGeometry(0.085, 20, 14, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55), emissive(0x8affa0, 1.8), false); fl.position.y = 0.1; flask.add(fl);
    flask.add(at(cyl(0.025, 0.025, 0.14, glassM, 12), 0, 0.25, 0));
    this.bubbles = [];
    for (let i = 0; i < 6; i++) { const b = mk(new THREE.SphereGeometry(0.012, 8, 6), emissive(0xc8ffd0, 2), false); flask.add(b); this.bubbles.push(b); b.userData.ph = i / 6; }
    const skull = new THREE.Group(); skull.position.set(-1.2, 0.94, 0.05); skull.rotation.y = 0.6; G.add(skull);
    const boneM = std({ color: 0xd8ccb0, roughness: 0.75 });
    skull.add(at(box(0.08, 0.2, 0.08, std({ color: 0x3a3a40, roughness: 0.5 }), 0.01), 0, 0.1, 0));
    const cr = mk(new THREE.SphereGeometry(0.11, 18, 12), boneM); cr.scale.set(1, 0.8, 1.2); cr.position.y = 0.28; skull.add(cr);
    const sn = mk(new THREE.CylinderGeometry(0.04, 0.08, 0.22, 12), boneM); sn.rotation.x = Math.PI / 2; sn.position.set(0, 0.25, -0.17); skull.add(sn);
    for (const sx of [-1, 1]) { const so = mk(new THREE.SphereGeometry(0.03, 8, 6), std({ color: 0x1a1410, roughness: 1 })); so.position.set(sx * 0.06, 0.3, -0.08); skull.add(so); }
  }
  buildWhiteboard() {
    const S = this.scene, G = new THREE.Group(); G.position.set(-7.93, 0, 0.9); G.rotation.y = Math.PI / 2; S.add(G);
    const frame = std({ color: 0xc8ccd0, roughness: 0.35, metalness: 0.8 });
    G.add(at(box(3.2, 1.86, 0.05, frame, 0.02), 0, 1.95, 0));
    const wb = mk(new THREE.PlaneGeometry(3.1, 1.76), std({ map: whiteboardTex(), roughness: 0.25, metalness: 0 }), false); wb.position.set(0, 1.95, 0.03); G.add(wb);
    G.add(at(box(3.0, 0.04, 0.1, frame, 0.01), 0, 1.0, 0.07));
    for (const [x, c] of [[-0.6, 0x1a3a8a], [-0.45, 0xc8283a], [-0.3, 0x2a7a3a]]) G.add(at(cyl(0.012, 0.012, 0.12, std({ color: c, roughness: 0.5 }), 8), x, 1.04, 0.08, 0, 0, Math.PI / 2));
  }
  buildProps() {
    const S = this.scene;
    const crateM = std({ color: 0x5a7a4a, roughness: 0.7, metalness: 0.2 }), edge = std({ color: 0x2a3028, roughness: 0.5, metalness: 0.6 });
    const crate = (x, z, s, ry, label) => {
      const g = new THREE.Group(); g.position.set(x, s / 2, z); g.rotation.y = ry; S.add(g);
      g.add(box(s, s, s, crateM, 0.03));
      for (const sy of [-1, 1]) for (const sz of [-1, 1]) g.add(at(box(s + 0.02, 0.05, 0.05, edge), 0, sy * (s / 2 - 0.02), sz * (s / 2 - 0.02)));
      if (label) { const l = mk(new THREE.PlaneGeometry(s * 0.7, s * 0.18), std({ map: labelTex(label), roughness: 0.6 }), false); l.position.set(0, 0, -s / 2 - 0.006); l.rotation.y = Math.PI; g.add(l); }
      return g;
    };
    crate(6.8, -5.8, 0.8, 0.2, 'FRAGILE');
    crate(6.85, -4.9, 0.6, -0.1, 'NOODLES');
    crate(6.75, -5.75, 0.5, 0.5).position.y = 1.05;
    crate(-6.9, 3.9, 0.7, 0.3, 'DUNG?');
    // a potted plant (a little cycad: they had to bring a souvenir)
    const pot = new THREE.Group(); pot.position.set(-6.9, 0, -1.4); S.add(pot);
    pot.add(at(cyl(0.22, 0.17, 0.4, std({ color: 0xc8643a, roughness: 0.8 }), 18), 0, 0.2, 0));
    const leafM = std({ color: 0x3a8a3a, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; const lf = mk(new THREE.PlaneGeometry(0.12, 0.7), leafM); lf.position.set(Math.cos(a) * 0.12, 0.7, Math.sin(a) * 0.12); lf.rotation.set(0.7, -a + Math.PI / 2, 0, 'YXZ'); pot.add(lf); }
    // a server rack with blinking lights
    const rack = new THREE.Group(); rack.position.set(7.55, 0, 2.8); rack.rotation.y = -Math.PI / 2; S.add(rack);
    rack.add(at(box(0.8, 2.2, 0.7, std({ color: 0x1e2228, roughness: 0.4, metalness: 0.6 }), 0.02), 0, 1.1, 0));
    this.rackLeds = [];
    for (let i = 0; i < 10; i++) for (let k = 0; k < 6; k++) { const l = box(0.025, 0.018, 0.01, emissive(k % 3 ? 0x8affa0 : 0xffa040, 2)); l.position.set(-0.3 + k * 0.05, 0.3 + i * 0.18, -0.36); l.castShadow = false; rack.add(l); this.rackLeds.push(l); }
    // a fire extinguisher, because safety
    const ext = new THREE.Group(); ext.position.set(7.75, 0.6, -2.2); S.add(ext);
    ext.add(at(cyl(0.09, 0.09, 0.5, std({ color: 0xc8202a, roughness: 0.35, metalness: 0.2 }), 16), 0, 0, 0));
    ext.add(at(cyl(0.03, 0.04, 0.1, std({ color: 0x2a2a2e, roughness: 0.4 }), 10), 0, 0.29, 0));
    // floor cables snaking from the portal to the desk
    const cm = std({ color: 0x15161a, roughness: 0.75 });
    for (const [a, b, c2, d] of [[[1.8, 0.03, -4.4], [2.6, 0.03, -3.8], [3.4, 0.03, -3.6], [3.7, 0.03, -3.2]], [[2.2, 0.03, -4.6], [3.2, 0.03, -4.2], [3.9, 0.03, -3.6], [3.8, 0.4, -2.9]]]) S.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([a, b, c2, d].map((p) => new THREE.Vector3(...p))), 40, 0.035, 8), cm, false));
  }
  buildCrew() {
    const S = this.scene, prof = this.opt.profile;
    // you, at the console
    this.me = new Character(prof?.outfit ?? PRESETS[0]);
    this.me.root.position.copy(this.chair.position);
    this.me.root.rotation.y = -Math.PI / 2;
    S.add(this.me.root);
    // the rest of the crew, doing crew things
    const others = PRESETS.filter((p) => p.name !== (prof?.outfit?.name ?? ''));
    const spots = [
      { pos: [-6.6, 0, -4.4], yaw: Math.PI / 2, act: 'scan', held: 'scanner' },
      { pos: [-1.4, 0.18, -4.7], yaw: 0.87, act: 'wrench', held: 'hammer' },
      { pos: [-6.7, 0, 1.3], yaw: Math.PI / 2, act: 'point' },
    ];
    this.crew = others.slice(0, 3).map((o, i) => {
      const c = new Character(o);
      const sp = spots[i];
      c.root.position.set(...sp.pos); c.root.rotation.y = sp.yaw;
      if (sp.held && ITEMS[sp.held]) {
        const m = buildItemModel(ITEMS[sp.held]), hg = new THREE.Group(); hg.add(m);
        if (sp.held === 'scanner') hg.rotation.set(-0.3, 0, 0); else { m.rotation.x = Math.PI / 2; m.position.z = -0.06; hg.rotation.x = -Math.PI / 2 + 0.25; }
        c.setHeld(hg);
      }
      S.add(c.root);
      return { c, act: sp.act, t: Math.random(), next: 2 + Math.random() * 3, on: true };
    });
    this.myT = 0;
  }
  buildTimmy() {
    const T = buildTimmy();
    this.scene.add(T.root);
    this.timmy = { m: T, pos: new THREE.Vector3(4.2, 1.9, -0.8), t: 0, eyeT: 0, look: new THREE.Vector3() };
    T.root.position.copy(this.timmy.pos);
  }
  // ---------------------------------------------------------------- camera shots
  shot(name, snap = false) {
    const S = {
      menu: { pos: [-1.2, 2.4, 5.0], look: [1.0, 1.45, -3.0], fov: 46 },
      wardrobe: { pos: [0.4, 1.0, 0.9], look: [2.48, 0.62, -1.26], fov: 36 },
      portal: { pos: [-0.4, 1.7, 1.6], look: [0.6, 2.0, -5.9], fov: 52 },
    }[name];
    this.camFrom = { pos: this.camera.position.clone(), look: this.camLook?.clone() ?? new THREE.Vector3(...S.look), fov: this.camera.fov };
    this.camTo = { pos: new THREE.Vector3(...S.pos), look: new THREE.Vector3(...S.look), fov: S.fov };
    this.camK = snap ? 1 : 0;
    this.shotName = name;
    if (snap) { this.camera.position.copy(this.camTo.pos); this.camLook = this.camTo.look.clone(); this.camera.fov = S.fov; this.camera.updateProjectionMatrix(); }
  }
  // ---------------------------------------------------------------- the wardrobe
  dress(outfit) { if (outfit) this.me.setOutfit(outfit); }
  wardrobe(on) {
    this.mode = on ? 'wardrobe' : 'menu';
    this.shot(on ? 'wardrobe' : 'menu');
    this.spin = 0;
    this.standK = this.standK ?? 0;
  }
  // ---------------------------------------------------------------- lifecycle
  enter() {
    const e = this.g.engine;
    e.sceneOverride = this.scene; e.cameraOverride = this.camera;
    e.raysScale = 0;
    this.active = true;
    this.g.lab = this;
    this.hookInput();
  }
  exit() {
    const e = this.g.engine;
    if (e.sceneOverride === this.scene) { e.sceneOverride = null; e.cameraOverride = null; }
    e.raysScale = 1;
    this.active = false;
    this.unhookInput?.();
    if (this.label) this.label.remove();
  }
  dispose() {
    this.exit();
    this.scene.traverse((o) => { o.geometry?.dispose?.(); });
    this.me?.dispose(); for (const c of this.crew ?? []) c.c.dispose();
    this.scene.environment?.dispose();
  }
  // clicking your scientist opens the wardrobe
  hookInput() {
    const cvs = this.g.engine.renderer.domElement;
    const ray = new THREE.Raycaster(), m = new THREE.Vector2();
    const hit = (e) => {
      const r = cvs.getBoundingClientRect();
      m.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(m, this.camera);
      // a capsule round the scientist
      const c = _v.copy(this.me.root.position).add(_w.set(0, 0.6, 0));
      const oc = c.clone().sub(ray.ray.origin), tt = oc.dot(ray.ray.direction);
      const d2 = oc.lengthSq() - tt * tt;
      return tt > 0 && d2 < 0.5 * 0.5;
    };
    const move = (e) => {
      if (this.mode === 'wardrobe' && this.drag) { this.spinV = (e.clientX - this.drag) * 0.012; this.spin += this.spinV; this.drag = e.clientX; return; }
      this.hover = this.mode === 'menu' && hit(e);
      cvs.style.cursor = this.hover ? 'pointer' : '';
    };
    const down = (e) => {
      if (this.mode === 'wardrobe') { this.drag = e.clientX; return; }
      if (this.mode === 'menu' && hit(e)) { this.g.audio?.play('ui_click'); this.opt.onCustomise?.(); }
    };
    const up = () => { this.drag = null; };
    cvs.addEventListener('pointermove', move); cvs.addEventListener('pointerdown', down); window.addEventListener('pointerup', up);
    this.unhookInput = () => { cvs.removeEventListener('pointermove', move); cvs.removeEventListener('pointerdown', down); window.removeEventListener('pointerup', up); cvs.style.cursor = ''; };
    // the floating hologram tag over your scientist
    const L = document.createElement('div'); L.className = 'lab-tag'; L.innerHTML = '<b>YOU</b><span>CLICK TO CUSTOMISE</span>';
    document.getElementById('ui')?.appendChild(L) ?? document.body.appendChild(L);
    this.label = L;
  }
  update(dt) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t, e = this.g.engine;
    if (Math.abs(this.camera.aspect - e.camera.aspect) > 1e-4) { this.camera.aspect = e.camera.aspect; this.camera.updateProjectionMatrix(); }
    // camera: ease between shots, then drift a little
    if (this.camK < 1) this.camK = Math.min(1, this.camK + dt / 1.4);
    const k = ease(this.camK);
    const drift = this.mode === 'menu' ? _w.set(Math.sin(t * 0.13) * 0.35, Math.sin(t * 0.21) * 0.12, Math.sin(t * 0.1) * 0.2) : _w.set(0, 0, 0);
    if (!this.cineCam) {
      this.camera.position.lerpVectors(this.camFrom.pos, this.camTo.pos, k).add(drift);
      this.camLook = this.camFrom.look.clone().lerp(this.camTo.look, k);
      this.camera.fov = this.camFrom.fov + (this.camTo.fov - this.camFrom.fov) * k;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.camLook);
    }
    // portal: idle swirl unless the cinematic opens it
    const P = this.portal;
    const U = P.disc.material.uniforms;
    U.uT.value = t; U.uOpen.value = this.portalOpen ?? 0;
    const open = this.portalOpen ?? 0;
    this.portalLight.intensity = 14 + Math.sin(t * 3) * 2 + open * 60;
    this.portalInner.material.emissiveIntensity = 3 + Math.sin(t * 5) * 0.6 + open * 4;
    for (const [i, l] of this.portalLeds.entries()) l.material.emissiveIntensity = (Math.sin(t * (2 + open * 10) - i * 0.5) > 0.2 ? 3 : 0.3) * (1 + open);
    for (const f of this.anims) f(t, open);
    for (const [i, l] of this.rackLeds.entries()) l.visible = Math.sin(t * (3 + (i % 7)) + i * 1.7) > -0.2;
    for (const b of this.bubbles) { const p = (b.userData.ph + t * 0.4) % 1; b.position.set(Math.sin(p * 20 + b.userData.ph * 6) * 0.03, 0.04 + p * 0.12, Math.cos(p * 17) * 0.03); b.scale.setScalar(1 - p * 0.6); }
    // screens at ~12 fps
    this.scrT = (this.scrT ?? 0) - dt;
    if (this.scrT <= 0) { this.scrT = 1 / 12; for (const s of this.screens) s.draw(1 / 12); }
    this.deskLight.intensity = 3.6 + Math.sin(t * 7) * 0.3;
    // you: typing away, until you get up for the wardrobe
    const me = this.me;
    const stand = this.mode === 'wardrobe' || this.mode === 'cinematic-stand';
    this.standK = THREE.MathUtils.clamp((this.standK ?? 0) + (stand ? dt : -dt) * 2.2, 0, 1);
    const sk = ease(this.standK);
    const seat = this.chair.position;
    const standAt = _v.set(2.0, 0, -1.3);
    me.root.position.set(seat.x + (standAt.x - seat.x) * sk, 0, seat.z + (standAt.z - seat.z) * sk);
    const faceCam = Math.atan2(-(this.camera.position.x - me.root.position.x), -(this.camera.position.z - me.root.position.z));
    const wantYaw = stand ? faceCam + (this.spin ?? 0) : -Math.PI / 2;
    let dy = wantYaw - me.root.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    me.root.rotation.y += dy * Math.min(1, dt * (stand ? 6 : 3));
    this.myT += dt;
    me.update(dt, {
      speed: this.standK > 0 && this.standK < 1 ? 1.2 : 0, grounded: true,
      sitting: this.standK < 0.5, action: this.standK < 0.3 ? { name: 'type', t: (this.myT % 1) } : this.mode === 'wardrobe' && this.hover2 ? { name: 'wave', t: (this.myT % 1) } : null,
      lookPitch: stand ? 0.05 : -0.12, lookYaw: 0, expr: stand ? 'happy' : 'neutral', lod: 0,
    });
    // the crew loop their jobs, with breaks
    for (const C of this.crew) {
      C.t += dt; C.next -= dt;
      if (C.next <= 0) { C.on = !C.on; C.next = C.on ? 3 + Math.random() * 4 : 1.5 + Math.random() * 2; C.t = 0; }
      C.c.update(dt, { speed: 0, grounded: true, action: C.on ? { name: C.act, t: (C.t * 0.6) % 1 } : null, lookPitch: 0, lookYaw: 0, lod: 0 });
    }
    // Timmy floats round the console, watching you type (or the camera in the wardrobe)
    const Tm = this.timmy, M = Tm.m;
    if (!this.cineTimmy) {
      const goal = this.mode === 'wardrobe' ? _v.set(1.35 + Math.sin(t * 0.7) * 0.15, 1.4 + Math.sin(t * 1.3) * 0.06, -1.05) : _v.set(2.3 + Math.sin(t * 0.4) * 0.5, 1.95 + Math.sin(t * 0.9) * 0.15, -3.1 + Math.cos(t * 0.33) * 0.4);
      Tm.pos.lerp(goal, Math.min(1, dt * 1.5));
      Tm.look.copy(this.mode === 'wardrobe' ? this.camera.position : _w.set(3.2, 1.2, -2.3));
    }
    M.root.position.copy(Tm.pos);
    M.root.position.y += Math.sin(t * 2.3) * 0.03;
    _v.copy(Tm.look).sub(Tm.pos);
    M.root.rotation.set(0, Math.atan2(-_v.x, -_v.z), 0);
    M.body.rotation.set(Math.sin(t * 1.1) * 0.05, 0, Math.sin(t * 1.7) * 0.06);
    M.flame.material.uniforms.uT.value = t; M.flame.material.uniforms.uK.value = 0.7;
    Tm.eyeT -= dt;
    if (Tm.eyeT <= 0) { Tm.eyeT = 1 / 15; const blink = (t % 3.7) < 0.12 ? 1 : 0; drawEye(M.eye.ctx, 128, { expr: this.mode === 'wardrobe' ? 'love' : 'normal', blink, lx: Math.sin(t * 0.8) * 0.4, ly: 0.2, t }); M.eye.tex.needsUpdate = true; }
    // the hologram tag over your head
    if (this.label) {
      const show = this.mode === 'menu' && !this.cineCam;
      this.label.classList.toggle('hidden', !show);
      if (show) {
        _v.copy(me.root.position).add(_w.set(0, 1.45 + Math.sin(t * 2) * 0.03, 0)).project(this.camera);
        this.label.style.left = ((_v.x * 0.5 + 0.5) * innerWidth).toFixed(0) + 'px';
        this.label.style.top = ((-_v.y * 0.5 + 0.5) * innerHeight).toFixed(0) + 'px';
        this.label.classList.toggle('hot', !!this.hover);
      }
    }
  }
}
