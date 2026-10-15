// Creature sculpting core (no three.js, so it can run anywhere). Shapes are
// signed-distance primitives (spheres, ellipsoids, round cones, round boxes)
// that blend into each other like clay. Each group of shapes is sampled on a
// voxel grid and meshed with surface nets, then every vertex is projected
// back onto the surface, given a smooth gradient normal, skinned to the
// bones of the shapes around it, painted from the shapes' colours and given
// soft ambient occlusion from the distance field.
//
// Shape (all lengths in metres):
//   t: 'sph' | 'ell' | 'cone' | 'box'
//   sph: c, r · ell: c, r:[x,y,z], m (world->local 3x3) · cone: a, b, ra, rb
//   box: c, r:[half x,y,z], round, m
//   op: 'add' (default) | 'sub' (carve) | 'paint' (colour only)
//   k: blend radius · amp/nf: lumpy noise · bw: [[bone, t], ...] weights
//   along the shape's axis · wf: weight falloff · col: [r,g,b] linear
//   cf: colour falloff · cp: colour priority · mat: [fur, gloss, pattern, glow]
//   belly: 0..1 countershading under the shape

export const BIG = 1e4;

// ---------------------------------------------------------------- math
export function eulerToLocal(rx = 0, ry = 0, rz = 0) {
  // rotation R = Rx·Ry·Rz (three.js 'XYZ'); returns R^T row-major (world -> local)
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry), e = Math.cos(rz), f = Math.sin(rz);
  const ae = a * e, af = a * f, be = b * e, bf = b * f;
  return [c * e, af + be * d, bf - ae * d, -c * f, ae - bf * d, be + af * d, d, -b * c, a * c];
}
// world -> local basis whose local +Z points along dir (and +Y stays as close to up as possible)
export function basisFromDir(dx, dy, dz, ux = 0, uy = 1, uz = 0, roll = 0) {
  let l = Math.hypot(dx, dy, dz) || 1; const zx = dx / l, zy = dy / l, zz = dz / l;
  // x = up × z
  let xx = uy * zz - uz * zy, xy = uz * zx - ux * zz, xz = ux * zy - uy * zx;
  l = Math.hypot(xx, xy, xz);
  if (l < 1e-6) { xx = 1; xy = 0; xz = 0; l = 1; }
  xx /= l; xy /= l; xz /= l;
  let yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  if (roll) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const nx = xx * c + yx * s, ny = xy * c + yy * s, nz = xz * c + yz * s;
    yx = yx * c - xx * s; yy = yy * c - xy * s; yz = yz * c - xz * s;
    xx = nx; xy = ny; xz = nz;
  }
  return [xx, xy, xz, yx, yy, yz, zx, zy, zz];
}
const smin = (a, b, k) => {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);

// cheap value noise in [0,1]
function hash3(i, j, k, seed) {
  let h = Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1274126177) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffffff) / 0xffffff;
}
export function vnoise(x, y, z, seed = 0) {
  const i = Math.floor(x), j = Math.floor(y), k = Math.floor(z);
  let fx = x - i, fy = y - j, fz = z - k;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const a = hash3(i, j, k, seed), b = hash3(i + 1, j, k, seed), c = hash3(i, j + 1, k, seed), d = hash3(i + 1, j + 1, k, seed);
  const e = hash3(i, j, k + 1, seed), f = hash3(i + 1, j, k + 1, seed), g = hash3(i, j + 1, k + 1, seed), h = hash3(i + 1, j + 1, k + 1, seed);
  const x0 = a + (b - a) * fx, x1 = c + (d - c) * fx, x2 = e + (f - e) * fx, x3 = g + (h - g) * fx;
  const y0 = x0 + (x1 - x0) * fy, y1 = x2 + (x3 - x2) * fy;
  return y0 + (y1 - y0) * fz;
}

