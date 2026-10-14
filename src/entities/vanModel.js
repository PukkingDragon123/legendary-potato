// The Chrono-Van: a heavily modified 1980s camper van turned time machine.
// Local frame: forward = -Z, right = +X, up = +Y, origin on the ground under
// the middle of the van. Built from extruded side profiles (real window holes
// and wheel arches) so the interior is a walkable shell.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { VAN_TEX, textTexture, STICKERS } from '../gfx/vanTextures.js';
import { PixelPainter } from '../gfx/pixel.js';

export const VAN = { L: 4.9, W: 2.0, floor: 0.58, roof: 2.18, z0: -2.45, z1: 2.45, wheelR: 0.37, frontAxle: -1.55, rearAxle: 1.6 };

const M = {};
const mat = (key, make) => M[key] ?? (M[key] = patchMaterial(make(), { wet: !!make.wet }));
export function std(key, o) { return mat(key, () => new THREE.MeshStandardMaterial(o)); }
function phys(key, o) { return mat(key, () => new THREE.MeshPhysicalMaterial(o)); }

export function boxUV(geo, s = 0.5) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = z * s; v = y * s; } else if (ay >= az) { u = x * s; v = z * s; } else { u = x * s; v = y * s; }
    uv[i * 2] = u; uv[i * 2 + 1] = v;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
export const mk = (geo, material, cast = true) => { const m = new THREE.Mesh(geo, material); m.castShadow = cast; m.receiveShadow = true; return m; };
export const box = (w, h, d, material, x, y, z, r = 0, uvs = 0.5) => { const g = r > 0 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d); if (uvs) boxUV(g, uvs); const m = mk(g, material); m.position.set(x, y, z); return m; };
export const at = (o, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o; };
export const cyl = (rt, rb, h, material, seg = 12) => mk(new THREE.CylinderGeometry(rt, rb, h, seg), material);

