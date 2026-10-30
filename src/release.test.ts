import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

// scripts/release.mjs and its pure parts, scripts/release-lib.mjs:
// the trailers, the bump, the CHANGELOG section and the version writes; the whole flow
// with the git, gh and npm calls replaced; and the script itself run in a temporary repository
// with a bare origin, with --dry-run and --local (no network, no gh).

interface Commit {
  hash: string;
  subject: string;
  message: string;
}
interface Entry {
  hash: string;
  kind: string;
  text: string;
  task?: string;
  breaking: boolean;
}
type Note = string | { kind: string; text?: string };
interface Lib {
  readTrailers(message: string): { task?: string; changelog?: string; breaking: boolean };
  parseLog(output: string): Commit[];
  entryText(subject: string): string;
  classify(
    commits: Commit[],
    notes?: Record<string, Note>,
  ): { entries: Entry[]; missing: string[]; invalid: { hash: string; value: string }[] };
  bumpOf(entries: Entry[]): string | undefined;
  lastTag(tags: string[]): string | undefined;
  chooseVersion(input: { last: string; current?: string; entries: Entry[]; bump?: string; version?: string }): {
    version: string;
    major: boolean;
  };
  changelogSection(input: { version: string; date: string; entries: Entry[]; checks: string }): string;
  checksLine(rig: boolean): string;
  insertSection(changelog: string, section: string): string;
  sectionOf(changelog: string, version: string): string | undefined;
  withVersion(text: string, version: string): string;
  rigGroups(files: string[]): string[][];
  assetUrl(repository: unknown, tag: string, name: string): string;
}
interface Result {
  status: number;
  stdout: string;
  stderr: string;
}
type Run = (cmd: string, args: string[], options: { cwd: string; inherit?: boolean }) => Result;
interface Script {
  release(
    argv: string[],
    root: string,
    io: {
      run: Run;
      ask: (q: string) => Promise<boolean>;
      rigUp: () => Promise<boolean>;
      log: (line: string) => void;
      today: () => string;
    },
  ): Promise<string | undefined>;
}

const ROOT = join(import.meta.dirname, '..');
const SCRIPTS = join(ROOT, 'scripts');
const CO_AUTHOR = 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>';
let lib: Lib;
let script: Script;

beforeAll(async () => {
  lib = (await import(pathToFileURL(join(SCRIPTS, 'release-lib.mjs')).href)) as Lib;
  script = (await import(pathToFileURL(join(SCRIPTS, 'release.mjs')).href)) as Script;
});

const commit = (hash: string, message: string): Commit => ({ hash, subject: message.split('\n')[0], message });
const entry = (kind: string, text = 'A change.', breaking = false): Entry => ({ hash: 'a'.repeat(40), kind, text, breaking });

