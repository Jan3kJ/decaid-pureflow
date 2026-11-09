import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// An overlay lies over page content: its surface is the one --overlay token, never its own
// background and never the see-through glass. Inside an overlay a list may be glass.

const overlays = [
  'shell/Menu.svelte',
  'history/History.svelte',
  'ui/Dialog.svelte',
  'shell/DatePicker.svelte',
  'beans/Camera.svelte',
  'beans/Pick.svelte',
  'editor/NumberPad.svelte',
  'editor/NameDialog.svelte',
  'editor/NoticeOverlay.svelte',
  'shell/UnsavedDialog.svelte',
];

/** The backgrounds an overlay file may set: none, a scrim, a list's glass, the video's black. */
const allowed = /^(none|var\(--scrim(-light)?\)|var\(--glass\)|var\(--bg\)|var\(--overlay\))$/;

describe('overlay surfaces', () => {
  for (const file of overlays) {
    it(`${file} sets no background of its own`, () => {
      const source = readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
      const style = source.slice(source.indexOf('<style>'));
      const values = [...style.matchAll(/(?<![-\w])background(?:-color)?:\s*([^;]+);/g)].map((m) => m[1].trim());
      for (const value of values) expect(value).toMatch(allowed);
    });
  }

  it('the menu, the history and the dialog take the token', () => {
    for (const file of ['shell/Menu.svelte', 'history/History.svelte', 'ui/Dialog.svelte']) {
      expect(readFileSync(new URL(`./${file}`, import.meta.url), 'utf8')).toContain('background: var(--overlay);');
    }
  });

  it('the token is a base of at least 90 % alpha under the glass', () => {
    const css = readFileSync(new URL('./app.css', import.meta.url), 'utf8');
    const alpha = css.match(/--overlay:\s*var\(--glass\),\s*rgb\(var\(--bg-rgb\) \/ (\d+)%\)/);
    expect(Number(alpha?.[1])).toBeGreaterThanOrEqual(90);
  });
});
