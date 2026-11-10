import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The pressed light of a button is app.css's one rule (a glow that fades on release): no component
// sets a glow of its own on `:active`, which would show twice or cut the fade short.

const SRC = import.meta.dirname;

function components(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? components(path) : entry.name.endsWith('.svelte') ? [path] : [];
  });
}

describe('pressed light', () => {
  it('is not set by a component on :active', () => {
    const own = components(SRC).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/([^{}]*:active[^{}]*)\{([^}]*)\}/g)]
        .filter(([, , body]) => /box-shadow/.test(body))
        .map(([, selector]) => `${file}: ${selector.trim()}`),
    );
    expect(own).toEqual([]);
  });
});