// side panel: profile in (z, y), extruded along x by thickness, placed at xOff
function panel(outline, holes, thickness, xOff, material, uvScale = 0.5) {
  const shape = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(-z, y)));
  for (const h of holes) shape.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(-z, y))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 1, curveSegments: 8 });
  geo.rotateY(Math.PI / 2);
  geo.translate(xOff, 0, 0);
  geo.computeVertexNormals();
  boxUV(geo, uvScale);
  return mk(geo, material);
}
const roundRect = (z0, y0, z1, y1, r = 0.06) => {
  const pts = [];
  const corner = (cz, cy, a0) => { for (let k = 0; k <= 4; k++) { const a = a0 + (k / 4) * (Math.PI / 2); pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(z1 - r, y0 + r, -Math.PI / 2); corner(z1 - r, y1 - r, 0); corner(z0 + r, y1 - r, Math.PI / 2); corner(z0 + r, y0 + r, Math.PI);
  return pts;
};
// lower band outline with wheel arch cut-outs between z0..z1
function lowerBand(z0, z1, yBot, yTop) {
  const pts = [[z0, yBot]];
  for (const ax of [VAN.frontAxle, VAN.rearAxle]) {
    const R = 0.47;
    if (ax - R > z0 && ax + R < z1) {
      pts.push([ax - R, yBot]);
      for (let k = 0; k <= 10; k++) { const a = Math.PI - (k / 10) * Math.PI; pts.push([ax + Math.cos(a) * R, yBot + Math.sin(a) * R * 0.92]); }
      pts.push([ax + R, yBot]);
    }
  }
  pts.push([z1, yBot], [z1, yTop], [z0, yTop]);
  return pts;
}

// screen canvas used by CRT monitors (updated by the van logic)
export function makeScreen(w = 160, h = 120) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
  return { c, ctx: c.getContext('2d'), tex: t };
}

export function buildVan() {
  const root = new THREE.Group(); root.name = 'van';
  const body = new THREE.Group(); body.name = 'body'; root.add(body);
  const parts = {};
  const T = VAN_TEX;
  const teal = std('teal', { map: T.teal(), roughness: 0.55, metalness: 0.15 });
  const cream = std('cream', { map: T.cream(), roughness: 0.55, metalness: 0.15 });
  const stripe = std('stripe', { map: T.stripe(), roughness: 0.5, metalness: 0.15 });
  const dark = std('dark', { color: 0x2a2826, roughness: 0.8 });
  const chrome = std('chrome', { color: 0xd0d4d8, roughness: 0.18, metalness: 1 });
  const rubber = std('rubber', { color: 0x1e1c1b, roughness: 0.9 });
  const glass = phys('glass', { color: 0x9ac8d8, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.38, envMapIntensity: 1.2, side: THREE.DoubleSide, depthWrite: false });
  const panelMat = std('panel', { map: T.panel(), roughness: 0.75 });
  const carpet = std('carpet', { map: T.carpet(), roughness: 0.95 });
  const uph = std('uph', { map: T.upholstery(), roughness: 0.9 });
  const metal = std('metal', { map: T.metal(), roughness: 0.4, metalness: 0.8 });
  const copper = std('copper', { map: T.copper(), roughness: 0.3, metalness: 0.9 });
  const beige = std('beige', { color: 0xd8cfb4, roughness: 0.6 });
  const pcb = std('pcb', { map: T.pcb(), roughness: 0.5 });
  const black = std('black', { color: 0x161616, roughness: 0.5 });
  const red = std('red', { color: 0xc8302a, roughness: 0.45 });
  const mats = { teal, cream, stripe, dark, chrome, rubber, glass, panelMat, carpet, uph, metal, copper, beige, pcb, black, red };
  const { z0, z1, floor, roof } = VAN;
  const yBot = 0.42, yStripe0 = 1.06, yStripe1 = 1.14;
  const W2 = VAN.W / 2, th = 0.05;

  // ---------------------------------------------------------------- chassis + floor
  body.add(box(1.86, 0.16, 4.6, dark, 0, 0.36, 0, 0, 0));
  const floorMesh = box(1.9, 0.06, 4.7, carpet, 0, floor - 0.03, 0.05, 0, 1.2);
  body.add(floorMesh);
  // front nose + bumper + grille
  body.add(box(1.96, 0.62, 0.32, teal, 0, yBot + 0.31, z0 + 0.16, 0.06));
  const bumperF = box(2.08, 0.16, 0.18, chrome, 0, 0.5, z0 - 0.04, 0.05, 0); bumperF.rotation.z = 0.05; bumperF.rotation.y = 0.04; body.add(bumperF);
  const grille = box(1.1, 0.24, 0.04, std('grille', { color: 0x3a3a3a, roughness: 0.5, metalness: 0.6 }), 0, 0.85, z0 - 0.005, 0.01, 0); body.add(grille);
  for (let i = 0; i < 6; i++) body.add(box(1.0, 0.012, 0.02, chrome, 0, 0.76 + i * 0.035, z0 - 0.03, 0, 0));
  // headlights (one smashed)
  parts.headlights = [];
  for (const sx of [-1, 1]) {
    const ring = cyl(0.13, 0.13, 0.06, chrome, 16); ring.rotation.x = Math.PI / 2; ring.position.set(sx * 0.72, 0.85, z0 - 0.01); body.add(ring);
    const lens = cyl(0.11, 0.11, 0.02, sx > 0 ? std('lensBroken', { color: 0x3a3a30, roughness: 0.6 }) : std('lens', { color: 0xfff6d8, roughness: 0.1, emissive: 0x000000 }), 16);
    lens.rotation.x = Math.PI / 2; lens.position.set(sx * 0.72, 0.85, z0 - 0.045); body.add(lens);
    parts.headlights.push(lens);
  }
  // front hood panel (engine access) — cab-over van, small service hatch
  const hood = new THREE.Group(); hood.name = 'hood';
  hood.position.set(0, 1.06, z0 + 0.32);
  const hoodPanel = box(1.94, 0.05, 0.42, teal, 0, 0, -0.21, 0.02); hood.add(hoodPanel);
  body.add(hood); parts.hood = hood;
  // ---------------------------------------------------------------- side panels (left static, right with sliding door gap)
  const cabZ0 = -1.88, cabZ1 = -1.02, slideZ0 = -0.96, slideZ1 = 0.46;
  const winY0 = 1.32, winY1 = 1.92;
  for (const side of [-1, 1]) {
    const xo = side < 0 ? -W2 : W2 - th;
    // lower band
    const segs = side < 0 ? [[cabZ1 + 0.02, z1]] : [[cabZ1 + 0.02, slideZ0 - 0.01], [slideZ1 + 0.01, z1]];
    for (const [a, b] of segs) body.add(panel(lowerBand(a, b, yBot, yStripe0), [], th, xo, teal));
    for (const [a, b] of segs) body.add(panel([[a, yStripe0], [b, yStripe0], [b, yStripe1], [a, yStripe1]], [], th + 0.004, xo - 0.002, stripe, 2));
    // upper band with windows
    for (const [a, b] of segs) {
      const holes = [];
      if (b - a > 1.2) holes.push(roundRect(a + 0.12, winY0, Math.min(b - 0.15, a + 1.55), winY1, 0.08));
      if (b - a > 1.8) holes.push(roundRect(a + 1.7, winY0, b - 0.18, winY1, 0.08));
      const top = [[a, yStripe1], [b, yStripe1], [b, roof - 0.12], [b - 0.05, roof - 0.03], [a, roof - 0.03]];
      body.add(panel(top, holes, th, xo, cream));
      for (const hh of holes) {
        const zs = hh.map((q) => q[0]), ys = hh.map((q) => q[1]);
        const gz0 = Math.min(...zs), gz1 = Math.max(...zs);
        const pane = box(0.01, winY1 - winY0, gz1 - gz0, glass, side * (W2 - 0.025), (winY0 + winY1) / 2, (gz0 + gz1) / 2, 0, 0);
        pane.castShadow = false;
        body.add(pane);
      }
    }
    // interior wood panelling
    for (const [a, b] of segs) {
      const pz = (a + b) / 2, len = b - a;
      const w1 = box(0.02, yStripe1 + 0.15 - floor, len, panelMat, side * (W2 - th - 0.012), (floor + yStripe1 + 0.15) / 2, pz, 0, 1.4);
      w1.castShadow = false; body.add(w1);
    }
  }
  // cab front: windshield frame + dash + windshield (cracked)
  const wsBottom = [z0 + 0.34, 1.12], wsTop = [cabZ0 + 0.02, roof - 0.05];
  const wsLen = Math.hypot(wsTop[0] - wsBottom[0], wsTop[1] - wsBottom[1]);
  const wsAng = Math.atan2(wsTop[1] - wsBottom[1], wsTop[0] - wsBottom[0]);
  const ws = new THREE.Group(); ws.position.set(0, (wsBottom[1] + wsTop[1]) / 2, (wsBottom[0] + wsTop[0]) / 2); ws.rotation.x = -(Math.PI / 2 - wsAng) + Math.PI / 2 - Math.PI / 2; body.add(ws);
  ws.rotation.x = wsAng - Math.PI / 2;
  const wsGlass = box(1.84, wsLen, 0.01, glass, 0, 0, 0, 0, 0); wsGlass.castShadow = false; ws.add(wsGlass);
  const crackMat = std('crack', { map: T.crack(), transparent: true, alphaTest: 0.3, roughness: 0.2, emissive: 0x222222 });
  const crack = mk(new THREE.PlaneGeometry(1.0, 1.0), crackMat, false); crack.position.set(0.35, 0.1, -0.012); crack.rotation.y = Math.PI; ws.add(crack); parts.crack = crack;
  for (const sx of [-1, 1]) ws.add(box(0.08, wsLen + 0.04, 0.07, cream, sx * 0.95, 0, 0, 0.02));
  ws.add(box(1.98, 0.08, 0.07, cream, 0, wsLen / 2, 0, 0.02));
  ws.add(box(1.98, 0.08, 0.07, cream, 0, -wsLen / 2, 0, 0.02));
  // wipers
  const wiper = box(0.7, 0.015, 0.02, black, -0.15, -wsLen / 2 + 0.08, -0.04, 0, 0); wiper.rotation.z = 0.25; ws.add(wiper);
  // roof
  const roofMesh = box(2.02, 0.08, z1 - cabZ0 + 0.02, cream, 0, roof - 0.02, (cabZ0 + z1) / 2, 0.04);
  body.add(roofMesh);
  const ceiling = box(1.88, 0.02, z1 - cabZ0 - 0.1, std('ceiling', { color: 0xd8ccb0, roughness: 0.9 }), 0, roof - 0.075, (cabZ0 + z1) / 2, 0, 0); ceiling.castShadow = false; body.add(ceiling);
  // rear frame
  body.add(box(2.0, 0.12, 0.1, cream, 0, roof - 0.1, z1 - 0.05, 0.02));
  body.add(box(2.0, yStripe0 - yBot, 0.1, teal, 0, (yBot + 0.62) / 2 + 0.05, z1 - 0.05, 0.02));
  const bumperR = box(2.06, 0.16, 0.16, chrome, 0, 0.5, z1 + 0.05, 0.05, 0); body.add(bumperR);
  // taillights
  for (const sx of [-1, 1]) body.add(box(0.12, 0.3, 0.04, std('taillight', { color: 0xc01a10, emissive: 0x300000, roughness: 0.3 }), sx * 0.9, 1.0, z1 + 0.01, 0.01, 0));
  // license plate
  const plate = mk(new THREE.PlaneGeometry(0.52, 0.12), std('plate', { map: textTexture(['T1ME-V4N'], { w: 192, h: 48, bg: '#f6f0dc', fg: '#2a3a8a', size: 30 }), roughness: 0.5 }));
  plate.position.set(0, 0.68, z1 + 0.14); body.add(plate);
  const plateF = plate.clone(); plateF.position.set(0, 0.52, z0 - 0.14); plateF.rotation.y = Math.PI; body.add(plateF);

  // ---------------------------------------------------------------- doors
  const doorGroup = (name, hinge) => { const g = new THREE.Group(); g.name = name; g.position.copy(hinge); body.add(g); return g; };
  // cab doors (hinge at front edge)
  parts.doors = {};
  for (const side of [-1, 1]) {
    const hinge = new THREE.Vector3(side * W2 + side * -0.0, 0, cabZ0);
    const d = doorGroup(side < 0 ? 'door_cab_l' : 'door_cab_r', hinge);
    const len = cabZ1 - cabZ0;
    const xo = side < 0 ? 0 : -th;
    const lower = panel([[0, yBot + 0.08], [len, yBot + 0.08], [len, yStripe0], [0, yStripe0]], [], th, xo, teal); d.add(lower);
    d.add(panel([[0, yStripe0], [len, yStripe0], [len, yStripe1], [0, yStripe1]], [], th + 0.004, xo - 0.002, stripe, 2));
    const win = roundRect(0.08, winY0 - 0.06, len - 0.07, winY1, 0.06);
    d.add(panel([[0, yStripe1], [len, yStripe1], [len, roof - 0.2], [0.05, roof - 0.2]], [win], th, xo, cream));
    const pane = box(0.01, winY1 - winY0 + 0.06, len - 0.15, glass, side * -0.025, (winY0 + winY1) / 2 - 0.03, len / 2, 0, 0); pane.castShadow = false; d.add(pane);
    const handle = box(0.03, 0.03, 0.14, chrome, side * 0.03, 1.0, len - 0.2, 0.01, 0); d.add(handle);
    const mirror = box(0.05, 0.16, 0.1, black, side * 0.12, 1.45, 0.05, 0.02, 0); d.add(mirror);
    parts.doors[d.name] = { g: d, kind: 'hinge', axis: 'y', open: side * 1.2, t: 0, target: 0 };
  }
  // sliding door (right side)
  {
    const d = doorGroup('door_slide', new THREE.Vector3(W2 - th, 0, slideZ0));
    const len = slideZ1 - slideZ0;
    d.add(panel([[0, yBot + 0.04], [len, yBot + 0.04], [len, yStripe0], [0, yStripe0]], [], th, 0, teal));
    d.add(panel([[0, yStripe0], [len, yStripe0], [len, yStripe1], [0, yStripe1]], [], th + 0.004, -0.002, stripe, 2));
    const win = roundRect(0.14, winY0, len - 0.14, winY1, 0.08);
    d.add(panel([[0, yStripe1], [len, yStripe1], [len, roof - 0.06], [0, roof - 0.06]], [win], th, 0, cream));
    const pane = box(0.01, winY1 - winY0, len - 0.28, glass, 0.025, (winY0 + winY1) / 2, len / 2, 0, 0); pane.castShadow = false; d.add(pane);
    // tinfoil taped over the sliding window ("radiation shielding")
    const foil = box(0.012, 0.36, 0.5, std('foil', { color: 0xd8dce0, roughness: 0.25, metalness: 1 }), 0.035, 1.66, len * 0.62, 0, 0); foil.rotation.x = 0.06; d.add(foil);
    d.add(box(0.03, 0.04, 0.2, chrome, 0.07, 1.0, 0.12, 0.01, 0));
    const inner = box(0.02, yStripe1 + 0.1 - floor, len, panelMat, -0.015, (floor + yStripe1 + 0.1) / 2, len / 2, 0, 1.4); inner.castShadow = false; d.add(inner);
    parts.doors.door_slide = { g: d, kind: 'slide', closed: new THREE.Vector3(W2 - th, 0, slideZ0), opened: new THREE.Vector3(W2 + 0.06, 0, slideZ0 + 1.25), t: 0, target: 0 };
  }
  // rear barn doors
  for (const side of [-1, 1]) {
    const d = doorGroup(side < 0 ? 'door_rear_l' : 'door_rear_r', new THREE.Vector3(side * (W2 - 0.02), 0, z1 - 0.06));
    const w = W2 - 0.04;
    const g = new THREE.Group(); d.add(g);
    const p0 = box(w, yStripe0 - yBot - 0.15, 0.05, teal, -side * w / 2, (yBot + 0.15 + yStripe0) / 2, 0, 0.02); g.add(p0);
    g.add(box(w, yStripe1 - yStripe0, 0.054, stripe, -side * w / 2, (yStripe0 + yStripe1) / 2, 0, 0, 2));
    const up = box(w, roof - 0.16 - yStripe1, 0.05, cream, -side * w / 2, (yStripe1 + roof - 0.16) / 2, 0, 0.02); g.add(up);
    const pane = box(w - 0.24, 0.42, 0.012, glass, -side * w / 2, 1.62, 0.03, 0, 0); pane.castShadow = false; g.add(pane);
    g.add(box(0.03, 0.18, 0.04, chrome, -side * (w - 0.08), 1.0, 0.05, 0.01, 0));
    const inner = box(w, roof - 0.2 - yBot - 0.15, 0.02, panelMat, -side * w / 2, (yBot + 0.15 + roof - 0.2) / 2, -0.035, 0, 1.4); inner.castShadow = false; g.add(inner);
    parts.doors[d.name] = { g: d, kind: 'hinge', axis: 'y', open: side * 1.75, t: 0, target: 0 };
  }

  // ---------------------------------------------------------------- wheels
  parts.wheels = [];
  const tireMat = std('tire', { map: T.tire(), roughness: 0.92 });
  for (const [sx, az] of [[-1, VAN.frontAxle], [1, VAN.frontAxle], [-1, VAN.rearAxle], [1, VAN.rearAxle]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.86, VAN.wheelR, az); root.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin);
    const tire = mk(new THREE.TorusGeometry(VAN.wheelR - 0.1, 0.1, 10, 22), tireMat); tire.rotation.y = Math.PI / 2; tire.scale.set(1, 1, 1.5); spin.add(tire);
    const rim = cyl(0.2, 0.2, 0.2, chrome, 14); rim.rotation.z = Math.PI / 2; spin.add(rim);
    const hub = cyl(0.08, 0.08, 0.23, metal, 8); hub.rotation.z = Math.PI / 2; spin.add(hub);
    for (let k = 0; k < 5; k++) { const nut = cyl(0.015, 0.015, 0.24, metal, 6); nut.rotation.z = Math.PI / 2; nut.position.set(0, Math.cos(k * 1.256) * 0.12, Math.sin(k * 1.256) * 0.12); spin.add(nut); }
    parts.wheels.push({ pivot, spin, sx, az, front: az < 0, tire });
  }
  parts.flatTire = parts.wheels[0]; // front-left starts flat

  // ---------------------------------------------------------------- roof rack + junk + time-machine antenna
  const rack = new THREE.Group(); rack.position.y = roof + 0.04; body.add(rack);
  for (const sx of [-1, 1]) { const r = box(0.04, 0.04, 3.6, chrome, sx * 0.85, 0.12, 0.5, 0.01, 0); rack.add(r); for (let k = 0; k < 4; k++) rack.add(box(0.03, 0.12, 0.03, chrome, sx * 0.85, 0.05, -1.1 + k * 1.1, 0, 0)); }
  for (let k = 0; k < 5; k++) rack.add(box(1.74, 0.03, 0.03, chrome, 0, 0.14, -1.2 + k * 0.85, 0, 0));
  const jerry = std('jerry', { color: 0x4a7a3a, roughness: 0.5 });
  for (let k = 0; k < 2; k++) rack.add(box(0.18, 0.3, 0.38, jerry, -0.6 + k * 0.22, 0.31, 1.6, 0.03));
  const tarp = box(0.9, 0.3, 0.7, std('tarp', { color: 0x2a5aa0, roughness: 0.9 }), 0.25, 0.3, 1.2, 0.12); rack.add(tarp);
  for (const zz of [1.0, 1.4]) rack.add(box(0.95, 0.02, 0.03, std('strap', { color: 0xd04020 }), 0.25, 0.46, zz, 0, 0));
  const cone = mk(new THREE.ConeGeometry(0.14, 0.4, 10), std('cone', { color: 0xff6a20, roughness: 0.5 })); cone.position.set(-0.55, 0.35, 0.6); cone.rotation.z = 1.4; rack.add(cone);
  // bent satellite dish
  const dish = new THREE.Group(); dish.position.set(0.45, 0.16, -0.6); rack.add(dish);
  dish.add(at(cyl(0.025, 0.025, 0.45, metal, 6), 0, 0.22, 0));
  const bowl = mk(new THREE.SphereGeometry(0.42, 16, 6, 0, Math.PI * 2, 0, 0.7), std('dish', { color: 0xe8e4dc, roughness: 0.5, side: THREE.DoubleSide })); bowl.position.y = 0.5; bowl.rotation.set(-1.9, 0.3, 0.45); dish.add(bowl);
  parts.dish = dish;
  // temporal antenna tube + coils on the roof back
  const tube = cyl(0.09, 0.09, 1.2, std('tubeglass', { color: 0x7aeaff, emissive: 0x1a6070, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.75 }), 12);
  tube.rotation.x = Math.PI / 2; tube.position.set(-0.45, 0.3, -0.3); rack.add(tube); parts.roofTube = tube;
  for (let k = 0; k < 6; k++) { const ring = mk(new THREE.TorusGeometry(0.11, 0.018, 6, 14), copper); ring.position.set(-0.45, 0.3, -0.8 + k * 0.2); rack.add(ring); }
  // christmas lights along the roof edge
  parts.xmas = [];
  const bulbCols = [0xff4040, 0x40ff60, 0x4080ff, 0xffd040, 0xff60e0];
  for (let k = 0; k < 22; k++) {
    const t = k / 21;
    const z = cabZ0 + 0.1 + t * (z1 - cabZ0 - 0.2);
    for (const sx of [-1, 1]) {
      const c = bulbCols[(k + (sx > 0 ? 2 : 0)) % 5];
      const b = mk(new THREE.SphereGeometry(0.025, 6, 4), std('bulb' + c, { color: c, emissive: c, emissiveIntensity: 0, roughness: 0.4 }), false);
      b.position.set(sx * 1.02, roof - 0.1 - Math.sin(t * Math.PI * 7) * 0.04, z);
      body.add(b); parts.xmas.push(b);
    }
  }
  // stickers
  const stickerSpots = [[1, 0.72, 1.9, 0], [1, 0.7, -0.3, 1], [-1, 0.72, 1.4, 2], [-1, 1.62, 1.1, 3], [-1, 0.78, -0.5, 4], [0, 0.92, 2.5, 5], [1, 1.6, 2.05, 6], [-1, 0.75, 2.05, 7]];
  stickerSpots.forEach(([side, y, z, i]) => {
    const st = STICKERS[i];
    const tex = textTexture(st.text, { w: st.w, h: st.h, bg: st.bg, fg: st.fg, size: st.size ?? 20 });
    const sw = st.w / 256 * 0.55, sh = st.h / 256 * 0.55;
    const m = mk(new THREE.PlaneGeometry(sw, sh), std('sticker' + i, { map: tex, roughness: 0.6 }), false);
    if (side === 0) { m.position.set(-0.5, y, z1 + 0.035); }
    else { m.position.set(side * (W2 + 0.016), y, z); m.rotation.y = side * Math.PI / 2; }
    m.rotation.z = (i % 3 - 1) * 0.06;
    (side === 0 ? parts.doors.door_rear_l.g : body).add(m);
    if (side === 0) m.position.set(-0.5, y, 0.035);
  });
  // rust + mud decals
  const rustMat = std('rustdecal', { map: T.rust(), transparent: true, alphaTest: 0.5, roughness: 0.9 });
  const mudMat = std('muddecal', { map: T.mud(), transparent: true, alphaTest: 0.5, roughness: 1 });
  for (const [side, y, z, s] of [[1, 0.55, VAN.frontAxle + 0.55, 0.35], [-1, 0.6, VAN.rearAxle - 0.6, 0.4], [1, 0.95, 2.3, 0.3], [-1, 1.0, -1.2, 0.25], [1, 1.95, -0.2, 0.3]]) {
    const m = mk(new THREE.PlaneGeometry(s, s), rustMat, false);
    m.position.set(side * (W2 + 0.014), y, z); m.rotation.y = side * Math.PI / 2; body.add(m);
  }
  for (const side of [-1, 1]) { const m = mk(new THREE.PlaneGeometry(4.6, 0.36), mudMat, false); m.position.set(side * (W2 + 0.012), 0.6, 0.05); m.rotation.y = side * Math.PI / 2; body.add(m); }

  // ---------------------------------------------------------------- cab interior
  const cab = new THREE.Group(); body.add(cab);
  parts.seats = {};
  for (const [name, sx] of [['seat_driver', -0.48], ['seat_pass', 0.48]]) {
    const s = new THREE.Group(); s.position.set(sx, floor, -1.42); cab.add(s);
    s.add(box(0.56, 0.16, 0.52, uph, 0, 0.36, 0, 0.06, 1.5));
    const back = box(0.54, 0.62, 0.14, uph, 0, 0.75, 0.24, 0.06, 1.5); back.rotation.x = -0.12; s.add(back);
    s.add(box(0.3, 0.16, 0.1, uph, 0, 1.12, 0.3, 0.04, 1.5));
    s.add(box(0.5, 0.28, 0.46, dark, 0, 0.14, 0, 0.02, 0));
    parts.seats[name] = { g: s, seatPos: new THREE.Vector3(sx, floor + 0.44, -1.38), occupant: null };
  }
  // dashboard
  const dash = box(1.84, 0.36, 0.42, std('dash', { color: 0x3a3430, roughness: 0.6 }), 0, 1.0, -2.02, 0.05, 0);
  cab.add(dash);
  const gaugeTex = (() => { const p = new PixelPainter(128, 32, 7); p.fill([30, 28, 26]); for (const [cx, col] of [[20, [240, 240, 230]], [64, [240, 240, 230]], [108, [240, 200, 80]]]) { p.disc(cx, 16, 13, [10, 10, 10]); p.disc(cx, 16, 11, [40, 40, 36]); for (let a = 0; a < 9; a++) { const an = Math.PI * 0.8 + (a / 8) * Math.PI * 1.4; p.set(cx + Math.cos(an) * 10, 16 + Math.sin(an) * 10, col); } p.line(cx, 16, cx + 7, 10, [230, 60, 40]); } return p.texture(); })();
  const gauges = mk(new THREE.PlaneGeometry(0.62, 0.155), std('gauges', { map: gaugeTex, roughness: 0.4, emissive: 0x111111 }), false);
  gauges.position.set(-0.48, 1.13, -1.81); gauges.rotation.x = -0.35; cab.add(gauges);
  // steering wheel
  const wheel = new THREE.Group(); wheel.position.set(-0.48, 1.22, -1.74); wheel.rotation.x = -1.0; cab.add(wheel);
  wheel.add(mk(new THREE.TorusGeometry(0.19, 0.022, 8, 24), std('swheel', { color: 0x2a2420, roughness: 0.6 })));
  for (let k = 0; k < 3; k++) { const sp = box(0.18, 0.02, 0.02, black, Math.cos(k * 2.09 + 1.57) * 0.09, Math.sin(k * 2.09 + 1.57) * 0.09, 0, 0, 0); sp.rotation.z = k * 2.09 + 1.57; wheel.add(sp); }
  wheel.add(at(cyl(0.04, 0.04, 0.04, red, 10), 0, 0, 0, Math.PI / 2, 0, 0));
  parts.steering = wheel;
  // dino bobblehead on the dash
  const bob = new THREE.Group(); bob.position.set(0.2, 1.2, -1.95); cab.add(bob);
  const bobBody = mk(new THREE.SphereGeometry(0.035, 10, 8), std('bobgreen', { color: 0x5aaa4a, roughness: 0.5 })); bobBody.scale.set(1, 1.2, 1.3); bob.add(bobBody);
  const bobHead = new THREE.Group(); bobHead.position.y = 0.07; bob.add(bobHead);
  const bh = mk(new THREE.SphereGeometry(0.035, 10, 8), std('bobgreen', {})); bh.scale.set(1, 0.9, 1.4); bh.position.z = -0.012; bobHead.add(bh);
  for (const sx of [-1, 1]) { const e = mk(new THREE.SphereGeometry(0.006, 6, 4), black, false); e.position.set(sx * 0.022, 0.012, -0.035); bobHead.add(e); }
  parts.bobble = { g: bob, head: bobHead, v: new THREE.Vector2(), a: new THREE.Vector2() };
  // fuzzy dice from the mirror
  const dice = new THREE.Group(); dice.position.set(0, roof - 0.18, -1.83); cab.add(dice);
  const diceMat = std('dice', { color: 0xf4f0e8, roughness: 1 });
  for (const sx of [-1, 1]) { const d = box(0.07, 0.07, 0.07, diceMat, sx * 0.05, -0.18, 0, 0.02, 0); d.rotation.set(0.3 * sx, 0.5, 0.2); dice.add(d); dice.add(box(0.004, 0.18, 0.004, black, sx * 0.05, -0.09, 0, 0, 0)); }
  parts.dice = dice;
  // glovebox
  const glove = new THREE.Group(); glove.position.set(0.48, 0.92, -1.81); cab.add(glove);
  glove.add(box(0.36, 0.14, 0.02, std('dash', {}), 0, 0, 0, 0.01, 0));
  glove.add(box(0.06, 0.015, 0.02, chrome, 0, 0.04, 0.012, 0, 0));
  parts.glovebox = glove;
  // radio / cassette
  const radio = box(0.3, 0.08, 0.04, black, 0, 1.06, -1.82, 0.01, 0); radio.rotation.x = -0.35; cab.add(radio);
  const radioLcd = mk(new THREE.PlaneGeometry(0.12, 0.03), std('radiolcd', { color: 0x203a20, emissive: 0x40ff60, emissiveIntensity: 0 }), false); radioLcd.position.set(0, 1.07, -1.795); radioLcd.rotation.x = -0.35; cab.add(radioLcd);
  parts.radio = { mesh: radio, lcd: radioLcd };
  // mirror
  cab.add(box(0.28, 0.08, 0.02, chrome, 0, roof - 0.15, -1.86, 0.01, 0));

  // ---------------------------------------------------------------- cargo / lab interior
  const lab = new THREE.Group(); body.add(lab);
  // workbench counter along the left wall
  const benchTop = box(0.56, 0.05, 1.7, std('benchtop', { color: 0x8a6440, roughness: 0.7, map: T.panel() }), -0.66, 0.98, 0.25, 0.01, 1.4); lab.add(benchTop);
  lab.add(box(0.52, 0.4, 1.66, std('cabinet', { color: 0xc8b894, roughness: 0.7 }), -0.68, 0.78, 0.25, 0.02, 0));
  // battery bank under the bench
  parts.batteries = [];
  for (let k = 0; k < 3; k++) {
    const b = box(0.24, 0.2, 0.18, black, -0.64, floor + 0.11, -0.3 + k * 0.22, 0.015, 0);
    lab.add(b);
    for (const sx of [-1, 1]) lab.add(at(cyl(0.018, 0.018, 0.03, sx < 0 ? red : black, 8), -0.64 + sx * 0.07, floor + 0.23, -0.3 + k * 0.22));
    parts.batteries.push(b);
  }
  const battLed = mk(new THREE.BoxGeometry(0.03, 0.03, 0.005), std('battled', { color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 2 }), false);
  battLed.position.set(-0.52, floor + 0.15, -0.3); lab.add(battLed); parts.battLed = battLed;
  // CRT monitors on the bench (main + two side)
  parts.screens = [];
  const crt = (w, h, d, x, y, z, rotY) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rotY; lab.add(g);
    g.add(box(w, h, d, beige, 0, 0, -d * 0.1, 0.03, 0));
    g.add(box(w * 0.7, h * 0.75, d * 0.5, beige, 0, -0.01, -d * 0.55, 0.05, 0));
    const scr = makeScreen(160, 120);
    const sm = std('screen' + parts.screens.length, { color: 0x000000, emissive: 0xffffff, emissiveMap: scr.tex, emissiveIntensity: 0.0, roughness: 0.15, metalness: 0 });
    const face = mk(new THREE.PlaneGeometry(w * 0.8, h * 0.72, 6, 6), sm, false);
    // slight CRT bulge
    const fp = face.geometry.attributes.position;
    for (let i = 0; i < fp.count; i++) { const fx = fp.getX(i) / (w * 0.4), fy = fp.getY(i) / (h * 0.36); fp.setZ(i, (1 - fx * fx * 0.5 - fy * fy * 0.5) * 0.02); }
    face.geometry.computeVertexNormals();
    face.position.set(0, 0.015, d / 2 + 0.001);
    g.add(face);
    g.add(box(0.03, 0.03, 0.01, std('pwrled', { color: 0x30ff60, emissive: 0x30ff60, emissiveIntensity: 1.5 }), w * 0.38, -h * 0.4, d / 2 + 0.006, 0, 0));
    const entry = { g, face, scr, mat: sm, w, h };
    parts.screens.push(entry);
    return entry;
  };
  // monitors face +x (into the aisle)
  parts.mainScreen = crt(0.42, 0.36, 0.38, -0.7, 1.2, 0.15, Math.PI / 2);
  crt(0.32, 0.28, 0.3, -0.72, 1.56, 0.15, Math.PI / 2);
  crt(0.3, 0.26, 0.3, -0.7, 1.15, 0.72, Math.PI / 2 - 0.25);
  // keyboard + floppies + mug + sticky notes + lamp
  const kb = box(0.15, 0.025, 0.42, beige, -0.5, 1.02, 0.15, 0.008, 0); lab.add(kb);
  const keysTex = (() => { const p = new PixelPainter(16, 48, 9); p.fill([200, 192, 170]); for (let y = 2; y < 46; y += 4) for (let x = 2; x < 14; x += 4) p.rect(x, y, 3, 3, [120, 114, 100]); return p.texture(); })();
  const keys = mk(new THREE.PlaneGeometry(0.13, 0.4), std('keys', { map: keysTex }), false); keys.rotation.x = -Math.PI / 2; keys.rotation.z = Math.PI / 2; keys.position.set(-0.5, 1.034, 0.15); lab.add(keys);
  for (let k = 0; k < 4; k++) { const f = box(0.09, 0.01, 0.09, std('floppy' + k, { color: [0x2a50a0, 0xd03030, 0x30a050, 0x222222][k], roughness: 0.4 }), -0.55 + (k % 2) * 0.02, 1.01 + k * 0.012, 0.68 + k * 0.01, 0, 0); f.rotation.y = k * 0.3; lab.add(f); }
  const mug = cyl(0.04, 0.035, 0.09, std('mug', { color: 0xe04a3a, roughness: 0.5 }), 12); mug.position.set(-0.52, 1.05, -0.35); lab.add(mug);
  for (let k = 0; k < 5; k++) { const n = mk(new THREE.PlaneGeometry(0.07, 0.07), std('note' + (k % 3), { color: [0xf6df7c, 0xff9ab0, 0x9ae0ff][k % 3], roughness: 0.9 }), false); n.position.set(-0.93, 1.25 + (k % 2) * 0.09, -0.2 + k * 0.12); n.rotation.y = Math.PI / 2; n.rotation.z = (k - 2) * 0.1; lab.add(n); }
  const lamp = new THREE.Group(); lamp.position.set(-0.72, 1.0, 1.0); lab.add(lamp);
  lamp.add(cyl(0.06, 0.07, 0.02, black, 10));
  lamp.add(box(0.015, 0.3, 0.015, black, 0, 0.15, 0, 0, 0));
  const lampHead = mk(new THREE.ConeGeometry(0.07, 0.1, 10, 1, true), std('lamphead', { color: 0x2a6a4a, side: THREE.DoubleSide })); lampHead.position.set(0.05, 0.3, 0); lampHead.rotation.z = 2.2; lamp.add(lampHead);
  // lava lamp (glows when powered)
  const lava = cyl(0.04, 0.05, 0.22, std('lava', { color: 0xff6030, emissive: 0xff4010, emissiveIntensity: 0, transparent: true, opacity: 0.85 }), 10); lava.position.set(-0.5, 1.12, 1.05); lab.add(lava); parts.lava = lava;
  // breaker panel on the bulkhead behind the driver
  const breaker = new THREE.Group(); breaker.position.set(-0.55, 1.45, -0.98); lab.add(breaker);
  breaker.add(box(0.42, 0.3, 0.06, std('breaker', { color: 0x6a6e74, roughness: 0.5, metalness: 0.5 }), 0, 0, 0, 0.01, 0));
  parts.switches = [];
  ['LIGHTS', 'COMPUTER', 'RADIO', 'CHRONO'].forEach((label, i) => {
    const sw = new THREE.Group(); sw.position.set(-0.15 + i * 0.1, -0.02, 0.035); breaker.add(sw);
    const lever = box(0.025, 0.07, 0.025, i === 3 ? red : std('swlever', { color: 0xe8e4dc }), 0, 0.03, 0.015, 0.008, 0); sw.add(lever);
    const led = mk(new THREE.BoxGeometry(0.02, 0.02, 0.01), std('swled' + i, { color: 0x401010, emissive: 0xff2020, emissiveIntensity: 0 }), false); led.position.set(0, -0.09, 0); sw.add(led);
    const tex = textTexture([label], { w: 96, h: 24, bg: '#d8d0b8', fg: '#17130e', size: 14 });
    const lab2 = mk(new THREE.PlaneGeometry(0.085, 0.022), std('swlabel' + i, { map: tex }), false); lab2.position.set(0, 0.11, 0); sw.add(lab2);
    parts.switches.push({ g: sw, lever, led, label, on: false });
  });
  // shelves + specimen jars on the right wall behind the sliding door
  const shelfMat = std('shelf', { color: 0x8a6440, map: T.panel(), roughness: 0.7 });
  for (const y of [1.2, 1.58]) lab.add(box(0.36, 0.03, 0.85, shelfMat, 0.74, y, 0.95, 0.005, 1.4));
  parts.jars = [];
  for (let k = 0; k < 6; k++) {
    const jar = cyl(0.05, 0.05, 0.13, glass, 10); jar.position.set(0.74, 1.29 + (k > 2 ? 0.38 : 0), 0.65 + (k % 3) * 0.28); lab.add(jar);
    const goo = cyl(0.04, 0.04, 0.07, std('goo' + k, { color: [0x60c040, 0xd0a030, 0x9a60c0, 0x40a0d0, 0xc04040, 0x80c0a0][k], emissive: [0x103000, 0x302000, 0x200030, 0x002030, 0x300000, 0x103020][k], roughness: 0.3 }), 8);
    goo.position.copy(jar.position).add(new THREE.Vector3(0, -0.025, 0)); goo.visible = false; lab.add(goo);
    parts.jars.push(goo);
  }
  // cooler / mini fridge
  const fridge = box(0.4, 0.42, 0.5, std('fridge', { color: 0xe8e4dc, roughness: 0.4 }), 0.72, floor + 0.21, 1.6, 0.03, 0); lab.add(fridge);
  lab.add(box(0.41, 0.05, 0.51, std('fridgelid', { color: 0x3a8ad0, roughness: 0.4 }), 0.72, floor + 0.44, 1.6, 0.02, 0));
  parts.fridge = fridge;
  // tool rack (pegboard) on the right wall
  const peg = (() => { const p = new PixelPainter(32, 32, 10); p.fill([160, 130, 90]); for (let y = 2; y < 32; y += 4) for (let x = 2; x < 32; x += 4) p.set(x, y, [70, 50, 30]); return p.texture(); })();
  const pegboard = mk(new THREE.PlaneGeometry(0.85, 0.42), std('peg', { map: peg }), false); pegboard.position.set(0.93, 1.88 - 0.15, 0.95); pegboard.rotation.y = -Math.PI / 2; lab.add(pegboard);
  for (let k = 0; k < 5; k++) { const tool = box(0.02, 0.18 + (k % 2) * 0.06, 0.03, k % 2 ? std('wrench', { color: 0xb0b4b8, metalness: 0.9, roughness: 0.3 }) : red, 0.9, 1.75, 0.65 + k * 0.15, 0.005, 0); tool.rotation.x = (k - 2) * 0.08; lab.add(tool); }
  // ceiling cables + bare bulb
  const cableMats = [0xd03030, 0x2a50a0, 0xf2d040, 0x222222, 0x30a050].map((c) => std('cable' + c, { color: c, roughness: 0.6 }));
  parts.cables = [];
  const rnd = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
  for (let k = 0; k < 7; k++) {
    const pts = [];
    const x0 = -0.7 + rnd() * 1.4;
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new THREE.Vector3(x0 + Math.sin(t * 5 + k) * 0.2, roof - 0.11 - Math.sin(t * Math.PI) * (0.03 + rnd() * 0.08), -0.9 + t * 2.9)); }
    pts.push(new THREE.Vector3(x0 * 0.5, 1.4, 2.0));
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012 + rnd() * 0.01, 5, false);
    const m = mk(g, cableMats[k % cableMats.length], false); lab.add(m); parts.cables.push(m);
  }
  // cables from the bench to the machine on the floor
  for (let k = 0; k < 4; k++) {
    const pts = [new THREE.Vector3(-0.55, 0.98, 0.9 + k * 0.05), new THREE.Vector3(-0.5, floor + 0.02, 1.2 + k * 0.08), new THREE.Vector3(-0.2 + k * 0.1, floor + 0.02, 1.6), new THREE.Vector3(-0.1 + k * 0.08, 0.9, 1.9)];
    lab.add(mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.016, 5, false), cableMats[k], false));
  }
  const bulb = mk(new THREE.SphereGeometry(0.05, 10, 8), std('bulb', { color: 0xfff2c0, emissive: 0xffd890, emissiveIntensity: 0 }), false); bulb.position.set(0.1, roof - 0.28, 0.2); lab.add(bulb);
  lab.add(box(0.005, 0.16, 0.005, black, 0.1, roof - 0.17, 0.2, 0, 0));
  parts.bulb = bulb;
  // poster: "HANG IN THERE" with a dino
  const poster = (() => { const t = textTexture(['HANG IN THERE'], { w: 128, h: 160, bg: '#2a6a9a', fg: '#f2efe6', size: 14, emblem: (x, w, h) => { x.fillStyle = '#5aaa4a'; x.fillRect(40, 40, 50, 30); x.fillRect(80, 25, 22, 22); x.fillRect(30, 60, 14, 30); x.fillRect(70, 60, 12, 30); x.fillStyle = '#17130e'; x.fillRect(94, 30, 4, 4); x.fillStyle = '#8a5a30'; x.fillRect(20, 20, 90, 6); } }); t.flipY = true; return t; })();
  const posterMesh = mk(new THREE.PlaneGeometry(0.32, 0.4), std('poster', { map: poster, roughness: 0.9 }), false);
  posterMesh.position.set(-0.93, 1.7, 0.95); posterMesh.rotation.y = Math.PI / 2; lab.add(posterMesh);

  // ---------------------------------------------------------------- the time machine core (CHRONO-DRIVE Mk 0.9)
  const tm = new THREE.Group(); tm.position.set(0.0, floor, 1.92); lab.add(tm); parts.machine = tm;
  const tank = cyl(0.36, 0.38, 1.25, std('tank', { color: 0xc8ccd0, roughness: 0.35, metalness: 0.85, map: T.metal() }), 20); tank.position.y = 0.66; tm.add(tank);
  tm.add(at(cyl(0.4, 0.4, 0.08, metal, 20), 0, 0.05, 0));
  tm.add(at(cyl(0.3, 0.38, 0.08, metal, 20), 0, 1.32, 0));
  // coil wound around the tank
  const helix = [];
  for (let i = 0; i <= 160; i++) { const t = i / 160; const a = t * Math.PI * 2 * 9; helix.push(new THREE.Vector3(Math.cos(a) * 0.395, 0.2 + t * 1.0, Math.sin(a) * 0.395)); }
  const coil = mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 400, 0.014, 5, false), copper); tm.add(coil); parts.coil = coil;
  // glowing flux tube on the front
  const flux = cyl(0.07, 0.07, 0.8, std('fluxglass', { color: 0x60e8ff, emissive: 0x20c0ff, emissiveIntensity: 0.2, roughness: 0.05, transparent: true, opacity: 0.8 }), 12);
  flux.position.set(-0.28, 0.7, -0.34); tm.add(flux); parts.fluxTube = flux;
  tm.add(at(cyl(0.085, 0.085, 0.05, copper, 12), -0.28, 1.12, -0.34));
  tm.add(at(cyl(0.085, 0.085, 0.05, copper, 12), -0.28, 0.28, -0.34));
  // microwave (modified) on top
  const micro = box(0.42, 0.24, 0.32, std('micro', { color: 0xe8e4dc, roughness: 0.5 }), 0.05, 1.5, -0.05, 0.02, 0); tm.add(micro);
  tm.add(box(0.24, 0.16, 0.01, std('microglass', { color: 0x1a1a1a, roughness: 0.1 }), -0.03, 1.5, -0.215, 0, 0));
  const microLcd = mk(new THREE.PlaneGeometry(0.08, 0.035), std('microlcd', { color: 0x102010, emissive: 0x40ff60, emissiveIntensity: 0.3 }), false); microLcd.position.set(0.16, 1.55, -0.212); microLcd.rotation.y = Math.PI; tm.add(microLcd);
  // 7-segment "destination time" display
  const disp = makeScreen(128, 32);
  const dispMat = std('timedisp', { color: 0x000000, emissive: 0xffffff, emissiveMap: disp.tex, emissiveIntensity: 1, roughness: 0.3 });
  const dispMesh = mk(new THREE.PlaneGeometry(0.42, 0.105), dispMat, false); dispMesh.position.set(0.12, 1.0, -0.39); dispMesh.rotation.y = Math.PI; tm.add(dispMesh);
  tm.add(box(0.48, 0.15, 0.04, black, 0.12, 1.0, -0.37, 0.01, 0));
  parts.timeDisplay = disp;
  // ENGAGE lever
  const leverBase = box(0.14, 0.1, 0.1, black, 0.33, 0.85, -0.3, 0.01, 0); tm.add(leverBase);
  const leverPivot = new THREE.Group(); leverPivot.position.set(0.33, 0.9, -0.3); tm.add(leverPivot);
  leverPivot.add(box(0.025, 0.3, 0.025, metal, 0, 0.15, 0, 0, 0));
  leverPivot.add(at(mk(new THREE.SphereGeometry(0.045, 10, 8), red), 0, 0.31, 0));
  leverPivot.rotation.x = 0.6;
  parts.lever = leverPivot;
  // part sockets (empty frames that receive the crafted parts)
  parts.sockets = {};
  const sock = (id, x, y, z) => {
    const g = new THREE.Group(); g.position.set(x, y, z); tm.add(g);
    const frame = mk(new THREE.TorusGeometry(0.075, 0.012, 6, 16), std('sockframe', { color: 0x5a5e64, roughness: 0.4, metalness: 0.8 })); g.add(frame);
    const led = mk(new THREE.SphereGeometry(0.014, 6, 4), std('sockled_' + id, { color: 0x401010, emissive: 0xff2020, emissiveIntensity: 1.2 }), false); led.position.set(0.1, 0.06, 0); g.add(led);
    parts.sockets[id] = { g, led, filled: false, model: null };
    return g;
  };
  sock('temporal_coil', 0.3, 1.25, -0.25).rotation.y = Math.PI / 2;
  sock('flux_crystal', -0.3, 1.25, -0.25).rotation.y = -Math.PI / 2;
  sock('nav_chip', 0.38, 0.55, 0.0).rotation.y = Math.PI / 2;
  sock('power_core', -0.38, 0.55, 0.0).rotation.y = -Math.PI / 2;
  sock('stabilizer', 0.0, 1.38, 0.0).rotation.x = Math.PI / 2;
  // crash damage: dangling wires & a scorch mark
  const scorch = mk(new THREE.CircleGeometry(0.3, 12), std('scorch', { color: 0x111111, transparent: true, opacity: 0.6, roughness: 1 }), false);
  scorch.rotation.x = -Math.PI / 2; scorch.position.set(0, 0.012, -0.2); tm.add(scorch); parts.scorch = scorch;

  // smoke/spark anchor points (world effects are spawned by the van logic)
  parts.anchors = {
    engine: new THREE.Vector3(0, 0.95, z0 + 0.3),
    machine: new THREE.Vector3(0, floor + 1.5, 1.92),
    roofTube: new THREE.Vector3(-0.45, roof + 0.35, -0.3),
    exhaust: new THREE.Vector3(0.7, 0.4, z1 + 0.15),
  };
  root.userData.parts = parts;
  root.userData.mats = mats;
  root.traverse((o) => { if (o.isMesh) o.userData.van = true; });
  return { root, body, parts };
}

