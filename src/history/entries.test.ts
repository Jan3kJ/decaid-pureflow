import { describe, expect, it, vi } from 'vitest';
import {
  DecaidClient,
  type BeanBatch,
  type CatalogueBean,
  type Grinder,
  type MachineSnapshot,
  type Profile,
  type ShotMeasurement,
  type ShotRecordSummary,
  type WorkflowContext,
} from '../api';
import {
  NO_FILTER,
  beanAndGrinder,
  beanLabel,
  entryKey,
  filterShots,
  grinderLabel,
  groupShots,
  restoreEntry,
  seriesOf,
  shotBean,
  shotGrinder,
  type CatalogueView,
} from './entries';

function profile(title: string, over: Partial<Profile> = {}): Profile {
  return { title, steps: [], target_weight: 36, target_volume_count_start: 0, tank_temperature: 0, ...over };
}

let made = 0;
/** A shot record as the list returns it; later calls are later shots unless `minute` says otherwise. */
function shot(title: string | null, context: WorkflowContext | null = {}, minute = made): ShotRecordSummary {
  made += 1;
  return {
    id: `shot-${made}`,
    timestamp: `2026-10-${String(1 + Math.floor(minute / 60)).padStart(2, '0')}T08:${String(minute % 60).padStart(2, '0')}:00.000000`,
    workflow: { profile: title === null ? undefined : profile(title), context },
  };
}

const beanA = { coffeeName: 'Yirgacheffe', coffeeRoaster: 'Square Mile' };
const beanB = { coffeeName: 'Red Brick', coffeeRoaster: 'Square Mile' };

describe('groupShots', () => {
  it('keeps the same profile and bean in one entry when the grinder setting changes', () => {
    const first = shot('A-Flow / light', { ...beanA, grinderSetting: '5.2' }, 1);
    const second = shot('A-Flow / light', { ...beanA, grinderSetting: '4.8' }, 2);
    const entries = groupShots([first, second]);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ profileTitle: 'A-Flow / light', grinderSetting: '4.8', shots: 2 });
    expect(entries[0].bean).toEqual({ name: 'Yirgacheffe', roaster: 'Square Mile', batchId: null });
    // The entry stands for its latest shot: that one is restored and drawn.
    expect(entries[0].latest).toBe(second);
  });

  it('makes a new entry for another bean and for another profile', () => {
    const entries = groupShots([shot('A-Flow / light', beanA, 1), shot('A-Flow / light', beanB, 2), shot('A-Flow / dark', beanA, 3)]);

    expect(entries.map((entry) => [entry.profileTitle, entry.bean?.name])).toEqual([
      ['A-Flow / dark', 'Yirgacheffe'],
      ['A-Flow / light', 'Red Brick'],
      ['A-Flow / light', 'Yirgacheffe'],
    ]);
  });

  it('puts the entry with the newest shot first, whatever the order of the records', () => {
    const old = shot('A-Flow / light', beanA, 1);
    const other = shot('A-Flow / dark', beanA, 2);
    const again = shot('A-Flow / light', beanA, 3);

    for (const order of [
      [old, other, again],
      [again, other, old],
      [other, again, old],
    ]) {
      const entries = groupShots(order);
      expect(entries.map((entry) => entry.profileTitle)).toEqual(['A-Flow / light', 'A-Flow / dark']);
      expect(entries[0].latest).toBe(again);
    }
  });

  it('has one entry per profile for shots without a bean, apart from those with one', () => {
    const entries = groupShots([
      shot('A-Flow / light', {}, 1),
      shot('A-Flow / light', null, 2),
      shot('A-Flow / light', { coffeeName: '  ', coffeeRoaster: null, grinderSetting: '6' }, 3),
      shot('A-Flow / light', beanA, 4),
    ]);

    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ bean: null, shots: 3, grinderSetting: '6' });
    expect(beanLabel(entries[1].bean)).toBe('no bean');
    expect(beanLabel(entries[0].bean)).toBe('Square Mile · Yirgacheffe');
  });

  it('shows no grinder setting when the latest shot has none, and does not split the entry', () => {
    const entries = groupShots([
      shot('A-Flow / light', { ...beanA, grinderSetting: '5.2' }, 1),
      shot('A-Flow / light', { ...beanA }, 2),
      shot('A-Flow / dark', { ...beanA, grinderSetting: '' }, 3),
    ]);

    expect(entries.map((entry) => [entry.profileTitle, entry.grinderSetting, entry.shots])).toEqual([
      ['A-Flow / dark', null, 1],
      ['A-Flow / light', null, 2],
    ]);
  });

  it('does not split an entry by the grinder model, the dose or the yield', () => {
    const entries = groupShots([
      shot('A-Flow / light', { ...beanA, grinderModel: 'Niche Zero', targetDoseWeight: 16, targetYield: 36 }),
      shot('A-Flow / light', { ...beanA, grinderModel: 'P64', targetDoseWeight: 18, targetYield: 40 }),
    ]);
    expect(entries).toHaveLength(1);
  });

  it('groups many shots into as many entries as there are combinations', () => {
    const titles = ['floral', 'light', 'medium', 'dark'];
    const beans = [beanA, beanB, {}];
    const shots = Array.from({ length: 600 }, (_, i) => shot(titles[i % 4], { ...beans[i % 3], grinderSetting: String(i) }, i));
    const entries = groupShots(shots);

    expect(entries).toHaveLength(12);
    expect(entries.reduce((sum, entry) => sum + entry.shots, 0)).toBe(600);
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(12);
    // Every entry carries the grinder setting of its own latest shot.
    for (const entry of entries) {
      const own = shots.filter((candidate) => entryKey(candidate) === entry.key);
      expect(entry.latest).toBe(own.reduce((a, b) => (a.timestamp > b.timestamp ? a : b)));
      expect(entry.grinderSetting).toBe(entry.latest.workflow!.context!.grinderSetting);
    }
  });

  it('leaves out a shot without a profile, and is empty without shots', () => {
    expect(groupShots([])).toEqual([]);
    expect(groupShots([shot(null, beanA), { id: 'bare', timestamp: '2026-10-13T08:00:00' }])).toEqual([]);
  });
});

