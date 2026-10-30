import { copyFileSync, createReadStream, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { CACHE, MODELS, NOTICE_SECTION, fetchModels } from './scripts/fetch-ocr-models.mjs';
import { FLAVOURS, OCR_DESCRIPTION } from './scripts/flavours.mjs';

// Decaid serves skins from ports 24800 and up; 3000, 4001 and 8080 are never used.
const PORT = 24800;

/**
 * The ocr flavour's files beside the code: the models in `ocr/` (fetched by their pinned hash
 * before the build starts), the manifest's description and the copy of NOTICE with the reading's
 * licences. In the dev server the models are served from the cache under the same path.
 */
function ocrFiles(): Plugin {
  let root = '';
  let outDir = '';
  return {
    name: 'pureflow-ocr-files',
    configResolved(config) {
      root = config.root;
      outDir = resolve(root, config.build.outDir);
    },
    async buildStart() {
      try {
        await fetchModels();
      } catch (error) {
        this.error(`the ocr build stopped: ${(error as Error).message}`);
      }
    },
    configureServer(server) {
      server.middlewares.use('/ocr', (request, response, next) => {
        const model = MODELS.find((entry) => request.url === `/${entry.name}`);
        if (!model) return next();
        fetchModels().then(
          () => createReadStream(join(CACHE, model.name)).pipe(response),
          (error: Error) => {
            response.statusCode = 503;
            response.end(error.message);
          },
        );
      });
    },
    writeBundle() {
      mkdirSync(join(outDir, 'ocr'), { recursive: true });
      for (const model of MODELS) copyFileSync(join(CACHE, model.name), join(outDir, 'ocr', model.name));
      const manifestPath = join(outDir, 'manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { description: string };
      manifest.description += OCR_DESCRIPTION;
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      writeFileSync(join(outDir, 'NOTICE'), readFileSync(join(root, 'NOTICE'), 'utf8').trimEnd() + NOTICE_SECTION);
    },
  };
}

// Two flavours of one source: `vite` and `vite build` make the base one into dist/, `--mode ocr` the
// one that also reads the bean bag into dist-ocr/. `__OCR__` is a build constant, so the base
// build leaves out the reader and everything it imports.
export default defineConfig(({ mode }) => {
  const ocr = mode === 'ocr';
  const flavour = FLAVOURS[ocr ? 1 : 0];
  return {
    // Relative asset paths, so the build works from any path the gateway serves it on.
    base: './',
    plugins: [svelte(), ...(ocr ? [ocrFiles()] : [])],
    define: { __OCR__: JSON.stringify(ocr) },
    server: { port: PORT, strictPort: true },
    preview: { port: PORT, strictPort: true },
    build: { outDir: flavour.dist, emptyOutDir: true },
    test: { include: ['src/**/*.test.ts'] },
  };
});
