// Part of `npm run lint`: one size per kind of text. Every font size in
// src's .svelte files and src/app.css is a role's token (`var(--text-label)` ... `var(--text-big)`)
// or `inherit`; a literal size fails, with its file, line and rule. The exceptions are named here,
// rule by rule, and in their files: the graphs' SVG text and the ring's figures, which fit their
// drawing, and the root size that every rem follows.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ALLOWED = {
  'src/app.css': [':root', ':root[data-portrait]'],
  'src/graph/ShotGraph.svelte': ['text'],
  'src/editor/Graph.svelte': ['text', 'text.value'],
  'src/editor/GraphGrid.svelte': ['text', '.phase', '.tick'],
  'src/shell/Water.svelte': ['.kind', '.time', '.values', '.target', '.stop strong'],
};

const TOKEN = /^var\(--text-(label|body|value|title|large|big)\)$/;

function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.(svelte|css)$/.test(entry.name) ? [path] : [];
  });
}

/** The line of an offset in a text. */
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

/** Blanks comments out, keeping offsets and lines. */
const uncomment = (text) => text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, (comment) => comment.replace(/[^\n]/g, ' '));

/** A declaration's size, or null when it sets none: `font-size: x`, or the size inside `font: x`. */
function sizeOf(property, value) {
  if (property === 'font-size') return value;
  if (value === 'inherit' || !/\d/.test(value)) return null;
  return value;
}

const problems = [];
for (const path of files('src')) {
  const file = relative('.', path).replaceAll('\\', '/');
  const text = uncomment(readFileSync(path, 'utf8'));
  const allowed = ALLOWED[file] ?? [];
  const styles = file.endsWith('.css') ? [{ from: 0, css: text }] : [];
  for (const match of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    styles.push({ from: match.index + match[0].indexOf(match[1]), css: match[1] });
  }
  for (const { from, css } of styles) {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = rule[1]
        .split(',')
        .map((selector) => selector.trim().replace(/^.*\{\s*/, ''))
        .filter(Boolean);
      const bodyAt = from + rule.index + rule[1].length + 1;
      for (const declaration of rule[2].matchAll(/(font-size|font)\s*:\s*([^;]+)/g)) {
        const size = sizeOf(declaration[1], declaration[2].trim());
        if (size === null || TOKEN.test(size) || size === 'inherit') continue;
        if (selectors.every((selector) => allowed.includes(selector))) continue;
        problems.push(`${file}:${lineAt(text, bodyAt + declaration.index)}: ${selectors.join(', ')} { ${declaration[0].trim()} }`);
      }
    }
  }
  if (file.endsWith('.svelte')) {
    const template = text.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/g, (block) => block.replace(/[^\n]/g, ' '));
    for (const match of template.matchAll(/style:font-size|font-size\s*=|style="[^"]*font(-size)?\s*:[^"]*"/g)) {
      problems.push(`${file}:${lineAt(template, match.index)}: a font size in the markup: ${match[0]}`);
    }
  }
}

if (problems.length) {
  console.error(`A font size that is no role's token (spec 3.14; src/app.css names the roles):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('font sizes: every size is a role token');
