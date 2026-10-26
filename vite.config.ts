import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// Decaid serves skins from ports 24800 and up; 3000, 4001 and 8080 are never used.
const PORT = 24800;

export default defineConfig({
  // Relative asset paths, so the build works from any path the gateway serves it on.
  base: './',
  plugins: [svelte()],
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['src/**/*.test.ts'] },
});
