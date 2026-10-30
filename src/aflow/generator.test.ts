import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTHOR, DEFAULT_NOTES, DEFAULT_PROFILES, DETAIL_DEFAULTS } from './defaults';
import { generateProfile, generateSteps, hasSecondFill, resolveParams } from './generator';
import { PLUGIN_LIKE_DFLOW_STEPS, PLUGIN_STEPS, PLUGIN_STOP_WEIGHT, pluginSecondFill } from './plugin-expected';
import type { AFlowParams, ProfileStep } from './types';
import { validateParams } from './validate';

function params(id: string): AFlowParams {
  const found = DEFAULT_PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`no default profile ${id}`);
  return found.params;
}

const names = (p: AFlowParams, workaround: boolean) => generateSteps(p, workaround).map((s) => s.name);

// Every value that is not an object or an array must be a number or one of the strings.
function leaves(value: unknown): unknown[] {
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return [value];
}

const PRE_FILL = (temperature: number): ProfileStep => ({
  name: 'Pre Fill',
  pump: 'flow',
  transition: 'fast',
  flow: 8,
  temperature,
  seconds: 1,
  volume: 100,
  weight: 0,
  sensor: 'coffee',
  limiter: { value: 8, range: 0.6 },
});

// Fixtures, written by hand: the steps of each default profile without Pre Fill. light, medium
// and dark are the plugin's own output (plugin-expected.ts). floral and 46mm are not
// regression cases against the plugin: floral is new in 3.0 and has no plugin file, and 46mm
// is the plugin's very-dark with the pour pressure, ramp time and flow direction set
// on the tablet. Their steps are written from the mapping in docs/a-flow-3.0.md.
const EXPECTED_STEPS: Record<string, ProfileStep[]> = {
  // light with infuse pressure 0 bar and the 2nd fill on: 2nd Fill and Pause, 15 s each, at
  // the fill temperature.
  'default-floral': [
    {
      name: 'Fill',
      pump: 'flow',
      transition: 'fast',
      flow: 8,
      temperature: 95,
      seconds: 15,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'pressure', condition: 'over', value: 3 },
      limiter: { value: 8, range: 0.6 },
    },
    {
      name: 'Infuse',
      pump: 'pressure',
      transition: 'fast',
      pressure: 0,
      temperature: 95,
      seconds: 60,
      volume: 100,
      weight: 6,
      sensor: 'coffee',
      limiter: { value: 1, range: 0.6 },
    },
    {
      name: '2nd Fill',
      pump: 'flow',
      transition: 'fast',
      flow: 8,
      temperature: 95,
      seconds: 15,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'pressure', condition: 'over', value: 2.5 },
      limiter: { value: 3, range: 0.6 },
    },
    {
      name: 'Pause',
      pump: 'pressure',
      transition: 'fast',
      pressure: 1,
      temperature: 95,
      seconds: 15,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'flow', condition: 'under', value: 1 },
      limiter: { value: 1, range: 0.6 },
    },
    {
      name: 'Pressure Up',
      pump: 'pressure',
      transition: 'smooth',
      pressure: 9.5,
      temperature: 95,
      seconds: 10,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'flow', condition: 'over', value: 3 },
      limiter: { value: 0, range: 0.6 },
    },
    {
      name: 'Flow Extraction',
      pump: 'flow',
      transition: 'smooth',
      flow: 6,
      temperature: 95,
      seconds: 60,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      limiter: { value: 9.5, range: 0.6 },
    },
  ],
  'default-light': PLUGIN_STEPS['default-light'].slice(1),
  'default-medium': PLUGIN_STEPS['default-medium'].slice(1),
  'default-dark': PLUGIN_STEPS['default-dark'].slice(1),
  // Pour pressure 9 bar, ramp 40 s, flow down (target 0).
  'default-46mm': [
    {
      name: 'Fill',
      pump: 'flow',
      transition: 'fast',
      flow: 8,
      temperature: 93,
      seconds: 15,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'pressure', condition: 'over', value: 3 },
      limiter: { value: 8, range: 0.6 },
    },
    {
      name: 'Infuse',
      pump: 'pressure',
      transition: 'fast',
      pressure: 3,
      temperature: 93,
      seconds: 6,
      volume: 100,
      weight: 2,
      sensor: 'coffee',
      limiter: { value: 1, range: 0.6 },
    },
    {
      name: 'Pressure Up',
      pump: 'pressure',
      transition: 'smooth',
      pressure: 9,
      temperature: 88,
      seconds: 40,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'flow', condition: 'over', value: 1.8 },
      limiter: { value: 0, range: 0.6 },
    },
    {
      name: 'Flow Extraction',
      pump: 'flow',
      transition: 'smooth',
      flow: 0,
      temperature: 88,
      seconds: 60,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      limiter: { value: 9, range: 0.6 },
    },
  ],
};

