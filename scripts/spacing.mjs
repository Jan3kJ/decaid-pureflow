// Part of `npm run lint`: one rhythm of space. Every `gap`, `row-gap` and `column-gap` in src's
// .svelte files and src/app.css is one of the four spacing tokens (`var(--space-1)` ...
// `var(--space-4)`), one per axis; a literal gap fails, with its file, line and rule. The one
// form beside them: `min(<token>, <n>cqw)`, a token that shrinks with a drawing sized in its
// container's width (the water ring's figures).
import { at, declarations, lineAt, markup, report, sources } from './css-rules.mjs';

const TOKEN = /^var\(--space-[1-4]\)$/;
const SHRINKING = /^min\(var\(--space-[1-4]\),\s*[\d.]+cqw\)$/;

/** Whether a gap's value is one token, or two (row and column), or a shrinking token. */
function allowed(value) {
  if (SHRINKING.test(value)) return true;
  const parts = value.split(/\s+/);
  return parts.length <= 2 && parts.every((part) => TOKEN.test(part));
}

const GAPS = ['gap', 'row-gap', 'column-gap'];

const problems = [];
for (const source of sources()) {
  for (const declaration of declarations(source)) {
    if (GAPS.includes(declaration.property) && !allowed(declaration.value)) problems.push(at(declaration));
  }
  const template = markup(source);
  if (template === null) continue;
  for (const match of template.matchAll(/style:(row-|column-)?gap|style="[^"]*(?<![-\w])(row-|column-)?gap\s*:[^"]*"/g)) {
    problems.push(`${source.file}:${lineAt(template, match.index)}: a gap in the markup: ${match[0]}`);
  }
}

report(problems, 'A gap that is no spacing token (src/app.css names the four)', 'spacing: every gap is a spacing token');
