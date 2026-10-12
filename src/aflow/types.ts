// A-Flow 3.0 parameters (spec 3.2) and the Decaid v2 profile the generator writes.

export const AFLOW_VERSION = '3.0';

/** The editable values of spec 3.2 and its two toggles. */
export interface AFlowParams {
  /** g. Not part of the profile: it travels in the workflow context (`targetDoseWeight`). */
  dose: number;
  /** ml/s */
  fillFlow: number;
  /** °C, used by Pre Fill, Fill, Infuse, 2nd Fill and Pause */
  fillTemperature: number;
  /** bar */
  infusePressure: number;
  /** s */
  infuseTime: number;
  /** g */
  infuseWeight: number;
  /** toggle: 2nd fill and its pause */
  secondFill: boolean;
  /** ml/s */
  secondFillFlow: number;
  /** s */
  pauseDuration: number;
  /** bar */
  pourPressure: number;
  /** s */
  rampTime: number;
  /** ml/s */
  pourFlow: number;
  /** °C, used by Pressure Up, Flow Start and Flow Extraction */
  pourTemperature: number;
  /** g */
  stopWeight: number;
  /** toggle: true is flow up, false is flow down */
  flowUp: boolean;
}

export interface GenerateOptions {
  title: string;
  author?: string;
  notes?: string;
  /** The setting "first-step workaround" (spec 3.2): adds the Pre Fill step. Off by default. */
  firstStepWorkaround?: boolean;
}

export interface StepExit {
  type: 'pressure' | 'flow';
  condition: 'over' | 'under';
  value: number;
}

interface StepBase {
  name: string;
  transition: 'fast' | 'smooth';
  exit?: StepExit;
  volume: number;
  seconds: number;
  weight: number;
  temperature: number;
  sensor: 'coffee' | 'water';
  limiter: { value: number; range: number };
}

export interface FlowStep extends StepBase {
  pump: 'flow';
  flow: number;
}

export interface PressureStep extends StepBase {
  pump: 'pressure';
  pressure: number;
}

export type ProfileStep = FlowStep | PressureStep;

/** A Decaid v2 profile as `POST /api/v1/profiles` takes it: numbers, not strings. */
export interface Profile {
  version: '2';
  title: string;
  author: string;
  notes: string;
  beverage_type: 'espresso';
  steps: ProfileStep[];
  tank_temperature: number;
  target_weight: number;
  target_volume: number;
  target_volume_count_start: number;
}
