import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTES, DEFAULT_PROFILES, generateProfile, serializeParams } from '../aflow';
import { describeAFlow } from '../aflow/describe';
import { paramsMetadata, workflowProfile } from '../editor/storage';
import { DecaidClient, type Profile, type ProfileRecord } from '../api';
import {
  defaultProfile,
  deleteEntry,
  deleteRefusal,
  doseOf,
  doseToSet,
  filterProfiles,
  isAFlow3,
  isDefaultTitle,
  loadEntry,
  loadProfile,
  loadRecord,
  NAME_NEEDED,
  NAME_TAKEN,
  pickerEntries,
  profileDescription,
  renameAnswer,
  renameEntry,
  sameProfile,
  screenAfter,
  sortProfiles,
  titleLines,
} from './profiles';
import { editorFor } from '../editor/route';

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

describe('screenAfter', () => {
  it('goes to the editor after edit and back to where the picker was opened from after load', () => {
    expect(screenAfter('edit', 'home')).toBe('editor');
    expect(screenAfter('edit', 'editor')).toBe('editor');
    expect(screenAfter('load', 'home')).toBe('home');
    expect(screenAfter('load', 'editor')).toBe('editor');
  });

  it('edit opens the A-Flow editor on an A-Flow 3.0 profile, a default too, and the step editor on another', async () => {
    const { client: api, calls } = client(() => ({}));
    const [floral] = pickerEntries([]);
    const mine = { ...fromGateway(light), title: 'A-Flow / mine' };
    const stored = record(mine, { metadata: { source: 'pureflow', ...paramsMetadata(DEFAULT_PROFILES[1].params) } });
    const plain = record(other);
    await loadEntry(api, floral);
    await loadEntry(
      api,
      pickerEntries([stored]).find((entry) => entry.id === stored.id)!,
    );
    await loadEntry(
      api,
      pickerEntries([plain]).find((entry) => entry.id === plain.id)!,
    );
    const loaded = calls.map((call) => (call.body as { profile: Profile }).profile);
    expect(loaded.map(editorFor)).toEqual(['aflow', 'aflow', 'steps']);
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
  const notes = (text: string | undefined) => ({ profile: { notes: text, steps: [] } });
  const medium = DEFAULT_PROFILES.find((entry) => entry.id === 'default-medium')!;
  const generated = describeAFlow(medium.params);
  const stored = (text: string) => ({ profile: { ...defaultProfile(medium), notes: text }, metadata: paramsMetadata(medium.params) });

  it('is the notes without the A-Flow line the skin writes', () => {
    const params = DEFAULT_PROFILES[1].params;
    expect(profileDescription(notes(`${serializeParams(params)}\nBright and sweet.`))).toBe('Bright and sweet.');
    expect(profileDescription({ profile: { ...workflowProfile({ notes: 'Bright and sweet.' }, params), steps: [] } })).toBe(
      'Bright and sweet.',
    );
  });

  it('is empty when nothing but the A-Flow line is left, or there are no notes', () => {
    expect(profileDescription(notes(serializeParams(DEFAULT_PROFILES[1].params)))).toBe('');
    expect(profileDescription(notes(undefined))).toBe('');
    expect(profileDescription(notes('  '))).toBe('');
  });

  it('keeps notes of other skins as they are, and of a profile that is not A-Flow the stock sentence too', () => {
    expect(profileDescription(notes('Turbo shot.\nGrind fine.'))).toBe('Turbo shot.\nGrind fine.');
    expect(profileDescription({ profile: { ...other, notes: DEFAULT_NOTES } })).toBe(DEFAULT_NOTES);
  });

  it('is the text made from the values of an A-Flow 3.0 profile, after the notes the user wrote', () => {
    expect(profileDescription({ profile: defaultProfile(medium), metadata: paramsMetadata(medium.params) })).toBe(generated);
    expect(profileDescription(stored('Bright and sweet.\nGrind fine.'))).toBe(`Bright and sweet.\nGrind fine.\n\n${generated}`);
    // Version 1: the values in the notes, the user's text after them.
    expect(profileDescription({ profile: { ...defaultProfile(medium), notes: `${serializeParams(medium.params)}\nMine.` } })).toBe(
      `Mine.\n\n${generated}`,
    );
  });

  it('counts the old plugin’s stock sentence as nothing written', () => {
    expect(profileDescription(stored(DEFAULT_NOTES))).toBe(generated);
    expect(profileDescription(stored(` ${DEFAULT_NOTES}. `))).toBe(generated);
  });

  it('describes an older A-Flow profile read from its steps, without the dose it does not have', () => {
    const plugin = { ...generateProfile(medium.params, { title: 'A-Flow / mine', notes: DEFAULT_NOTES }) };
    expect(profileDescription({ profile: plugin })).toBe(describeAFlow(medium.params, { dose: false }));
    expect(profileDescription({ profile: plugin })).toMatch(/^42 g out\. /);
  });

  it('is not written to the profile', () => {
    const entry = stored('Mine.');
    profileDescription(entry);
    expect(entry.profile.notes).toBe('Mine.');
  });
});

describe('deleteRefusal', () => {
  const [lightEntry] = pickerEntries([]).filter((entry) => entry.id === 'default-light');
  const [best] = pickerEntries([record(other)]).filter((entry) => !entry.isDefault);

  it("refuses the skin's defaults and the profile on the machine", () => {
    expect(deleteRefusal(lightEntry, undefined)).toBe('default');
    expect(deleteRefusal(best, fromGateway(other))).toBe('loaded');
  });

  it('lets any other stored profile go', () => {
    expect(deleteRefusal(best, undefined)).toBeNull();
    expect(deleteRefusal(best, light)).toBeNull();
    expect(deleteRefusal({ profile: light, isDefault: false }, other)).toBeNull();
  });
});

describe('deleteEntry', () => {
  it('deletes the record and answers the list as the gateway then has it', async () => {
    const kept = record(light, { id: 'profile:kept' });
    const { client: stub, calls } = client((method) => (method === 'DELETE' ? { success: true } : [kept]));
    expect(await deleteEntry(stub, { id: 'profile:gone', isDefault: false })).toEqual([kept]);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'DELETE /api/v1/profiles/profile%3Agone',
      'GET /api/v1/profiles',
    ]);
  });

  it("sends nothing for one of the skin's defaults", async () => {
    const { client: stub, calls } = client(() => []);
    await expect(deleteEntry(stub, { id: 'default-light', isDefault: true })).rejects.toThrow('cannot be deleted');
    expect(calls).toEqual([]);
  });
});

