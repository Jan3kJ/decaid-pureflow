// Part of `npm run lint`: one rhythm of space. Every `gap`, `row-gap` and `column-gap` in src's
// .svelte files and src/app.css is one of the four spacing tokens (`var(--space-1)` ...
// `var(--space-4)`), one per axis; a literal gap fails, with its file, line and rule. The one
// form beside them: `min(<token>, <n>cqw)`, a token that shrinks with a drawing sized in its
// container's width (the water ring's figures).
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const TOKEN = /^var\(--space-[1-4]\)$/;
const SHRINKING = /^min\(var\(--space-[1-4]\),\s*[\d.]+cqw\)$/;

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

/** Whether a gap's value is one token, or two (row and column), or a shrinking token. */
function allowed(value) {
  if (SHRINKING.test(value)) return true;
  const parts = value.split(/\s+/);
  return parts.length <= 2 && parts.every((part) => TOKEN.test(part));
}

const problems = [];
for (const path of files('src')) {
  const file = relative('.', path).replaceAll('\\', '/');
  const text = uncomment(readFileSync(path, 'utf8'));
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
      for (const declaration of rule[2].matchAll(/(?<![-\w])(gap|row-gap|column-gap)\s*:\s*([^;]+)/g)) {
        if (allowed(declaration[2].trim())) continue;
        problems.push(`${file}:${lineAt(text, bodyAt + declaration.index)}: ${selectors.join(', ')} { ${declaration[0].trim()} }`);
      }
    }
  }
  if (file.endsWith('.svelte')) {
    const template = text.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/g, (block) => block.replace(/[^\n]/g, ' '));
    for (const match of template.matchAll(/style:(row-|column-)?gap|style="[^"]*(?<![-\w])(row-|column-)?gap\s*:[^"]*"/g)) {
      problems.push(`${file}:${lineAt(template, match.index)}: a gap in the markup: ${match[0]}`);
    }
  }
}

if (problems.length) {
  console.error(`A gap that is no spacing token (src/app.css names the four):\n${problems.join('\n')}`);
  process.exit(1);
}
console.log('spacing: every gap is a spacing token');
