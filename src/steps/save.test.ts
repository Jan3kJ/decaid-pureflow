import { describe, expect, it } from 'vitest';
import type { Profile, ProfileRecord } from '../api';
import { fakeGateway } from '../editor/gateway.fake';
import { StepsTakenError, writeProfile } from '../editor/storage';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import { insertStepAfter, moveStep, openProfile, removeStepAt, setValue } from './model';
import { canSaveOver, loadStepsOnLeave, profileChanged, saveStepAs, saveStepEdit, stepMetadata } from './save';

const blooming = bundled.find((entry) => entry.title === 'Blooming Espresso') as Profile;

/** Blooming Espresso as Decaid bundles it, and a copy the user saved from it. */
function setup() {
  const gateway = fakeGateway();
  const bundledRecord = gateway.make(blooming, { id: 'profile:blooming', isDefault: true, metadata: null });
  const mine = gateway.make(
    { ...blooming, title: 'My blooming', steps: blooming.steps.slice(0, 5) },
    {
      id: 'profile:mine',
      metadata: { source: 'pureflow', note: 'kept' },
    },
  );
  gateway.records.push(bundledRecord, mine);
  return { gateway, bundledRecord, mine };
}

/** A value, a step added, one deleted, one moved: the edits of acceptance 10. */
function edit(profile: Profile): Profile {
  let next = setValue(openProfile(profile), 1, 'target', 3.5);
  next = insertStepAfter(next, 2);
  next = removeStepAt(next, 0);
  return moveStep(next, 3, 1);
}

describe('stepMetadata', () => {
  it("is the parent's, marked as the skin's, without A-Flow keys", () => {
    expect(stepMetadata(null)).toEqual({ source: 'pureflow' });
    expect(stepMetadata({ source: 'other', aflow: '3.0', aflowValues: {}, beans: 'x' })).toEqual({
      source: 'pureflow',
      beans: 'x',
    });
  });
});

describe('saveStepEdit', () => {
  it('posts the edited steps with the parent, and hides the parent: both are in the lineage', async () => {
    const { gateway, mine } = setup();
    const edited = edit(mine.profile);
    const record = await saveStepEdit(gateway.client, edited, mine);
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', 'PUT /api/v1/profiles/profile:mine/visibility']);
    const post = gateway.calls[0].body;
    expect(post.parentId).toBe('profile:mine');
    expect(post.metadata).toEqual({ source: 'pureflow', note: 'kept' });
    expect(post.profile).toEqual(edited);
    expect(record.profile.steps).toEqual(edited.steps);
    expect(record.parentId).toBe('profile:mine');
    expect(gateway.records.find((entry) => entry.id === 'profile:mine')!.visibility).toBe('hidden');
  });

  it('a change outside the hash (the notes) is a PUT of the same record, nothing hidden', async () => {
    const { gateway, mine } = setup();
    const record = await saveStepEdit(gateway.client, { ...mine.profile, notes: 'new notes' }, mine);
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', 'PUT /api/v1/profiles/profile:mine']);
    expect(record.id).toBe('profile:mine');
    expect(record.profile.notes).toBe('new notes');
    expect(record.visibility).toBe('visible');
  });

  it('a new title from SETTINGS renames the profile: a PUT of the same record, not StepsTakenError', async () => {
    const { gateway, mine } = setup();
    const record = await saveStepEdit(gateway.client, { ...mine.profile, title: 'Blooming, renamed' }, mine);
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', 'PUT /api/v1/profiles/profile:mine']);
    expect(record.id).toBe('profile:mine');
    expect(record.profile.title).toBe('Blooming, renamed');
    expect(record.visibility).toBe('visible');
  });

  it('the settings (title, notes, target weight and volume, tank temperature) are in what is stored', async () => {
    const { gateway, mine } = setup();
    const edited: Profile = {
      ...mine.profile,
      title: 'Blooming 40 g',
      notes: 'longer bloom',
      target_weight: 40,
      target_volume: 60,
      tank_temperature: 30,
    };
    const record = await saveStepEdit(gateway.client, edited, mine);
    expect(gateway.calls[0].body.profile).toEqual(edited);
    expect(record.profile).toEqual(edited);
    // The target weight is in the id: a new record, the old one hidden.
    expect(record.id).not.toBe('profile:mine');
    expect(gateway.records.find((entry) => entry.id === 'profile:mine')!.visibility).toBe('hidden');
  });

  it('a new title with the steps of another visible profile is still refused', async () => {
    const { gateway, mine, bundledRecord } = setup();
    await expect(saveStepEdit(gateway.client, { ...bundledRecord.profile, title: 'Elsewhere' }, mine)).rejects.toBeInstanceOf(
      StepsTakenError,
    );
  });

  it('a bundled default is not saved over: only save as', () => {
    const { bundledRecord, mine } = setup();
    expect(canSaveOver(bundledRecord)).toBe(false);
    expect(canSaveOver(mine)).toBe(true);
    expect(canSaveOver(null)).toBe(false);
  });
});

