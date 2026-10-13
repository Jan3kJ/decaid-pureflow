import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile, serializeParams, type AFlowParams } from '../aflow';
import { loadProfile } from '../shell/profiles';
import { fakeGateway } from './gateway.fake';
import { SKIN_METADATA, buildProfile, nameOf, saveAs, saveEdit, titleOf } from './save';
import { StepsTakenError, readParams } from './storage';

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
  it('is the generator\'s output with the parameters in the notes', () => {
    expect(buildProfile(edited, about, false)).toEqual(
      generateProfile(edited, { ...about, notes: serializeParams(edited) }),
    );
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
      metadata: SKIN_METADATA,
    });
    expect(record.profile.title).toBe('A-Flow / morning');
    expect(record.parentId).toBeNull();
    expect(readParams(record.profile)).toEqual(edited);
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
  it('an edit of the curve: a new record with the parent\'s id, and the parent is hidden', async () => {
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
    expect(readParams(record.profile)).toEqual(next);
    // The list shows the profile once.
    expect((await gateway.client.listProfiles()).map((r) => r.id)).toEqual([record.id]);
  });

  it('an edit of the dose alone: the same record, its notes changed, nothing hidden', async () => {
    const gateway = fakeGateway();
    const parent = await saveAs(gateway.client, edited, about, false);
    gateway.calls.length = 0;
    const next = { ...edited, dose: 18 };

    const record = await saveEdit(gateway.client, next, parent, false);

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', `PUT /api/v1/profiles/${parent.id}`]);
    expect(record.id).toBe(parent.id);
    expect(record.visibility).toBe('visible');
    expect(readParams(record.profile)).toEqual(next);
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

describe('load to machine', () => {
  it('sends the built profile, its stop weight as the yield and its dose, with the picker\'s function', async () => {
    const gateway = fakeGateway();
    const profile = buildProfile(edited, about, false);
    await loadProfile(gateway.client, profile);

    expect(gateway.sent()).toEqual(['PUT /api/v1/workflow']);
    expect(gateway.calls[0].body).toEqual({
      profile,
      context: { targetYield: 44, targetDoseWeight: 17.5 },
    });
    expect(profile.target_weight).toBe(44);
  });
});
