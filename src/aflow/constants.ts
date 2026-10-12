// Every value of a generated profile that is not an A-Flow parameter, in one place.
// Sources: `code.tcl` and `profiles/A-Flow____default-*.tcl` of Jan3kJ/A_Flow (read
// 2026-10-12), which agree with Decaid 0.8.8's `assets/defaultProfiles/A-Flow____default-*.json`
// in all of these. docs/a-flow-3.0.md lists them with their source.

/** Step names, as the plugin and Decaid's shipped profiles write them. */
export const STEP_NAME = {
  preFill: 'Pre Fill',
  fill: 'Fill',
  infuse: 'Infuse',
  secondFill: '2nd Fill',
  pause: 'Pause',
  rampUp: 'Pressure Up',
  pouringStart: 'Flow Start',
  pouring: 'Flow Extraction',
} as const;

// All steps
export const SENSOR = 'coffee';
/** ml; `volume 100` in every step */
export const STEP_VOLUME = 100;
/** `max_flow_or_pressure_range 0.6` in every step */
export const LIMITER_RANGE = 0.6;
/** A limiter value of 0 switches the limiter off. */
export const NO_LIMITER = 0;

// Pre Fill: flow, fast, no exit
/** ml/s */
export const PRE_FILL_FLOW = 8;
export const PRE_FILL_SECONDS = 1;
/** bar */
export const PRE_FILL_PRESSURE_LIMIT = 8;

// Fill: flow, fast
export const FILL_SECONDS = 15;
/** bar */
export const FILL_PRESSURE_LIMIT = 8;
/** bar; fixed in the plugin, it does not follow the infuse pressure */
export const FILL_EXIT_PRESSURE_OVER = 3;

// Infuse: pressure, fast, no exit (it ends on its seconds or its weight)
/** ml/s */
export const INFUSE_FLOW_LIMIT = 1;

// 2nd Fill: flow, fast
export const SECOND_FILL_SECONDS = 15;
/** bar */
export const SECOND_FILL_PRESSURE_LIMIT = 3;
/** bar */
export const SECOND_FILL_EXIT_PRESSURE_OVER = 2.5;

// Pause: pressure, fast
/** bar */
export const PAUSE_PRESSURE = 1;
/** ml/s */
export const PAUSE_FLOW_LIMIT = 1;
/** ml/s */
export const PAUSE_EXIT_FLOW_UNDER = 1;

// Pressure Up: pressure, smooth, no limiter, exits when the flow is over the pour flow

// Flow Start: flow, fast, no limiter; only when the ramp time is under RAMP_TIME_MIN
/** s; `if {$ramp_up(seconds) < 1}` */
export const RAMP_TIME_MIN = 1;
export const POURING_START_SECONDS = 10;
/** ml/s under the pour flow at which Flow Start exits */
export const POURING_START_EXIT_MARGIN = 0.1;

// Flow Extraction: flow, smooth, no exit, limited by the pour pressure
export const POURING_SECONDS = 60;
/** flow up: the target is `pour flow * 2` */
export const FLOW_UP_FACTOR = 2;
/** flow down: the target is 0 */
export const FLOW_DOWN_TARGET = 0;

// Profile
export const PROFILE_VERSION = '2';
export const BEVERAGE_TYPE = 'espresso';
export const TANK_TEMPERATURE = 0;
/** ml; `final_desired_shot_volume_advanced 100` */
export const TARGET_VOLUME = 100;
/** `final_desired_shot_volume_advanced_count_start 2` */
export const TARGET_VOLUME_COUNT_START = 2;
