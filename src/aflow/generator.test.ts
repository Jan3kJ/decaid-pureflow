import { describe, expect, it } from 'vitest';
import { DEFAULT_AUTHOR, DEFAULT_NOTES, DEFAULT_PROFILES } from './defaults';
import { generateProfile, generateSteps } from './generator';
import { PLUGIN_STEPS, PLUGIN_STOP_WEIGHT, pluginSecondFill } from './plugin-expected';
import type { AFlowParams } from './types';
import { validateParams } from './validate';

function params(id: string): AFlowParams {
  const found = DEFAULT_PROFILES.find((p) => p.id === id);
  if (!found) throw new Error(`no default profile ${id}`);
  return found.params;
}

const names = (p: AFlowParams, workaround: boolean) =>
  generateSteps(p, workaround).map((s) => s.name);

// Every value that is not an object or an array must be a number or one of the strings.
function leaves(value: unknown): unknown[] {
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(leaves);
  return [value];
}

describe('the five default profiles', () => {
  it('are the plugin\'s five', () => {
    expect(DEFAULT_PROFILES.map((p) => p.id)).toEqual(Object.keys(PLUGIN_STEPS));
  });

  for (const { id, title, params: p } of DEFAULT_PROFILES) {
    describe(id, () => {
      it('has valid parameters', () => {
        expect(validateParams(p)).toEqual([]);
      });

      // Regression, acceptance item 1: the plugin's output with ramp down off and the
      // first-step workaround on.
      it('with the first-step workaround on, equals the plugin\'s steps', () => {
        expect(generateSteps(p, true)).toEqual(PLUGIN_STEPS[id]);
      });

      it('by default, has the same steps without Pre Fill', () => {
        expect(generateSteps(p)).toEqual(PLUGIN_STEPS[id].slice(1));
      });

      it('gives a v2 profile that ends at the plugin\'s stop weight', () => {
        const profile = generateProfile(p, { title, author: DEFAULT_AUTHOR, notes: DEFAULT_NOTES });
        expect({ ...profile, steps: [] }).toEqual({
          version: '2',
          title,
          author: 'Janek',
          notes: 'A-Flow: an alternative profile for D-Flow',
          beverage_type: 'espresso',
          steps: [],
          tank_temperature: 0,
          target_weight: PLUGIN_STOP_WEIGHT[id],
          target_volume: 100,
          target_volume_count_start: 2,
        });
        expect(profile.steps).toEqual(PLUGIN_STEPS[id].slice(1));
      });

      it('holds numbers, not strings', () => {
        const profile = generateProfile({ ...p, secondFill: true }, { title, firstStepWorkaround: true });
        const words = [...profile.steps.map((s) => s.name), 'flow', 'pressure', 'fast', 'smooth', 'coffee', 'over', 'under'];
        const strings = leaves(profile.steps).filter((v) => typeof v === 'string');
        expect(strings.filter((s) => !words.includes(s))).toEqual([]);
        expect(leaves(profile).every((v) => typeof v === 'string' || Number.isFinite(v))).toBe(true);
        expect(JSON.parse(JSON.stringify(profile))).toEqual(profile);
      });
    });
  }
});

