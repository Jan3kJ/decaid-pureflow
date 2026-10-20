import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile, serializeParams, type AFlowParams } from '../aflow';
import type { DecaidClient } from '../api';
import { loadProfile } from '../shell/profiles';
import { fakeGateway } from './gateway.fake';
import { SKIN_METADATA, buildProfile, changed, loadOnLeave, nameOf, saveAs, saveEdit, storeAndLoad, titleOf } from './save';
import { StepsTakenError, paramsMetadata, readParams, readRecord, workflowNotes } from './storage';

const light = DEFAULT_PROFILES[1].params;
const edited: AFlowParams = { ...light, infusePressure: 2.4, stopWeight: 44, dose: 17.5 };
const about = { title: 'A-Flow / morning', author: 'Janek' };

describe('titles', () => {
  it('a saved profile is named like the defaults', () => {
    expect(titleOf('morning')).toBe('A-Flow / morning');
    expect(nameOf('A-Flow / morning')).toBe('morning');
    expect(nameOf('Best practice')).toBe('Best practice');
  });
});

describe('buildProfile', () => {
  it("is the generator's output, the parameters not in the notes, a text of the user kept", () => {
    expect(buildProfile(edited, about, false)).toEqual(generateProfile(edited, { ...about, notes: '' }));
    const notes = `${serializeParams(light)}\nmine`;
    expect(buildProfile(edited, { ...about, notes }, false).notes).toBe('mine');
  });

  it('adds the Pre Fill step with the first-step workaround, and only then', () => {
    expect(buildProfile(edited, about, false).steps[0].name).toBe('Fill');
    const profile = buildProfile(edited, about, true);
    expect(profile.steps[0].name).toBe('Pre Fill');
    expect(profile.steps).toHaveLength(buildProfile(edited, about, false).steps.length + 1);
  });
});

describe('saveAs', () => {
  it('stores a new named profile with one POST and no parent', async () => {
    const gateway = fakeGateway();
    const record = await saveAs(gateway.client, edited, about, false);

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles']);
    expect(gateway.calls[0].body).toEqual({
      profile: buildProfile(edited, about, false),
      metadata: { ...SKIN_METADATA, ...paramsMetadata(edited) },
    });
    expect(gateway.calls[0].body.profile.notes).toBe('');
    expect(record.profile.title).toBe('A-Flow / morning');
    expect(record.parentId).toBeNull();
    expect(readParams(record.profile)).toBeNull();
    expect(readRecord(record)).toEqual(edited);
  });

  it('refuses a new name for steps another visible profile has', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    const second = saveAs(gateway.client, { ...edited, dose: 18 }, { title: 'A-Flow / evening' }, false);
    await expect(second).rejects.toBeInstanceOf(StepsTakenError);
    expect(gateway.records).toHaveLength(1);
    expect(gateway.records[0].profile.title).toBe('A-Flow / morning');
  });
});

