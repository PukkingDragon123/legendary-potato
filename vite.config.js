import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { host: true, port: 5173, hmr: { overlay: false } },
  build: { target: 'es2022', chunkSizeWarningLimit: 4000, assetsInlineLimit: 0 },
  worker: { format: 'es' },
});
