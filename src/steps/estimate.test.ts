import { describe, expect, it } from 'vitest';
import type { Profile, ProfileStep } from '../api';
import { pickerEntries, previewLastStepSeconds } from '../shell/profiles';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import { stepCurve } from './curve';
import { median3, shotEstimate } from './estimate';
import { predictShot } from './predict';

const base = { volume: 0, weight: 0, temperature: 93, sensor: 'coffee', exit: null, limiter: null } as const;
const flowStep = (flow: number, seconds: number, more: Partial<ProfileStep> = {}): ProfileStep => ({
  ...base,
  name: 'flow',
  pump: 'flow',
  transition: 'fast',
  flow,
  seconds,
  ...more,
});
const pressureStep = (pressure: number, seconds: number, more: Partial<ProfileStep> = {}): ProfileStep => ({
  ...base,
  name: 'pressure',
  pump: 'pressure',
  transition: 'fast',
  pressure,
  seconds,
  ...more,
});

describe('median3', () => {
  it('takes out a spike of one sample and keeps a step', () => {
    expect(median3([1, 1, 5, 1, 1])).toEqual([1, 1, 1, 1, 1]);
    expect(median3([1, 1, 1, 4, 4, 4])).toEqual([1, 1, 1, 4, 4, 4]);
    expect(median3([2])).toEqual([2]);
    expect(median3([])).toEqual([]);
  });
});

describe('shotEstimate', () => {
  it("draws the model's flow, pressure and temperature on its own time, every series as long as t", () => {
    const profile = { steps: [flowStep(4, 5), pressureStep(6, 5)], target_weight: 0 };
    const shot = predictShot(profile);
    const estimate = shotEstimate(profile);
    expect(estimate.t).toEqual(shot.t);
    expect(estimate.temperature).toEqual(shot.temperature);
    expect(estimate.flow).toEqual(median3(shot.flow));
    expect(estimate.pressure).toEqual(median3(shot.pressure));
    expect(estimate.seconds).toBe(shot.seconds);
    for (const series of Object.values(estimate)) {
      if (Array.isArray(series) && series !== estimate.borders) expect(series).toHaveLength(estimate.t.length);
    }
  });

  it('puts the borders and the targets at the moments the model starts the steps', () => {
    // The fill ends on its exit long before its 20 s.
    const fill = flowStep(6, 20, { exit: { type: 'pressure', condition: 'over', value: 2 } });
    const profile = { steps: [fill, pressureStep(8, 10)], target_weight: 0 };
    const shot = predictShot(profile);
    const estimate = shotEstimate(profile);
    const border = shot.steps[1].start;
    expect(border).toBeLessThan(20);
    expect(estimate.borders).toEqual([border]);
    const before = estimate.t.findIndex((time) => time >= border) - 1;
    // the fill drives the flow: its target is the flow, the pressure has none, and the other way after
    expect(estimate.targetFlow[before]).toBe(6);
    expect(estimate.targetPressure[before]).toBeNull();
    expect(estimate.targetFlow[before + 1]).toBeNull();
    expect(estimate.targetPressure[before + 1]).toBe(8);
    expect(estimate.targetTemperature.every((value) => value === 93)).toBe(true);
  });

  it("lays a ramp's target across the model's span of its step", () => {
    const profile = { steps: [flowStep(2, 5), flowStep(6, 10, { transition: 'smooth' })], target_weight: 0 };
    const estimate = shotEstimate(profile);
    const start = estimate.t.findIndex((time) => time >= estimate.borders[0] - 1e-9);
    expect(estimate.targetFlow[start]).toBeCloseTo(2);
    expect(estimate.targetFlow.at(-1)).toBeCloseTo(6);
    const middle = Math.round((start + estimate.t.length - 1) / 2);
    expect(estimate.targetFlow[middle]).toBeCloseTo(4, 1);
  });

  it('draws a limit across its step and none where a step has none', () => {
    const profile = {
      steps: [flowStep(6, 5), flowStep(2, 10, { limiter: { value: 9, range: 0.6 } })],
      target_weight: 0,
    };
    const estimate = shotEstimate(profile);
    expect(estimate.pressureLimit[1]).toBeNull();
    expect(estimate.pressureLimit.at(-1)).toBe(9);
    expect(estimate.flowLimit.every((value) => value === null)).toBe(true);
  });

  it('ends at the stop weight and draws no target for a step the model did not reach', () => {
    const profile = { steps: [flowStep(4, 60), pressureStep(9, 30)], target_weight: 20 };
    const estimate = shotEstimate(profile);
    expect(estimate.seconds).toBeLessThan(60);
    expect(estimate.borders).toEqual([]);
    expect(estimate.targetPressure.every((value) => value === null)).toBe(true);
  });

  it("ends default-dark's pour target at 1 ml/s, where the A-Flow editor's line ends", () => {
    const dark = pickerEntries([]).find((entry) => entry.id === 'default-dark')!;
    const estimate = shotEstimate(dark.profile, { lastStepSeconds: previewLastStepSeconds(dark) });
    const pourStart = estimate.t.findIndex((time) => time >= estimate.borders.at(-1)! - 1e-9);
    expect(estimate.targetFlow[pourStart]).toBeCloseTo(2);
    expect(estimate.targetFlow.at(-1)).toBeCloseTo(1);
    expect(estimate.pressureLimit.at(-1)).toBe(9);
  });

  it('gives empty series for a profile without steps', () => {
    const estimate = shotEstimate({ steps: [], target_weight: 36 });
    expect(estimate.t).toEqual([]);
    expect(estimate.flow).toEqual([]);
    expect(estimate.targetFlow).toEqual([]);
    expect(estimate.borders).toEqual([]);
    expect(estimate.seconds).toBe(0);
  });

  it('draws every bundled profile and default with finite values and its borders in order', () => {
    const profiles = [...(bundled as unknown as Profile[]), ...pickerEntries([]).map((entry) => entry.profile)];
    for (const profile of profiles) {
      const estimate = shotEstimate(profile);
      const values = [estimate.flow, estimate.pressure, estimate.temperature, estimate.targetFlow, estimate.targetPressure]
        .flat()
        .filter((value) => value !== null);
      expect(values.every(Number.isFinite), profile.title).toBe(true);
      expect(estimate.borders, profile.title).toEqual([...estimate.borders].sort((a, b) => a - b));
      // a profile whose steps the targets draw also has a modelled shot
      if (stepCurve(profile).t.length > 0) expect(estimate.t.length, profile.title).toBeGreaterThan(1);
    }
  });
});