describe('entryKey', () => {
  it('takes the profile by its title: edited steps stay in the entry, another title does not', () => {
    const a = shot('A-Flow / light', beanA);
    const edited: ShotRecordSummary = {
      ...a,
      workflow: { ...a.workflow, profile: profile('A-Flow / light', { target_weight: 40, notes: 'edited' }) },
    };
    expect(entryKey(edited)).toBe(entryKey(a));
    expect(entryKey(shot('A-Flow / light 2', beanA))).not.toBe(entryKey(a));
  });

  it('takes the bean by name and roaster; a batch id counts only for a bean without both', () => {
    const named = entryKey(shot('p', beanA));
    expect(entryKey(shot('p', { ...beanA, beanBatchId: 'batch-1' }))).toBe(named);
    expect(entryKey(shot('p', { ...beanA, coffeeRoaster: 'Other' }))).not.toBe(named);
    expect(entryKey(shot('p', { coffeeName: 'Yirgacheffe' }))).not.toBe(named);

    const batch = entryKey(shot('p', { beanBatchId: 'batch-1' }));
    expect(batch).not.toBe(entryKey(shot('p', {})));
    expect(batch).not.toBe(entryKey(shot('p', { beanBatchId: 'batch-2' })));
    expect(beanLabel({ name: null, roaster: null, batchId: 'batch-1' })).toBe('bean from Decaid');
  });

  it('does not mix up a roaster with a name', () => {
    expect(entryKey(shot('p', { coffeeName: 'Rig' }))).not.toBe(entryKey(shot('p', { coffeeRoaster: 'Rig' })));
  });
});