// ---------------------------------------------------------------- shapes
export function prepShape(s) {
  let lo, hi;
  switch (s.t) {
    case 'sph': { const [x, y, z] = s.c, r = s.r; lo = [x - r, y - r, z - r]; hi = [x + r, y + r, z + r]; s.rad = r; break; }
    case 'ell': case 'box': {
      const m = s.m ?? (s.m = [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const r = s.r;
      lo = [0, 0, 0]; hi = [0, 0, 0];
      for (let i = 0; i < 3; i++) {
        // world axis i in local coords = column i of world->local = (m[i], m[3+i], m[6+i])
        const e = s.t === 'ell'
          ? Math.sqrt((m[i] * r[0]) ** 2 + (m[3 + i] * r[1]) ** 2 + (m[6 + i] * r[2]) ** 2)
          : Math.abs(m[i]) * r[0] + Math.abs(m[3 + i]) * r[1] + Math.abs(m[6 + i]) * r[2];
        lo[i] = s.c[i] - e; hi[i] = s.c[i] + e;
      }
      s.rad = Math.min(r[0], r[1], r[2]);
      if (s.t === 'box') s.round = Math.min(s.round ?? 0, s.rad);
      break;
    }
    case 'tri': {
      // a rounded, extruded isosceles triangle: base centred on c, apex along local +Y
      const m = s.m ?? (s.m = [1, 0, 0, 0, 1, 0, 0, 0, 1]);
      const [w, hh, t] = s.r, rd = s.round ?? 0;
      lo = [Infinity, Infinity, Infinity]; hi = [-Infinity, -Infinity, -Infinity];
      for (const cx of [-w - rd, w + rd]) for (const cy of [-rd, hh + rd]) for (const cz of [-t - rd, t + rd]) {
        // local -> world is the transpose of m
        const wx = m[0] * cx + m[3] * cy + m[6] * cz, wy = m[1] * cx + m[4] * cy + m[7] * cz, wz = m[2] * cx + m[5] * cy + m[8] * cz;
        lo[0] = Math.min(lo[0], s.c[0] + wx); hi[0] = Math.max(hi[0], s.c[0] + wx);
        lo[1] = Math.min(lo[1], s.c[1] + wy); hi[1] = Math.max(hi[1], s.c[1] + wy);
        lo[2] = Math.min(lo[2], s.c[2] + wz); hi[2] = Math.max(hi[2], s.c[2] + wz);
      }
      s.rad = Math.min(w, t + rd);
      if (s.bw && s.bw.length > 1 && !s.axis) s.axis = [s.c.slice(), [s.c[0] + m[3] * hh, s.c[1] + m[4] * hh, s.c[2] + m[5] * hh]];
      break;
    }
    case 'cone': {
      const { a, b, ra, rb } = s;
      lo = [0, 0, 0]; hi = [0, 0, 0];
      for (let i = 0; i < 3; i++) { lo[i] = Math.min(a[i] - ra, b[i] - rb); hi[i] = Math.max(a[i] + ra, b[i] + rb); }
      const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const l2 = Math.max(1e-10, ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2]);
      const rr = ra - rb;
      s._c = { ba, l2, rr, a2: l2 - rr * rr, il2: 1 / l2 };
      s.rad = Math.min(ra, rb);
      break;
    }
    default: throw new Error('shape type ' + s.t);
  }
  s.k = s.k ?? 0;
  s.amp = s.amp ?? 0;
  s.op = s.op ?? 'add';
  const m = s.k + s.amp + 1e-4;
  s.lo = lo.map((v) => v - m); s.hi = hi.map((v) => v + m);
  // axis for bone-weight keys (cone: a->b, others: along local z)
  if (s.bw && s.bw.length > 1 && !s.axis) {
    if (s.t === 'cone') s.axis = [s.a, s.b];
    else {
      const m2 = s.m ?? [1, 0, 0, 0, 1, 0, 0, 0, 1], rz = s.t === 'sph' ? s.r : s.r[2];
      const z = [m2[6] * rz, m2[7] * rz, m2[8] * rz];
      s.axis = [[s.c[0] - z[0], s.c[1] - z[1], s.c[2] - z[2]], [s.c[0] + z[0], s.c[1] + z[1], s.c[2] + z[2]]];
    }
  }
  return s;
}
export function shapeDist(s, x, y, z) {
  switch (s.t) {
    case 'sph': { const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2]; return Math.sqrt(dx * dx + dy * dy + dz * dz) - s.r; }
    case 'ell': {
      const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2], m = s.m, r = s.r;
      const lx = m[0] * dx + m[1] * dy + m[2] * dz, ly = m[3] * dx + m[4] * dy + m[5] * dz, lz = m[6] * dx + m[7] * dy + m[8] * dz;
      const ax = lx / r[0], ay = ly / r[1], az = lz / r[2];
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / r[0], by = ay / r[1], bz = az / r[2];
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 > 1e-12 ? (k0 * (k0 - 1)) / k1 : -s.rad;
    }
    case 'cone': {
      const C = s._c, ba = C.ba;
      const pax = x - s.a[0], pay = y - s.a[1], paz = z - s.a[2];
      const yv = pax * ba[0] + pay * ba[1] + paz * ba[2];
      const zv = yv - C.l2;
      const qx = pax * C.l2 - ba[0] * yv, qy = pay * C.l2 - ba[1] * yv, qz = paz * C.l2 - ba[2] * yv;
      const x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yv * yv * C.l2, z2 = zv * zv * C.l2;
      const k = Math.sign(C.rr) * C.rr * C.rr * x2;
      if (Math.sign(zv) * C.a2 * z2 > k) return Math.sqrt(x2 + z2) * C.il2 - s.rb;
      if (Math.sign(yv) * C.a2 * y2 < k) return Math.sqrt(x2 + y2) * C.il2 - s.ra;
      return (Math.sqrt(Math.max(0, x2 * C.a2 * C.il2)) + yv * C.rr) * C.il2 - s.ra;
    }
    case 'tri': {
      const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2], m = s.m, r = s.r;
      const lx = Math.abs(m[0] * dx + m[1] * dy + m[2] * dz), ly = m[3] * dx + m[4] * dy + m[5] * dz, lz = m[6] * dx + m[7] * dy + m[8] * dz;
      // iq's isosceles triangle with the apex at the origin, flipped so the base sits at y = 0
      const qx = r[0], qy = r[1], px = lx, py = qy - ly;
      const q2 = qx * qx + qy * qy;
      const ta = Math.min(1, Math.max(0, (px * qx + py * qy) / q2));
      const ax = px - qx * ta, ay = py - qy * ta;
      const tb = Math.min(1, Math.max(0, px / qx));
      const bx = px - qx * tb, by = py - qy;
      const da = ax * ax + ay * ay, db = bx * bx + by * by;
      const sa = -(px * qy - py * qx), sb = -(py - qy);
      const d2 = da < db ? da : db, sg = Math.min(sa, sb) >= 0 ? 1 : -1;
      const d2d = -Math.sqrt(d2) * sg;
      const dzz = Math.abs(lz) - r[2];
      const ox = Math.max(d2d, 0), oz = Math.max(dzz, 0);
      return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(d2d, dzz), 0) - (s.round ?? 0);
    }
    case 'box': {
      const dx = x - s.c[0], dy = y - s.c[1], dz = z - s.c[2], m = s.m, r = s.r, rd = s.round;
      const qx = Math.abs(m[0] * dx + m[1] * dy + m[2] * dz) - r[0] + rd;
      const qy = Math.abs(m[3] * dx + m[4] * dy + m[5] * dz) - r[1] + rd;
      const qz = Math.abs(m[6] * dx + m[7] * dy + m[8] * dz) - r[2] + rd;
      const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
      return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - rd;
    }
    default: return BIG;
  }
}
// signed distance with the shape's lumpy noise (outward bumps)
function noisyDist(s, x, y, z) {
  let d = shapeDist(s, x, y, z);
  if (s.amp) {
    const f = s.nf ?? 8, sd = s.seed ?? 1;
    let n = vnoise(x * f, y * f, z * f, sd);
    if (s.oct) n = n * 0.65 + vnoise(x * f * 2.3, y * f * 2.3, z * f * 2.3, sd + 7) * 0.35;
    d -= s.amp * (s.ridge ? 1 - Math.abs(n * 2 - 1) : n);
  }
  return d;
}

