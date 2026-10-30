import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES } from '../aflow';
import plugin12 from '../aflow/fixtures/plugin-1.2.json' with { type: 'json' };
import type { Profile } from '../api';
import bundled from '../steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { defaultProfile } from '../shell/profiles';
import { editorFor } from './route';
import { buildProfile } from './save';
import { workflowProfile } from './storage';

const bundledProfile = (title: string) => bundled.find((entry) => entry.title === title) as Profile;

describe('editorFor', () => {
  // The workflow's copy carries the values in its notes (loadProfile, storage.ts).
  it('an A-Flow 3.0 default and a saved A-Flow 3.0 profile, as loaded, open in the A-Flow editor', () => {
    for (const entry of DEFAULT_PROFILES) expect(editorFor(workflowProfile(defaultProfile(entry), entry.params))).toBe('aflow');
    const params = { ...DEFAULT_PROFILES[1].params, infusePressure: 2.4 };
    const saved = buildProfile(params, { title: 'A-Flow / morning' }, true);
    expect(editorFor(workflowProfile(saved, params))).toBe('aflow');
    // The stored profile alone, without its record's metadata, is A-Flow by its steps.
    expect(editorFor(saved)).toBe('aflow');
  });

  it("Decaid's bundled de1app A-Flow profiles and the plugin's older ones open in the A-Flow editor, by their steps", () => {
    for (const profile of bundled.filter((entry) => entry.title.startsWith('A-Flow /')))
      expect(editorFor(profile as Profile)).toBe('aflow');
    for (const profile of plugin12) expect(editorFor(profile as Profile)).toBe('aflow');
  });

  it('an A-Flow profile with a step changed elsewhere opens in the step editor', () => {
    const profile = workflowProfile(defaultProfile(DEFAULT_PROFILES[0]), DEFAULT_PROFILES[0].params);
    const changed = { ...profile, steps: profile.steps.map((step, i) => (i === 1 ? { ...step, temperature: 80 } : step)) };
    expect(editorFor(changed)).toBe('steps');
    const medium = bundledProfile('A-Flow / default-medium');
    const limited = {
      ...medium,
      steps: medium.steps.map((step) => (step.name === 'Fill' ? { ...step, limiter: { value: 7, range: 0.6 } } : step)),
    };
    expect(editorFor(limited)).toBe('steps');
  });

  it('every other profile opens in the step editor; no profile in the A-Flow editor on a default', () => {
    expect(editorFor(bundledProfile('Blooming Espresso'))).toBe('steps');
    for (const profile of bundled.filter((entry) => !entry.title.startsWith('A-Flow /')))
      expect(editorFor(profile as Profile)).toBe('steps');
    expect(editorFor(null)).toBe('aflow');
    expect(editorFor(undefined)).toBe('aflow');
  });
});