describe('saveStepAs', () => {
  it('a copy of a bundled default under a new title, with the default as its parent; the source stays visible', async () => {
    const { gateway, bundledRecord } = setup();
    const edited = edit(blooming);
    const record = await saveStepAs(gateway.client, edited, 'Blooming, mine', bundledRecord);
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles']);
    expect(gateway.calls[0].body).toEqual({
      profile: { ...edited, title: 'Blooming, mine' },
      parentId: 'profile:blooming',
      metadata: { source: 'pureflow' },
    });
    expect(record.profile.title).toBe('Blooming, mine');
    expect(bundledRecord.visibility).toBe('visible');
  });

  it('the steps of another visible profile: nothing is changed, and it is named', async () => {
    const { gateway, bundledRecord } = setup();
    await expect(saveStepAs(gateway.client, blooming, 'Again', bundledRecord)).rejects.toBeInstanceOf(StepsTakenError);
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles']);
  });
});

describe('writeProfile', () => {
  it('steps of a hidden record are taken over with the title and made visible', async () => {
    const { gateway, mine } = setup();
    mine.visibility = 'hidden';
    const record = await writeProfile(gateway.client, { ...mine.profile, title: 'Back again' });
    expect(gateway.sent()).toEqual([
      'POST /api/v1/profiles',
      'PUT /api/v1/profiles/profile:mine',
      'PUT /api/v1/profiles/profile:mine/visibility',
    ]);
    expect(record).toMatchObject({ id: 'profile:mine', visibility: 'visible' });
    expect(record.profile.title).toBe('Back again');
  });

  it('the same profile again: the POST is all', async () => {
    const { gateway, mine } = setup();
    await writeProfile(gateway.client, structuredClone(mine.profile));
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles']);
  });
});

describe('leaving', () => {
  it('a changed profile is loaded, an unchanged one is not', async () => {
    const { gateway, mine } = setup();
    expect(await loadStepsOnLeave(gateway.client, openProfile(mine.profile), mine.profile)).toBeNull();
    expect(gateway.sent()).toEqual([]);
    const edited = edit(mine.profile);
    expect(profileChanged(edited, mine.profile)).toBe(true);
    await loadStepsOnLeave(gateway.client, edited, mine.profile);
    expect(gateway.sent()).toEqual(['PUT /api/v1/workflow']);
    expect(gateway.calls[0].body.profile).toEqual(edited);
  });
});

describe('a profile the editor cannot show fully', () => {
  it('is saved with every field it came with', async () => {
    const odd = {
      ...blooming,
      title: 'Odd',
      legacy_profile_type: 'settings_2c',
      steps: blooming.steps.map((step, i) =>
        i === 0 ? { ...step, exit: { type: 'weight', condition: 'over', value: 30 }, futureField: 1 } : step,
      ),
    } as Profile;
    const gateway = fakeGateway();
    const parent: ProfileRecord = gateway.make(odd, { id: 'profile:odd' });
    gateway.records.push(parent);
    const edited = setValue(openProfile(odd), 3, 'seconds', 6);
    await saveStepEdit(gateway.client, edited, parent);
    const sent = gateway.calls[0].body.profile;
    expect(sent.legacy_profile_type).toBe('settings_2c');
    expect(sent.steps[0]).toEqual(odd.steps[0]);
    expect(sent.steps[3]).toEqual({ ...odd.steps[3], seconds: 6 });
    expect({ ...sent, steps: odd.steps }).toEqual(odd);
  });
});
