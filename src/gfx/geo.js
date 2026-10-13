// GeoBuilder: tiny procedural mesh kit (tubes, fronds, cards, boxes, blobs)
// emitting position/normal/uv/color + custom float attributes (aWind, aLayer).
import * as THREE from 'three';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3(), _t = new THREE.Vector3();

export class GeoBuilder {
  constructor(extra = ['aWind', 'aLayer']) {
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = [];
    this.extraNames = extra;
    this.extra = Object.fromEntries(extra.map((k) => [k, []]));
    this.cur = { color: [1, 1, 1], aWind: 0, aLayer: 0 };
  }
  get count() { return this.pos.length / 3; }
  vert(p, n, u, v, opt = {}) {
    this.pos.push(p.x, p.y, p.z);
    this.nrm.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    const c = opt.color ?? this.cur.color;
    const ao = opt.ao ?? 1;
    this.col.push(c[0] * ao, c[1] * ao, c[2] * ao);
    for (const k of this.extraNames) this.extra[k].push(opt[k] ?? this.cur[k] ?? 0);
    return this.count - 1;
  }
  tri(a, b, c) { this.idx.push(a, b, c); }
  quadIdx(a, b, c, d) { this.idx.push(a, b, c, a, c, d); }

  // Tube along a polyline of centres with per-ring radius. opt: segs, layer, uRepeat, vScale(m per v unit), wind(t)->w, ao(t)->ao, cap
  tube(centers, radii, opt = {}) {
    const segs = opt.segs ?? 6;
    const n = centers.length;
    const uRep = opt.uRepeat ?? 1;
    const vScale = opt.vScale ?? 2;
    const jitter = opt.jitter ?? 0;
    const rnd = opt.rnd ?? Math.random;
    const base = this.count;
    // parallel-transport frames
    let prevN = null;
    let vAcc = opt.v0 ?? 0;
    const ringJit = [];
    for (let j = 0; j <= segs; j++) ringJit.push(1 + (rnd() - 0.5) * jitter);
    ringJit[segs] = ringJit[0];
    for (let i = 0; i < n; i++) {
      const c = centers[i];
      const a = centers[Math.max(0, i - 1)], b = centers[Math.min(n - 1, i + 1)];
      _t.subVectors(b, a).normalize();
      if (!prevN) {
        _n.set(0, 0, 1);
        if (Math.abs(_t.dot(_n)) > 0.9) _n.set(1, 0, 0);
        _n.addScaledVector(_t, -_n.dot(_t)).normalize();
      } else {
        _n.copy(prevN).addScaledVector(_t, -prevN.dot(_t)).normalize();
      }
      prevN = _n.clone();
      _b.crossVectors(_t, _n).normalize();
      if (i > 0) vAcc += centers[i].distanceTo(centers[i - 1]) / vScale;
      const t = i / (n - 1);
      const r = radii[i];
      const dr = (radii[Math.min(n - 1, i + 1)] - radii[Math.max(0, i - 1)]) / Math.max(1e-4, centers[Math.min(n - 1, i + 1)].distanceTo(centers[Math.max(0, i - 1)]));
      for (let j = 0; j <= segs; j++) {
        const ang = (j / segs) * Math.PI * 2;
        const cs = Math.cos(ang), sn = Math.sin(ang);
        _w.copy(_n).multiplyScalar(cs).addScaledVector(_b, sn);
        const rr = r * ringJit[j] * (opt.ringNoise ? opt.ringNoise(t, j) : 1);
        _v.copy(c).addScaledVector(_w, rr);
        const nn = _w.clone().addScaledVector(_t, -dr).normalize();
        this.vert(_v, nn, (j / segs) * uRep, vAcc, {
          aWind: opt.wind ? opt.wind(t, c) : 0,
          aLayer: opt.layer ?? 0,
          ao: opt.ao ? opt.ao(t, c) : 1,
          color: opt.color,
        });
      }
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < segs; j++) {
        const a = base + i * (segs + 1) + j, b = a + 1, c = a + segs + 1, d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    if (opt.capTop) {
      const c = centers[n - 1];
      const ci = this.vert(c, _t.clone(), 0.5, vAcc, { aWind: opt.wind ? opt.wind(1, c) : 0, aLayer: opt.capLayer ?? opt.layer ?? 0, color: opt.color });
      const ring = base + (n - 1) * (segs + 1);
      for (let j = 0; j < segs; j++) this.idx.push(ring + j, ring + j + 1, ci);
    }
    return this;
  }

  // Double-sided-ready strip (frond / ribbon) along a polyline with a side vector per point.
  ribbon(centers, sides, widths, opt = {}) {
    const n = centers.length;
    const [u0, v0, u1, v1] = opt.uvRect ?? [0, 0, 1, 1];
    const base = this.count;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const c = centers[i], s = sides[i], w = widths[i] * 0.5;
      const tan = _t.subVectors(centers[Math.min(n - 1, i + 1)], centers[Math.max(0, i - 1)]).normalize();
      const nn = new THREE.Vector3().crossVectors(s, tan).normalize();
      if (opt.normalBias) nn.lerp(opt.normalBias, opt.normalBiasAmt ?? 0.5).normalize();
      const v = opt.flipV ? v0 + (v1 - v0) * t : v1 - (v1 - v0) * t;
      const ww = opt.wind ? opt.wind(t) : 0;
      const ao = opt.ao ? opt.ao(t) : 1;
      this.vert(_v.copy(c).addScaledVector(s, -w), nn, u0, v, { aWind: ww, aLayer: opt.layer ?? 0, ao, color: opt.color });
      this.vert(_v.copy(c).addScaledVector(s, w), nn, u1, v, { aWind: ww, aLayer: opt.layer ?? 0, ao, color: opt.color });
    }
    for (let i = 0; i < n - 1; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return this;
  }

  // Single quad card centred at c, spanned by half-axes ax, ay; normal override nrm.
  card(c, ax, ay, nrm, opt = {}) {
    const [u0, v0, u1, v1] = opt.uvRect ?? [0, 0, 1, 1];
    const w = opt.wind ?? 0;
    const L = opt.layer ?? 0;
    const ao = opt.ao ?? 1;
    const wt = opt.windTop ?? w, wb = opt.windBottom ?? w;
    const a = this.vert(_v.copy(c).sub(ax).sub(ay), nrm, u0, v1, { aWind: wb, aLayer: L, ao, color: opt.color });
    const b = this.vert(_v.copy(c).add(ax).sub(ay), nrm, u1, v1, { aWind: wb, aLayer: L, ao, color: opt.color });
    const d = this.vert(_v.copy(c).add(ax).add(ay), nrm, u1, v0, { aWind: wt, aLayer: L, ao, color: opt.color });
    const e = this.vert(_v.copy(c).sub(ax).add(ay), nrm, u0, v0, { aWind: wt, aLayer: L, ao, color: opt.color });
    this.idx.push(a, b, d, a, d, e);
    return this;
  }

  // Append an existing BufferGeometry (positions/normals/uv) transformed by matrix.
  addGeometry(geo, matrix, opt = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, nr = g.attributes.normal, uv = g.attributes.uv;
    const nm = new THREE.Matrix3().getNormalMatrix(matrix);
    const base = this.count;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      _n.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize();
      const u = uv ? uv.getX(i) * (opt.uScale ?? 1) : 0, v = uv ? uv.getY(i) * (opt.vScale ?? 1) : 0;
      this.vert(_v, _n, u, v, { aWind: typeof opt.wind === 'function' ? opt.wind(_v) : opt.wind ?? 0, aLayer: opt.layer ?? 0, ao: typeof opt.ao === 'function' ? opt.ao(_v) : opt.ao ?? 1, color: opt.color });
    }
    for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    return this;
  }

  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    for (const k of this.extraNames) geo.setAttribute(k, new THREE.Float32BufferAttribute(this.extra[k], 1));
    geo.setIndex(this.idx);
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    return geo;
  }
}

