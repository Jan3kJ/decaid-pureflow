import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Skin } from './skin.svelte';
import { HOT_WATER_FIELDS } from '../hotwater/hot-water';
import type { HotWaterData, Workflow } from '../api';

// Each hot water write sends all four values of `hotWaterData` (Decaid's schema requires them).
// Two values set in quick succession, a typed flow and then the time slider let go, must not
// undo each other: the second write is built on the first one's answer, not on the workflow
// read before it.

const GATEWAY = 'http://rig:8080';
const field = (key: keyof HotWaterData) => HOT_WATER_FIELDS.find((f) => f.key === key)!;

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

/** Decaid's workflow, and the answers to the PUTs it has not given yet. */
let stored: Workflow;
let sent: HotWaterData[];
let pending: (() => void)[];

beforeEach(() => {
  stored = {
    context: { targetDoseWeight: 18 },
    hotWaterData: { targetTemperature: 80, duration: 30, volume: 80, flow: 8 },
  };
  sent = [];
  pending = [];
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'GET') {
      const read = structuredClone(stored);
      return new Promise<Response>((resolve) => pending.push(() => resolve(Response.json(read))));
    }
    const patch = JSON.parse(init?.body as string) as Partial<Workflow>;
    sent.push(patch.hotWaterData!);
    stored = { ...stored, ...patch };
    const answer = structuredClone(stored);
    return new Promise<Response>((resolve) => pending.push(() => resolve(Response.json(answer))));
  });
});

afterEach(() => vi.unstubAllGlobals());

/** Answers the PUTs one by one, as they arrive. */
async function answerAll() {
  for (let i = 0; i < 20; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending.shift()?.();
  }
}

describe('setHotWater', () => {
  it('a value set while the previous write is unanswered keeps the previous value', async () => {
    const skin = new Skin(GATEWAY);
    skin.workflow = structuredClone(stored);
    const flow = skin.setHotWater(field('flow'), 4);
    const time = skin.setHotWater(field('duration'), 60);
    await answerAll();
    await Promise.all([flow, time]);
    expect(sent.at(-1)).toEqual({ targetTemperature: 80, duration: 60, volume: 80, flow: 4 });
    expect(stored.hotWaterData).toEqual({ targetTemperature: 80, duration: 60, volume: 80, flow: 4 });
    expect(skin.workflow?.hotWaterData).toEqual({ targetTemperature: 80, duration: 60, volume: 80, flow: 4 });
  });

  it('a workflow read answered after a write does not put the old values back', async () => {
    const skin = new Skin(GATEWAY);
    skin.workflow = structuredClone(stored);
    const read = skin.refreshWorkflow();
    const flow = skin.setHotWater(field('flow'), 4);
    // The write is answered first, the read made before it last.
    await new Promise((resolve) => setTimeout(resolve, 0));
    pending.pop()?.();
    await flow;
    pending.shift()?.();
    await read;
    expect(skin.workflow?.hotWaterData?.flow).toBe(4);
  });
});
