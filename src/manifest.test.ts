import { describe, expect, it } from 'vitest';
import manifest from '../public/manifest.json';
import pkg from '../package.json';
import { PRODUCT_NAME } from './product';

describe('manifest.json', () => {
  it('has the id pureflow (decided 2026-10-18), one safe path component', () => {
    expect(manifest.id).toBe('pureflow');
    expect(manifest.id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);
  });

  it('carries every field Decaid reads', () => {
    for (const key of ['id', 'name', 'description', 'version', 'author', 'repository'] as const) {
      expect(manifest[key], key).toMatch(/\S/);
    }
  });

  it('has the same version as package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it('names the product shown on the page', () => {
    expect(PRODUCT_NAME).toBe(manifest.name);
  });
});
