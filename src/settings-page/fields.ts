// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/settings.js and src/settings/categories/quick-adjustments.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// Every gateway setting of the settings page (spec 3.7 'Settings', research.md 20.3): where it
// is read and written, its range and its wording. One definition per setting: the page and the
// tests read them here. Streamline's ranges and labels, not its code. No UI.
import type { AdvancedSettings, DecaidInfo } from '../api';
import { HOT_WATER_FIELDS, type HotWaterField } from '../hotwater/hot-water';
import { STEAM_ON_MAX, STEAM_ON_MIN } from '../shell/steam-heater';

/**
 * Where a setting lives. `decaid`: `/api/v1/settings`; `machine`: `/api/v1/machine/settings`;
 * `advanced`: `/api/v1/machine/settings/advanced`; `workflow.*`: a group of the workflow;
 * `waterLevels`: written with `POST /api/v1/machine/waterLevels`, read on its stream;
 * `display`: `/api/v1/display`; `info`: `/api/v1/info`, read only; `presence`:
 * `/api/v1/presence/settings`.
 */
export type Source =
  | 'decaid'
  | 'machine'
  | 'advanced'
  | 'workflow.steamSettings'
  | 'workflow.hotWaterData'
  | 'workflow.rinseData'
  | 'waterLevels'
  | 'display'
  | 'info'
  | 'presence';

interface Common {
  /** the name in the tests: `setting-<id>` */
  id: string;
  label: string;
  hint?: string;
  source: Source;
  /** the field in the source's object */
  key: string;
  /** asked before a write: what it does (research.md 20.9) */
  confirm?: string;
}

export interface NumberField extends Common {
  kind: 'number';
  unit: string;
  min: number;
  max: number;
  step: number;
  /** places after the point, 0 to 2 */
  places: number;
  /** written for a value under `min`: the steam heater's off, 0 */
  off?: number;
}

export interface Choice {
  value: string | number;
  label: string;
}

export interface ChoiceField extends Common {
  kind: 'choice';
  options: Choice[];
}

export interface SwitchField extends Common {
  kind: 'switch';
  /** written for on and off where the source does not take a boolean (the USB charger) */
  written?: { on: string; off: string };
}

/** Minutes since midnight, shown and typed as hh:mm. */
export interface TimeField extends Common {
  kind: 'time';
}

/** Read only. */
export interface InfoField extends Common {
  kind: 'info';
  format?: (raw: unknown, all: Record<string, unknown>) => string | null;
}

export type Field = NumberField | ChoiceField | SwitchField | TimeField | InfoField;

const number = (field: Omit<NumberField, 'kind'>): NumberField => ({ kind: 'number', ...field });

/** A value of the hot water page (R5), on this page too: one range for both (research.md 20.9). */
function hotWater(key: HotWaterField['key'], label: string, hint: string): NumberField {
  const field = HOT_WATER_FIELDS.find((entry) => entry.key === key)!;
  return number({
    id: `hot-water-${field.id}`,
    label,
    hint,
    source: 'workflow.hotWaterData',
    key,
    unit: field.unit,
    min: field.min,
    max: field.max,
    step: field.decimals ? 0.1 : 1,
    places: field.decimals ? 1 : 0,
  });
}

const STREAMLINE_PUTS_BACK =
  'Streamline puts back a machine value it recorded on its own settings page when that page is opened again.';

// --- 1. Quick Adjustments ---

export const FLOW_CALIBRATION: Field[] = [
  number({
    id: 'weight-flow-multiplier',
    label: 'weight flow multiplier',
    hint: 'Applied to the weight flow for the projected weight when a shot stops by weight. Default 1.0; higher stops earlier.',
    source: 'decaid',
    key: 'weightFlowMultiplier',
    unit: '',
    min: 0,
    max: 5,
    step: 0.1,
    places: 1,
  }),
  number({
    id: 'volume-flow-multiplier',
    label: 'volume flow multiplier',
    hint: 'Seconds of machine flow added to the projected volume when a shot stops by volume. Default 0.3.',
    source: 'decaid',
    key: 'volumeFlowMultiplier',
    unit: 's',
    min: 0,
    max: 2,
    step: 0.05,
    places: 2,
  }),
];

export const STEAM_TEMPERATURE: NumberField = number({
  id: 'steam-temperature',
  label: 'steam temperature',
  hint: `0 turns the steam heater off, as the menu's steam off does; under ${STEAM_ON_MIN} °C is off too.`,
  source: 'workflow.steamSettings',
  key: 'targetTemperature',
  unit: '°C',
  min: STEAM_ON_MIN,
  max: STEAM_ON_MAX,
  step: 1,
  places: 0,
  off: 0,
});

