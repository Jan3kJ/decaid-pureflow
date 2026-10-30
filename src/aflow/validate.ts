import type { AFlowParams } from './types';

/**
 * The machine's maxima. The plugin reads them from de1app (`$::de1(maxpressure)` and
 * `$::de1(max_flowrate_v11)`); where the defaults below come from is in docs/a-flow-3.0.md.
 */
export interface MachineLimits {
  /** bar */
  maxPressure: number;
  /** ml/s */
  maxFlow: number;
}

// 12 bar is de1app's `set ::de1(maxpressure) 12` (de1plus/machine.tcl). The maximum flow is
// the skin's setting `maxFlow`, 8 ml/s by default: `machineLimits`.
export const DEFAULT_MACHINE_LIMITS: MachineLimits = { maxPressure: 12, maxFlow: 8 };

/** ml/s, what the setting `maxFlow` may be: de1app's `max_flowrate_v11` is 20. */
export const MAX_FLOW_RANGE = { min: 4, max: 20 } as const;

/** The machine's maxima with the maximum flow of the settings, held in `MAX_FLOW_RANGE`. */
export function machineLimits(maxFlow: number): MachineLimits {
  if (!Number.isFinite(maxFlow)) return DEFAULT_MACHINE_LIMITS;
  const held = Math.min(MAX_FLOW_RANGE.max, Math.max(MAX_FLOW_RANGE.min, maxFlow));
  return { ...DEFAULT_MACHINE_LIMITS, maxFlow: held };
}

/**
 * The widest maxima the setting allows: a profile is read with these, so one saved under a
 * higher maximum flow still opens after the setting was lowered.
 */
export const WIDEST_MACHINE_LIMITS: MachineLimits = machineLimits(MAX_FLOW_RANGE.max);

export const TEMPERATURE_MIN = 50;
export const TEMPERATURE_MAX = 105;
/** s; every time is the `seconds` of one profile step, and a step holds 127 s at most */
export const TIME_MAX = 127;
export const WEIGHT_MAX = 1000;
export const DOSE_MAX = 30;
export const DOSE_STEP = 0.1;
/** ml/s; the plugin's minimum for the pour flow, used here for every pump flow */
export const FLOW_MIN = 0.1;

/** A parameter that is always a number. */
export type NumberField = {
  [K in keyof AFlowParams]: AFlowParams[K] extends number ? K : never;
}[keyof AFlowParams];
/** A parameter that is a number or null; null follows another value (resolveParams). */
export type FollowField = {
  [K in keyof AFlowParams]: null extends AFlowParams[K] ? K : never;
}[keyof AFlowParams];
export type ToggleField = Exclude<keyof AFlowParams, NumberField | FollowField>;

export interface Range {
  min: number;
  max: number;
  unit: string;
  step?: number;
}

export interface Problem {
  field: keyof AFlowParams;
  code: 'not-a-number' | 'not-a-boolean' | 'below-min' | 'above-max' | 'off-step';
  message: string;
}

export const FOLLOW_FIELDS: readonly FollowField[] = [
  'infuseTemperature',
  'secondFillTemperature',
  'rampTemperature',
  'pourEndFlow',
  'pourPressureLimit',
];
export const TOGGLE_FIELDS: readonly ToggleField[] = ['flowUp'];

export function isFollowField(field: keyof AFlowParams): field is FollowField {
  return (FOLLOW_FIELDS as readonly string[]).includes(field);
}

/**
 * The range of every numeric parameter, for validation and for the editor's controls, in the
 * order of the phases. A value that follows another one has the range it has as a number.
 */
export function paramRanges(limits: MachineLimits = DEFAULT_MACHINE_LIMITS): Record<NumberField | FollowField, Range> {
  const temperature = { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX, unit: '°C' };
  const time = { min: 0, max: TIME_MAX, unit: 's' };
  const weight = { min: 0, max: WEIGHT_MAX, unit: 'g' };
  const flow = { min: FLOW_MIN, max: limits.maxFlow, unit: 'ml/s' };
  // A flow that may be 0: a limiter that is off, and the end of a pour with flow down.
  const flowFromZero = { min: 0, max: limits.maxFlow, unit: 'ml/s' };
  const pressure = { min: 0, max: limits.maxPressure, unit: 'bar' };
  return {
    dose: { min: 0, max: DOSE_MAX, unit: 'g', step: DOSE_STEP },
    fillFlow: flow,
    fillExitPressure: pressure,
    fillTemperature: temperature,
    fillTime: time,
    infusePressure: pressure,
    infuseTime: time,
    infuseWeight: weight,
    infuseTemperature: temperature,
    infuseFlowLimit: flowFromZero,
    secondFillFlow: flow,
    secondFillExitPressure: pressure,
    secondFillTemperature: temperature,
    secondFillTime: time,
    pauseDuration: time,
    pauseExitFlow: flow,
    pourPressure: pressure,
    rampTime: time,
    rampTemperature: temperature,
    pourFlow: flow,
    pourEndFlow: flowFromZero,
    pourTime: time,
    pourTemperature: temperature,
    stopWeight: weight,
    pourPressureLimit: pressure,
  };
}

function onStep(value: number, step: number): boolean {
  const steps = value / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** Returns the problems found; an empty list means the parameters are valid. */
export function validateParams(params: AFlowParams, limits: MachineLimits = DEFAULT_MACHINE_LIMITS): Problem[] {
  const problems: Problem[] = [];
  const ranges = paramRanges(limits);

  for (const field of Object.keys(ranges) as (NumberField | FollowField)[]) {
    const value: unknown = params[field];
    const { min, max, unit, step } = ranges[field];
    if (value === null && isFollowField(field)) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      problems.push({ field, code: 'not-a-number', message: `${field} is not a number` });
    } else if (value < min) {
      problems.push({ field, code: 'below-min', message: `${field} is below ${min} ${unit}` });
    } else if (value > max) {
      problems.push({ field, code: 'above-max', message: `${field} is above ${max} ${unit}` });
    } else if (step !== undefined && !onStep(value, step)) {
      problems.push({
        field,
        code: 'off-step',
        message: `${field} is not in steps of ${step} ${unit}`,
      });
    }
  }

  for (const field of TOGGLE_FIELDS) {
    const value: unknown = params[field];
    if (typeof value !== 'boolean') {
      problems.push({ field, code: 'not-a-boolean', message: `${field} is not true or false` });
    }
  }

  return problems;
}
