import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState } from '../api';
import { recordSteamFrame, secondsLeft, steamSeconds, type SteamRun } from './run';

function frame(state: MachineState, second: number, over: Partial<MachineSnapshot> = {}): MachineSnapshot {
  return {
    timestamp: `2026-10-13T09:00:${second.toFixed(3).padStart(6, '0')}000`,
    state: { state, substate: 'idle' },
    flow: 0,
    pressure: 1.5,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature: 90,
    groupTemperature: 92,
    targetMixTemperature: 93,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 150,
    ...over,
  };
}

const record = (frames: MachineSnapshot[], run: SteamRun | null = null) => frames.reduce(recordSteamFrame, run);

describe('the steam run', () => {
  it('is nothing before the machine steams', () => {
    expect(record([frame('idle', 0), frame('heating', 1)])).toBeNull();
    expect(steamSeconds(null)).toBe(0);
  });

  it('takes pressure and steam temperature of every steam frame, with the time since the first', () => {
    const run = record([
      frame('idle', 0),
      frame('steam', 1, { pressure: 0.2, steamTemperature: 151 }),
      frame('steam', 1.5, { pressure: 1.4, steamTemperature: 148 }),
      frame('steam', 3, { pressure: 1.6, steamTemperature: 146 }),
    ]);
    expect(run?.ended).toBe(false);
    expect(run?.series).toEqual({ t: [0, 0.5, 2], pressure: [0.2, 1.4, 1.6], temperature: [151, 148, 146] });
    expect(steamSeconds(run)).toBe(2);
  });

  it('ends with the first frame of another state and keeps its graph', () => {
    const run = record([frame('steam', 0), frame('steam', 4), frame('idle', 5), frame('idle', 6)]);
    expect(run?.ended).toBe(true);
    expect(run?.series.t).toEqual([0, 4]);
  });

  it('starts again from zero with the next steam', () => {
    const first = record([frame('steam', 0), frame('steam', 4), frame('idle', 5)]);
    const second = record([frame('steam', 20), frame('steam', 21)], first);
    expect(second?.ended).toBe(false);
    expect(second?.series.t).toEqual([0, 1]);
  });

  it('changes nothing in place and never steps back in time', () => {
    const first = record([frame('steam', 2)]);
    const second = recordSteamFrame(first, frame('steam', 1));
    expect(first?.series.t).toEqual([0]);
    expect(second?.series.t).toEqual([0, 0]);
  });
});

// The founder's review of 2026-10-16 (spec 3.7, item 17): on the real DE1 the graph went on
// after steam and the last steam time was longer than the steam. The machine stays in state
// steam after the steam itself: `pouringDone` as it ends, `puffing` while it purges, and
// `pausedSteam` until the second tap of the two-tap purge (`MachineSubstate` in rest_v1.yml).
describe('the steam run after the steam', () => {
  const steaming = (second: number) => frame('steam', second, { state: { state: 'steam', substate: 'pouring' } });
  const after = (substate: string, second: number) => frame('steam', second, { state: { state: 'steam', substate } });

  for (const substate of ['pouringDone', 'puffing', 'pausedSteam']) {
    it(`ends with the first frame in ${substate}: no more points, and its time is the steam's`, () => {
      const run = record([steaming(0), steaming(10), steaming(25), after(substate, 26), after(substate, 40), frame('idle', 45)]);
      expect(run?.ended).toBe(true);
      expect(run?.series.t).toEqual([0, 10, 25]);
      expect(steamSeconds(run)).toBe(25);
    });
  }

  it('the purge after an ended run starts no new one; the next steam does', () => {
    const first = record([steaming(0), steaming(20), after('puffing', 21), after('puffing', 23), frame('idle', 24)]);
    expect(first?.series.t).toEqual([0, 20]);
    const second = record([steaming(50), steaming(52)], first);
    expect(second?.ended).toBe(false);
    expect(second?.series.t).toEqual([0, 2]);
  });
});

describe('the countdown', () => {
  it('starts at the set seconds and counts down to 0, never under', () => {
    expect(secondsLeft(43, 0)).toBe(43);
    expect(secondsLeft(43, 0.25)).toBe(43);
    expect(secondsLeft(43, 1)).toBe(42);
    expect(secondsLeft(43, 42.5)).toBe(1);
    expect(secondsLeft(43, 43)).toBe(0);
    expect(secondsLeft(43, 60)).toBe(0);
  });

  it('follows the frames of a run', () => {
    const run = record([frame('steam', 0), frame('steam', 10.5)]);
    expect(secondsLeft(25, steamSeconds(run))).toBe(15);
  });
});
