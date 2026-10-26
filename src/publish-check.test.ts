import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// scripts/publish-check.mjs (spec 3.13 item 3, 3.15 step 8, acceptance 81): nothing private in the
// product repository. It passes on a clean tree and fails on a planted Windows path, e-mail address,
// foreign MAC address, the messenger's name and a token; with --history also on what only an
// earlier commit holds, or a commit's author. The planted words are written in parts so that this
// file passes the check itself.

const script = join(import.meta.dirname, '..', 'scripts', 'publish-check.mjs');
const NOREPLY = '52261469+Jan3kJ@users.noreply.github.com';

let root: string;

function git(...args: string[]) {
  const result = spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Janek',
      GIT_COMMITTER_NAME: 'Janek',
      GIT_AUTHOR_EMAIL: NOREPLY,
      GIT_COMMITTER_EMAIL: NOREPLY,
    },
  });
  expect(result.status, result.stderr).toBe(0);
}

function commit(files: Record<string, string>, email = NOREPLY) {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  git('add', '-A');
  git('-c', `user.email=${email}`, 'commit', '-q', '--author', `Janek <${email}>`, '-m', 'change');
}

function repository(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), 'publish-check-'));
  git('init', '-q');
  commit(files);
}

const check = (...args: string[]) => spawnSync(process.execPath, [script, ...args, root], { encoding: 'utf8' });

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const CLEAN = {
  'README.md': `# pureflow\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nBy Janek <${NOREPLY}>.\n`,
  'src/devices.test.ts': "device('AA:BB:CC:00:00:01'); const url = 'https://example.org/a:b';\n",
  'img.png': '\0binary D:' + '\\Git',
};

describe('publish-check', () => {
  it('passes on a clean tree and its history', () => {
    repository(CLEAN);
    expect(check().status).toBe(0);
    expect(check('--history').status).toBe(0);
  });

  it.each([
    ['Windows path', 'see D:' + '\\Git\\rig\\log.txt'],
    ['Windows path', "path: 'C:" + "/Users/someone'"],
    ['e-mail address', 'write to someone' + '@example.com'],
    ['MAC address', 'Bluetooth c4:93:' + 'ea:27:a8:8b'],
    ['messenger', 'Tele' + 'gram message 41'],
    ['token', 'bot 123456789:' + 'A'.repeat(35)],
    ['token', 'ghp_' + 'a1'.repeat(18)],
  ])('fails on a %s in the tip', (rule, text) => {
    repository({ ...CLEAN, 'docs/spec.md': `# Spec\n\n${text}\n` });
    const result = check();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`docs/spec.md:3: ${rule}`);
  });

  it('with --history fails on what only an earlier commit holds, and on an author', () => {
    repository({ ...CLEAN, 'docs/old.md': 'D:' + '/Git/streamline-js\n' });
    rmSync(join(root, 'docs/old.md'));
    commit({});
    expect(check().status).toBe(0);
    const history = check('--history');
    expect(history.status).toBe(1);
    expect(history.stderr).toMatch(/docs\/old\.md \(blob \w+\):1: Windows path/);

    commit({ 'a.md': 'a\n' }, 'someone' + '@example.com');
    expect(check('--history').stderr).toMatch(/commit \w+ author:1: e-mail address/);
  });

  it('with --cut reads only the paths the cut keeps, rewritten by its text rules', () => {
    repository({
      ...CLEAN,
      'cut/paths.txt': '# kept\nsrc/\nREADME.md\nglob:tsconfig*.json\nregex:^scripts/(?!rig-)\n',
      'cut/text.txt': 'regex:[A-Za-z]:\\\\Git\\\\==>..\\\\\nregex:(lo)cal==>\\1cal\n',
      'team/plan.md': 'C:' + '\\Users\\someone\n',
      'scripts/rig-probe.mjs': 'D:' + '/Git/rig\n',
      'src/fixture.ts': "const log = 'D:" + "\\Git\\rig\\log.txt';\n",
      'tsconfig.app.json': '{}\n',
    });
    expect(check().status).toBe(1);
    expect(check('--cut=cut').status).toBe(0);
    expect(check('--cut=cut').stdout).toMatch(/files as the cut makes them/);

    commit({ 'tsconfig.app.json': '{ "x": "C:' + '/Users/someone" }\n' });
    const kept = check('--cut=cut');
    expect(kept.status).toBe(1);
    expect(kept.stderr).toMatch(/tsconfig\.app\.json:1: Windows path/);
  });
});
