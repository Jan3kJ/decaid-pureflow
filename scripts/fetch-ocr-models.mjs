// `node scripts/fetch-ocr-models.mjs`: the two model archives of the ocr build, the text detector
// and the text recogniser of PP-OCRv6 tiny, downloaded once into the git-ignored `.cache/ocr/` and
// checked against the SHA-256 pinned here. The archives are uncompressed ustar files, the format
// PaddleOCR.js loads; they are never committed. A file in the cache with the wrong hash is fetched
// again; a download with the wrong hash, or no network and no cache, stops with a message.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HOST = 'https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0';

/** The models: the file name in `.cache/ocr/` and in the ocr build's `ocr/`, where it comes from, its SHA-256. */
export const MODELS = [
  {
    name: 'PP-OCRv6_tiny_det_onnx_infer.tar',
    url: `${HOST}/PP-OCRv6_tiny_det_onnx_infer.tar`,
    sha256: 'ff6ab415b0a6e0c488550f2fb5d5046f1719848df220b2dc21b56402a65bc05d',
  },
  {
    name: 'PP-OCRv6_tiny_rec_onnx_infer.tar',
    url: `${HOST}/PP-OCRv6_tiny_rec_onnx_infer.tar`,
    sha256: '1e13b22717b1edd89d4cde4fda272b6c17d5b505c97c2baea99da1a3a2d54b29',
  },
];

export const CACHE = fileURLToPath(new URL('../.cache/ocr/', import.meta.url));

/**
 * The packages the ocr build bundles for the reading, with the licence each names in its
 * package.json and the licence's full name; src/licence.test.ts checks both against node_modules.
 */
export const OCR_PACKAGES = [
  {
    name: '@paddleocr/paddleocr-js',
    licence: 'Apache-2.0',
    by: 'PaddlePaddle Authors',
    url: 'https://github.com/PaddlePaddle/PaddleOCR',
  },
  {
    name: '@techstark/opencv-js',
    licence: 'Apache-2.0',
    by: 'OpenCV team; packaged by TechStark',
    url: 'https://github.com/TechStark/opencv-js',
  },
  { name: 'onnxruntime-web', licence: 'MIT', by: 'Microsoft Corporation', url: 'https://github.com/microsoft/onnxruntime' },
  { name: 'js-yaml', licence: 'MIT', by: 'Vladimir Zapparov and contributors', url: 'https://github.com/nodeca/js-yaml' },
  { name: 'clipper-lib', licence: 'BSL', by: 'Angus Johnson; JavaScript by Timo', url: 'https://github.com/junmer/clipper-lib' },
];

/** The licences the reading's parts may carry: their full names, by the name a package.json gives. */
export const OCR_LICENCES = {
  'Apache-2.0': 'Apache License, Version 2.0 (Apache-2.0), https://www.apache.org/licenses/LICENSE-2.0',
  MIT: 'MIT License (MIT), https://opensource.org/license/mit',
  BSL: 'Boost Software License 1.0 (BSL-1.0), https://www.boost.org/LICENSE_1_0.txt',
};

/** The section the ocr ZIP's copy of NOTICE adds: the licences of what only that ZIP holds. */
export const NOTICE_SECTION = `

6. The bag's reading (only in the ZIP with bag reading)

   The ZIP whose name ends in -ocr holds these files in its ocr/ folder,
   which the ZIP without the reading does not:

     ${MODELS.map((model) => model.name).join('\n     ')}

   PP-OCRv6 tiny, the text detector and the text recogniser of PaddleOCR
   by PaddlePaddle (https://github.com/PaddlePaddle/PaddleOCR), as the ONNX
   archives PaddlePaddle publishes. Copyright (c) PaddlePaddle Authors.
   Licensed under the Apache License, Version 2.0 (Apache-2.0),
   https://www.apache.org/licenses/LICENSE-2.0

   Its scripts and assets/ hold the code that reads them, bundled from
   these packages (ONNX Runtime's WebAssembly file among them):

${OCR_PACKAGES.map((entry) => `     ${entry.name}, ${entry.by}, ${entry.url}\n       ${OCR_LICENCES[entry.licence]}`).join('\n')}
`;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * Makes sure each model is in `cache` with its pinned hash, downloading what is missing or wrong.
 * Returns the paths; throws an Error whose message says what is wrong and what to do.
 */
export async function fetchModels({ cache = CACHE, models = MODELS, fetch = globalThis.fetch, log = console.log } = {}) {
  mkdirSync(cache, { recursive: true });
  const paths = [];
  for (const model of models) {
    const path = join(cache, model.name);
    if (existsSync(path) && sha256(readFileSync(path)) === model.sha256) {
      paths.push(path);
      continue;
    }
    log(`fetching ${model.url}`);
    let bytes;
    try {
      const response = await fetch(model.url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new Error(
        `the ocr build needs ${model.name} and could not download it from ${model.url} (${error.message}); ` +
          'connect to the network and run node scripts/fetch-ocr-models.mjs, or build only the base flavour with npm run build:base',
        { cause: error },
      );
    }
    const actual = sha256(bytes);
    if (actual !== model.sha256) {
      throw new Error(
        `${model.url} has the SHA-256 ${actual}, not the pinned ${model.sha256}: the file changed at its host. ` +
          'Nothing was kept; check the new file before the pin in scripts/fetch-ocr-models.mjs is changed',
      );
    }
    // Written beside and renamed, so an interrupted download never leaves a partial file under the name.
    writeFileSync(`${path}.part`, bytes);
    rmSync(path, { force: true });
    renameSync(`${path}.part`, path);
    paths.push(path);
  }
  return paths;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const paths = await fetchModels();
    console.log(`fetch-ocr-models: ${paths.length} models in .cache/ocr/, each with its pinned SHA-256`);
  } catch (error) {
    console.error(`fetch-ocr-models: ${error.message}`);
    process.exit(1);
  }
}
