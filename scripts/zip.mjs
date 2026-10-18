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

// What Decaid needs of a skin's ZIP (doc/Skins.md), checked before it is written.
const names = Object.keys(files);
const html = files['index.html'].toString('utf8');
const problems = [];
// The id becomes a folder name under Decaid's web-ui/: one safe path component.
if (typeof id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.endsWith('.')) {
  problems.push(`manifest.json: the id ${JSON.stringify(id)} is not one safe path component`);
}
if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  problems.push(`manifest.json: ${JSON.stringify(version)} is not a version`);
}
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
if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}

const out = join(outDir, `${id}-${version}.zip`);
mkdirSync(outDir, { recursive: true });
const zip = zipSync(files, { level: 9 });
writeFileSync(out, zip);
console.log(`${relative(root, out)}: ${names.length} files, ${zip.length} bytes`);
for (const name of names.sort()) console.log(`  ${name}  ${files[name].length}`);
