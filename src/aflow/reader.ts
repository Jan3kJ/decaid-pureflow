// The inverse of the generator (spec 3.9, U2): a profile's steps in, A-Flow 3.0 parameters
// out. It reads what the de1app plugin wrote, of every version, and what the generator writes:
// - plugin 1.0 to 1.3: Fill, Infuse, Pressure Up, Pressure Decline, Flow Start, Flow Extraction;
// - plugin 1.4 on: Pre Fill, Fill, Infuse, 2nd Fill, Pause, then the same four;
// - the generator: the steps of spec 3.2, a step that is off left out.
// The plugin switches a step off with 0 s, the generator leaves it out: both read as off. The
// plugin always writes Pressure Decline, the generator never. The plugin sets 2nd Fill and Pause
// to 15 s or 0 s together, but Decaid's copies of its files keep the Pause at 15 s where the
// files have 0 s (docs/a-flow-3.0.md, 3): in the plugin's steps the 2nd fill is on when both
// last, and a Pause without its 2nd Fill is dropped. In the generator's, a Pause decides it.
//
// A profile is A-Flow by its steps: their names in this order, and the values the generator
// writes for the parameters read from them. What 3.0 has not got is dropped and named: Pre
// Fill (the setting "first-step workaround" writes it again), ramp down (its time goes to the
// ramp up), a Pause without its 2nd Fill, and an infuse volume other than the 100 ml every step has.
import * as C from './constants';
import { generateSteps } from './generator';
import type { AFlowParams, ProfileStep } from './types';
import { validateParams, WIDEST_MACHINE_LIMITS } from './validate';

/** A step as Decaid returns it: the pump's own target, `null` where a field is unset. */
export interface StoredStep {
  name: string;
  pump: string;
  transition: string;
  exit?: { type: string; condition: string; value: number } | null;
  volume?: number | null;
  seconds?: number | null;
  weight?: number | null;
  temperature?: number | null;
  sensor?: string | null;
  flow?: number | null;
  pressure?: number | null;
  limiter?: { value: number; range: number } | null;
}

export interface StoredProfile {
  steps: readonly StoredStep[];
  target_weight?: number | null;
}

/** What reading leaves out, because 3.0 has not got it. */
export type Dropped = 'preFill' | 'rampDown' | 'pause' | 'infuseVolume';

export type StepsRead =
  | { ok: true; params: AFlowParams; dropped: Dropped[] }
  /** `aflow`: the step names are A-Flow's, so the values are what could not be read */
  | { ok: false; aflow: boolean; reason: string };

type Slot = keyof typeof C.STEP_NAME;

