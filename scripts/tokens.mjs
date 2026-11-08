// Part of `npm run lint`: one value per meaning. Outside src/app.css, which holds the tokens, a
// corner is a `--radius-*` token, a shadow (also a glow of a text-shadow or a drop-shadow) a
// `--shadow-*`, a layer a `--layer-*`, a control's height a `--control-*` and a colour one of
// app.css's colours; a literal fails, with its file, line and rule, in a component's styles and in
// its markup. The rules themselves are in token-rules.mjs.
import { APP_CSS, at, declarations, lineAt, markup, report, sources } from './css-rules.mjs';
import { literal, writesColour } from './token-rules.mjs';

const MARKUP = [
  /style:(border(-[a-z]+)*-radius|box-shadow|text-shadow|filter|z-index|min-height)\b/g,
  /style="[^"]*(?<![-\w])(border(-[a-z]+)*-radius|box-shadow|text-shadow|filter|z-index|min-height)\s*:[^"]*"/g,
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