const EXPECTED_STOP_WEIGHT: Record<string, number> = {
  'default-floral': 48,
  ...PLUGIN_STOP_WEIGHT,
  'default-46mm': 32,
};

describe('the five default profiles', () => {
  it('are floral, light, medium, dark and 46mm, in this order', () => {
    expect(DEFAULT_PROFILES.map((p) => p.id)).toEqual([
      'default-floral',
      'default-light',
      'default-medium',
      'default-dark',
      'default-46mm',
    ]);
    expect(Object.keys(EXPECTED_STEPS)).toEqual(DEFAULT_PROFILES.map((p) => p.id));
  });

  it('have a dose of 16 g and the 2nd fill off, except floral', () => {
    for (const { id, params: p } of DEFAULT_PROFILES) {
      expect(p.dose, id).toBe(16);
      expect(hasSecondFill(p), id).toBe(id === 'default-floral');
    }
  });

  it('floral is light with the 2nd fill on and infuse pressure 0 bar', () => {
    expect(params('default-floral')).toEqual({
      ...params('default-light'),
      pauseDuration: 15,
      infusePressure: 0,
    });
  });

  it('46mm has pour pressure 9 bar, ramp time 40 s and flow down', () => {
    expect(params('default-46mm')).toMatchObject({ pourPressure: 9, rampTime: 40, flowUp: false });
  });

  it("leave every detail value at the plugin's constant or following", () => {
    for (const { id, params: p } of DEFAULT_PROFILES) expect(p, id).toMatchObject(DETAIL_DEFAULTS);
    expect(DETAIL_DEFAULTS).toEqual({
      fillExitPressure: 3,
      fillTime: 15,
      infuseTemperature: null,
      infuseFlowLimit: 1,
      secondFillExitPressure: 2.5,
      secondFillTemperature: null,
      secondFillTime: 15,
      pauseExitFlow: 1,
      rampTemperature: null,
      pourEndFlow: null,
      pourTime: 60,
      pourPressureLimit: null,
    });
  });

  for (const { id, title, params: p } of DEFAULT_PROFILES) {
    describe(id, () => {
      it('has valid parameters', () => {
        expect(validateParams(p)).toEqual([]);
      });

      it('generates its fixture steps', () => {
        expect(generateSteps(p)).toEqual(EXPECTED_STEPS[id]);
      });

      it('with the first-step workaround on, has Pre Fill before them', () => {
        expect(generateSteps(p, true)).toEqual([PRE_FILL(p.fillTemperature), ...EXPECTED_STEPS[id]]);
      });

      it('gives a v2 profile that ends at its stop weight', () => {
        const profile = generateProfile(p, { title, author: DEFAULT_AUTHOR, notes: DEFAULT_NOTES });
        expect({ ...profile, steps: [] }).toEqual({
          version: '2',
          title,
          author: 'Janek',
          notes: 'A-Flow: an alternative profile for D-Flow',
          beverage_type: 'espresso',
          steps: [],
          tank_temperature: 0,
          target_weight: EXPECTED_STOP_WEIGHT[id],
          target_volume: 100,
          target_volume_count_start: 2,
        });
        expect(profile.steps).toEqual(EXPECTED_STEPS[id]);
      });

      it('holds numbers, not strings', () => {
        const profile = generateProfile({ ...p, pauseDuration: 15 }, { title, firstStepWorkaround: true });
        const words = [...profile.steps.map((s) => s.name), 'flow', 'pressure', 'fast', 'smooth', 'coffee', 'over', 'under'];
        const strings = leaves(profile.steps).filter((v) => typeof v === 'string');
        expect(strings.filter((s) => !words.includes(s))).toEqual([]);
        expect(leaves(profile).every((v) => typeof v === 'string' || Number.isFinite(v))).toBe(true);
        expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
      });
    });
  }
});