export const STEAM: Field[] = [
  STEAM_TEMPERATURE,
  number({
    id: 'steam-flow',
    label: 'steam flow',
    hint: 'How much steam the wand gives.',
    source: 'workflow.steamSettings',
    key: 'flow',
    unit: 'ml/s',
    min: 0.4,
    max: 2.5,
    step: 0.1,
    places: 1,
  }),
  {
    kind: 'choice',
    id: 'steam-purge-mode',
    label: 'steam purge mode',
    hint: 'Two tap stop: the first tap stops steam, the second purges.',
    source: 'machine',
    key: 'steamPurgeMode',
    options: [
      { value: 0, label: 'Normal' },
      { value: 1, label: 'Two Tap Stop' },
    ],
  },
];

export const HOT_WATER: Field[] = [
  hotWater('targetTemperature', 'temperature', 'The hot water page has these four values too.'),
  hotWater('volume', 'volume', 'ml; with a scale and stop at weight on, grams.'),
  hotWater('duration', 'duration', 'The machine stops at this time at the latest.'),
  hotWater('flow', 'flow', ''),
  {
    kind: 'switch',
    id: 'stop-hot-water-at-weight',
    label: 'stop at weight',
    hint: 'With a scale, Decaid tares it and stops hot water at the volume in grams.',
    source: 'decaid',
    key: 'stopHotWaterAtWeight',
  },
  number({
    id: 'hot-water-flow-multiplier',
    label: 'flow multiplier',
    hint: 'Seconds of look-ahead for the stop at weight. Default 0.3.',
    source: 'decaid',
    key: 'hotWaterFlowMultiplier',
    unit: 's',
    min: 0,
    max: 2,
    step: 0.05,
    places: 2,
  }),
];

export const WATER_TANK: Field[] = [
  number({
    id: 'tank-temperature',
    label: 'tank temperature',
    hint: STREAMLINE_PUTS_BACK,
    source: 'machine',
    key: 'tankTemp',
    unit: '°C',
    min: 10,
    max: 40,
    step: 1,
    places: 0,
  }),
  number({
    id: 'water-alert',
    label: 'water level alert',
    hint: 'The tank level at which the machine asks for water, in steps of 5 mm. Default 15.',
    source: 'waterLevels',
    key: 'refillLevel',
    unit: 'mm',
    min: 0,
    max: 30,
    step: 5,
    places: 0,
  }),
];

/**
 * The flush (founder, 2026-10-17: "I want to configure flow and time for flush"). The
 * workflow's `rinseData`: Decaid writes all three to the machine (`flushTemp`, `flushFlow`,
 * `flushTimeout`) whenever it changes, so the machine's own values follow it (research.md 20.12).
 */
export const FLUSH: Field[] = [
  number({
    id: 'flush-temperature',
    label: 'flush temperature',
    source: 'workflow.rinseData',
    key: 'targetTemperature',
    unit: '°C',
    min: 5,
    max: 95,
    step: 1,
    places: 0,
  }),
  number({
    id: 'flush-flow',
    label: 'flush flow',
    source: 'workflow.rinseData',
    key: 'flow',
    unit: 'ml/s',
    min: 1,
    max: 8,
    step: 0.1,
    places: 1,
  }),
  number({
    id: 'flush-duration',
    label: 'flush duration',
    hint: 'The machine ends a flush after this time; the ring on home counts it down.',
    source: 'workflow.rinseData',
    key: 'duration',
    unit: 's',
    min: 1,
    max: 120,
    step: 1,
    places: 0,
  }),
];

export const MACHINE_ADVANCED: Field[] = [
  number({
    id: 'heater-idle-temperature',
    label: 'idle temperature',
    hint: 'The heater keeps this temperature while idle.',
    source: 'advanced',
    key: 'heaterIdleTemp',
    unit: '°C',
    min: 0,
    max: 99,
    step: 1,
    places: 0,
  }),
  number({
    id: 'heater-warmup-flow',
    label: 'heater warmup flow',
    source: 'advanced',
    key: 'heaterPh1Flow',
    unit: 'ml/s',
    min: 0,
    max: 10,
    step: 0.1,
    places: 1,
  }),
  number({
    id: 'heater-test-flow',
    label: 'heater test flow',
    source: 'advanced',
    key: 'heaterPh2Flow',
    unit: 'ml/s',
    min: 0,
    max: 10,
    step: 0.1,
    places: 1,
  }),
  number({
    id: 'heater-test-timeout',
    label: 'heater test time-out',
    hint: 'How long the machine tries to steady the temperature.',
    source: 'advanced',
    key: 'heaterPh2Timeout',
    unit: 's',
    min: 0,
    max: 60,
    step: 1,
    places: 0,
  }),
];

