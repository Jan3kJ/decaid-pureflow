import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState, Workflow } from '../api';
import {
  cupOf,
  recordWaterFrame,
  ringOf,
  streamOf,
  waterColour,
  waterKindOf,
  waterSeconds,
  waterTarget,
  type WaterRun,
} from './water';

function frame(state: MachineState, second: number, flow = 0, mixTemperature = 75): MachineSnapshot {
  return {
    timestamp: `2026-10-16T09:00:${second.toFixed(3).padStart(6, '0')}000`,
    state: { state, substate: state === 'hotWater' ? 'pouring' : 'idle' },
    flow,
    pressure: 0,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature,
    groupTemperature: 92,
    targetMixTemperature: 75,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 150,
  };
}

const record = (frames: MachineSnapshot[], run: WaterRun | null = null) => frames.reduce(recordWaterFrame, run);

describe('the water run', () => {
  it('knows hot water and flush, and nothing else', () => {
    expect(waterKindOf('hotWater')).toBe('hotWater');
    expect(waterKindOf('flush')).toBe('flush');
    for (const state of ['idle', 'espresso', 'steam', 'steamRinse', 'cleaning']) expect(waterKindOf(state)).toBeNull();
  });

  it('is nothing before hot water or flush runs', () => {
    expect(record([frame('idle', 0), frame('espresso', 1, 2)])).toBeNull();
  });

  it('adds the flow up over the frames: the mean of two frames times the time between them', () => {
    // The rig's hot water: 5.78, 9.51, then 10 ml/s, a frame every 0.5 s.
    const run = record([
      frame('idle', 0),
      frame('hotWater', 1, 5.78),
      frame('hotWater', 1.5, 9.51),
      frame('hotWater', 2, 10),
      frame('hotWater', 3, 10),
    ])!;
    expect(run.kind).toBe('hotWater');
    expect(run.ended).toBe(false);
    expect(waterSeconds(run)).toBe(2);
    expect(run.volume).toBeCloseTo((5.78 + 9.51) / 4 + (9.51 + 10) / 4 + 10, 6);
    expect(run.flow).toBe(10);
  });

  it('adds nothing at flow 0, as the simulated flush, and nothing for a clock that steps back', () => {
    const flush = record([frame('flush', 0), frame('flush', 0.5), frame('flush', 6)])!;
    expect(flush.volume).toBe(0);
    expect(waterSeconds(flush)).toBe(6);
    const back = record([frame('hotWater', 2, 4), frame('hotWater', 1, 4), frame('hotWater', 3, 4)])!;
    expect(back.volume).toBe(4);
    expect(waterSeconds(back)).toBe(1);
  });

  it('takes a negative flow as 0', () => {
    expect(record([frame('hotWater', 0, -0.2), frame('hotWater', 1, -0.2)])!.volume).toBe(0);
  });

  it('ends at the first frame of another state and keeps its numbers; the next run starts at 0', () => {
    const ended = record([frame('hotWater', 0, 10), frame('hotWater', 1, 10), frame('idle', 2)])!;
    expect(ended.ended).toBe(true);
    expect(ended.volume).toBe(10);
    expect(record([frame('idle', 3)], ended)).toBe(ended);
    const next = record([frame('hotWater', 4, 6)], ended)!;
    expect(next).toMatchObject({ ended: false, volume: 0, startedAt: next.at });
  });

  it('starts anew when flush follows hot water directly', () => {
    const run = record([frame('hotWater', 0, 10), frame('hotWater', 1, 10), frame('flush', 2, 6)])!;
    expect(run).toMatchObject({ kind: 'flush', volume: 0, ended: false });
  });
});

describe('the targets', () => {
  const workflow: Workflow = {
    hotWaterData: { targetTemperature: 75, duration: 30, volume: 50, flow: 10 },
    rinseData: { targetTemperature: 90, duration: 10, flow: 6 },
  };

  it("are the workflow's hotWaterData and rinseData", () => {
    expect(waterTarget('hotWater', workflow)).toEqual({ duration: 30, volume: 50 });
    expect(waterTarget('flush', workflow)).toEqual({ duration: 10, volume: null });
  });

  it('are none without a workflow or with a 0', () => {
    expect(waterTarget('hotWater', null)).toEqual({ duration: null, volume: null });
    expect(waterTarget('flush', {})).toEqual({ duration: null, volume: null });
    expect(
      waterTarget('hotWater', { hotWaterData: { targetTemperature: 75, duration: 0, volume: 0, flow: 10 } }),
    ).toEqual({ duration: null, volume: null });
  });
});

describe('the ring', () => {
  it('shows whole seconds against the duration, as "Flush 6 / 10 s"', () => {
    expect(ringOf('flush', 6.4, 10)).toEqual({ share: 0.64, elapsed: 6, duration: 10, label: 'Flush 6 / 10 s' });
    expect(ringOf('hotWater', 0, 30)).toEqual({ share: 0, elapsed: 0, duration: 30, label: 'Hot water 0 / 30 s' });
  });

  it('is full at the duration and stays full past it, the seconds go on', () => {
    expect(ringOf('flush', 10, 10).share).toBe(1);
    expect(ringOf('flush', 14.9, 10)).toMatchObject({ share: 1, label: 'Flush 14 / 10 s' });
  });

  it('is empty without a duration and shows only the seconds', () => {
    expect(ringOf('flush', 3.2, null)).toEqual({ share: 0, elapsed: 3, duration: null, label: 'Flush 3 s' });
  });
});

describe('the cup', () => {
  it('fills to the volume so far against the target volume', () => {
    expect(cupOf(20, null, 50)).toEqual({ amount: 20, unit: 'ml', level: 0.4 });
    expect(cupOf(60, null, 50).level).toBe(1);
  });

  it("takes the scale's weight when a scale is connected", () => {
    expect(cupOf(20, 37.5, 50)).toEqual({ amount: 37.5, unit: 'g', level: 0.75 });
    expect(cupOf(20, -1.2, 50)).toEqual({ amount: 0, unit: 'g', level: 0 });
  });

  it('is drawn empty without a target volume', () => {
    expect(cupOf(20, null, null)).toEqual({ amount: 20, unit: 'ml', level: 0 });
  });
});

describe('the stream', () => {
  it('stands still at flow 0', () => {
    expect(streamOf(0)).toEqual({ moving: false, width: 0, period: 0 });
    expect(streamOf(0.04).moving).toBe(false);
    expect(streamOf(Number.NaN).moving).toBe(false);
  });

  it('is wider and faster with more flow, full from 10 ml/s', () => {
    const low = streamOf(1);
    const high = streamOf(8);
    expect(low.moving && high.moving).toBe(true);
    expect(high.width).toBeGreaterThan(low.width);
    expect(high.period).toBeLessThan(low.period);
    expect(streamOf(10)).toEqual({ moving: true, width: 1, period: 0.25 });
    expect(streamOf(14)).toEqual(streamOf(10));
  });
});

describe('the colour', () => {
  it("runs from the flow blue at 20 °C to the temperature red at 90 °C", () => {
    expect(waterColour(5)).toBe('rgb(77 163 255)');
    expect(waterColour(20)).toBe('rgb(77 163 255)');
    expect(waterColour(55)).toBe('rgb(166 135 181)');
    expect(waterColour(90)).toBe('rgb(255 107 107)');
    expect(waterColour(120)).toBe('rgb(255 107 107)');
    expect(waterColour(Number.NaN)).toBe('rgb(77 163 255)');
  });
});
