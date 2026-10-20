// Test data, written by hand from Jan3kJ/A_Flow (read 2026-10-12): proc update_A-Flow in
// code.tcl and the files in profiles/. Nothing here is computed by the generator or
// taken from its constants.
//
// Only the 3.0 defaults that still equal a plugin file are regression cases: light, medium
// and dark. default-floral has no plugin file (it is new in 3.0), and default-46mm is the
// plugin's default-very-dark with a pour pressure, a ramp time and a flow direction the
// founder changed on 2026-10-12, so the plugin never wrote either. Their expected steps are
// fixtures in generator.test.ts.
//
// Each list is what the plugin writes for that default profile with ramp down off, the
// 2nd fill off and Pre Fill present, in the form Decaid's API returns a profile in:
// numbers, only the pump's own target (flow or pressure), and an exit only where the
// plugin's exit_if is 1. The steps the plugin switches off by setting 0 seconds (2nd Fill,
// Pause, Pressure Decline, and Flow Start when the ramp is 1 s or longer) are left out.
import type { ProfileStep } from './types';

const light: ProfileStep[] = [
  {
    name: 'Pre Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 95,
    seconds: 1,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 95,
    seconds: 15,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'pressure', condition: 'over', value: 3 },
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Infuse',
    pump: 'pressure',
    transition: 'fast',
    pressure: 3,
    temperature: 95,
    seconds: 60,
    volume: 100,
    weight: 6,
    sensor: 'coffee',
    limiter: { value: 1, range: 0.6 },
  },
  {
    name: 'Pressure Up',
    pump: 'pressure',
    transition: 'smooth',
    pressure: 9.5,
    temperature: 95,
    seconds: 10,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'flow', condition: 'over', value: 3 },
    limiter: { value: 0, range: 0.6 },
  },
  {
    name: 'Flow Extraction',
    pump: 'flow',
    transition: 'smooth',
    flow: 6,
    temperature: 95,
    seconds: 60,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 9.5, range: 0.6 },
  },
];

const medium: ProfileStep[] = [
  {
    name: 'Pre Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 93,
    seconds: 1,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 93,
    seconds: 15,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'pressure', condition: 'over', value: 3 },
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Infuse',
    pump: 'pressure',
    transition: 'fast',
    pressure: 3,
    temperature: 93,
    seconds: 60,
    volume: 100,
    weight: 3.6,
    sensor: 'coffee',
    limiter: { value: 1, range: 0.6 },
  },
  {
    name: 'Pressure Up',
    pump: 'pressure',
    transition: 'smooth',
    pressure: 10,
    temperature: 93,
    seconds: 10,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'flow', condition: 'over', value: 2 },
    limiter: { value: 0, range: 0.6 },
  },
  {
    name: 'Flow Extraction',
    pump: 'flow',
    transition: 'smooth',
    flow: 4,
    temperature: 93,
    seconds: 60,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 10, range: 0.6 },
  },
];

// Flow down: the plugin sets the Flow Extraction target to 0.
const dark: ProfileStep[] = [
  {
    name: 'Pre Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 93,
    seconds: 1,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 93,
    seconds: 15,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'pressure', condition: 'over', value: 3 },
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Infuse',
    pump: 'pressure',
    transition: 'fast',
    pressure: 3,
    temperature: 93,
    seconds: 10,
    volume: 100,
    weight: 2,
    sensor: 'coffee',
    limiter: { value: 1, range: 0.6 },
  },
  {
    name: 'Pressure Up',
    pump: 'pressure',
    transition: 'smooth',
    pressure: 9,
    temperature: 88,
    seconds: 5,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'flow', condition: 'over', value: 2 },
    limiter: { value: 0, range: 0.6 },
  },
  {
    name: 'Flow Extraction',
    pump: 'flow',
    transition: 'smooth',
    flow: 0,
    temperature: 88,
    seconds: 60,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 9, range: 0.6 },
  },
];

// The plugin's default-like-dflow file. It is no longer a 3.0 default (founder, 2026-10-12),
// but it is the plugin's one file with ramp 0 s: Pressure Up stays with 0 seconds, and Flow
// Start is on (10 s, exit flow over pour flow - 0.1).
export const PLUGIN_LIKE_DFLOW_STEPS: ProfileStep[] = [
  {
    name: 'Pre Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 93,
    seconds: 1,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Fill',
    pump: 'flow',
    transition: 'fast',
    flow: 8,
    temperature: 93,
    seconds: 15,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'pressure', condition: 'over', value: 3 },
    limiter: { value: 8, range: 0.6 },
  },
  {
    name: 'Infuse',
    pump: 'pressure',
    transition: 'fast',
    pressure: 3,
    temperature: 93,
    seconds: 60,
    volume: 100,
    weight: 4,
    sensor: 'coffee',
    limiter: { value: 1, range: 0.6 },
  },
  {
    name: 'Pressure Up',
    pump: 'pressure',
    transition: 'smooth',
    pressure: 10,
    temperature: 93,
    seconds: 0,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'flow', condition: 'over', value: 2 },
    limiter: { value: 0, range: 0.6 },
  },
  {
    name: 'Flow Start',
    pump: 'flow',
    transition: 'fast',
    flow: 2,
    temperature: 93,
    seconds: 10,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    exit: { type: 'flow', condition: 'over', value: 1.9 },
    limiter: { value: 0, range: 0.6 },
  },
  {
    name: 'Flow Extraction',
    pump: 'flow',
    transition: 'smooth',
    flow: 4,
    temperature: 93,
    seconds: 60,
    volume: 100,
    weight: 0,
    sensor: 'coffee',
    limiter: { value: 10, range: 0.6 },
  },
];

export const PLUGIN_STEPS: Record<string, ProfileStep[]> = {
  'default-light': light,
  'default-medium': medium,
  'default-dark': dark,
};

/** `final_desired_shot_weight_advanced` of each file, the weight the plugin's editor sets. */
export const PLUGIN_STOP_WEIGHT: Record<string, number> = {
  'default-light': 48,
  'default-medium': 42,
  'default-dark': 36,
};

/**
 * The two steps the plugin adds between Infuse and Pressure Up with the 2nd fill on: both
 * 15 s, both at the pour temperature (`set 2nd_fill(temperature) $::Aflow_pouring_temperature`).
 */
export function pluginSecondFill(pourTemperature: number): ProfileStep[] {
  return [
    {
      name: '2nd Fill',
      pump: 'flow',
      transition: 'fast',
      flow: 8,
      temperature: pourTemperature,
      seconds: 15,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'pressure', condition: 'over', value: 2.5 },
      limiter: { value: 3, range: 0.6 },
    },
    {
      name: 'Pause',
      pump: 'pressure',
      transition: 'fast',
      pressure: 1,
      temperature: pourTemperature,
      seconds: 15,
      volume: 100,
      weight: 0,
      sensor: 'coffee',
      exit: { type: 'flow', condition: 'under', value: 1 },
      limiter: { value: 1, range: 0.6 },
    },
  ];
}
