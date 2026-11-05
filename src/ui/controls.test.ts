import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The shared looks of a control are defined in app.css only: the button reset and the classes
// below. A component may add to a class (a width, a taller height) or make a variant of it
// (`.notice.warn`), but not write its look again.
const SRC = join(import.meta.dirname, '..');

function components(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return components(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

interface Rule {
  file: string;
  selectors: string[];
  declarations: string[];
}

/** Every rule of a stylesheet: its selectors and its declarations as `property: value`. */
function rules(file: string, css: string): Rule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    file,
    selectors: match[1].split(/,(?![^(]*\))/).map((selector) => selector.trim().replace(/\s+/g, ' ')),
    declarations: match[2]
      .split(';')
      .map((declaration) => declaration.trim().replace(/\s*:\s*/, ': '))
      .filter(Boolean),
  }));
}

const APP = rules('app.css', readFileSync(join(SRC, 'app.css'), 'utf8'));
const COMPONENTS = components(SRC).flatMap((path) => {
  const style = /<style[^>]*>([\s\S]*?)<\/style>/.exec(readFileSync(path, 'utf8'));
  return style ? rules(relative(SRC, path).replaceAll('\\', '/'), style[1]) : [];
});

/** The declarations of app.css's rule for a selector. */
function look(selector: string): string[] {
  const rule = APP.find((entry) => entry.selectors.includes(selector));
  if (!rule) throw new Error(`app.css has no rule for ${selector}`);
  return rule.declarations;
}

const RESET = look(':where(button)');
const CLASSES = {
  action: look('.action'),
  'big-number': look('.big-number'),
  'filter-field': look('.filter-field'),
  chip: look('.chip'),
  'form-button': look('.form-button'),
  hint: look('.hint'),
  notice: look('.notice'),
  primary: look(':root :is(button, label).primary'),
  seg: look('.seg'),
};

/**
 * The parts of the pages built twice, which their shared components hold: SidePage and ValueLine
 * (src/ui), ProfileName (src/editor), Form and Field (src/beans).
 */
const SHARED_PARTS: Record<string, RegExp> = {
  'steam/Steam.svelte': /^(aside|\.line|button\.line|\.key|\.reading\b.*|\.stop|\.header|\.big b)$/,
  'hotwater/HotWater.svelte': /^(aside|\.line|button\.line|\.key|\.reading\b.*|\.stop|\.header)$/,
  'editor/EditorHeader.svelte': /^(\.seg\b.*|\.name\b.*|button)$/,
  'steps/StepEditor.svelte': /^(\.seg\b.*|\.name\b.*)$/,
  'beans/BeanForm.svelte': /^(\.form|h2|label|input\b.*|\.missing input|button\b.*|\.primary|\.actions|\.archived)$/,
  'beans/GrinderForm.svelte': /^(\.form|h2|label|input\b.*|\.missing input|button\b.*|\.primary|\.actions|\.archived)$/,
};

/** A selector that styles buttons by their element: `button`, `.row button`, `button.value`. */
const BUTTONS = /(^|[\s>+~(])button\b/;

describe('the shared looks of a control', () => {
  it('app.css resets every button', () => {
    expect(RESET).toEqual(['font: inherit', 'color: var(--fg)', 'touch-action: manipulation', 'user-select: none']);
  });

  it('no component resets its buttons again', () => {
    const found = COMPONENTS.filter(
      (rule) => rule.selectors.some((selector) => BUTTONS.test(selector)) && rule.declarations.some((d) => RESET.includes(d)),
    );
    expect(found.map((rule) => `${rule.file}: ${rule.selectors.join(', ')}`)).toEqual([]);
  });

  it('no component writes a shared class look again', () => {
    const found = Object.entries(CLASSES).flatMap(([name, shared]) =>
      COMPONENTS.filter(
        (rule) => rule.selectors.includes(`.${name}`) && rule.declarations.some((declaration) => shared.includes(declaration)),
      ).map((rule) => `${rule.file}: ${rule.selectors.join(', ')} repeats .${name}`),
    );
    expect(found).toEqual([]);
  });

  it('no component cuts a line or hides a text by hand', () => {
    const truncate = look('.truncate');
    const hidden = look('.visually-hidden');
    const found = COMPONENTS.filter(
      (rule) =>
        truncate.every((declaration) => rule.declarations.includes(declaration)) ||
        rule.declarations.includes('clip-path: inset(50%)'),
    );
    expect(hidden).toContain('clip-path: inset(50%)');
    expect(found.map((rule) => `${rule.file}: ${rule.selectors.join(', ')}`)).toEqual([]);
  });

  it('the pages built twice take their shared parts from one place', () => {
    const found = Object.entries(SHARED_PARTS).flatMap(([file, parts]) => {
      const own = COMPONENTS.filter((rule) => rule.file === file);
      expect(own.length, file).toBeGreaterThan(0);
      return own
        .filter((rule) => rule.selectors.some((selector) => parts.test(selector)))
        .map((rule) => `${file}: ${rule.selectors.join(', ')}`);
    });
    expect(found).toEqual([]);
  });
});
