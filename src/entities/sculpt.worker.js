// Sculpts creature species off the main thread and hands the meshes back.
import { sculptSpecies, transferables } from './creatureSculpt.js';

self.onmessage = (e) => {
  const { id, sp } = e.data;
  try {
    const D = sculptSpecies(sp);
    self.postMessage({ id, D }, transferables(D));
  } catch (err) {
    self.postMessage({ id, error: String(err?.stack ?? err) });
  }
};
