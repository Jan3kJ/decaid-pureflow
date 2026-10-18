import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILES, serializeParams } from '../aflow';
import { paramsMetadata, workflowProfile } from '../editor/storage';
import { DecaidClient, type Profile, type ProfileRecord } from '../api';
import {
  defaultProfile,
  doseOf,
  doseToSet,
  isAFlow3,
  loadProfile,
  loadRecord,
  missingDefaults,
  sameProfile,
  saveDefaults,
  sortProfiles,
} from './profiles';

function record(profile: Profile, over: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    id: `profile:${profile.title}`,
    profile,
    metadataHash: '',
    compoundHash: '',
    parentId: null,
    visibility: 'visible',
    isDefault: false,
    createdAt: '',
    updatedAt: '',
    metadata: null,
    ...over,
  };
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

const light = defaultProfile(DEFAULT_PROFILES[1]);
const other: Profile = { title: 'Best practice', steps: [], target_volume_count_start: 0, tank_temperature: 0 };

/** A client whose requests are recorded and answered with `answer`. */
function client(answer: (method: string, path: string, body: unknown) => unknown) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? 'GET', path, body });
    return new Response(JSON.stringify(answer(init?.method ?? 'GET', path, body)), { status: 200 });
  });
  return { client: new DecaidClient({ fetch }), calls };
}

describe('sameProfile', () => {
  it('holds over the round trip through the gateway', () => {
    expect(sameProfile(light, fromGateway(light))).toBe(true);
  });

  it('needs the same steps: a title is not enough', () => {
    const bundled = { ...light, steps: light.steps.slice(1) };
    expect(sameProfile(light, bundled)).toBe(false);
    expect(sameProfile(light, { ...light, title: 'copy' })).toBe(false);
  });
});

describe('missingDefaults', () => {
  it('offers all five, in the order of the founder, to a gateway that has none', () => {
    expect(missingDefaults([record(other)]).map((entry) => entry.id)).toEqual([
      'default-floral',
      'default-light',
      'default-medium',
      'default-dark',
      'default-46mm',
    ]);
  });

  it('does not take the plugin default that Decaid bundles under the same title for a 3.0 one', () => {
    const bundled = record({ ...light, steps: [...light.steps, light.steps[0]] });
    expect(missingDefaults([bundled])).toHaveLength(5);
  });

  it('leaves out what the gateway has', () => {
    const has = [record(fromGateway(light)), record(fromGateway(defaultProfile(DEFAULT_PROFILES[4])))];
    expect(missingDefaults(has).map((entry) => entry.id)).toEqual(['default-floral', 'default-medium', 'default-dark']);
    expect(missingDefaults(DEFAULT_PROFILES.map((entry) => record(defaultProfile(entry))))).toEqual([]);
  });
});

describe('saveDefaults', () => {
  it('posts each profile to /api/v1/profiles, marked as the skin’s A-Flow 3.0', async () => {
    const { client: api, calls } = client((_method, _path, body) =>
      record((body as { profile: Profile }).profile),
    );
    const saved = await saveDefaults(api, DEFAULT_PROFILES.slice(0, 2));
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /api/v1/profiles',
      'POST /api/v1/profiles',
    ]);
    expect(calls[0].body).toEqual({
      profile: defaultProfile(DEFAULT_PROFILES[0]),
      metadata: { source: 'decaid-skin', ...paramsMetadata(DEFAULT_PROFILES[0].params) },
    });
    expect((calls[0].body as { profile: Profile }).profile.notes).toBe('');
    expect(saved.map((item) => item.profile.title)).toEqual(['A-Flow / default-floral', 'A-Flow / default-light']);
  });
});

describe('sortProfiles', () => {
  it('puts the skin’s A-Flow 3.0 profiles first in their order, then other A-Flow, then the rest', () => {
    const ours = { metadata: { source: 'decaid-skin', aflow: '3.0' } };
    const list = [
      record(other),
      record({ ...other, title: 'A-Flow / default-like-dflow' }),
      record(defaultProfile(DEFAULT_PROFILES[3]), ours),
      record({ ...other, title: 'Adaptive' }),
      record(defaultProfile(DEFAULT_PROFILES[0]), ours),
    ];
    expect(isAFlow3(list[2])).toBe(true);
    expect(isAFlow3(list[1])).toBe(false);
    expect(sortProfiles(list).map((item) => item.profile.title)).toEqual([
      'A-Flow / default-floral',
      'A-Flow / default-dark',
      'A-Flow / default-like-dflow',
      'Adaptive',
      'Best practice',
    ]);
  });
});