/** A client whose requests are recorded and answered with `answer`. */
function client(answer: (method: string, url: URL, body: unknown) => unknown) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetch = vi.fn((address: string, init?: RequestInit) => {
    const url = new URL(address);
    const body: unknown = init?.body ? JSON.parse(init.body as string) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: url.pathname + url.search, body });
    return Promise.resolve(new Response(JSON.stringify(answer(init?.method ?? 'GET', url, body)), { status: 200 }));
  });
  return { client: new DecaidClient({ fetch }), calls };
}

describe('restoreEntry', () => {
  it('writes the profile, the bean and the grinder setting in one PUT of the workflow', async () => {
    const latest = shot('A-Flow / light', {
      ...beanA,
      beanBatchId: 'batch-1',
      grinderSetting: '4.8',
      grinderModel: 'Niche Zero',
      targetDoseWeight: 18,
      targetYield: 30,
    });
    const { client: api, calls } = client(() => ({}));
    await restoreEntry(api, groupShots([latest])[0]);

    expect(calls).toEqual([
      {
        method: 'PUT',
        path: '/api/v1/workflow',
        body: {
          profile: latest.workflow!.profile,
          context: {
            coffeeName: 'Yirgacheffe',
            coffeeRoaster: 'Square Mile',
            beanBatchId: 'batch-1',
            grinderSetting: '4.8',
            grinderModel: 'Niche Zero',
            grinderId: null,
            // As the picker loads a profile: the stop weight is the profile's.
            targetYield: 36,
          },
        },
      },
    ]);
  });

  it('clears the bean and the grinder of the workflow for an entry that has none', () => {
    expect(beanAndGrinder(shot('A-Flow / light', null))).toEqual({
      coffeeName: null,
      coffeeRoaster: null,
      beanBatchId: null,
      grinderSetting: null,
      grinderModel: null,
      grinderId: null,
    });
  });
});

describe('seriesOf', () => {
  function measurement(seconds: number, weight: number | undefined, over: Partial<MachineSnapshot> = {}): ShotMeasurement {
    return {
      machine: {
        timestamp: new Date(Date.UTC(2026, 9, 13, 8, 0, 0) + seconds * 1000).toISOString().replace('Z', ''),
        state: { state: 'espresso', substate: 'pouring' },
        flow: 2,
        pressure: 9,
        targetFlow: 0,
        targetPressure: 0,
        mixTemperature: 90,
        groupTemperature: 92,
        targetMixTemperature: 93,
        targetGroupTemperature: 93,
        profileFrame: 0,
        steamTemperature: 150,
        ...over,
      },
      scale: weight === undefined ? null : { timestamp: '', weight, weightFlow: weight / 10, battery: 100, timerValue: null },
    };
  }

  it('makes one point per measurement, with the time from the first one', () => {
    const series = seriesOf({
      measurements: [
        measurement(0, 34.1, { pressure: 0, flow: 0 }),
        measurement(0.5, 34.1, { pressure: 2 }),
        measurement(1.5, 0.4, { pressure: 6, flow: 1.5, groupTemperature: 93 }),
        measurement(2.5, undefined),
      ],
    });

    expect(series.t).toEqual([0, 0.5, 1.5, 2.5]);
    expect(series.pressure).toEqual([0, 2, 6, 9]);
    expect(series.flow).toEqual([0, 2, 1.5, 2]);
    expect(series.temperature).toEqual([92, 92, 93, 92]);
    // Before Decaid's tare has settled, and without a scale, the weight is a gap.
    expect(series.weight).toEqual([null, null, 0.4, null]);
    // The graph's weight flow is the measurement's `weightFlow`, with the weight's gaps.
    expect(series.weightFlow).toEqual([null, null, 0.04, null]);
  });

  it('cuts the heating before the water, as the live graph does', () => {
    const waiting = { state: { state: 'espresso' as const, substate: 'preparingForShot' } };
    const heating = (seconds: number) => measurement(seconds, seconds < 0.5 ? 34.1 : 0, { pressure: 0, flow: 0, ...waiting });
    const series = seriesOf({
      measurements: [
        ...[0, 0.5, 1, 2, 3, 4, 5].map(heating),
        measurement(5.5, 0, { pressure: 0.4, flow: 4, targetFlow: 8, state: { state: 'espresso', substate: 'preinfusion' } }),
        measurement(8, 2.1, { pressure: 3, targetPressure: 3 }),
        measurement(20.5, 30),
      ],
    });
    expect(series.t).toEqual([0, 2.5, 15]);
    expect(series.pressure).toEqual([0.4, 3, 9]);
    expect(series.weight).toEqual([0, 2.1, 30]);
    expect(series.targetFlow).toEqual([8, null, null]);
    expect(series.targetPressure).toEqual([null, 3, null]);
    expect(series.targetTemperature).toEqual([93, 93, 93]);
  });

  it('ends where the live shot ends: a tail after the pour is cut', () => {
    const done = { state: { state: 'espresso' as const, substate: 'pouringDone' } };
    const series = seriesOf({
      measurements: [
        measurement(0, 0),
        measurement(1, 0.5),
        measurement(30, 36),
        measurement(30.1, 36.1, { pressure: 0.6, flow: 3, ...done }),
        measurement(33, 36.5, { pressure: 0.5, flow: 4, targetFlow: 4, ...done }),
      ],
    });
    expect(series.t).toEqual([0, 1, 30]);
    expect(series.targetFlow).toEqual([null, null, null]);
  });

  it('shows a record whole when no measurement says that water moved', () => {
    const waiting = { state: { state: 'espresso' as const, substate: 'preparingForShot' } };
    const series = seriesOf({ measurements: [measurement(0, 0, waiting), measurement(3, 1, waiting)] });
    expect(series.t).toEqual([0, 3]);
  });

  it('is empty for a shot without measurements, and never steps back in time', () => {
    expect(seriesOf({ measurements: [] }).t).toEqual([]);
    expect(seriesOf({ measurements: [measurement(0, 0), measurement(2, 1), measurement(1, 2)] }).t).toEqual([0, 2, 2]);
  });
});

