// The pure parts of the release script: the trailers of a commit message, the
// entries and the bump they give, the version, the CHANGELOG section and the version writes.
// No file, git or network access here; scripts/release.mjs does that.
import { FLAVOURS, zipName } from './flavours.mjs';

/** The kinds of a `Changelog:` trailer, in the order of the CHANGELOG's headings. */
export const KINDS = ['added', 'changed', 'fixed'];
const HEADINGS = { added: 'Added', changed: 'Changed', fixed: 'Fixed' };

/** What the script leaves to people, printed at the end of every run. */
export const NOT_IN_SCRIPT = [
  "Decaid's install by URL: install the release's ZIP from its URL in Decaid's skin selector and open the skin (only once the repository is public; while it is private Decaid cannot fetch the URL)",
  "the maintainer's cold read of the user pages on the tablet",
  'the announcement',
  'making the repository public, on GitHub under Settings, Danger zone',
];

/**
 * The `Task:`, `Changelog:` and `Breaking:` lines of a commit message, read from its last two
 * paragraphs: the trailers often stand in a paragraph of their own, followed by a blank line and
 * the `Co-Authored-By` line, which `git interpret-trailers` does not see.
 */
export function readTrailers(message) {
  const paragraphs = message
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n[ \t]*\n/);
  const found = {};
  for (const paragraph of paragraphs.slice(-2)) {
    for (const line of paragraph.split('\n')) {
      const match = /^(Task|Changelog|Breaking)[ \t]*:[ \t]*(.*?)[ \t]*$/i.exec(line);
      if (match) found[match[1].toLowerCase()] = match[2];
    }
  }
  return {
    task: found.task || undefined,
    changelog: found.changelog?.toLowerCase() || undefined,
    breaking: /^(yes|true)$/i.test(found.breaking ?? ''),
  };
}

/** Parses `git log --format=%H%x1f%s%x1f%B%x1e`: one { hash, subject, message } a commit. */
export function parseLog(output) {
  return output
    .split('\x1e')
    .map((record) => record.replace(/^\s+/, ''))
    .filter((record) => record.includes('\x1f'))
    .map((record) => {
      const [hash, subject, message] = record.split('\x1f');
      return { hash, subject, message };
    });
}

/** A subject as an entry: without a leading task id and its colon, a capital, a full stop. */
export function entryText(subject) {
  const text = subject.trim().replace(/^[a-z][a-z0-9-]*:\s+/, '');
  const capital = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/**
 * The commits as entries. `notes` is `.release-notes.json`: a short hash maps to 'internal' or to
 * { kind, text }, for a commit whose message lacks the trailer or is wrong. Returns the entries
 * (internal ones included), the commits with no `Changelog:` trailer and those with a value that
 * is not a kind.
 */
export function classify(commits, notes = {}) {
  const entries = [];
  const missing = [];
  const invalid = [];
  for (const commit of commits) {
    const trailers = readTrailers(commit.message);
    const key = Object.keys(notes).find((short) => short.length >= 4 && commit.hash.startsWith(short.toLowerCase()));
    const note = key === undefined ? undefined : notes[key];
    let kind = trailers.changelog;
    let text = entryText(commit.subject);
    if (typeof note === 'string') kind = note.toLowerCase();
    else if (note) {
      kind = String(note.kind ?? '').toLowerCase();
      if (note.text) text = entryText(String(note.text));
    }
    if (kind === undefined) {
      missing.push(commit.hash);
      continue;
    }
    if (kind !== 'internal' && !KINDS.includes(kind)) {
      invalid.push({ hash: commit.hash, value: kind });
      continue;
    }
    entries.push({ hash: commit.hash, kind, text, task: trailers.task, breaking: trailers.breaking });
  }
  return { entries, missing, invalid };
}

/** The bump the entries need: major for a breaking one, minor for added or changed, patch for fixed only. */
export function bumpOf(entries) {
  const shown = entries.filter((entry) => entry.kind !== 'internal');
  if (shown.length === 0) return undefined;
  if (entries.some((entry) => entry.breaking)) return 'major';
  if (shown.some((entry) => entry.kind === 'added' || entry.kind === 'changed')) return 'minor';
  return 'patch';
}

/** 'X.Y.Z' as numbers, or undefined. */
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text).trim());
  return match ? match.slice(1, 4).map(Number) : undefined;
}

/** Negative, zero or positive as a is below, equal to or above b. */
export function compareVersions(a, b) {
  const [x, y] = [parseVersion(a), parseVersion(b)];
  if (!x || !y) throw new Error(`not a version: ${x ? b : a}`);
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
}

export function bumpVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`not a bump: ${bump}`);
}

/** The newest `vX.Y.Z` of a list of tags, without its v, or undefined. */
export function lastTag(tags) {
  const versions = tags
    .map((tag) => tag.trim())
    .filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag))
    .map((tag) => tag.slice(1));
  return versions.sort(compareVersions).at(-1);
}

/**
 * The version to release. `--version` wins, then `--bump` on the last tag. Otherwise the bump the
 * entries need on the last tag, unless package.json is already ahead of the tag by at least that
 * (a hand-over raised it): then it is kept. `major` says the major number goes up, which is asked.
 */
