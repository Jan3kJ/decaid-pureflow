// `npm run release`: the only way a release is made, run in the product repository.
// In order: the checks before anything, the history from the commits' `Changelog:` trailers since
// the last tag, the version (behind a yes), every check, the files (versions, CHANGELOG.md, the two
// ZIPs, base and ocr, and release/SHA256SUMS.txt with a line for each), the local commit and tag,
// and the publish step behind a second yes.
//
//   npm run release -- [--dry-run] [--local] [--resume] [--no-rig] [--publish]
//                      [--bump major|minor|patch] [--version X.Y.Z]
//
// --dry-run runs the checks and prints the files it would write; --local stops after the tag and
// never calls GitHub (no fetch, no gh: a hand-over uses it); --resume continues at the publish step
// when the tag exists. Every git, gh and npm call goes through `run`, which the tests replace.
// PUREFLOW_RIG_URL names the gateway the rig is looked for at (default http://localhost:8080).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import {
  NOT_IN_SCRIPT,
  assetUrl,
  changelogSection,
  checksLine,
  chooseVersion,
  classify,
  insertSection,
  lastTag,
  parseLog,
  releaseZips,
  rigGroups,
  sectionOf,
  sumsText,
  withVersion,
  zipsNote,
} from './release-lib.mjs';

/** A stop: what is wrong, and the one line that fixes it. */
export class Stop extends Error {
  constructor(message, fix) {
    super(message);
    this.fix = fix;
  }
}

