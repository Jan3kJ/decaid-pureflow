// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// test/profile-editor.test.mjs (the four `pushChannel` tests).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
import { describe, expect, it } from 'vitest';
import type { Profile, ProfileStep } from '../api';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import { pushChannel, stepCurve } from './curve';
import { insertStepAfter, moveStep, removeStepAt, setPump, setValue } from './model';
import { DEFAULT_PROFILES } from '../aflow';
import { buildCurve } from '../editor/curve';
import { pickerEntries, previewLastStepSeconds } from '../shell/profiles';

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

  it('smooth ramps from 0 after a step of the other pump without an exit or limit on it, as in Streamline', () => {
    const curve = stepCurve(profile([step({ pump: 'flow', flow: 4 }), step({ pump: 'pressure', pressure: 9, transition: 'smooth' })]));
    expect(curve.pressure).toEqual([null, null, 0, 9]);
  });

  it("smooth ramps after a step of the other pump from that step's exit on its quantity, else its limit", () => {
    const after = (before: Partial<ProfileStep>) =>
      stepCurve(profile([step({ pump: 'pressure', pressure: 9, ...before }), step({ flow: 0, transition: 'smooth' })])).flow;
    expect(after({ exit: { type: 'flow', condition: 'over', value: 2 }, limiter: { value: 5, range: 0.6 } })).toEqual([
      null,
      null,
      2,
      0,
    ]);
    expect(after({ limiter: { value: 5, range: 0.6 } })).toEqual([null, null, 5, 0]);
    // An exit on the step's own quantity says nothing about the other one.
    expect(after({ exit: { type: 'pressure', condition: 'over', value: 4 } })).toEqual([null, null, 0, 0]);
  });

  it("draws a flow step's pressure limit and a pressure step's flow limit across the step, none for a step without one", () => {
    const curve = stepCurve(
      profile([
        step({ flow: 2, limiter: { value: 9, range: 0.6 } }),
        step({ pump: 'pressure', pressure: 6, limiter: { value: 3, range: 0.6 } }),
        step({ flow: 4, limiter: null }),
        step({ flow: 4, limiter: { value: 0, range: 0.6 } }),
      ]),
    );
    expect(curve.pressureLimit).toEqual([9, 9, null, null, null, null, null, null]);
    expect(curve.flowLimit).toEqual([null, null, 3, 3, null, null, null, null]);
  });

  it('lastStepSeconds cuts the last step and its ramp there, and no other step', () => {
    const steps = [step({ seconds: 10, flow: 4 }), step({ seconds: 60, flow: 1, transition: 'smooth' })];
    const curve = stepCurve(profile(steps), { lastStepSeconds: 30 });
    expect(curve.t).toEqual([0, 10, 10, 40]);
    expect(curve.flow).toEqual([4, 4, 4, 2.5]);
    expect(curve.seconds).toBe(40);
    // A last step shorter than that is drawn whole; a fast one holds its target.
    expect(stepCurve(profile(steps), { lastStepSeconds: 90 })).toEqual(stepCurve(profile(steps)));
    expect(stepCurve(profile([step({ seconds: 60, flow: 1 })]), { lastStepSeconds: 30 }).flow).toEqual([1, 1]);
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

  it('a step of 0 s is not drawn: no width, no point, no gap, whatever its volume, weight or exit', () => {
    const steps = [
      step({ seconds: 5, flow: 2 }),
      step({ seconds: 0, volume: 100 }),
      step({ seconds: 0, pump: 'pressure', pressure: 9, weight: 36, exit: { type: 'pressure', condition: 'over', value: 4 } }),
      step({ seconds: 20, flow: 4, transition: 'smooth' }),
    ];
    const curve = stepCurve(profile(steps));
    expect(curve.steps).toEqual([
      { index: 0, start: 0, end: 5 },
      { index: 3, start: 5, end: 25 },
    ]);
    expect(curve.t).toEqual([0, 5, 5, 25]);
    // The pressure step of 0 s leaves no gap in the flow, and the ramp starts from the step before.
    expect(curve.flow).toEqual([2, 2, 2, 4]);
    expect(curve.pressure).toEqual([null, null, null, null]);
    expect(curve.seconds).toBe(25);
    // The same as without the 0 s steps.
    expect(curve).toEqual({ ...stepCurve(profile([steps[0], steps[3]])), steps: curve.steps });
    // A time missing or not a number counts as 0 s.
    expect(stepCurve(profile([step({ seconds: undefined }), step({ seconds: NaN })])).seconds).toBe(0);
  });

  it('a 0 s step adds no width, nor a limit', () => {
    const curve = stepCurve(
      profile([step({ seconds: 5, flow: 2 }), step({ seconds: 0, limiter: { value: 9, range: 0.6 } }), step({ seconds: 5, flow: 3 })]),
    );
    expect(curve.t).toEqual([0, 5, 5, 10]);
    expect(curve.pressureLimit).toEqual([null, null, null, null]);
  });

  it('a profile without steps has no curve', () => {
    expect(stepCurve(profile([]))).toEqual({
      t: [],
      pressure: [],
      flow: [],
      temperature: [],
      pressureLimit: [],
      flowLimit: [],
      steps: [],
      seconds: 0,
    });
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

  it('every bundled profile gives two points per step longer than 0 s, all series as long as the times', () => {
    for (const p of profiles) {
      const curve = stepCurve(p);
      expect(curve.t.length).toBe(2 * p.steps.filter((s) => Number(s.seconds) > 0).length);
      for (const series of [curve.pressure, curve.flow, curve.temperature, curve.pressureLimit, curve.flowLimit]) {
        expect(series.length).toBe(curve.t.length);
      }
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

// The preview checked against the steps it is drawn from: every bundled profile and the skin's defaults.
describe('stepCurve against the steps', () => {
  const limitOf = (s: ProfileStep) => (Number(s.limiter?.value) > 0 ? Number(s.limiter!.value) : null);

  it("every bundled profile: each drawn step ends on its target, and its limit is drawn on the other pump's quantity", () => {
    for (const p of profiles) {
      const curve = stepCurve(p);
      curve.steps.forEach((span, i) => {
        const s = p.steps[span.index];
        const end = 2 * i + 1;
        const where = `${p.title}, step ${span.index}`;
        expect(span.end - span.start, where).toBe(Number(s.seconds));
        if (s.pump === 'pressure') {
          expect([curve.pressure[end], curve.flow[end], curve.flowLimit[end], curve.pressureLimit[end]], where).toEqual([
            Number(s.pressure),
            null,
            limitOf(s),
            null,
          ]);
        } else {
          expect([curve.flow[end], curve.pressure[end], curve.pressureLimit[end], curve.flowLimit[end]], where).toEqual([
            Number(s.flow),
            null,
            limitOf(s),
            null,
          ]);
        }
      });
    }
  });

  const defaults = pickerEntries([]).filter((entry) => entry.isDefault);
  const paramsOf = (id: string) => DEFAULT_PROFILES.find((entry) => entry.id === id)!.params;
  /** Where the A-Flow editor's flow line ends. */
  const editorEnd = (id: string) => buildCurve(paramsOf(id)).flow.flat().at(-1)!.y;
  const dark = defaults.find((entry) => entry.id === 'default-dark')!;
  const darkCurve = stepCurve(dark.profile, { lastStepSeconds: previewLastStepSeconds(dark) });

  it("default-dark: the pour starts at Ramp Up's exit, 2 ml/s, and ends at 1 ml/s, where the A-Flow editor's line ends", () => {
    const pouring = dark.profile.steps.length - 1;
    expect(dark.profile.steps[pouring]).toMatchObject({ pump: 'flow', flow: 0, transition: 'smooth', seconds: 60 });
    const at = darkCurve.steps.findIndex((span) => span.index === pouring);
    expect(darkCurve.flow.slice(2 * at)).toEqual([2, 1]);
    expect(darkCurve.steps[at].end - darkCurve.steps[at].start).toBe(30);
    expect(editorEnd('default-dark')).toBe(1);
  });

  it("default-dark: the Pouring step's 9 bar limit is drawn across it, and a step without a limit draws none", () => {
    const at = darkCurve.steps.length - 1;
    expect(darkCurve.pressureLimit.slice(2 * at)).toEqual([9, 9]);
    darkCurve.steps.forEach((span, i) => {
      if (limitOf(dark.profile.steps[span.index]) === null) {
        expect([darkCurve.pressureLimit[2 * i], darkCurve.flowLimit[2 * i]]).toEqual([null, null]);
      }
    });
  });

  it('every skin default: the pour starts at its pour flow and ends where the editor ends it; no 0 s step is drawn', () => {
    for (const entry of defaults) {
      const curve = stepCurve(entry.profile, { lastStepSeconds: previewLastStepSeconds(entry) });
      const [from, to] = curve.flow.slice(-2) as number[];
      expect(from, entry.id).toBe(paramsOf(entry.id).pourFlow);
      expect(to, entry.id).toBeCloseTo(editorEnd(entry.id), 9);
      expect(curve.steps.length).toBe(entry.profile.steps.filter((s) => s.seconds > 0).length);
    }
  });

  it('a profile the A-Flow editor cannot read is drawn whole', () => {
    expect(
      previewLastStepSeconds({ profile: profiles.find((p) => p.title === 'Blooming Espresso')!, metadata: null }),
    ).toBeUndefined();
  });
});
