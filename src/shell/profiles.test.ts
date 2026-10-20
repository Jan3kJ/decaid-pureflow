import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROFILES, serializeParams } from '../aflow';
import { paramsMetadata, workflowProfile } from '../editor/storage';
import { DecaidClient, type Profile, type ProfileRecord } from '../api';
import {
  defaultProfile,
  doseOf,
  doseToSet,
  filterProfiles,
  isAFlow3,
  isDefaultTitle,
  loadEntry,
  loadProfile,
  loadRecord,
  pickerEntries,
  profileDescription,
  sameProfile,
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
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init?.method ?? 'GET', path, body });
    return Promise.resolve(new Response(JSON.stringify(answer(init?.method ?? 'GET', path, body)), { status: 200 }));
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

describe('pickerEntries', () => {
  const titles = (records: ProfileRecord[]) => pickerEntries(records).map((entry) => entry.profile.title);
  const fiveDefaults = [
    'A-Flow / default-floral',
    'A-Flow / default-light',
    'A-Flow / default-medium',
    'A-Flow / default-dark',
    'A-Flow / default-46mm',
  ];

  it('lists the five defaults of the skin first, in the order of the founder, to a gateway that has none', () => {
    const entries = pickerEntries([record(other)]);
    expect(entries.map((entry) => entry.profile.title)).toEqual([...fiveDefaults, 'Best practice']);
    expect(entries.map((entry) => entry.isDefault)).toEqual([true, true, true, true, true, false]);
    expect(entries.map((entry) => entry.id)).toEqual([...DEFAULT_PROFILES.map((entry) => entry.id), 'profile:Best practice']);
    // As the generator writes them, with their values where a record keeps them.
    expect(entries[1].profile).toEqual(light);
    expect(entries[1].metadata).toEqual(paramsMetadata(DEFAULT_PROFILES[1].params));
    expect(titles([])).toEqual(fiveDefaults);
  });

  it('hides the copies stored in Decaid under a default’s title, whatever their steps', () => {
    const ours = { metadata: { source: 'pureflow', ...paramsMetadata(DEFAULT_PROFILES[1].params) } };
    const stored = [
      record(fromGateway(light), { id: 'profile:copy', ...ours }),
      record(defaultProfile(DEFAULT_PROFILES[0]), { id: 'profile:old', metadata: { source: 'decaid-skin', aflow: '3.0' } }),
      // the plugin's default as Decaid bundles it under a 3.0 title, other steps
      record({ ...light, steps: light.steps.slice(1) }, { id: 'profile:bundled' }),
    ];
    const entries = pickerEntries([...stored, record(other)]);
    expect(entries.map((entry) => entry.profile.title)).toEqual([...fiveDefaults, 'Best practice']);
    expect(entries.map((entry) => entry.id)).not.toContain('profile:copy');
    expect(entries.map((entry) => entry.id)).not.toContain('profile:bundled');
    expect(isDefaultTitle('A-Flow / default-light')).toBe(true);
    expect(isDefaultTitle('A-Flow / default-very-dark')).toBe(false);
  });

  it('keeps Decaid’s other bundled A-Flow profiles and a profile with a default’s steps under its own title', () => {
    const list = [
      record(other),
      record({ ...other, title: 'A-Flow / default-very-dark' }),
      record({ ...other, title: 'A-Flow / default-like-dflow' }),
      // the founder's test-light: the steps of a default under another title (spec 3.8)
      record({ ...light, title: 'A-Flow / test-light' }, { metadata: { source: 'pureflow', aflow: '3.0' } }),
    ];
    expect(titles(list)).toEqual([
      ...fiveDefaults,
      'A-Flow / test-light',
      'A-Flow / default-like-dflow',
      'A-Flow / default-very-dark',
      'Best practice',
    ]);
    expect(pickerEntries(list).filter((entry) => entry.profile.title === 'A-Flow / default-light')).toHaveLength(1);
  });
});

