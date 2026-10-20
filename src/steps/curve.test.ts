// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// test/profile-editor.test.mjs (the four `pushChannel` tests).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
import { describe, expect, it } from 'vitest';
import type { Profile, ProfileStep } from '../api';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import { UNTIMED_STEP_SECONDS, pushChannel, stepCurve } from './curve';
import { insertStepAfter, moveStep, removeStepAt, setPump, setValue } from './model';

const profiles = bundled as unknown as Profile[];

function channel(steps: { dur: number; target: number; transition?: string }[]) {
  const x: number[] = [];
  const y: (number | null)[] = [];
  let prev = 0;
  let t = 0;
  for (const s of steps) {
    pushChannel(x, y, t, t + s.dur, prev, s.target, s.transition);
    prev = s.target;
    t += s.dur;
  }
  return { x, y };
}

describe('pushChannel (Streamline)', () => {
  it('smooth ramps from zero on the opening step', () => {
    expect(channel([{ dur: 10, target: 6, transition: 'smooth' }]).y).toEqual([0, 6]);
    expect(channel([{ dur: 10, target: 6, transition: 'fast' }]).y).toEqual([6, 6]);
  });

  it('smooth ramps from the previous step target, fast jumps', () => {
    const steps = (transition: string) => [
      { dur: 10, target: 3, transition: 'fast' },
      { dur: 20, target: 9, transition },
    ];
    expect(channel(steps('smooth')).y).toEqual([3, 3, 3, 9]);
    expect(channel(steps('fast')).y).toEqual([3, 3, 9, 9]);
  });

  it('the ramp spans the whole frame, not a capped fraction of it', () => {
    expect(channel([{ dur: 30, target: 8, transition: 'smooth' }]).x).toEqual([0, 30]);
  });

  it('x and y stay equal length on every path', () => {
    for (const transition of ['smooth', 'fast', undefined]) {
      const { x, y } = channel([
        { dur: 5, target: 2, transition },
        { dur: 5, target: 2, transition },
      ]);
      expect(x.length).toBe(y.length);
    }
  });
});

const step = (over: Partial<ProfileStep>): ProfileStep => ({
  name: 'step',
  pump: 'flow',
  transition: 'fast',
  flow: 4,
  temperature: 93,
  sensor: 'coffee',
  seconds: 10,
  volume: 0,
  weight: 0,
  exit: null,
  limiter: null,
  ...over,
});

const profile = (steps: ProfileStep[]): Profile => ({ title: 't', steps, target_volume_count_start: 0, tank_temperature: 0 });

describe('stepCurve', () => {
  it('draws each target only where the step drives it: the other pump is a gap', () => {
    const curve = stepCurve(
      profile([
        step({ pump: 'pressure', pressure: 6, flow: 3, seconds: 5 }),
        step({ pump: 'flow', flow: 2, pressure: 9, seconds: 10 }),
      ]),
    );
    expect(curve.t).toEqual([0, 5, 5, 15]);
    expect(curve.pressure).toEqual([6, 6, null, null]);
    expect(curve.flow).toEqual([null, null, 2, 2]);
    expect(curve.temperature).toEqual([93, 93, 93, 93]);
  });

  it('smooth ramps from 0 after a step of the other pump, as in Streamline', () => {
    const curve = stepCurve(profile([step({ pump: 'flow', flow: 4 }), step({ pump: 'pressure', pressure: 9, transition: 'smooth' })]));
    expect(curve.pressure).toEqual([null, null, 0, 9]);
  });

  it('the durations add up, step after step', () => {
    const curve = stepCurve(profile([step({ seconds: 2 }), step({ seconds: 23 }), step({ seconds: 30 })]));
    expect(curve.steps.map((s) => [s.start, s.end])).toEqual([
      [0, 2],
      [2, 25],
      [25, 55],
    ]);
    expect(curve.seconds).toBe(55);
  });

  it('a step without a time is drawn 10 s long, whatever its volume, weight or exit', () => {
    const curve = stepCurve(
      profile([
        step({ seconds: 0, volume: 100 }),
        step({ seconds: 0, weight: 36, exit: { type: 'pressure', condition: 'over', value: 4 } }),
        step({ seconds: 20, volume: 50 }),
      ]),
    );
    expect(UNTIMED_STEP_SECONDS).toBe(10);
    expect(curve.steps).toEqual([
      { start: 0, end: 10, untimed: true },
      { start: 10, end: 20, untimed: true },
      { start: 20, end: 40, untimed: false },
    ]);
  });

  it('a profile without steps has no curve', () => {
    expect(stepCurve(profile([]))).toEqual({ t: [], pressure: [], flow: [], temperature: [], steps: [], seconds: 0 });
  });

  it('reads numbers that a file holds as strings', () => {
    const curve = stepCurve(profile([step({ flow: '4.5' as unknown as number, seconds: '12' as unknown as number })]));
    expect(curve.flow).toEqual([4.5, 4.5]);
    expect(curve.seconds).toBe(12);
  });

  it('Blooming Espresso, a bundled profile', () => {
    const blooming = profiles.find((p) => p.title === 'Blooming Espresso')!;
    const curve = stepCurve(blooming);
    expect(curve.seconds).toBe(2 + 23 + 30 + 5 + 20 + 1);
    // "ramp" is smooth from the pause's 0 ml/s to 2.2.
    expect(curve.flow.slice(6, 8)).toEqual([0, 2.2]);
    expect(curve.pressure.every((v) => v === null)).toBe(true);
  });

  it('every bundled profile gives two points per step, all series as long as the times', () => {
    for (const p of profiles) {
      const curve = stepCurve(p);
      expect(curve.t.length).toBe(2 * p.steps.length);
      for (const series of [curve.pressure, curve.flow, curve.temperature]) expect(series.length).toBe(curve.t.length);
      expect(curve.t.every((t) => Number.isFinite(t))).toBe(true);
    }
  });

  it('each kind of step edit changes the curve', () => {
    const base = profile([step({ seconds: 5 }), step({ pump: 'pressure', pressure: 6, seconds: 10 })]);
    const before = stepCurve(base);
    const edits = [
      setValue(base, 0, 'target', 6),
      setValue(base, 1, 'seconds', 20),
      setValue(base, 0, 'temperature', 88),
      insertStepAfter(base, 1),
      removeStepAt(base, 0),
      moveStep(base, 0, 1),
      setPump(base, 0, { pump: 'flow', transition: 'smooth' }),
    ];
    for (const edited of edits) expect(stepCurve(edited)).not.toEqual(before);
  });
});
