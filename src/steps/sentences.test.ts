// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// test/profile-editor.test.mjs (buildStepScript wording).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
import { describe, expect, it } from 'vitest';
import type { Profile } from '../api';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import { cycleExit, cyclePump, cycleSensor, limitOf, setValue, switchLimiterOn, type StepValue } from './model';
import { scriptNumber, stepSentences, temperatureVerb, type Part } from './sentences';

const profiles = bundled as unknown as Profile[];
const BLOOMING = profiles.find((entry) => entry.title === 'Blooming Espresso')!;

/** A sentence as it reads, chips in [brackets], values in {braces}, muted values and lines in ~tildes~. */
const read = (parts: Part[]) =>
  parts
    .map((part) =>
      part.kind === 'text' ? part.text : part.kind === 'chip' ? `[${part.text}]` : part.off ? `{~${part.text}~}` : `{${part.text}}`,
    )
    .join(' ');
const script = (profile: Profile, index: number) =>
  stepSentences(profile, index).map((sentence) => (sentence.off ? `~${read(sentence.parts)}~` : read(sentence.parts)));
const chipOf = (profile: Profile, index: number, chip: string) =>
  stepSentences(profile, index)
    .flatMap((sentence) => sentence.parts)
    .find((part) => part.kind === 'chip' && part.chip === chip)?.text;

describe('the sentences', () => {
  it("read Streamline's words in its order, the off values muted in their place", () => {
    expect(script(BLOOMING, 0)).toEqual([
      'Set [Coffee] temperature to {97.5 °C}',
      '[Flow quickly] at a rate of {4.0 mL/s}',
      '~No limit [switch on]~',
      'For a maximum of {~weight off~} or {2.0 sec} or {500.0 ml}',
      '~Move on: [off]~',
    ]);
    expect(script(BLOOMING, 1)).toEqual([
      'Maintain [Coffee] temperature at {97.5 °C}',
      '[Flow quickly] at a rate of {4.0 mL/s}',
      '~No limit [switch on]~',
      'For a maximum of {~weight off~} or {23.0 sec} or {500.0 ml}',
      'Move on if [Pressure is over] {4.0 bar}',
    ]);
    expect(script(BLOOMING, 2)[0]).toBe('Start tracking water volume');
    expect(script(BLOOMING, 2)[1]).toBe('Decrease [Coffee] temperature to {90.0 °C}');
    expect(script(BLOOMING, 3)[1]).toBe('[Flow slowly] at a rate of {2.2 mL/s}');
    expect(script(BLOOMING, 4)).toContain('Limit to {8.6 bar}');
  });

  it('a pressure step reads in bar, its limit in mL/s, a weight maximum first', () => {
    const profile: Profile = {
      ...BLOOMING,
      steps: [{ ...BLOOMING.steps[0], pump: 'pressure', pressure: 9, weight: 36, limiter: { value: 0.75, range: 0.2 } }],
    };
    expect(script(profile, 0)).toEqual([
      'Set [Coffee] temperature to {97.5 °C}',
      '[Pressure quickly] to {9.0 bar}',
      'Limit to {0.75 mL/s}',
      'For a maximum of {36.0 g} or {2.0 sec} or {500.0 ml}',
      '~Move on: [off]~',
    ]);
  });

  it('a step with nothing but its target reads its limit, maximum and exit as off', () => {
    const bare: Profile = { ...BLOOMING, steps: [{ ...BLOOMING.steps[0], seconds: 0, volume: 0 }] };
    expect(script(bare, 0).slice(2)).toEqual([
      '~No limit [switch on]~',
      '~No maximum {~weight off~} or {~time off~} or {~volume off~}~',
      '~Move on: [off]~',
    ]);
  });

  it('the verb follows the step before', () => {
    expect(temperatureVerb(null, 93)).toBe('Set');
    expect(temperatureVerb(93, 94)).toBe('Increase');
    expect(temperatureVerb(93, 92)).toBe('Decrease');
    expect(temperatureVerb(93, 93)).toBe('Maintain');
  });

  it('numbers have one decimal, two where they have them, and no float noise', () => {
    expect(scriptNumber(93)).toBe('93.0');
    expect(scriptNumber(0.75)).toBe('0.75');
    expect(scriptNumber(9.999999999999993)).toBe('10.0');
    expect(scriptNumber(-4e-16)).toBe('0.0');
  });

  it('every step of every bundled profile has all its lines, the volume marker where it is', () => {
    for (const profile of profiles) {
      profile.steps.forEach((_, i) => {
        const kinds = stepSentences(profile, i)
          .map((sentence) => sentence.kind)
          .filter((kind) => kind !== 'volumeStart');
        expect(kinds, `${profile.title} ${i + 1}`).toEqual(['temperature', 'pump', 'limit', 'maximum', 'exit']);
      });
    }
  });
});

