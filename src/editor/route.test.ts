import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES } from '../aflow';
import type { Profile } from '../api';
import bundled from '../steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { defaultProfile } from '../shell/profiles';
import { editorFor } from './route';
import { buildProfile } from './save';

const bundledProfile = (title: string) => bundled.find((entry) => entry.title === title) as Profile;

describe('editorFor', () => {
  it('an A-Flow 3.0 default and a saved A-Flow 3.0 profile open in the A-Flow editor', () => {
    for (const entry of DEFAULT_PROFILES) expect(editorFor(defaultProfile(entry))).toBe('aflow');
    const saved = buildProfile({ ...DEFAULT_PROFILES[1].params, infusePressure: 2.4 }, { title: 'A-Flow / morning' }, true);
    expect(editorFor(saved)).toBe('aflow');
  });

  it("Decaid's bundled de1app A-Flow profiles open in the step editor: A-Flow by name, not by values", () => {
    expect(editorFor(bundledProfile('A-Flow / default-medium'))).toBe('steps');
  });

  it('an A-Flow 3.0 profile with one step changed elsewhere opens in the step editor', () => {
    const profile = defaultProfile(DEFAULT_PROFILES[0]);
    const changed = { ...profile, steps: profile.steps.map((step, i) => (i === 1 ? { ...step, temperature: 80 } : step)) };
    expect(editorFor(changed)).toBe('steps');
  });

  it('every other profile opens in the step editor; no profile in the A-Flow editor on a default', () => {
    expect(editorFor(bundledProfile('Blooming Espresso'))).toBe('steps');
    for (const profile of bundled) expect(editorFor(profile as Profile)).toBe('steps');
    expect(editorFor(null)).toBe('aflow');
    expect(editorFor(undefined)).toBe('aflow');
  });
});