describe('loadProfile', () => {
  it('loads with PUT /api/v1/workflow: the profile, its stop weight as target yield and its dose', async () => {
    const { client: api, calls } = client(() => ({ profile: light }));
    const workflow = await loadProfile(api, fromGateway(light), {}, paramsMetadata(DEFAULT_PROFILES[1].params));
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].path).toBe('/api/v1/workflow');
    // The workflow has no metadata: its copy carries the values in its notes.
    expect(calls[0].body).toEqual({
      profile: workflowProfile(fromGateway(light), DEFAULT_PROFILES[1].params),
      context: { targetYield: 48, targetDoseWeight: 16 },
    });
    expect(workflow.profile?.title).toBe('A-Flow / default-light');
  });

  it('loads a record with the values in its metadata, one of version 1 with them in its notes, and a shot copy', async () => {
    const params = DEFAULT_PROFILES[1].params;
    const { client: api, calls } = client(() => ({}));
    await loadRecord(api, record(light, { metadata: { source: 'decaid-skin', ...paramsMetadata(params) } }));
    const v1 = { ...light, notes: `${serializeParams(params)}
mine` };
    await loadRecord(api, record(v1, { metadata: { source: 'decaid-skin', aflow: '3.0' } }));
    await loadProfile(api, (calls[0].body as { profile: Profile }).profile);
    expect(calls.map((call) => call.body)).toEqual([
      { profile: workflowProfile(light, params), context: { targetYield: 48, targetDoseWeight: 16 } },
      { profile: { ...light, notes: `${serializeParams(params)}
mine` }, context: { targetYield: 48, targetDoseWeight: 16 } },
      { profile: workflowProfile(light, params), context: { targetYield: 48, targetDoseWeight: 16 } },
    ]);
  });

  it('leaves the dose alone for a profile that brings none, and the yield for one without a stop weight', async () => {
    const { client: api, calls } = client(() => ({}));
    await loadProfile(api, { ...other, target_weight: 40 });
    await loadProfile(api, { ...other, target_weight: 0 });
    expect(calls[0].body).toEqual({ profile: { ...other, target_weight: 40 }, context: { targetYield: 40 } });
    expect(calls[1].body).toEqual({ profile: { ...other, target_weight: 0 }, context: {} });
  });

  it('knows the dose of a profile that carries its A-Flow parameters', () => {
    const params = DEFAULT_PROFILES[1].params;
    expect(doseOf(light)).toBeUndefined();
    expect(doseOf(light, paramsMetadata(params))).toBe(16);
    expect(doseOf(fromGateway(light), paramsMetadata(params))).toBe(16);
    expect(doseOf(workflowProfile(light, params))).toBe(16);
    expect(doseOf(other)).toBeUndefined();
    // The plugin's notes: Decaid's bundled default is not an A-Flow 3.0 profile.
    expect(doseOf({ ...light, notes: 'A-Flow: an alternative profile for D-Flow' })).toBeUndefined();
  });
});

describe('doseToSet', () => {
  it('gives the default dose to a workflow without one', () => {
    expect(doseToSet({}, 18)).toBe(18);
    expect(doseToSet({ context: {} }, 18)).toBe(18);
    expect(doseToSet({ context: { targetDoseWeight: null } }, 18.5)).toBe(18.5);
    expect(doseToSet({ context: { targetDoseWeight: 0 } }, 18)).toBe(18);
  });

  it('keeps the dose a profile or the user set', () => {
    expect(doseToSet({ context: { targetDoseWeight: 16 } }, 18)).toBeNull();
    expect(doseToSet({ context: { targetDoseWeight: 20.5, targetYield: 40 } }, 18)).toBeNull();
  });
});