// ---------------------------------------------------------------- grids
// Grids share one lattice (origin on multiples of h) so groups line up.
function gridFor(shapes, h) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) if (s.op === 'add') for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.lo[i]); hi[i] = Math.max(hi[i], s.hi[i]); }
  const o = lo.map((v) => (Math.floor(v / h) - 2) * h);
  const n = hi.map((v, i) => Math.ceil((v - o[i]) / h) + 3);
  return { ox: o[0], oy: o[1], oz: o[2], nx: n[0], ny: n[1], nz: n[2], h, f: new Float32Array(n[0] * n[1] * n[2]).fill(BIG) };
}
function applyShape(G, s, carve) {
  const { ox, oy, oz, nx, ny, nz, h, f } = G;
  const i0 = Math.max(0, Math.floor((s.lo[0] - ox) / h)), i1 = Math.min(nx - 1, Math.ceil((s.hi[0] - ox) / h));
  const j0 = Math.max(0, Math.floor((s.lo[1] - oy) / h)), j1 = Math.min(ny - 1, Math.ceil((s.hi[1] - oy) / h));
  const k0 = Math.max(0, Math.floor((s.lo[2] - oz) / h)), k1 = Math.min(nz - 1, Math.ceil((s.hi[2] - oz) / h));
  const k = s.k;
  for (let kk = k0; kk <= k1; kk++) {
    const z = oz + kk * h;
    for (let j = j0; j <= j1; j++) {
      const y = oy + j * h;
      let idx = i0 + nx * (j + ny * kk);
      for (let i = i0; i <= i1; i++, idx++) {
        const d = noisyDist(s, ox + i * h, y, z);
        const cur = f[idx];
        f[idx] = carve ? smax(cur, -d, k) : smin(cur, d, k);
      }
    }
  }
}
export function sampleGrid(G, x, y, z) {
  const fx = (x - G.ox) / G.h, fy = (y - G.oy) / G.h, fz = (z - G.oz) / G.h;
  const i = Math.floor(fx), j = Math.floor(fy), k = Math.floor(fz);
  if (i < 0 || j < 0 || k < 0 || i >= G.nx - 1 || j >= G.ny - 1 || k >= G.nz - 1) return BIG;
  const tx = fx - i, ty = fy - j, tz = fz - k;
  const nx = G.nx, sz = nx * G.ny, f = G.f;
  const p = i + nx * j + sz * k;
  const c00 = f[p] + (f[p + 1] - f[p]) * tx, c10 = f[p + nx] + (f[p + nx + 1] - f[p + nx]) * tx;
  const c01 = f[p + sz] + (f[p + sz + 1] - f[p + sz]) * tx, c11 = f[p + sz + nx] + (f[p + sz + nx + 1] - f[p + sz + nx]) * tx;
  const c0 = c00 + (c10 - c00) * ty, c1 = c01 + (c11 - c01) * ty;
  return c0 + (c1 - c0) * tz;
}
function gradGrid(G, x, y, z, out) {
  const e = G.h * 0.5;
  out[0] = sampleGrid(G, x + e, y, z) - sampleGrid(G, x - e, y, z);
  out[1] = sampleGrid(G, x, y + e, z) - sampleGrid(G, x, y - e, z);
  out[2] = sampleGrid(G, x, y, z + e) - sampleGrid(G, x, y, z - e);
  // a sample that fell off the grid gives a huge difference; ignore that axis
  for (let i = 0; i < 3; i++) if (Math.abs(out[i]) > G.h * 4) out[i] = 0;
  return out;
}

