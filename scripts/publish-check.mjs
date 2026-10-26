// `node scripts/publish-check.mjs [--history] [root]`: nothing private is in the product repository
// (spec 3.13 item 3, 3.15 step 8). It fails on a Windows path, an e-mail address other than the
// noreply ones, a MAC address that does not start with AA:BB:CC:, the name of the messenger the
// team's runner talks through, and a token pattern. Without the flag it reads the tracked files of
// the working tree (CI, on the tip); with `--history` it reads every blob of `git rev-list --all`,
// every commit message, author and committer, and the annotated tags. Binary files are skipped.
// With `--cut=<dir>` (the team repository, before the cut of spec 3.15) it reads the tracked files
// as the cut makes them: only the paths of `<dir>/paths.txt`, rewritten by the rules of
// `<dir>/text.txt` (git filter-repo's formats). Exits 1 and lists what it found.
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
const history = args.includes('--history');
const cut = args.find((arg) => arg.startsWith('--cut='))?.slice('--cut='.length);
const root = resolve(args.find((arg) => !arg.startsWith('--')) ?? '.');

/** The addresses a commit may carry: the founder's GitHub noreply one and the co-author line's. */
const ALLOWED_ADDRESSES = new Set(['52261469+jan3kj@users.noreply.github.com', 'noreply@anthropic.com']);

// Some words are written in parts so that this file passes its own check.
const RULES = [
  { name: 'Windows path', pattern: /(?<![A-Za-z0-9])[A-Za-z]:[\\/]+(?=[A-Za-z0-9_.~$%-])/g },
  {
    name: 'e-mail address',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g,
    allow: (match) => ALLOWED_ADDRESSES.has(match.toLowerCase()),
  },
  {
    name: 'MAC address',
    pattern: /(?<![0-9A-Fa-f:-])[0-9A-Fa-f]{2}([:-])(?:[0-9A-Fa-f]{2}\1){4}[0-9A-Fa-f]{2}(?![0-9A-Fa-f:-])/g,
    allow: (match) => /^aa[:-]bb[:-]cc[:-]/i.test(match),
  },
  { name: 'messenger', pattern: new RegExp('tele' + 'gram', 'gi') },
  {
    name: 'token',
    pattern: new RegExp(
      [
        String.raw`\b\d{8,10}:[A-Za-z0-9_-]{35}\b`,
        String.raw`\bgh[pousr]_[A-Za-z0-9]{36,}\b`,
        String.raw`\bgithub_pat_[A-Za-z0-9_]{22,}\b`,
        String.raw`\bsk-ant-[A-Za-z0-9_-]{20,}`,
        String.raw`\bsk-[A-Za-z0-9]{32,}\b`,
        String.raw`\bAKIA[0-9A-Z]{16}\b`,
        String.raw`\bxox[abprs]-[A-Za-z0-9-]{10,}`,
        '-----BEGIN [A-Z ]*PRIV' + 'ATE KEY-----',
      ].join('|'),
      'g',
    ),
  },
];

/** What the rules find in a text, as `line: rule: match`. */
function scan(text) {
  const found = [];
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const rule of RULES) {
      for (const match of line.matchAll(rule.pattern)) {
        if (rule.allow?.(match[0])) continue;
        found.push(`${index + 1}: ${rule.name}: ${match[0]}`);
      }
    }
  });
  return found;
}

/** A blob with a NUL byte in its first 8000 bytes is binary, as git decides it. */
const binary = (bytes) => bytes.subarray(0, 8000).includes(0);

function git(...command) {
  const result = spawnSync('git', ['-C', root, ...command], { encoding: 'utf8', maxBuffer: 1 << 30 });
  if (result.status !== 0) throw new Error(`git ${command.join(' ')}: ${result.stderr.trim()}`);
  return result.stdout;
}

