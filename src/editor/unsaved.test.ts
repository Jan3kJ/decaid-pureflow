import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, type AFlowParams } from '../aflow';
import { DecaidClient, type Profile } from '../api';
import { defaultProfile } from '../shell/profiles';
import { fakeGateway } from './gateway.fake';
import { buildProfile, saveAs, saveEdit, type About } from './save';
import { paramsMetadata, workflowProfile } from './storage';
import bundled from '../steps/fixtures/bundled-profiles.json' with { type: 'json' };
import { readUnsaved, unsavedOnMachine } from './unsaved';

const light = DEFAULT_PROFILES[1];
const edited: AFlowParams = { ...light.params, infusePressure: 2.4 };
const about = { title: 'A-Flow / morning', author: 'Janek' };

/** The workflow's copy of these values, as `loadProfile` sends it: they are in its notes. */
const loaded = (params: AFlowParams, on: About, firstStepWorkaround = false) =>
  workflowProfile(buildProfile(params, on, firstStepWorkaround), params);

describe('unsavedOnMachine', () => {
  it('nothing loaded: nothing unsaved', () => {
    expect(unsavedOnMachine(undefined, [])).toBeNull();
  });

  it('a default as the picker loads it: nothing unsaved, with or without its record', async () => {
    const gateway = fakeGateway();
    const profile = workflowProfile(defaultProfile(light), light.params);
    expect(unsavedOnMachine(profile, [])).toBeNull();
    const record = await gateway.client.saveProfile(defaultProfile(light), { metadata: paramsMetadata(light.params) });
    expect(unsavedOnMachine(workflowProfile(record.profile, light.params), gateway.records)).toBeNull();
  });

  it('a default with an edited value, loaded on leaving the editor: unsaved, under its title', () => {
    const profile = loaded(edited, { title: light.title });
    expect(unsavedOnMachine(profile, [])).toEqual({ title: light.title, params: edited, profile });
  });

  it('a saved profile: nothing unsaved; an edit of it loaded without saving: unsaved', async () => {
    const gateway = fakeGateway();
    const record = await saveAs(gateway.client, edited, about, false);
    expect(unsavedOnMachine(workflowProfile(record.profile, edited), gateway.records)).toBeNull();
    const next = { ...edited, pourPressure: 8.5 };
    const profile = loaded(next, about);
    expect(unsavedOnMachine(profile, gateway.records)).toEqual({ title: about.title, params: next, profile });
  });

  it('the dose alone counts as a change', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    const next = { ...edited, dose: 19 };
    expect(unsavedOnMachine(loaded(next, about), gateway.records)?.params).toEqual(next);
  });

  it('the same values under another title are not stored under this one', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    const profile = loaded(edited, { title: 'A-Flow / evening' });
    expect(unsavedOnMachine(profile, gateway.records)).not.toBeNull();
  });

  it('an older version, hidden since, counts as saved: the history restores it', async () => {
    const gateway = fakeGateway();
    const first = await saveAs(gateway.client, edited, about, false);
    await saveEdit(gateway.client, { ...edited, pourPressure: 8.5 }, first, false);
    const all = await gateway.client.listProfiles({ includeHidden: true });
    expect(unsavedOnMachine(workflowProfile(first.profile, edited), all)).toBeNull();
  });

  it('the first-step workaround does not make saved values unsaved', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    expect(unsavedOnMachine(loaded(edited, about, true), gateway.records)).toBeNull();
  });
});

// The step editor's profiles: judged by their steps and target weight.
describe('unsavedOnMachine, a profile that is not A-Flow 3.0', () => {
  const blooming = bundled.find((entry) => entry.title === 'Blooming Espresso') as Profile;
  const stored = (profile: Profile, visibility: 'visible' | 'hidden' = 'visible') => {
    const gateway = fakeGateway();
    return gateway.make(profile, { visibility, isDefault: true });
  };

  it('a stored one, as the picker loads it: nothing unsaved', () => {
    expect(unsavedOnMachine(blooming, [stored(blooming)])).toBeNull();
  });

  it("notes or author of the workflow's copy do not count: Decaid does not hash them", () => {
    expect(unsavedOnMachine({ ...blooming, notes: 'other' }, [stored(blooming)])).toBeNull();
  });

  it('an edited step loaded on leaving the step editor: unsaved, under its title', () => {
    const profile = { ...blooming, steps: blooming.steps.map((step, i) => (i === 0 ? { ...step, temperature: 90 } : step)) };
    expect(unsavedOnMachine(profile, [stored(blooming)])).toEqual({ title: blooming.title, params: null, profile });
  });

  it('a hidden older version counts as saved; a profile whose record is gone is unsaved', () => {
    expect(unsavedOnMachine(blooming, [stored(blooming, 'hidden')])).toBeNull();
    expect(unsavedOnMachine(blooming, [])).toEqual({ title: blooming.title, params: null, profile: blooming });
  });

  it('the same steps under another title are not stored under this one', () => {
    expect(unsavedOnMachine({ ...blooming, title: 'Best of all' }, [stored(blooming)])).not.toBeNull();
  });
});

describe('readUnsaved', () => {
  it('reads the workflow and every profile, hidden ones too', async () => {
    const asked: string[] = [];
    const profile = loaded(edited, { title: light.title });
    const client = new DecaidClient({
      baseUrl: 'http://gateway',
      fetch: (url) => {
        asked.push(String(url));
        const body = String(url).includes('/workflow') ? { profile } : [];
        return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
      },
    });
    expect(await readUnsaved(client)).toEqual({ title: light.title, params: edited, profile });
    expect(asked).toContain('http://gateway/api/v1/profiles?includeHidden=true');
  });
});