// Regression: where a 3.0 profile uses the plugin's fixed values, its steps
// equal the plugin's output with ramp down off and the first-step workaround on. The cases
// are the defaults that still equal a plugin file. floral and 46mm are not among them: see
// the comment in plugin-expected.ts.
describe('regression against the plugin', () => {
  for (const id of Object.keys(PLUGIN_STEPS)) {
    it(`${id}: with the first-step workaround on, equals the plugin's steps`, () => {
      expect(generateSteps(params(id), true)).toEqual(PLUGIN_STEPS[id]);
    });

    it(`${id}: ends at the plugin's stop weight`, () => {
      expect(generateProfile(params(id), { title: id }).target_weight).toBe(PLUGIN_STOP_WEIGHT[id]);
    });
  }

  it('covers light, medium and dark', () => {
    expect(Object.keys(PLUGIN_STEPS)).toEqual(['default-light', 'default-medium', 'default-dark']);
  });

  // The plugin's like-dflow file is no longer a default; its values still check Flow Start.
  it("the plugin's like-dflow values (ramp 0 s) give the plugin's steps with Flow Start", () => {
    const p = { ...params('default-medium'), infuseWeight: 4, rampTime: 0, stopWeight: 36 };
    expect(generateSteps(p, true)).toEqual(PLUGIN_LIKE_DFLOW_STEPS);
  });

  // With the plugin's fixed values (fill flow 8 ml/s, 15 s, pause 15 s) the two steps of the
  // 2nd fill equal the plugin's wherever fill and pour temperature are the same.
  for (const id of ['default-light', 'default-medium']) {
    it(`${id} with the 2nd fill on equals the plugin's steps`, () => {
      const p = { ...params(id), pauseDuration: 15 };
      expect(p.fillTemperature).toBe(p.pourTemperature);
      const plugin = PLUGIN_STEPS[id];
      expect(generateSteps(p, true)).toEqual([...plugin.slice(0, 3), ...pluginSecondFill(p.pourTemperature), ...plugin.slice(3)]);
    });
  }

  // The one place 3.0 leaves the plugin on purpose.
  it('default-dark with the 2nd fill on differs only in temperature, fill 93 instead of pour 88', () => {
    const p = { ...params('default-dark'), pauseDuration: 15 };
    const added = generateSteps(p, true).slice(3, 5);
    expect(added.map((s) => s.temperature)).toEqual([93, 93]);
    expect(added.map((s) => ({ ...s, temperature: 88 }))).toEqual(pluginSecondFill(88));
  });
});

describe('toggle combinations', () => {
  const combinations = [false, true].flatMap((secondFill) =>
    [false, true].flatMap((flowUp) => [false, true].map((workaround) => ({ secondFill, flowUp, workaround }))),
  );
  const withToggles = (p: AFlowParams, secondFill: boolean, flowUp: boolean): AFlowParams => ({
    ...p,
    pauseDuration: secondFill ? 15 : 0,
    flowUp,
  });

  for (const { secondFill, flowUp, workaround } of combinations) {
    const label = `2nd fill ${secondFill ? 'on' : 'off'}, flow ${flowUp ? 'up' : 'down'}, workaround ${workaround ? 'on' : 'off'}`;
    it(label, () => {
      const steps = generateSteps(withToggles(params('default-medium'), secondFill, flowUp), workaround);

      // The whole list, by hand: the plugin's medium, its 2nd fill, and the pour's target.
      const plugin = PLUGIN_STEPS['default-medium'];
      expect(steps).toEqual([
        ...(workaround ? [plugin[0]] : []),
        plugin[1],
        plugin[2],
        ...(secondFill ? pluginSecondFill(93) : []),
        plugin[3],
        { ...plugin[4], flow: flowUp ? 4 : 0 },
      ]);
      // A step that is off is absent, not a zero-length step.
      expect(steps.every((s) => s.seconds > 0)).toBe(true);
    });
  }

  it('gives every default the same step names in every combination', () => {
    for (const { params: p } of DEFAULT_PROFILES) {
      for (const { secondFill, flowUp, workaround } of combinations) {
        expect(names(withToggles(p, secondFill, flowUp), workaround)).toEqual([
          ...(workaround ? ['Pre Fill'] : []),
          'Fill',
          'Infuse',
          ...(secondFill ? ['2nd Fill', 'Pause'] : []),
          'Pressure Up',
          'Flow Extraction',
        ]);
      }
    }
  });

  it('with ramp time under 1 s adds Flow Start in every combination', () => {
    for (const { secondFill, flowUp, workaround } of combinations) {
      const p = { ...withToggles(params('default-medium'), secondFill, flowUp), rampTime: 0 };
      expect(names(p, workaround)).toEqual([
        ...(workaround ? ['Pre Fill'] : []),
        'Fill',
        'Infuse',
        ...(secondFill ? ['2nd Fill', 'Pause'] : []),
        'Pressure Up',
        'Flow Start',
        'Flow Extraction',
      ]);
    }
  });
});

