import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState } from '../api';
import { recordSteamFrame, steamSeconds, type SteamRun } from './run';

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
