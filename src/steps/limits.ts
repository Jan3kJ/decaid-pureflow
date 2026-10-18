// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/profile-field-limits.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The step editor's ranges, in one place (research.md 17.6): every value a step card edits,
// with the step of its ± buttons. A value outside its range that a profile brings is shown
// and kept; ± and the number pad move only inside the range.

export interface Limit {
  min: number;
  max: number;
  /** the step of ± */
  step: number;
  unit: string;
}

export const FIELD_LIMITS = {
  temperature: { min: 0, max: 105, step: 0.5, unit: '°C' },
  flow: { min: 0, max: 15, step: 0.1, unit: 'ml/s' },
  pressure: { min: 0, max: 12, step: 0.1, unit: 'bar' },
  /** the flow limit of a pressure step */
  flowLimit: { min: 0, max: 8, step: 0.1, unit: 'ml/s' },
  /** the pressure limit of a flow step */
  pressureLimit: { min: 0, max: 12, step: 0.1, unit: 'bar' },
  weight: { min: 0, max: 500, step: 1, unit: 'g' },
  // 127 is the protocol's limit: a step's length goes to the machine as F8_1_7.
  seconds: { min: 0, max: 127, step: 1, unit: 's' },
  volume: { min: 0, max: 500, step: 1, unit: 'ml' },
} satisfies Record<string, Limit>;

export type LimitField = keyof typeof FIELD_LIMITS;

/** Decaid takes no other exit type; off is `exit: null`. */
export const EXIT_UNIT_MAP = { pressure: 'bar', flow: 'ml/s' } as const;
export const EXIT_STEP_MAP = { pressure: 0.1, flow: 0.1 } as const;
/** An exit stops the step, it does not drive the pump: its ceilings are lower than the targets'. */
export const EXIT_MAX_MAP = { pressure: 12, flow: 8 } as const;

/** A limiter's softness when the profile has no limiter to take it from. */
export const DEFAULT_LIMITER_RANGE = 0.6;

/** The profile's own values in the SETTINGS tab (Streamline's `renderSettingsTab`). */
export const SETTING_LIMITS = {
  /** the scale stops the shot here; 0 is off */
  target_weight: { min: 0, max: 1000, step: 0.1, unit: 'g' },
  /** the flow meter stops the shot here; 0 is off */
  target_volume: { min: 0, max: 500, step: 1, unit: 'ml' },
  /** the water tank is heated to this before the shot; 0 is off */
  tank_temperature: { min: 0, max: 110, step: 1, unit: '°C' },
} satisfies Record<string, Limit>;

export type SettingField = keyof typeof SETTING_LIMITS;
