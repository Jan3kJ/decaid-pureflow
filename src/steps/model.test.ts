// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// test/step-index-bookkeeping.test.mjs, test/profile-editor-cards.test.mjs and
// test/profile-editor.test.mjs (the cycles, the count start, readExitDef).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
import { describe, expect, it } from 'vitest';
import type { Profile, ProfileStep } from '../api';
import { sameSteps } from '../editor/storage';
import bundled from './fixtures/bundled-profiles.json' with { type: 'json' };
import { FIELD_LIMITS } from './limits';
import {
  EXIT_CYCLE_STATES,
  PUMP_CYCLE_STATES,
  cycleExit,
  cyclePump,
  cycleSensor,
  exitCycleIndex,
  formatSetting,
  formatValue,
  insertStepAfter,
  moveStep,
  newLimiterRange,
  openProfile,
  pumpCycleIndex,
  readExitDef,
  removeStepAt,
  setExit,
  setName,
  setPump,
  setSetting,
  setText,
  settingOf,
  stepSetting,
  setValue,
  stepProblems,
  stepValue,
  type StepValue,
} from './model';

const PROFILES = bundled as unknown as Profile[];
const byTitle = (title: string) => openProfile(PROFILES.find((profile) => profile.title === title)!);

function step(name: string, over: Partial<ProfileStep> = {}): ProfileStep {
  return {
    name,
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
  };
}

/** A profile of steps named by letters, the count start on `marked` (1-based, 0: none). */
function lettered(names: string, marked: number): Profile {
  return {
    title: 'letters',
    steps: [...names].map((name) => step(name)),
    target_volume_count_start: marked,
    tank_temperature: 0,
  };
}

const order = (profile: Profile) => profile.steps.map((s) => s.name).join('');
const marked = (profile: Profile) =>
  profile.target_volume_count_start ? profile.steps[profile.target_volume_count_start - 1]?.name ?? 'DANGLING' : null;

describe('the count start moves with the steps', () => {
  it('delete and insert, around and on the marked step', () => {
    expect(marked(removeStepAt(lettered('abcd', 3), 0))).toBe('c');
    expect(marked(removeStepAt(lettered('abcd', 2), 3))).toBe('b');
    // A new step is named "New Step", so the marked one is found by its letter.
    expect(marked(insertStepAfter(lettered('abcd', 3), 0))).toBe('c');
    expect(marked(insertStepAfter(lettered('abcd', 1), 2))).toBe('a');
    expect(marked(removeStepAt(lettered('abcd', 2), 1))).toBe('a');
    expect(marked(removeStepAt(lettered('abcd', 1), 0))).toBeNull();
    const last = removeStepAt(lettered('abcd', 4), 3);
    expect(last.target_volume_count_start).toBeLessThanOrEqual(last.steps.length);
    expect(insertStepAfter(lettered('abcd', 0), 1).target_volume_count_start).toBe(0);
    expect(removeStepAt(lettered('abcd', 0), 1).target_volume_count_start).toBe(0);
  });

  it('move: the order, and refused moves leave it', () => {
    expect(order(moveStep(lettered('abcd', 0), 0, 1))).toBe('bacd');
    expect(order(moveStep(lettered('abcd', 0), 3, 0))).toBe('dabc');
    expect(order(moveStep(lettered('abcd', 0), 1, 3))).toBe('acdb');
    const profile = lettered('abcd', 2);
    for (const [from, to] of [
      [0, -1],
      [3, 4],
      [2, 2],
    ]) {
      expect(moveStep(profile, from, to)).toBe(profile);
    }
  });

  it('move: the marked step stays marked, for every move of up to six steps', () => {
    for (let n = 1; n <= 6; n++) {
      const names = 'abcdef'.slice(0, n);
      for (let mark = 1; mark <= n; mark++) {
        for (let from = 0; from < n; from++) {
          for (let to = 0; to < n; to++) {
            const before = lettered(names, mark);
            const after = moveStep(before, from, to);
            expect(marked(after)).toBe(marked(before));
            expect(new Set(order(after)).size).toBe(n);
          }
        }
      }
    }
  });
});

