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
// The drawn length of a step is its `seconds`. A step's volume, weight and exit do not change
// it, since how soon they end the step depends on the coffee. A step of 0 s is not drawn at
// all: the machine passes it at once (the de1app A-Flow editor switches a step off so), so it
// adds no point, no gap and no border, and the next step ramps from the target before it.
// Streamline draws such a step 10 s long and shaded; the skin departs from it here.
import type { Profile } from '../api';
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

/** The targets of a profile over time, step after step; a step of 0 s is left out. */
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
  for (const [index, step] of (profile.steps ?? []).entries()) {
    const seconds = num(step.seconds);
    if (!(seconds > 0)) continue;
    const start = time;
    const end = start + seconds;
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
    steps.push({ index, start, end });
    time = end;
  }
  return { t, pressure, flow, temperature, steps, seconds: time };
}
