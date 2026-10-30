// Writes the two ZIPs of a release from the two builds, with index.html at each ZIP's root:
// release/<id>-<version>.zip from dist/ (base) and release/<id>-<version>-ocr.zip from dist-ocr/
// (ocr). Each is checked before it is written; a problem in either writes neither. With `--check`
// (npm run verify) both are checked and nothing is written.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import { MODELS } from './fetch-ocr-models.mjs';
import { FLAVOURS, OCR_DESCRIPTION, zipName } from './flavours.mjs';

/** A build folder's files as { 'path/with/slashes': Buffer }. */
export function readTree(dir) {
  const files = {};
  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    // ZIP entry names use forward slashes on every platform.
    files[relative(dir, path).split(sep).join('/')] = readFileSync(path);
  }
  return files;
}

/** The manifest of a tree, or an empty object when it has none or it is not JSON. */
const manifestOf = (files) => {
  try {
    return JSON.parse(files['manifest.json'].toString('utf8'));
  } catch {
    return {};
  }
};

/** What Decaid needs of a skin's ZIP (doc/Skins.md), the same for both flavours. */
function skinProblems(files) {
  const names = Object.keys(files);
  const problems = [];
  if (!files['index.html']) return ['index.html is missing at the root'];
  if (!files['manifest.json']) return ['manifest.json is missing at the root'];
  const html = files['index.html'].toString('utf8');
  const { id, version } = manifestOf(files);
  // The id becomes a folder name under Decaid's web-ui/: one safe path component.
  if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.endsWith('.')) {
    problems.push(`manifest.json: the id ${JSON.stringify(id)} is not one safe path component`);
  }
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
    problems.push(`manifest.json: ${JSON.stringify(version)} is not a version`);
  }
  // Decaid counts its insert before </head> without CRs: a CR moves it into an earlier tag.
  if (html.includes('\r')) problems.push('index.html: CRLF line endings; Decaid would insert its token in the wrong place');
  // The skin is served from a port of its own, but a relative path works from any path.
  for (const [, url] of html.matchAll(/(?:src|href)="([^"]*)"/g)) {
    if (!url.startsWith('./')) problems.push(`index.html: ${url} is not a relative path`);
    else if (!names.includes(url.slice(2))) problems.push(`index.html: ${url} is not in the ZIP`);
  }
  for (const name of names) {
    if (/\.map$|\.(test|spec)\.|(^|\/)(e2e|src|node_modules)\//.test(name)) {
      problems.push(`${name}: a source map, a test or a source file`);
    }
  }
  return problems;
}

/** The reader's code chunk: Vite names a dynamically imported module's chunk after its file. */
const READER_CHUNK = /^assets\/read-[\w-]+\.js$/;

/** What only one flavour may hold. `models` are the ocr ZIP's model files, by name and SHA-256. */
function flavourProblems(files, flavour, models) {
  const names = Object.keys(files);
  const problems = [];
  if (flavour.name === 'base') {
    for (const name of names) {
      if (name.startsWith('ocr/')) problems.push(`${name}: the base ZIP has no ocr/ folder`);
      if (/\.(onnx|wasm)$/i.test(name)) problems.push(`${name}: the base ZIP has no .onnx or .wasm file`);
      if (READER_CHUNK.test(name)) problems.push(`${name}: the bag's reader is not in the base build`);
      if (/\.(js|mjs|html)$/.test(name)) {
        const found = /paddleocr|onnxruntime/i.exec(files[name].toString('utf8'));
        if (found) problems.push(`${name}: the base ZIP's scripts name ${found[0]}`);
      }
    }
    if (/PP-OCR/.test(files['NOTICE']?.toString('utf8') ?? '')) {
      problems.push("NOTICE: the base ZIP's copy names the reading's parts");
    }
  } else {
    if (!names.some((name) => READER_CHUNK.test(name))) problems.push("assets/read-*.js: the bag's reader is missing");
    for (const model of models) {
      const bytes = files[`ocr/${model.name}`];
      if (!bytes) problems.push(`ocr/${model.name}: the model is missing`);
      else if (model.sha256 && sha256(bytes) !== model.sha256) problems.push(`ocr/${model.name}: not the pinned SHA-256`);
    }
    const notice = files['NOTICE']?.toString('utf8') ?? '';
    if (!notice.includes('Apache-2.0') || !models.every((model) => notice.includes(model.name))) {
      problems.push("NOTICE: the ocr ZIP's copy does not name the models and their licence, Apache-2.0");
    }
    const { description } = manifestOf(files);
    if (typeof description !== 'string' || !description.endsWith(OCR_DESCRIPTION)) {
      problems.push(`manifest.json: the description does not end with '${OCR_DESCRIPTION.trim()}'`);
    }
  }
  return problems;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Checks a tree of one flavour and makes its ZIP. Returns { problems, zip }: the problems of the
 * tree and of the ZIP's size, each a line naming the file; none when it may be written.
 */
export function checkTree(files, flavour, { models = MODELS } = {}) {
  const problems = [...skinProblems(files), ...flavourProblems(files, flavour, models)];
  const zip = zipSync(files, { level: 9 });
  if (zip.length >= flavour.maxBytes) {
    problems.push(`the ${flavour.name} ZIP is ${zip.length} bytes, not under ${flavour.maxBytes}`);
  }
  return { problems, zip };
}

/** The two flavours together: the same id and version in both manifests. */
export function checkPair(trees) {
  const [base, ocr] = trees.map(manifestOf);
  if (base.id === ocr.id && base.version === ocr.version) return [];
  return [`manifest.json: base has ${base.id} ${base.version}, ocr ${ocr.id} ${ocr.version}; both need the same id and version`];
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const outDir = join(root, 'release');
  const missing = FLAVOURS.filter((flavour) => !existsSync(join(root, flavour.dist, 'index.html')));
  if (missing.length > 0) {
    console.error(`${missing.map((flavour) => `${flavour.dist}/index.html`).join(', ')} missing; run \`npm run build\` first.`);
    process.exit(1);
  }
  const trees = FLAVOURS.map((flavour) => readTree(join(root, flavour.dist)));
  const results = FLAVOURS.map((flavour, index) => checkTree(trees[index], flavour));
  const problems = [
    ...results.flatMap(({ problems: found }, index) => found.map((line) => `${FLAVOURS[index].dist}: ${line}`)),
    ...checkPair(trees),
  ];
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  const { id, version } = manifestOf(trees[0]);
  const write = !process.argv.includes('--check');
  if (write) mkdirSync(outDir, { recursive: true });
  FLAVOURS.forEach((flavour, index) => {
    const out = join(outDir, zipName(id, version, flavour));
    const names = Object.keys(trees[index]);
    if (write) writeFileSync(out, results[index].zip);
    const what = write ? relative(root, out) : `${zipName(id, version, flavour)} (checked, not written)`;
    console.log(`${what}: ${names.length} files, ${results[index].zip.length} bytes`);
    for (const name of names.sort()) console.log(`  ${name}  ${trees[index][name].length}`);
  });
}
