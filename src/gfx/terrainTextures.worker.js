// Paints the ground textures off the main thread while the island loads.
import { paintTerrainData } from './terrainTextures.js';

self.onmessage = () => {
  const d = paintTerrainData();
  self.postMessage(d, [d.albedo.buffer, d.normal.buffer, d.detail.buffer]);
};