describe('the pause switches the 2nd fill', () => {
  const base = params('default-medium');

  it('a pause of 0 s is off: neither 2nd Fill nor Pause, whatever the other 2nd fill values', () => {
    const p = { ...base, pauseDuration: 0, secondFillFlow: 4, secondFillTime: 20, secondFillTemperature: 90 };
    expect(hasSecondFill(p)).toBe(false);
    expect(generateSteps(p)).toEqual(generateSteps(base));
  });

  it('any pause over 0 s is on', () => {
    const p = { ...base, pauseDuration: 0.5 };
    expect(hasSecondFill(p)).toBe(true);
    expect(names(p, false)).toEqual(['Fill', 'Infuse', '2nd Fill', 'Pause', 'Pressure Up', 'Flow Extraction']);
  });
});

// Each parameter moves exactly the step fields it should. The base has every step: Pre Fill,
// the 2nd fill, and Flow Start (ramp 0 s).
describe('what each parameter moves', () => {
  const base: AFlowParams = { ...params('default-dark'), pauseDuration: 15, rampTime: 0 };
  const baseSteps = generateSteps(base, true);

  function paths(value: unknown, prefix: string): [string, unknown][] {
    if (value !== null && typeof value === 'object') {
      return Object.entries(value).flatMap(([k, v]) => paths(v, `${prefix}.${k}`));
    }
    return [[prefix, value]];
  }
  const flat = (steps: ProfileStep[]) => new Map(steps.flatMap((s) => paths({ ...s, name: undefined }, s.name)));

  /** The step fields that differ from the base, with their new values. */
  function moved(change: Partial<AFlowParams>): Record<string, unknown> {
    const steps = generateSteps({ ...base, ...change }, true);
    expect(steps.map((s) => s.name)).toEqual(baseSteps.map((s) => s.name));
    const before = flat(baseSteps);
    return Object.fromEntries([...flat(steps)].filter(([path, value]) => before.get(path) !== value));
  }

  it('the base has all eight steps, at 93 °C up to the pause and 88 °C from the ramp', () => {
    expect(baseSteps.map((s) => `${s.name} ${s.temperature}`)).toEqual([
      'Pre Fill 93',
      'Fill 93',
      'Infuse 93',
      '2nd Fill 93',
      'Pause 93',
      'Pressure Up 88',
      'Flow Start 88',
      'Flow Extraction 88',
    ]);
  });

  const cases: [string, Partial<AFlowParams>, Record<string, unknown>][] = [
    // fill
    ['fill flow', { fillFlow: 5 }, { 'Fill.flow': 5 }],
    ['fill move-on pressure', { fillExitPressure: 1.5 }, { 'Fill.exit.value': 1.5 }],
    ['fill time', { fillTime: 7 }, { 'Fill.seconds': 7 }],
    [
      'fill temperature, with infuse and 2nd fill following',
      { fillTemperature: 90 },
      {
        'Pre Fill.temperature': 90,
        'Fill.temperature': 90,
        'Infuse.temperature': 90,
        '2nd Fill.temperature': 90,
        'Pause.temperature': 90,
      },
    ],
    [
      'fill temperature, with the infuse temperature set',
      { fillTemperature: 90, infuseTemperature: 93 },
      {
        'Pre Fill.temperature': 90,
        'Fill.temperature': 90,
      },
    ],
    // infuse
    ['infuse pressure', { infusePressure: 1.2 }, { 'Infuse.pressure': 1.2 }],
    ['infuse time', { infuseTime: 25 }, { 'Infuse.seconds': 25 }],
    ['infuse move-on weight', { infuseWeight: 5.5 }, { 'Infuse.weight': 5.5 }],
    [
      'infuse temperature, with the 2nd fill following',
      { infuseTemperature: 91 },
      {
        'Infuse.temperature': 91,
        '2nd Fill.temperature': 91,
        'Pause.temperature': 91,
      },
    ],
    [
      'infuse temperature, with the 2nd fill temperature set',
      { infuseTemperature: 91, secondFillTemperature: 93 },
      {
        'Infuse.temperature': 91,
      },
    ],
    ['infuse flow limit', { infuseFlowLimit: 2.5 }, { 'Infuse.limiter.value': 2.5 }],
    // 2nd fill
    ['2nd fill flow', { secondFillFlow: 4.5 }, { '2nd Fill.flow': 4.5 }],
    ['2nd fill move-on pressure', { secondFillExitPressure: 1.8 }, { '2nd Fill.exit.value': 1.8 }],
    [
      '2nd fill temperature',
      { secondFillTemperature: 89 },
      {
        '2nd Fill.temperature': 89,
        'Pause.temperature': 89,
      },
    ],
    ['2nd fill time', { secondFillTime: 6 }, { '2nd Fill.seconds': 6 }],
    ['pause time', { pauseDuration: 7 }, { 'Pause.seconds': 7 }],
    // The pause ends at a flow under this value
    ['pause ends at flow under', { pauseExitFlow: 0.4 }, { 'Pause.exit.value': 0.4 }],
    // pressurize
    [
      'pressurize target, with the max pressure following',
      { pourPressure: 8 },
      {
        'Pressure Up.pressure': 8,
        'Flow Extraction.limiter.value': 8,
      },
    ],
    [
      'pressurize target, with the max pressure set',
      { pourPressure: 8, pourPressureLimit: 9 },
      {
        'Pressure Up.pressure': 8,
      },
    ],
    ['pressurize time', { rampTime: 0.5 }, { 'Pressure Up.seconds': 0.5 }],
    ['pressurize temperature', { rampTemperature: 90 }, { 'Pressure Up.temperature': 90 }],
    // flow
    [
      'start flow, flow down',
      { pourFlow: 2.5 },
      {
        'Pressure Up.exit.value': 2.5,
        'Flow Start.flow': 2.5,
        'Flow Start.exit.value': 2.4,
      },
    ],
    [
      'start flow, flow up',
      { pourFlow: 2.5, flowUp: true },
      {
        'Pressure Up.exit.value': 2.5,
        'Flow Start.flow': 2.5,
        'Flow Start.exit.value': 2.4,
        'Flow Extraction.flow': 5,
      },
    ],
    ['flow up', { flowUp: true }, { 'Flow Extraction.flow': 4 }],
    ['flow gradient', { pourEndFlow: 1.5 }, { 'Flow Extraction.flow': 1.5 }],
    ['flow time', { pourTime: 45 }, { 'Flow Extraction.seconds': 45 }],
    [
      'flow temperature, with pressurize following',
      { pourTemperature: 90 },
      {
        'Pressure Up.temperature': 90,
        'Flow Start.temperature': 90,
        'Flow Extraction.temperature': 90,
      },
    ],
    [
      'flow temperature, with the pressurize temperature set',
      { pourTemperature: 90, rampTemperature: 88 },
      {
        'Flow Start.temperature': 90,
        'Flow Extraction.temperature': 90,
      },
    ],
    ['max pressure', { pourPressureLimit: 7.5 }, { 'Flow Extraction.limiter.value': 7.5 }],
    // not in the steps
    ['stop at weight', { stopWeight: 40 }, {}],
    ['dose', { dose: 20 }, {}],
  ];

  for (const [label, change, expected] of cases) {
    it(label, () => {
      expect(moved(change)).toEqual(expected);
    });
  }

  it('the cases name every parameter', () => {
    const named = new Set(cases.flatMap(([, change]) => Object.keys(change)));
    expect([...named].sort()).toEqual(Object.keys(base).sort());
  });

  it("stop at weight is the profile's target weight and nothing else", () => {
    const a = generateProfile(base, { title: 't' });
    const b = generateProfile({ ...base, stopWeight: 40 }, { title: 't' });
    expect(b).toEqual({ ...a, target_weight: 40 });
  });

  it('the dose is not part of the profile', () => {
    const a = generateProfile({ ...base, dose: 14 }, { title: 't' });
    const b = generateProfile({ ...base, dose: 20 }, { title: 't' });
    expect(a).toEqual(b);
  });
});

