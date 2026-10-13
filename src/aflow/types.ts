// A-Flow 3.0 parameters (spec 3.2) and the Decaid v2 profile the generator writes.

export const AFLOW_VERSION = '3.0';

/**
 * The editable values of spec 3.2 and the toggle flow up / flow down, phase by phase.
 *
 * A value that is `number | null` follows another one while it is null (resolveParams says
 * which); a number makes it its own. The 2nd fill has no toggle of its own: it is on when
 * `pauseDuration` is over 0 (hasSecondFill).
 */
export interface AFlowParams {
  /** g. Not part of the profile: it travels in the workflow context (`targetDoseWeight`). */
  dose: number;

  // Fill
  /** ml/s */
  fillFlow: number;
  /** bar; the Fill step moves on when the pressure is over it */
  fillExitPressure: number;
  /** °C, used by Pre Fill and Fill */
  fillTemperature: number;
  /** s; the longest the Fill step lasts */
  fillTime: number;

  // Infuse
  /** bar */
  infusePressure: number;
  /** s */
  infuseTime: number;
  /** g; the Infuse step moves on at this weight */
  infuseWeight: number;
  /** °C; null follows the fill temperature */
  infuseTemperature: number | null;
  /** ml/s; the Infuse step's flow limiter, 0 is off */
  infuseFlowLimit: number;

  // 2nd fill and its pause
  /** ml/s */
  secondFillFlow: number;
  /** bar; the 2nd Fill step moves on when the pressure is over it */
  secondFillExitPressure: number;
  /** °C, used by 2nd Fill and Pause; null follows the infuse temperature */
  secondFillTemperature: number | null;
  /** s; the longest the 2nd Fill step lasts */
  secondFillTime: number;
  /** s; the longest the Pause step lasts. 0 switches the 2nd fill and its pause off */
  pauseDuration: number;

  // Pressurize
  /** bar; the target of Pressure Up */
  pourPressure: number;
  /** s */
  rampTime: number;
  /** °C, used by Pressure Up; null follows the pour temperature */
  rampTemperature: number | null;

  // Flow
  /** ml/s; the flow the pour starts with */
  pourFlow: number;
  /**
   * ml/s; the flow gradient, as the flow the Flow Extraction step moves to over `pourTime`.
   * null follows the toggle `flowUp`: 2 x pour flow (up) or 0 (down)
   */
  pourEndFlow: number | null;
  /** s; the longest the Flow Extraction step lasts */
  pourTime: number;
  /** °C, used by Flow Start and Flow Extraction */
  pourTemperature: number;
  /** g */
  stopWeight: number;
  /** bar; the Flow Extraction step's pressure limiter, 0 is off; null follows the pour pressure */
  pourPressureLimit: number | null;

  /** toggle: true is flow up, false is flow down. It only acts while `pourEndFlow` is null */
  flowUp: boolean;
}

/** The parameters with every followed value filled in. */
export type ResolvedParams = { [K in keyof AFlowParams]: NonNullable<AFlowParams[K]> };

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