/** Every blob of `git rev-list --all` with one path it had, read through one `git cat-file --batch`. */
async function historyBlobs(report) {
  const paths = new Map();
  for (const line of git('rev-list', '--all', '--objects').split('\n')) {
    const [sha, ...path] = line.split(' ');
    if (sha && path.length && !paths.has(sha)) paths.set(sha, path.join(' '));
  }
  const shas = git('cat-file', '--batch-check=%(objectname) %(objecttype)', '--batch-all-objects')
    .split('\n')
    .map((line) => line.split(' '))
    .filter(([sha, type]) => type === 'blob' && paths.has(sha))
    .map(([sha]) => sha);
  const child = spawn('git', ['-C', root, 'cat-file', '--batch'], { stdio: ['pipe', 'pipe', 'inherit'] });
  child.stdin.end(shas.join('\n') + '\n');
  let buffer = Buffer.alloc(0);
  for await (const chunk of child.stdout) {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const end = buffer.indexOf(10);
      if (end < 0) break;
      const [sha, , size] = buffer.subarray(0, end).toString().split(' ');
      const length = Number(size);
      if (buffer.length < end + 1 + length + 1) break;
      const bytes = buffer.subarray(end + 1, end + 1 + length);
      buffer = buffer.subarray(end + 1 + length + 1);
      if (!binary(bytes)) report(`${paths.get(sha)} (blob ${sha.slice(0, 10)})`, bytes.toString('utf8'));
    }
  }
  return shas.length;
}

/** The lines of a filter-repo input file, without comments and blank lines. */
const ruleLines = (file) =>
  readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith('#'));

/** A glob of `--paths-from-file`: `*` and `?` match any character, `/` too (Python's fnmatch). */
const globPattern = (glob) =>
  new RegExp(
    `^${glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')}$`,
  );

/** Whether the cut keeps a path: a plain line keeps the file or the folder it names. */
function cutKeeps(dir) {
  const tests = ruleLines(join(dir, 'paths.txt')).map((line) => {
    if (line.startsWith('regex:')) {
      const pattern = new RegExp(line.slice('regex:'.length));
      return (path) => pattern.test(path);
    }
    if (line.startsWith('glob:')) {
      const pattern = globPattern(line.slice('glob:'.length));
      return (path) => pattern.test(path);
    }
    return (path) => path === line || path.startsWith(line.endsWith('/') ? line : `${line}/`);
  });
  return (path) => tests.some((keeps) => keeps(path));
}

/** The text as `--replace-text` leaves it: `regex:` or literal rules, `==>` the replacement. */
function cutText(dir) {
  const rules = ruleLines(join(dir, 'text.txt')).map((line) => {
    const [from, to = '***REMOVED***'] = line.split('==>');
    if (!from.startsWith('regex:')) return (text) => text.split(from).join(to);
    const pattern = new RegExp(from.slice('regex:'.length), 'g');
    // Python's replacement: `\1` is a group, `\\` a backslash.
    const replace = (_, ...groups) => to.replace(/\\(\d|\\)/g, (__, c) => (c === '\\' ? '\\' : (groups[c - 1] ?? '')));
    return (text) => text.replace(pattern, replace);
  });
  return (text) => rules.reduce((result, rule) => rule(result), text);
}

const problems = [];
const report = (where, text) => {
  for (const finding of scan(text)) problems.push(`${where}:${finding}`);
};

let summary;
if (history) {
  const commits = git('log', '--all', '--format=%H%x00%an <%ae>%x00%cn <%ce>%x00%B%x01').split('\x01\n');
  let count = 0;
  for (const record of commits) {
    if (!record.trim()) continue;
    const [sha, author, committer, message] = record.replace(/^\n/, '').split('\x00');
    count += 1;
    report(`commit ${sha.slice(0, 10)} author`, author);
    report(`commit ${sha.slice(0, 10)} committer`, committer);
    report(`commit ${sha.slice(0, 10)} message`, message);
  }
  for (const line of git(
    'for-each-ref',
    'refs/tags',
    '--format=%(refname:short)%00%(taggername) %(taggeremail)%00%(contents)%01',
  ).split('\x01\n')) {
    if (!line.trim()) continue;
    const [tag, tagger, contents] = line.replace(/^\n/, '').split('\x00');
    report(`tag ${tag} tagger`, tagger);
    report(`tag ${tag} message`, contents);
  }
  const blobs = await historyBlobs(report);
  summary = `${count} commits, ${blobs} blobs`;
} else {
  const keeps = cut ? cutKeeps(resolve(root, cut)) : () => true;
  const rewrite = cut ? cutText(resolve(root, cut)) : (text) => text;
  const files = git('ls-files', '-z')
    .split('\0')
    .filter((file) => file && keeps(file));
  for (const file of files) {
    let bytes;
    try {
      bytes = readFileSync(join(root, file));
    } catch {
      continue;
    }
    if (!binary(bytes)) report(file, rewrite(bytes.toString('utf8')));
  }
  summary = `${files.length} files${cut ? ' as the cut makes them' : ''}`;
}

if (problems.length) {
  console.error(`publish-check: ${problems.length} found (${summary}):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`publish-check: clean (${summary}${history ? ', every revision' : ', the tip'})`);
