import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Decaid serves skins from ports 24800 and up; 3000, 4001 and 8080 are never used.
const PORT = 24800;

const require = createRequire(import.meta.url);
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));

// The bean photo's reader (src/beans/ocr.ts): Tesseract.js's worker, its three LSTM cores (it
// picks one by the device's SIMD support) and the English data, served from `ocr/` in
// development and copied there in the build, so nothing is fetched from the network.
const OCR_FILES: Record<string, string> = {
  'worker.min.js': join(packageDir('tesseract.js'), 'dist', 'worker.min.js'),
  'worker.min.js.LICENSE.txt': join(packageDir('tesseract.js'), 'dist', 'worker.min.js.LICENSE.txt'),
  'LICENSE-tesseract.js.md': join(packageDir('tesseract.js'), 'LICENSE.md'),
  'LICENSE-tesseract.js-core.txt': join(packageDir('tesseract.js-core'), 'LICENSE'),
  'tesseract-core-lstm.wasm.js': join(packageDir('tesseract.js-core'), 'tesseract-core-lstm.wasm.js'),
  'tesseract-core-simd-lstm.wasm.js': join(packageDir('tesseract.js-core'), 'tesseract-core-simd-lstm.wasm.js'),
  'tesseract-core-relaxedsimd-lstm.wasm.js': join(packageDir('tesseract.js-core'), 'tesseract-core-relaxedsimd-lstm.wasm.js'),
  'eng.traineddata.gz': join(packageDir('@tesseract.js-data/eng'), '4.0.0_best_int', 'eng.traineddata.gz'),
};

function ocrFiles(): Plugin {
  return {
    name: 'pureflow-ocr-files',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = /\/ocr\/([^/?#]+)/.exec(request.url ?? '');
        const file = match && OCR_FILES[match[1]];
        if (!file) return next();
        response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        response.end(readFileSync(file));
      });
    },
    generateBundle() {
      for (const [name, file] of Object.entries(OCR_FILES)) {
        this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: readFileSync(file) });
      }
    },
  };
}

export default defineConfig({
  // Relative asset paths, so the build works from any path the gateway serves it on.
  base: './',
  plugins: [svelte(), ocrFiles()],
  server: { port: PORT, strictPort: true },
  preview: { port: PORT, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: { include: ['src/**/*.test.ts'] },
});