describe('the cycles', () => {
  it('pump: flow quickly, flow slowly, pressure quickly, pressure slowly, round again', () => {
    expect(PUMP_CYCLE_STATES.map((s) => `${s.pump} ${s.transition}`)).toEqual([
      'flow fast',
      'flow smooth',
      'pressure fast',
      'pressure smooth',
    ]);
    PUMP_CYCLE_STATES.forEach((state, i) => expect(pumpCycleIndex(state.pump, state.transition)).toBe(i));
    let profile = lettered('a', 0);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      profile = cyclePump(profile, 0);
      seen.push(`${profile.steps[0].pump} ${profile.steps[0].transition}`);
    }
    expect(seen).toEqual(['flow smooth', 'pressure fast', 'pressure smooth', 'flow fast', 'flow smooth']);
  });

  it('exit: pressure over, pressure under, flow over, flow under, off, round again', () => {
    expect(EXIT_CYCLE_STATES.map((s) => `${s.type} ${s.condition}`)).toEqual([
      'pressure over',
      'pressure under',
      'flow over',
      'flow under',
      'off null',
    ]);
    EXIT_CYCLE_STATES.forEach((state, i) => expect(exitCycleIndex(state.type, state.condition)).toBe(i));
    expect(exitCycleIndex(undefined, undefined)).toBe(4);
    let profile = lettered('a', 0);
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      profile = cycleExit(profile, 0);
      const exit = readExitDef(profile.steps[0]);
      seen.push(exit.type === 'off' ? 'off' : `${exit.type} ${exit.condition}`);
    }
    expect(seen).toEqual(['pressure over', 'pressure under', 'flow over', 'flow under', 'off', 'pressure over']);
  });

  it('sensor: coffee and water', () => {
    const profile = cycleSensor(lettered('a', 0), 0);
    expect(profile.steps[0].sensor).toBe('water');
    expect(cycleSensor(profile, 0).steps[0].sensor).toBe('coffee');
  });
});

describe('readExitDef', () => {
  it('a step without an exit, or with a type Decaid does not take, is off, not "over 0"', () => {
    expect(readExitDef(step('a'))).toEqual({ type: 'off', condition: 'over', value: 0 });
    expect(readExitDef(step('a', { exit: { type: 'weight', condition: 'over', value: 3 } as never }))).toEqual({
      type: 'off',
      condition: 'over',
      value: 0,
    });
    expect(readExitDef(step('a', { exit: { type: 'flow', condition: 'under', value: 1.5 } }))).toEqual({
      type: 'flow',
      condition: 'under',
      value: 1.5,
    });
  });
});

