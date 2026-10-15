// Rapids: the boulders the generator scattered through the two whitewater
// runs (instanced, soaked and shiny, solid enough to climb onto), spray off
// the rocks and mist over the ledges, and the river's current: a lookup that
// tells anything in the water which way it is being pushed and how hard.
import * as THREE from 'three';
import { rockGeo, makeRockMaterial } from './nodes.js';
import { patchMaterial } from '../gfx/shaderlib.js';
import { GLSL_HASH } from './terrain.js';

const CELL = 6;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);

export class Rapids {
  constructor(game) {
    this.name = 'rapids';
    this.g = game;
    const w = game.world;
    this.river = w.river ?? [];
    this.boulders = w.boulders ?? [];
    this.loud = 0;
    this.sprayT = 0;
    this.buildFlowIndex();
    this.buildRocks();
    // no reeds in white water
    for (const sg of this.seg) {
      if (sg.rapid < 0.15 && !sg.fall) continue;
      for (let t = 0; t <= sg.len; t += 2) game.ground?.markWild?.(sg.ax + sg.dx * t, sg.az + sg.dz * t, sg.hw + 2.5);
    }
    game.rapids = this;
    game.riverFlow = (x, z, out) => this.flowAt(x, z, out);
  }

  // ------------------------------------------------------------ current
  buildFlowIndex() {
    const R = this.river, n = R.length;
    this.cells = new Map();
    this.seg = [];
    for (let i = 0; i < n - 1; i++) {
      const a = R[i], b = R[i + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz) || 1;
      // steeper water runs faster; the rapids run fastest of all
      const back = R[Math.max(0, i - 2)], fwd = R[Math.min(n - 1, i + 3)];
      const slope = Math.max(0, (back[2] - fwd[2]) / Math.max(1, Math.hypot(fwd[0] - back[0], fwd[1] - back[1])));
      const rapid = Math.max(a[5] ?? 0, b[5] ?? 0);
      const fall = a[4] || b[4];
      const speed = fall ? 7 : 0.55 + Math.min(2.5, slope * 60) + rapid * 4.2;
      const seg = { i, ax: a[0], az: a[1], dx: dx / l, dz: dz / l, len: l, hw: Math.max(a[3], b[3]) * 0.5 + 1.2, speed, rapid, fall: !!fall, la: a[2], lb: b[2] };
      this.seg.push(seg);
      const r = seg.hw + 2;
      const i0 = Math.floor((Math.min(a[0], b[0]) - r) / CELL), i1 = Math.floor((Math.max(a[0], b[0]) + r) / CELL);
      const j0 = Math.floor((Math.min(a[1], b[1]) - r) / CELL), j1 = Math.floor((Math.max(a[1], b[1]) + r) / CELL);
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) {
        const k = ii * 92821 + jj;
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(seg);
      }
    }
  }
  // { vx, vz, speed, rapid, fall, edge } of the river at a point, or null on dry land
  flowAt(x, z, out = {}) {
    const list = this.cells.get(Math.floor(x / CELL) * 92821 + Math.floor(z / CELL));
    if (!list) return null;
    let best = null, bd = Infinity, bt = 0;
    for (const s of list) {
      let t = (x - s.ax) * s.dx + (z - s.az) * s.dz;
      t = t < 0 ? 0 : t > s.len ? s.len : t;
      const ex = s.ax + s.dx * t - x, ez = s.az + s.dz * t - z;
      const d = ex * ex + ez * ez;
      if (d < bd) { bd = d; best = s; bt = t; }
    }
    if (!best) return null;
    const d = Math.sqrt(bd);
    if (d > best.hw) return null;
    // slower near the banks, fastest mid-channel
    const edge = d / best.hw;
    const k = 1 - edge * edge * 0.8;
    out.vx = best.dx * best.speed * k; out.vz = best.dz * best.speed * k;
    out.speed = best.speed * k; out.rapid = best.rapid * k; out.fall = best.fall; out.edge = edge; out.along = bt;
    // the ribbon is flat across and linear between river points, like the mesh
    out.level = best.la + (best.lb - best.la) * (bt / best.len);
    return out;
  }

  // ------------------------------------------------------------ boulders
  buildRocks() {
    const g = this.g, B = this.boulders;
    if (!B.length) return;
    const tex = g.nodes?.rockTex;
    const mat = tex ? makeRockMaterial(tex, { moss: 0.25, soak: 1, water: g.nodes?.waterOpt }) : new THREE.MeshStandardMaterial({ color: 0x7a766e, roughness: 0.5 });
    // river-worn: low, broad and rounded, with only a few broken faces
    const geos = [rockGeo(301, 1, 0.62, 0.3), rockGeo(313, 1, 0.5, 0.34), rockGeo(327, 1, 0.72, 0.26)];
    for (const geo of geos) geo.computeBoundingBox();
    this.group = new THREE.Group(); this.group.name = 'rapids';
    const per = geos.map(() => []);
    B.forEach((b, i) => per[i % geos.length].push(b));
    this.meshes = [];
    for (const [gi, list] of per.entries()) {
      if (!list.length) continue;
      const geo = geos[gi];
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = true; im.receiveShadow = true;
      const top = geo.boundingBox.max.y;
      for (const [k, b] of list.entries()) {
        const [x, ytop, z, r, rot] = b;
        _q.setFromAxisAngle(_y, rot);
        _s.set(r, r * (0.8 + (k % 3) * 0.12), r);
        _p.set(x, ytop - top * _s.y, z);
        _m.compose(_p, _q, _s);
        im.setMatrixAt(k, _m);
        // solid enough to stand on
        g.physics?.addCyl?.({ x, z, r: r * 0.82, y0: ytop - r * 1.6, y1: ytop - r * 0.05, kind: 'rock', walk: true });
      }
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      this.group.add(im);
      this.meshes.push(im);
    }
    this.buildFoam();
    g.engine.scene.add(this.group);
  }

  // white water hugging each rock: a cushion on the upstream face, a collar
  // all round and a churned V-shaped wake trailing downstream
  buildFoam() {
    const B = this.boulders, probe = {};
    const list = [];
    for (const b of B) {
      const f = this.flowAt(b[0], b[2], probe);
      if (!f || f.fall) continue;
      list.push([b[0], b[2], b[3], Math.atan2(f.vx, f.vz), f.level, Math.min(1, 0.3 + f.rapid * 0.6)]);
    }
    if (!list.length) return;
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    const strength = new Float32Array(list.length);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    patchMaterial(mat, {
      vertex: {
        head: 'attribute float aFoamK;\nvarying float vFK;\nvarying vec2 vFW;',
        main: 'vFK = aFoamK; vFW = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xz;',
      },
      fragment: {
        head: 'varying float vFK;\nvarying vec2 vFW;\nfloat fA;\n' + GLSL_HASH,
        map: `{
          // quad space in rock radii from the rock centre: X across, Z downstream
          float X = ( vUv.x - 0.5 ) * 3.8, Z = ( 0.5 - vUv.y ) * 5.4 + 0.75;
          float dR = length( vec2( X, Z ) );
          float t = uTime;
          vec2 seed = vFW * 0.37;
          float n1 = vnoise( vec2( X * 2.6, Z * 1.4 - t * 3.2 ) + seed );
          float n2 = vnoise( vec2( X * 6.0, Z * 3.5 - t * 4.5 ) + seed * 1.7 + 9.0 );
          float n3 = vnoise( vec2( X * 11.0, Z * 7.0 - t * 6.0 ) + seed * 2.3 + 3.0 );
          float churn = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
          // lace: foam is full of holes, never a solid sheet
          float lace = smoothstep( 0.38, 0.62, churn );
          float collar = smoothstep( 1.32, 1.02, dR + ( n2 - 0.5 ) * 0.35 ) * mix( 0.55, 1.0, lace );
          float pillow = smoothstep( 1.75, 1.05, dR ) * smoothstep( 0.2, -0.9, Z ) * lace;
          float lane = 0.92 + max( Z, 0.0 ) * 0.3;
          float wake = exp( - pow( ( abs( X ) - lane ) / 0.18, 2.0 ) ) * smoothstep( -0.4, 0.4, Z ) * ( 1.0 - smoothstep( 0.8, 3.4, Z ) ) * smoothstep( 0.35, 0.6, churn );
          float trail = smoothstep( lane, lane - 0.45, abs( X ) ) * smoothstep( 0.0, 0.6, Z ) * ( 1.0 - smoothstep( 0.4, 3.0, Z ) ) * smoothstep( 0.58, 0.75, churn );
          float f = max( max( collar, pillow * 0.85 ), max( wake * 0.9, trail * 0.75 ) );
          f *= smoothstep( 0.0, 0.07, vUv.x ) * smoothstep( 1.0, 0.93, vUv.x ) * smoothstep( 0.0, 0.07, vUv.y ) * smoothstep( 1.0, 0.93, vUv.y );
          fA = clamp( f * vFK, 0.0, 0.9 );
          diffuseColor.rgb *= mix( vec3( 0.78, 0.86, 0.88 ), vec3( 0.95, 0.98, 1.0 ), churn );
        }`,
      },
    });
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, r) => {
      prev(shader, r);
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= fA;');
    };
    // vUv needs a uv-using define on a material without maps
    mat.defines = { ...(mat.defines ?? {}), USE_UV: '' };
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    for (const [k, [x, z, r, ang, level, kk]] of list.entries()) {
      _q.setFromAxisAngle(_y, ang);
      _s.set(3.8 * r, 1, 5.4 * r);
      // shifted downstream: the wake trails further than the cushion reaches upstream
      _p.set(x + Math.sin(ang) * 0.75 * r, level + 0.06, z + Math.cos(ang) * 0.75 * r);
      _m.compose(_p, _q, _s);
      im.setMatrixAt(k, _m);
      strength[k] = kk;
    }
    geo.setAttribute('aFoamK', new THREE.InstancedBufferAttribute(strength, 1));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.renderOrder = 4;
    im.receiveShadow = true;
    im.name = 'rapids-foam';
    this.group.add(im);
    this.foam = im;
  }

  // ------------------------------------------------------------ frame
  update(dt) {
    const g = this.g, cam = g.engine.camera.position;
    // whitewater noise when you are near a run
    let near = Infinity;
    const probe = this._probe ?? (this._probe = {});
    for (const [dx, dz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8], [18, 0], [-18, 0], [0, 18], [0, -18]]) {
      const f = this.flowAt(cam.x + dx, cam.z + dz, probe);
      if (f && f.rapid > 0.2) near = Math.min(near, Math.hypot(dx, dz));
    }
    const want = near < Infinity ? 0.7 * (1 - near / 30) : 0;
    this.loud += (want - this.loud) * Math.min(1, dt * 2);
    // spray off the rocks and mist over the ledges, close to the camera only
    if (!g.fx || !this.boulders.length) return;
    this.sprayT -= dt;
    if (this.sprayT > 0) return;
    this.sprayT = 0.05;
    const B = this.boulders;
    for (let k = 0; k < 4; k++) {
      const b = B[(Math.random() * B.length) | 0];
      const dx = b[0] - cam.x, dz = b[2] - cam.z;
      if (dx * dx + dz * dz > 45 * 45) continue;
      const f = this.flowAt(b[0], b[2], probe);
      if (!f) continue;
      const r = b[3];
      // the upstream face of the rock takes the hit
      const ux = -f.vx / Math.max(0.1, f.speed), uz = -f.vz / Math.max(0.1, f.speed);
      const x = b[0] + ux * r * 0.8, z = b[2] + uz * r * 0.8, y = f.level + 0.1;
      g.fx.sprite('drop', x, y, z, { vx: (Math.random() - 0.5) * 1.6 - ux * 0.6, vy: 1.6 + Math.random() * 2.2, vz: (Math.random() - 0.5) * 1.6 - uz * 0.6, life: 0.7, size: 0.07 + Math.random() * 0.05, color: 0xeaf6f8, alpha: 0.9, grav: 9 });
      if (Math.random() < 0.35) g.fx.sprite('smoke', x, y + 0.2, z, { vx: f.vx * 0.3, vy: 0.4, vz: f.vz * 0.3, life: 1.6, size: 0.6 + r * 0.5, grow: 1.2, color: 0xf2f8fa, alpha: b[5] ? 0.22 : 0.12, drag: 1.2 });
    }
  }
}

export function install(g) {
  const R = new Rapids(g);
  g.addSystem(R);
  return R;
}
