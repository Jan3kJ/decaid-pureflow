// Part of `npm run lint`: one size per kind of text. Every font size in
// src's .svelte files and src/app.css is a role's token (`var(--text-label)` ... `var(--text-big)`)
// or `inherit`; a literal size fails, with its file, line and rule. The exceptions are named here,
// rule by rule, and in their files: the graphs' SVG text and the ring's figures, which fit their
// drawing, and the root size that every rem follows.
import { at, declarations, lineAt, markup, report, sources } from './css-rules.mjs';

const ALLOWED = {
  'src/app.css': [':root', ':root[data-portrait]'],
  'src/graph/ShotGraph.svelte': ['text'],
  'src/editor/Graph.svelte': ['text', 'text.value'],
  'src/editor/GraphGrid.svelte': ['text', '.phase', '.tick'],
  'src/shell/Water.svelte': ['.kind', '.time', '.values', '.target', '.stop strong'],
};

const TOKEN = /^var\(--text-(label|body|value|title|large|big)\)$/;

/** A declaration's size, or null when it sets none: `font-size: x`, or the size inside `font: x`. */
function sizeOf(property, value) {
  if (property === 'font-size') return value;
  if (value === 'inherit' || !/\d/.test(value)) return null;
  return value;
}

const problems = [];
for (const source of sources()) {
  const allowed = ALLOWED[source.file] ?? [];
  for (const declaration of declarations(source)) {
    if (declaration.property !== 'font-size' && declaration.property !== 'font') continue;
    const size = sizeOf(declaration.property, declaration.value);
    if (size === null || TOKEN.test(size) || size === 'inherit') continue;
    if (declaration.selectors.every((selector) => allowed.includes(selector))) continue;
    problems.push(at(declaration));
  }
  const template = markup(source);
  if (template === null) continue;
  for (const match of template.matchAll(/style:font-size|font-size\s*=|style="[^"]*font(-size)?\s*:[^"]*"/g)) {
    problems.push(`${source.file}:${lineAt(template, match.index)}: a font size in the markup: ${match[0]}`);
  }
}

report(
  problems,
  "A font size that is no role's token (the six type-role tokens; src/app.css names the roles)",
  'font sizes: every size is a role token',
);
