import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// Every modal is one component: no other component draws a modal frame, its corner or an Escape handler.
const SRC = join(import.meta.dirname, '..');

function components(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return components(path);
    return entry.name.endsWith('.svelte') ? [path] : [];
  });
}

const others = components(SRC).filter((path) => relative(SRC, path).replaceAll('\\', '/') !== 'ui/Dialog.svelte');

describe('Dialog', () => {
  it('is the only component with aria-modal, an element with a dialog role, the dialog corner or an Escape key', () => {
    const found = others.filter((path) =>
      /aria-modal|<[a-z]+\b[^>]*\brole="(alert)?dialog"|--radius-dialog|key === 'Escape'/.test(readFileSync(path, 'utf8')),
    );
    expect(found.map((path) => relative(SRC, path))).toEqual([]);
  });

  it('the modals are drawn with it', () => {
    for (const name of [
      'beans/Camera',
      'beans/Pick',
      'editor/NameDialog',
      'editor/NumberPad',
      'settings-page/Confirm',
      'settings-page/SkinCategory',
      'shell/DatePicker',
      'shell/NoScaleDialog',
      'shell/UnsavedDialog',
      'steps/StepEditor',
    ]) {
      expect(readFileSync(join(SRC, `${name}.svelte`), 'utf8'), name).toContain('<Dialog');
    }
  });
});