describe('the release script: pure parts', () => {
  it('reads Task and Changelog followed by a blank line and the Co-Authored-By line', () => {
    const message = `z20-picker-rename: move a row to rename it\n\nBody.\n\nTask: Z20\nChangelog: added\n\n${CO_AUTHOR}\n`;
    expect(lib.readTrailers(message)).toEqual({ task: 'Z20', changelog: 'added', breaking: false });
    // and in the last paragraph together with it, CRLF or not
    const together = `x: y\r\n\r\nBody.\r\n\r\nTask: P7\r\nChangelog: Internal\r\nBreaking: yes\r\n${CO_AUTHOR}`;
    expect(lib.readTrailers(together)).toEqual({ task: 'P7', changelog: 'internal', breaking: true });
  });

  it('reads trailers only from the last two paragraphs', () => {
    const message = `x: y\n\nChangelog: added\n\nMore text.\n\n${CO_AUTHOR}`;
    expect(lib.readTrailers(message).changelog).toBeUndefined();
  });

  it('parses git log records and writes a subject as an entry without its task id', () => {
    const output = `abc\x1fr1-x: the graph\x1fr1-x: the graph\n\nChangelog: fixed\n\x1e\ndef\x1fFix it.\x1fFix it.\n\x1e\n`;
    expect(lib.parseLog(output).map((c) => [c.hash, c.subject])).toEqual([
      ['abc', 'r1-x: the graph'],
      ['def', 'Fix it.'],
    ]);
    expect(lib.entryText('r25-picker-edit: the picker has edit beside load')).toBe('The picker has edit beside load.');
    expect(lib.entryText('Fix the timer!')).toBe('Fix the timer!');
  });

  it('names a commit with no Changelog trailer, and .release-notes.json resolves it', () => {
    const commits = [commit('1111111aaa', 'a: one\n\nChangelog: fixed'), commit('2222222bbb', 'b: two\n\nno trailer')];
    expect(lib.classify(commits).missing).toEqual(['2222222bbb']);
    const resolved = lib.classify(commits, { '2222222': { kind: 'changed', text: 'two, for a user' } });
    expect(resolved.missing).toEqual([]);
    expect(resolved.entries.map((e) => [e.kind, e.text])).toEqual([
      ['fixed', 'One.'],
      ['changed', 'Two, for a user.'],
    ]);
    expect(lib.classify(commits, { '2222222': 'internal' }).entries[1].kind).toBe('internal');
    expect(lib.classify([commit('3333333', 'c\n\nChangelog: tweaked')]).invalid).toEqual([{ hash: '3333333', value: 'tweaked' }]);
  });

  it('bumps minor for added or changed, patch for fixed only, major for Breaking, nothing for internal', () => {
    expect(lib.bumpOf([entry('fixed'), entry('added')])).toBe('minor');
    expect(lib.bumpOf([entry('changed')])).toBe('minor');
    expect(lib.bumpOf([entry('fixed'), entry('internal')])).toBe('patch');
    expect(lib.bumpOf([entry('fixed', 'x', true)])).toBe('major');
    expect(lib.bumpOf([entry('internal'), entry('internal')])).toBeUndefined();
  });

  it('chooses the version: the bump on the last tag, package.json kept when ahead, the overrides', () => {
    const fixed = [entry('fixed')];
    expect(lib.chooseVersion({ last: '0.6.1', current: '0.6.1', entries: [entry('added')] })).toEqual(
      expect.objectContaining({ version: '0.7.0', major: false }),
    );
    expect(lib.chooseVersion({ last: '0.6.1', current: '0.6.1', entries: fixed }).version).toBe('0.6.2');
    expect(lib.chooseVersion({ last: '0.6.1', current: '0.7.0', entries: fixed }).version).toBe('0.7.0');
    expect(lib.chooseVersion({ last: '0.6.1', current: '0.7.0', entries: [entry('fixed', 'x', true)] })).toEqual(
      expect.objectContaining({ version: '1.0.0', major: true }),
    );
    expect(lib.chooseVersion({ last: '0.6.1', current: '0.6.1', entries: fixed, bump: 'minor' }).version).toBe('0.7.0');
    expect(lib.chooseVersion({ last: '0.6.1', current: '0.6.1', entries: fixed, version: '0.9.0' }).version).toBe('0.9.0');
    expect(() => lib.chooseVersion({ last: '0.6.1', current: '0.6.1', entries: fixed, version: '0.6.1' })).toThrow(/not above/);
    expect(lib.lastTag(['v0.2.0', 'v0.10.0', 'v0.9.1', 'old', 'v1.0.0-beta'])).toBe('0.10.0');
  });

  it('writes the CHANGELOG section grouped Added, Changed, Fixed with the Task refs and the checks', () => {
    const entries = [
      { ...entry('fixed', 'The timer stops.'), task: 'Z24' },
      { ...entry('added', 'A rename.'), task: 'Z20' },
      entry('changed', 'From a pull request.'),
    ];
    const section = lib.changelogSection({ version: '0.7.0', date: '2026-11-12', entries, checks: lib.checksLine(false) });
    expect(section).toBe(
      '## 0.7.0 - 2026-11-12\n\n### Added\n\n- A rename. (Z20)\n\n### Changed\n\n- From a pull request.\n\n### Fixed\n\n- The timer stops. (Z24)\n\nChecks: npm ci, npm run verify and npm run e2e passed; rig suite: not run.\n',
    );
    const changelog = lib.insertSection('# Changelog\n\nIntro.\n\n## 0.6.1 - 2026-10-25\n\n### Added\n\n- Old.\n', section);
    expect(changelog.indexOf('## 0.7.0')).toBeLessThan(changelog.indexOf('## 0.6.1'));
    expect(changelog.startsWith('# Changelog\n\nIntro.\n\n## 0.7.0')).toBe(true);
    expect(lib.sectionOf(changelog, '0.7.0')).toMatch(/^### Added[\s\S]*rig suite: not run\.\n$/);
    expect(lib.sectionOf(changelog, '0.6.1')).toBe('### Added\n\n- Old.\n');
  });

  it('writes the version into package.json, package-lock.json and the manifest, leaving the rest as it was', () => {
    for (const file of ['package.json', 'package-lock.json', 'public/manifest.json']) {
      const text = readFileSync(join(ROOT, file), 'utf8');
      const written = lib.withVersion(text, '9.8.7');
      const data = JSON.parse(written) as { version: string; packages?: Record<string, { version?: string }> };
      expect(data.version).toBe('9.8.7');
      if (file === 'package-lock.json') expect(data.packages?.['']?.version).toBe('9.8.7');
      const old = JSON.parse(text) as { version: string };
      expect(lib.withVersion(written, old.version)).toBe(text);
    }
  });

  it('runs the rig in its groups, a spec not named in the last', () => {
    const groups = lib.rigGroups([
      'beans.spec.ts',
      'shot-end.spec.ts',
      'settings-page.spec.ts',
      'shot.spec.ts',
      'picker-rename.spec.ts',
      'gateway.ts',
    ]);
    expect(groups).toEqual([
      ['e2e-rig/beans.spec.ts'],
      ['e2e-rig/settings-page.spec.ts', 'e2e-rig/shot-end.spec.ts'],
      ['e2e-rig/shot.spec.ts'],
      ['e2e-rig/picker-rename.spec.ts'],
    ]);
    expect(lib.assetUrl({ url: 'git+https://github.com/o/r.git' }, 'v0.7.0', 'p-0.7.0.zip')).toBe(
      'https://github.com/o/r/releases/download/v0.7.0/p-0.7.0.zip',
    );
  });
});

/** A repository's files for the flow: versions 0.6.1, a CHANGELOG. */
function writeProduct(root: string, scripts: Record<string, string>) {
  const files: Record<string, string> = {
    'package.json': `${JSON.stringify({ name: 'pureflow-test', version: '0.6.1', private: true, repository: { url: 'git+https://github.com/o/r.git' }, scripts }, null, 2)}\n`,
    'package-lock.json': `${JSON.stringify({ name: 'pureflow-test', version: '0.6.1', lockfileVersion: 3, requires: true, packages: { '': { name: 'pureflow-test', version: '0.6.1' } } }, null, 2)}\n`,
    'public/manifest.json': `${JSON.stringify({ id: 'pureflow', version: '0.6.1' }, null, 2)}\n`,
    'CHANGELOG.md': '# Changelog\n\n## 0.6.1 - 2026-10-25\n\n### Added\n\n- Old.\n',
    '.gitignore': 'node_modules/\nrelease/\n',
    'ok.mjs': '',
    'fail.mjs': 'process.exit(1);\n',
    'zip.mjs':
      "import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';\nconst { id, version } = JSON.parse(readFileSync('public/manifest.json', 'utf8'));\nmkdirSync('release', { recursive: true });\nwriteFileSync(`release/${id}-${version}.zip`, `zip of ${version}`);\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
}

const OK = { test: 'node ok.mjs', verify: 'node ok.mjs', e2e: 'node ok.mjs', zip: 'node zip.mjs' };

describe('the release script: the flow, with git, gh and npm replaced', () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  /** A replaced `run`: git and gh answer as a clean main one commit after v0.6.1; npm run zip writes the ZIP. */
  function fake(
    calls: string[],
    log = `${'c'.repeat(40)}\x1fz20-x: a rename\x1fz20-x: a rename\n\nTask: Z20\nChangelog: added\n\n${CO_AUTHOR}\n\x1e`,
  ): Run {
    return (cmd, args) => {
      const line = [cmd, ...args].join(' ');
      calls.push(line);
      const out = (stdout: string, status = 0) => ({ status, stdout, stderr: '' });
      if (line === 'git rev-parse --abbrev-ref HEAD') return out('main\n');
      if (line.startsWith('git tag --merged')) return out('v0.6.0\nv0.6.1\n');
      if (line.startsWith('git rev-parse --verify -q refs/tags/'))
        return out('', calls.some((call) => call.startsWith(`git tag -a ${line.slice(line.lastIndexOf('/') + 1)} `)) ? 0 : 1);
      if (line.startsWith('git rev-list --count')) return out('0\n');
      if (line.startsWith('git log')) return out(log);
      if (line === 'npm run zip') spawnSync(process.execPath, ['zip.mjs'], { cwd: root });
      return out('');
    };
  }
  const io = (calls: string[], answers: boolean[], extra = {}) => ({
    run: fake(calls),
    ask: () => Promise.resolve(answers.shift() ?? false),
    rigUp: () => Promise.resolve(false),
    log: () => undefined,
    today: () => '2026-11-12',
    ...extra,
  });

  it('without the second yes nothing is pushed and nothing goes to GitHub', async () => {
    root = mkdtempSync(join(tmpdir(), 'release-flow-'));
    writeProduct(root, OK);
    const calls: string[] = [];
    expect(await script.release(['--no-rig'], root, io(calls, [true, false]))).toBeUndefined();
    expect(calls).toContain('git fetch origin');
    expect(calls).toContain('gh auth status');
    expect(calls).toContain('git tag -a v0.7.0 -m pureflow 0.7.0');
    expect(calls.filter((call) => call.startsWith('git push') || call.startsWith('gh release'))).toEqual([]);
    expect(readFileSync(join(root, 'release', 'SHA256SUMS.txt'), 'utf8')).toMatch(/^[0-9a-f]{64} {2}pureflow-0\.7\.0\.zip\n$/);
  });

  it('with no to the first yes nothing is written; with the second it publishes a draft and checks the download', async () => {
    root = mkdtempSync(join(tmpdir(), 'release-flow-'));
    writeProduct(root, OK);
    const calls: string[] = [];
    expect(await script.release(['--no-rig'], root, io(calls, [false]))).toBeUndefined();
    expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))).toMatchObject({ version: '0.6.1' });
    expect(calls.some((call) => call.startsWith('npm'))).toBe(false);

    const publish: string[] = [];
    const run = fake(publish);
    const withDownload: Run = (cmd, args, options) => {
      const result = run(cmd, args, options);
      if (args[0] === 'release' && args[1] === 'view') return { ...result, status: 1 };
      if (args[0] === 'release' && args[1] === 'download') {
        const dir = args[args.indexOf('--dir') + 1];
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, 'pureflow-0.7.0.zip'), readFileSync(join(root, 'release', 'pureflow-0.7.0.zip')));
      }
      return result;
    };
    const lines: string[] = [];
    expect(
      await script.release(
        ['--no-rig'],
        root,
        io(publish, [true, true], { run: withDownload, log: (line: string) => lines.push(line) }),
      ),
    ).toBe('0.7.0');
    expect(publish).toContain('git push --atomic origin main v0.7.0');
    expect(publish.find((call) => call.startsWith('gh release create'))).toMatch(/--draft$/);
    expect(lines.join('\n')).toContain('https://github.com/o/r/releases/download/v0.7.0/pureflow-0.7.0.zip');
  });

  it('stops at each check before anything with the line that fixes it', async () => {
    root = mkdtempSync(join(tmpdir(), 'release-flow-'));
    writeProduct(root, OK);
    const stop = (answer: (line: string) => Result | undefined, argv = ['--no-rig']) => {
      const base = fake([]);
      const run: Run = (cmd, args, options) => answer([cmd, ...args].join(' ')) ?? base(cmd, args, options);
      return script.release(argv, root, { ...io([], []), run });
    };
    const out = (stdout: string, status = 0) => ({ status, stdout, stderr: '' });
    await expect(stop((l) => (l === 'git status --porcelain' ? out('?? x\n') : undefined))).rejects.toMatchObject({
      fix: expect.stringMatching(/^git status/) as unknown,
    });
    await expect(stop((l) => (l === 'git rev-parse --abbrev-ref HEAD' ? out('dev\n') : undefined))).rejects.toMatchObject({
      fix: 'git switch main',
    });
    await expect(stop((l) => (l.startsWith('git tag --merged') ? out('') : undefined))).rejects.toMatchObject({
      message: expect.stringMatching(/no tag/) as unknown,
    });
    await expect(stop((l) => (l.startsWith('git rev-list') ? out('2\n') : undefined))).rejects.toMatchObject({
      fix: 'git pull --ff-only origin main',
    });
    await expect(stop((l) => (l === 'gh auth status' ? out('', -1) : undefined))).rejects.toMatchObject({
      fix: expect.stringMatching(/^gh auth login/) as unknown,
    });
    await expect(stop(() => undefined, [])).rejects.toMatchObject({ message: expect.stringMatching(/no Decaid/) as unknown });
    await expect(stop(() => undefined, ['--yes'])).rejects.toMatchObject({ message: expect.stringMatching(/no --yes/) as unknown });
    // --local: no fetch and no gh
    const calls: string[] = [];
    await script.release(['--local', '--dry-run', '--no-rig'], root, io(calls, []));
    expect(calls.filter((call) => call.startsWith('gh') || call.includes('fetch'))).toEqual([]);
  });

  it('a commit without a Changelog trailer stops and is named; Breaking asks first', async () => {
    root = mkdtempSync(join(tmpdir(), 'release-flow-'));
    writeProduct(root, OK);
    const bare = `${'d'.repeat(40)}\x1fx: y\x1fx: y\n\nno trailer\n\x1e`;
    await expect(script.release(['--no-rig'], root, { ...io([], []), run: fake([], bare) })).rejects.toMatchObject({
      message: expect.stringMatching(/dddddddd?\b/) as unknown,
    });
    const internal = `${'e'.repeat(40)}\x1fx: y\x1fx: y\n\nChangelog: internal\n\x1e`;
    await expect(script.release(['--no-rig'], root, { ...io([], []), run: fake([], internal) })).rejects.toMatchObject({
      message: expect.stringMatching(/^nothing to release/) as unknown,
    });
    const breaking = `${'f'.repeat(40)}\x1fx: y\x1fx: y\n\nChangelog: changed\nBreaking: yes\n\x1e`;
    const questions: string[] = [];
    const asked = { ...io([], []), run: fake([], breaking), ask: (q: string) => (questions.push(q), Promise.resolve(false)) };
    expect(await script.release(['--no-rig'], root, asked)).toBeUndefined();
    expect(questions).toEqual([expect.stringMatching(/major release \(Breaking: fffffff\): 0\.6\.1 to 1\.0\.0/)]);
  });
});

