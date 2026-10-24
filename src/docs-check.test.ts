import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// scripts/docs-check.mjs (spec 3.13, acceptance 83): every link and image of README.md and
// docs/user/ resolves. It passes on the repository's own tree and fails on a planted broken link,
// a missing image and a missing anchor.

const script = join(import.meta.dirname, '..', 'scripts', 'docs-check.mjs');
const check = (root?: string) => spawnSync(process.execPath, root ? [script, root] : [script], { encoding: 'utf8' });

let root: string;

function tree(files: Record<string, string>) {
  root = mkdtempSync(join(tmpdir(), 'docs-check-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

afterEach(() => {
  if (root) rmSync(root, { recursive: true, force: true });
});

const GOOD = {
  'README.md':
    '# pureflow\n\n![home](docs/user/img/home.png)\n\nSee [the guide](docs/user/guide.md#the-steam-page) and [Decaid](https://example.org).\n',
  'docs/user/guide.md':
    '# Guide\n\n## The steam page\n\n![steam](img/steam.png)\n\n<img src="img/home.png" alt="home">\n\nBack to [the top](#guide), [install](install.md).\n\n```\n[not a link](nowhere.md)\n```\n',
  'docs/user/install.md': '# Install\n\n[Reference link][guide]\n\n[guide]: ./guide.md#guide\n',
  'docs/user/img/home.png': 'png',
  'docs/user/img/steam.png': 'png',
};

describe('docs-check', () => {
  it("passes on the repository's tree", () => {
    const run = check();
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });

  it('passes on a tree whose links, images and anchors all resolve', () => {
    const run = check(tree(GOOD));
    expect(run.stderr).toBe('');
    expect(run.status).toBe(0);
  });

  it('fails on a broken link', () => {
    const run = check(tree({ ...GOOD, 'docs/user/install.md': '# Install\n\nSee [the guide](guides.md).\n' }));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('install.md: guides.md (no such file)');
  });

  it('fails on a missing image', () => {
    const files: Record<string, string> = { ...GOOD };
    delete files['docs/user/img/steam.png'];
    const run = check(tree(files));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('guide.md: img/steam.png (no such file)');
  });

  it('fails on a missing anchor', () => {
    const run = check(tree({ ...GOOD, 'README.md': '# pureflow\n\n[Steam](docs/user/guide.md#steam)\n' }));
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('README.md: docs/user/guide.md#steam (no such anchor)');
  });
});