describe('saveEdit', () => {
  it("an edit of the curve: a new record with the parent's id, and the parent is hidden", async () => {
    const gateway = fakeGateway();
    const parent = await saveAs(gateway.client, edited, about, false);
    gateway.calls.length = 0;
    const next = { ...edited, pourPressure: 8.5 };

    const record = await saveEdit(gateway.client, next, parent, false);

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', `PUT /api/v1/profiles/${parent.id}/visibility`]);
    expect(gateway.calls[0].body.parentId).toBe(parent.id);
    expect(gateway.calls[0].body.profile.title).toBe('A-Flow / morning');
    expect(gateway.calls[0].body.profile.author).toBe('Janek');
    expect(gateway.calls[1].body).toEqual({ visibility: 'hidden' });
    expect(record.id).not.toBe(parent.id);
    expect(record.parentId).toBe(parent.id);
    expect(gateway.calls[0].body.metadata).toEqual({ ...SKIN_METADATA, ...paramsMetadata(next) });
    expect(readRecord(record)).toEqual(next);
    // The list shows the profile once.
    expect((await gateway.client.listProfiles()).map((r) => r.id)).toEqual([record.id]);
  });

  it('an edit of the dose alone: the same record, its metadata changed, nothing hidden', async () => {
    const gateway = fakeGateway();
    const parent = await saveAs(gateway.client, edited, about, false);
    gateway.calls.length = 0;
    const next = { ...edited, dose: 18 };

    const record = await saveEdit(gateway.client, next, parent, false);

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', `PUT /api/v1/profiles/${parent.id}`]);
    expect(record.id).toBe(parent.id);
    expect(record.visibility).toBe('visible');
    expect(readRecord(record)).toEqual(next);
  });

  it('a profile of version 1 is moved: the values go to the metadata, the notes keep only the text', async () => {
    const gateway = fakeGateway();
    const v1 = gateway.make(generateProfile(edited, { ...about, notes: `${serializeParams(edited)}\nfor the morning` }), {
      metadata: { source: 'pureflow', aflow: '3.0' },
    });
    gateway.records.push(v1);
    // It opens with its values, read from the notes.
    expect(readRecord(v1)).toEqual(edited);

    // A curve edit: a new version.
    const next = { ...edited, pourPressure: 8.5 };
    const record = await saveEdit(gateway.client, next, v1, false);
    expect(record.id).not.toBe(v1.id);
    expect(record.profile.notes).toBe('for the morning');
    expect(record.metadata).toEqual({ ...SKIN_METADATA, ...paramsMetadata(next) });
    expect(readRecord(record)).toEqual(next);

    // A dose edit: the same id, changed with a PUT.
    const other = gateway.make(generateProfile(light, { ...about, title: 'A-Flow / other', notes: serializeParams(light) }));
    gateway.records.push(other);
    const dose = { ...light, dose: 19 };
    const same = await saveEdit(gateway.client, dose, other, false);
    expect(same.id).toBe(other.id);
    expect(same.profile.notes).toBe('');
    expect(readRecord(same)).toEqual(dose);
  });

  it('an edit back to an earlier version: that record is shown again and the newer one hidden', async () => {
    const gateway = fakeGateway();
    const first = await saveAs(gateway.client, edited, about, false);
    const second = await saveEdit(gateway.client, { ...edited, pourPressure: 8.5 }, first, false);
    gateway.calls.length = 0;

    const record = await saveEdit(gateway.client, edited, second, false);

    expect(record.id).toBe(first.id);
    expect(gateway.sent()).toEqual([
      'POST /api/v1/profiles',
      `PUT /api/v1/profiles/${first.id}/visibility`,
      `PUT /api/v1/profiles/${second.id}/visibility`,
    ]);
    expect((await gateway.client.listProfiles()).map((r) => r.id)).toEqual([first.id]);
  });

  it('an edit to the steps of another visible profile changes nothing', async () => {
    const gateway = fakeGateway();
    const parent = await saveAs(gateway.client, edited, about, false);
    await saveAs(gateway.client, light, { title: 'A-Flow / other' }, false);
    await expect(saveEdit(gateway.client, light, parent, false)).rejects.toBeInstanceOf(StepsTakenError);
    expect(gateway.records.map((r) => r.visibility)).toEqual(['visible', 'visible']);
  });
});