describe('editing a step', () => {
  it('the pump switch seeds 6 where the step has no value of the new pump, and keeps the other', () => {
    const flow = lettered('a', 0);
    const pressure = setPump(flow, 0, { pump: 'pressure', transition: 'smooth' });
    expect(pressure.steps[0]).toMatchObject({ pump: 'pressure', transition: 'smooth', pressure: 6, flow: 4 });
    const back = setPump(pressure, 0, { pump: 'flow', transition: 'fast' });
    expect(back.steps[0]).toMatchObject({ pump: 'flow', flow: 4, pressure: 6 });
    // A pressure the step already had is not seeded over.
    const had = setPump({ ...flow, steps: [step('a', { pressure: 8.5 })] }, 0, { pump: 'pressure', transition: 'fast' });
    expect(had.steps[0].pressure).toBe(8.5);
  });

  it('an exit switched off and on again gets its value back; a new one 9 bar or 6 ml/s', () => {
    let profile = setExit(lettered('a', 0), 0, { type: 'pressure', condition: 'over' });
    expect(profile.steps[0].exit).toEqual({ type: 'pressure', condition: 'over', value: 9 });
    profile = setValue(profile, 0, 'exit', 4.2);
    profile = setExit(profile, 0, { type: 'off', condition: null });
    expect(profile.steps[0].exit).toBeNull();
    profile = setExit(profile, 0, { type: 'flow', condition: 'over' });
    expect(profile.steps[0].exit).toEqual({ type: 'flow', condition: 'over', value: 6 });
    profile = setValue(profile, 0, 'exit', 2.5);
    // Moving the step keeps its memory: it is the same step.
    profile = moveStep(insertStepAfter(profile, 0), 0, 1);
    profile = setExit(profile, 1, { type: 'pressure', condition: 'under' });
    expect(profile.steps[1].exit).toEqual({ type: 'pressure', condition: 'under', value: 4.2 });
    profile = setExit(profile, 1, { type: 'flow', condition: 'under' });
    expect(profile.steps[1].exit).toEqual({ type: 'flow', condition: 'under', value: 2.5 });
  });

  it("a new limiter takes the range of the profile's first live limiter of its pump, else 0.6", () => {
    const profile = byTitle('Blooming Espresso');
    // Step 5 is limited to 8.6 bar, range 0.6; a range of another pump does not count.
    const steps = profile.steps.map((s, i) => (i === 4 ? { ...s, limiter: { value: 8.6, range: 0.9 } } : s));
    const ranged = { ...profile, steps };
    expect(newLimiterRange(ranged, 'flow')).toBe(0.9);
    expect(newLimiterRange(ranged, 'pressure')).toBe(0.6);
    const limited = setValue(ranged, 1, 'limiter', 7);
    expect(limited.steps[1].limiter).toEqual({ value: 7, range: 0.9 });
    // A limiter set to 0 is off and keeps its range; without one, 0 adds none.
    expect(setValue(limited, 1, 'limiter', 0).steps[1].limiter).toEqual({ value: 0, range: 0.9 });
    expect(setValue(ranged, 2, 'limiter', 0).steps[2]).toBe(ranged.steps[2]);
  });

  it('± and typed values stay inside the ranges; a value brought from outside comes back in', () => {
    let profile = lettered('a', 0);
    const values: StepValue[] = ['temperature', 'target', 'limiter', 'seconds', 'volume', 'weight'];
    for (const value of values) {
      expect(setValue(profile, 0, value, 1e6).steps[0]).not.toEqual(profile.steps[0]);
      expect(stepProblems(setValue(profile, 0, value, 1e6).steps[0])).toEqual([]);
      expect(stepProblems(setValue(profile, 0, value, -5).steps[0])).toEqual([]);
    }
    expect(setValue(profile, 0, 'target', 99).steps[0].flow).toBe(FIELD_LIMITS.flow.max);
    profile = { ...profile, steps: [step('a', { flow: 17 })] };
    expect(stepProblems(profile.steps[0])).toEqual(['target is 0 to 15 ml/s']);
    expect(stepValue(profile, 0, 'target', 1).steps[0].flow).toBe(15);
    // ± sums tenths without float noise.
    let tenths = lettered('a', 0);
    for (let i = 0; i < 3; i++) tenths = stepValue(tenths, 0, 'target', 1);
    expect(tenths.steps[0].flow).toBe(4.3);
    // The exit of a step without one is not set.
    expect(setValue(lettered('a', 0), 0, 'exit', 3)).toEqual(lettered('a', 0));
  });

  it('a value is shown with its unit, off where 0 is off, two decimals where it has them', () => {
    const s = step('a', { limiter: { value: 0.75, range: 0.6 }, seconds: 0 });
    expect(formatValue(s, 'temperature')).toBe('93.0 °C');
    expect(formatValue(s, 'target')).toBe('4.0 ml/s');
    expect(formatValue(s, 'limiter')).toBe('0.75 bar');
    expect(formatValue(s, 'seconds')).toBe('off');
    expect(formatValue(s, 'exit')).toBe('off');
    expect(formatValue({ ...s, volume: 500 }, 'volume')).toBe('500 ml');
  });

  it('no operation changes its input', () => {
    const profile = byTitle('Blooming Espresso');
    const copy = structuredClone(profile);
    insertStepAfter(profile, 1);
    removeStepAt(profile, 2);
    moveStep(profile, 0, 3);
    setValue(profile, 1, 'exit', 2);
    setValue(profile, 4, 'limiter', 3);
    stepValue(profile, 0, 'temperature', 1);
    cyclePump(profile, 0);
    cycleExit(profile, 0);
    cycleSensor(profile, 0);
    setName(profile, 0, 'x');
    expect(profile).toEqual(copy);
  });

  it('a new step is a copy of the one it follows, named "New Step"; in an empty profile a default', () => {
    const profile = byTitle('Blooming Espresso');
    const inserted = insertStepAfter(profile, 4);
    expect(inserted.steps[5]).toEqual({ ...profile.steps[4], name: 'New Step' });
    expect(inserted.steps[5]).not.toBe(profile.steps[4]);
    const empty = insertStepAfter({ ...profile, steps: [] }, -1);
    expect(empty.steps).toHaveLength(1);
    expect(empty.steps[0]).toMatchObject({ name: 'New Step', pump: 'flow', flow: 6, temperature: 93, seconds: 30 });
  });
});

