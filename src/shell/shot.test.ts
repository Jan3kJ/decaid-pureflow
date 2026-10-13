import { describe, expect, it } from 'vitest';
import { isScaleSnapshot, type MachineSnapshot, type MachineState, type ScaleFrame } from '../api';
// A simulated shot recorded on the rig (Decaid 0.8.8, A-Flow / default-medium, target 36 g),
// with 34.1 g left on the scale when it started.
import recording from '../../e2e/fixtures/shot.json';
import { TARE_SETTLE_S, recordFrame, shotSeconds, shotWeight, type Shot } from './shot';

function frame(state: MachineState, time: string, over: Partial<MachineSnapshot> = {}): MachineSnapshot {
  return {
    timestamp: `2026-10-13T06:37:${time}`,
    state: { state, substate: 'pouring' },
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
  };
}

describe('recordFrame', () => {
  it('has no shot while the machine is idle', () => {
    expect(recordFrame(null, frame('idle', '10.000'), 0)).toBeNull();
  });

  it('starts a shot with the first espresso frame, at 0 s', () => {
    const shot = recordFrame(null, frame('espresso', '10.000', { pressure: 0.5, flow: 3 }), 0)!;
    expect(shot.ended).toBe(false);
    expect(shot.series).toEqual({ t: [0], pressure: [0.5], flow: [3], weight: [null], temperature: [92] });
  });

  it('adds one point per frame, with the time from the timestamps', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '10.500', { pressure: 1 }), 0);
    shot = recordFrame(shot, frame('espresso', '12.250', { pressure: 2, groupTemperature: 93 }), 4.5);
    expect(shot!.series.t).toEqual([0, 0.5, 2.25]);
    expect(shot!.series.pressure).toEqual([9, 1, 2]);
    expect(shot!.series.temperature).toEqual([92, 92, 93]);
    expect(shotSeconds(shot)).toBe(2.25);
  });

  it('does not change the shot it was given', () => {
    const first = recordFrame(null, frame('espresso', '10.000'), 0)!;
    const second = recordFrame(first, frame('espresso', '10.100'), 0)!;
    expect(first.series.t).toEqual([0]);
    expect(second.series.t).toHaveLength(2);
  });

  it('leaves the weight out until the tare has settled', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 34.1);
    shot = recordFrame(shot, frame('espresso', '10.400'), 34.1);
    shot = recordFrame(shot, frame('espresso', `${10 + TARE_SETTLE_S}.000`), 0);
    shot = recordFrame(shot, frame('espresso', '15.000'), 3.2);
    expect(shot!.series.weight).toEqual([null, null, 0, 3.2]);
    expect(shotWeight(shot)).toBe(3.2);
  });

  it('has no weight without a scale', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), null);
    shot = recordFrame(shot, frame('espresso', '13.000'), null);
    expect(shot!.series.weight).toEqual([null, null]);
    expect(shotWeight(shot)).toBeNull();
  });

  it('ends the shot with the first frame of another state and keeps its graph', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '12.000'), 5);
    const ended = recordFrame(shot, frame('idle', '12.100'), 5.2)!;
    expect(ended.ended).toBe(true);
    expect(ended.series).toEqual(shot!.series);
    // Later idle frames change nothing.
    expect(recordFrame(ended, frame('idle', '13.000'), 6)).toBe(ended);
  });

  it('replaces a finished shot when the next one starts', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('idle', '11.000'), 0);
    shot = recordFrame(shot, frame('espresso', '40.000', { pressure: 4 }), 0);
    expect(shot!.ended).toBe(false);
    expect(shot!.series.t).toEqual([0]);
    expect(shot!.series.pressure).toEqual([4]);
  });

  it('never draws to the left when a timestamp steps back', () => {
    let shot = recordFrame(null, frame('espresso', '10.000'), 0);
    shot = recordFrame(shot, frame('espresso', '12.000'), 0);
    shot = recordFrame(shot, frame('espresso', '11.000'), 0);
    expect(shot!.series.t).toEqual([0, 2, 2]);
  });
});

describe('a recorded shot of the rig', () => {
  const events = recording as { at: number; machine?: MachineSnapshot; scale?: ScaleFrame }[];
  let shot: Shot | null = null;
  let weight: number | null = null;
  for (const event of events) {
    if (event.scale && isScaleSnapshot(event.scale)) weight = event.scale.weight;
    if (event.machine) shot = recordFrame(shot, event.machine, weight);
  }
  const series = shot!.series;
  const espressoFrames = events.filter((event) => event.machine?.state.state === 'espresso').length;

  it('gives one point per espresso frame and ends', () => {
    expect(shot!.ended).toBe(true);
    expect(series.t).toHaveLength(espressoFrames);
    for (const values of [series.pressure, series.flow, series.weight, series.temperature]) {
      expect(values).toHaveLength(espressoFrames);
    }
  });

  it('runs about 28 s, with time never going back', () => {
    expect(shotSeconds(shot)).toBeGreaterThan(25);
    expect(shotSeconds(shot)).toBeLessThan(31);
    expect(series.t.every((t, i) => i === 0 || t >= series.t[i - 1])).toBe(true);
  });

  it('reaches the pressure and the flow of the profile', () => {
    expect(Math.max(...series.pressure)).toBeCloseTo(10, 0);
    expect(Math.max(...series.flow)).toBeCloseTo(8, 0);
  });

  it('does not draw the 34 g that stood on the scale before the tare', () => {
    const drawn = series.weight.filter((w): w is number => w !== null);
    expect(drawn[0]).toBe(0);
    // From 0 the weight only rises, up to just under the target of 36 g.
    expect(drawn.every((w, i) => i === 0 || w >= drawn[i - 1])).toBe(true);
    expect(shotWeight(shot)).toBeGreaterThan(32);
    expect(shotWeight(shot)).toBeLessThan(36);
  });
});