/** The steps every A-Flow profile has; the others may be missing or 0 s. */
const REQUIRED: readonly Slot[] = ['fill', 'infuse', 'rampUp', 'pouring'];
const ORDER = Object.keys(C.STEP_NAME) as Slot[];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** The slot of each step, by name and in order, or null when the names are not A-Flow's. */
function slotsOf(names: readonly string[]): Slot[] | null {
  const slots: Slot[] = [];
  let at = 0;
  for (const name of names) {
    while (at < ORDER.length && C.STEP_NAME[ORDER[at]] !== name) at++;
    if (at === ORDER.length) return null;
    slots.push(ORDER[at]);
    at++;
  }
  return REQUIRED.every((slot) => slots.includes(slot)) ? slots : null;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The step in the generator's form, or null when a value it needs is not a number. */
function normalize(step: StoredStep): ProfileStep | null {
  const target = step.pump === 'flow' ? step.flow : step.pressure;
  const { seconds, temperature, volume, limiter, exit } = step;
  const weight = step.weight ?? 0;
  if (step.pump !== 'flow' && step.pump !== 'pressure') return null;
  if (![target, seconds, temperature, volume, weight, limiter?.value, limiter?.range].every(isNumber)) return null;
  if (exit && !isNumber(exit.value)) return null;
  const base = {
    name: step.name,
    transition: step.transition as ProfileStep['transition'],
    ...(exit ? { exit: { ...exit } as ProfileStep['exit'] } : {}),
    volume: volume!,
    seconds: seconds!,
    weight,
    temperature: temperature!,
    sensor: step.sensor as ProfileStep['sensor'],
    limiter: { value: limiter!.value, range: limiter!.range },
  };
  return step.pump === 'flow' ? { ...base, pump: 'flow', flow: target! } : { ...base, pump: 'pressure', pressure: target! };
}

const targetOf = (step: ProfileStep) => (step.pump === 'flow' ? step.flow : step.pressure);

const near = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function sameStep(a: ProfileStep, b: ProfileStep): boolean {
  const exits =
    !a.exit || !b.exit
      ? !a.exit && !b.exit
      : a.exit.type === b.exit.type && a.exit.condition === b.exit.condition && near(a.exit.value, b.exit.value);
  return (
    exits &&
    a.name === b.name &&
    a.pump === b.pump &&
    a.transition === b.transition &&
    a.sensor === b.sensor &&
    near(targetOf(a), targetOf(b)) &&
    near(a.temperature, b.temperature) &&
    near(a.seconds, b.seconds) &&
    near(a.volume, b.volume) &&
    near(a.weight, b.weight) &&
    near(a.limiter.value, b.limiter.value) &&
    near(a.limiter.range, b.limiter.range)
  );
}

/** A value that follows another one is null where it equals it (resolveParams). */
const own = (value: number, followed: number): number | null => (near(value, followed) ? null : value);

const fail = (reason: string): StepsRead => ({ ok: false, aflow: true, reason });

/** Reads a profile's steps as A-Flow 3.0 parameters (see the top of this file). */
export function readSteps(profile: StoredProfile): StepsRead {
  const names = profile.steps.map((step) => step.name);
  const slots = slotsOf(names);
  if (!slots) {
    // A step of the user's own in front of the A-Flow steps ("Prewet", "Bloom"): A-Flow's by the
    // rest, but 3.0 has no step to put it in.
    if (names.length > 1 && slotsOf(names.slice(1))) {
      return fail(`its first step “${names[0]}” is not one of A-Flow's, and 3.0 has no step before Fill`);
    }
    return { ok: false, aflow: false, reason: 'its steps are not the A-Flow steps' };
  }

  const steps: Partial<Record<Slot, ProfileStep>> = {};
  for (const [index, stored] of profile.steps.entries()) {
    const step = normalize(stored);
    if (!step) return fail(`a value of “${stored.name}” is missing`);
    steps[slots[index]] = step;
  }
  // slotsOf found every step of REQUIRED.
  const [fill, infuse, rampUp, pouring] = REQUIRED.map((slot) => steps[slot]!);
  const { secondFill, pause, rampDown, pouringStart } = steps;
  const on = (step: ProfileStep | undefined): step is ProfileStep => !!step && step.seconds > 0;
  const hasRampDown = on(rampDown);
  const hasSecondFill = on(pause) && (!rampDown || on(secondFill));
  const strayPause = on(pause) && !hasSecondFill;
  // A 2nd Fill that lasts while no Pause follows it: 3.0 switches the two on together.
  if (on(secondFill) && !hasSecondFill) return fail('“2nd Fill” lasts, but no “Pause” follows it; 3.0 has the two on together');
  if (fill.exit?.type !== 'pressure' || fill.exit.condition !== 'over') return fail('“Fill” has no move-on pressure');
  if (rampUp.exit?.type !== 'flow' || rampUp.exit.condition !== 'over') return fail('“Pressure Up” has no move-on flow');

  // The plugin's reader takes the pour flow from Flow Start, which it always writes.
  const pourFlow = pouringStart ? targetOf(pouringStart) : hasRampDown ? round1(rampUp.exit.value / 2) : rampUp.exit.value;
  const end = targetOf(pouring);
  const followsToggle = near(end, round1(pourFlow * C.FLOW_UP_FACTOR)) || near(end, C.FLOW_DOWN_TARGET);
  const secondFillOn = hasSecondFill && secondFill ? secondFill : null;
  const params: AFlowParams = {
    dose: C.DOSE,
    fillFlow: targetOf(fill),
    fillExitPressure: fill.exit.value,
    fillTemperature: fill.temperature,
    fillTime: fill.seconds,
    infusePressure: targetOf(infuse),
    infuseTime: infuse.seconds,
    infuseWeight: infuse.weight,
    infuseTemperature: own(infuse.temperature, fill.temperature),
    infuseFlowLimit: infuse.limiter.value,
    // A 2nd fill that is off keeps the plugin's flow and move-on pressure for when it is on.
    secondFillFlow: secondFill ? targetOf(secondFill) : C.SECOND_FILL_FLOW,
    secondFillExitPressure: secondFill?.exit?.value ?? C.SECOND_FILL_EXIT_PRESSURE_OVER,
    secondFillTemperature: secondFillOn ? own(secondFillOn.temperature, infuse.temperature) : null,
    secondFillTime: secondFillOn ? secondFillOn.seconds : C.SECOND_FILL_SECONDS,
    pauseDuration: hasSecondFill ? pause.seconds : 0,
    pauseExitFlow: pause?.exit?.value ?? C.PAUSE_EXIT_FLOW_UNDER,
    pourPressure: targetOf(rampUp),
    rampTime: rampUp.seconds + (hasRampDown ? rampDown.seconds : 0),
    rampTemperature: own(rampUp.temperature, pouring.temperature),
    pourFlow,
    pourEndFlow: followsToggle ? null : end,
    pourTime: pouring.seconds,
    pourTemperature: pouring.temperature,
    stopWeight: profile.target_weight ?? 0,
    pourPressureLimit: own(pouring.limiter.value, targetOf(rampUp)),
    // An end flow of its own decides the toggle as the editor's setValue does.
    flowUp: followsToggle ? !near(end, C.FLOW_DOWN_TARGET) : end >= pourFlow,
  };
  const problem = validateParams(params, WIDEST_MACHINE_LIMITS)[0];
  if (problem) return fail(problem.message);

  // With ramp down the plugin's ramp up moves on at twice the pour flow.
  if (hasRampDown && !near(rampUp.exit.value, round1(pourFlow * 2))) {
    return fail('“Pressure Up” does not move on at twice the pour flow, as the plugin’s ramp down writes it');
  }
  const dropped: Dropped[] = [];
  if (on(steps.preFill)) dropped.push('preFill');
  if (hasRampDown) dropped.push('rampDown');
  if (strayPause) dropped.push('pause');
  if (!near(infuse.volume, C.STEP_VOLUME)) dropped.push('infuseVolume');

  // The steps as the generator would write them after the drops; they must be its steps.
  const kept: ProfileStep[] = [];
  for (const slot of slots) {
    const step = steps[slot]!;
    if (slot === 'preFill' || slot === 'pouringStart') {
      // With ramp down the generator decides Flow Start again, from the whole ramp time. A Pre
      // Fill is dropped and written again by the setting, at the fill temperature: its own is
      // not compared (a profile of the plugin has it at 95 °C with the fill at 93).
      if (step.seconds > 0 && !(slot === 'pouringStart' && hasRampDown)) {
        kept.push(slot === 'preFill' ? { ...step, temperature: params.fillTemperature } : step);
      }
    } else if (slot === 'infuse') kept.push({ ...step, volume: C.STEP_VOLUME });
    else if (slot === 'secondFill') {
      if (hasSecondFill || step.seconds > 0) kept.push(step);
    } else if (slot === 'pause') {
      if (hasSecondFill) kept.push(step);
    } else if (slot === 'rampUp') {
      kept.push(hasRampDown ? { ...step, seconds: params.rampTime, exit: { ...rampUp.exit, value: round1(pourFlow) } } : step);
    } else if (slot !== 'rampDown') kept.push(step);
  }
  const expected = generateSteps(params, dropped.includes('preFill')).filter(
    (step) => !(hasRampDown && step.name === C.STEP_NAME.pouringStart),
  );
  const differs = expected.findIndex((step, index) => !kept[index] || !sameStep(step, kept[index]));
  if (differs >= 0) return fail(`“${expected[differs].name}” is not what A-Flow writes for its values`);
  if (kept.length !== expected.length) return fail(`“${kept[expected.length].name}” is not a step A-Flow writes here`);
  return { ok: true, params, dropped };
}