// ---------------------------------------------------------------- surface nets
const CORNER = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
function surfaceNets(G) {
  const { f, nx, ny, nz, h, ox, oy, oz } = G;
  const cx = nx - 1, cy = ny - 1, cz = nz - 1;
  const cellV = new Int32Array(cx * cy * cz).fill(-1);
  const co = CORNER.map(([a, b, c]) => a + nx * (b + ny * c));
  let pos = new Float32Array(4096 * 3), nv = 0;
  const vals = new Float64Array(8);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) {
    let base = nx * (j + ny * k);
    for (let i = 0; i < cx; i++, base++) {
      let mask = 0;
      for (let c = 0; c < 8; c++) { const v = f[base + co[c]]; vals[c] = v; if (v < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let ax = 0, ay = 0, az = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const a = EDGES[e][0], b = EDGES[e][1];
        const va = vals[a], vb = vals[b];
        if ((va < 0) === (vb < 0)) continue;
        const t = va / (va - vb);
        const A = CORNER[a], B = CORNER[b];
        ax += A[0] + (B[0] - A[0]) * t; ay += A[1] + (B[1] - A[1]) * t; az += A[2] + (B[2] - A[2]) * t; n++;
      }
      if (nv * 3 + 3 > pos.length) { const p2 = new Float32Array(pos.length * 2); p2.set(pos); pos = p2; }
      pos[nv * 3] = ox + (i + ax / n) * h; pos[nv * 3 + 1] = oy + (j + ay / n) * h; pos[nv * 3 + 2] = oz + (k + az / n) * h;
      cellV[i + cx * (j + cy * k)] = nv++;
    }
  }
  let idx = new Uint32Array(8192), ni = 0;
  const P = (v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
  const d2 = (a, b) => { const A = P(a), B = P(b); return (A[0] - B[0]) ** 2 + (A[1] - B[1]) ** 2 + (A[2] - B[2]) ** 2; };
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) { const t = b; b = d; d = t; }
    if (ni + 6 > idx.length) { const i2 = new Uint32Array(idx.length * 2); i2.set(idx); idx = i2; }
    // split along the shorter diagonal
    if (d2(a, c) <= d2(b, d)) { idx[ni++] = a; idx[ni++] = b; idx[ni++] = c; idx[ni++] = a; idx[ni++] = c; idx[ni++] = d; }
    else { idx[ni++] = a; idx[ni++] = b; idx[ni++] = d; idx[ni++] = b; idx[ni++] = c; idx[ni++] = d; }
  };
  const cv = (i, j, k) => cellV[i + cx * (j + cy * k)];
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = i + nx * (j + ny * k);
    const in0 = f[p] < 0;
    if (i < cx && j > 0 && k > 0 && j < cy && k < cz && in0 !== (f[p + 1] < 0)) quad(cv(i, j - 1, k - 1), cv(i, j, k - 1), cv(i, j, k), cv(i, j - 1, k), !in0);
    if (j < cy && i > 0 && k > 0 && i < cx && k < cz && in0 !== (f[p + nx] < 0)) quad(cv(i - 1, j, k - 1), cv(i - 1, j, k), cv(i, j, k), cv(i, j, k - 1), !in0);
    if (k < cz && i > 0 && j > 0 && i < cx && j < cy && in0 !== (f[p + nx * ny] < 0)) quad(cv(i - 1, j - 1, k), cv(i, j - 1, k), cv(i, j, k), cv(i - 1, j, k), !in0);
  }
  return { pos: pos.subarray(0, nv * 3), idx: idx.subarray(0, ni), nv };
}

