import { describe, expect, it } from 'vitest';
import type { DecaidClient, Profile, ProfileStep, Workflow } from '../api';
import { LoadWarning } from './load-warning.svelte';

// The warning before a load: it waits for the answer only while the machine holds edits that
// no stored profile has.

const STEPS: ProfileStep[] = [
  { name: 'pour', pump: 'flow', transition: 'fast', flow: 2, volume: 0, seconds: 30, temperature: 93, sensor: 'coffee' },
];

function client(profile: Partial<Profile> | null, stored: Partial<Profile>[] = []): DecaidClient {
  return {
    getWorkflow: () => Promise.resolve({ profile } as Workflow),
    listProfiles: () => Promise.resolve(stored.map((each, i) => ({ id: `p${i}`, profile: each }))),
  } as unknown as DecaidClient;
}

describe('the warning before a load', () => {
  it("answers 'load' without unsaved edits", async () => {
    const profile = { title: 'Mine', steps: STEPS, target_weight: 36 };
    const warning = new LoadWarning(client(profile, [profile]));
    expect(await warning.ask()).toBe('load');
    expect(warning.unsaved).toBeNull();
  });

  it("answers 'load' when the edits cannot be read: the load then says what went wrong", async () => {
    const away = () => Promise.reject(new Error('away'));
    const failing = { getWorkflow: away, listProfiles: away } as unknown as DecaidClient;
    expect(await new LoadWarning(failing).ask()).toBe('load');
  });

  it('shows the unsaved edits until the answer', async () => {
    const warning = new LoadWarning(client({ title: 'Mine', steps: STEPS, target_weight: 36 }));
    const asked = warning.ask();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warning.unsaved?.title).toBe('Mine');
    warning.answer('cancel');
    expect(await asked).toBe('cancel');
    expect(warning.unsaved).toBeNull();
  });
});