describe('the release script: run in a temporary repository', () => {
  let root: string;
  let origin: string;
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rmSync(origin, { recursive: true, force: true });
  });

  function git(...args: string[]) {
    const result = spawnSync('git', ['-C', root, '-c', 'user.name=Test', '-c', 'user.email=test@localhost', ...args], {
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    return result.stdout.trim();
  }

  function setUp(scripts: Record<string, string>) {
    root = mkdtempSync(join(tmpdir(), 'release-run-'));
    origin = mkdtempSync(join(tmpdir(), 'release-origin-'));
    spawnSync('git', ['init', '-q', '--bare', origin]);
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    writeProduct(root, scripts);
    git('add', '-A');
    git('commit', '-q', '-m', 'Base\n\nChangelog: internal');
    git('tag', '-a', 'v0.6.1', '-m', 'pureflow 0.6.1');
    writeFileSync(join(root, 'new.txt'), 'new\n');
    git('add', '-A');
    git(
      'commit',
      '-q',
      '-m',
      `z20-picker-rename: move a row to the right to rename it\n\nWhat it does.\n\nTask: Z20\nChangelog: added\n\n${CO_AUTHOR}`,
    );
    git('remote', 'add', 'origin', origin);
    git('push', '-q', 'origin', 'main', '--tags');
  }

  function release(...argv: string[]) {
    return spawnSync(process.execPath, [join(SCRIPTS, 'release.mjs'), ...argv], {
      cwd: root,
      encoding: 'utf8',
      input: 'yes\n',
      env: {
        ...process.env,
        PUREFLOW_RIG_URL: 'http://127.0.0.1:9',
        npm_config_update_notifier: 'false',
        GIT_AUTHOR_NAME: 'Test',
        GIT_AUTHOR_EMAIL: 'test@localhost',
        GIT_COMMITTER_NAME: 'Test',
        GIT_COMMITTER_EMAIL: 'test@localhost',
      },
    });
  }
  const state = () => [
    git('rev-parse', 'HEAD'),
    git('tag'),
    git('status', '--porcelain'),
    readFileSync(join(root, 'CHANGELOG.md'), 'utf8'),
  ];

  it('--dry-run changes nothing; --local writes the versions, the section, the ZIP and its SHA-256, one commit and one tag, and pushes nothing', () => {
    setUp(OK);
    const before = state();
    const dry = release('--dry-run', '--local', '--no-rig');
    expect(dry.status, dry.stdout + dry.stderr).toBe(0);
    expect(dry.stdout).toContain('3. The version: 0.7.0');
    expect(dry.stdout).toContain('- Move a row to the right to rename it. (Z20)');
    expect(dry.stdout).toContain('Not in the script');
    expect(state()).toEqual(before);
    expect(existsSync(join(root, 'release'))).toBe(false);

    const local = release('--local', '--no-rig');
    expect(local.status, local.stdout + local.stderr).toBe(0);
    for (const file of ['package.json', 'package-lock.json', 'public/manifest.json']) {
      expect(JSON.parse(readFileSync(join(root, file), 'utf8')), file).toMatchObject({ version: '0.7.0' });
    }
    expect(readFileSync(join(root, 'CHANGELOG.md'), 'utf8')).toMatch(
      /^# Changelog\n\n## 0\.7\.0 - \d{4}-\d{2}-\d{2}\n\n### Added\n\n- Move a row to the right to rename it\. \(Z20\)\n\nChecks: .*rig suite: not run\.\n\n## 0\.6\.1/,
    );
    expect(readFileSync(join(root, 'release', 'SHA256SUMS.txt'), 'utf8')).toMatch(/^[0-9a-f]{64} {2}pureflow-0\.7\.0\.zip\n$/);
    expect(git('log', '--format=%s', '-1')).toBe('Release 0.7.0');
    expect(git('rev-list', '--count', 'v0.6.1..HEAD')).toBe('2');
    expect(git('cat-file', '-t', 'v0.7.0')).toBe('tag');
    expect(git('status', '--porcelain')).toBe('');
    expect(spawnSync('git', ['-C', origin, 'tag'], { encoding: 'utf8' }).stdout.trim()).toBe('v0.6.1');
  }, 120_000);

  it('a failing check or a missing rig stops before any file is written', () => {
    setUp({ ...OK, verify: 'node fail.mjs' });
    const before = state();
    const failing = release('--local', '--no-rig');
    expect(failing.status).toBe(1);
    expect(failing.stderr).toContain("release stopped: 'npm run verify' failed; nothing has been written");
    expect(state()).toEqual(before);

    const noRig = release('--local');
    expect(noRig.status).toBe(1);
    expect(noRig.stderr).toContain('fix: start the rig');
    expect(state()).toEqual(before);
  }, 120_000);
});