describe('loading', () => {
  it("sends the built profile, its stop weight as the yield and its dose, with the picker's function", async () => {
    const gateway = fakeGateway();
    const profile = buildProfile(edited, about, false);
    await loadProfile(gateway.client, profile, {}, paramsMetadata(edited));

    expect(gateway.sent()).toEqual(['PUT /api/v1/workflow']);
    // The workflow has no metadata: its copy carries the values in its notes.
    expect(gateway.calls[0].body).toEqual({
      profile: { ...profile, notes: workflowNotes('', edited) },
      context: { targetYield: 44, targetDoseWeight: 17.5 },
    });
    expect(readParams(gateway.calls[0].body.profile)).toEqual(edited);
    expect(profile.target_weight).toBe(44);
  });

  it('save as, then load: one POST, then one PUT of the workflow with the stored profile', async () => {
    const gateway = fakeGateway();
    const stored = await storeAndLoad(gateway.client, () => saveAs(gateway.client, edited, about, false));

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', 'PUT /api/v1/workflow']);
    const loaded = { ...stored.record.profile, notes: workflowNotes('', edited) };
    expect(gateway.calls[1].body).toEqual({
      profile: loaded,
      context: { targetYield: 44, targetDoseWeight: 17.5 },
    });
    expect(stored.record.profile).toEqual(buildProfile(edited, about, false));
    expect('workflow' in stored && stored.workflow.profile).toEqual(loaded);
  });

  it('save, then load: the new version is what the machine gets', async () => {
    const gateway = fakeGateway();
    const parent = await saveAs(gateway.client, edited, about, false);
    gateway.calls.length = 0;
    const next = { ...edited, pourPressure: 8.5 };

    const stored = await storeAndLoad(gateway.client, () => saveEdit(gateway.client, next, parent, false));

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', `PUT /api/v1/profiles/${parent.id}/visibility`, 'PUT /api/v1/workflow']);
    expect(gateway.calls[2].body.profile).toEqual({ ...buildProfile(next, about, false), notes: workflowNotes('', next) });
    expect(stored.record.id).not.toBe(parent.id);
  });

  it('a save that fails loads nothing', async () => {
    const gateway = fakeGateway();
    await saveAs(gateway.client, edited, about, false);
    gateway.calls.length = 0;
    const store = () => saveAs(gateway.client, { ...edited, dose: 18 }, { title: 'A-Flow / evening' }, false);
    await expect(storeAndLoad(gateway.client, store)).rejects.toBeInstanceOf(StepsTakenError);
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles']);
  });

  it('a load that fails after the save keeps the record and says why', async () => {
    const gateway = fakeGateway();
    const record = gateway.make(buildProfile(edited, about, false));
    const failing = Object.create(gateway.client) as DecaidClient;
    failing.updateWorkflow = () => Promise.reject(new Error('no machine'));
    const stored = await storeAndLoad(failing, () => Promise.resolve(record));
    expect(stored.record).toBe(record);
    expect('error' in stored && (stored.error as Error).message).toBe('no machine');
  });

  it('leaving with changed values loads them once under the name they started from', async () => {
    const gateway = fakeGateway();
    const workflow = await loadOnLeave(gateway.client, edited, light, { title: 'A-Flow / default-light', author: 'Janek' }, false);

    expect(gateway.sent()).toEqual(['PUT /api/v1/workflow']);
    const built = buildProfile(edited, { title: 'A-Flow / default-light', author: 'Janek' }, false);
    const profile = { ...built, notes: workflowNotes('', edited) };
    expect(gateway.calls[0].body).toEqual({ profile, context: { targetYield: 44, targetDoseWeight: 17.5 } });
    expect(workflow?.profile).toEqual(profile);
    // Nothing is stored by leaving.
    expect(gateway.records).toHaveLength(0);
  });

  it('leaving without a change loads nothing', async () => {
    const gateway = fakeGateway();
    expect(await loadOnLeave(gateway.client, { ...light }, light, about, false)).toBeNull();
    expect(gateway.sent()).toEqual([]);
  });

  it('leaving with the first-step workaround on sends the Pre Fill step', async () => {
    const gateway = fakeGateway();
    await loadOnLeave(gateway.client, edited, light, about, true);
    expect(gateway.calls[0].body.profile.steps[0].name).toBe('Pre Fill');
  });

  it('a change is a change of any value, the dose too', () => {
    expect(changed({ ...light }, light)).toBe(false);
    expect(changed({ ...light, dose: light.dose + 0.1 }, light)).toBe(true);
    expect(changed({ ...light, flowUp: !light.flowUp }, light)).toBe(true);
  });
});
