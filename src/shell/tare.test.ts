import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Skin } from './skin.svelte';

// The tap on the weight in the state line calls `Skin.tare`;
// the steam and hot water pages' tare buttons call the same function.

const GATEWAY = 'http://rig:8080';

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

let calls: { method: string; url: string }[];

beforeEach(() => {
  calls = [];
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
    calls.push({ method: init?.method ?? 'GET', url });
    return Promise.resolve(new Response(null, { status: 200 }));
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('tare', () => {
  it('tares a connected scale with one PUT', async () => {
    const skin = new Skin(GATEWAY);
    skin.scaleLink = 'connected';
    await skin.tare();
    expect(calls).toEqual([{ method: 'PUT', url: `${GATEWAY}/api/v1/scale/tare` }]);
    expect(skin.notice).toBeNull();
    expect(skin.info).toBeNull();
  });

  it('without a connected scale tares nothing and scans for the scale at once', async () => {
    vi.useFakeTimers();
    for (const link of ['disconnected', 'unknown'] as const) {
      calls = [];
      const skin = new Skin(GATEWAY);
      skin.scaleLink = link;
      await skin.tare();
      await vi.waitFor(() => expect(calls).toHaveLength(1));
      expect(calls).toEqual([{ method: 'GET', url: `${GATEWAY}/api/v1/devices/scan?connect=true&quick=true` }]);
      expect(skin.scaleLooking).toBe(true);
    }
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('a tare Decaid blocks during a shot is a notice, not an error', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(Response.json({ type: 'block_tare_during_shot', details: 'A shot is brewing' }, { status: 400 })),
    );
    const skin = new Skin(GATEWAY);
    skin.scaleLink = 'connected';
    await skin.tare();
    expect(skin.info).toContain('No tare while a shot runs');
    expect(skin.notice).toBeNull();
  });
});