// Colliders in van-local space for walking around, inside and on top of the
// van. state: { slideOpen, rearOpen, roofdeck, lift }. Boxes are re-posed by
// the van logic every time the van moves (yaw + full tilt of each centre).
export function vanColliders(state = {}) {
  const { z0, z1, floor, roof } = VAN;
  const W2 = VAN.W / 2;
  const L = state.lift ?? 0;
  const C = [];
  const add = (id, x, y, z, hx, hy, hz, walk = true, solid = true, extra = {}) => C.push({ id, x, y: y + L, z, hx, hy, hz, walk, solid, ...extra });
  // floor in four strips so a tilted van still has an accurate walking surface
  for (let k = 0; k < 4; k++) { const za = -2.4 + k * 1.2; add('floor' + k, 0, floor / 2, za + 0.6, 0.95, floor / 2, 0.6); }
  add('roof', 0, roof, 0.2, 1.0, 0.06, 2.25);
  add('nose', 0, 0.75, z0 + 0.2, 1.0, 0.33, 0.25);
  add('cab', 0, 0.95, -1.5, 0.95, 0.4, 0.5, false, true);
  add('wallL', -W2 + 0.04, (floor + roof) / 2, 0.7, 0.05, (roof - floor) / 2, 1.7, false);
  if (!state.cabL) add('wallL_cab', -W2 + 0.04, (floor + roof) / 2, -1.5, 0.05, (roof - floor) / 2, 0.5, false);
  if (!state.cabR) add('wallR_cab', W2 - 0.04, (floor + roof) / 2, -1.5, 0.05, (roof - floor) / 2, 0.5, false);
  add('wallR_back', W2 - 0.04, (floor + roof) / 2, 1.45, 0.05, (roof - floor) / 2, 1.0, false);
  if (!state.slideOpen) add('slide', W2 - 0.04, (floor + roof) / 2, -0.25, 0.05, (roof - floor) / 2, 0.72, false);
  if (!state.rearOpen) add('rear', 0, (floor + roof) / 2, z1 - 0.05, 1.0, (roof - floor) / 2, 0.06, false);
  // interior furniture
  add('bench', -0.66, 0.78, 0.25, 0.3, 0.22, 0.86);
  add('machine', 0, floor + 0.7, 1.92, 0.42, 0.7, 0.42);
  add('fridge', 0.72, floor + 0.22, 1.6, 0.21, 0.24, 0.26);
  add('shelf', 0.74, 1.39, 0.95, 0.18, 0.21, 0.43, false);
  // steps: under the sliding door and the rear bumper
  add('step', W2 + 0.1, 0.22, -0.25, 0.16, 0.22, 0.7);
  add('rearstep', 0, 0.2, z1 + 0.12, 0.95, 0.2, 0.14);
  if (state.roofdeck) {
    add('deck', 0, roof + 0.12, 0.35, 0.95, 0.1, 2.0);
    for (const sx of [-1, 1]) add('rail' + sx, sx * 0.92, roof + 0.5, 0.3, 0.04, 0.3, 1.95, false);
  }
  return C;
}
