// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// test/profile-editor.test.mjs (the `buildStepScript` wording).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
import { describe, expect, it } from 'vitest';
import type { Profile, ProfileStep } from '../api';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import { parseScript, scriptNumber, writeScript, type ScriptResult } from './script';

const profiles = bundled as unknown as Profile[];
const byTitle = (title: string) => structuredClone(profiles.find((p) => p.title === title)!);

// research.md 17.8, worked example 1, exactly.
const TRENDY = `1: preinfusion temp boost
- Set coffee temperature to 92.0 °C
- Flow quickly at a rate of 8.0 mL/s
- For a maximum of 2.0 sec
- Move on if pressure is over 4.0 bar
2: preinfusion
- Maintain coffee temperature at 92.0 °C
- Flow quickly at a rate of 8.0 mL/s
- For a maximum of 18.0 sec
- Move on if pressure is over 4.0 bar
3: forced rise without limit
- Start tracking water volume
- Maintain coffee temperature at 92.0 °C
- Pressure quickly to 6.0 bar
- For a maximum of 3.0 sec
4: rise and hold
- Maintain coffee temperature at 92.0 °C
- Pressure quickly to 6.0 bar
- For a maximum of 32.0 sec`;

// research.md 17.8, worked example 2, exactly.
const BLOOMING = `1: preinfusion start
- Set coffee temperature to 97.5 °C
- Flow quickly at a rate of 4.0 mL/s
- For a maximum of 2.0 sec or 500.0 ml
2: preinfusion
- Maintain coffee temperature at 97.5 °C
- Flow quickly at a rate of 4.0 mL/s
- For a maximum of 23.0 sec or 500.0 ml
- Move on if pressure is over 4.0 bar
3: pause
- Start tracking water volume
- Decrease coffee temperature to 90.0 °C
- Flow quickly at a rate of 0.0 mL/s
- For a maximum of 30.0 sec or 500.0 ml
4: ramp
- Increase coffee temperature to 92.0 °C
- Flow slowly at a rate of 2.2 mL/s
- For a maximum of 5.0 sec or 500.0 ml
5: flat flow
- Maintain coffee temperature at 92.0 °C
- Flow quickly at a rate of 2.2 mL/s
- Limit to 8.6 bar
- For a maximum of 20.0 sec or 500.0 ml
6: reset temperature
- Increase coffee temperature to 98.0 °C
- Flow quickly at a rate of 0.0 mL/s
- For a maximum of 1.0 sec or 500.0 ml`;

/** A profile with no steps: what the parser makes comes from the text alone. */
const blank = (of: Profile): Profile => ({ ...of, steps: [] });

function parsed(result: ScriptResult): Profile {
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.profile;
}

function errorsOf(text: string, profile: Profile = byTitle('Trendy 6 bar low pressure shot')): string[] {
  const result = parseScript(text, profile);
  if (result.ok) throw new Error('the text parsed');
  return result.errors;
}

/** The Trendy text with one line replaced (1-based). */
const trendyWith = (line: number, text: string) =>
  TRENDY.split('\n')
    .map((old, i) => (i + 1 === line ? text : old))
    .join('\n');

describe('writeScript', () => {
  it('writes the worked examples of research.md 17.8 word for word', () => {
    expect(writeScript(byTitle('Trendy 6 bar low pressure shot'))).toBe(TRENDY);
    expect(writeScript(byTitle('Blooming Espresso'))).toBe(BLOOMING);
  });

  it('writes a number with one decimal, two where it has a second, without float noise', () => {
    expect(scriptNumber(93)).toBe('93.0');
    expect(scriptNumber(0.75)).toBe('0.75');
    expect(scriptNumber(9.999999999999993)).toBe('10.0');
    expect(scriptNumber(-4e-16)).toBe('0.0');
    expect(scriptNumber('8.6')).toBe('8.6');
  });

  it('writes the sensor, the slow pump, a limit of a pressure step, every maximum and an exit under', () => {
    const step: ProfileStep = {
      name: 'hold',
      pump: 'pressure',
      transition: 'smooth',
      pressure: 6,
      temperature: 90,
      sensor: 'water',
      seconds: 10,
      volume: 100,
      weight: 36,
      limiter: { value: 3.5, range: 0.6 },
      exit: { type: 'flow', condition: 'under', value: 1.2 },
    };
    expect(writeScript({ title: 't', steps: [step], tank_temperature: 0, target_volume_count_start: 0 })).toBe(
      [
        '1: hold',
        '- Set water temperature to 90.0 °C',
        '- Pressure slowly to 6.0 bar',
        '- Limit to 3.5 mL/s',
        '- For a maximum of 36.0 g or 10.0 sec or 100.0 ml',
        '- Move on if flow is under 1.2 mL/s',
      ].join('\n'),
    );
  });
});

