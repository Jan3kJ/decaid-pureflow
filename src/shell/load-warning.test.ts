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
    getWorkflow: () => Promise.resolve({ profile } as unknown as Workflow),
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

describe('the question about the workflow’s own water volume', () => {
  function withVolume(volume: number | null | undefined, fail = false) {
    const updates: unknown[] = [];
    const api = {
      getWorkflow: () =>
        Promise.resolve({ profile: null, context: volume === undefined ? {} : { targetWaterVolume: volume } } as unknown as Workflow),
      listProfiles: () => Promise.resolve([]),
      updateWorkflow: (patch: unknown) => {
        updates.push(patch);
        return fail ? Promise.reject(new Error('away')) : Promise.resolve({} as Workflow);
      },
    } as unknown as DecaidClient;
    return { warning: new LoadWarning(api), updates };
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

  it.each([null, undefined])('does not ask when there is none (%s)', async (volume) => {
    const { warning, updates } = withVolume(volume);
    expect(await warning.ask()).toBe('load');
    expect(warning.volume).toBeNull();
    expect(updates).toEqual([]);
  });

  it('asks about a value, 0 included, and sets it to null on clear', async () => {
    const { warning, updates } = withVolume(0);
    const asked = warning.ask();
    await settle();
    expect(warning.volume).toBe(0);
    warning.answerVolume('clear');
    expect(await asked).toBe('load');
    expect(warning.volume).toBeNull();
    expect(updates).toEqual([{ context: { targetWaterVolume: null } }]);
  });

  it('loads after a failed clear', async () => {
    const { warning } = withVolume(40, true);
    const asked = warning.ask();
    await settle();
    warning.answerVolume('clear');
    expect(await asked).toBe('load');
  });

  it('cancels the load on cancel, and writes nothing', async () => {
    const { warning, updates } = withVolume(40);
    const asked = warning.ask();
    await settle();
    warning.answerVolume('cancel');
    expect(await asked).toBe('cancel');
    expect(updates).toEqual([]);
  });

  it('keeps the value and does not ask again for it, but asks for another one', async () => {
    const { warning, updates } = withVolume(40);
    const asked = warning.ask();
    await settle();
    warning.answerVolume('keep');
    expect(await asked).toBe('load');
    expect(await warning.ask()).toBe('load');
    expect(updates).toEqual([]);
  });
});