export function chooseVersion({ last, current, entries, bump, version }) {
  let chosen;
  let reason;
  if (version !== undefined) {
    if (!parseVersion(version)) throw new Error(`--version ${version} is not X.Y.Z`);
    chosen = version.replace(/^v/, '');
    reason = 'given with --version';
  } else if (bump !== undefined) {
    chosen = bumpVersion(last, bump);
    reason = `--bump ${bump} on ${last}`;
  } else {
    const needed = bumpOf(entries);
    const candidate = bumpVersion(last, needed);
    if (current !== undefined && compareVersions(current, candidate) >= 0) {
      chosen = current;
      reason = `package.json is ahead of the last tag v${last}; kept`;
    } else {
      chosen = candidate;
      reason = `a ${needed} bump on ${last}`;
    }
  }
  if (compareVersions(chosen, last) <= 0) throw new Error(`${chosen} is not above the last tag v${last}`);
  return { version: chosen, reason, major: parseVersion(chosen)[0] > parseVersion(last)[0] };
}

/** The result line of the checks: the release notes never claim what was not run. */
export function checksLine(rig) {
  return rig
    ? 'Checks: npm ci, npm run verify, npm run e2e and the rig suite passed.'
    : 'Checks: npm ci, npm run verify and npm run e2e passed; rig suite: not run.';
}

/** The CHANGELOG section of a release: its heading, the entries grouped Added, Changed, Fixed with their task, the checks. */
export function changelogSection({ version, date, entries, checks }) {
  const lines = [`## ${version} - ${date}`, ''];
  for (const kind of KINDS) {
    const group = entries.filter((entry) => entry.kind === kind);
    if (group.length === 0) continue;
    lines.push(`### ${HEADINGS[kind]}`, '');
    for (const entry of group) lines.push(`- ${entry.text}${entry.task ? ` (${entry.task})` : ''}`);
    lines.push('');
  }
  lines.push(checks, '');
  return lines.join('\n');
}

/** CHANGELOG.md with the section on top, above the newest version's. */
export function insertSection(changelog, section) {
  const eol = changelog.includes('\r\n') ? '\r\n' : '\n';
  const text = changelog.replace(/\r\n/g, '\n');
  const at = text.search(/^## /m);
  const result = at < 0 ? `${text.replace(/\n*$/, '\n\n')}${section}` : `${text.slice(0, at)}${section}\n${text.slice(at)}`;
  return result.replace(/\n/g, eol);
}

/** The body of a version's section in CHANGELOG.md (the release notes), or undefined. */
export function sectionOf(changelog, version) {
  const text = changelog.replace(/\r\n/g, '\n');
  const start = text.search(new RegExp(`^## ${version.replace(/\./g, '\\.')} - `, 'm'));
  if (start < 0) return undefined;
  const body = text.slice(start).replace(/^.*\n/, '');
  const end = body.search(/^## /m);
  return (end < 0 ? body : body.slice(0, end)).trim() + '\n';
}

/**
 * A JSON file of package.json, package-lock.json or the manifest with the version set, at the top
 * and in package-lock.json's root package, with the file's own line ends and indent of two.
 */
export function withVersion(text, version) {
  const data = JSON.parse(text);
  data.version = version;
  if (data.packages?.['']) data.packages[''].version = version;
  const out = `${JSON.stringify(data, null, 2)}\n`;
  return text.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out;
}

/** The line of release/SHA256SUMS.txt for a file, as `sha256sum` writes it. */
export function sumsLine(hex, name) {
  return `${hex}  ${name}\n`;
}

/** The ZIPs of a release, base first: `<id>-<version>.zip` and `<id>-<version>-ocr.zip`. */
export function releaseZips(id, version) {
  return FLAVOURS.map((flavour) => zipName(id, version, flavour));
}

/** release/SHA256SUMS.txt for { name: hex }, one line a ZIP in the order given. */
export function sumsText(hashes) {
  return Object.entries(hashes)
    .map(([name, hex]) => sumsLine(hex, name))
    .join('');
}

/** The release notes' paragraph that says which ZIP is which; `ocrBytes` is the ocr ZIP's size. */
export function zipsNote([base, ocr], ocrBytes) {
  const megabytes = Math.max(1, Math.round(ocrBytes / 1e6));
  return `Files: ${base}: the skin; ${ocr}: the skin that also reads the bean bag, about ${megabytes} MB. Take the small one unless the reading is wanted.\n`;
}

/**
 * The rig's spec files in the groups they run in, each under ten minutes: a spec the first three
 * groups do not name goes into the last.
 */
export function rigGroups(files) {
  const first =
    'aflow-defaults aflow-import aflow-open bean-photo beans editor heartbeat history hot-water menu-clean menu-shortcuts metadata picker-delete picker-graph rings-everywhere scale-sleep';
  const third = 'shot steam step-editor swipe temp-filter water-ring water';
  const named = (list) => (file) => list.split(' ').includes(file.replace(/\.spec\.ts$/, ''));
  const specs = files.filter((file) => file.endsWith('.spec.ts')).sort();
  const groups = [
    specs.filter(named(first)),
    specs.filter((file) => file.startsWith('settings-') || file === 'shot-end.spec.ts'),
    specs.filter(named(third)),
  ];
  groups.push(specs.filter((file) => !groups.flat().includes(file)));
  return groups.filter((group) => group.length > 0).map((group) => group.map((file) => `e2e-rig/${file}`));
}

/** The download URL of a release's asset, from package.json's repository. */
export function assetUrl(repository, tag, name) {
  const url = typeof repository === 'string' ? repository : repository?.url;
  const base = String(url ?? '')
    .replace(/^git\+/, '')
    .replace(/\.git$/, '');
  return `${base}/releases/download/${tag}/${name}`;
}
