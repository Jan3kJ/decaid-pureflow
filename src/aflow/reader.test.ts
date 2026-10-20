import { describe, expect, it } from 'vitest';
import bundled from '../steps/fixtures/bundled-profiles.json' with { type: 'json' };
import * as C from './constants';
import { DEFAULT_PROFILES } from './defaults';
import plugin12 from './fixtures/plugin-1.2.json' with { type: 'json' };
import rig14 from './fixtures/rig-plugin-1.4.json' with { type: 'json' };
import { generateProfile, generateSteps, resolveParams } from './generator';
import { PLUGIN_LIKE_DFLOW_STEPS, PLUGIN_STEPS, PLUGIN_STOP_WEIGHT } from './plugin-expected';
import { readSteps, type StoredProfile, type StoredStep } from './reader';
import type { AFlowParams } from './types';
import { paramRanges, validateParams } from './validate';

// The fixtures: rig-plugin-1.4.json holds the five A-Flow profiles of the rig (Decaid 0.8.8),
// as `GET /api/v1/profiles` returned them on 2026-10-20: the plugin's 1.4 files, as Decaid
// converted them, with its 15 s Pause. plugin-1.2.json holds the same five files as plugin 1.2
// wrote them (Jan3kJ/A_Flow at 5cbdbd59, `profiles/`), six steps, put into the gateway's form
// as Decaid converts a file: the pump's own target, `exit` only where `exit_if` is 1.

const params = (id: string): AFlowParams => DEFAULT_PROFILES.find((entry) => entry.id === id)!.params;
const byTitle = (list: StoredProfile[], name: string) => list.find((p) => (p as { title?: string }).title === `A-Flow / ${name}`)!;

