import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, type AFlowParams } from '../aflow';
import { DecaidClient, type Profile } from '../api';
import { defaultProfile } from '../shell/profiles';
import { fakeGateway } from './gateway.fake';
import { buildProfile, saveAs, saveEdit } from './save';
import { readUnsaved, unsavedOnMachine } from './unsaved';

const light = DEFAULT_PROFILES[1];
const edited: AFlowParams = { ...light.params, infusePressure: 2.4 };
const about = { title: 'A-Flow / morning', author: 'Janek' };

describe('unsavedOnMachine', () => {
  it('nothing loaded, or a profile that is not A-Flow 3.0: nothing unsaved', () => {
    expect(unsavedOnMachine(undefined, [])).toBeNull();
    const other = { title: 'Best practice', notes: 'a classic', steps: [], target_weight: 36 } as unknown as Profile;
    expect(unsavedOnMachine(other, [])).toBeNull();
  });

  it('a default as the picker loads it: nothing unsaved, with or without its record', async () => {
    const gateway = fakeGateway();
    const profile = defaultProfile(light);
    expect(unsavedOnMachine(profile, [])).toBeNull();
    const record = await gateway.client.saveProfile(profile);
    expect(unsavedOnMachine(record.profile, gateway.records)).toBeNull();
  });

  it('a default with an edited value, loaded on leaving the editor: unsaved, under its title', () => {
    const profile = buildProfile(edited, { title: light.title }, false);
    expect(unsavedOnMachine(profile, [])).toEqual({ title: light.title, params: edited });
  });

  it('a saved profile: nothing unsaved; an edit of it loaded without saving: unsaved', async () => {
    const gateway = fakeGateway();
    const record = await saveAs(gateway.client, edited, about, false);
    expect(unsavedOnMachine(record.profile, gateway.records)).toBeNull();
    const next = { ...edited, pourPressure: 8.5 };
    expect(unsavedOnMachine(buildProfile(next, about, false), gateway.records)).toEqual({
      title: about.title,
      params: next,
    });
  });

  it('the dose alone counts as a change', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    const next = { ...edited, dose: 19 };
    expect(unsavedOnMachine(buildProfile(next, about, false), gateway.records)?.params).toEqual(next);
  });

  it('the same values under another title are not stored under this one', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    const profile = buildProfile(edited, { title: 'A-Flow / evening' }, false);
    expect(unsavedOnMachine(profile, gateway.records)).not.toBeNull();
  });

  it('an older version, hidden since, counts as saved: the history restores it', async () => {
    const gateway = fakeGateway();
    const first = await saveAs(gateway.client, edited, about, false);
    await saveEdit(gateway.client, { ...edited, pourPressure: 8.5 }, first, false);
    const all = await gateway.client.listProfiles({ includeHidden: true });
    expect(unsavedOnMachine(first.profile, all)).toBeNull();
  });

  it('the first-step workaround does not make saved values unsaved', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    expect(unsavedOnMachine(buildProfile(edited, about, true), gateway.records)).toBeNull();
  });
});

describe('readUnsaved', () => {
  it('reads the workflow and every profile, hidden ones too', async () => {
    const asked: string[] = [];
    const profile = buildProfile(edited, { title: light.title }, false);
    const client = new DecaidClient({
      baseUrl: 'http://gateway',
      fetch: async (url) => {
        asked.push(String(url));
        const body = String(url).includes('/workflow') ? { profile } : [];
        return new Response(JSON.stringify(body), { status: 200 });
      },
    });
    expect(await readUnsaved(client)).toEqual({ title: light.title, params: edited });
    expect(asked).toContain('http://gateway/api/v1/profiles?includeHidden=true');
  });
});