// A profile the editor cannot show fully must lose nothing on save: what it sends is the
// opened profile with only the edited fields changed (research.md 17, 'Built (E2)').
describe('nothing is lost', () => {
  it('every bundled profile of the rig opens unchanged, and every value is inside its range', () => {
    expect(PROFILES).toHaveLength(73);
    for (const profile of PROFILES) {
      expect(openProfile(profile)).toEqual(profile);
      for (const s of profile.steps) expect(stepProblems(s), `${profile.title}: ${s.name}`).toEqual([]);
    }
  });

  it('an edit of one value changes that value alone, in every bundled profile', () => {
    for (const original of PROFILES) {
      const profile = openProfile(original);
      const last = profile.steps.length - 1;
      const edited = setValue(profile, last, 'temperature', 50);
      expect(edited.steps[last].temperature).toBe(50);
      expect({ ...edited.steps[last], temperature: original.steps[last].temperature }).toEqual(original.steps[last]);
      edited.steps.slice(0, last).forEach((s, i) => expect(s).toBe(profile.steps[i]));
      expect({ ...edited, steps: original.steps }).toEqual(original);
      // Back to the old value: the same profile as it came, field for field.
      expect(setValue(edited, last, 'temperature', original.steps[last].temperature)).toEqual(original);
    }
  });

  it('add, move back and delete again: the profile as it came', () => {
    for (const original of PROFILES) {
      let profile = openProfile(original);
      profile = insertStepAfter(profile, 0);
      profile = moveStep(profile, 1, profile.steps.length - 1);
      profile = removeStepAt(profile, profile.steps.length - 1);
      expect(profile, original.title).toEqual(original);
    }
  });

  it('fields the editor does not show go back as they came: top-level, per step, legacy exits', () => {
    const odd = {
      ...byTitle('Trendy 6 bar low pressure shot'),
      legacy_profile_type: 'settings_2c',
      lang: 'en',
      somethingNew: { nested: [1, 2] },
    } as Profile;
    const steps = odd.steps.map((s, i) =>
      i === 0 ? ({ ...s, exit: { type: 'weight', condition: 'over', value: 30 }, futureField: 'x' } as unknown as ProfileStep) : s,
    );
    const profile = openProfile({ ...odd, steps });
    expect(stepProblems(profile.steps[0])).toEqual(['the exit on “weight” is not one Decaid takes; it is kept as it is']);
    const edited = setValue(stepValue(profile, 2, 'seconds', 1), 0, 'temperature', 91);
    expect(edited).toMatchObject({ legacy_profile_type: 'settings_2c', lang: 'en', somethingNew: { nested: [1, 2] } });
    expect(edited.steps[0]).toEqual({ ...profile.steps[0], temperature: 91 });
    expect(edited.steps[1]).toBe(profile.steps[1]);
    expect(sameSteps(edited.steps[2], { ...profile.steps[2], seconds: profile.steps[2].seconds + 1 })).toBe(true);
  });
});

describe('the profile settings', () => {
  const blooming = openProfile((bundled as unknown as Profile[]).find((p) => p.title === 'Blooming Espresso')!);

  it('set inside their ranges, with ± steps of 0.1 g, 1 ml and 1 °C; the steps stay the same objects', () => {
    const weighed = setSetting(blooming, 'target_weight', 36.04);
    expect(weighed.target_weight).toBe(36.04);
    expect(weighed.steps).toBe(blooming.steps);
    expect(stepSetting({ ...blooming, target_weight: 36 }, 'target_weight', 1).target_weight).toBe(36.1);
    expect(stepSetting({ ...blooming, target_volume: 0 }, 'target_volume', 1).target_volume).toBe(1);
    expect(setSetting(blooming, 'tank_temperature', 200).tank_temperature).toBe(110);
    expect(setSetting(blooming, 'target_volume', -5).target_volume).toBe(0);
    expect(setSetting(blooming, 'target_weight', NaN)).toBe(blooming);
  });

  it('read 0 where the profile has none, and show it as off', () => {
    const none = { ...blooming, target_weight: null, target_volume: undefined, tank_temperature: 0 };
    expect(settingOf(none, 'target_weight')).toBe(0);
    expect(formatSetting(none, 'target_volume')).toBe('off');
    expect(formatSetting({ ...none, target_weight: 36 }, 'target_weight')).toBe('36.0 g');
    expect(formatSetting({ ...none, tank_temperature: 35 }, 'tank_temperature')).toBe('35 °C');
  });

  it('take the title and the notes as typed; an empty title is not taken', () => {
    expect(setText(blooming, 'title', 'Mine').title).toBe('Mine');
    expect(setText(blooming, 'title', '  ')).toBe(blooming);
    expect(setText(blooming, 'notes', '').notes).toBe('');
  });
});
