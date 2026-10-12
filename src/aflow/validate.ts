import type { AFlowParams } from './types';

/** The machine's maxima. The plugin reads them from de1app (`maxpressure`, `max_flowrate_v11`). */
export interface MachineLimits {
  /** bar */
  maxPressure: number;
  /** ml/s */
  maxFlow: number;
}

export const DEFAULT_MACHINE_LIMITS: MachineLimits = { maxPressure: 12, maxFlow: 8 };

export const TEMPERATURE_MIN = 80;
export const TEMPERATURE_MAX = 105;
export const TIME_MAX = 1000;
export const WEIGHT_MAX = 1000;
export const DOSE_MAX = 30;
export const DOSE_STEP = 0.1;
/** ml/s; the plugin's minimum for the pour flow, used here for every flow */
export const FLOW_MIN = 0.1;

export type NumberField = {
  [K in keyof AFlowParams]: AFlowParams[K] extends number ? K : never;
}[keyof AFlowParams];
export type ToggleField = Exclude<keyof AFlowParams, NumberField>;

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

export const TOGGLE_FIELDS: readonly ToggleField[] = ['secondFill', 'flowUp'];

/** The range of every numeric parameter, for validation and for the editor's controls. */
export function paramRanges(
  limits: MachineLimits = DEFAULT_MACHINE_LIMITS,
): Record<NumberField, Range> {
  const temperature = { min: TEMPERATURE_MIN, max: TEMPERATURE_MAX, unit: '°C' };
  const time = { min: 0, max: TIME_MAX, unit: 's' };
  const weight = { min: 0, max: WEIGHT_MAX, unit: 'g' };
  const flow = { min: FLOW_MIN, max: limits.maxFlow, unit: 'ml/s' };
  const pressure = { min: 0, max: limits.maxPressure, unit: 'bar' };
  return {
    dose: { min: 0, max: DOSE_MAX, unit: 'g', step: DOSE_STEP },
    fillFlow: flow,
    fillTemperature: temperature,
    infusePressure: pressure,
    infuseTime: time,
    infuseWeight: weight,
    secondFillFlow: flow,
    pauseDuration: time,
    pourPressure: pressure,
    rampTime: time,
    pourFlow: flow,
    pourTemperature: temperature,
    stopWeight: weight,
  };
}

function onStep(value: number, step: number): boolean {
  const steps = value / step;
  return Math.abs(steps - Math.round(steps)) < 1e-6;
}

/** Returns the problems found; an empty list means the parameters are valid. */
export function validateParams(
  params: AFlowParams,
  limits: MachineLimits = DEFAULT_MACHINE_LIMITS,
): Problem[] {
  const problems: Problem[] = [];
  const ranges = paramRanges(limits);

  for (const field of Object.keys(ranges) as NumberField[]) {
    const value: unknown = params[field];
    const { min, max, unit, step } = ranges[field];
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
