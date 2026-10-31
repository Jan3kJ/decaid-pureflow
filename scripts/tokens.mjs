// Part of `npm run lint`: one value per meaning. Outside src/app.css, which holds the tokens, a
// corner is a `--radius-*` token, a shadow a `--shadow-*`, a layer a `--layer-*`, a control's
// height a `--control-*` and a colour one of app.css's colours; a literal fails, with its file,
// line and rule, in a component's styles and in its markup.
import { APP_CSS, at, declarations, lineAt, markup, report, sources, tokenRem } from './css-rules.mjs';

/** The least control's height, the one e2e/touch-targets.spec.ts checks. */
const CONTROL = tokenRem('--control');
/**
 * From this height a min-height is a component's own (a pad's key, a chip, a stop button), below
 * CONTROL no control's (a line, a field's caption); the heights between are `--control` to
 * `--control-big`.
 */
const OWN_FROM = 4;

const RADIUS = /^var\(--radius(-[a-z]+)?\)$/;
const SHADOW = /^var\(--shadow-[a-z]+\)$/;
const LAYER = /^var\(--layer-[a-z-]+\)$/;

/** A colour written out: a hex colour or a colour function. */
const COLOUR = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|(?<![-\w])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/** Whether a value writes a colour out; a `url(#id)` points at an SVG element and is none. */
const writesColour = (value) => COLOUR.test(value.replace(/url\([^)]*\)/g, ''));

/** What a declaration's property writes out instead of its token, or null when it takes one. */
function untokened({ property, value }) {
  if (/^border(-[a-z]+)*-radius$/.test(property)) {
    return value === 'inherit' || value.split(/\s+/).every((part) => RADIUS.test(part)) ? null : 'a corner';
  }
  if (property === 'box-shadow') return value === 'none' || SHADOW.test(value) ? null : 'a shadow';
  if (property === 'z-index') return LAYER.test(value) ? null : 'a layer';
  if (property === 'min-height') {
    const rem = value.match(/^([\d.]+)rem$/);
    return rem && Number(rem[1]) >= CONTROL && Number(rem[1]) < OWN_FROM ? "a control's height" : null;
  }
  return null;
}

/** What a declaration writes out instead of a token, or null when it takes the tokens. */
const literal = (declaration) => untokened(declaration) ?? (writesColour(declaration.value) ? 'a colour' : null);

const MARKUP = [
  /style:(border(-[a-z]+)*-radius|box-shadow|z-index|min-height)\b/g,
  /style="[^"]*(?<![-\w])(border(-[a-z]+)*-radius|box-shadow|z-index|min-height)\s*:[^"]*"/g,
];

/** The attributes of the markup that can hold a colour. */
const COLOURED = /(?<![-\w])(?:style(?::[\w-]+)?|fill|stroke|stop-color|flood-color|lighting-color|color)="([^"]*)"/g;

const problems = [];
for (const source of sources()) {
  if (source.file === APP_CSS) continue;
  for (const declaration of declarations(source)) {
    const what = literal(declaration);
    if (what) problems.push(`${at(declaration)}: ${what}`);
  }
  const template = markup(source);
  if (template === null) continue;
  for (const pattern of MARKUP) {
    for (const match of template.matchAll(pattern)) {
      problems.push(`${source.file}:${lineAt(template, match.index)}: a token's property in the markup: ${match[0]}`);
    }
  }
  for (const match of template.matchAll(COLOURED)) {
    if (writesColour(match[1])) {
      problems.push(`${source.file}:${lineAt(template, match.index)}: a colour in the markup: ${match[0]}`);
    }
  }
}

report(
  problems,
  `A literal corner, shadow, layer, control height or colour outside ${APP_CSS} (it names the tokens)`,
  'tokens: every corner, shadow, layer, control height and colour is a token',
);