/** Streamline's Fast Start Defaults, insight-js's cafe preset: one write of the four above. */
export const FAST_START: Partial<AdvancedSettings> = {
  heaterIdleTemp: 99,
  heaterPh1Flow: 2,
  heaterPh2Flow: 4,
  heaterPh2Timeout: 1,
};

// --- 3. Calibration ---

export const REFILL_KIT: Field[] = [
  {
    kind: 'choice',
    id: 'refill-kit',
    label: 'refill kit',
    hint: 'Auto lets the machine decide. Force on keeps the refill kit always active. Force off disables it.',
    source: 'advanced',
    key: 'refillKitSetting',
    options: [
      { value: 2, label: 'Auto-Detect' },
      { value: 1, label: 'Force On' },
      { value: 0, label: 'Force Off' },
    ],
  },
];

export const VOLTAGE: Field[] = [
  {
    kind: 'choice',
    id: 'heater-voltage',
    label: 'voltage',
    hint: 'Your mains voltage. Restart the machine after a change for it to take effect.',
    source: 'advanced',
    key: 'heaterVoltage',
    options: [
      { value: 120, label: '110V' },
      { value: 230, label: '220V' },
    ],
    confirm: 'A wrong voltage affects how the machine heats. The change takes effect after a restart of the machine.',
  },
];

export const FAN: Field[] = [
  number({
    id: 'fan-threshold',
    label: 'fan threshold',
    hint: `The temperature from which the fan runs. ${STREAMLINE_PUTS_BACK}`,
    source: 'machine',
    key: 'fan',
    unit: '°C',
    min: 0,
    max: 50,
    step: 1,
    places: 0,
  }),
];

// --- 4. Machine ---

export const USB: Field[] = [
  {
    kind: 'switch',
    id: 'usb-charger',
    label: 'USB charger',
    hint: "The machine's USB port charges the tablet.",
    source: 'machine',
    key: 'usb',
    written: { on: 'enable', off: 'disable' },
  },
  {
    kind: 'choice',
    id: 'charging-mode',
    label: 'charging mode',
    hint: "Decaid's smart charging of the tablet.",
    source: 'decaid',
    key: 'chargingMode',
    options: [
      { value: 'disabled', label: 'Charge to 100%' },
      { value: 'highAvailability', label: 'Charge to 95%' },
      { value: 'balanced', label: 'Up to 80%' },
      { value: 'longevity', label: 'Up to 55%' },
    ],
  },
  {
    kind: 'switch',
    id: 'night-mode',
    label: 'night mode',
    hint: 'Charge conservatively overnight between a sleep and a morning time; with a charging mode under 100%.',
    source: 'decaid',
    key: 'nightModeEnabled',
  },
  { kind: 'time', id: 'night-mode-sleep', label: 'night mode: sleep', source: 'decaid', key: 'nightModeSleepTime' },
  { kind: 'time', id: 'night-mode-morning', label: 'night mode: morning', source: 'decaid', key: 'nightModeMorningTime' },
  {
    kind: 'switch',
    id: 'low-battery-brightness',
    label: 'dim on low battery',
    hint: 'Dim the screen when the battery is low.',
    source: 'decaid',
    key: 'lowBatteryBrightnessLimit',
  },
];

// --- 2. Connections ---

/** The scale's settings under its device list (Streamline's 'Scale' page). */
export const SCALE: Field[] = [
  {
    kind: 'choice',
    id: 'scale-power-mode',
    label: 'scale power mode',
    hint: 'What the scale does while the machine sleeps.',
    source: 'decaid',
    key: 'scalePowerMode',
    options: [
      { value: 'disabled', label: 'Nothing' },
      { value: 'displayOff', label: 'Display off' },
      { value: 'disconnect', label: 'Disconnect' },
    ],
  },
  {
    kind: 'switch',
    id: 'block-on-no-scale',
    label: 'scale required',
    hint: 'A shot does not start while no scale is connected.',
    source: 'decaid',
    key: 'blockOnNoScale',
  },
];

/** The device Decaid connects by itself when it finds it; written by the device lists' switches (`Devices.svelte`). */
export const PREFERRED_DEVICES: InfoField[] = [
  { kind: 'info', id: 'preferred-machine', label: 'preferred machine', source: 'decaid', key: 'preferredMachineId' },
  { kind: 'info', id: 'preferred-scale', label: 'preferred scale', source: 'decaid', key: 'preferredScaleId' },
];

