import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

// The repository's own files (spec 3.13 items 6 and 7): CI runs `npm run verify`, which is the one
// list of checks the release script runs too, and CHANGELOG.md has a section per version.
const ROOT = join(import.meta.dirname, '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');

/** The steps of scripts/verify.mjs for a root, as its own code lists them. */
function steps(root: string): string[] {
  const url = pathToFileURL(join(ROOT, 'scripts', 'verify.mjs')).href;
  const code = `import { verifySteps } from '${url}'; console.log(JSON.stringify(verifySteps(process.argv[1])));`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code, root], { encoding: 'utf8' });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout) as string[];
}

describe('repository hygiene', () => {
  it('npm run verify runs the checks in their order, the browser tests not among them', () => {
    expect(pkg.scripts.verify).toBe('node scripts/verify.mjs');
    // A root without the team's stint/cut/ is the product repository: the publish check reads the tip.
    expect(steps(join(ROOT, 'src'))).toEqual([
      'npm run check',
      'npm run lint',
      'npm run format:check',
      'npm test',
      'npm run build',
      'node scripts/publish-check.mjs',
      'node scripts/docs-check.mjs',
      'npm audit --audit-level=high',
    ]);
  });

  it('CI runs npm ci and npm run verify on Node 22, on push and pull request to main', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n {4}branches: \[main\]$/m);
    expect(ci).toMatch(/node-version: 22$/m);
    const runs = [...ci.matchAll(/^ +- run: (.+)$/gm)].map((match) => match[1]);
    expect(runs).toEqual(['npm ci', 'npm run verify']);
  });

  it('CHANGELOG.md has a section for the current version and the ones before it, newest first', () => {
    const versions = [...read('CHANGELOG.md').matchAll(/^## (\d+\.\d+\.\d+) - \d{4}-\d{2}-\d{2}$/gm)].map((m) => m[1]);
    expect(versions[0]).toBe(pkg.version);
    expect(versions).toEqual(expect.arrayContaining(['0.1.0', '0.1.1', '0.2.0', '0.3.0', '0.4.0', '0.5.0', '0.6.0']));
    const order = versions.map((version) => version.split('.').map(Number));
    for (let i = 1; i < order.length; i += 1) {
      const [a, b] = [order[i - 1], order[i]];
      expect(a[0] * 1e6 + a[1] * 1e3 + a[2]).toBeGreaterThan(b[0] * 1e6 + b[1] * 1e3 + b[2]);
    }
    for (const section of read('CHANGELOG.md').split(/^## /m).slice(1)) {
      for (const heading of section.matchAll(/^### (.+)$/gm)) expect(['Added', 'Changed', 'Fixed']).toContain(heading[1]);
    }
  });

  it('the issue templates ask for the versions, the tablet and the steps', () => {
    const bug = read('.github/ISSUE_TEMPLATE/bug_report.md');
    for (const asked of ['Decaid version', 'Tablet', 'pureflow version', 'Steps to reproduce']) expect(bug).toContain(asked);
    expect(read('.github/ISSUE_TEMPLATE/feature_request.md')).toMatch(/^name: Feature request$/m);
  });
});
