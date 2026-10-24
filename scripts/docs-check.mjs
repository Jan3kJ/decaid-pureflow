// `npm run docs-check [root]`: every link and image of README.md and the Markdown of docs/user/
// resolves (spec 3.13, acceptance 83). A relative path must name a file or folder of the tree, an
// anchor a heading (GitHub's slug) or an `id`/`name` of the Markdown file it points to. Links with
// a scheme (https:, mailto:) are not fetched. Exits 1 and lists what does not resolve.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] ?? '.');

/** README.md and every .md under docs/user/. */
function documents() {
  const found = existsSync(join(root, 'README.md')) ? [join(root, 'README.md')] : [];
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.md')) found.push(path);
    }
  };
  walk(join(root, 'docs', 'user'));
  return found;
}

/** The text without fenced code blocks and inline code, where a bracket is not a link. */
const prose = (text) => text.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');

/** The targets of links and images: inline, reference definitions, and HTML src and href. */
function targets(text) {
  const found = [];
  for (const match of text.matchAll(/!?\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g)) {
    found.push(match[1].replace(/^<|>$/g, ''));
  }
  for (const match of text.matchAll(/^ {0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/gm)) found.push(match[1].replace(/^<|>$/g, ''));
  for (const match of text.matchAll(/<(?:img|a|source)\b[^>]*?\s(?:src|href|srcset)\s*=\s*["']([^"']+)["']/gi)) found.push(match[1]);
  return found;
}

/** GitHub's anchor of a heading: lower case, punctuation dropped, spaces to dashes, repeats numbered. */
function anchors(text) {
  const seen = new Map();
  const result = new Set();
  for (const match of prose(text).matchAll(/^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/gm)) {
    const plain = match[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/<[^>]+>/g, '');
    const slug = plain
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, '')
      .replace(/\s/g, '-');
    const count = seen.get(slug) ?? 0;
    seen.set(slug, count + 1);
    result.add(count ? `${slug}-${count}` : slug);
  }
  for (const match of text.matchAll(/<[a-z]+\b[^>]*?\s(?:id|name)\s*=\s*["']([^"']+)["']/gi)) result.add(match[1]);
  return result;
}

const problems = [];
for (const file of documents()) {
  const text = readFileSync(file, 'utf8');
  for (const target of targets(prose(text))) {
    if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('//')) continue;
    const [path, anchor] = target.split('#', 2);
    const decoded = decodeURIComponent(path);
    const to = decoded === '' ? file : decoded.startsWith('/') ? join(root, decoded) : resolve(dirname(file), decoded);
    const where = `${relative(root, file)}: ${target}`;
    if (!existsSync(to)) {
      problems.push(`${where} (no such file)`);
    } else if (
      anchor &&
      statSync(to).isFile() &&
      to.endsWith('.md') &&
      !anchors(readFileSync(to, 'utf8')).has(decodeURIComponent(anchor))
    ) {
      problems.push(`${where} (no such anchor)`);
    }
  }
}

if (problems.length) {
  console.error(`docs-check: ${problems.length} link(s) do not resolve\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`docs-check: ${documents().length} file(s), every link and image resolves`);
