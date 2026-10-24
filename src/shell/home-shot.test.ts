import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineSnapshot } from '../api';
// Both streams of a simulated shot recorded on the rig (Decaid 0.8.8, A-Flow / default-medium).
import recording from '../../e2e/fixtures/shot.json';
import { homeShot, wantsNewest } from './home-shot';
import { emptySeries, recordFrame, type Shot, type ShotSeries } from './shot';
import { Skin } from './skin.svelte';

// What home shows (spec 3.11, X1): `homeShot` for the running and the finished shot, a recalled
// history entry and none, and the skin's shot after the machine frames of a recorded shot.

const frames = (recording as { machine?: MachineSnapshot }[]).flatMap((event) => (event.machine ? [event.machine] : []));
const firstEspresso = frames.findIndex((frame) => frame.state.state === 'espresso');
const lastEspresso = frames.map((frame) => frame.state.state).lastIndexOf('espresso');

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

/** The skin's handler of the machine stream, as the stream calls it. */
const feed = (skin: Skin, list: MachineSnapshot[]) => {
  const onFrame = (skin as unknown as { onMachineFrame(frame: MachineSnapshot): void }).onMachineFrame.bind(skin);
  for (const frame of list) onFrame(frame);
};

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

function series(seconds: number[], weights: (number | null)[]): ShotSeries {
  return { ...emptySeries(), t: seconds, weight: weights };
}

function shot(ended: boolean, over: Partial<Shot> = {}): Shot {
  return {
    enteredAt: 0,
    startedAt: 0,
    series: series([0, 1, 2.5], [0, 1.2, 3.4]),
    samples: [],
    finalWeight: null,
    ended,
    ...over,
  };
}

describe('homeShot', () => {
  it('is the empty graph with no time and weight before any shot', () => {
    const shown = homeShot(null, null, 12);
    expect(shown.kind).toBe('none');
    expect(shown.series.t).toEqual([]);
    expect(shown.seconds).toBeNull();
    expect(shown.weight).toBeNull();
  });

  it('is the running shot with the scale weight, over a recalled entry', () => {
    const recalled = series([0, 30], [0, 36]);
    const shown = homeShot(shot(false), recalled, 7.5);
    expect(shown.kind).toBe('running');
    expect(shown.seconds).toBe(2.5);
    expect(shown.weight).toBe(7.5);
  });

  it('is the finished shot with its final weight, else its last weight', () => {
    expect(homeShot(shot(true, { finalWeight: 36.2 }), null, 0)).toMatchObject({ kind: 'finished', seconds: 2.5, weight: 36.2 });
    expect(homeShot(shot(true), null, 0)).toMatchObject({ kind: 'finished', weight: 3.4 });
  });

  it('is a recalled entry over the finished shot, with the entry shot time and weight', () => {
    const recalled = series([0, 12, 29.5], [0, 20, null]);
    const shown = homeShot(shot(true), recalled, 0);
    expect(shown.kind).toBe('recalled');
    expect(shown.series).toBe(recalled);
    expect(shown.seconds).toBe(29.5);
    expect(shown.weight).toBe(20);
  });

  it('is the newest shot record read from Decaid when home has no shot of its own, under every shot of its own', () => {
    const newest = series([0, 15, 31], [0, 18, 35.5]);
    expect(homeShot(null, null, 2, newest)).toMatchObject({ kind: 'finished', series: newest, seconds: 31, weight: 35.5 });
    expect(homeShot(shot(true, { finalWeight: 36.2 }), null, 0, newest)).toMatchObject({ seconds: 2.5, weight: 36.2 });
    expect(homeShot(null, series([0, 20], [0, 40]), 0, newest)).toMatchObject({ kind: 'recalled', seconds: 20 });
    expect(homeShot(shot(false), null, 0, newest).kind).toBe('running');
  });
});

describe('wantsNewest', () => {
  it('reads the newest shot record only while home has no running, kept or recalled shot', () => {
    expect(wantsNewest(null, null)).toBe(true);
    expect(wantsNewest(shot(false), null)).toBe(false);
    expect(wantsNewest(shot(true), null)).toBe(false);
    expect(wantsNewest(null, series([0, 20], [0, 40]))).toBe(false);
  });
});

