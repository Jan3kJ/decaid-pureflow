import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile, serializeParams, type AFlowParams } from '../aflow';
import type { Profile } from '../api';
import { fakeGateway } from './gateway.fake';
import { StepsTakenError, paramsNotes, readParams, sameSteps, writeParams } from './storage';

const light = DEFAULT_PROFILES[1].params;
const edited: AFlowParams = { ...light, infusePressure: 2.4, stopWeight: 44 };

function profileOf(params: AFlowParams, title = 'A-Flow / mine', firstStepWorkaround = false): Profile {
  return generateProfile(params, { title, notes: paramsNotes(params), firstStepWorkaround }) as Profile;
}

/** A profile as the gateway returns it: other key order, `null` where a field was left out. */
function fromGateway(profile: Profile): Profile {
  return {
    ...profile,
    steps: profile.steps.map((step) => {
      const { name, ...rest } = step;
      return { exit: null, ...rest, name };
    }),
  };
}

describe('readParams', () => {
  it('reads back what was written, for every default', () => {
    for (const entry of DEFAULT_PROFILES) {
      expect(readParams(profileOf(entry.params))).toEqual(entry.params);
    }
  });

  it('keeps the place in the notes: the codec string, nothing else', () => {
    expect(profileOf(edited).notes).toBe(serializeParams(edited));
  });

  it('reads a profile that came back from the gateway', () => {
    expect(readParams(fromGateway(profileOf(edited)))).toEqual(edited);
  });

  it('reads a profile that was generated with the first-step workaround', () => {
    const profile = profileOf(edited, 'A-Flow / mine', true);
    expect(profile.steps[0].name).toBe('Pre Fill');
    expect(readParams(profile)).toEqual(edited);
  });

  it('gives null for a profile that is not A-Flow 3.0', () => {
    const profile = profileOf(light);
    expect(readParams({ ...profile, notes: 'A-Flow: an alternative profile for D-Flow' })).toBeNull();
    expect(readParams({ ...profile, notes: undefined })).toBeNull();
    expect(readParams({ ...profile, notes: '{"aflow":"2.0","params":{}}' })).toBeNull();
  });

  it('gives null when the steps are not the generator\'s for these parameters', () => {
    const profile = profileOf(light);
    // The steps were changed elsewhere and the notes stayed.
    const steps = profile.steps.map((step, i) => (i === 1 ? { ...step, seconds: 12 } : step));
    expect(readParams({ ...profile, steps })).toBeNull();
    expect(readParams({ ...profile, steps: profile.steps.slice(1) })).toBeNull();
    expect(readParams({ ...profile, target_weight: 30 })).toBeNull();
  });

  it('gives null when a value is out of range', () => {
    const params = { ...light, fillTemperature: 120 };
    expect(readParams(profileOf(params))).toBeNull();
  });

  it('reads a flow above the default maximum, up to the widest the setting allows (20 ml/s)', () => {
    // Saved with the maximum flow set to 12, read after it went back to 8.
    const fast = { ...light, pourFlow: 12 };
    expect(readParams(profileOf(fast))).toEqual(fast);
    expect(readParams(profileOf({ ...light, pourFlow: 20.5 }))).toBeNull();
  });
});

describe('sameSteps', () => {
  it('ignores key order and nulls, not values', () => {
    const steps = profileOf(light).steps;
    expect(sameSteps(steps, fromGateway(profileOf(light)).steps)).toBe(true);
    expect(sameSteps(steps, profileOf(edited).steps)).toBe(false);
  });
});

describe('writeParams', () => {
  it('new steps: one POST, the parameters in the notes', async () => {
    const gateway = fakeGateway();
    const record = await writeParams(gateway.client, profileOf(edited), edited, { metadata: { a: 1 } });

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles']);
    expect(gateway.calls[0].body.profile.notes).toBe(serializeParams(edited));
    expect(gateway.calls[0].body.metadata).toEqual({ a: 1 });
    expect(readParams(record.profile)).toEqual(edited);
  });

  it('writes the notes itself: a profile with other notes is stored with the parameters', async () => {
    const gateway = fakeGateway();
    const record = await writeParams(gateway.client, { ...profileOf(edited), notes: 'a text' }, edited);
    expect(record.profile.notes).toBe(serializeParams(edited));
  });

  it('steps that exist under the same title with old notes: the notes are changed with a PUT', async () => {
    const gateway = fakeGateway();
    const old = gateway.make({ ...profileOf(edited), notes: 'old notes' });
    gateway.records.push(old);
    // Only the dose differs: the steps and the target weight, and so the id, are the same.
    const params = { ...edited, dose: 18.5 };

    const record = await writeParams(gateway.client, profileOf(params), params);

    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', `PUT /api/v1/profiles/${old.id}`]);
    expect(gateway.calls[1].body.profile.notes).toBe(serializeParams(params));
    expect(record.id).toBe(old.id);
    expect(readParams(record.profile)).toEqual(params);
    expect(gateway.records).toHaveLength(1);
  });

  it('steps that exist with the same notes: the POST is all', async () => {
    const gateway = fakeGateway();
    await writeParams(gateway.client, profileOf(edited), edited);
    const again = await writeParams(gateway.client, profileOf(edited), edited);
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles', 'POST /api/v1/profiles']);
    expect(again.id).toBe('profile:new1');
  });

  it('steps that exist as a visible profile with another title: nothing is changed', async () => {
    const gateway = fakeGateway();
    const other = gateway.make(profileOf(edited, 'A-Flow / default-light'));
    gateway.records.push(other);

    const write = writeParams(gateway.client, profileOf(edited, 'A-Flow / mine'), edited);

    await expect(write).rejects.toBeInstanceOf(StepsTakenError);
    await expect(write).rejects.toThrow('A-Flow / default-light');
    expect(gateway.sent()).toEqual(['POST /api/v1/profiles']);
    expect(gateway.records[0].profile.title).toBe('A-Flow / default-light');
  });

  it('steps that exist as a hidden record: it is taken over and made visible', async () => {
    const gateway = fakeGateway();
    const hidden = gateway.make(profileOf(edited, 'A-Flow / older'), { visibility: 'hidden' });
    gateway.records.push(hidden);

    const record = await writeParams(gateway.client, profileOf(edited, 'A-Flow / mine'), edited, {
      metadata: { a: 1 },
    });

    expect(gateway.sent()).toEqual([
      'POST /api/v1/profiles',
      `PUT /api/v1/profiles/${hidden.id}`,
      `PUT /api/v1/profiles/${hidden.id}/visibility`,
    ]);
    expect(record.id).toBe(hidden.id);
    expect(record.profile.title).toBe('A-Flow / mine');
    expect(record.visibility).toBe('visible');
    expect(record.metadata).toEqual({ a: 1 });
  });

  it('passes on what the gateway refuses', async () => {
    const gateway = fakeGateway();
    // A bundled default with the same steps and title: its content cannot be changed.
    gateway.records.push(gateway.make({ ...profileOf(edited), notes: 'bundled' }, { isDefault: true }));
    await expect(writeParams(gateway.client, profileOf(edited), edited)).rejects.toThrow(
      'Cannot modify default profile content',
    );
  });
});
