import { describe, expect, it } from 'vitest';
import type { MachineSnapshot, MachineState, Workflow } from '../api';
import { recordWaterFrame, ringOf, waterDuration, waterKindOf, waterSeconds, waterValues, type WaterRun } from './water';

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

  it('keeps the latest flow and temperature, and the time from the first frame', () => {
    // The rig's hot water: 5.78, 9.51, then 10 ml/s, a frame every 0.5 s.
    const run = record([
      frame('idle', 0),
      frame('hotWater', 1, 5.78, 70),
      frame('hotWater', 1.5, 9.51, 72),
      frame('hotWater', 2, 10, 74),
      frame('hotWater', 3, 10, 75),
    ])!;
    expect(run).toMatchObject({ kind: 'hotWater', ended: false, flow: 10, temperature: 75 });
    expect(waterSeconds(run)).toBe(2);
  });

  it('does not move its time back for a clock that steps back, and takes a negative flow as 0', () => {
    const back = record([frame('hotWater', 2, 4), frame('hotWater', 1, 4), frame('hotWater', 3, 4)])!;
    expect(waterSeconds(back)).toBe(1);
    expect(record([frame('hotWater', 0, -0.2)])!.flow).toBe(0);
  });

  it('ends at the first frame of another state and keeps its numbers; the next run starts at 0', () => {
    const ended = record([frame('hotWater', 0, 10), frame('hotWater', 1, 10), frame('idle', 2)])!;
    expect(ended.ended).toBe(true);
    expect(waterSeconds(ended)).toBe(1);
    expect(record([frame('idle', 3)], ended)).toBe(ended);
    const next = record([frame('hotWater', 4, 6)], ended)!;
    expect(next).toMatchObject({ ended: false, startedAt: next.at });
    expect(waterSeconds(next)).toBe(0);
  });

  it('starts anew when flush follows hot water directly', () => {
    const run = record([frame('hotWater', 0, 10), frame('hotWater', 1, 10), frame('flush', 2, 6)])!;
    expect(run).toMatchObject({ kind: 'flush', ended: false });
    expect(waterSeconds(run)).toBe(0);
  });
});

describe('the target duration', () => {
  const workflow: Workflow = {
    hotWaterData: { targetTemperature: 75, duration: 30, volume: 50, flow: 10 },
    rinseData: { targetTemperature: 90, duration: 10, flow: 6 },
  };

  it("is the workflow's hotWaterData or rinseData duration", () => {
    expect(waterDuration('hotWater', workflow)).toBe(30);
    expect(waterDuration('flush', workflow)).toBe(10);
  });

  it('is none without a workflow or with a 0', () => {
    expect(waterDuration('hotWater', null)).toBeNull();
    expect(waterDuration('flush', {})).toBeNull();
    expect(waterDuration('hotWater', { hotWaterData: { targetTemperature: 75, duration: 0, volume: 0, flow: 10 } })).toBeNull();
  });
});

describe('the ring', () => {
  it('shows whole seconds against the duration, as "6 / 10 s"', () => {
    expect(ringOf(6.4, 10)).toEqual({ share: 0.64, elapsed: 6, duration: 10, time: '6 / 10 s' });
    expect(ringOf(0, 30)).toEqual({ share: 0, elapsed: 0, duration: 30, time: '0 / 30 s' });
  });

  it('is full at the duration and stays full past it, the seconds go on', () => {
    expect(ringOf(10, 10).share).toBe(1);
    expect(ringOf(14.9, 10)).toMatchObject({ share: 1, time: '14 / 10 s' });
  });

  it('is empty without a duration and shows only the seconds', () => {
    expect(ringOf(3.2, null)).toEqual({ share: 0, elapsed: 3, duration: null, time: '3 s' });
  });
});

describe('the values in the stop button', () => {
  const run = (kind: 'hotWater' | 'flush', flow: number, temperature: number): WaterRun =>
    record([frame(kind, 0, flow, temperature), frame(kind, 6.4, flow, temperature)])!;

  it('are temperature, flow and time for flush, and no weight even with a scale', () => {
    const flush = run('flush', 6, 89.6);
    expect(waterValues(flush, ringOf(waterSeconds(flush), 10), 31.4)).toEqual({
      temperature: '90 °C',
      flow: '6.0 ml/s',
      time: '6 / 10 s',
      weight: null,
    });
  });

  it("are the scale's weight in g too for hot water with a scale", () => {
    const hot = run('hotWater', 9.51, 75);
    expect(waterValues(hot, ringOf(waterSeconds(hot), 30), 31.44)).toEqual({
      temperature: '75 °C',
      flow: '9.5 ml/s',
      time: '6 / 30 s',
      weight: '31.4 g',
    });
  });

  it('have no weight for hot water without a scale, and show a weight below 0 as 0', () => {
    const hot = run('hotWater', 0, 40);
    expect(waterValues(hot, ringOf(1, null), null)).toEqual({ temperature: '40 °C', flow: '0.0 ml/s', time: '1 s', weight: null });
    expect(waterValues(hot, ringOf(1, null), -0.3).weight).toBe('0.0 g');
  });

  it("show '–' for a temperature the machine did not send", () => {
    expect(waterValues(run('flush', 0, Number.NaN), ringOf(0, null), null).temperature).toBe('– °C');
  });
});