describe('renameAnswer', () => {
  const mine: Profile = { ...other, title: 'My morning' };
  const entries = pickerEntries([record(other), record(mine)]);
  const entry = entries.find((candidate) => candidate.profile.title === 'My morning')!;

  it('takes the typed title, trimmed', () => {
    expect(renameAnswer('  Weekend  ', entry, entries)).toEqual({ title: 'Weekend' });
  });

  it('keeps an A-Flow prefix as typed', () => {
    expect(renameAnswer('A-Flow / my light', entry, entries)).toEqual({ title: 'A-Flow / my light' });
  });

  it('refuses an empty title', () => {
    expect(renameAnswer('', entry, entries)).toEqual({ refusal: NAME_NEEDED });
    expect(renameAnswer('   ', entry, entries)).toEqual({ refusal: NAME_NEEDED });
    expect(NAME_NEEDED).toBe('A profile needs a name.');
  });

  it("refuses the title of another stored profile or of one of the skin's defaults", () => {
    expect(renameAnswer('Best practice', entry, entries)).toEqual({ refusal: NAME_TAKEN });
    expect(renameAnswer(` ${DEFAULT_PROFILES[1].title}`, entry, entries)).toEqual({ refusal: NAME_TAKEN });
    expect(NAME_TAKEN).toBe('A profile with that name exists.');
  });

  it('answers the title as it was, trimmed or not, as nothing to do', () => {
    expect(renameAnswer('My morning', entry, entries)).toBe('same');
    expect(renameAnswer(' My morning ', entry, entries)).toBe('same');
  });

  it('lets another case of a title through: titles differ by their letters', () => {
    expect(renameAnswer('best practice', entry, entries)).toEqual({ title: 'best practice' });
  });
});

describe('renameEntry', () => {
  it('sends the profile under the new title and no metadata, then reads the list again', async () => {
    const stored = record(other, { id: 'profile:best', metadata: { source: 'pureflow', aflow: '3.0' } });
    const renamed = { ...stored, profile: { ...other, title: 'Morning' } };
    const { client: stub, calls } = client((method) => (method === 'PUT' ? renamed : [renamed]));
    const [entry] = pickerEntries([stored]).filter((candidate) => !candidate.isDefault);
    expect(await renameEntry(stub, entry, 'Morning')).toEqual({ record: renamed, records: [renamed] });
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'PUT /api/v1/profiles/profile%3Abest',
      'GET /api/v1/profiles',
    ]);
    expect(calls[0].body).toEqual({ profile: { ...other, title: 'Morning' } });
    expect(calls[0].body).not.toHaveProperty('metadata');
  });

  it("sends nothing for one of the skin's defaults", async () => {
    const { client: stub, calls } = client(() => []);
    const [lightEntry] = pickerEntries([]).filter((candidate) => candidate.id === 'default-light');
    await expect(renameEntry(stub, lightEntry, 'Mine')).rejects.toThrow('cannot be renamed');
    expect(calls).toEqual([]);
  });
});

describe('titleLines', () => {
  it('shows the name first and the part before the first ‘ / ’ as its caption', () => {
    expect(titleLines('A-Flow / default-medium')).toEqual({ name: 'default-medium', caption: 'A-Flow' });
    expect(titleLines('A-Flow / mine / two')).toEqual({ name: 'mine / two', caption: 'A-Flow' });
  });

  it('has no caption for a title without ‘ / ’, or with nothing after it', () => {
    expect(titleLines('Best practice')).toEqual({ name: 'Best practice', caption: null });
    expect(titleLines('A-Flow / ')).toEqual({ name: 'A-Flow /', caption: null });
    expect(titleLines('A/B')).toEqual({ name: 'A/B', caption: null });
  });
});