function read(profile: StoredProfile) {
  const result = readSteps(profile);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

const withStep = (profile: StoredProfile, name: string, change: Partial<StoredStep>): StoredProfile => ({
  ...profile,
  steps: profile.steps.map((step) => (step.name === name ? { ...step, ...change } : step)),
});

describe('the A-Flow profiles on the rig (plugin 1.4, nine steps)', () => {
  it('every one reads; Pre Fill and the Pause Decaid left at 15 s without its 2nd Fill are dropped', () => {
    for (const profile of rig14) {
      const result = read(profile);
      expect(result.dropped.filter((d) => d !== 'rampDown')).toEqual(['preFill', 'pause']);
      expect(result.params.pauseDuration).toBe(0);
    }
  });

  it("Decaid's light, medium and dark give the skin's defaults of those names", () => {
    for (const name of ['light', 'medium', 'dark']) {
      expect(read(byTitle(rig14, `default-${name}`)).params).toEqual(params(`default-${name}`));
    }
  });

  it('very-dark has ramp down: its time goes to the ramp, 3 + 3 s, and it is named', () => {
    const result = read(byTitle(rig14, 'default-very-dark'));
    expect(result.dropped).toEqual(['preFill', 'rampDown', 'pause']);
    expect(result.params).toMatchObject({ rampTime: 6, pourFlow: 1.8, pourPressure: 10, flowUp: true, pourEndFlow: null });
    expect(result.params).toMatchObject({ fillTemperature: 93, infuseTemperature: null, pourTemperature: 88, rampTemperature: null });
    expect(result.params).toMatchObject({ infuseTime: 6, infuseWeight: 2, stopWeight: 32, pourPressureLimit: null });
  });

  it('like-dflow has no ramp: Flow Start comes back, 10 s', () => {
    const result = read(byTitle(rig14, 'default-like-dflow'));
    expect(result.params.rampTime).toBe(0);
    expect(generateSteps(result.params).map((step) => step.name)).toContain(C.STEP_NAME.pouringStart);
  });
});

describe('the A-Flow profiles of plugin 1.2 (six steps, no Pre Fill, no 2nd fill)', () => {
  it('every one reads, and only very-dark drops something: its ramp down', () => {
    for (const profile of plugin12) {
      const result = read(profile);
      expect(result.dropped).toEqual(profile.title.endsWith('very-dark') ? ['rampDown'] : []);
    }
  });

  it('the values are the plugin 1.2 files: medium at 95 °C, infuse following the fill', () => {
    expect(read(byTitle(plugin12, 'default-medium')).params).toEqual({
      ...params('default-medium'),
      fillTemperature: 95,
      pourTemperature: 95,
    });
    expect(read(byTitle(plugin12, 'default-very-dark')).params).toMatchObject({ rampTime: 6, pourFlow: 1.8, fillTemperature: 95 });
  });

  it('dark reads with flow down, the pour at 0 ml/s', () => {
    expect(read(byTitle(plugin12, 'default-dark')).params).toMatchObject({ flowUp: false, pourEndFlow: null, pourTemperature: 88 });
  });
});

describe('the regression fixtures give back the generator input', () => {
  for (const id of Object.keys(PLUGIN_STEPS)) {
    it(id, () => {
      const result = read({ steps: PLUGIN_STEPS[id], target_weight: PLUGIN_STOP_WEIGHT[id] });
      expect(result.params).toEqual(params(id));
      expect(result.dropped).toEqual(['preFill']);
    });
  }

  it("the plugin's like-dflow steps", () => {
    const expected = { ...params('default-medium'), infuseWeight: 4, rampTime: 0, stopWeight: 36 };
    expect(read({ steps: PLUGIN_LIKE_DFLOW_STEPS, target_weight: 36 }).params).toEqual(expected);
  });
});

// The round trip: the parameters in their canonical form (a followed value null where it
// equals what it follows, the 2nd fill's own values the defaults while it is off) are what
// reading the generated profile gives back.
function canonical(p: AFlowParams): AFlowParams {
  const r = resolveParams(p);
  const toggleEnd = (up: boolean) => (up ? Math.round(r.pourFlow * C.FLOW_UP_FACTOR * 10) / 10 : C.FLOW_DOWN_TARGET);
  const followsToggle = r.pourEndFlow === toggleEnd(true) || r.pourEndFlow === toggleEnd(false);
  const secondOn = p.pauseDuration > 0;
  return {
    ...p,
    dose: C.DOSE,
    infuseTemperature: r.infuseTemperature === r.fillTemperature ? null : r.infuseTemperature,
    secondFillFlow: secondOn ? p.secondFillFlow : C.SECOND_FILL_FLOW,
    secondFillExitPressure: secondOn ? p.secondFillExitPressure : C.SECOND_FILL_EXIT_PRESSURE_OVER,
    secondFillTemperature: secondOn && r.secondFillTemperature !== r.infuseTemperature ? r.secondFillTemperature : null,
    secondFillTime: secondOn ? p.secondFillTime : C.SECOND_FILL_SECONDS,
    pauseExitFlow: secondOn ? p.pauseExitFlow : C.PAUSE_EXIT_FLOW_UNDER,
    rampTemperature: r.rampTemperature === r.pourTemperature ? null : r.rampTemperature,
    pourEndFlow: followsToggle ? null : r.pourEndFlow,
    flowUp: followsToggle ? r.pourEndFlow !== C.FLOW_DOWN_TARGET : r.pourEndFlow >= r.pourFlow,
    pourPressureLimit: r.pourPressureLimit === r.pourPressure ? null : r.pourPressureLimit,
  };
}

const roundTrip = (p: AFlowParams, firstStepWorkaround: boolean) => readSteps(generateProfile(p, { title: 't', firstStepWorkaround }));

describe('generating and then reading gives the same values', () => {
  const variants = (p: AFlowParams) =>
    [0, 15].flatMap((pauseDuration) =>
      [true, false].flatMap((flowUp) => [p.rampTime, 0].map((rampTime) => ({ ...p, pauseDuration, flowUp, rampTime }))),
    );

  it('every default, with and without the 2nd fill, flow up and down, with and without a ramp', () => {
    for (const entry of DEFAULT_PROFILES) {
      for (const p of variants(entry.params)) {
        for (const workaround of [false, true]) {
          const result = roundTrip(p, workaround);
          expect(result).toEqual({ ok: true, params: canonical(p), dropped: workaround ? ['preFill'] : [] });
        }
      }
    }
  });

  it('the defaults as they are need no canonical form', () => {
    for (const entry of DEFAULT_PROFILES) expect(roundTrip(entry.params, false)).toMatchObject({ params: entry.params });
  });

  // A fixed sequence of values over every range, so a failure is the same on every run.
  it('400 sets of values across the ranges', () => {
    let seed = 20261020;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const ranges = paramRanges();
    const pick = (field: keyof typeof ranges, step: number, min = ranges[field].min) =>
      Math.round((min + next() * (ranges[field].max - min)) / step) * step;
    const tenth = (value: number) => Math.round(value * 10) / 10;
    for (let run = 0; run < 400; run++) {
      const p: AFlowParams = {
        ...params('default-medium'),
        fillFlow: tenth(pick('fillFlow', 0.1)),
        fillExitPressure: tenth(pick('fillExitPressure', 0.1)),
        fillTemperature: pick('fillTemperature', 1, 80),
        fillTime: pick('fillTime', 1),
        infusePressure: tenth(pick('infusePressure', 0.1)),
        infuseTime: pick('infuseTime', 1),
        infuseWeight: tenth(pick('infuseWeight', 0.1, 0) / 10),
        infuseTemperature: next() < 0.5 ? null : pick('infuseTemperature', 1, 80),
        infuseFlowLimit: tenth(pick('infuseFlowLimit', 0.1)),
        secondFillFlow: tenth(pick('secondFillFlow', 0.1)),
        secondFillExitPressure: tenth(pick('secondFillExitPressure', 0.1)),
        secondFillTemperature: next() < 0.5 ? null : pick('secondFillTemperature', 1, 80),
        secondFillTime: pick('secondFillTime', 1),
        pauseDuration: next() < 0.5 ? 0 : pick('pauseDuration', 1, 1),
        pauseExitFlow: tenth(pick('pauseExitFlow', 0.1)),
        pourPressure: tenth(pick('pourPressure', 0.1)),
        rampTime: next() < 0.2 ? 0 : pick('rampTime', 1),
        rampTemperature: next() < 0.5 ? null : pick('rampTemperature', 1, 80),
        pourFlow: tenth(pick('pourFlow', 0.1)),
        pourEndFlow: next() < 0.5 ? null : tenth(pick('pourEndFlow', 0.1)),
        pourTime: pick('pourTime', 1),
        pourTemperature: pick('pourTemperature', 1, 80),
        stopWeight: pick('stopWeight', 1, 0) % 100,
        pourPressureLimit: next() < 0.5 ? null : tenth(pick('pourPressureLimit', 0.1)),
        flowUp: next() < 0.5,
      };
      expect(validateParams(p)).toEqual([]);
      const result = roundTrip(p, next() < 0.5);
      if (!result.ok) throw new Error(`${result.reason}: ${JSON.stringify(p)}`);
      expect(result.params).toEqual(canonical(p));
      expect(generateSteps(result.params)).toEqual(generateSteps(p));
    }
  });
});

describe('what is not A-Flow, or cannot be read', () => {
  const medium = byTitle(rig14, 'default-medium');

  it('a profile whose step names are not A-Flow’s, in their order', () => {
    // A few of Decaid's files hold a number as a string: the reader only reads numbers.
    for (const profile of bundled.filter((entry) => !entry.title.startsWith('A-Flow'))) {
      expect(readSteps(profile as unknown as StoredProfile)).toMatchObject({ ok: false, aflow: false });
    }
    const swapped = { ...medium, steps: [medium.steps[2], medium.steps[1], ...medium.steps.slice(3)] };
    expect(readSteps(swapped)).toMatchObject({ ok: false, aflow: false });
    const noPour = { ...medium, steps: medium.steps.slice(0, -1) };
    expect(readSteps(noPour)).toMatchObject({ ok: false, aflow: false });
  });

  it('a step changed in another app: a fixed value, a pump, a transition', () => {
    for (const changed of [
      withStep(medium, 'Fill', { limiter: { value: 7, range: 0.6 } }),
      withStep(medium, 'Infuse', { pump: 'flow', flow: 3 }),
      withStep(medium, 'Flow Extraction', { transition: 'fast' }),
      withStep(medium, 'Pressure Up', { limiter: { value: 4, range: 0.6 } }),
      withStep(medium, 'Pre Fill', { flow: 6 }),
    ]) {
      expect(readSteps(changed)).toMatchObject({ ok: false, aflow: true });
    }
    expect(readSteps(withStep(medium, 'Fill', { limiter: { value: 7, range: 0.6 } }))).toEqual({
      ok: false,
      aflow: true,
      reason: '“Fill” is not what A-Flow writes for its values',
    });
  });

  it('a 2nd Fill that lasts while its Pause does not; a missing value; a move-on of another kind', () => {
    const secondFillAlone = withStep(withStep(medium, '2nd Fill', { seconds: 15 }), 'Pause', { seconds: 0 });
    expect(readSteps(secondFillAlone)).toMatchObject({ ok: false, aflow: true });
    expect(readSteps(withStep(medium, 'Infuse', { pressure: null }))).toMatchObject({
      ok: false,
      reason: 'a value of “Infuse” is missing',
    });
    expect(readSteps(withStep(medium, 'Fill', { exit: null }))).toMatchObject({ ok: false, reason: '“Fill” has no move-on pressure' });
  });

  it('ramp down whose ramp up does not move on at twice the pour flow', () => {
    const veryDark = byTitle(rig14, 'default-very-dark');
    const changed = withStep(veryDark, 'Pressure Up', { exit: { type: 'flow', condition: 'over', value: 1.8 } });
    expect(readSteps(changed)).toMatchObject({ ok: false, aflow: true });
  });

  it('a value outside the 3.0 ranges: a ramp of 70 + 70 s', () => {
    const veryDark = byTitle(rig14, 'default-very-dark');
    const long = withStep(withStep(veryDark, 'Pressure Up', { seconds: 70 }), 'Pressure Decline', { seconds: 70 });
    expect(readSteps(long)).toMatchObject({ ok: false, aflow: true, reason: 'rampTime is above 127 s' });
  });

  it('an infuse volume other than 100 ml is dropped and named', () => {
    const result = read(withStep(medium, 'Infuse', { volume: 40 }));
    expect(result.dropped).toEqual(['preFill', 'pause', 'infuseVolume']);
    expect(result.params).toEqual(params('default-medium'));
  });

  it('the 2nd fill of the plugin, both steps 15 s at the pour temperature, is read', () => {
    const on = withStep(withStep(medium, '2nd Fill', { seconds: 15 }), 'Pause', { seconds: 15 });
    const result = read(on);
    expect(result.dropped).toEqual(['preFill']);
    expect(result.params).toMatchObject({ pauseDuration: 15, secondFillTime: 15, secondFillTemperature: 95, secondFillFlow: 8 });
  });
});
