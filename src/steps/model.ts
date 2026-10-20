// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/profile_editor.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The step editor's model (research.md 17.10): pure operations on a v2 profile, each
// returning a new profile and leaving its input as it was. Nothing is dropped: a step that is
// not edited is the same object afterwards, and an edited step is the old one with only the
// edited fields changed, so every field the editor does not show (a top-level field of
// another app, the unused pump's value, a limiter that is off, an exit type Decaid does not
// take) goes back as it came. Unlike Streamline's `normalizeLegacySteps`, opening a profile
// changes nothing.
import type { Profile, ProfileStep, StepExit } from '../api';
import {
  DEFAULT_LIMITER_RANGE,
  EXIT_MAX_MAP,
  EXIT_STEP_MAP,
  EXIT_UNIT_MAP,
  FIELD_LIMITS,
  SETTING_LIMITS,
  type Limit,
  type SettingField,
} from './limits';

/** What a pump chip shows: the pump and how it reaches its target, in one. */
export interface PumpState {
  pump: 'flow' | 'pressure';
  transition: 'fast' | 'smooth';
}

/** Flow quickly, flow slowly, pressure quickly, pressure slowly, then round again. */
export const PUMP_CYCLE_STATES: readonly PumpState[] = [
  { pump: 'flow', transition: 'fast' },
  { pump: 'flow', transition: 'smooth' },
  { pump: 'pressure', transition: 'fast' },
  { pump: 'pressure', transition: 'smooth' },
];

export function pumpCycleIndex(pump: string | undefined, transition: string | undefined): number {
  return (pump === 'pressure' ? 2 : 0) + (transition === 'smooth' ? 1 : 0);
}

export function pumpLabel(state: PumpState): string {
  return `${state.pump === 'pressure' ? 'Pressure' : 'Flow'} ${state.transition === 'smooth' ? 'slowly' : 'quickly'}`;
}

/** What a "move on if" chip shows; `off` is a step without an exit. */
export interface ExitState {
  type: 'pressure' | 'flow' | 'off';
  condition: 'over' | 'under' | null;
}

/** Pressure over, pressure under, flow over, flow under, off, then round again. */
export const EXIT_CYCLE_STATES: readonly ExitState[] = [
  { type: 'pressure', condition: 'over' },
  { type: 'pressure', condition: 'under' },
  { type: 'flow', condition: 'over' },
  { type: 'flow', condition: 'under' },
  { type: 'off', condition: null },
];

export function exitCycleIndex(type: string | undefined, condition: string | null | undefined): number {
  if (type !== 'pressure' && type !== 'flow') return 4;
  return (type === 'flow' ? 2 : 0) + (condition === 'under' ? 1 : 0);
}

export function exitLabel(state: ExitState): string {
  if (state.type === 'off') return 'Off';
  return `${state.type === 'flow' ? 'Flow' : 'Pressure'} ${state.condition === 'under' ? 'is under' : 'is over'}`;
}

/** A step's exit as the editor shows it: a step without one, or with a type Decaid does not take, is off. */
export function readExitDef(step: ProfileStep): { type: 'pressure' | 'flow' | 'off'; condition: 'over' | 'under'; value: number } {
  const exit = step.exit;
  if (!exit || (exit.type !== 'pressure' && exit.type !== 'flow')) return { type: 'off', condition: 'over', value: 0 };
  return { type: exit.type, condition: exit.condition || 'over', value: num(exit.value) };
}

/** A number of the profile; the gateway sends numbers, a file may hold strings (research.md 8.6). */
export function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

const PUMP_SEED_FLOW = 6.0;
const PUMP_SEED_PRESSURE = 6.0;

const DEFAULT_STEP: ProfileStep = {
  name: 'New Step',
  pump: 'flow',
  transition: 'fast',
  flow: PUMP_SEED_FLOW,
  temperature: 93,
  sensor: 'coffee',
  seconds: 30,
  weight: 0,
  volume: 0,
  exit: { type: 'pressure', condition: 'over', value: 9.0 },
  limiter: null,
};

/** A new step: a copy of the step it is inserted after, or a default one, named "New Step". */
export function newStep(neighbor?: ProfileStep): ProfileStep {
  return { ...structuredClone(neighbor ?? DEFAULT_STEP), name: DEFAULT_STEP.name };
}

/** The profile the editor works on: a copy, nothing changed. */
export function openProfile(profile: Profile): Profile {
  return structuredClone(profile);
}

// `target_volume_count_start` is a 1-based step index (0: none): it moves with the steps
// around it on every insert, delete and move.

/** A new step after `index`; -1 puts it first (a profile without steps). */
export function insertStepAfter(profile: Profile, index: number): Profile {
  const steps = [...profile.steps];
  steps.splice(index + 1, 0, newStep(profile.steps[index]));
  const start = profile.target_volume_count_start || 0;
  return { ...profile, steps, ...(start > index + 1 ? { target_volume_count_start: start + 1 } : {}) };
}

