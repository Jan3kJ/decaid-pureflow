import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState } from '../api';
import records from './fixtures/export-steams.json';
import { recordSteamFrame, secondsLeft, STEAM_FLOW, steamSeconds, type SteamRun } from './run';

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
    expect(run?.series).toEqual({ t: [0, 0.5, 2], pressure: [0.2, 1.4, 1.6], temperature: [151, 148, 146], flow: [0, 0, 0] });
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

// The founder's review of 2026-10-22 (spec 3.12, item 5): the clock started with the pump
// priming (`preparingForShot`) and ended with the purge, 32 s for a timer of 26 s. The run is
// now the machine's timer: from the first `pouring` frame to the last at 0.5 ml/s or more.
describe('the steam run is the machine timer', () => {
  /** A real DE1's frame: state steam in the substate given. */
  const real = (substate: string, second: number, flow: number) =>
    frame('steam', second, { state: { state: 'steam', substate }, flow });

  for (const { record: name, timer, frames } of records) {
    const snapshots: MachineSnapshot[] = frames.map((f) => ({
      ...frame(f.state as MachineState, 0),
      timestamp: f.timestamp,
      state: { state: f.state as MachineState, substate: f.substate },
      flow: f.flow,
      pressure: f.pressure,
      steamTemperature: f.steamTemperature,
    }));
    const firstPouring = frames.find((f) => f.substate === 'pouring')!;
    const pouring = frames.filter((f) => f.substate === 'pouring');
    // The flow is at 0.5 ml/s or more from the start of pouring: the last such frame before the first fall.
    const lastFlowing = pouring[pouring.findIndex((f) => f.flow < STEAM_FLOW) - 1];

    it(`the export's steam of ${name}: starts at the first pouring frame and ends with the flow, about the timer of ${timer} s plus 0.5 s`, () => {
      const run = record(snapshots);
      expect(run?.ended).toBe(true);
      expect(run?.startedAt).toBe(Date.parse(firstPouring.timestamp.slice(0, 23)));
      expect(steamSeconds(run)).toBeGreaterThan(timer + 0.3);
      expect(steamSeconds(run)).toBeLessThan(timer + 0.7);
      // No lead-in, and nothing of the tail at under 0.5 ml/s, the purge or the end.
      expect(run?.series.t.length).toBe(pouring.indexOf(lastFlowing) + 1);
      expect(run?.series.flow.at(-1)).toBe(lastFlowing.flow);
      expect(Math.min(...run!.series.flow.slice(1))).toBeGreaterThanOrEqual(STEAM_FLOW);
      expect(run?.series.flow.length).toBe(run?.series.t.length);
    });

    it(`the export's steam of ${name}: nothing while the pump primes, and the countdown reaches 0 with the steam`, () => {
      const lead = snapshots.filter((f) => f.state.substate === 'preparingForShot');
      expect(lead.length).toBeGreaterThan(5);
      expect(record(lead)).toBeNull();
      const run = record(snapshots);
      const series = run!.series;
      // Still steaming at timer - 1 s; 0 s left only in the last half second of the flow.
      expect(secondsLeft(timer, series.t.at(-1)!)).toBe(0);
      expect(secondsLeft(timer, series.t.filter((t) => t < timer - 1).at(-1)!)).toBeGreaterThan(0);
    });

    it(`the export's steam of ${name}: the tail and the purge start no second run`, () => {
      const inSteam = record(snapshots.filter((f) => f.state.state === 'steam'));
      expect(inSteam?.ended).toBe(true);
      expect(record([real('pouring', 10, 1), real('pouring', 12, 1)], inSteam)?.series).toBe(inSteam?.series);
      const next = record([frame('idle', 20), real('pouring', 30, 1)], inSteam);
      expect(next?.ended).toBe(false);
      expect(next?.series.t).toEqual([0]);
    });
  }

  it('starts with the first pouring frame, not with preparingForShot', () => {
    const run = record([
      frame('idle', 0),
      real('preparingForShot', 1, 2),
      real('preparingForShot', 2, 3),
      real('pouring', 3, 3),
      real('pouring', 5, 1),
    ]);
    expect(run?.series.t).toEqual([0, 2]);
    expect(run?.series.flow).toEqual([3, 1]);
    expect(run?.ended).toBe(false);
  });

  it('starts with the first steam frame where the machine never reports pouring, as the simulated one, and ends when it leaves steam', () => {
    const run = record([frame('steam', 0), frame('steam', 1), frame('steam', 30)]);
    expect(run?.ended).toBe(false);
    expect(run?.series.flow).toEqual([0, 0, 0]);
    expect(steamSeconds(run)).toBe(30);
    expect(record([frame('idle', 31)], run)?.ended).toBe(true);
  });

  it('a flow under 0.5 ml/s ends the run only after it has been at 0.5 ml/s or more', () => {
    const slow = record([real('pouring', 0, 0.1), real('pouring', 0.5, 0.3), real('pouring', 1, 0.6), real('pouring', 10, 0.8)]);
    expect(slow?.ended).toBe(false);
    expect(slow?.flowed).toBe(true);
    const ended = record([real('pouring', 10.5, 0.49), real('pouring', 11, 0.9)], slow);
    expect(ended?.ended).toBe(true);
    expect(ended?.series.t).toEqual([0, 0.5, 1, 10]);
  });

  it('ends at once when the machine leaves steam or pouring before the flow falls', () => {
    const left = record([real('pouring', 0, 1), real('pouring', 8, 1), frame('idle', 8.5)]);
    expect(left?.ended).toBe(true);
    expect(steamSeconds(left)).toBe(8);
    const purged = record([real('pouring', 0, 1), real('pouring', 8, 1), real('puffing', 8.5, 1)]);
    expect(purged?.ended).toBe(true);
    expect(steamSeconds(purged)).toBe(8);
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
