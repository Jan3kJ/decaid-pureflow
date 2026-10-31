import { describe, expect, it } from 'vitest';
import type { HotWaterData, ShotRecord, WorkflowPatch } from '../api';
import { seriesOf } from '../history/entries';
import { homeShot } from '../shell/home-shot';
import { emptySeries, type Shot } from '../shell/shot';
import {
  HOT_WATER_FIELDS,
  FLOW_FIELD,
  WEIGHT_FIELD,
  fieldStep,
  heldHotWater,
  heldValue,
  hotWaterFields,
  lastShotGrams,
  ratioLabel,
  ratioWeight,
  shownValue,
  writeHotWater,
} from './hot-water';

const RIG: HotWaterData = { targetTemperature: 75, duration: 30, volume: 50, flow: 10 };
function fakeClient() {
  const patches: WorkflowPatch[] = [];
  return {
    patches,
    updateWorkflow: (patch: WorkflowPatch) => {
      patches.push(patch);
      return Promise.resolve({ hotWaterData: { ...RIG, ...patch.hotWaterData } });
    },
  };
}

const field = (id: string) => HOT_WATER_FIELDS.find((entry) => entry.id === id)!;

describe('stop at weight from the last shot by a ratio', () => {
  it('gives 80 g for a shot of 40 g and 1:2, and the example of each default', () => {
    expect(ratioWeight(40, 2)).toBe(80);
    expect(ratioWeight(40, 2.5)).toBe(100);
    expect(ratioWeight(40, 3)).toBe(120);
  });

  it('rounds to whole grams: hotWaterData.volume is an integer', () => {
    expect(ratioWeight(34.3, 2)).toBe(69);
    expect(ratioWeight(36.1, 2.5)).toBe(90);
  });

  it('holds the weight inside the page range', () => {
    expect(ratioWeight(3, 2)).toBe(WEIGHT_FIELD.min);
    expect(ratioWeight(300, 3)).toBe(WEIGHT_FIELD.max);
  });

  it('names a ratio as 1:n', () => {
    expect([2, 2.5, 3].map(ratioLabel)).toEqual(['1:2', '1:2.5', '1:3']);
  });
});

describe('the last measured shot', () => {
  /** a record whose scale reads 44.6 g at the end while Decaid's actualYield says 45.6 g */
  const record = (): Pick<ShotRecord, 'measurements'> => ({
    measurements: [3, 4, 5].map((seconds, i) => ({
      machine: {
        timestamp: new Date(Date.UTC(2026, 9, 13, 8, 0, seconds)).toISOString().replace('Z', ''),
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
      },
      scale: { timestamp: '', weight: [10, 30, 44.6][i], weightFlow: 1, battery: 100, timerValue: null },
    })),
  });
  const source = (measured: Pick<ShotRecord, 'measurements'> | null) => ({
    newest: () => Promise.resolve(measured ? { id: 'new' } : null),
    record: () => Promise.resolve(measured ?? { measurements: [] }),
  });
  const kept = (over: Partial<Shot>): Shot => ({
    enteredAt: 0,
    startedAt: 0,
    series: emptySeries(),
    samples: [],
    finalWeight: null,
    ended: true,
    endedAt: 1,
    ...over,
  });

  it("is the record's last measured weight, as home shows it, not its actualYield", async () => {
    const grams = await lastShotGrams(null, source(record()));
    expect(grams).toBe(44.6);
    expect(grams).toBe(homeShot(null, null, null, seriesOf(record())).weight);
  });

  it('is a finished shot kept in the page before any record, as home shows it', async () => {
    const shot = kept({ finalWeight: 36.2 });
    expect(await lastShotGrams(shot, source(record()))).toBe(36.2);
    expect(homeShot(shot, null, null, seriesOf(record())).weight).toBe(36.2);
  });

  it('has no weight without a record, or without a scale reading', async () => {
    expect(await lastShotGrams(null, source(null))).toBeNull();
    const unweighed = record();
    unweighed.measurements.forEach((entry) => (entry.scale = null));
    expect(await lastShotGrams(null, source(unweighed))).toBeNull();
  });
});

