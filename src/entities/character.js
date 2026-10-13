// Chunky cartoon explorers (PEAK-style): big rounded felt heads, tiny glossy
// dot eyes, bulb noses, small bean bodies, noodle arms and stubby legs, dressed
// in pixel-art fabrics. Fully procedural animation with springs for squash,
// wobble, blinking, expressions and talking mouths.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { TOPS, BOTTOMS, HATS, skinTexture, socksTexture, bootTexture, backpackTexture, fannyTexture, scarfTexture, pompomTexture } from '../gfx/clothTextures.js';
import { PixelPainter } from '../gfx/pixel.js';

// ------------------------------------------------------------------ outfit catalogue
export const SKIN_TONES = [0xf0c4a0, 0xe8b48a, 0xd49a6c, 0xb87a50, 0x8e5a3a, 0x6a4028, 0xf3d2b8, 0xc98b62];
export const NOSE_COLORS = [0xe8614f, 0xd98a6a, 0xf08080, 0xc86a50];
export const OPTIONS = {
  hat: ['bucket', 'beanie', 'hardhat', 'cap', 'pith', 'goggles', 'none'],
  top: ['hawaiian', 'hivis', 'puffer', 'flannel', 'safari', 'hoodie', 'labcoat'],
  overlay: ['none', 'fleece', 'labcoat'],
  bottom: ['shorts', 'cargo', 'jeans'],
  pack: ['hiker', 'daypack', 'none'],
  extra: ['fanny', 'scarf', 'glasses', 'none'],
};
export const PRESETS = [
  { name: 'Doug', hat: 'bucket', top: 'hawaiian', overlay: 'fleece', bottom: 'shorts', pack: 'hiker', extra: 'fanny', skin: 1, nose: 0, socks: [0xff7a2a, 0xf2efe6] },
  { name: 'Kev', hat: 'hardhat', top: 'hivis', overlay: 'none', bottom: 'cargo', pack: 'daypack', extra: 'none', skin: 3, nose: 3, socks: [0x333333, 0x666666] },
  { name: 'Pip', hat: 'beanie', top: 'puffer', overlay: 'none', bottom: 'jeans', pack: 'hiker', extra: 'scarf', skin: 6, nose: 2, socks: [0xd94040, 0xffffff], pompom: 0xd94040 },
  { name: 'Dr. Wanda', hat: 'goggles', top: 'flannel', overlay: 'labcoat', bottom: 'jeans', pack: 'none', extra: 'glasses', skin: 4, nose: 1, socks: [0x4a8ad0, 0xffffff] },
];

const texCache = new Map();
function cachedTex(key, fn, opt = {}) {
  if (!texCache.has(key)) {
    const p = fn();
    const t = p.texture({ wrap: opt.wrap ?? THREE.RepeatWrapping, anisotropy: 4 });
    t.userData.painter = p;
    texCache.set(key, t);
  }
  return texCache.get(key);
}
const matCache = new Map();
function fabric(key, texFn, opt = {}) {
  const k = key + JSON.stringify(opt);
  if (matCache.has(k)) return matCache.get(k);
  const map = texFn ? cachedTex(key, texFn) : null;
  const m = new THREE.MeshPhysicalMaterial({
    color: opt.color ?? 0xffffff, map, roughness: opt.roughness ?? 0.88, metalness: opt.metalness ?? 0,
    sheen: opt.sheen ?? 0.55, sheenRoughness: 0.75, sheenColor: new THREE.Color(opt.sheenColor ?? 0xffffff).multiplyScalar(0.35),
    clearcoat: opt.clearcoat ?? 0, clearcoatRoughness: 0.3, emissive: opt.emissive ?? 0x000000, emissiveIntensity: opt.emissiveIntensity ?? 1,
  });
  if (map && opt.bump !== false) {
    const p = map.userData.painter;
    if (p) { m.normalMap = p.normalTexture(opt.bump ?? 1.6); m.normalScale.set(0.6, 0.6); }
  }
  patchMaterial(m, {});
  matCache.set(k, m);
  return m;
}
const plain = (color, opt = {}) => fabric('plain-' + color, null, { color, ...opt });

// ------------------------------------------------------------------ geometry helpers
function lathe(profile, segs = 28, phiStart = Math.PI, phiLength = Math.PI * 2) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, segs, phiStart, phiLength);
  g.computeVertexNormals();
  return g;
}
function ellipsoid(a, b, c, ws = 32, hs = 24) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(a, b, c);
  return g;
}
function capsule(r, len, cap = 6, rad = 10) {
  const g = new THREE.CapsuleGeometry(r, len, cap, rad);
  return g;
}
function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// Head ellipsoid used for placing features on the surface
const HEAD = { a: 0.235, b: 0.25, c: 0.215, y: 0.93 };
function headSurface(x, y, push = 0) {
  const yy = (y - HEAD.y) / HEAD.b;
  const xx = x / HEAD.a;
  const zz = Math.sqrt(Math.max(0, 1 - xx * xx - yy * yy));
  return new THREE.Vector3(x, y, zz * HEAD.c * 0.955 + push);
}

const BLACK = new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 });
patchMaterial(BLACK, {});
const MOUTH = new THREE.MeshStandardMaterial({ color: 0x3a1418, roughness: 0.6 });
patchMaterial(MOUTH, {});

