// The walker of `npm run lint`'s style checks (font-sizes.mjs, spacing.mjs, tokens.mjs): every
// rule of src's .svelte files and src/app.css, its selectors and declarations with their lines,
// and each component's markup. A check filters what it walks and reports the rest.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** The token file: its literals are the skin's values, the components take its names. */
export const APP_CSS = 'src/app.css';

function paths(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return paths(path);
    return /\.(svelte|css)$/.test(entry.name) ? [path] : [];
  });
}

/** The line of an offset in a text. */
export const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

/** Blanks a block out, keeping offsets and lines. */
const blank = (block) => block.replace(/[^\n]/g, ' ');

/** Blanks comments out, keeping offsets and lines. */
export const uncomment = (text) => text.replace(/\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g, blank);

/** Every .svelte and .css file of src, its path from the repository's root and its text without comments. */
export function sources() {
  return paths(join(ROOT, 'src')).map((path) => ({
    file: relative(ROOT, path).replaceAll('\\', '/'),
    text: uncomment(readFileSync(path, 'utf8')),
  }));
}

/**
 * Every declaration of a source's styles (a .css file, or a component's `<style>`): its rule's
 * selectors, its property, its value and its line.
 */
export function* declarations({ file, text }) {
  const styles = file.endsWith('.css') ? [{ from: 0, css: text }] : [];
  for (const match of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
    styles.push({ from: match.index + match[0].indexOf(match[1]), css: match[1] });
  }
  for (const { from, css } of styles) {
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selectors = rule[1]
        .split(',')
        .map((selector) => selector.trim())
        .filter(Boolean);
      let at = from + rule.index + rule[1].length + 1;
      for (const part of rule[2].split(';')) {
        const colon = part.indexOf(':');
        if (colon > 0) {
          const property = part.slice(0, colon).trim();
          const value = part.slice(colon + 1).trim();
          const line = lineAt(text, at + part.length - part.trimStart().length);
          yield { file, line, selectors, property, value, text: `${property}: ${value}` };
        }
        at += part.length + 1;
      }
    }
  }
}

/** A component's markup with its script and style blanked out, or null for a .css file. */
export function markup({ file, text }) {
  if (!file.endsWith('.svelte')) return null;
  return text.replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/g, blank);
}

/** A problem of a declaration: its file, line, rule and the declaration. */
export const at = (declaration) =>
  `${declaration.file}:${declaration.line}: ${declaration.selectors.join(', ')} { ${declaration.text} }`;

/** A token's value in rem, as src/app.css's `:root` sets it (`--control: 3rem`). */
export function tokenRem(name) {
  const css = uncomment(readFileSync(join(ROOT, APP_CSS), 'utf8'));
  const match = css.match(new RegExp(`(?<![-\\w])${name}\\s*:\\s*([\\d.]+)rem\\s*;`));
  if (!match) throw new Error(`${APP_CSS} sets no ${name} in rem`);
  return Number(match[1]);
}

/** Ends a check: the problems under their heading and exit 1, or the line that all is well. */
export function report(problems, heading, ok) {
  if (problems.length) {
    console.error(`${heading}:\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(ok);
}