// ---------------------------------------------------------------- one group
function meshGroup(name, shapes, h, grids, opt) {
  h *= opt.hk ?? 1;
  const G = gridFor(shapes, h);
  for (const s of shapes) if (s.op === 'add') applyShape(G, s, false);
  for (const s of shapes) if (s.op === 'sub') applyShape(G, s, true);
  const M = surfaceNets(G);
  const nv = M.nv, pos = M.pos;
  const nrm = new Float32Array(nv * 3);
  const g = [0, 0, 0];
  // snap each vertex onto the iso-surface and take the field gradient as its normal
  for (let v = 0; v < nv; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let it = 0; it < 1; it++) {
      const fv = sampleGrid(G, x, y, z);
      gradGrid(G, x, y, z, g);
      const gl2 = g[0] * g[0] + g[1] * g[1] + g[2] * g[2];
      if (gl2 < 1e-12 || Math.abs(fv) > h) break;
      const s = (fv * h) / gl2; // gradient is per h (central difference over one voxel)
      x -= g[0] * s; y -= g[1] * s; z -= g[2] * s;
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    gradGrid(G, x, y, z, g);
    const l = Math.hypot(g[0], g[1], g[2]) || 1;
    nrm[v * 3] = g[0] / l; nrm[v * 3 + 1] = g[1] / l; nrm[v * 3 + 2] = g[2] / l;
  }
  grids[name] = G;
  return { name, G, pos, nrm, idx: M.idx, nv, opt };
}