describe('a tap on a state word cycles it', () => {
  it('the sensor: Coffee, Water, Coffee', () => {
    let profile = BLOOMING;
    const seen = [chipOf(profile, 0, 'sensor')];
    for (let n = 0; n < 2; n++) {
      profile = cycleSensor(profile, 0);
      seen.push(chipOf(profile, 0, 'sensor'));
    }
    expect(seen).toEqual(['Coffee', 'Water', 'Coffee']);
    expect(profile.steps[1]).toBe(BLOOMING.steps[1]);
  });

  it('the pump: flow quickly, flow slowly, pressure quickly, pressure slowly, and round', () => {
    let profile = BLOOMING;
    const seen = [chipOf(profile, 0, 'pump')];
    for (let n = 0; n < 4; n++) {
      profile = cyclePump(profile, 0);
      seen.push(chipOf(profile, 0, 'pump'));
    }
    expect(seen).toEqual(['Flow quickly', 'Flow slowly', 'Pressure quickly', 'Pressure slowly', 'Flow quickly']);
    // The pressure step's target and limit change their units with it.
    const pressure = cyclePump(cyclePump(BLOOMING, 4), 4);
    expect(script(pressure, 4)).toContain('[Pressure quickly] to {4.0 bar}');
    expect(script(pressure, 4)).toContain('Limit to {8.6 mL/s}');
  });

  it('the exit: pressure over, pressure under, flow over, flow under, off, and round; off keeps its line', () => {
    let profile = BLOOMING;
    const seen = [chipOf(profile, 1, 'exit')];
    for (let n = 0; n < 5; n++) {
      profile = cycleExit(profile, 1);
      seen.push(chipOf(profile, 1, 'exit'));
      if (n === 3) expect(script(profile, 1)).toContain('~Move on: [off]~');
    }
    expect(seen).toEqual(['Pressure is over', 'Pressure is under', 'Flow is over', 'Flow is under', 'off', 'Pressure is over']);
    // Back from off, pressure over has the step's 4 bar again.
    expect(profile.steps[1].exit).toEqual({ type: 'pressure', condition: 'over', value: 4 });
    // Flow takes 6 ml/s the first time.
    expect(cycleExit(cycleExit(BLOOMING, 1), 1).steps[1].exit).toEqual({ type: 'flow', condition: 'over', value: 6 });
    // A step without an exit has the off chip; a tap gives it the first exit, 9 bar.
    expect(chipOf(BLOOMING, 0, 'exit')).toBe('off');
    expect(script(cycleExit(BLOOMING, 0), 0)).toContain('Move on if [Pressure is over] {9.0 bar}');
  });

  it('the limit: off switched on, typed 0 off again, then on with its value back', () => {
    expect(chipOf(BLOOMING, 0, 'limit')).toBe('switch on');
    const on = switchLimiterOn(BLOOMING, 0);
    expect(script(on, 0)).toContain('Limit to {9.0 bar}');
    expect(chipOf(on, 0, 'limit')).toBeUndefined();
    const typed = setValue(on, 0, 'limiter', 7.5);
    const off = setValue(typed, 0, 'limiter', 0);
    expect(off.steps[0].limiter).toBeNull();
    expect(script(off, 0)).toContain('~No limit [switch on]~');
    expect(script(switchLimiterOn(off, 0), 0)).toContain('Limit to {7.5 bar}');
  });
});

describe('a tap on a number opens the picker', () => {
  const values = (profile: Profile, index: number) =>
    stepSentences(profile, index)
      .flatMap((sentence) => sentence.parts)
      .flatMap((part) => (part.kind === 'value' ? [part.value] : []));

  it('each number is one of the step values, with the range the cards use', () => {
    expect(values(BLOOMING, 1)).toEqual(['temperature', 'target', 'weight', 'seconds', 'volume', 'exit']);
    const pressure = {
      ...BLOOMING.steps[4],
      pump: 'pressure' as const,
      weight: 36,
      exit: { type: 'flow' as const, condition: 'over' as const, value: 2 },
    };
    const ranges = (['temperature', 'target', 'limiter', 'weight', 'seconds', 'volume', 'exit'] as StepValue[]).map((value) => {
      const limit = limitOf(pressure, value)!;
      return `${value} ${limit.min}-${limit.max} ${limit.unit}`;
    });
    expect(ranges).toEqual([
      'temperature 0-105 °C',
      'target 0-12 bar',
      'limiter 0-8 ml/s',
      'weight 0-500 g',
      'seconds 0-127 s',
      'volume 0-500 ml',
      'exit 0-8 ml/s',
    ]);
    expect(`${limitOf(BLOOMING.steps[4], 'target')!.max} ${limitOf(BLOOMING.steps[4], 'limiter')!.max}`).toBe('15 12');
    expect(limitOf(BLOOMING.steps[1], 'exit')!.max).toBe(12);
  });

  it('a value picked shows in its sentence; a limit or maximum amount typed 0 is off and stays muted', () => {
    expect(script(setValue(BLOOMING, 4, 'target', 3), 4)).toContain('[Flow quickly] at a rate of {3.0 mL/s}');
    expect(setValue(BLOOMING, 4, 'target', 99).steps[4].flow).toBe(15);
    expect(script(setValue(BLOOMING, 4, 'limiter', 0), 4)).toContain('~No limit [switch on]~');
    expect(script(setValue(BLOOMING, 0, 'volume', 0), 0)).toContain('For a maximum of {~weight off~} or {2.0 sec} or {~volume off~}');
    // The muted amount opens the pad too: typed, it is on again.
    expect(script(setValue(BLOOMING, 0, 'weight', 36), 0)).toContain('For a maximum of {36.0 g} or {2.0 sec} or {500.0 ml}');
  });
});
