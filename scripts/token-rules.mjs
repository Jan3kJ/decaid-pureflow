// The rules of scripts/tokens.mjs, apart from the walk, so that src/token-rules.test.ts can try them.
import { tokenRem } from './css-rules.mjs';

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
/** A glow's value: tokens, a list of them, or none. */
const GLOWS = /^var\(--shadow-[a-z-]+\)(?:\s*,\s*var\(--shadow-[a-z-]+\))*$/;
/** A drop shadow of a filter takes a shadow token: `drop-shadow(var(--shadow-glow-flow))`. */
const DROP_SHADOW = /drop-shadow\(\s*var\(--shadow-[a-z-]+\)\s*\)/g;
const LAYER = /^var\(--layer-[a-z-]+\)$/;

/** A colour written out: a hex colour or a colour function. */
const COLOUR = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|(?<![-\w])(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;

/** Whether a value writes a colour out; a `url(#id)` points at an SVG element and is none. */
export const writesColour = (value) => COLOUR.test(value.replace(/url\([^)]*\)/g, ''));

/** What a declaration's property writes out instead of its token, or null when it takes one. */
export function untokened({ property, value }) {
  if (/^border(-[a-z]+)*-radius$/.test(property)) {
    return value === 'inherit' || value.split(/\s+/).every((part) => RADIUS.test(part)) ? null : 'a corner';
  }
  if (property === 'box-shadow') return value === 'none' || SHADOW.test(value) ? null : 'a shadow';
  if (property === 'text-shadow') return value === 'none' || GLOWS.test(value) ? null : 'a text shadow';
  if (property === 'filter' || property === 'backdrop-filter') {
    const drops = value.match(/drop-shadow\(/g)?.length ?? 0;
    return (value.match(DROP_SHADOW)?.length ?? 0) === drops ? null : 'a drop shadow';
  }
  if (property === 'z-index') return LAYER.test(value) ? null : 'a layer';
  if (property === 'min-height') {
    const rem = value.match(/^([\d.]+)rem$/);
    return rem && Number(rem[1]) >= CONTROL && Number(rem[1]) < OWN_FROM ? "a control's height" : null;
  }
  return null;
}

/** What a declaration writes out instead of a token, or null when it takes the tokens. */
export const literal = (declaration) => untokened(declaration) ?? (writesColour(declaration.value) ? 'a colour' : null);