describe('parseScript', () => {
  it('reads worked example 1 into its steps and the start of the volume count', () => {
    const profile = parsed(parseScript(TRENDY, blank(byTitle('Trendy 6 bar low pressure shot'))));
    expect(profile.steps[0]).toEqual({
      name: 'preinfusion temp boost',
      temperature: 92,
      sensor: 'coffee',
      pump: 'flow',
      transition: 'fast',
      flow: 8,
      limiter: null,
      seconds: 2,
      volume: 0,
      weight: 0,
      exit: { type: 'pressure', condition: 'over', value: 4 },
    });
    expect(profile.steps).toHaveLength(4);
    expect(profile.steps[3]).toMatchObject({ pump: 'pressure', pressure: 6, seconds: 32, exit: null });
    expect(profile.target_volume_count_start).toBe(2);
  });

  it('reads worked example 2: a ramp, a limit with the profile range, the bloom at 0', () => {
    const source = byTitle('Blooming Espresso');
    const profile = parsed(parseScript(BLOOMING, blank(source)));
    expect(profile.steps[0].limiter).toBeNull();
    expect(profile.steps[3]).toMatchObject({ transition: 'smooth', flow: 2.2 });
    expect(profile.steps[4].limiter).toEqual({ value: 8.6, range: 0.6 });
    expect(profile.steps[2]).toMatchObject({ flow: 0, temperature: 90, seconds: 30, volume: 500 });
    expect(profile.target_volume_count_start).toBe(2);
    // On the profile itself, every step comes back as it is, the unused pump's value too.
    expect(parsed(parseScript(BLOOMING, source))).toEqual(source);
  });

  it('gives every one of the 73 bundled profiles back without loss', () => {
    for (const profile of profiles) {
      const result = parseScript(writeScript(profile), profile);
      expect(result.ok, profile.title).toBe(true);
      expect(parsed(result), profile.title).toEqual(profile);
    }
  });

  it('reads the text alone the same as the profile says it', () => {
    for (const profile of profiles) {
      const fresh = parsed(parseScript(writeScript(profile), blank(profile)));
      expect(writeScript(fresh), profile.title).toBe(writeScript(profile));
    }
  });

  it('changes only the value a line changed, and leaves the input as it was', () => {
    const source = byTitle('Trendy 6 bar low pressure shot');
    const before = structuredClone(source);
    const profile = parsed(parseScript(trendyWith(18, '- Pressure quickly to 6.5 bar'), source));
    expect(profile.steps[3]).toEqual({ ...source.steps[3], pressure: 6.5 });
    expect(profile.steps.slice(0, 3)).toEqual(source.steps.slice(0, 3));
    expect(profile.steps[0]).toBe(source.steps[0]);
    expect(source).toEqual(before);
  });

  it('keeps fields the text does not hold: the limiter range, unknown fields, the other pump', () => {
    const source: Profile = {
      title: 'odd',
      tank_temperature: 0,
      target_volume_count_start: 0,
      extra: 'kept',
      steps: [
        {
          name: 'a',
          pump: 'flow',
          transition: 'fast',
          flow: 2,
          pressure: 3,
          temperature: 90,
          sensor: 'coffee',
          seconds: 10,
          volume: 0,
          weight: null,
          limiter: { value: 4, range: 1.5 },
          exit: null,
          legacy: 1,
        } as ProfileStep,
      ],
    } as Profile;
    const text = writeScript(source).replace('Limit to 4.0 bar', 'Limit to 5.0 bar');
    const profile = parsed(parseScript(text, source));
    expect(profile.steps[0]).toEqual({ ...source.steps[0], limiter: { value: 5, range: 1.5 } });
    expect((profile as unknown as { extra: string }).extra).toBe('kept');
  });

  it('a limit that is new takes the range of the profile’s first live limiter of that pump', () => {
    const source = byTitle('Blooming Espresso');
    const text = writeScript(source).replace(
      '2: preinfusion\n- Maintain coffee temperature at 97.5 °C\n- Flow quickly at a rate of 4.0 mL/s',
      '2: preinfusion\n- Maintain coffee temperature at 97.5 °C\n- Flow quickly at a rate of 4.0 mL/s\n- Limit to 3.0 bar',
    );
    expect(parsed(parseScript(text, source)).steps[1].limiter).toEqual({ value: 3, range: 0.6 });
  });

  it('takes the order of the text: a moved or deleted step keeps its own fields', () => {
    const source = byTitle('Blooming Espresso');
    const blocks = writeScript(source).split(/\n(?=\d+:)/);
    // Step 6 first, step 1 gone; the marker stays on "pause", now step 2.
    const text = [blocks[5], blocks[1], blocks[2], blocks[3], blocks[4]].join('\n').replace('Increase coffee', 'Set coffee');
    const profile = parsed(parseScript(text, source));
    expect(profile.steps).toEqual([source.steps[5], source.steps[1], source.steps[2], source.steps[3], source.steps[4]]);
    expect(profile.target_volume_count_start).toBe(2);
  });

  it('reads loosely: any case, more spaces, blank lines, no bullet or •, ml/s, s, the header number is not read', () => {
    const loose = `7:  preinfusion temp boost

SET   COFFEE temperature TO 92 °C
•  flow quickly at a rate of 8 ml/s
for a maximum of 2 s
- MOVE on if Pressure is over 4 bar
3: preinfusion
- Maintain coffee temperature at 92.0 °C
- Flow quickly at a rate of 8.0 mL/s
- For a maximum of 18.0 sec
- Move on if pressure is over 4.0 bar
1: forced rise without limit
- Start tracking water volume
- Maintain coffee temperature at 92.0 °C
- Pressure quickly to 6.0 bar
- For a maximum of 3.0 sec
1: rise and hold
- Maintain coffee temperature at 92.0 °C
- Pressure quickly to 6.0 bar
- For a maximum of 32.0 sec`;
    const source = byTitle('Trendy 6 bar low pressure shot');
    expect(parsed(parseScript(loose, source))).toEqual(source);
  });

  it('the verb is not read: the temperature is absolute', () => {
    const source = byTitle('Trendy 6 bar low pressure shot');
    expect(parsed(parseScript(trendyWith(7, '- Increase coffee temperature to 92.0 °C'), source))).toEqual(source);
  });

  it('a step without a marker sets the volume count to none; a step left out of the maximum is 0', () => {
    const source = byTitle('Trendy 6 bar low pressure shot');
    const profile = parsed(parseScript(trendyWith(12, ''), source));
    expect(profile.target_volume_count_start).toBe(0);
    const longer = parsed(parseScript(trendyWith(4, '- For a maximum of 30.0 g'), source));
    expect(longer.steps[0]).toMatchObject({ weight: 30, seconds: 0, volume: 0 });
    const endless = parsed(parseScript(trendyWith(4, ''), source));
    expect(endless.steps[0]).toMatchObject({ seconds: 0 });
    const free = parsed(parseScript(trendyWith(5, ''), source));
    expect(free.steps[0].exit).toBeNull();
  });

  it('a flow step can become a pressure step', () => {
    const source = byTitle('Trendy 6 bar low pressure shot');
    const profile = parsed(parseScript(trendyWith(3, '- Pressure slowly to 3.0 bar'), source));
    expect(profile.steps[0]).toMatchObject({ pump: 'pressure', transition: 'smooth', pressure: 3, flow: 8 });
  });
});