describe('values that follow another one', () => {
  const base: AFlowParams = { ...params('default-dark'), pauseDuration: 15 };

  it('resolveParams fills in every null and changes nothing else', () => {
    expect(resolveParams(base)).toEqual({
      ...base,
      infuseTemperature: 93,
      secondFillTemperature: 93,
      rampTemperature: 88,
      pourEndFlow: 0,
      pourPressureLimit: 9,
    });
    const set = {
      ...base,
      infuseTemperature: 90,
      secondFillTemperature: 91,
      rampTemperature: 92,
      pourEndFlow: 3,
      pourPressureLimit: 6,
    };
    expect(resolveParams(set)).toEqual(set);
  });

  it('the 2nd fill follows the infuse temperature, not the fill temperature', () => {
    expect(resolveParams({ ...base, infuseTemperature: 90 }).secondFillTemperature).toBe(90);
  });

  it('a value set to what it would follow gives the same steps', () => {
    const explicit = { ...base, infuseTemperature: 93, secondFillTemperature: 93, rampTemperature: 88, pourPressureLimit: 9 };
    expect(generateSteps(explicit, true)).toEqual(generateSteps(base, true));
  });

  // The toggle's two states as a gradient: end flow 2 x start flow, and 0.
  it('flow up equals an end flow of 2 x the start flow, flow down an end flow of 0', () => {
    for (const { params: p } of DEFAULT_PROFILES) {
      const up = { ...p, flowUp: true };
      const down = { ...p, flowUp: false };
      expect(generateSteps({ ...p, pourEndFlow: resolveParams(up).pourEndFlow })).toEqual(generateSteps(up));
      expect(resolveParams(up).pourEndFlow).toBeCloseTo(2 * p.pourFlow, 9);
      expect(generateSteps({ ...p, pourEndFlow: 0 })).toEqual(generateSteps(down));
    }
  });

  it('with an end flow set, the toggle does nothing', () => {
    const p = { ...base, pourEndFlow: 1.5 };
    expect(generateSteps({ ...p, flowUp: true })).toEqual(generateSteps({ ...p, flowUp: false }));
  });
});

