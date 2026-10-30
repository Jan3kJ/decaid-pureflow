// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/profile_editor.js (`pushChannel`, `renderScriptGraph`).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The step editor's curve preview as data: the profile's steps in, the
// targets over time out, as `ShotGraph` draws them. It is a schematic of the targets, not a
// simulation of a shot. Pure: no DOM and no Svelte.
//
// The drawn length of a step is its `seconds`. A step's volume, weight and exit do not change
// it, since how soon they end the step depends on the coffee. A step of 0 s is not drawn at
// all: the machine passes it at once (the de1app A-Flow editor switches a step off so), so it
// adds no point, no gap and no border, and the next step ramps from the target before it.
// Streamline draws such a step 10 s long and shaded; the skin departs from it here.
//
// A smooth step ramps from where the step before left its quantity. After a step of the same
// pump that is its target. After a step of the other pump it is that step's exit when the exit
// is on this step's quantity (an A-Flow Ramp Up ends on 'flow over' the pour flow, so the pour
// starts there), else that step's limit on it, else 0 as in Streamline.
//
// A step's limit (`limiter`: a flow step's pressure, a pressure step's flow) is a series of its
// own, the limit's value across the step and null where a step has none.
import type { Profile, ProfileStep, StepExit } from '../api';
import { num } from './model';

export interface StepSpan {
  /** the step's place in the profile */
  index: number;
  /** s */
  start: number;
  end: number;
}

export interface StepCurve {
  /** s, two points per drawn step: its start and its end */
  t: number[];
  /** bar; null where the step drives the flow */
  pressure: (number | null)[];
  /** ml/s; null where the step drives the pressure */
  flow: (number | null)[];
  /** °C */
  temperature: number[];
  /** bar, a flow step's pressure limit; null where a step has none */
  pressureLimit: (number | null)[];
  /** ml/s, a pressure step's flow limit; null where a step has none */
  flowLimit: (number | null)[];
  /** the drawn steps: those longer than 0 s */
  steps: StepSpan[];
  /** s, the end of the last step */
  seconds: number;
}

/**
 * One step of one target: `fast` jumps to the target at the step's start and holds it,
 * `smooth` ramps from the previous step's target to this one over the whole step (the
 * firmware's interpolate flag).
 */
export function pushChannel(
  x: number[],
  y: (number | null)[],
  startT: number,
  endT: number,
  prevVal: number,
  target: number,
  transition: string | undefined,
): void {
  x.push(startT, endT);
  y.push(transition === 'smooth' ? prevVal : target, target);
}

export interface CurveOptions {
  /** s, the last step is drawn this far at most, its ramp cut where it is then (the A-Flow editor's pour) */
  lastStepSeconds?: number;
}

/** A step's limit, or null for none (`limiter` null or 0). */
function limitOf(step: ProfileStep): number | null {
  const value = num(step.limiter?.value);
  return value > 0 ? value : null;
}

/** Where a step leaves the quantity of the pump it does not drive: its exit on it, else its limit, else 0. */
function leftAt(step: ProfileStep, quantity: StepExit['type']): number {
  if (step.exit?.type === quantity) return num(step.exit.value);
  return limitOf(step) ?? 0;
}

/** The targets of a profile over time, step after step; a step of 0 s is left out. */
export function stepCurve(profile: Pick<Profile, 'steps'>, options: CurveOptions = {}): StepCurve {
  const t: number[] = [];
  const pressure: (number | null)[] = [];
  const flow: (number | null)[] = [];
  const temperature: number[] = [];
  const pressureLimit: (number | null)[] = [];
  const flowLimit: (number | null)[] = [];
  const steps: StepSpan[] = [];
  const drawn = [...(profile.steps ?? []).entries()].filter(([, step]) => num(step.seconds) > 0);
  let time = 0;
  let prevPressure = 0;
  let prevFlow = 0;
  for (const [i, [index, step]] of drawn.entries()) {
    const seconds = num(step.seconds);
    const shown =
      i === drawn.length - 1 && options.lastStepSeconds !== undefined ? Math.min(seconds, options.lastStepSeconds) : seconds;
    const start = time;
    const end = start + shown;
    // A ramp cut short ends where it is at the cut.
    const reached = (from: number, target: number) =>
      step.transition === 'smooth' ? from + ((target - from) * shown) / seconds : target;
    const limit = limitOf(step);
    if (step.pump === 'pressure') {
      const target = num(step.pressure);
      pushChannel(t, pressure, start, end, prevPressure, reached(prevPressure, target), step.transition);
      flow.push(null, null);
      pressureLimit.push(null, null);
      flowLimit.push(limit, limit);
      prevPressure = target;
      prevFlow = leftAt(step, 'flow');
    } else {
      const target = num(step.flow);
      pushChannel(t, flow, start, end, prevFlow, reached(prevFlow, target), step.transition);
      pressure.push(null, null);
      pressureLimit.push(limit, limit);
      flowLimit.push(null, null);
      prevFlow = target;
      prevPressure = leftAt(step, 'pressure');
    }
    const degrees = num(step.temperature);
    temperature.push(degrees, degrees);
    steps.push({ index, start, end });
    time = end;
  }
  return { t, pressure, flow, temperature, pressureLimit, flowLimit, steps, seconds: time };
}