describe('the workflow write', () => {
  it('sends one value with the other three as they are: Decaid requires all four', async () => {
    const client = fakeClient();
    const workflow = await writeHotWater(client, { ...RIG, flow: 6 }, WEIGHT_FIELD, 80);
    expect(client.patches).toEqual([{ hotWaterData: { targetTemperature: 75, duration: 30, volume: 80, flow: 6 } }]);
    expect(workflow.hotWaterData?.volume).toBe(80);
  });

  it('maps temperature, flow and time to their fields', async () => {
    const client = fakeClient();
    await writeHotWater(client, RIG, field('temperature'), 85);
    await writeHotWater(client, RIG, field('flow'), 6.5);
    await writeHotWater(client, RIG, field('time'), 45);
    expect(client.patches.map((patch) => patch.hotWaterData)).toEqual([
      { ...RIG, targetTemperature: 85, flow: 8 },
      { ...RIG, flow: 6.5 },
      { ...RIG, duration: 45, flow: 8 },
    ]);
  });

  it("holds the flow to the DE1's 8 ml/s: a typed 10, and a stored 10 at the next change", async () => {
    expect(FLOW_FIELD.max).toBe(8);
    expect(heldValue(FLOW_FIELD, 10)).toBe(8);
    expect(heldHotWater(RIG)).toEqual({ ...RIG, flow: 8 });
    expect(heldHotWater({ ...RIG, flow: 7.5 })).toEqual({ ...RIG, flow: 7.5 });
    const client = fakeClient();
    await writeHotWater(client, RIG, field('flow'), 10);
    await writeHotWater(client, RIG, WEIGHT_FIELD, 60);
    expect(client.patches.map((patch) => patch.hotWaterData?.flow)).toEqual([8, 8]);
  });

  it('holds a value inside its range and step', async () => {
    expect(heldValue(field('temperature'), 99)).toBe(95);
    expect(heldValue(field('temperature'), 80.4)).toBe(80);
    expect(heldValue(field('flow'), 6.46)).toBe(6.5);
    expect(heldValue(field('flow'), 0)).toBe(0.1);
    expect(heldValue(field('time'), 2)).toBe(5);
    const client = fakeClient();
    await writeHotWater(client, RIG, field('time'), 500);
    expect(client.patches[0].hotWaterData?.duration).toBe(120);
  });

  it('takes the rig workflow values as they are, but the flow of 10 is above the DE1 maximum', () => {
    for (const entry of HOT_WATER_FIELDS) {
      expect(heldValue(entry, RIG[entry.key])).toBe(entry.key === 'flow' ? 8 : RIG[entry.key]);
    }
  });
});

describe('stop at weight with a scale, stop at volume without one', () => {
  const stop = (link: 'connected' | 'disconnected' | 'unknown') => hotWaterFields(link).find((entry) => entry.key === 'volume')!;

  it('reads stop at weight in g with a connected scale', () => {
    expect([stop('connected').label, stop('connected').unit]).toEqual(['stop at weight', 'g']);
    expect(hotWaterFields('connected')).toEqual(HOT_WATER_FIELDS);
  });

  it('reads stop at volume in ml when the scale is disconnected or not known yet', () => {
    for (const link of ['disconnected', 'unknown'] as const) {
      expect([stop(link).label, stop(link).unit]).toEqual(['stop at volume', 'ml']);
    }
  });

  it('keeps the field, its id and its range of 10 to 500, and writes the number as it is', async () => {
    const volume = stop('disconnected');
    expect([volume.id, volume.key, volume.min, volume.max, volume.decimals]).toEqual(['weight', 'volume', 10, 500, false]);
    expect(hotWaterFields('disconnected').map((entry) => entry.id)).toEqual(HOT_WATER_FIELDS.map((entry) => entry.id));
    const client = fakeClient();
    await writeHotWater(client, RIG, volume, 120);
    expect(client.patches[0].hotWaterData?.volume).toBe(120);
  });
});

describe('the rows and their sliders', () => {
  it('step flow by 0.1 and the other values by 1', () => {
    expect(HOT_WATER_FIELDS.map(fieldStep)).toEqual([1, 0.1, 1, 1]);
  });

  it("show a value with its field's decimals, and a dash without one", () => {
    expect(shownValue(FLOW_FIELD, 6.5)).toBe('6.5');
    expect(shownValue(FLOW_FIELD, 10)).toBe('10');
    expect(shownValue(field('temperature'), 74.6)).toBe('75');
    expect(shownValue(WEIGHT_FIELD, null)).toBe('–');
    expect(shownValue(WEIGHT_FIELD, Number.NaN)).toBe('–');
  });

  it("hold a dragged value to the field's step: what a slider shows is what it writes", () => {
    expect(heldValue(FLOW_FIELD, 6.499999)).toBe(6.5);
    expect(heldValue(field('time'), 44.6)).toBe(45);
  });
});
