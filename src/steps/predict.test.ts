import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile } from '../aflow';
import type { Profile, ProfileStep } from '../api';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import recorded from './fixtures/shots-model.json' with { type: 'json' };
import { PREDICT_STEP, predictShot, type Puck } from './predict';
import { PUCK } from './puck';
import { checkShots, drawnAt, modelAt, type RecordedShot } from './shot-check';
import { stepCurve } from './curve';

const profiles = (bundled as unknown as Profile[]).filter((profile) => profile.steps?.length);
const shots = recorded as unknown as RecordedShot[];

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

describe('predictShot', () => {
  it('samples every tenth of a second from 0 and starts the steps in order', () => {
    const shot = predictShot({ steps: [flowStep(4, 5), pressureStep(6, 5)], target_weight: 0 });
    expect(shot.t[0]).toBe(0);
    expect(shot.t[1]).toBeCloseTo(PREDICT_STEP);
    expect(shot.steps.map((span) => span.index)).toEqual([0, 1]);
    expect(shot.steps[1].start).toBeCloseTo(5);
    expect(shot.seconds).toBeCloseTo(10);
    for (const series of [shot.flow, shot.pressure, shot.temperature, shot.weight]) {
      expect(series).toHaveLength(shot.t.length);
    }
  });

  it('passes a step of 0 s at once', () => {
    const shot = predictShot({ steps: [flowStep(4, 3), flowStep(8, 0), flowStep(2, 3)], target_weight: 0 });
    expect(shot.steps.map((span) => span.index)).toEqual([0, 2]);
  });

  it('follows the driven quantity through a lag and makes the other from the resistance', () => {
    const shot = predictShot({ steps: [flowStep(4, 20)], target_weight: 0 });
    const at = (time: number) => Math.round(time / PREDICT_STEP);
    expect(shot.flow[at(PUCK.flowLag)]).toBeCloseTo(4 * (1 - Math.exp(-1)), 1);
    expect(shot.flow[at(15)]).toBeCloseTo(4, 2);
    const i = at(15);
    expect(shot.pressure[i] / shot.flow[i]).toBeGreaterThan(PUCK.r0);
  });

  it('keeps the quantity it does not drive under the limiter', () => {
    const capped = predictShot({ steps: [flowStep(6, 30, { limiter: { value: 3, range: 0.6 } })], target_weight: 0 });
    expect(Math.max(...capped.pressure)).toBeLessThanOrEqual(3 + 1e-9);
    const limited = predictShot({ steps: [pressureStep(9, 30, { limiter: { value: 1, range: 0.6 } })], target_weight: 0 });
    expect(Math.max(...limited.flow)).toBeLessThanOrEqual(1 + 1e-9);
  });

  it('ends a step on its exit and the shot at the stop weight', () => {
    const fill = flowStep(8, 15, { exit: { type: 'pressure', condition: 'over', value: 2 } });
    const shot = predictShot({ steps: [fill, flowStep(2, 120)], target_weight: 36 });
    expect(shot.steps[1].start).toBeLessThan(15);
    expect(shot.pressure[Math.round(shot.steps[1].start / PREDICT_STEP)]).toBeGreaterThan(2);
    expect(shot.weight[shot.weight.length - 1]).toBeGreaterThanOrEqual(36);
    expect(shot.seconds).toBeLessThan(15 + 120);
  });

  it('ends an infuse at its weight, the water pushed less what the puck keeps', () => {
    const shot = predictShot({ steps: [pressureStep(3, 60, { weight: 4 }), flowStep(2, 30)], target_weight: 0 });
    const end = shot.steps[0].end;
    expect(end).toBeLessThan(60);
    expect(shot.weight[Math.round(end / PREDICT_STEP)]).toBeGreaterThanOrEqual(4);
  });

  it('ends with its last step without a stop weight', () => {
    const shot = predictShot({ steps: [pressureStep(9, 12), flowStep(2, 8)], target_weight: 0 });
    expect(shot.seconds).toBeCloseTo(20);
  });

  it('starts the temperature off the first target and follows the steps', () => {
    const shot = predictShot({
      steps: [flowStep(4, 10, { temperature: 94 }), flowStep(2, 60, { temperature: 88 })],
      target_weight: 0,
    });
    expect(shot.temperature[0]).toBeCloseTo(94 + PUCK.temperatureOffset);
    const last = shot.temperature[shot.temperature.length - 1];
    expect(Math.abs(last - 88)).toBeLessThan(Math.abs(shot.temperature[100] - 88));
  });

  it('takes another puck', () => {
    const steps = [flowStep(2, 30)];
    const firm: Puck = { ...PUCK, r0: 4, r1: 4 };
    expect(predictShot({ steps, target_weight: 0 }, firm).pressure.at(-1)).toBeCloseTo(8, 1);
  });

  it('models the bundled profiles, the A-Flow defaults and the fixture: finite, not negative, the same twice', () => {
    const all = [
      ...profiles,
      ...DEFAULT_PROFILES.map((entry) => generateProfile(entry.params, { title: entry.id })),
      ...shots.map((shot) => shot.profile),
    ];
    expect(profiles.length).toBeGreaterThanOrEqual(73);
    for (const profile of all) {
      const shot = predictShot(profile);
      expect(shot.steps.length, profile.title).toBeGreaterThan(0);
      expect(shot.seconds, profile.title).toBeLessThanOrEqual(180 + 1e-9);
      for (const value of [...shot.flow, ...shot.pressure, ...shot.temperature, ...shot.weight]) {
        expect(Number.isFinite(value) && value >= 0, profile.title).toBe(true);
      }
      expect(predictShot(profile)).toEqual(shot);
    }
    // Some ten thousand checks: about 2 s alone, more beside the other test files on a busy machine.
  }, 30_000);

  it('runs in milliseconds, also on the tablet', () => {
    for (const profile of [...profiles, ...shots.map((shot) => shot.profile)]) predictShot(profile);
    let slowest = 0;
    for (const profile of [...profiles, ...shots.map((shot) => shot.profile)]) {
      const began = performance.now();
      predictShot(profile);
      slowest = Math.max(slowest, performance.now() - began);
    }
    // a desktop takes well under a millisecond; the bound leaves the tablet twenty times that and more
    expect(slowest).toBeLessThan(50);
  });
});

