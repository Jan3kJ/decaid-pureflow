import { describe, expect, it, vi } from 'vitest';
import {
  DecaidClient,
  type MachineSnapshot,
  type Profile,
  type ShotMeasurement,
  type ShotRecordSummary,
  type WorkflowContext,
} from '../api';
import {
  beanAndGrinder,
  beanLabel,
  entryKey,
  groupShots,
  readShots,
  restoreEntry,
  seriesOf,
} from './entries';
import { SWIPE_DISTANCE, SWIPE_EDGE, isOpeningSwipe, startsAtEdge } from './swipe';

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
    const entries = groupShots([
      shot('A-Flow / light', beanA, 1),
      shot('A-Flow / light', beanB, 2),
      shot('A-Flow / dark', beanA, 3),
    ]);

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

    for (const order of [[old, other, again], [again, other, old], [other, again, old]]) {
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
    const shots = Array.from({ length: 600 }, (_, i) =>
      shot(titles[i % 4], { ...beans[i % 3], grinderSetting: String(i) }, i),
    );
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
  const fetch = vi.fn(async (address: string, init?: RequestInit) => {
    const url = new URL(address);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method: init?.method ?? 'GET', path: url.pathname + url.search, body });
    return new Response(JSON.stringify(answer(init?.method ?? 'GET', url, body)), { status: 200 });
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

describe('readShots', () => {
  it('reads the list page by page until it has every shot', async () => {
    const all = Array.from({ length: 230 }, (_, i) => shot('p', {}, i));
    const { client: api, calls } = client((_method, url) => {
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
    });

    expect(await readShots(api)).toHaveLength(230);
    expect(calls.map((call) => call.path)).toEqual([
      '/api/v1/shots?limit=100&offset=0&order=desc',
      '/api/v1/shots?limit=100&offset=100&order=desc',
      '/api/v1/shots?limit=100&offset=200&order=desc',
    ]);
  });

  it('stops at the most it may read, and at an empty page', async () => {
    const all = Array.from({ length: 230 }, (_, i) => shot('p', {}, i));
    const paged = client((_method, url) => {
      const offset = Number(url.searchParams.get('offset'));
      const limit = Number(url.searchParams.get('limit'));
      return { items: all.slice(offset, offset + limit), total: all.length, limit, offset };
    });
    expect(await readShots(paged.client, 150)).toHaveLength(150);
    expect(paged.calls).toHaveLength(2);

    const empty = client(() => ({ items: [], total: 7, limit: 100, offset: 0 }));
    expect(await readShots(empty.client)).toEqual([]);
    expect(empty.calls).toHaveLength(1);
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
      scale: weight === undefined ? null : { timestamp: '', weight, weightFlow: 0, battery: 100, timerValue: null },
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
  });

  it('is empty for a shot without measurements, and never steps back in time', () => {
    expect(seriesOf({ measurements: [] }).t).toEqual([]);
    expect(seriesOf({ measurements: [measurement(0, 0), measurement(2, 1), measurement(1, 2)] }).t).toEqual([0, 2, 2]);
  });
});

describe('the opening swipe', () => {
  const width = 1280;
  const edge = width * SWIPE_EDGE;
  const far = width * SWIPE_DISTANCE;

  it('is a move to the right that starts near the left edge', () => {
    expect(isOpeningSwipe({ x: 20, y: 400 }, { x: 20 + far, y: 400 }, width)).toBe(true);
    expect(isOpeningSwipe({ x: edge, y: 400 }, { x: edge + far + 40, y: 430 }, width)).toBe(true);
  });

  it('is not a short move, a move to the left, a move down or one from the middle of the screen', () => {
    expect(isOpeningSwipe({ x: 20, y: 400 }, { x: 20 + far - 1, y: 400 }, width)).toBe(false);
    expect(isOpeningSwipe({ x: 200, y: 400 }, { x: 200 - far, y: 400 }, width)).toBe(false);
    expect(isOpeningSwipe({ x: 20, y: 400 }, { x: 20 + far, y: 400 + far }, width)).toBe(false);
    expect(isOpeningSwipe({ x: edge + 1, y: 400 }, { x: edge + 1 + 2 * far, y: 400 }, width)).toBe(false);
    expect(startsAtEdge({ x: edge + 1, y: 0 }, width)).toBe(false);
  });

  it('scales with the viewport', () => {
    expect(isOpeningSwipe({ x: 20, y: 100 }, { x: 70, y: 100 }, 640)).toBe(true);
    expect(isOpeningSwipe({ x: 20, y: 100 }, { x: 70, y: 100 }, 1280)).toBe(false);
  });
});