// X eyes for knocked-out state
function xEyeGeo() {
  const a = new THREE.BoxGeometry(0.036, 0.008, 0.008);
  const b = a.clone();
  a.rotateZ(Math.PI / 4); b.rotateZ(-Math.PI / 4);
  const g = new THREE.BufferGeometry();
  const pos = [...a.toNonIndexed().attributes.position.array, ...b.toNonIndexed().attributes.position.array];
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ the character
export class Character {
  constructor(outfit = PRESETS[0], opt = {}) {
    this.root = new THREE.Group();
    this.root.name = 'character';
    this.outfit = { ...outfit };
    this.isLocal = !!opt.local;
    this.build();
    this.t = Math.random() * 10;
    this.phase = 0;
    this.blinkT = 2 + Math.random() * 3;
    this.blink = 0;
    this.squash = 0; this.squashV = 0;
    this.headLag = new THREE.Vector2(); this.headLagV = new THREE.Vector2();
    this.packBounce = 0; this.packBounceV = 0;
    this.pomBounce = 0; this.pomBounceV = 0;
    this.prevGrounded = true;
    this.prevYaw = 0;
    this.fidget = { name: null, t: 0, next: 6 + Math.random() * 8 };
    this.expr = 'neutral';
    this.talk = 0;
    this.airTime = 0;
    this.pose = {};
  }

  dispose() { this.root.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); }

  build() {
    const o = this.outfit;
    const R = this.root;
    while (R.children.length) R.remove(R.children[0]);
    const skinTone = SKIN_TONES[o.skin ?? 1];
    const skinMat = fabric('skin' + skinTone, () => skinTexture(skinTone, 16 + (o.skin ?? 1)), { sheen: 0.8, sheenColor: 0xffe0d0, roughness: 0.92, bump: 0.6 });
    const handMat = plain(skinTone, { sheen: 0.8, roughness: 0.9 });
    this.skinMat = skinMat;
    const topMat = fabric('top-' + o.top, () => TOPS[o.top](), { sheen: o.top === 'puffer' ? 0.3 : 0.55, clearcoat: o.top === 'puffer' ? 0.35 : 0, emissive: o.top === 'hivis' ? 0x401200 : 0x000000 });
    const sleeveMat = topMat;
    const botMat = fabric('bot-' + o.bottom, () => BOTTOMS[o.bottom]());
    const sockCols = o.socks ?? [0xff7a2a, 0xf2efe6];
    const sockMat = fabric('sock' + sockCols.join('-'), () => socksTexture(sockCols[0], sockCols[1]), { sheen: 0.7 });
    const bootMat = fabric('boot', () => bootTexture(), { roughness: 0.75, sheen: 0.2 });

    // --- rig
    const hips = new THREE.Group(); hips.position.y = 0.3; R.add(hips);
    const torso = new THREE.Group(); hips.add(torso);
    this.hips = hips; this.torso = torso;

    // body bean (shirt) - lathe profile, y relative to hips
    const prof = [[0.001, -0.075], [0.09, -0.07], [0.145, -0.04], [0.172, 0.0], [0.188, 0.06], [0.19, 0.13], [0.182, 0.2], [0.168, 0.27], [0.14, 0.33], [0.1, 0.37], [0.06, 0.39], [0.001, 0.395]];
    this.bodyR = (y) => { for (let i = 0; i < prof.length - 1; i++) { const [r0, y0] = prof[i], [r1, y1] = prof[i + 1]; if (y >= y0 && y <= y1) return r0 + (r1 - r0) * ((y - y0) / (y1 - y0 || 1)); } return 0.1; };
    const body = mesh(lathe(prof, 30), topMat);
    torso.add(body);
    this.body = body;
    // collar ring
    if (o.top !== 'puffer' && o.top !== 'hoodie') {
      const collar = mesh(new THREE.TorusGeometry(0.083, 0.02, 6, 20), topMat);
      collar.rotation.x = Math.PI / 2; collar.position.y = 0.375; collar.scale.set(1, 1, 0.7);
      torso.add(collar);
    } else if (o.top === 'hoodie') {
      const hood = mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 20), topMat);
      hood.rotation.x = Math.PI / 2; hood.position.set(0, 0.37, -0.03); hood.scale.set(1.15, 1.05, 0.8);
      torso.add(hood);
    } else {
      const coll = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.06, 18, 1, true), topMat);
      coll.position.y = 0.385; torso.add(coll);
    }
    // overlay garments (open front)
    if (o.overlay === 'fleece' || o.overlay === 'labcoat') {
      const isCoat = o.overlay === 'labcoat';
      const op = prof.slice(isCoat ? 0 : 2, -2).map(([r, y]) => [r * 1.075 + 0.006, isCoat && y < 0 ? y - 0.08 : y]);
      if (isCoat) { op.unshift([0.18, -0.2]); }
      const gap = isCoat ? 0.5 : 0.62;
      const og = lathe(op, 28, gap, Math.PI * 2 - gap * 2);
      const omat = fabric('ov-' + o.overlay, () => (isCoat ? TOPS.labcoat() : TOPS.fleece()), { sheen: isCoat ? 0.4 : 0.9, sheenColor: 0xfff0c0 });
      omat.side = THREE.DoubleSide;
      const ov = mesh(og, omat);
      torso.add(ov);
      // fluffy fleece collar
      if (!isCoat) { const c2 = mesh(new THREE.TorusGeometry(0.1, 0.026, 6, 18, Math.PI * 1.5), omat); c2.rotation.set(Math.PI / 2, 0, Math.PI * 0.75); c2.position.y = 0.36; torso.add(c2); }
    }

    // --- head
    const headPivot = new THREE.Group(); headPivot.position.y = 0.38; torso.add(headPivot);
    const head = new THREE.Group(); head.position.y = HEAD.y - 0.68; headPivot.add(head);
    this.headPivot = headPivot; this.head = head;
    const hg = ellipsoid(1, 1, 1, 40, 28);
    const hp = hg.attributes.position;
    for (let i = 0; i < hp.count; i++) {
      let x = hp.getX(i), y = hp.getY(i), z = hp.getZ(i);
      if (y < 0) { x *= 1 + 0.06 * -y; z *= 1 + 0.04 * -y; }
      if (z > 0) z *= 1 - 0.05 * z;
      hp.setXYZ(i, x * HEAD.a, y * HEAD.b, z * HEAD.c);
    }
    hg.computeVertexNormals();
    // rotate UV so face centre (u=0.25) faces +z: SphereGeometry already puts u=0.25 at +z
    const headMesh = mesh(hg, skinMat);
    head.add(headMesh);
    this.headMesh = headMesh;
    // face (positions relative to head centre)
    const fy = (y) => y - HEAD.y;
    const face = new THREE.Group(); head.add(face);
    this.face = face;
    const eyeGeo = new THREE.SphereGeometry(0.0195, 12, 10);
    this.eyes = [];
    for (const sx of [-1, 1]) {
      const p = headSurface(sx * 0.078, 0.925, 0.002);
      const e = mesh(eyeGeo, BLACK, false);
      e.position.set(p.x, fy(p.y), p.z);
      e.scale.set(1, 1.05, 0.55);
      e.lookAt(e.position.clone().multiplyScalar(2));
      face.add(e);
      this.eyes.push(e);
    }
    this.xEyes = [];
    const xg = xEyeGeo();
    for (const sx of [-1, 1]) {
      const p = headSurface(sx * 0.078, 0.925, 0.006);
      const e = mesh(xg, BLACK, false);
      e.position.set(p.x, fy(p.y), p.z);
      e.visible = false;
      face.add(e); this.xEyes.push(e);
    }
    const noseCol = NOSE_COLORS[o.nose ?? 0];
    const nose = mesh(new THREE.SphereGeometry(0.036, 14, 12), plain(noseCol, { sheen: 0.9, roughness: 0.7 }), false);
    const np = headSurface(0, 0.885, 0.012);
    nose.position.set(0, fy(np.y), np.z); nose.scale.set(1, 0.92, 0.85);
    face.add(nose);
    this.nose = nose;
    // brows
    this.brows = [];
    const browGeo = new RoundedBoxGeometry(0.046, 0.011, 0.012, 2, 0.005);
    for (const sx of [-1, 1]) {
      const p = headSurface(sx * 0.08, 0.968, 0.004);
      const b = mesh(browGeo, plain(0x3a2a20, { sheen: 0.3 }), false);
      b.position.set(p.x, fy(p.y), p.z);
      b.rotation.y = sx * 0.35;
      b.userData.base = b.position.clone();
      b.userData.side = sx;
      face.add(b); this.brows.push(b);
    }
    // mouth (hidden unless talking / emoting)
    const mp = headSurface(0, 0.835, 0.003);
    const mouth = mesh(new THREE.SphereGeometry(0.03, 14, 8), MOUTH, false);
    mouth.position.set(0, fy(mp.y), mp.z - 0.006); mouth.scale.set(1, 0.05, 0.3);
    face.add(mouth); this.mouth = mouth;
    // glasses
    if (o.extra === 'glasses') {
      const gm = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.3, metalness: 0.6 }); patchMaterial(gm, {});
      for (const sx of [-1, 1]) {
        const p = headSurface(sx * 0.078, 0.925, 0.012);
        const ring = mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), gm, false);
        ring.position.set(p.x, fy(p.y), p.z); ring.lookAt(ring.position.clone().multiplyScalar(2));
        face.add(ring);
      }
      const br = mesh(new THREE.BoxGeometry(0.05, 0.006, 0.006), gm, false);
      const bp = headSurface(0, 0.93, 0.02); br.position.set(0, fy(bp.y), bp.z); face.add(br);
    }
    // ears (tiny)
    for (const sx of [-1, 1]) {
      const ear = mesh(ellipsoid(0.022, 0.035, 0.03, 10, 8), skinMat, false);
      ear.position.set(sx * (HEAD.a - 0.004), 0.0, -0.01);
      head.add(ear);
    }
    this.buildHat(head, o);

    // --- arms (noodles): shoulder -> upper (sleeve) -> elbow -> forearm -> hand
    this.arms = [];
    const shortSleeve = o.top === 'hawaiian' || o.top === 'hivis' && false;
    for (const sx of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(sx * 0.172, 0.285, 0); torso.add(sh);
      const upper = mesh(capsule(0.042, 0.11, 4, 8), sleeveMat); upper.position.y = -0.075; sh.add(upper);
      if (shortSleeve) {
        const cuff = mesh(new THREE.CylinderGeometry(0.052, 0.05, 0.05, 10), sleeveMat); cuff.position.y = -0.1; sh.add(cuff);
        upper.scale.set(1, 1, 1);
      }
      const elbow = new THREE.Group(); elbow.position.y = -0.155; sh.add(elbow);
      const fore = mesh(capsule(0.036, 0.1, 4, 8), shortSleeve ? handMat : sleeveMat); fore.position.y = -0.065; elbow.add(fore);
      const wrist = new THREE.Group(); wrist.position.y = -0.13; elbow.add(wrist);
      const hand = mesh(new THREE.SphereGeometry(0.048, 12, 10), handMat); hand.scale.set(1, 1.08, 0.92); wrist.add(hand);
      const thumb = mesh(new THREE.SphereGeometry(0.02, 8, 6), handMat); thumb.position.set(-sx * 0.035, 0.012, 0.022); wrist.add(thumb);
      const socket = new THREE.Group(); socket.position.set(0, -0.02, 0.02); wrist.add(socket);
      this.arms.push({ sx, sh, elbow, wrist, socket });
    }
    this.handR = this.arms[1].socket;
    this.handL = this.arms[0].socket;

    // --- legs
    this.legs = [];
    for (const sx of [-1, 1]) {
      const hip = new THREE.Group(); hip.position.set(sx * 0.085, -0.02, 0); hips.add(hip);
      const thigh = mesh(capsule(0.06, 0.06, 4, 10), botMat); thigh.position.y = -0.06; hip.add(thigh);
      if (o.bottom === 'shorts') { const hem = mesh(new THREE.CylinderGeometry(0.071, 0.068, 0.04, 12), botMat); hem.position.y = -0.11; hip.add(hem); }
      const knee = new THREE.Group(); knee.position.y = -0.12; hip.add(knee);
      const shinMat = o.bottom === 'shorts' ? sockMat : botMat;
      const shin = mesh(capsule(0.05, 0.07, 4, 10), shinMat); shin.position.y = -0.06; knee.add(shin);
      const ankle = new THREE.Group(); ankle.position.y = -0.135; knee.add(ankle);
      const boot = mesh(new RoundedBoxGeometry(0.11, 0.075, 0.17, 3, 0.03), bootMat); boot.position.set(0, -0.005, 0.022); ankle.add(boot);
      const sole = mesh(new RoundedBoxGeometry(0.115, 0.022, 0.178, 2, 0.008), plain(0x2c2622, { roughness: 0.8, sheen: 0 })); sole.position.set(0, -0.04, 0.022); ankle.add(sole);
      this.legs.push({ sx, hip, knee, ankle });
    }
    // waist band (belt)
    const belt = mesh(new THREE.TorusGeometry(0.173, 0.016, 6, 28), plain(0x3a2a1e, { roughness: 0.6, sheen: 0.2 }));
    belt.rotation.x = Math.PI / 2; belt.position.y = 0.0; torso.add(belt);

    // --- gear
    if (o.pack === 'hiker' || o.pack === 'daypack') {
      const big = o.pack === 'hiker';
      const pg = new THREE.Group(); pg.position.set(0, big ? 0.17 : 0.15, -0.19); torso.add(pg);
      const packMat = fabric('pack' + o.pack, () => backpackTexture(big ? 0x4f6b3a : 0x8a3a3a), { sheen: 0.4 });
      const bag = mesh(new RoundedBoxGeometry(big ? 0.27 : 0.23, big ? 0.32 : 0.24, big ? 0.15 : 0.11, 3, 0.05), packMat); pg.add(bag);
      const pocket = mesh(new RoundedBoxGeometry(big ? 0.18 : 0.15, 0.1, 0.05, 2, 0.02), packMat); pocket.position.set(0, -0.06, -(big ? 0.08 : 0.06)); pg.add(pocket);
      if (big) {
        const roll = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.3, 12), plain(0x3a6aa8, { sheen: 0.4 })); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.2, 0.0); pg.add(roll);
        const mug = mesh(new THREE.CylinderGeometry(0.03, 0.026, 0.05, 10), new THREE.MeshStandardMaterial({ color: 0xb0b4b8, metalness: 0.8, roughness: 0.35 })); mug.position.set(0.15, -0.08, -0.02); pg.add(mug);
      }
      const strapMat = plain(0x2e2e2a, { roughness: 0.7, sheen: 0.3 });
      for (const sx of [-1, 1]) {
        // strap follows the body surface: back -> over the shoulder -> down the chest
        const pts = [];
        const xs = sx * 0.085;
        for (let k = 0; k <= 12; k++) {
          const t = k / 12;
          const ang = Math.PI * (1 - t) - Math.PI * 0.0; // from back (pi) to front (0)
          const y = 0.12 + Math.sin(t * Math.PI) * 0.25 + (t > 0.5 ? (0.5 - t) * 0.1 : 0);
          const r = Math.sqrt(Math.max(0.0001, this.bodyR(Math.min(0.37, y)) ** 2 - xs * xs)) + 0.012;
          pts.push(new THREE.Vector3(xs, y, Math.cos(ang) * r * (t > 0.3 && t < 0.7 ? 0.6 : 1)));
        }
        const strap = mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, 0.013, 5), strapMat);
        strap.scale.set(1, 1, 1);
        torso.add(strap);
        const buckle = mesh(new RoundedBoxGeometry(0.03, 0.02, 0.012, 1, 0.004), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.8, roughness: 0.3 }));
        buckle.position.set(xs, 0.2, Math.sqrt(this.bodyR(0.2) ** 2 - xs * xs) + 0.018);
        torso.add(buckle);
      }
      this.pack = pg;
    }
    if (o.extra === 'fanny') {
      const fm = fabric('fanny', () => fannyTexture(), { sheen: 0.3 });
      const fp = mesh(new RoundedBoxGeometry(0.17, 0.08, 0.06, 2, 0.025), fm); fp.position.set(0.03, 0.01, 0.19); fp.rotation.z = -0.15; torso.add(fp);
    }
    if (o.extra === 'scarf') {
      const sm = fabric('scarf', () => scarfTexture(), { sheen: 0.8 });
      const sc = mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 20), sm); sc.rotation.x = Math.PI / 2; sc.position.y = 0.37; sc.scale.set(1, 1, 0.75); torso.add(sc);
      const tail = mesh(new RoundedBoxGeometry(0.07, 0.2, 0.03, 2, 0.012), sm); tail.position.set(0.06, 0.27, 0.15); tail.rotation.set(0.25, 0, 0.12); torso.add(tail);
      this.scarfTail = tail;
    }
    this.root.traverse((m) => { if (m.isMesh) m.userData.charPart = true; });
    this.heldGroup = null;
  }

  buildHat(head, o) {
    const hatTop = new THREE.Group(); head.add(hatTop);
    this.hat = hatTop;
    const T = (k) => () => HATS[k]();
    if (o.hat === 'bucket') {
      const m = fabric('hat-bucket', T('bucket'), { sheen: 0.4 });
      m.side = THREE.DoubleSide;
      const crown = mesh(lathe([[0.235, 0.0], [0.232, 0.05], [0.222, 0.1], [0.205, 0.145], [0.17, 0.175], [0.1, 0.19], [0.001, 0.195]], 30, 0), m);
      crown.scale.set(1.04, 1, 0.94); crown.position.y = 0.075; hatTop.add(crown);
      const brim = mesh(lathe([[0.225, 0.0], [0.28, -0.025], [0.335, -0.065], [0.337, -0.076], [0.28, -0.038], [0.225, -0.012]], 30, 0), m);
      brim.position.y = 0.085; brim.scale.set(1.04, 1, 0.94); hatTop.add(brim);
      this.brim = brim;
    } else if (o.hat === 'beanie') {
      const m = fabric('hat-beanie', T('beanie'), { sheen: 0.9, sheenColor: 0xaaaaaa });
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      crown.scale.set(HEAD.a * 1.06, HEAD.b * 1.08, HEAD.c * 1.08); crown.position.y = 0.035; hatTop.add(crown);
      const cuff = mesh(new THREE.CylinderGeometry(HEAD.a * 1.08, HEAD.a * 1.1, 0.07, 28, 1, true), m); cuff.scale.set(1, 1, HEAD.c / HEAD.a * 1.02); cuff.position.y = 0.045; hatTop.add(cuff);
      const pm = fabric('pompom' + (o.pompom ?? 0xd94040), () => pompomTexture(o.pompom ?? 0xd94040), { sheen: 1, sheenColor: 0xffffff, roughness: 1, bump: 3 });
      const pom = mesh(new THREE.IcosahedronGeometry(0.062, 2), pm); pom.position.y = 0.28; hatTop.add(pom);
      this.pom = pom;
    } else if (o.hat === 'hardhat') {
      const m = fabric('hat-hard', T('hardhat'), { roughness: 0.35, sheen: 0, clearcoat: 0.6 });
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      crown.scale.set(HEAD.a * 1.1, HEAD.b * 1.02, HEAD.c * 1.12); crown.position.y = 0.04; hatTop.add(crown);
      const brim = mesh(lathe([[0.2, 0], [0.25, -0.012], [0.255, -0.022], [0.2, -0.016]], 30, 0), m); brim.position.y = 0.05; brim.scale.set(1, 1, 1.05); hatTop.add(brim);
      const ridge = mesh(new RoundedBoxGeometry(0.05, 0.03, 0.36, 2, 0.012), m); ridge.position.y = 0.255; hatTop.add(ridge);
      const lamp = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 12), new THREE.MeshStandardMaterial({ color: 0xfff6c0, emissive: 0xfff2a0, emissiveIntensity: 0.3 }));
      lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 0.16, HEAD.c * 1.1 + 0.005); hatTop.add(lamp);
      this.headlamp = lamp;
    } else if (o.hat === 'cap') {
      const m = fabric('hat-cap', T('cap'), { sheen: 0.4 });
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), m);
      crown.scale.set(HEAD.a * 1.06, HEAD.b * 1.0, HEAD.c * 1.08); crown.position.y = 0.04; hatTop.add(crown);
      const bill = mesh(new RoundedBoxGeometry(0.22, 0.016, 0.14, 2, 0.007), m); bill.position.set(0, 0.07, HEAD.c + 0.04); bill.rotation.x = 0.2; hatTop.add(bill);
      const btn = mesh(new THREE.SphereGeometry(0.014, 8, 6), m); btn.position.y = 0.26; hatTop.add(btn);
    } else if (o.hat === 'pith') {
      const m = fabric('hat-pith', T('pith'), { sheen: 0.3 });
      m.side = THREE.DoubleSide;
      const crown = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), m);
      crown.scale.set(HEAD.a * 1.1, HEAD.b * 1.18, HEAD.c * 1.14); crown.position.y = 0.03; hatTop.add(crown);
      const brim = mesh(lathe([[0.2, 0], [0.3, -0.05], [0.31, -0.06], [0.2, -0.015]], 30, 0), m); brim.position.y = 0.05; hatTop.add(brim);
    } else if (o.hat === 'goggles') {
      const strap = fabric('hat-strap', T('goggles'), { sheen: 0.2 });
      const band = mesh(new THREE.CylinderGeometry(HEAD.a * 1.01, HEAD.a * 1.02, 0.045, 28, 1, true), strap);
      band.scale.set(1, 1, HEAD.c / HEAD.a * 1.03); band.position.y = 0.075; band.rotation.x = -0.12; hatTop.add(band);
      const metal = new THREE.MeshStandardMaterial({ color: 0xb08a50, roughness: 0.3, metalness: 0.9 }); patchMaterial(metal, {});
      const glass = new THREE.MeshPhysicalMaterial({ color: 0x5ad0e0, roughness: 0.05, metalness: 0.1, emissive: 0x0a4050, clearcoat: 1 }); patchMaterial(glass, {});
      for (const sx of [-1, 1]) {
        const p = headSurface(sx * 0.068, 0.995, 0.012);
        const ring = mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.035, 14), metal); ring.position.set(p.x, p.y - HEAD.y, p.z); ring.lookAt(ring.position.clone().multiplyScalar(2)); ring.rotateX(Math.PI / 2); hatTop.add(ring);
        const lens = mesh(new THREE.CircleGeometry(0.033, 14), glass); lens.position.copy(ring.position).multiplyScalar(1.09); lens.lookAt(lens.position.clone().multiplyScalar(2)); hatTop.add(lens);
      }
      // wild tufts of hair poking out
      // big fluffy mad-scientist hair puffs above and behind the strap
      const hairMat = plain(0xeeeae2, { sheen: 1, sheenColor: 0xffffff, roughness: 1 });
      const puffs = [[0, 0.19, -0.02, 0.1], [-0.09, 0.17, -0.06, 0.085], [0.09, 0.17, -0.06, 0.085], [-0.15, 0.1, -0.06, 0.07], [0.15, 0.1, -0.06, 0.07], [0, 0.14, -0.14, 0.09], [-0.1, 0.07, -0.15, 0.07], [0.1, 0.07, -0.15, 0.07], [-0.05, 0.21, 0.06, 0.07], [0.06, 0.2, 0.07, 0.065]];
      for (const [x, y, z, r] of puffs) { const pf = mesh(new THREE.IcosahedronGeometry(r, 1), hairMat); pf.position.set(x, y, z); hatTop.add(pf); }
    }
  }

  // attach a held-item mesh to the right hand
  setHeld(obj) {
    if (this.heldGroup) this.handR.remove(this.heldGroup);
    this.heldGroup = obj;
    if (obj) this.handR.add(obj);
  }

  // ------------------------------------------------------------------ animation
  // s: { speed, grounded, vy, crouch, sprint, swim, action:{name,t}, emote, talk, expr, downed, carried, sitting, sleeping, lookPitch, lookYaw, yaw, aim, carrying }
  update(dt, s = {}) {
    this.t += dt;
    const t = this.t;
    const speed = s.speed ?? 0;
    const grounded = s.grounded ?? true;
    const L = this.legs, A = this.arms;
    const ease = (cur, target, k) => cur + (target - cur) * Math.min(1, dt * k);

    // ---- squash & stretch spring (landing / jumping)
    if (grounded && !this.prevGrounded && this.airTime > 0.15) this.squashV -= Math.min(4, 1.5 + this.airTime * 2.5);
    this.airTime = grounded ? 0 : this.airTime + dt;
    this.prevGrounded = grounded;
    if (!grounded && (s.vy ?? 0) > 2) this.squash = ease(this.squash, 0.12, 10);
    this.squashV += (-this.squash * 220 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    const sq = Math.max(-0.25, Math.min(0.2, this.squash));
    this.hips.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);

    // ---- locomotion phase
    const stride = s.sprint ? 0.75 : 0.5;
    this.phase += (speed / stride) * dt * Math.PI;
    const ph = this.phase;
    const moving = Math.min(1, speed / 1.2);
    const runK = Math.min(1, Math.max(0, (speed - 3) / 3));

    // ---- defaults
    let hipY = 0.3, hipRoll = 0, hipPitch = 0, torsoYaw = 0, torsoPitch = 0, torsoRoll = 0;
    let headPitch = (s.lookPitch ?? 0) * 0.55, headYaw = (s.lookYaw ?? 0) * 0.7, headRoll = 0;
    const leg = [{ x: 0, knee: 0, ankle: 0 }, { x: 0, knee: 0, ankle: 0 }];
    const arm = [{ x: 0.05, z: -0.34, elbow: -0.25, wristX: 0 }, { x: 0.05, z: 0.34, elbow: -0.25, wristX: 0 }];
    let rootRotX = 0, rootRotZ = 0, rootY = 0;
    let expr = s.expr ?? 'neutral';

    // breathing + idle sway
    const breathe = Math.sin(t * 1.7) * 0.012;
    this.torso.scale.set(1 + breathe * 0.6, 1 + breathe, 1 + breathe * 0.6);
    headPitch += Math.sin(t * 0.7) * 0.03 * (1 - moving);
    arm[0].z -= Math.sin(t * 1.7) * 0.02; arm[1].z += Math.sin(t * 1.7) * 0.02;

    if (grounded && !s.swim && !s.downed && !s.carried && !s.sitting && !s.sleeping) {
      // ---- walk / run waddle
      const sw = Math.sin(ph), cw = Math.cos(ph);
      const amp = 0.55 + runK * 0.35;
      leg[0].x = sw * amp * moving; leg[1].x = -sw * amp * moving;
      leg[0].knee = Math.max(0, -cw) * 0.9 * moving; leg[1].knee = Math.max(0, cw) * 0.9 * moving;
      leg[0].ankle = -leg[0].x * 0.5; leg[1].ankle = -leg[1].x * 0.5;
      hipY += Math.abs(cw) * 0.03 * moving + 0.01 * moving;
      hipRoll = sw * (0.09 - runK * 0.03) * moving;
      torsoYaw = sw * 0.12 * moving;
      torsoPitch = runK * 0.28 + moving * 0.06;
      headPitch -= torsoPitch * 0.6;
      arm[0].x = -sw * (0.55 + runK * 0.5) * moving + 0.05; arm[1].x = sw * (0.55 + runK * 0.5) * moving + 0.05;
      arm[0].elbow = -0.25 - runK * 0.9; arm[1].elbow = -0.25 - runK * 0.9;
      arm[0].z = -0.34 - moving * 0.06 - runK * 0.12; arm[1].z = 0.34 + moving * 0.06 + runK * 0.12;
      if (s.panic) { arm[0].x = -2.6 + Math.sin(t * 22) * 0.5; arm[1].x = -2.6 + Math.cos(t * 22) * 0.5; arm[0].z = 0.6; arm[1].z = -0.6; expr = 'scared'; }
    }
    if (s.crouch) { hipY -= 0.07; leg[0].x -= 0.6; leg[1].x -= 0.6; leg[0].knee += 1.1; leg[1].knee += 1.1; leg[0].ankle -= 0.5; leg[1].ankle -= 0.5; torsoPitch += 0.3; headPitch -= 0.25; }

    if (!grounded && !s.swim && !s.carried) {
      // ---- airborne: tuck + arms up, flail when falling far
      const fall = (s.vy ?? 0) < -2;
      const flail = this.airTime > 0.9 && fall;
      leg[0].x = -0.5; leg[1].x = 0.2; leg[0].knee = 0.9; leg[1].knee = 0.5;
      arm[0].x = -1.2; arm[1].x = -1.2; arm[0].z = 0.5; arm[1].z = -0.5; arm[0].elbow = -0.6; arm[1].elbow = -0.6;
      if (flail) {
        arm[0].x = -2.4 + Math.sin(t * 25) * 0.6; arm[1].x = -2.4 + Math.cos(t * 23) * 0.6;
        leg[0].x = Math.sin(t * 20) * 0.7; leg[1].x = -Math.sin(t * 20) * 0.7;
        expr = 'scared';
      }
    }
    if (s.swim) {
      // ---- swimming: belly down, breaststroke
      rootRotX = 1.1; rootY = -0.35;
      const sp = t * 4.5;
      arm[0].x = -2.2 + Math.sin(sp) * 0.9; arm[1].x = -2.2 + Math.sin(sp) * 0.9;
      arm[0].z = 0.5 + Math.cos(sp) * 0.6; arm[1].z = -0.5 - Math.cos(sp) * 0.6;
      leg[0].x = Math.sin(sp * 1.3) * 0.5; leg[1].x = -Math.sin(sp * 1.3) * 0.5;
      headPitch -= 0.9;
    }
    if (s.sitting) {
      hipY = 0.22; leg[0].x = -1.45; leg[1].x = -1.45; leg[0].knee = 1.5; leg[1].knee = 1.5;
      if (s.ride) { leg[0].x = -1.1; leg[1].x = -1.1; leg[0].knee = 1.2; leg[1].knee = 1.2; this.legs[0].hip.rotation.z = -0.5; }
      arm[0].x = -0.7; arm[1].x = -0.7; arm[0].elbow = -0.9; arm[1].elbow = -0.9;
    }
    if (s.sleeping) {
      rootRotX = -Math.PI / 2; rootY = 0.18; expr = 'sleepy';
      leg[0].x = 0.1; leg[1].x = -0.05; arm[0].z = 0.4; arm[1].z = -0.3; arm[1].x = -0.5;
      this.torso.scale.y = 1 + Math.sin(t * 1.2) * 0.03;
    }
    if (s.downed) {
      rootRotX = -Math.PI / 2 + 0.05; rootRotZ = 0.25; rootY = 0.18; expr = 'ko';
      arm[0].z = 1.3 + Math.sin(t * 9) * 0.05 * (Math.sin(t * 1.3) > 0.8 ? 1 : 0); arm[1].z = -1.1;
      leg[0].x = 0.3; leg[1].x = -0.2; leg[1].knee = 0.5;
    }
    if (s.carried) {
      // dangling over a friend's shoulder, kicking feet
      rootRotX = Math.PI / 2.1; rootRotZ = 0.0;
      arm[0].x = Math.PI * 0.9 + Math.sin(t * 3) * 0.2; arm[1].x = Math.PI * 0.9 + Math.cos(t * 3) * 0.2;
      leg[0].x = Math.sin(t * 7) * 0.5; leg[1].x = -Math.sin(t * 7) * 0.5; leg[0].knee = 0.8; leg[1].knee = 0.8;
      expr = s.downed ? 'ko' : 'angry';
    }

    // ---- actions (override upper body)
    const act = s.action;
    if (act && act.name) {
      const p = act.t ?? 0;
      const R = arm[1], Lh = arm[0];
      switch (act.name) {
        case 'chop': case 'mine': case 'swing': case 'club': {
          // wind up overhead, strike at p≈0.55, follow through
          const k = p < 0.45 ? p / 0.45 : p < 0.6 ? 1 - (p - 0.45) / 0.15 : 0;
          const strike = p >= 0.45 && p < 0.7 ? Math.sin(((p - 0.45) / 0.25) * Math.PI) : 0;
          R.x = -2.7 * k + 0.6 * strike - 0.3; R.elbow = -1.2 * k - 0.2; R.z = -0.15;
          Lh.x = -2.2 * k + 0.5 * strike - 0.2; Lh.elbow = -1.0 * k - 0.3; Lh.z = 0.25;
          torsoPitch += -0.25 * k + 0.45 * strike; torsoYaw += -0.25 * k;
          if (act.name === 'mine') torsoPitch += 0.15 * strike;
          break;
        }
        case 'hammer': {
          const k = Math.sin(p * Math.PI * 2) * 0.5 + 0.5;
          R.x = -1.3 - k * 0.9; R.elbow = -1.2 + k * 0.6; R.z = -0.25; torsoPitch += 0.15;
          break;
        }
        case 'punch': {
          const k = Math.sin(Math.min(1, p * 2) * Math.PI);
          const side = act.side ? Lh : R;
          side.x = -1.5 * k - 0.2; side.elbow = -1.4 + 1.3 * k; torsoYaw += (act.side ? -0.4 : 0.4) * k;
          break;
        }
        case 'throw': {
          const k = p < 0.5 ? p / 0.5 : 1 - (p - 0.5) / 0.5;
          R.x = p < 0.5 ? -2.6 * k : -2.6 + 3.2 * (1 - k); R.elbow = -0.9; torsoYaw += (p < 0.5 ? -0.5 * k : 0.5 * (1 - k));
          break;
        }
        case 'aim': R.x = -1.45 + (s.lookPitch ?? 0); R.elbow = -0.2; R.z = 0.05; Lh.x = -1.3 + (s.lookPitch ?? 0); Lh.elbow = -0.5; Lh.z = -0.35; break;
        case 'eat': { const k = Math.sin(Math.min(1, p) * Math.PI); R.x = -1.9 * k - 0.2; R.elbow = -1.9 * k; R.z = -0.45 * k; headPitch += 0.15 * k; expr = 'happy'; this.cheeks = k; break; }
        case 'drink': { hipY -= 0.1; leg[0].knee += 1.4; leg[1].knee += 1.4; leg[0].x -= 0.9; leg[1].x -= 0.9; torsoPitch += 0.7; R.x = -1; Lh.x = -1; R.elbow = -0.6; Lh.elbow = -0.6; headPitch += 0.3; break; }
        case 'interact': { const k = Math.sin(Math.min(1, p) * Math.PI); R.x = -1.4 * k; R.elbow = -0.3; torsoPitch += 0.15 * k; break; }
        case 'pickup': { const k = Math.sin(Math.min(1, p) * Math.PI); hipY -= 0.08 * k; torsoPitch += 0.6 * k; R.x = -0.9 * k; leg[0].knee += 0.8 * k; leg[1].knee += 0.8 * k; leg[0].x -= 0.5 * k; leg[1].x -= 0.5 * k; break; }
        case 'carry': R.x = -2.9; Lh.x = -2.9; R.elbow = -0.6; Lh.elbow = -0.6; R.z = 0.2; Lh.z = -0.2; break;
        case 'wave': R.x = -2.6; R.z = -0.4 + Math.sin(t * 12) * 0.4; R.elbow = -0.4; expr = 'happy'; break;
        case 'point': R.x = -1.55 + (s.lookPitch ?? 0); R.elbow = 0; R.z = 0.0; break;
        case 'dance': {
          hipY += Math.abs(Math.sin(t * 7)) * 0.05; hipRoll += Math.sin(t * 7) * 0.2;
          R.x = -2.4 + Math.sin(t * 7) * 0.6; Lh.x = -2.4 - Math.sin(t * 7) * 0.6; R.z = -0.3; Lh.z = 0.3;
          headRoll = Math.sin(t * 7) * 0.25; expr = 'happy'; break;
        }
        case 'scream': R.x = -2.8 + Math.sin(t * 30) * 0.2; Lh.x = -2.8 + Math.cos(t * 30) * 0.2; expr = 'scared'; this.talk = Math.max(this.talk, 0.9); break;
        case 'cheer': R.x = -2.9; Lh.x = -2.9; R.z = -0.5; Lh.z = 0.5; hipY += Math.abs(Math.sin(t * 9)) * 0.06; expr = 'happy'; break;
        case 'scan': R.x = -1.45 + (s.lookPitch ?? 0) * 0.8; R.elbow = -0.5; R.z = 0.2; Lh.x = -1.1; Lh.elbow = -1.0; Lh.z = -0.45; break;
        case 'pet': { R.x = -1.2 + Math.sin(t * 8) * 0.2; R.elbow = -0.4; torsoPitch += 0.25; expr = 'happy'; break; }
        case 'tpose': R.x = 0; Lh.x = 0; R.z = -1.57; Lh.z = 1.57; R.elbow = 0; Lh.elbow = 0; break;
        default: break;
      }
    }
    // carrying a held tool idle pose
    if (s.holding && (!act || !act.name)) { arm[1].x = Math.min(arm[1].x, -0.35); arm[1].elbow = -0.75; }

    // ---- fidgets when idle
    if (speed < 0.2 && grounded && !act?.name && !s.sitting && !s.sleeping && !s.downed && !s.carried && !s.swim) {
      this.fidget.next -= dt;
      if (!this.fidget.name && this.fidget.next <= 0) { this.fidget.name = ['scratch', 'look', 'stretch', 'tap'][Math.floor(Math.random() * 4)]; this.fidget.t = 0; }
      if (this.fidget.name) {
        const f = this.fidget; f.t += dt;
        const k = Math.sin(Math.min(1, f.t / 1.6) * Math.PI);
        if (f.name === 'scratch') { arm[1].x = -2.6 * k; arm[1].elbow = -2.0 * k; arm[1].z = -0.5 * k + Math.sin(t * 20) * 0.08 * k; headRoll = 0.15 * k; }
        if (f.name === 'look') { headYaw += Math.sin(f.t * 2.2) * 0.9 * k; }
        if (f.name === 'stretch') { arm[0].x = -2.9 * k; arm[1].x = -2.9 * k; torsoPitch -= 0.15 * k; if (k > 0.6) expr = 'sleepy'; }
        if (f.name === 'tap') { leg[1].ankle = -0.3 + Math.abs(Math.sin(t * 9)) * 0.4 * k; }
        if (f.t > 1.6) { f.name = null; f.next = 7 + Math.random() * 12; }
      }
    } else { this.fidget.name = null; }

    // ---- head lag spring from turning
    const yaw = s.yaw ?? 0;
    let dyaw = yaw - this.prevYaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.prevYaw = yaw;
    this.headLagV.x += (-this.headLag.x * 90 - this.headLagV.x * 9) * dt - dyaw * 6;
    this.headLag.x += this.headLagV.x * dt;
    this.headLagV.y += (-this.headLag.y * 90 - this.headLagV.y * 9) * dt + (grounded ? 0 : (s.vy ?? 0) * 0.02) + sq * 2;
    this.headLag.y += this.headLagV.y * dt;

    // ---- apply (smoothed)
    const k = 14;
    const P = this.pose;
    const sm = (name, v) => { P[name] = P[name] === undefined ? v : ease(P[name], v, k); return P[name]; };
    this.hips.position.y = sm('hipY', hipY + rootY);
    this.root.rotation.x = sm('rootRotX', rootRotX);
    this.root.rotation.z = sm('rootRotZ', rootRotZ);
    this.hips.rotation.set(sm('hipPitch', hipPitch), 0, sm('hipRoll', hipRoll));
    this.torso.rotation.set(sm('torsoPitch', torsoPitch), sm('torsoYaw', torsoYaw), sm('torsoRoll', torsoRoll - hipRoll * 0.5));
    this.headPivot.rotation.set(sm('headPitch', headPitch) + this.headLag.y * 0.4, sm('headYaw', headYaw) + this.headLag.x * 0.5, sm('headRoll', headRoll) - this.headLag.x * 0.15);
    for (let i = 0; i < 2; i++) {
      const a = this.arms[i], ar = arm[i];
      a.sh.rotation.set(sm('ax' + i, ar.x), 0, sm('az' + i, ar.z));
      a.elbow.rotation.x = sm('ae' + i, ar.elbow);
      const l = this.legs[i], lr = leg[i];
      l.hip.rotation.x = sm('lx' + i, lr.x);
      l.knee.rotation.x = sm('lk' + i, lr.knee);
      l.ankle.rotation.x = sm('la' + i, lr.ankle - lr.knee * 0.5);
    }
    // secondary: backpack + pompom + brim
    this.packBounceV += (-this.packBounce * 160 - this.packBounceV * 8) * dt + (Math.abs(Math.cos(ph)) - 0.5) * moving * 0.8 + sq * 3;
    this.packBounce += this.packBounceV * dt;
    if (this.pack) this.pack.rotation.x = this.packBounce * 0.6;
    this.pomBounceV += (-this.pomBounce * 120 - this.pomBounceV * 5) * dt + this.headLagV.x * 0.05 + moving * Math.sin(ph * 2) * 0.6;
    this.pomBounce += this.pomBounceV * dt;
    if (this.pom) { this.pom.position.x = this.pomBounce * 0.08; this.pom.position.y = 0.28 - Math.abs(this.pomBounce) * 0.02; }
    if (this.brim) this.brim.rotation.x = this.headLag.y * 0.1;
    if (this.scarfTail) this.scarfTail.rotation.x = 0.25 + this.packBounce * 0.8 + torsoPitch * 0.6;

    // ---- face: blink, expressions, talking mouth
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = 2 + Math.random() * 4 + (Math.random() < 0.15 ? -1.8 : 0); }
    this.blink = Math.max(0, this.blink - dt);
    const blinkK = this.blink > 0 ? 0.08 : 1;
    this.setExpression(expr, blinkK, dt);
    const talkTarget = Math.max(s.talk ?? 0, expr === 'scared' ? 0.6 : 0);
    this.talk = ease(this.talk, talkTarget, 18);
    const mouthOpen = this.talk > 0.03 ? this.talk * (0.7 + 0.3 * Math.sin(t * 31) * Math.sin(t * 17)) : 0;
    this.mouth.scale.set(expr === 'scared' ? 0.8 : 1, 0.05 + mouthOpen * 0.95, 0.3);
    this.mouth.visible = mouthOpen > 0.02 || expr === 'happy';
    if (expr === 'happy' && mouthOpen < 0.02) this.mouth.scale.set(1.1, 0.25, 0.3);
    this.cheeks = Math.max(0, (this.cheeks ?? 0) - dt * 2);
    this.headMesh.scale.set(1 + this.cheeks * 0.04, 1, 1 + this.cheeks * 0.02);
  }

  setExpression(expr, blinkK, dt) {
    const ko = expr === 'ko';
    this.eyes.forEach((e) => (e.visible = !ko));
    this.xEyes.forEach((e) => (e.visible = ko));
    let eyeY = 1.05 * blinkK, eyeX = 1, browY = 0, browRot = 0, browUp = 0;
    switch (expr) {
      case 'happy': eyeY = 0.45 * blinkK; browY = 0.006; break;
      case 'scared': eyeY = 1.45 * blinkK; eyeX = 1.25; browY = 0.014; browRot = -0.35; break;
      case 'angry': eyeY = 0.8 * blinkK; browY = -0.006; browRot = 0.45; break;
      case 'hurt': eyeY = 0.25; eyeX = 1.3; browRot = -0.3; break;
      case 'sleepy': eyeY = 0.18; browY = -0.004; break;
      case 'surprised': eyeY = 1.5 * blinkK; eyeX = 1.3; browY = 0.02; break;
      default: break;
    }
    for (const e of this.eyes) { e.scale.y += (eyeY - e.scale.y) * Math.min(1, dt * 30); e.scale.x += (eyeX - e.scale.x) * Math.min(1, dt * 20); }
    for (const b of this.brows) {
      b.position.y += (b.userData.base.y + browY + browUp - b.position.y) * Math.min(1, dt * 15);
      const target = b.userData.side * (0.35 + browRot) * (b.userData.side < 0 ? -1 : 1) * -1;
      b.rotation.z += (b.userData.side * browRot * -1 - b.rotation.z) * Math.min(1, dt * 15);
      void target;
    }
  }
}

// Render a character to a small canvas for UI portraits (pixelated).
export function portrait(renderer, outfit, size = 64) {
  const c = new Character(outfit);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.2); d.position.set(1, 2, 3); scene.add(d);
  scene.add(c.root);
  c.update(0.016, {});
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
  cam.position.set(0.35, 1.0, 2.0); cam.lookAt(0, 0.82, 0);
  const rt = new THREE.WebGLRenderTarget(size, size);
  renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, cam); renderer.setRenderTarget(null);
  const buf = new Uint8Array(size * size * 4);
  renderer.readRenderTargetPixels(rt, 0, 0, size, size, buf);
  rt.dispose();
  const p = new PixelPainter(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const k = ((size - 1 - y) * size + x) * 4; p.data.set(buf.subarray(k, k + 4), (y * size + x) * 4); }
  return p;
}
