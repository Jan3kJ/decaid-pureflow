import { describe, expect, it } from 'vitest';
import { isScaleSnapshot, type MachineSnapshot, type ScaleFrame, type ShotRecord } from '../api';
// Both streams of a simulated shot recorded on the rig (Decaid 0.8.8, A-Flow / default-medium).
import recording from '../../e2e/fixtures/shot.json';
// The rig's own record of a shot (GET /api/v1/shots/{id}, Decaid 0.8.8, 2026-10-11), read on 2026-10-19.
import rigShot from './fixtures/rig-shot.json';
import { formatRange, formatStartPeakEnd, phaseSample, phaseTable, recordSamples, type PhaseSample } from './phases';
import { recordFrame, settleWeight, type Shot } from './shot';

// The expected cells are what Streamline 0.2.14's own shotData.js writes for the same shot:
// its renderPastShot run under Node with a stub document (research.md 24.2).

describe('the formats of Streamline', () => {
  it('writes start → peak → end, the peak only when it is neither', () => {
    expect(formatStartPeakEnd([3.3, 9.5, 8.3], 1)).toBe('3.3→9.5→8.3');
    expect(formatStartPeakEnd([0.6, 2, 3.1], 1)).toBe('0.6→3.1');
    expect(formatStartPeakEnd([8, 5, 3.4], 1)).toBe('8.0→3.4');
    expect(formatStartPeakEnd([2, 4, 2], 1)).toBe('2.0');
    expect(formatStartPeakEnd([], 1)).toBe('–');
  });

  it('writes the temperature as lowest → highest', () => {
    expect(formatRange([92, 80, 88], 0)).toBe('80→92');
    expect(formatRange([92.2, 91.9], 0)).toBe('92');
  });
});

describe('the per-phase table of the rig shot record', () => {
  const { samples, finalWeight } = recordSamples(rigShot as unknown as ShotRecord);
  const table = phaseTable(samples, finalWeight)!;

  it('counts only preinfusion and pouring frames, and takes Decaid’s yield as the total', () => {
    // 278 measurements: 9 preparingForShot, 44 preinfusion, 225 pouring.
    expect(samples).toHaveLength(269);
    expect(finalWeight).toBe(34.3);
  });

  it('equals Streamline’s table of the same record', () => {
    expect(table.preinfusion).toEqual({
      seconds: '4',
      weight: '0.0g',
      volume: '34',
      temperature: '78→89',
      flow: '7.4→8.0',
      pressure: '0.7→3.1',
    });
    expect(table.extraction).toEqual({
      seconds: '23',
      weight: '34.3g',
      volume: '40',
      temperature: '89→93',
      flow: '8.0→2.3',
      pressure: '3.2→10.0→6.5',
    });
    expect(table.total).toEqual({ seconds: '27', weight: '34.3g', volume: '74' });
  });
});

describe('the per-phase table of a live shot', () => {
  const events = recording as { at: number; machine?: MachineSnapshot; scale?: ScaleFrame }[];
  let shot: Shot | null = null;
  let weight: number | null = null;
  for (const event of events) {
    if (event.machine) shot = recordFrame(shot, event.machine, weight);
    if (event.scale && isScaleSnapshot(event.scale)) {
      weight = event.scale.weight;
      shot = settleWeight(shot, weight);
    }
  }

  it('is recorded with the shot: one sample per preinfusion or pouring frame', () => {
    const counted = events.filter(
      (event) => event.machine?.state.state === 'espresso' && ['preinfusion', 'pouring'].includes(event.machine.state.substate),
    );
    expect(shot!.ended).toBe(true);
    expect(shot!.samples).toHaveLength(counted.length);
  });

  it('equals Streamline’s table of the same frames', () => {
    const table = phaseTable(shot!.samples)!;
    expect(table.preinfusion).toEqual({
      seconds: '4',
      weight: '0.0g',
      volume: '34',
      temperature: '78→89',
      flow: '7.4→8.0',
      pressure: '0.7→3.1',
    });
    expect(table.extraction).toMatchObject({ seconds: '23', weight: '33.8g', volume: '40', pressure: '3.3→10.0→6.6' });
    expect(table.total).toEqual({ seconds: '27', weight: '33.8g', volume: '74' });
  });

  it('holds the weight in the cup after the shot: the drops count, a cup taken away does not', () => {
    expect(shot!.finalWeight).toBeGreaterThanOrEqual(33.8);
    const held = shot!.finalWeight!;
    expect(settleWeight(shot, held + 0.4)!.finalWeight).toBeCloseTo(held + 0.4, 5);
    expect(settleWeight(shot, 0)!.finalWeight).toBe(held);
    expect(settleWeight(shot, null)).toBe(shot);
    expect(phaseTable(shot!.samples, held)!.total.weight).toBe(`${held.toFixed(1)}g`);
  });
});

describe('phaseTable', () => {
  const sample = (s: number, pouring: boolean, over: Partial<PhaseSample> = {}): PhaseSample => ({
    at: s * 1000,
    pouring,
    pressure: 2,
    flow: 2,
    temperature: 92,
    weight: null,
    ...over,
  });

  it('is null without a sample', () => {
    expect(phaseTable([])).toBeNull();
  });

  it('has no extraction before the first frame in pouring', () => {
    const table = phaseTable([sample(0, false), sample(1, false), sample(2, false)])!;
    expect(table.extraction).toBeNull();
    expect(table.preinfusion.seconds).toBe('2');
    expect(table.total.seconds).toBe('2');
    expect(table.preinfusion.volume).toBe('4');
  });

  it('ends the preinfusion with the frame before the first in pouring, as Streamline', () => {
    const table = phaseTable([
      sample(0, false, { weight: 0 }),
      sample(5, false, { weight: 1 }),
      sample(6, true, { weight: 2 }),
      sample(30, true, { weight: 30 }),
    ])!;
    expect(table.preinfusion).toMatchObject({ seconds: '5', weight: '1.0g' });
    expect(table.extraction).toMatchObject({ seconds: '24', weight: '29.0g' });
    expect(table.total).toMatchObject({ seconds: '30', weight: '30.0g' });
  });

  it('writes no weight without a scale', () => {
    const table = phaseTable([sample(0, false), sample(1, true), sample(2, true)])!;
    expect(table.preinfusion.weight).toBe('–');
    expect(table.extraction!.weight).toBe('–');
    expect(table.total.weight).toBe('–');
  });
});

describe('phaseSample', () => {
  const base = (rigShot as unknown as ShotRecord).measurements[50].machine;

  it('counts preinfusion and pouring in espresso only', () => {
    expect(phaseSample(base, 1)).toMatchObject({ pouring: true, weight: 1, temperature: base.groupTemperature });
    expect(phaseSample({ ...base, state: { state: 'espresso', substate: 'preinfusion' } }, null)!.pouring).toBe(false);
    expect(phaseSample({ ...base, state: { state: 'espresso', substate: 'preparingForShot' } }, null)).toBeNull();
    expect(phaseSample({ ...base, state: { state: 'espresso', substate: 'pouringDone' } }, null)).toBeNull();
    expect(phaseSample({ ...base, state: { state: 'hotWater', substate: 'pouring' } }, null)).toBeNull();
  });
});
