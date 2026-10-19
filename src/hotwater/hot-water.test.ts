import { describe, expect, it } from 'vitest';
import type { HotWaterData, PaginatedShots, WorkflowPatch } from '../api';
import {
  HOT_WATER_FIELDS,
  FLOW_FIELD,
  WEIGHT_FIELD,
  heldHotWater,
  heldValue,
  lastShotGrams,
  ratioLabel,
  ratioWeight,
  shotGrams,
  writeHotWater,
} from './hot-water';

const RIG: HotWaterData = { targetTemperature: 75, duration: 30, volume: 50, flow: 10 };
const field = (id: string) => HOT_WATER_FIELDS.find((entry) => entry.id === id)!;

describe('stop at weight from the last shot by a ratio (spec 3.7)', () => {
  it('gives 80 g for a shot of 40 g and 1:2, and the founder example of each default', () => {
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
  it('is the newest record final weight, its actualYield', () => {
    expect(shotGrams({ id: 'a', timestamp: 't', annotations: { actualYield: 40 } })).toBe(40);
  });

  it('has no weight without a record or a yield', () => {
    expect(shotGrams(undefined)).toBeNull();
    expect(shotGrams({ id: 'a', timestamp: 't' })).toBeNull();
    expect(shotGrams({ id: 'a', timestamp: 't', annotations: { actualYield: null } })).toBeNull();
    expect(shotGrams({ id: 'a', timestamp: 't', annotations: { actualYield: 0 } })).toBeNull();
  });

  it('asks the gateway for one shot, newest first', async () => {
    const asked: unknown[] = [];
    const page = (items: PaginatedShots['items']): PaginatedShots => ({ items, total: items.length, limit: 1, offset: 0 });
    const client = {
      listShots: async (query: unknown) => {
        asked.push(query);
        return page([{ id: 'new', timestamp: '2026-10-17T07:00:00', annotations: { actualYield: 40 } }]);
      },
    };
    expect(await lastShotGrams(client)).toBe(40);
    expect(asked).toEqual([{ limit: 1, order: 'desc' }]);
    expect(await lastShotGrams({ listShots: async () => page([]) })).toBeNull();
  });
});

describe('the workflow write', () => {
  function fakeClient() {
    const patches: WorkflowPatch[] = [];
    return {
      patches,
      updateWorkflow: async (patch: WorkflowPatch) => {
        patches.push(patch);
        return { hotWaterData: { ...RIG, ...patch.hotWaterData } };
      },
    };
  }

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

  it("holds the flow to the DE1's 8 ml/s: a typed 10, and a stored 10 at the next change (spec 3.9)", async () => {
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
