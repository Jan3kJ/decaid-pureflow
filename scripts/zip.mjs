// Writes release/<id>-<version>.zip from dist/, with index.html at the ZIP's root.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const outDir = join(root, 'release');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/index.html is missing; run `npm run build` first.');
  process.exit(1);
}

const files = {};
for (const entry of readdirSync(dist, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const path = join(entry.parentPath, entry.name);
  // ZIP entry names use forward slashes on every platform.
  files[relative(dist, path).split(sep).join('/')] = readFileSync(path);
}

const { id, version } = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const out = join(outDir, `${id}-${version}.zip`);
mkdirSync(outDir, { recursive: true });
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${relative(root, out)}: ${Object.keys(files).length} files`);
