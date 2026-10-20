// What the editor needs to know about each value beyond the generator's ranges: its name on
// screen, the step it moves in, and which phase it belongs to (spec 3.2).
import { DEFAULT_MACHINE_LIMITS, DOSE_STEP, paramRanges, type MachineLimits } from '../aflow';
import type { EditField, LineId, PhaseId } from './curve';

/** The full name of a value, for the pop-up of a drag and the number pad. */
export const FIELD_LABEL: Record<EditField, string> = {
  dose: 'dose',
  fillFlow: 'fill flow',
  fillExitPressure: 'fill move-on pressure',
  fillTemperature: 'fill temperature',
  fillTime: 'fill time',
  infusePressure: 'infuse pressure',
  infuseTime: 'infuse time',
  infuseWeight: 'infuse move-on weight',
  infuseTemperature: 'infuse temperature',
  infuseFlowLimit: 'infuse flow limit',
  secondFillFlow: '2nd fill flow',
  secondFillExitPressure: '2nd fill move-on pressure',
  secondFillTemperature: '2nd fill temperature',
  secondFillTime: '2nd fill time',
  pauseDuration: 'pause time',
  pauseExitFlow: 'pause ends at flow under',
  pourPressure: 'target pressure',
  rampTime: 'pressurize time',
  rampTemperature: 'pressurize temperature',
  pourFlow: 'start flow',
  pourEndFlow: 'end flow',
  pourTime: 'flow time',
  pourTemperature: 'flow temperature',
  stopWeight: 'stop at weight',
  pourPressureLimit: 'max. pressure',
};

/** The name of a value in the detail panel, under the heading of its phase. */
export const PANEL_LABEL: Record<EditField, string> = {
  dose: 'dose',
  fillFlow: 'flow',
  fillExitPressure: 'move-on pressure',
  fillTemperature: 'temperature',
  fillTime: 'time',
  infusePressure: 'pressure',
  infuseTime: 'time',
  infuseWeight: 'move-on weight',
  infuseTemperature: 'temperature',
  infuseFlowLimit: 'flow limit',
  secondFillFlow: 'flow',
  secondFillExitPressure: 'move-on pressure',
  secondFillTemperature: 'temperature',
  secondFillTime: 'fill time',
  pauseDuration: 'pause time',
  pauseExitFlow: 'pause ends at flow under',
  pourPressure: 'target pressure',
  rampTime: 'time',
  rampTemperature: 'temperature',
  pourFlow: 'start flow',
  pourEndFlow: 'end flow',
  pourTime: 'time',
  pourTemperature: 'temperature',
  stopWeight: 'stop at weight',
  pourPressureLimit: 'max. pressure',
};

/** The step of a drag and of a chip's plus and minus. */
export const FIELD_STEP: Record<EditField, number> = {
  dose: DOSE_STEP,
  fillFlow: 0.1,
  fillExitPressure: 0.1,
  fillTemperature: 0.5,
  fillTime: 1,
  infusePressure: 0.1,
  infuseTime: 1,
  infuseWeight: 0.1,
  infuseTemperature: 0.5,
  infuseFlowLimit: 0.1,
  secondFillFlow: 0.1,
  secondFillExitPressure: 0.1,
  secondFillTemperature: 0.5,
  secondFillTime: 1,
  pauseDuration: 1,
  pauseExitFlow: 0.1,
  pourPressure: 0.1,
  rampTime: 1,
  rampTemperature: 0.5,
  pourFlow: 0.1,
  pourEndFlow: 0.1,
  pourTime: 1,
  pourTemperature: 0.5,
  stopWeight: 1,
  pourPressureLimit: 0.1,
};

/** The colour of a value: flow, pressure or temperature; times and weights have none. */
export const FIELD_TONE: Partial<Record<EditField, LineId>> = {
  fillFlow: 'flow',
  infuseFlowLimit: 'flow',
  secondFillFlow: 'flow',
  pauseExitFlow: 'flow',
  pourFlow: 'flow',
  pourEndFlow: 'flow',
  fillExitPressure: 'pressure',
  infusePressure: 'pressure',
  secondFillExitPressure: 'pressure',
  pourPressure: 'pressure',
  pourPressureLimit: 'pressure',
  fillTemperature: 'temperature',
  infuseTemperature: 'temperature',
  secondFillTemperature: 'temperature',
  rampTemperature: 'temperature',
  pourTemperature: 'temperature',
};

/**
 * The values of each phase in the detail panel, in the order of the founder's list 'values to
 * be changable' (review of 2026-10-12). Its 'move on pressure pause' is `pauseExitFlow`, the
 * flow the pause ends under (founder, 2026-10-13). Dose is a value of the shot.
 */
export const PHASE_FIELDS: Record<PhaseId, readonly EditField[]> = {
  fill: ['fillFlow', 'fillExitPressure', 'fillTemperature', 'fillTime'],
  infuse: ['infusePressure', 'infuseTime', 'infuseWeight', 'infuseTemperature', 'infuseFlowLimit'],
  secondFill: [
    'secondFillFlow',
    'secondFillExitPressure',
    'secondFillTemperature',
    'secondFillTime',
    'pauseDuration',
    'pauseExitFlow',
  ],
  pressurize: ['pourPressure', 'rampTime', 'rampTemperature'],
  flow: ['pourFlow', 'pourEndFlow', 'pourTime', 'pourTemperature', 'stopWeight', 'pourPressureLimit'],
};

/** A typed value is kept as typed: whole where the field steps in whole numbers, else tenths. */
export function typedStep(field: EditField): number {
  return Number.isInteger(FIELD_STEP[field]) ? 1 : 0.1;
}

/** Brings a value into the generator's range and onto a step, the field's own by default. */
export function snap(
  field: EditField,
  value: number,
  limits: MachineLimits = DEFAULT_MACHINE_LIMITS,
  step: number = FIELD_STEP[field],
): number {
  const { min, max } = paramRanges(limits)[field];
  const stepped = Math.round(value / step) * step;
  // Steps are tenths at the finest: one decimal removes the float noise of the multiplication.
  const clean = Math.round(stepped * 10) / 10;
  return Math.min(max, Math.max(min, clean));
}

export function formatValue(field: EditField, value: number, limits: MachineLimits = DEFAULT_MACHINE_LIMITS): string {
  const { unit } = paramRanges(limits)[field];
  const text = Number.isInteger(FIELD_STEP[field]) ? String(value) : value.toFixed(1);
  return `${text.replace(/\.0$/, '')} ${unit}`;
}
