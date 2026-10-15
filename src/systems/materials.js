// Where crafting, building and repairs draw materials from: your pockets, then
// any storage crates within reach of you, then the van rack when you are near
// the van. Taking is all-or-nothing across all of them.
export function sourcesNear(g) {
  const out = [g.inventory];
  const p = g.local?.pos;
  if (!p) return out;
  for (const s of g.structures?.list?.values?.() ?? []) {
    if (!s.inv || s.def?.accept) continue;
    if ((s.x - p.x) ** 2 + (s.z - p.z) ** 2 < 8 * 8 && Math.abs(s.y - p.y) < 4) out.push(s.inv);
  }
  if (g.van?.storage && g.van.pos && g.van.pos.distanceTo(p) < 10) out.push(g.van.storage);
  return out;
}
export function makeMaterials(g) {
  const M = {
    sources: () => sourcesNear(g),
    count(id) { let n = 0; for (const inv of M.sources()) n += inv.count(id); return n; },
    has(req) { for (const [id, n] of Object.entries(req ?? {})) if (M.count(id) < n) return false; return true; },
    take(req) {
      if (!M.has(req)) return false;
      const src = M.sources();
      for (const [id, need] of Object.entries(req ?? {})) {
        let left = need;
        for (const inv of src) { if (left <= 0) break; const k = Math.min(left, inv.count(id)); if (k > 0) { inv.remove(id, k, true); left -= k; } }
      }
      for (const inv of src) inv.changed();
      return true;
    },
    // where a crafted thing goes when your pockets are full: the van rack or a crate, then the ground
    stash(id, n) {
      let left = g.inventory.add(id, n);
      for (const inv of M.sources().slice(1)) { if (left <= 0) break; left = inv.add(id, left); }
      return left;
    },
  };
  return M;
}
export async function install(g) { g.materials = makeMaterials(g); }
