// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/profile_editor.js (`pushChannel`, `renderScriptGraph`).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The step editor's curve preview as data (research.md 17.10): the profile's steps in, the
// targets over time out, as `ShotGraph` draws them. It is a schematic of the targets, not a
// simulation of a shot. Pure: no DOM and no Svelte.
//
// The drawn length of a step is Streamline's rule: its `seconds`, and 10 s when it has none.
// A step's volume, weight and exit do not change it, since how soon they end the step depends
// on the coffee; so a step that ends on volume or weight is drawn as long as its time, or 10 s.
import type { Profile } from '../api';
import { num } from './model';

/** The drawn length of a step without a time (Streamline's `renderScriptGraph`). */
export const UNTIMED_STEP_SECONDS = 10;

export interface StepSpan {
  /** s */
  start: number;
  end: number;
  /** the step has no time of its own: it is drawn UNTIMED_STEP_SECONDS long */
  untimed: boolean;
}

export interface StepCurve {
  /** s, two points per step: its start and its end */
  t: number[];
  /** bar; null where the step drives the flow */
  pressure: (number | null)[];
  /** ml/s; null where the step drives the pressure */
  flow: (number | null)[];
  /** °C */
  temperature: number[];
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

/** The targets of a profile over time, step after step. */
export function stepCurve(profile: Pick<Profile, 'steps'>): StepCurve {
  const t: number[] = [];
  const pressure: (number | null)[] = [];
  const flow: (number | null)[] = [];
  const temperature: number[] = [];
  const steps: StepSpan[] = [];
  let time = 0;
  // A pump the step does not drive counts as 0 for the next step's ramp, as in Streamline.
  let prevPressure = 0;
  let prevFlow = 0;
  for (const step of profile.steps ?? []) {
    const seconds = num(step.seconds);
    const untimed = !(seconds > 0);
    const start = time;
    const end = start + (untimed ? UNTIMED_STEP_SECONDS : seconds);
    if (step.pump === 'pressure') {
      const target = num(step.pressure);
      pushChannel(t, pressure, start, end, prevPressure, target, step.transition);
      flow.push(null, null);
      prevPressure = target;
      prevFlow = 0;
    } else {
      const target = num(step.flow);
      pushChannel(t, flow, start, end, prevFlow, target, step.transition);
      pressure.push(null, null);
      prevFlow = target;
      prevPressure = 0;
    }
    const degrees = num(step.temperature);
    temperature.push(degrees, degrees);
    steps.push({ start, end, untimed });
    time = end;
  }
  return { t, pressure, flow, temperature, steps, seconds: time };
}