describe('the shot on home', () => {
  it('is the newest shot record after the machine wakes, and a kept shot stays over it', async () => {
    const espresso = frames.slice(firstEspresso, lastEspresso + 1);
    const measurements = espresso.map((machine) => ({ machine, scale: null }));
    vi.stubGlobal('fetch', (input: string) => {
      const path = new URL(input).pathname;
      const summary = { id: 'newest', timestamp: '2026-10-24T08:00:00' };
      if (path === '/api/v1/shots') return Promise.resolve(Response.json({ items: [summary], total: 1, limit: 20, offset: 0 }));
      if (path === '/api/v1/shots/latest') return Promise.resolve(Response.json(summary));
      if (path === '/api/v1/shots/newest') return Promise.resolve(Response.json({ id: 'newest', timestamp: '', measurements }));
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    const asleep = { ...frames[0], state: { state: 'sleeping', substate: 'idle' } } as MachineSnapshot;
    const awake = { ...frames[0], state: { state: 'idle', substate: 'idle' } } as MachineSnapshot;
    const skin = new Skin('http://rig:8080');
    feed(skin, [asleep, awake]);
    await vi.waitFor(() => expect(skin.newestShot?.t.length).toBeGreaterThan(10));
    expect(homeShot(skin.shot, null, null, skin.newestShot).kind).toBe('finished');

    // A shot made here is kept: a wake after it reads nothing over it.
    feed(skin, frames);
    const kept = skin.shot;
    vi.stubGlobal('fetch', () => Promise.reject(new Error('not asked')));
    feed(skin, [asleep, awake]);
    expect(homeShot(skin.shot, null, null, skin.newestShot).series).toBe(kept?.series);
  });

  it('is none before a shot', () => {
    const skin = new Skin('http://rig:8080');
    feed(skin, frames.slice(0, firstEspresso));
    expect(skin.shot).toBeNull();
    expect(skin.shotRunning).toBe(false);
  });

  it('runs on home from another screen, and the history closes', () => {
    const skin = new Skin('http://rig:8080');
    skin.go('profiles');
    feed(skin, frames.slice(0, firstEspresso));
    skin.historyOpen = true;
    feed(skin, frames.slice(firstEspresso, firstEspresso + 1));
    expect(skin.shotRunning).toBe(true);
    expect(skin.screen).toBe('home');
    expect(skin.historyOpen).toBe(false);
  });

  it('stays after the shot while the machine is idle again', () => {
    const skin = new Skin('http://rig:8080');
    feed(skin, frames);
    expect(frames.length).toBeGreaterThan(lastEspresso + 1);
    expect(skin.shot?.ended).toBe(true);
    expect(skin.shotRunning).toBe(false);
    expect(homeShot(skin.shot, null, skin.weight).kind).toBe('finished');
    expect(skin.screen).toBe('home');
  });

  it('is replaced when the next shot starts', () => {
    const skin = new Skin('http://rig:8080');
    feed(skin, frames);
    const first = skin.shot;
    feed(skin, frames.slice(0, firstEspresso + 1));
    expect(skin.shot).not.toBe(first);
    expect(skin.shotRunning).toBe(true);
    expect(homeShot(skin.shot, null, skin.weight).kind).toBe('running');
  });
});

describe('the filter of the state line (spec 3.12)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('leaves the shot graph the raw temperatures and filters only the shown ones', () => {
    const skin = new Skin('http://rig:8080');
    let expected: Shot | null = null;
    let filtered = 0;
    for (const frame of frames) {
      feed(skin, [frame]);
      expected = recordFrame(expected, frame, null);
      expect(skin.snapshot).toBe(frame);
      if (skin.shown?.groupTemperature !== frame.groupTemperature) filtered++;
      vi.advanceTimersByTime(250);
    }
    expect(skin.shot?.series.temperature.length).toBeGreaterThan(10);
    expect(skin.shot?.series.temperature).toEqual(expected?.series.temperature);
    expect(filtered).toBeGreaterThan(10);
  });
});
