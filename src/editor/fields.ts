// What the editor needs to know about each value beyond the generator's ranges: its name on
// screen, the step it moves in, and which phase it belongs to (spec 3.2).
import {
  DEFAULT_MACHINE_LIMITS,
  DOSE_STEP,
  paramRanges,
  type MachineLimits,
  type NumberField,
} from '../aflow';
import type { PhaseId } from './curve';

export const FIELD_LABEL: Record<NumberField, string> = {
  dose: 'dose',
  fillFlow: 'fill flow',
  fillExitPressure: 'fill move-on pressure',
  fillTemperature: 'fill temperature',
  fillTime: 'fill time',
  infusePressure: 'infuse pressure',
  infuseTime: 'infuse time',
  infuseWeight: 'infuse weight',
  infuseFlowLimit: 'infuse flow limit',
  secondFillFlow: '2nd fill flow',
  secondFillExitPressure: '2nd fill move-on pressure',
  secondFillTime: '2nd fill time',
  pauseDuration: 'pause duration',
  pourPressure: 'pour pressure',
  rampTime: 'ramp time',
  pourFlow: 'pour flow',
  pourTime: 'pour time',
  pourTemperature: 'pour temperature',
  stopWeight: 'stop at weight',
};

/** The step of a drag and of a chip's plus and minus. */
export const FIELD_STEP: Record<NumberField, number> = {
  dose: DOSE_STEP,
  fillFlow: 0.1,
  fillExitPressure: 0.1,
  fillTemperature: 0.5,
  fillTime: 1,
  infusePressure: 0.1,
  infuseTime: 1,
  infuseWeight: 0.1,
  infuseFlowLimit: 0.1,
  secondFillFlow: 0.1,
  secondFillExitPressure: 0.1,
  secondFillTime: 1,
  pauseDuration: 1,
  pourPressure: 0.1,
  rampTime: 1,
  pourFlow: 0.1,
  pourTime: 1,
  pourTemperature: 0.5,
  stopWeight: 1,
};

/** Every editable value of a phase, in the order of the table in spec 3.2. Volume is left out. */
export const PHASE_FIELDS: Record<PhaseId, readonly NumberField[]> = {
  fill: ['fillFlow', 'fillTemperature'],
  infuse: ['infusePressure', 'infuseTime', 'infuseWeight'],
  secondFill: ['secondFillFlow', 'pauseDuration'],
  pressurize: ['pourPressure', 'rampTime'],
  flow: ['pourFlow', 'pourTemperature', 'stopWeight'],
};

/** Brings a value into the generator's range and onto the field's step. */
export function snap(
  field: NumberField,
  value: number,
  limits: MachineLimits = DEFAULT_MACHINE_LIMITS,
): number {
  const { min, max } = paramRanges(limits)[field];
  const step = FIELD_STEP[field];
  const stepped = Math.round(value / step) * step;
  // Steps are tenths at the finest: one decimal removes the float noise of the multiplication.
  const clean = Math.round(stepped * 10) / 10;
  return Math.min(max, Math.max(min, clean));
}

export function formatValue(
  field: NumberField,
  value: number,
  limits: MachineLimits = DEFAULT_MACHINE_LIMITS,
): string {
  const { unit } = paramRanges(limits)[field];
  const text = Number.isInteger(FIELD_STEP[field]) ? String(value) : value.toFixed(1);
  return `${text.replace(/\.0$/, '')} ${unit}`;
}
