// Loads the island: from the IndexedDB cache when available, otherwise
// generated in a worker (falls back to the main thread).
import { generateWorld } from './gen.js';

export const GEN_VERSION = 9;
const DB = 'prehistoric-cache';

function openDB() {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore('worlds');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function cacheGet(key) {
  try {
    const db = await openDB();
    return await new Promise((res) => {
      const tx = db.transaction('worlds', 'readonly');
      const q = tx.objectStore('worlds').get(key);
      q.onsuccess = () => res(q.result || null);
      q.onerror = () => res(null);
    });
  } catch { return null; }
}
async function cachePut(key, val) {
  try {
    const db = await openDB();
    await new Promise((res) => {
      const tx = db.transaction('worlds', 'readwrite');
      tx.objectStore('worlds').put(val, key);
      tx.oncomplete = res; tx.onerror = res;
    });
  } catch { /* storage may be unavailable (private mode) */ }
}

export async function loadWorld(seed, onProgress = () => {}) {
  const key = `${seed}:v${GEN_VERSION}`;
  const cached = await cacheGet(key);
  if (cached && cached.height && cached.meta) {
    onProgress(1, 'Unpacking cached island');
    return { ...cached.meta, height: cached.height, splat: cached.splat, biome: cached.biome, water: cached.water };
  }
  let world;
  try {
    world = await new Promise((res, rej) => {
      const wk = new Worker(new URL('./worldgen.worker.js', import.meta.url), { type: 'module' });
      wk.onmessage = (e) => {
        if (e.data.type === 'progress') onProgress(e.data.p, e.data.msg);
        else if (e.data.type === 'done') { wk.terminate(); res({ ...e.data.meta, height: e.data.height, splat: e.data.splat, biome: e.data.biome, water: e.data.water }); }
      };
      wk.onerror = (err) => { wk.terminate(); rej(err); };
      wk.postMessage({ seed });
    });
  } catch (e) {
    console.warn('worker generation failed, generating on main thread', e);
    world = generateWorld(seed, onProgress);
  }
  const { height, splat, biome, water, ...meta } = world;
  // store copies (structured clone) so the live arrays stay usable
  cachePut(key, { meta, height, splat, biome, water });
  return world;
}
