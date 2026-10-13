// Runs the island generator off the main thread and transfers the buffers back.
import { generateWorld } from './gen.js';

self.onmessage = (e) => {
  const { seed } = e.data;
  const w = generateWorld(seed, (p, msg) => self.postMessage({ type: 'progress', p, msg }));
  const { height, splat, biome, water, ...meta } = w;
  self.postMessage({ type: 'done', meta, height, splat, biome, water }, [height.buffer, splat.buffer, biome.buffer, water.buffer]);
};