export function removeStepAt(profile: Profile, index: number): Profile {
  const steps = profile.steps.filter((_, i) => i !== index);
  const start = profile.target_volume_count_start || 0;
  // The marked step is gone: the mark falls back to the one before it (0: none).
  const moved = start === index + 1 ? index : start > index + 1 ? start - 1 : null;
  return { ...profile, steps, ...(moved !== null ? { target_volume_count_start: moved } : {}) };
}

/** The step at `from` moved to `to`; the profile itself when `to` is not a place. */
export function moveStep(profile: Profile, from: number, to: number): Profile {
  if (to < 0 || to >= profile.steps.length || from === to) return profile;
  const steps = [...profile.steps];
  const [step] = steps.splice(from, 1);
  steps.splice(to, 0, step);
  const start = profile.target_volume_count_start || 0;
  if (start === 0) return { ...profile, steps };
  let marked = start - 1;
  if (marked === from) marked = to;
  else if (from < to && marked > from && marked <= to) marked -= 1;
  else if (from > to && marked >= to && marked < from) marked += 1;
  return { ...profile, steps, target_volume_count_start: marked + 1 };
}

// --- the values of a step ---

/** The values a card edits with ± and the number pad. */
export type StepValue = 'temperature' | 'target' | 'limiter' | 'seconds' | 'volume' | 'weight' | 'exit';

export const VALUE_LABEL: Record<StepValue, string> = {
  temperature: 'temperature',
  target: 'target',
  limiter: 'limit',
  seconds: 'time',
  volume: 'volume',
  weight: 'weight',
  exit: 'exit',
};

const isPressure = (step: ProfileStep) => step.pump === 'pressure';

/** The range of a value of this step; null for the exit of a step without one. */
export function limitOf(step: ProfileStep, value: StepValue): Limit | null {
  switch (value) {
    case 'target':
      return isPressure(step) ? FIELD_LIMITS.pressure : FIELD_LIMITS.flow;
    case 'limiter':
      return isPressure(step) ? FIELD_LIMITS.flowLimit : FIELD_LIMITS.pressureLimit;
    case 'exit': {
      const exit = readExitDef(step);
      if (exit.type === 'off') return null;
      return { min: 0, max: EXIT_MAX_MAP[exit.type], step: EXIT_STEP_MAP[exit.type], unit: EXIT_UNIT_MAP[exit.type] };
    }
    default:
      return FIELD_LIMITS[value];
  }
}

/** A value of the step, 0 where it is off. */
export function valueOf(step: ProfileStep, value: StepValue): number {
  switch (value) {
    case 'target':
      return num(isPressure(step) ? step.pressure : step.flow);
    case 'limiter':
      return step.limiter ? num(step.limiter.value) : 0;
    case 'exit':
      return readExitDef(step).value;
    default:
      return num(step[value]);
  }
}

/** Off where 0 means off: a limiter, and a maximum of weight, time or volume. */
export function isOff(step: ProfileStep, value: StepValue): boolean {
  if (value === 'exit') return readExitDef(step).type === 'off';
  return (value === 'limiter' || value === 'seconds' || value === 'volume' || value === 'weight') && valueOf(step, value) === 0;
}

/** The number of a value, in the decimals of its ± step, two where it has them (a limiter of 0.75). */
export function formatNumber(step: ProfileStep, value: StepValue): string {
  const limit = limitOf(step, value);
  // Float noise a file brings (-4e-16 bar in "Cleaning/Forward Flush x5") reads as 0.0.
  const v = Number(valueOf(step, value).toFixed(2)) || 0;
  const decimals = Math.round(v * 10) !== v * 10 ? 2 : limit && limit.step < 1 ? 1 : 0;
  return v.toFixed(decimals);
}

/** A value with its unit; "off" where 0 is off. */
export function formatValue(step: ProfileStep, value: StepValue): string {
  const limit = limitOf(step, value);
  if (!limit || isOff(step, value)) return 'off';
  return `${formatNumber(step, value)} ${limit.unit}`;
}

const clamp = (value: number, limit: Limit) => Math.min(limit.max, Math.max(limit.min, value));
/** Without the float's noise of a sum of tenths; a value with two decimals (0.75) keeps them. */
const tidy = (value: number) => Number(value.toFixed(2));

// The last real exit value of each type, and the last live limiter, per step, so that
// switching an exit or a limit off and on again, or an exit from pressure to flow and back,
// gives the old value back instead of 0: a live "pressure is over 0 bar" would end the step at
// once. Each edit makes a new step object, which takes the old one's memory along.
interface StepMemory {
  pressure?: number;
  flow?: number;
  limiter?: { value: number; range: number };
}
const stepMemory = new WeakMap<ProfileStep, StepMemory>();
/** What an exit or a limit takes when the step remembers none: 9 bar, 6 ml/s. */
const FALLBACK_VALUE = { pressure: 9.0, flow: 6.0 };

