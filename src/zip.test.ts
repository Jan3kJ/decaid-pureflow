import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// scripts/zip.mjs's checks of the two ZIPs, on fixture trees written to a temporary folder: what
// Decaid needs of both, what only the ocr ZIP may hold, and their sizes.

interface Flavour {
  name: string;
  dist: string;
  suffix: string;
  maxBytes: number;
}
interface Model {
  name: string;
  sha256?: string;
}
type Tree = Record<string, Buffer>;
interface Zip {
  readTree(dir: string): Tree;
  checkTree(files: Tree, flavour: Flavour, options?: { models?: Model[] }): { problems: string[]; zip: Uint8Array };
  checkPair(trees: Tree[]): string[];
}
interface Flavours {
  FLAVOURS: Flavour[];
  OCR_DESCRIPTION: string;
  zipName(id: string, version: string, flavour: Flavour): string;
}

const SCRIPTS = join(import.meta.dirname, '..', 'scripts');
let zip: Zip;
let flavours: Flavours;
let base: Flavour;
let ocr: Flavour;

beforeAll(async () => {
  zip = (await import(pathToFileURL(join(SCRIPTS, 'zip.mjs')).href)) as Zip;
  flavours = (await import(pathToFileURL(join(SCRIPTS, 'flavours.mjs')).href)) as Flavours;
  [base, ocr] = flavours.FLAVOURS;
});

const MODEL_BYTES = Buffer.from('a model, as a fixture');
const MODELS: Model[] = [
  { name: 'det.tar', sha256: createHash('sha256').update(MODEL_BYTES).digest('hex') },
  { name: 'rec.tar', sha256: createHash('sha256').update(MODEL_BYTES).digest('hex') },
];
const DESCRIPTION = 'A skin.';

const manifest = (description = DESCRIPTION, version = '0.9.0') =>
  `${JSON.stringify({ id: 'pureflow', name: 'pureflow', description, version })}\n`;

const html = '<!doctype html>\n<head><script type="module" src="./assets/index-a1.js"></script></head>\n';

function baseTree(): Record<string, string | Buffer> {
  return { 'index.html': html, 'manifest.json': manifest(), 'assets/index-a1.js': 'console.log(1);\n' };
}

function ocrTree(): Record<string, string | Buffer> {
  return {
    ...baseTree(),
    'manifest.json': manifest(DESCRIPTION + ' With bag reading.'),
    'assets/read-b2.js': 'export {};\n',
    NOTICE: 'pureflow\n\n6. det.tar, rec.tar: Apache-2.0\n',
    'ocr/det.tar': MODEL_BYTES,
    'ocr/rec.tar': MODEL_BYTES,
  };
}

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** The tree written to a folder and read back as zip.mjs reads a build. */
function written(files: Record<string, string | Buffer>): Tree {
  const root = mkdtempSync(join(tmpdir(), 'zip-tree-'));
  folders.push(root);
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return zip.readTree(root);
}

const problems = (files: Record<string, string | Buffer>, flavour: Flavour) =>
  zip.checkTree(written(files), flavour, { models: MODELS }).problems;

describe('zip.mjs: the two ZIPs', () => {
  it('names them <id>-<version>.zip and <id>-<version>-ocr.zip, from dist/ and dist-ocr/', () => {
    expect(flavours.FLAVOURS.map((flavour) => [flavour.dist, flavours.zipName('pureflow', '0.9.0', flavour)])).toEqual([
      ['dist', 'pureflow-0.9.0.zip'],
      ['dist-ocr', 'pureflow-0.9.0-ocr.zip'],
    ]);
    expect([base.maxBytes, ocr.maxBytes]).toEqual([1_000_000, 16_000_000]);
    expect(flavours.OCR_DESCRIPTION).toBe(' With bag reading.');
  });

  it('passes a good base tree and a good ocr tree', () => {
    expect(problems(baseTree(), base)).toEqual([]);
    expect(problems(ocrTree(), ocr)).toEqual([]);
  });

  it('fails a base tree with an .onnx, a .wasm, an ocr/ folder, the reader or a runtime named in a script', () => {
    expect(problems({ ...baseTree(), 'assets/model.onnx': MODEL_BYTES }, base)).toEqual([
      'assets/model.onnx: the base ZIP has no .onnx or .wasm file',
    ]);
    expect(problems({ ...baseTree(), 'assets/ort.wasm': MODEL_BYTES }, base)).toHaveLength(1);
    expect(problems({ ...baseTree(), 'ocr/det.tar': MODEL_BYTES }, base)).toEqual(['ocr/det.tar: the base ZIP has no ocr/ folder']);
    expect(problems({ ...baseTree(), 'assets/read-b2.js': '' }, base)).toEqual([
      "assets/read-b2.js: the bag's reader is not in the base build",
    ]);
    expect(problems({ ...baseTree(), 'assets/index-a1.js': 'import("onnxruntime-web")' }, base)).toEqual([
      "assets/index-a1.js: the base ZIP's scripts name onnxruntime",
    ]);
    expect(problems({ ...baseTree(), 'assets/index-a1.js': 'new PaddleOCR()' }, base)).toHaveLength(1);
  });

  it('fails an ocr tree without the models, with a wrong model, without the reader, its NOTICE or its description', () => {
    const { 'ocr/det.tar': _det, 'ocr/rec.tar': _rec, ...noModels } = ocrTree();
    expect([_det, _rec]).toEqual([MODEL_BYTES, MODEL_BYTES]);
    expect(problems(noModels, ocr)).toEqual(['ocr/det.tar: the model is missing', 'ocr/rec.tar: the model is missing']);
    expect(problems({ ...ocrTree(), 'ocr/rec.tar': 'changed' }, ocr)).toEqual(['ocr/rec.tar: not the pinned SHA-256']);
    const { 'assets/read-b2.js': _reader, ...noReader } = ocrTree();
    expect(_reader).toBeDefined();
    expect(problems(noReader, ocr)).toEqual(["assets/read-*.js: the bag's reader is missing"]);
    expect(problems({ ...ocrTree(), NOTICE: 'pureflow\n' }, ocr)).toHaveLength(1);
    expect(problems({ ...ocrTree(), 'manifest.json': manifest() }, ocr)).toEqual([
      "manifest.json: the description does not end with 'With bag reading.'",
    ]);
  });

  it('fails what Decaid cannot install, in either flavour', () => {
    for (const [tree, flavour] of [
      [baseTree(), base],
      [ocrTree(), ocr],
    ] as const) {
      expect(problems({ ...tree, 'index.html': html.replace('./assets', '/assets') }, flavour)).toEqual([
        'index.html: /assets/index-a1.js is not a relative path',
      ]);
      expect(problems({ ...tree, 'assets/index-a1.js.map': '{}' }, flavour)).toHaveLength(1);
    }
  });

  it('fails a ZIP over its size: the base one from 1 MB, the ocr one from 16 MB', () => {
    const noise = randomBytes(1_100_000);
    expect(problems({ ...baseTree(), 'assets/big.png': noise }, base)).toEqual([
      expect.stringMatching(/^the base ZIP is \d+ bytes, not under 1000000$/),
    ]);
    expect(problems({ ...ocrTree(), 'assets/big.png': noise }, ocr)).toEqual([]);
  });

  it('wants the same id and version in both manifests', () => {
    const tree = (version: string) => ({ 'manifest.json': Buffer.from(manifest(DESCRIPTION, version)) });
    expect(zip.checkPair([tree('0.9.0'), tree('0.9.0')])).toEqual([]);
    expect(zip.checkPair([tree('0.9.0'), tree('0.8.0')])).toHaveLength(1);
  });
});
