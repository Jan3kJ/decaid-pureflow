import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// The on/off switch is one component: no other component draws a switch or styles a lever.
const SRC = join(import.meta.dirname, '..');

function components(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return components(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

const others = components(SRC).filter((path) => relative(SRC, path).replaceAll('\\', '/') !== 'ui/Lever.svelte');

describe('Lever', () => {
  it('is the only component with role="switch" or a .lever rule', () => {
    const found = others.filter((path) => /role="switch"|\.lever\b/.test(readFileSync(path, 'utf8')));
    expect(found.map((path) => relative(SRC, path))).toEqual([]);
  });

  it('the settings components draw their switches with it', () => {
    for (const name of ['Bengle', 'Devices', 'FieldRow', 'Help', 'Plugins', 'Presence', 'SkinCategory']) {
      expect(readFileSync(join(SRC, 'settings-page', `${name}.svelte`), 'utf8'), name).toContain('<Lever');
    }
  });
});