// Bent polyline from base along up with lean/curve. Returns array of Vector3.
export function curvePoints(base, height, n, opt = {}) {
  const { leanX = 0, leanZ = 0, curve = 1.6, wobble = 0, rnd = Math.random } = opt;
  const pts = [];
  const wx = rnd() * 10, wz = rnd() * 10;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lean = Math.pow(t, curve);
    pts.push(new THREE.Vector3(
      base.x + leanX * lean * height + Math.sin(t * 5 + wx) * wobble * t,
      base.y + t * height,
      base.z + leanZ * lean * height + Math.sin(t * 4 + wz) * wobble * t,
    ));
  }
  return pts;
}

export function mergeGeos(geos) {
  // merges geometries built by GeoBuilder (same attribute layout)
  const out = new GeoBuilder();
  for (const g of geos) {
    const base = out.count;
    const p = g.attributes.position.array, n = g.attributes.normal.array, uv = g.attributes.uv.array, c = g.attributes.color.array;
    for (let i = 0; i < p.length / 3; i++) {
      out.pos.push(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
      out.nrm.push(n[i * 3], n[i * 3 + 1], n[i * 3 + 2]);
      out.uv.push(uv[i * 2], uv[i * 2 + 1]);
      out.col.push(c[i * 3], c[i * 3 + 1], c[i * 3 + 2]);
      for (const k of out.extraNames) out.extra[k].push(g.attributes[k] ? g.attributes[k].array[i] : 0);
    }
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i++) out.idx.push(base + idx[i]);
  }
  return out.build();
}