describe('sortProfiles', () => {
  it('puts the skin’s A-Flow 3.0 profiles first, then other A-Flow, then the rest, each by title', () => {
    const ours = { metadata: { source: 'pureflow', aflow: '3.0' } };
    const list = [
      record(other),
      record({ ...other, title: 'A-Flow / default-like-dflow' }),
      record(defaultProfile(DEFAULT_PROFILES[3]), ours),
      record({ ...other, title: 'Adaptive' }),
      record(defaultProfile(DEFAULT_PROFILES[0]), ours),
    ];
    expect(isAFlow3(list[2])).toBe(true);
    expect(isAFlow3(list[1])).toBe(false);
    // the skin's former name (founder, 2026-10-18)
    expect(isAFlow3(record(other, { metadata: { source: 'decaid-skin', aflow: '3.0' } }))).toBe(true);
    expect(isAFlow3(record(other, { metadata: { source: 'other', aflow: '3.0' } }))).toBe(false);
    expect(sortProfiles(list).map((item) => item.profile.title)).toEqual([
      'A-Flow / default-dark',
      'A-Flow / default-floral',
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
    await loadRecord(api, record(light, { metadata: { source: 'pureflow', ...paramsMetadata(params) } }));
    const v1 = {
      ...light,
      notes: `${serializeParams(params)}
mine`,
    };
    await loadRecord(api, record(v1, { metadata: { source: 'pureflow', aflow: '3.0' } }));
    await loadProfile(api, (calls[0].body as { profile: Profile }).profile);
    expect(calls.map((call) => call.body)).toEqual([
      { profile: workflowProfile(light, params), context: { targetYield: 48, targetDoseWeight: 16 } },
      {
        profile: {
          ...light,
          notes: `${serializeParams(params)}
mine`,
        },
        context: { targetYield: 48, targetDoseWeight: 16 },
      },
      { profile: workflowProfile(light, params), context: { targetYield: 48, targetDoseWeight: 16 } },
    ]);
  });

  it('loads a default as the skin holds it, without a record and without a POST', async () => {
    const { client: api, calls } = client(() => ({}));
    const [floral] = pickerEntries([]);
    await loadEntry(api, floral);
    const stored = record(fromGateway(light), { metadata: { source: 'pureflow', ...paramsMetadata(DEFAULT_PROFILES[1].params) } });
    await loadEntry(api, pickerEntries([record({ ...light, title: 'mine' }), stored]).at(-1)!);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['PUT /api/v1/workflow', 'PUT /api/v1/workflow']);
    const params = DEFAULT_PROFILES[0].params;
    expect(calls[0].body).toEqual({
      profile: workflowProfile(defaultProfile(DEFAULT_PROFILES[0]), params),
      context: { targetYield: params.stopWeight, targetDoseWeight: params.dose },
    });
    expect((calls[1].body as { profile: Profile }).profile.title).toBe('mine');
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

describe('filterProfiles', () => {
  const records = [light, other, { ...other, title: 'Light roast' }, { ...other, title: 'Dark' }].map((profile) => record(profile));
  const titles = (filter: string) => filterProfiles(records, filter).map((entry) => entry.profile.title);

  it('keeps the titles that hold the filter, in any case', () => {
    expect(titles('light')).toEqual(['A-Flow / default-light', 'Light roast']);
    expect(titles('LIGHT')).toEqual(['A-Flow / default-light', 'Light roast']);
    expect(titles('ht ro')).toEqual(['Light roast']);
  });

  it('keeps all for an empty filter or spaces, and none for a title nobody has', () => {
    expect(titles('')).toHaveLength(4);
    expect(titles('  ')).toHaveLength(4);
    expect(titles('turbo')).toEqual([]);
  });

  it('looks at the title only', () => {
    expect(titles('Decent')).toEqual([]);
  });
});

describe('profileDescription', () => {
  it('is the notes without the A-Flow line the skin writes', () => {
    const params = DEFAULT_PROFILES[1].params;
    expect(profileDescription({ notes: `${serializeParams(params)}\nBright and sweet.` })).toBe('Bright and sweet.');
    expect(profileDescription(workflowProfile({ notes: 'Bright and sweet.' }, params))).toBe('Bright and sweet.');
  });

  it('is empty when nothing but the A-Flow line is left, or there are no notes', () => {
    expect(profileDescription({ notes: serializeParams(DEFAULT_PROFILES[1].params) })).toBe('');
    expect(profileDescription({ notes: undefined })).toBe('');
    expect(profileDescription({ notes: '  ' })).toBe('');
  });

  it('keeps notes of other skins as they are', () => {
    expect(profileDescription({ notes: 'Turbo shot.\nGrind fine.' })).toBe('Turbo shot.\nGrind fine.');
  });
});
