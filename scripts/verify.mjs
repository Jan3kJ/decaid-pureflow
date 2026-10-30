// `npm run verify`: the one list of checks that CI (.github/workflows/ci.yml) and the release script
// run, in this order, stopping at the first that fails. The build makes both flavours and the zip
// check checks both ZIPs without writing them. The
// browser tests and the rig are not in it. In the team repository, before the cut, the publish check
// reads the files as the cut makes them (`--cut=stint/cut`), since the team's own files and the
// unscrubbed spec are not the product's.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** The checks, each a command line run from the repository's root. */
export function verifySteps(root = '.') {
  const cut = existsSync(resolve(root, 'stint/cut/paths.txt')) ? ' --cut=stint/cut' : '';
  return [
    'npm run check',
    'npm run lint',
    'npm run format:check',
    'npm test',
    'npm run build',
    'node scripts/zip.mjs --check',
    `node scripts/publish-check.mjs${cut}`,
    'node scripts/docs-check.mjs',
    'npm audit --audit-level=high',
  ];
}

/** Runs the steps; returns the first that failed, or undefined. */
export function verify(root = '.') {
  for (const step of verifySteps(root)) {
    console.log(`\n> ${step}`);
    const result = spawnSync(step, { cwd: resolve(root), stdio: 'inherit', shell: true });
    if (result.status !== 0) return step;
  }
  return undefined;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const failed = verify();
  if (failed) {
    console.error(`\nverify: '${failed}' failed`);
    process.exit(1);
  }
  console.log('\nverify: every check passed');
}