// ---------------------------------------------------------------- weights + paint
// shapes are binned into coarse buckets so each vertex only looks at its neighbours
function bucketize(list, lo, hi, cell, margin) {
  const nx = Math.max(1, Math.ceil((hi[0] - lo[0]) / cell)), ny = Math.max(1, Math.ceil((hi[1] - lo[1]) / cell)), nz = Math.max(1, Math.ceil((hi[2] - lo[2]) / cell));
  const bins = Array.from({ length: nx * ny * nz }, () => []);
  for (const s of list) {
    const m = margin(s);
    const i0 = Math.max(0, Math.floor((s.lo[0] - m - lo[0]) / cell)), i1 = Math.min(nx - 1, Math.floor((s.hi[0] + m - lo[0]) / cell));
    const j0 = Math.max(0, Math.floor((s.lo[1] - m - lo[1]) / cell)), j1 = Math.min(ny - 1, Math.floor((s.hi[1] + m - lo[1]) / cell));
    const k0 = Math.max(0, Math.floor((s.lo[2] - m - lo[2]) / cell)), k1 = Math.min(nz - 1, Math.floor((s.hi[2] + m - lo[2]) / cell));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) bins[i + nx * (j + ny * k)].push(s);
  }
  return (x, y, z) => {
    const i = Math.min(nx - 1, Math.max(0, Math.floor((x - lo[0]) / cell))), j = Math.min(ny - 1, Math.max(0, Math.floor((y - lo[1]) / cell))), k = Math.min(nz - 1, Math.max(0, Math.floor((z - lo[2]) / cell)));
    return bins[i + nx * (j + ny * k)];
  };
}
function attrGroup(gr, shapes, bones, grids, pal) {
  const { pos, nrm, nv } = gr;
  const skinI = new Uint16Array(nv * 4), skinW = new Float32Array(nv * 4);
  const col = new Float32Array(nv * 3), mat = new Float32Array(nv * 4), ao = new Float32Array(nv);
  const G = gr.G, h = G.h;
  // per-shape falloffs
  const users = [];
  for (const s of shapes) {
    if (s.op === 'paint' || s.noAttr) continue;
    s._wf = s.op === 'add' && s.bw?.length ? (s.wf ?? (s.rad * 0.5 + s.k * 0.6 + h)) : 0;
    s._cf = s.col && (s.cp ?? 1) > 0 ? (s.cf === undefined ? Math.max(s.k * 0.4, h * 0.8) : s.cf < 0 ? -s.cf * h : s.cf) : 0;
    if (s._wf || s._cf) users.push(s);
  }
  const paints = shapes.filter((s) => s.op === 'paint');
  const lo = [G.ox, G.oy, G.oz], hi = [G.ox + G.nx * h, G.oy + G.ny * h, G.oz + G.nz * h];
  const near = bucketize(users, lo, hi, h * 6, (s) => Math.max(s._wf * 3, s._cf * 4));
  const nb = bones.length;
  const acc = new Float64Array(nb);
  const touched = [];
  const others = Object.values(grids);
  const belly = pal.belly ?? [1, 1, 1];
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const ny = nrm[v * 3 + 1];
    touched.length = 0;
    let cr = 0, cg = 0, cb = 0, cw = 0, m0 = 0, m1 = 0, m2 = 0, m3 = 0, bl = 0;
    for (const s of near(x, y, z)) {
      const wf = s._wf, cf = s._cf;
      const m = Math.max(wf * 3, cf * 4);
      if (x < s.lo[0] - m || x > s.hi[0] + m || y < s.lo[1] - m || y > s.hi[1] + m || z < s.lo[2] - m || z > s.hi[2] + m) continue;
      const d = shapeDist(s, x, y, z);
      // ---- bone weights
      if (wf) {
        const w = d <= 0 ? 1 : Math.exp(-d / wf);
        if (w > 1e-4) {
          const bw = s.bw;
          if (bw.length === 1) { const b = bw[0][0]; if (acc[b] === 0) touched.push(b); acc[b] += w; }
          else {
            const A = s.axis[0], B = s.axis[1];
            const ex = B[0] - A[0], ey = B[1] - A[1], ez = B[2] - A[2];
            let t = ((x - A[0]) * ex + (y - A[1]) * ey + (z - A[2]) * ez) / Math.max(1e-10, ex * ex + ey * ey + ez * ez);
            t = Math.min(1, Math.max(0, t));
            let i = 0; while (i < bw.length - 2 && t > bw[i + 1][1]) i++;
            const t0 = bw[i][1], t1 = bw[i + 1][1];
            let u = t1 > t0 ? (t - t0) / (t1 - t0) : 0; u = Math.min(1, Math.max(0, u));
            u = u * u * (3 - 2 * u);
            const b0 = bw[i][0], b1 = bw[i + 1][0];
            if (acc[b0] === 0) touched.push(b0); acc[b0] += w * (1 - u);
            if (acc[b1] === 0) touched.push(b1); acc[b1] += w * u;
          }
        }
      }
      // ---- colour + material
      if (cf) {
        const w = Math.exp(-Math.abs(d) / cf) * (s.cp ?? 1);
        if (w > 1e-5) {
          const c = s.col;
          cr += c[0] * w; cg += c[1] * w; cb += c[2] * w;
          const mt = s.mat;
          m0 += mt[0] * w; m1 += mt[1] * w; m2 += mt[2] * w; m3 += mt[3] * w;
          bl += (s.belly ?? 0) * w;
          cw += w;
        }
      }
    }
    // top four bones
    if (touched.length > 1) touched.sort((a, b) => acc[b] - acc[a]);
    let tot = 0;
    for (let q = 0; q < 4 && q < touched.length; q++) tot += acc[touched[q]];
    if (!touched.length) skinW[v * 4] = 1;
    else for (let q = 0; q < 4 && q < touched.length; q++) { skinI[v * 4 + q] = touched[q]; skinW[v * 4 + q] = acc[touched[q]] / tot; }
    for (const b of touched) acc[b] = 0;
    if (cw > 0) { cr /= cw; cg /= cw; cb /= cw; m0 /= cw; m1 /= cw; m2 /= cw; m3 /= cw; bl /= cw; }
    else { cr = cg = cb = 0.5; }
    // countershading: lighter underneath
    if (bl > 0) {
      const k = bl * Math.min(1, Math.max(0, (0.1 - ny) / 0.7)) ** 1.3;
      cr += (belly[0] - cr) * k; cg += (belly[1] - cg) * k; cb += (belly[2] - cb) * k;
    }
    // colour-only shapes (masks, socks, muzzles, eye patches)
    for (const s of paints) {
      if (x < s.lo[0] || x > s.hi[0] || y < s.lo[1] || y > s.hi[1] || z < s.lo[2] || z > s.hi[2]) continue;
      const soft = s.cf === undefined ? h : s.cf < 0 ? -s.cf * h : s.cf;
      const d = noisyDist(s, x, y, z);
      const w = Math.min(1, Math.max(0, 0.5 - d / (2 * soft))) * (s.cp ?? 1);
      if (w <= 0) continue;
      const c = s.col;
      cr += (c[0] - cr) * w; cg += (c[1] - cg) * w; cb += (c[2] - cb) * w;
      if (s.mat) { m0 += (s.mat[0] - m0) * w; m1 += (s.mat[1] - m1) * w; m2 += (s.mat[2] - m2) * w; m3 += (s.mat[3] - m3) * w; }
    }
    col[v * 3] = cr; col[v * 3 + 1] = cg; col[v * 3 + 2] = cb;
    mat[v * 4] = m0; mat[v * 4 + 1] = m1; mat[v * 4 + 2] = m2; mat[v * 4 + 3] = m3;
    // ---- ambient occlusion from every group's field
    let occ = 0;
    const nx = nrm[v * 3], nz = nrm[v * 3 + 2];
    for (let q = 1; q <= 3; q++) {
      const dd = h * 1.6 * q * q;
      const px = x + nx * dd, py = y + ny * dd, pz = z + nz * dd;
      let fmin = BIG;
      for (const O of others) { const fv = sampleGrid(O, px, py, pz); if (fv < fmin) fmin = fv; }
      if (fmin >= BIG) fmin = dd;
      occ += Math.max(0, dd - fmin) / dd / q;
    }
    ao[v] = Math.max(0.25, 1 - occ * 0.75);
  }
  return { skinI, skinW, col, mat, ao };
}