/** Runs a command in `cwd`; `inherit` shows its output as it runs. Returns { status, stdout, stderr }. */
export function run(cmd, args, { cwd, inherit = false } = {}) {
  // npm and npx are .cmd files on Windows, which only a shell starts; their arguments here have no spaces.
  const shell = process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx');
  const result = shell
    ? spawnSync([cmd, ...args].join(' '), { cwd, shell: true, stdio: inherit ? 'inherit' : 'pipe', encoding: 'utf8' })
    : spawnSync(cmd, args, { cwd, stdio: inherit ? 'inherit' : 'pipe', encoding: 'utf8' });
  return { status: result.error ? -1 : result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/** Asks on the terminal; only 'yes' is a yes, and a closed input is a no. */
export async function ask(question) {
  const lines = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => {
    lines.question(`${question} (yes/no) `, resolve);
    lines.once('close', () => resolve(''));
  });
  lines.close();
  return String(answer).trim().toLowerCase() === 'yes';
}

/** Whether a Decaid answers at the gateway. */
export async function rigUp(url = process.env.PUREFLOW_RIG_URL ?? 'http://localhost:8080') {
  try {
    const response = await fetch(`${url}/api/v1/machine/state`, { signal: AbortSignal.timeout(3000) });
    return response.ok;
  } catch {
    return false;
  }
}

const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

export function parseArgs(argv) {
  const options = { dryRun: false, local: false, resume: false, rig: true, publish: false };
  for (let i = 0; i < argv.length; i += 1) {
    const [flag, inline] = argv[i].split('=', 2);
    const value = () => inline ?? argv[++i];
    if (flag === '--dry-run') options.dryRun = true;
    else if (flag === '--local') options.local = true;
    else if (flag === '--resume') options.resume = true;
    else if (flag === '--no-rig') options.rig = false;
    else if (flag === '--publish') options.publish = true;
    else if (flag === '--bump') options.bump = value();
    else if (flag === '--version') options.version = value();
    else if (flag === '--yes' || flag === '-y') throw new Stop('there is no --yes: the yes is typed', 'npm run release');
    else
      throw new Stop(
        `unknown option ${argv[i]}`,
        'npm run release -- [--dry-run] [--local] [--resume] [--no-rig] [--publish] [--bump major|minor|patch] [--version X.Y.Z]',
      );
  }
  if (options.bump !== undefined && !['major', 'minor', 'patch'].includes(options.bump)) {
    throw new Stop(`--bump ${options.bump} is not major, minor or patch`, 'npm run release -- --bump minor');
  }
  if (options.resume && (options.dryRun || options.local)) {
    throw new Stop('--resume publishes; it goes with neither --dry-run nor --local', 'npm run release -- --resume');
  }
  return options;
}

/**
 * The release. `io` holds what the tests replace: run (every git, gh and npm call), ask, rigUp,
 * log, today. Returns the version released, or undefined when it stopped at a no.
 */
export async function release(argv, root, io = {}) {
  const exec = io.run ?? run;
  const yes = io.ask ?? ask;
  const log = io.log ?? console.log;
  const date = (io.today ?? today)();
  const options = parseArgs(argv);
  const github = !options.local;
  const read = (file) => readFileSync(join(root, file), 'utf8');
  const sh = (cmd, ...args) => exec(cmd, args, { cwd: root });
  const git = (...args) => {
    const result = sh('git', ...args);
    if (result.status !== 0) throw new Stop(`git ${args.join(' ')} failed: ${result.stderr.trim()}`, 'git status');
    return result.stdout.trim();
  };
  /** release/SHA256SUMS.txt for the ZIPs of release/ named. */
  const sums = (names) => sumsText(Object.fromEntries(names.map((name) => [name, sha256(join(root, 'release', name))])));
  const step = (cmd, ...args) => {
    log(`\n> ${cmd} ${args.join(' ')}`);
    return exec(cmd, args, { cwd: root, inherit: true }).status === 0;
  };

  // 1. Before anything: nothing has been changed yet.
  log('1. Before anything');
  if (sh('git', 'status', '--porcelain').stdout.trim() !== '') {
    throw new Stop('the working tree has changes or untracked files', 'git status, then commit, stash or remove them');
  }
  if (git('rev-parse', '--abbrev-ref', 'HEAD') !== 'main') throw new Stop('the branch is not main', 'git switch main');
  const last = lastTag(git('tag', '--merged', 'HEAD', '--list', 'v*').split('\n'));
  if (last === undefined) {
    throw new Stop('no tag vX.Y.Z on this branch', "git tag -a vX.Y.Z <the last release's commit> -m 'pureflow X.Y.Z'");
  }
  if (github && sh('git', 'fetch', 'origin').status !== 0) {
    throw new Stop('git fetch origin failed', 'git remote -v (origin is the GitHub repository), then check the network');
  }
  if (sh('git', 'rev-parse', '--verify', '-q', 'origin/main').status === 0) {
    if (Number(git('rev-list', '--count', 'HEAD..origin/main')) > 0) {
      throw new Stop('main is behind origin/main', 'git pull --ff-only origin main');
    }
  }
  if (github && sh('gh', 'auth', 'status').status !== 0) {
    throw new Stop(
      'gh is not logged in (or not installed)',
      'gh auth login (install the GitHub CLI from https://cli.github.com first if gh is missing)',
    );
  }
  log(`   clean, on main, last tag v${last}${github ? ', not behind origin/main, gh logged in' : ' (--local: no fetch, no gh)'}`);

  const pkg = JSON.parse(read('package.json'));
  if (options.resume) return publish(pkg.version);

  if (options.rig && !(await (io.rigUp ?? rigUp)())) {
    throw new Stop(
      'no Decaid answers on its port: the rig suite cannot run',
      'start the rig (docs/architecture.md, The rig), or npm run release -- --no-rig',
    );
  }

  // 2. The history, from the commits' trailers.
  log(`\n2. The history since v${last}`);
  const commits = parseLog(git('log', '--no-merges', '--reverse', '--format=%H%x1f%s%x1f%B%x1e', `v${last}..HEAD`));
  let notes = {};
  if (existsSync(join(root, '.release-notes.json'))) {
    try {
      notes = JSON.parse(read('.release-notes.json'));
    } catch (error) {
      throw new Stop(`.release-notes.json is not JSON: ${error.message}`, 'fix .release-notes.json');
    }
  }
  const { entries, missing, invalid } = classify(commits, notes);
  if (missing.length > 0) {
    throw new Stop(
      `${missing.length} commit(s) without a Changelog: trailer: ${missing.map((hash) => hash.slice(0, 7)).join(', ')}`,
      'name each in .release-notes.json: { "<short hash>": "internal" } or { "<short hash>": { "kind": "fixed", "text": "..." } }',
    );
  }
  if (invalid.length > 0) {
    throw new Stop(
      `Changelog: values that are not added, changed, fixed or internal: ${invalid.map(({ hash, value }) => `${hash.slice(0, 7)} '${value}'`).join(', ')}`,
      'name each in .release-notes.json with its kind',
    );
  }
  const shown = entries.filter((entry) => entry.kind !== 'internal');
  if (shown.length === 0) throw new Stop(`nothing to release: every commit since v${last} is internal`, 'nothing to do');
  log(`   ${commits.length} commit(s), ${shown.length} entr${shown.length === 1 ? 'y' : 'ies'}`);

  // 3. The version, behind a yes.
  let choice;
  try {
    choice = chooseVersion({ last, current: pkg.version, entries, bump: options.bump, version: options.version });
  } catch (error) {
    throw new Stop(error.message, 'npm run release -- --version X.Y.Z');
  }
  const { version } = choice;
  const tag = `v${version}`;
  if (sh('git', 'rev-parse', '--verify', '-q', `refs/tags/${tag}`).status === 0) {
    throw new Stop(`the tag ${tag} exists already`, 'npm run release -- --resume');
  }
  const section = (rig) => changelogSection({ version, date, entries: shown, checks: checksLine(rig) });
  log(`\n3. The version: ${version} (${choice.reason})\n\n${section(options.rig)}`);
  if (!options.dryRun) {
    const breaking = entries.filter((entry) => entry.breaking).map((entry) => entry.hash.slice(0, 7));
    if (
      choice.major &&
      !(await yes(`A major release${breaking.length ? ` (Breaking: ${breaking.join(', ')})` : ''}: ${last} to ${version}. Go on?`))
    ) {
      log('Stopped: no major release. Nothing has been changed.');
      return undefined;
    }
    if (!(await yes(`Release ${version} with these entries?`))) {
      log('Stopped. Nothing has been changed.');
      return undefined;
    }
  }

  // 4. Every check, stopping at the first failure; nothing is written before they pass.
  log('\n4. The checks');
  const checks = [
    ['npm', 'ci', '--no-audit', '--no-fund'],
    ['npm', 'run', 'verify'],
    ['npm', 'run', 'e2e'],
  ];
  if (options.rig) {
    const specs = existsSync(join(root, 'e2e-rig')) ? readdirSync(join(root, 'e2e-rig')) : [];
    for (const group of rigGroups(specs)) checks.push(['npx', 'playwright', 'test', '--config', 'playwright.rig.config.ts', ...group]);
  }
  for (const [cmd, ...args] of checks) {
    if (!step(cmd, ...args))
      throw new Stop(`'${cmd} ${args.join(' ')}' failed; nothing has been written`, 'fix what it reports, then npm run release again');
  }

  // 5. The files.
  const versionFiles = ['package.json', 'package-lock.json', 'public/manifest.json'];
  const zips = releaseZips(JSON.parse(read('public/manifest.json')).id, version);
  if (options.dryRun) {
    log(
      `\n5. Would write ${version} into ${versionFiles.join(', ')}, the section above into CHANGELOG.md, run npm run zip for ${zips.map((name) => `release/${name}`).join(' and ')} and write release/SHA256SUMS.txt with a line for each:`,
    );
    for (const name of zips) log(`   <sha-256>  ${name}`);
    log('\nDry run: nothing has been changed.');
    printLeft();
    return version;
  }
  log('\n5. The files');
  const undo = 'git checkout -- .';
  for (const file of versionFiles) writeFileSync(join(root, file), withVersion(read(file), version));
  const versions = versionFiles.map((file) => JSON.parse(read(file)).version);
  const lock = JSON.parse(read('package-lock.json'));
  if (versions.some((v) => v !== version) || lock.packages?.['']?.version !== version) {
    throw new Stop(`the versions differ: ${versions.join(', ')}`, undo);
  }
  const changelog = existsSync(join(root, 'CHANGELOG.md')) ? read('CHANGELOG.md') : '# Changelog\n';
  writeFileSync(join(root, 'CHANGELOG.md'), insertSection(changelog, section(options.rig)));
  if (!step('npm', 'test', '--', 'src/manifest.test.ts')) throw new Stop('the versions test failed', undo);
  if (!step('npm', 'run', 'zip')) throw new Stop('npm run zip or its checks of the ZIPs failed', undo);
  for (const name of zips) if (!existsSync(join(root, 'release', name))) throw new Stop(`release/${name} was not written`, undo);
  writeFileSync(join(root, 'release', 'SHA256SUMS.txt'), sums(zips));
  log(`   ${zips.map((name) => `release/${name}`).join(', ')}, release/SHA256SUMS.txt`);

  // 6. The local commit and the annotated tag.
  git('add', '--', ...versionFiles, 'CHANGELOG.md');
  git('commit', '-q', '-m', `Release ${version}`, '-m', 'Changelog: internal');
  git('tag', '-a', tag, '-m', `pureflow ${version}`);
  log(`\n6. Committed 'Release ${version}' and tagged ${tag}. To undo: git tag -d ${tag} && git reset --hard HEAD~1`);
  if (options.local) {
    log('\n--local: nothing pushed, nothing on GitHub.');
    printLeft();
    return version;
  }
  return publish(version);

  // 7. Publish, behind the second yes, which is the owner's.
  async function publish(v) {
    const t = `v${v}`;
    log(`\n7. Publish ${t}`);
    if (sh('git', 'rev-parse', '--verify', '-q', `refs/tags/${t}`).status !== 0) {
      throw new Stop(`no tag ${t} to publish`, 'npm run release (without --resume)');
    }
    const names = releaseZips(JSON.parse(read('public/manifest.json')).id, v);
    const files = names.map((name) => join(root, 'release', name));
    const sumsFile = join(root, 'release', 'SHA256SUMS.txt');
    if (files.some((file) => !existsSync(file))) {
      if (!step('npm', 'run', 'zip')) throw new Stop('npm run zip failed', 'npm run zip');
      writeFileSync(sumsFile, sums(names));
    }
    if (!existsSync(sumsFile) || readFileSync(sumsFile, 'utf8') !== sums(names)) {
      throw new Stop(
        `release/SHA256SUMS.txt does not hold the SHA-256 of ${names.map((name) => `release/${name}`).join(' and ')}`,
        'npm run zip, then npm run release -- --resume',
      );
    }
    const body = sectionOf(read('CHANGELOG.md'), v);
    if (body === undefined) throw new Stop(`CHANGELOG.md has no section ${v}`, 'git show HEAD:CHANGELOG.md');
    // The notes say which ZIP is which; CHANGELOG.md keeps the entries only.
    const notes = `${body}\n${zipsNote(names, readFileSync(files[1]).length)}`;
    const where = options.publish ? 'a public release' : 'a draft release';
    if (!(await yes(`Publish ${v}: push main and ${t} to origin and create ${where} on GitHub?`))) {
      log(`Not published. ${t} is local; later: npm run release -- --resume`);
      printLeft();
      return undefined;
    }
    if (!step('git', 'push', '--atomic', 'origin', 'main', t)) throw new Stop('the push failed', 'npm run release -- --resume');
    const scratch = mkdtempSync(join(tmpdir(), 'pureflow-release-'));
    try {
      const notesFile = join(scratch, 'notes.md');
      writeFileSync(notesFile, notes);
      const exists = sh('gh', 'release', 'view', t).status === 0;
      const uploaded = exists
        ? step('gh', 'release', 'upload', t, ...files, sumsFile, '--clobber')
        : step(
            'gh',
            'release',
            'create',
            t,
            ...files,
            sumsFile,
            '--title',
            `pureflow ${v}`,
            '--notes-file',
            notesFile,
            ...(options.publish ? [] : ['--draft']),
          );
      if (!uploaded) throw new Stop('the GitHub release failed', 'npm run release -- --resume');
      const download = join(scratch, 'download');
      const patterns = names.flatMap((name) => ['--pattern', name]);
      if (!step('gh', 'release', 'download', t, ...patterns, '--dir', download)) {
        throw new Stop('the download of the assets failed', 'npm run release -- --resume');
      }
      names.forEach((name, index) => {
        const downloaded = join(download, name);
        if (!existsSync(downloaded) || sha256(downloaded) !== sha256(files[index])) {
          throw new Stop(`the downloaded ${name} differs from release/${name}`, 'npm run release -- --resume');
        }
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
    log(`\nPublished ${where}; each downloaded asset has the SHA-256 of its local ZIP.`);
    for (const name of names) {
      log(`The URL of ${name} for Decaid's skin selector: ${assetUrl(JSON.parse(read('package.json')).repository, t, name)}`);
    }
    printLeft();
    return v;
  }

  function printLeft() {
    log('\nNot in the script, still to do:');
    for (const item of NOT_IN_SCRIPT) log(`- ${item}`);
  }
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    await release(process.argv.slice(2), process.cwd());
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    console.error(`\nrelease stopped: ${error.message}\nfix: ${error.fix}`);
    process.exit(1);
  }
}