function rememberExitValue(step: ProfileStep, type: string, value: number) {
  if ((type !== 'pressure' && type !== 'flow') || !(value > 0)) return;
  stepMemory.set(step, { ...stepMemory.get(step), [type]: value });
}

function recallExitValue(step: ProfileStep, type: 'pressure' | 'flow'): number {
  const remembered = stepMemory.get(step)?.[type] ?? 0;
  return Math.min(remembered > 0 ? remembered : FALLBACK_VALUE[type], EXIT_MAX_MAP[type]);
}

function rememberLimiter(step: ProfileStep) {
  const limiter = step.limiter;
  if (!limiter || !(num(limiter.value) > 0)) return;
  stepMemory.set(step, { ...stepMemory.get(step), limiter: { value: num(limiter.value), range: num(limiter.range) } });
}

function updateStep(profile: Profile, index: number, change: (step: ProfileStep) => ProfileStep): Profile {
  const old = profile.steps[index];
  const next = change(old);
  const memory = stepMemory.get(old);
  if (memory) stepMemory.set(next, memory);
  return { ...profile, steps: profile.steps.map((step, i) => (i === index ? next : step)) };
}

/**
 * The range a new limiter takes: that of the first live limiter of the same pump in the
 * profile, so a profile keeps one range per pump; else 0.6.
 */
export function newLimiterRange(profile: Profile, pump: ProfileStep['pump']): number {
  const limited = profile.steps.filter((step) => step.pump === pump && step.limiter);
  const step = limited.find((candidate) => num(candidate.limiter!.value) > 0) ?? limited[0];
  const range = num(step?.limiter?.range ?? NaN);
  return Number.isFinite(range) ? range : DEFAULT_LIMITER_RANGE;
}

/** The range a limiter switched on takes: the one it had before it was switched off, else `newLimiterRange`. */
function limiterRangeOf(profile: Profile, step: ProfileStep): number {
  return stepMemory.get(step)?.limiter?.range ?? newLimiterRange(profile, step.pump);
}

/**
 * Sets a value of the step, inside its range. A live limiter set to 0 is off: `limiter: null`,
 * as Decaid stores a step without one; a new one takes the range it had, else
 * `newLimiterRange`. The exit of a step without one is not set.
 */
export function setValue(profile: Profile, index: number, value: StepValue, to: number): Profile {
  const step = profile.steps[index];
  const limit = limitOf(step, value);
  if (!limit || !Number.isFinite(to)) return profile;
  const v = tidy(clamp(to, limit));
  return updateStep(profile, index, (old) => {
    switch (value) {
      case 'target':
        return isPressure(old) ? { ...old, pressure: v } : { ...old, flow: v };
      case 'limiter':
        if (v === 0) {
          if (!old.limiter || !(num(old.limiter.value) > 0)) return old;
          rememberLimiter(old);
          return { ...old, limiter: null };
        }
        if (old.limiter) return { ...old, limiter: { ...old.limiter, value: v } };
        return { ...old, limiter: { value: v, range: limiterRangeOf(profile, old) } };
      case 'exit': {
        const exit = old.exit as StepExit;
        rememberExitValue(old, exit.type, v);
        return { ...old, exit: { ...exit, value: v } };
      }
      default:
        return { ...old, [value]: v };
    }
  });
}

/** One step of ± from the value as it is; a value a profile brought outside its range comes back inside. */
export function stepValue(profile: Profile, index: number, value: StepValue, direction: 1 | -1): Profile {
  const step = profile.steps[index];
  const limit = limitOf(step, value);
  if (!limit) return profile;
  return setValue(profile, index, value, valueOf(step, value) + direction * limit.step);
}

/**
 * The pump chip. Switching between flow and pressure seeds 6 of the new pump where the step
 * has no value for it; the other pump's value stays in the step (Decaid reads the one of its
 * pump), so switching back gives it again.
 */
export function setPump(profile: Profile, index: number, state: PumpState): Profile {
  return updateStep(profile, index, (old) => {
    const next: ProfileStep = { ...old, pump: state.pump, transition: state.transition };
    if (state.pump === 'pressure' && !num(old.pressure)) next.pressure = PUMP_SEED_PRESSURE;
    if (state.pump === 'flow' && !num(old.flow)) next.flow = PUMP_SEED_FLOW;
    return next;
  });
}

/** The next state of the pump chip. */
export function cyclePump(profile: Profile, index: number): Profile {
  const step = profile.steps[index];
  const next = PUMP_CYCLE_STATES[(pumpCycleIndex(step.pump, step.transition) + 1) % PUMP_CYCLE_STATES.length];
  return setPump(profile, index, next);
}