// drop triangles of a group that sit well inside another group (body under wool)
function cullHidden(gr, grids, hideIn) {
  if (!hideIn?.length) return;
  const { pos, idx } = gr;
  const inside = new Uint8Array(gr.nv);
  for (let v = 0; v < gr.nv; v++) {
    for (const n of hideIn) {
      const O = grids[n];
      if (!O) continue;
      if (sampleGrid(O, pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]) < -O.h * 1.6) { inside[v] = 1; break; }
    }
  }
  const out = new Uint32Array(idx.length);
  let n = 0;
  for (let i = 0; i < idx.length; i += 3) {
    if (inside[idx[i]] && inside[idx[i + 1]] && inside[idx[i + 2]]) continue;
    out[n++] = idx[i]; out[n++] = idx[i + 1]; out[n++] = idx[i + 2];
  }
  gr.idx = out.subarray(0, n);
}

// ---------------------------------------------------------------- whole creature
// design: { groups: { name: { shapes, hideIn? } }, bones: [...], h, pal }
// returns merged typed arrays ready for a BufferGeometry
export function sculpt(design) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const h = design.h;
  const grids = {};
  const out = [];
  const entries = Object.entries(design.groups).filter(([, g]) => g.shapes.some((s) => s.op === 'add'));
  for (const [name, g] of entries) out.push(meshGroup(name, g.shapes, h, grids, g));
  for (const gr of out) cullHidden(gr, grids, gr.opt.hideIn);
  let nv = 0, ni = 0;
  const parts = out.map((gr) => { const a = attrGroup(gr, design.groups[gr.name].shapes, design.bones, grids, design.pal); nv += gr.nv; ni += gr.idx.length; return { gr, a }; });
  const R = { pos: new Float32Array(nv * 3), nrm: new Float32Array(nv * 3), col: new Float32Array(nv * 3), mat: new Float32Array(nv * 4), ao: new Float32Array(nv), skinI: new Uint16Array(nv * 4), skinW: new Float32Array(nv * 4), idx: new Uint32Array(ni), groups: [] };
  let vo = 0, io = 0;
  for (const { gr, a } of parts) {
    R.pos.set(gr.pos, vo * 3); R.nrm.set(gr.nrm, vo * 3); R.col.set(a.col, vo * 3); R.mat.set(a.mat, vo * 4); R.ao.set(a.ao, vo); R.skinI.set(a.skinI, vo * 4); R.skinW.set(a.skinW, vo * 4);
    for (let i = 0; i < gr.idx.length; i++) R.idx[io + i] = gr.idx[i] + vo;
    R.groups.push({ name: gr.name, start: io, count: gr.idx.length, v0: vo, nv: gr.nv });
    vo += gr.nv; io += gr.idx.length;
  }
  R.ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  R.nv = nv; R.nt = ni / 3;
  // the main group's field stays around for measuring (back height, feet)
  R.grids = grids;
  return R;
}