describe('what 3.0 keeps from the plugin', () => {
  const base = params('default-medium');

  it('the fill flow sets the Fill step only, not Pre Fill', () => {
    const [preFill, fill] = generateSteps({ ...base, fillFlow: 5 }, true);
    expect(preFill).toMatchObject({ name: 'Pre Fill', flow: 8, seconds: 1 });
    expect(fill).toMatchObject({ name: 'Fill', flow: 5 });
  });

  it('never writes a ramp down step', () => {
    expect(names({ ...base, pauseDuration: 15, rampTime: 0 }, true)).not.toContain('Pressure Decline');
  });

  it('Flow Start is there for a ramp under 1 s and gone from 1 s on', () => {
    expect(names({ ...base, rampTime: 0.9 }, false)).toContain('Flow Start');
    expect(names({ ...base, rampTime: 1 }, false)).not.toContain('Flow Start');
  });

  it('rounds the derived flows to one decimal, as the plugin does', () => {
    const steps = generateSteps({ ...base, pourFlow: 0.3, rampTime: 0 });
    expect(steps.map((s) => s.name)).toEqual(['Fill', 'Infuse', 'Pressure Up', 'Flow Start', 'Flow Extraction']);
    expect(steps[2].exit).toEqual({ type: 'flow', condition: 'over', value: 0.3 });
    expect(steps[3]).toMatchObject({ flow: 0.3, exit: { type: 'flow', condition: 'over', value: 0.2 } });
    expect(steps[4]).toMatchObject({ flow: 0.6 });
  });

  it("the Pause step keeps the plugin's 1 bar, and its exit at flow under 1 ml/s by default", () => {
    const pause = generateSteps({ ...base, pauseDuration: 9 })[3];
    expect(pause).toMatchObject({
      name: 'Pause',
      pressure: 1,
      exit: { type: 'flow', condition: 'under', value: 1 },
      limiter: { value: 1, range: 0.6 },
    });
  });

  // The pause ends at a flow under an editable value.
  it("the pause's exit flow moves exactly the Pause step's exit, with and without the Pre Fill step", () => {
    for (const workaround of [false, true]) {
      const on = { ...base, pauseDuration: 9 };
      const before = generateSteps(on, workaround);
      const after = generateSteps({ ...on, pauseExitFlow: 2.3 }, workaround);
      const pause = before.findIndex((s) => s.name === 'Pause');
      expect(after[pause].exit).toEqual({ type: 'flow', condition: 'under', value: 2.3 });
      expect(after.map((s, i) => (i === pause ? { ...s, exit: before[pause].exit } : s))).toEqual(before);
    }
  });

  it("the pause's exit flow changes nothing in a profile without a 2nd fill", () => {
    for (const { id, params: p } of DEFAULT_PROFILES) {
      const off = { ...p, pauseDuration: 0 };
      expect(generateSteps({ ...off, pauseExitFlow: 0.3 }), id).toEqual(generateSteps(off));
    }
  });
});