export function cycleSensor(profile: Profile, index: number): Profile {
  return updateStep(profile, index, (old) => ({ ...old, sensor: old.sensor === 'water' ? 'coffee' : 'water' }));
}

/** The exit chip: off is `exit: null`; a type gets this step's last value of it back, else 9 bar or 6 ml/s. */
export function setExit(profile: Profile, index: number, state: ExitState): Profile {
  return updateStep(profile, index, (old) => {
    const exit = readExitDef(old);
    if (exit.type !== 'off') rememberExitValue(old, exit.type, exit.value);
    if (state.type === 'off') return { ...old, exit: null };
    const value = recallExitValue(old, state.type);
    return { ...old, exit: { type: state.type, condition: state.condition ?? 'over', value } };
  });
}

/**
 * A limit that is off switched on: the value and range it had before it was switched off,
 * else 9 bar or 6 ml/s (inside the limit's range) and `newLimiterRange`; the SCRIPT tab's
 * chip. A live limit stays.
 */
export function switchLimiterOn(profile: Profile, index: number): Profile {
  const step = profile.steps[index];
  if (!isOff(step, 'limiter')) return profile;
  const limit = limitOf(step, 'limiter')!;
  const remembered = stepMemory.get(step)?.limiter?.value;
  const value = Math.min(remembered ?? FALLBACK_VALUE[isPressure(step) ? 'flow' : 'pressure'], limit.max);
  // A limiter kept at 0 (a profile of another app) keeps its own range.
  return updateStep(profile, index, (old) =>
    old.limiter ? { ...old, limiter: { ...old.limiter, value } } : { ...old, limiter: { value, range: limiterRangeOf(profile, old) } },
  );
}

export function cycleExit(profile: Profile, index: number): Profile {
  const exit = readExitDef(profile.steps[index]);
  const next = EXIT_CYCLE_STATES[(exitCycleIndex(exit.type, exit.condition) + 1) % EXIT_CYCLE_STATES.length];
  return setExit(profile, index, next);
}

export function setName(profile: Profile, index: number, name: string): Profile {
  return updateStep(profile, index, (old) => ({ ...old, name }));
}

/** Float noise, not a value: three bundled steps hold -4e-16 bar. */
const NOISE = 1e-6;

/**
 * What of a step lies outside the v2 profile's ranges (17.6), or is not one of the values the
 * editor can show: each is said on its card, and kept as it is when nothing edits it.
 */
export function stepProblems(step: ProfileStep): string[] {
  const problems: string[] = [];
  if (step.pump !== 'flow' && step.pump !== 'pressure') problems.push(`the pump “${String(step.pump)}” is not flow or pressure`);
  if (step.exit && step.exit.type !== 'pressure' && step.exit.type !== 'flow') {
    problems.push(`the exit on “${String(step.exit.type)}” is not one Decaid takes; it is kept as it is`);
  }
  for (const value of ['temperature', 'target', 'limiter', 'seconds', 'volume', 'weight', 'exit'] as const) {
    const limit = limitOf(step, value);
    if (!limit) continue;
    const v = valueOf(step, value);
    if (!Number.isFinite(v) || v < limit.min - NOISE || v > limit.max + NOISE) {
      problems.push(`${VALUE_LABEL[value]} is ${limit.min} to ${limit.max} ${limit.unit}`);
    }
  }
  return problems;
}

// --- the profile's settings (the SETTINGS tab) ---

/** A setting of the profile, 0 where the profile has none. */
export function settingOf(profile: Profile, field: SettingField): number {
  return Number(num(profile[field]).toFixed(2)) || 0;
}

/** A setting with its unit; "off" at 0, as the step maxima. */
export function formatSetting(profile: Profile, field: SettingField): string {
  const limit = SETTING_LIMITS[field];
  const v = settingOf(profile, field);
  return v === 0 ? 'off' : `${v.toFixed(limit.step < 1 ? 1 : 0)} ${limit.unit}`;
}

/** Sets a setting inside its range; every other field of the profile stays as it is. */
export function setSetting(profile: Profile, field: SettingField, to: number): Profile {
  if (!Number.isFinite(to)) return profile;
  return { ...profile, [field]: tidy(clamp(to, SETTING_LIMITS[field])) };
}

/** One step of ± from the setting as it is. */
export function stepSetting(profile: Profile, field: SettingField, direction: 1 | -1): Profile {
  return setSetting(profile, field, settingOf(profile, field) + direction * SETTING_LIMITS[field].step);
}

/** The title and the notes as typed; an empty title is not taken, so a profile keeps one. */
export function setText(profile: Profile, field: 'title' | 'notes', text: string): Profile {
  if (field === 'title' && !text.trim()) return profile;
  return { ...profile, [field]: text };
}