// --- 9. Miscellaneous ---

export const DECAID_SETTINGS: Field[] = [
  {
    kind: 'choice',
    id: 'gateway-mode',
    label: 'gateway mode',
    hint: 'Tracking: Decaid controls the shot (stop at weight). Disabled: it does not. Full: a skin controls it, which this skin does not.',
    source: 'decaid',
    key: 'gatewayMode',
    options: [
      { value: 'disabled', label: 'Disabled' },
      { value: 'tracking', label: 'Tracking' },
      { value: 'full', label: 'Full' },
    ],
    confirm:
      "Disabled stops Decaid's stop at weight for shots and hot water; Full hands the shot to a skin, and this skin does not run one.",
  },
  {
    kind: 'choice',
    id: 'log-level',
    label: 'log level',
    source: 'decaid',
    key: 'logLevel',
    options: ['ALL', 'FINEST', 'FINER', 'FINE', 'CONFIG', 'INFO', 'WARNING', 'SEVERE', 'SHOUT', 'OFF'].map((value) => ({
      value,
      label: value,
    })),
  },
  {
    kind: 'switch',
    id: 'automatic-update-check',
    label: 'automatic update checks',
    source: 'decaid',
    key: 'automaticUpdateCheck',
  },
  {
    kind: 'info',
    id: 'decaid-version',
    label: 'Decaid version',
    source: 'info',
    key: 'version',
    format: (raw, all) => {
      const { buildNumber } = all as DecaidInfo;
      return typeof raw === 'string' ? `${raw}${buildNumber ? ` (${buildNumber})` : ''}` : null;
    },
  },
  { kind: 'info', id: 'web-ui-path', label: 'web UI path', source: 'decaid', key: 'webUiPath' },
];

export const BRIGHTNESS: Field[] = [
  number({
    id: 'brightness',
    label: 'brightness',
    hint: "100 hands the screen's brightness back to the system. The skin dims to 5 while it shows the Asleep screen.",
    source: 'display',
    key: 'requestedBrightness',
    unit: '',
    min: 0,
    max: 100,
    step: 1,
    places: 0,
  }),
];

/** Presence Detection (S2c); its wake schedules are `Presence.svelte`. */
export const PRESENCE: Field[] = [
  {
    kind: 'switch',
    id: 'presence-enabled',
    label: 'presence detection',
    hint: 'Track use of the machine and the tablet to put the machine to sleep automatically.',
    source: 'presence',
    key: 'userPresenceEnabled',
  },
  number({
    id: 'sleep-timeout',
    label: 'sleep after',
    hint: 'Minutes without use before the machine goes to sleep.',
    source: 'presence',
    key: 'sleepTimeoutMinutes',
    unit: 'min',
    min: 1,
    max: 120,
    step: 1,
    places: 0,
  }),
];

export const WAKE_LOCK: Field[] = [
  {
    kind: 'switch',
    id: 'wake-lock',
    label: 'keep the screen on',
    source: 'display',
    key: 'wakeLockOverride',
  },
];

/** The value shown for a raw one: the voltage's committed marker above 1000 is read minus 1000 (Streamline). */
export function shownValue(field: Field, raw: unknown): unknown {
  if (field.id === 'heater-voltage' && typeof raw === 'number' && raw > 1000) return raw - 1000;
  return raw;
}

/** A typed number as it is written: on the field's step, in its range; under the range its `off`. */
export function heldNumber(field: NumberField, value: number): number {
  if (field.off !== undefined && value < field.min) return field.off;
  const stepped = Math.round(value / field.step) * field.step;
  const held = Math.min(field.max, Math.max(field.min, stepped));
  return Number(held.toFixed(field.places));
}

/** The lowest value the number pad takes: the `off` value of a field that has one. */
export const padMin = (field: NumberField): number => field.off ?? field.min;

/** hh:mm of minutes since midnight. */
export function clock(minutes: number): string {
  const day = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(day / 60)).padStart(2, '0')}:${String(day % 60).padStart(2, '0')}`;
}

/** Minutes since midnight of a time typed as hhmm (2215 for 22:15); null for one that is not a time. */
export function minutesOf(typed: number): number | null {
  if (!Number.isInteger(typed) || typed < 0) return null;
  const hours = Math.floor(typed / 100);
  const minutes = typed % 100;
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** The text a number field shows. */
export function numberText(field: NumberField, value: number): string {
  return value.toFixed(field.places);
}