describe('the check', () => {
  it('reads the targets as the step curve draws them', () => {
    const curve = stepCurve({ steps: [flowStep(8, 4), pressureStep(9, 10, { transition: 'smooth' })] });
    expect(drawnAt(curve, 'flow', 2)).toBe(8);
    expect(drawnAt(curve, 'flow', 6)).toBeNull();
    expect(drawnAt(curve, 'pressure', 9)).toBeCloseTo(4.5);
    expect(drawnAt(curve, 'temperature', 20)).toBeNull();
  });

  it('holds the model at its last value after its end', () => {
    const shot = predictShot({ steps: [flowStep(2, 5)], target_weight: 0 });
    expect(modelAt(shot, 'flow', 60)).toBe(shot.flow[shot.flow.length - 1]);
    expect(modelAt(shot, 'flow', 2.05)).toBeCloseTo((shot.flow[20] + shot.flow[21]) / 2);
  });

  it('on the ten held-out shots of the fixture: flow and pressure pass, temperature and length do not', () => {
    // Measured: the same check on all 242 held-out shots passes the flow
    // and the temperature and fails the pressure (39.7 percent below) and the length (59 percent)
    expect(shots).toHaveLength(10);
    const result = checkShots(shots);
    expect(result.mae.flow.model).toBeCloseTo(0.635, 3);
    expect(result.mae.flow.target).toBeCloseTo(4.815, 3);
    expect(result.mae.pressure.model).toBeCloseTo(0.939, 3);
    expect(result.mae.pressure.target).toBeCloseTo(1.6865, 3);
    expect(result.mae.temperature.model).toBeCloseTo(1.339, 3);
    expect(result.mae.temperature.target).toBeCloseTo(1.175, 3);
    expect(result.lengthWithin).toBe(6);
    expect(result.passes).toEqual({ flow: true, pressure: true, temperature: false, length: false });
  });

  it('keeps nothing of the export but the measurements and the steps', () => {
    for (const [n, shot] of shots.entries()) {
      expect(Object.keys(shot).sort()).toEqual(['flow', 'pressure', 'profile', 't', 'temperature', 'weight']);
      expect(Object.keys(shot.profile).sort()).toEqual(['steps', 'target_weight', 'title']);
      expect(shot.profile.title).toMatch(new RegExp(`^held-out shot ${n + 1} \\((A-Flow|other profile)\\)$`));
      // one sample per 0.5 s, and the shot's last
      const cells = shot.t.slice(0, -1).map((time) => Math.floor(time / 0.5 + 1e-6));
      expect(cells.every((cell, i) => i === 0 || cell > cells[i - 1])).toBe(true);
    }
  });
});