describe('toggle combinations', () => {
  const base = params('default-medium');
  const combinations = [false, true].flatMap((secondFill) =>
    [false, true].flatMap((flowUp) =>
      [false, true].map((workaround) => ({ secondFill, flowUp, workaround })),
    ),
  );

  for (const { secondFill, flowUp, workaround } of combinations) {
    const label = `2nd fill ${secondFill ? 'on' : 'off'}, flow ${flowUp ? 'up' : 'down'}, workaround ${workaround ? 'on' : 'off'}`;
    it(label, () => {
      const steps = generateSteps({ ...base, secondFill, flowUp }, workaround);

      expect(steps.map((s) => s.name)).toEqual([
        ...(workaround ? ['Pre Fill'] : []),
        'Fill',
        'Infuse',
        ...(secondFill ? ['2nd Fill', 'Pause'] : []),
        'Pressure Up',
        'Flow Extraction',
      ]);
      // A step that is off is absent, not a zero-length step.
      expect(steps.every((s) => s.seconds > 0)).toBe(true);

      const pouring = steps[steps.length - 1];
      expect(pouring).toMatchObject({ pump: 'flow', flow: flowUp ? 4 : 0, limiter: { value: 10, range: 0.6 } });

      // The other steps do not depend on the toggles: they equal the plugin's.
      const plugin = PLUGIN_STEPS['default-medium'];
      const kept = steps.filter((s) => s.name !== '2nd Fill' && s.name !== 'Pause').slice(0, -1);
      expect(kept).toEqual(plugin.slice(workaround ? 0 : 1, -1));
    });
  }

  it('with ramp time under 1 s adds Flow Start in every combination', () => {
    for (const { secondFill, flowUp, workaround } of combinations) {
      const p = { ...params('default-like-dflow'), secondFill, flowUp };
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

describe('2nd fill', () => {
  // Regression: with the plugin's fixed values (fill flow 8 ml/s, pause 15 s) the two steps
  // equal the plugin's wherever fill and pour temperature are the same.
  for (const id of ['default-light', 'default-medium', 'default-like-dflow']) {
    it(`${id}: with the plugin's fixed values, equals the plugin's steps`, () => {
      const p = { ...params(id), secondFill: true };
      expect(p.fillTemperature).toBe(p.pourTemperature);
      const plugin = PLUGIN_STEPS[id];
      expect(generateSteps(p, true)).toEqual([
        ...plugin.slice(0, 3),
        ...pluginSecondFill(p.pourTemperature),
        ...plugin.slice(3),
      ]);
    });
  }

  // The one place 3.0 leaves the plugin on purpose (spec 3.2, founder 2026-10-11).
  it('default-dark: differs from the plugin only in temperature, fill 93 instead of pour 88', () => {
    const p = { ...params('default-dark'), secondFill: true };
    const added = generateSteps(p, true).slice(3, 5);
    expect(added.map((s) => s.temperature)).toEqual([93, 93]);
    expect(added.map((s) => ({ ...s, temperature: 88 }))).toEqual(pluginSecondFill(88));
  });

  it('uses its own fill flow and pause duration', () => {
    const p = { ...params('default-medium'), secondFill: true, secondFillFlow: 4.5, pauseDuration: 7 };
    const [secondFill, pause] = generateSteps(p).slice(2, 4);
    expect(secondFill).toMatchObject({ name: '2nd Fill', pump: 'flow', flow: 4.5, seconds: 15 });
    expect(pause).toMatchObject({ name: 'Pause', pump: 'pressure', pressure: 1, seconds: 7 });
  });
});

describe('parameters that the plugin fixed or 3.0 changed', () => {
  const base = params('default-medium');

  it('the fill flow sets the Fill step only, not Pre Fill', () => {
    const [preFill, fill] = generateSteps({ ...base, fillFlow: 5 }, true);
    expect(preFill).toMatchObject({ name: 'Pre Fill', flow: 8, seconds: 1 });
    expect(fill).toMatchObject({ name: 'Fill', flow: 5 });
  });

  it('the fill temperature sets Pre Fill, Fill, Infuse, 2nd Fill and Pause', () => {
    const steps = generateSteps({ ...base, secondFill: true, fillTemperature: 90, pourTemperature: 85 }, true);
    expect(steps.map((s) => s.temperature)).toEqual([90, 90, 90, 90, 90, 85, 85]);
  });

  it('never writes a ramp down step', () => {
    expect(names({ ...base, secondFill: true, rampTime: 0 }, true)).not.toContain('Pressure Decline');
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

  it('the dose is not part of the profile', () => {
    const a = generateProfile({ ...base, dose: 14 }, { title: 't' });
    const b = generateProfile({ ...base, dose: 20 }, { title: 't' });
    expect(a).toEqual(b);
  });
});
