import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import pkg from '../package.json';

// The repository's own files: CI runs `npm run verify`, which is the one
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

  it('CI runs npm run verify and the browser tests on the mocked gateway on Node 22, on push and pull request to main', () => {
    const ci = read('.github/workflows/ci.yml');
    expect(ci).toMatch(/^on:\n {2}push:\n {4}branches: \[main\]\n {2}pull_request:\n {4}branches: \[main\]$/m);
    // Each job: its name at two spaces under `jobs:`, and its lines up to the next job.
    const jobs = Object.fromEntries(
      ci
        .split(/^jobs:$/m)[1]
        .split(/^ {2}(?=[\w-]+:$)/m)
        .slice(1)
        .map((job) => [job.slice(0, job.indexOf(':')), job]),
    );
    expect(Object.keys(jobs)).toEqual(['verify', 'e2e']);
    const runs = (job: string) => [...job.matchAll(/^ +- run: (.+)$/gm)].map((match) => match[1]);
    for (const job of Object.values(jobs)) expect(job).toMatch(/node-version: 22$/m);
    expect(runs(jobs.verify)).toEqual(['npm ci', 'npm run verify']);
    expect(runs(jobs.e2e)).toEqual(['npm ci', 'npx playwright install --with-deps chromium']);
    // The browser tests, their output kept for a line on the job's page that names the failed ones.
    expect(jobs.e2e).toMatch(/^ {8}run: npm run e2e 2>&1 \| tee "\$RUNNER_TEMP\/e2e\.log"$/m);
    expect(jobs.e2e).toMatch(/- name: Summary of the failed tests\n {8}if: failure\(\)\n[^]*e2e\.log[^]*GITHUB_STEP_SUMMARY/);
    // What failed is kept: the results folder of playwright.config.ts, a hidden one.
    expect(jobs.e2e).toMatch(
      /- uses: actions\/upload-artifact@v4\n {8}if: failure\(\)\n[^]*path: e2e\/\.results\/\n {10}include-hidden-files: true$/m,
    );
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
