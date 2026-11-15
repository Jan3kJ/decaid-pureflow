import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

// A glow marks what the user acts on: only the number pad's field and the lit line of a slider name a
// `--shadow-glow-*` token; a number the skin only shows has none. app.css defines them.

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );

describe('glow tokens', () => {
  it('are named by the number pad and the line slider only', () => {
    const naming = walk('src')
      .filter((file) => /\.(svelte|ts|css)$/.test(file) && !/glow-tokens\.test\.ts$|token-rules\.test\.ts$/.test(file))
      .filter((file) => !/app\.css$/.test(file))
      .filter((file) => /--shadow-glow-/.test(readFileSync(file, 'utf8')))
      .map((file) => file.replaceAll(sep, '/'))
      .sort();
    expect(naming).toEqual(['src/editor/NumberPad.svelte', 'src/ui/LineSlider.svelte']);
  });

  it('are all used', () => {
    const css = readFileSync('src/app.css', 'utf8');
    const sources = walk('src')
      .filter((file) => /\.(svelte|ts)$/.test(file) && !/\.test\.ts$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    for (const [, name] of css.matchAll(/^\s*(--shadow-glow-[a-z-]+):/gm)) {
      expect(sources, name).toContain(`var(${name})`);
    }
  });
});
