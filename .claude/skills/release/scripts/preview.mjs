// Prints what `npm run release` would do with the commits since the last tag, without running
// any check or writing anything: the commits and their Changelog kind, those the release would
// stop on (no trailer, unknown kind), the version it would choose and the CHANGELOG section.
// It uses the release script's own pure functions (scripts/release-lib.mjs), so it agrees with it.
//
//   node .claude/skills/release/scripts/preview.mjs [--bump major|minor|patch] [--version X.Y.Z]
//
// Run it from the repository's root.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const lib = await import(pathToFileURL(join(root, 'scripts', 'release-lib.mjs')).href);

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
};

const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
const last = lib.lastTag(git('tag', '--merged', 'HEAD', '--list', 'v*').split('\n'));
if (!last) {
  console.log('No tag vX.Y.Z on this branch: the release would stop.');
  process.exit(1);
}
const commits = lib.parseLog(git('log', '--no-merges', '--reverse', '--format=%H%x1f%s%x1f%B%x1e', `v${last}..HEAD`));
const notesFile = join(root, '.release-notes.json');
const notes = existsSync(notesFile) ? JSON.parse(readFileSync(notesFile, 'utf8')) : {};
const { entries, missing, invalid } = lib.classify(commits, notes);

console.log(`Last tag: v${last}. ${commits.length} commit(s) since.\n`);
for (const commit of commits) {
  const entry = entries.find((e) => e.hash === commit.hash);
  const kind = entry ? entry.kind : missing.includes(commit.hash) ? 'MISSING' : 'INVALID';
  console.log(`  ${commit.hash.slice(0, 7)}  ${kind.padEnd(8)}  ${commit.subject}`);
}
if (missing.length || invalid.length) {
  console.log('\nThe release would stop here:');
  for (const hash of missing) console.log(`  ${hash.slice(0, 7)} has no Changelog: trailer`);
  for (const { hash, value } of invalid) console.log(`  ${hash.slice(0, 7)} has Changelog: '${value}'`);
  console.log('Name each in .release-notes.json: { "<short hash>": "internal" } or { "<short hash>": { "kind": "fixed", "text": "..." } }');
  process.exit(1);
}
const shown = entries.filter((e) => e.kind !== 'internal');
if (shown.length === 0) {
  console.log('\nEvery commit is internal: the release would stop with nothing to release.');
  process.exit(1);
}
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const choice = lib.chooseVersion({
  last,
  current: pkg.version,
  entries,
  bump: option('--bump'),
  version: option('--version'),
});
const breaking = entries.filter((e) => e.breaking).map((e) => e.hash.slice(0, 7));
console.log(`\nVersion: ${choice.version} (${choice.reason})${choice.major ? ` MAJOR${breaking.length ? `, Breaking: ${breaking.join(', ')}` : ''}` : ''}\n`);
const date = new Date().toISOString().slice(0, 10);
console.log(lib.changelogSection({ version: choice.version, date, entries: shown, checks: lib.checksLine(true) }));