const at = '2026-10-20T10:00:00.000';
const catalogueBean = (id: string, roaster: string, name: string, archived = false): CatalogueBean => ({
  id,
  roaster,
  name,
  decaf: false,
  archived,
  createdAt: at,
  updatedAt: at,
});
const batch = (id: string, beanId: string, archived = false): BeanBatch => ({
  id,
  beanId,
  frozen: false,
  archived,
  createdAt: at,
  updatedAt: at,
});
const grinder = (id: string, model: string): Grinder => ({
  id,
  model,
  archived: false,
  settingType: 'numeric',
  createdAt: at,
  updatedAt: at,
});

/** Red Brick, renamed since its first bag (now 'Red Brick Espresso'), with two bags; Yirgacheffe with one; a Niche and an EK. */
const catalogue: CatalogueView = {
  beans: [
    catalogueBean('bean-red', 'Square Mile', 'Red Brick Espresso'),
    catalogueBean('bean-yirga', 'Square Mile', 'Yirgacheffe', true),
  ],
  batches: [batch('bag-red-1', 'bean-red', true), batch('bag-red-2', 'bean-red'), batch('bag-yirga', 'bean-yirga')],
  grinders: [grinder('niche', 'Niche Zero'), grinder('ek', 'EK43')],
};

describe('the catalogue in the history', () => {
  const firstBag = shot(
    'A-Flow / light',
    { ...beanB, beanBatchId: 'bag-red-1', grinderId: 'niche', grinderModel: 'Niche Zero', grinderSetting: '5' },
    1,
  );
  const renamed = shot(
    'A-Flow / light',
    {
      coffeeName: 'Red Brick Espresso',
      coffeeRoaster: 'Square Mile',
      beanBatchId: 'bag-red-2',
      grinderId: 'niche',
      grinderSetting: '4.8',
    },
    2,
  );
  // Before the catalogue: the free text of the workflow only.
  const old = shot('A-Flow / light', { ...beanA, grinderModel: 'EK43', grinderSetting: '9' }, 3);
  const unknown = shot('A-Flow / light', { coffeeName: 'Kenya', coffeeRoaster: 'Rig', beanBatchId: 'gone', grinderModel: 'Lagom' }, 4);
  const none = shot('A-Flow / light', { grinderSetting: '6' }, 5);
  const all = [firstBag, renamed, old, unknown, none];

  it("finds a shot's bean by its batch, else by name and roaster", () => {
    expect(shotBean(firstBag, catalogue)?.id).toBe('bean-red');
    expect(shotBean(renamed, catalogue)?.id).toBe('bean-red');
    expect(shotBean(old, catalogue)?.id).toBe('bean-yirga');
    // A batch the catalogue does not know and a name it does not hold: no bean.
    expect(shotBean(unknown, catalogue)).toBeNull();
    expect(shotBean(none, catalogue)).toBeNull();
  });

  it("finds a shot's grinder by its id, else by its model", () => {
    expect(shotGrinder(firstBag, catalogue)?.id).toBe('niche');
    expect(shotGrinder(old, catalogue)?.id).toBe('ek');
    expect(shotGrinder(unknown, catalogue)).toBeNull();
    // An id wins over the model: an id the catalogue does not know is no grinder of it.
    expect(shotGrinder(shot('x', { grinderId: 'gone', grinderModel: 'EK43' }), catalogue)).toBeNull();
  });

  it('keeps a catalogue bean one entry across a rename and its bags, labelled with its current name', () => {
    const entries = groupShots([firstBag, renamed], catalogue);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ shots: 2, beanId: 'bean-red', grinder: 'Niche Zero', grinderSetting: '4.8' });
    expect(beanLabel(entries[0].bean)).toBe('Square Mile · Red Brick Espresso');
    // Without the catalogue the two names are two entries, as before.
    expect(groupShots([firstBag, renamed])).toHaveLength(2);
    expect(entryKey(firstBag, catalogue)).toBe(entryKey(renamed, catalogue));
  });

  it('keeps the rule of name and roaster for a shot whose bean the catalogue does not know', () => {
    const entries = groupShots(all, catalogue);
    const kenya = entries.find((entry) => entry.latest === unknown)!;
    expect(kenya.beanId).toBeNull();
    expect(beanLabel(kenya.bean)).toBe('Rig · Kenya');
    expect(entryKey(unknown, catalogue)).toBe(entryKey(unknown));
    // A grinder the catalogue does not know shows the model the shot names.
    expect(grinderLabel(kenya)).toBe('Lagom');
    expect(grinderLabel(entries.find((entry) => entry.latest === none)!)).toBe('grinder 6');
    expect(grinderLabel(entries.find((entry) => entry.latest === old)!)).toBe('EK43 9');
  });

  it('filters by a bean: its batches and, for older shots, its name and roaster', () => {
    expect(filterShots(all, { beanId: 'bean-red', grinderId: null }, catalogue)).toEqual([firstBag, renamed]);
    expect(filterShots(all, { beanId: 'bean-yirga', grinderId: null }, catalogue)).toEqual([old]);
  });

  it('filters by a grinder: its id and, for a shot without one, its model', () => {
    expect(filterShots(all, { beanId: null, grinderId: 'niche' }, catalogue)).toEqual([firstBag, renamed]);
    expect(filterShots(all, { beanId: null, grinderId: 'ek' }, catalogue)).toEqual([old]);
  });

  it('filters by both, and keeps every shot without a filter', () => {
    expect(filterShots(all, { beanId: 'bean-red', grinderId: 'ek' }, catalogue)).toEqual([]);
    expect(filterShots(all, NO_FILTER, catalogue)).toEqual(all);
  });

  it('filters first, then groups: the entry counts only the shots the filter keeps', () => {
    const other = shot('A-Flow / light', { ...beanB, beanBatchId: 'bag-red-2', grinderId: 'ek', grinderSetting: '2' }, 6);
    const entries = groupShots(filterShots([...all, other], { beanId: null, grinderId: 'niche' }, catalogue), catalogue);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ shots: 2, latest: renamed });
  });
});