describe('parseScript errors, with their line', () => {
  it('an empty text has no step', () => {
    expect(errorsOf('')).toEqual(['the script has no step']);
    expect(errorsOf('\n  \n')).toEqual(['the script has no step']);
  });

  it('a sentence before the first step', () => {
    expect(errorsOf(`- Set coffee temperature to 92.0 °C\n${TRENDY}`)).toEqual([`line 1: a step starts with 'number: name'`]);
  });

  it('a sentence it does not understand', () => {
    expect(errorsOf(trendyWith(3, '- Flow fast at 4 mL/s'))).toEqual([
      `line 3: not understood: '- Flow fast at 4 mL/s'`,
      'step 1 has no pump sentence',
    ]);
    expect(errorsOf(trendyWith(4, '- For a maximum of 2.0 min'))).toEqual([
      `line 4: not understood: '2.0 min' (an amount is a number with g, sec or ml)`,
    ]);
  });

  it('a value out of its range', () => {
    expect(errorsOf(trendyWith(18, '- Pressure quickly to 13.0 bar'))).toEqual(['line 18: pressure is 0 to 12 bar']);
    expect(errorsOf(trendyWith(3, '- Flow quickly at a rate of 16 mL/s'))).toEqual(['line 3: flow is 0 to 15 mL/s']);
    expect(errorsOf(trendyWith(2, '- Set coffee temperature to 110 °C'))).toEqual(['line 2: temperature is 0 to 105 °C']);
    expect(errorsOf(trendyWith(4, '- For a maximum of 128 sec'))).toEqual(['line 4: time is 0 to 127 sec']);
    expect(errorsOf(trendyWith(4, '- For a maximum of 600 ml'))).toEqual(['line 4: volume is 0 to 500 ml']);
    expect(errorsOf(trendyWith(4, '- For a maximum of 501 g'))).toEqual(['line 4: weight is 0 to 500 g']);
    expect(errorsOf(trendyWith(5, '- Move on if flow is over 9 mL/s'))).toEqual(['line 5: an exit on flow is 0 to 8 mL/s']);
    expect(errorsOf(trendyWith(5, '- Limit to 13 bar'))).toEqual(['line 5: a pressure limit is 0 to 12 bar']);
    expect(errorsOf(trendyWith(3, '- Flow quickly at a rate of -1 mL/s'))).toEqual(['line 3: flow is 0 to 15 mL/s']);
  });

  it('a value out of range that the profile’s step already has is kept, as on a card', () => {
    const source = byTitle('Trendy 6 bar low pressure shot');
    source.steps[0].flow = 16;
    const text = writeScript(source);
    expect(text).toContain('at a rate of 16.0 mL/s');
    expect(parsed(parseScript(text, source))).toEqual(source);
    expect(errorsOf(text.replace('16.0', '17.0'), source)).toEqual(['line 3: flow is 0 to 15 mL/s']);
  });

  it('units that do not follow the pump', () => {
    expect(errorsOf(trendyWith(3, '- Flow quickly at a rate of 8.0 bar'))).toEqual(['line 3: a flow target is in mL/s']);
    expect(errorsOf(trendyWith(5, '- Limit to 3 mL/s'))).toEqual(['line 5: a flow step is limited in bar']);
    expect(errorsOf(trendyWith(5, '- Move on if pressure is over 4.0 mL/s'))).toEqual(['line 5: an exit on pressure is in bar']);
  });

  it('a missing or a second sentence', () => {
    expect(errorsOf(trendyWith(3, ''))).toEqual(['step 1 has no pump sentence']);
    expect(errorsOf(trendyWith(7, ''))).toEqual(['step 2 has no temperature sentence']);
    expect(errorsOf(trendyWith(4, '- Flow quickly at a rate of 8.0 mL/s'))).toEqual(['line 4: step 1 has a second pump sentence']);
    expect(errorsOf(trendyWith(4, '- For a maximum of 2 sec or 3 sec'))).toEqual(['line 4: a maximum names the seconds once']);
  });

  it('the volume marker on step 1 or twice', () => {
    expect(errorsOf(trendyWith(5, '- Start tracking water volume'))).toEqual([
      'line 5: tracking the water volume cannot start on step 1',
    ]);
    expect(errorsOf(trendyWith(10, '- Start tracking water volume'))).toEqual([
      'line 12: the water volume is tracked from one step only',
    ]);
  });

  it('lists every error at once', () => {
    const text = trendyWith(18, '- Pressure quickly to 13.0 bar').replace('- Set coffee', '- Heat coffee');
    expect(errorsOf(text)).toEqual([`line 2: not understood: '- Heat coffee temperature to 92.0 °C'`, 'step 1 has no temperature sentence', 'line 18: pressure is 0 to 12 bar']);
  });
});
