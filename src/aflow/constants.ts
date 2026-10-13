// Every fixed value of a generated profile, and the plugin's value of every parameter the
// plugin fixed and A-Flow 3.0 lets the user edit (marked "default of"), in one place.
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
/** s; default of `fillTime` */
export const FILL_SECONDS = 15;
/** bar */
export const FILL_PRESSURE_LIMIT = 8;
/** bar; default of `fillExitPressure`. It does not follow the infuse pressure */
export const FILL_EXIT_PRESSURE_OVER = 3;

// Infuse: pressure, fast, no exit (it ends on its seconds or its weight)
/** ml/s; default of `infuseFlowLimit` */
export const INFUSE_FLOW_LIMIT = 1;

// 2nd Fill: flow, fast
/** s; default of `secondFillTime` */
export const SECOND_FILL_SECONDS = 15;
/** bar */
export const SECOND_FILL_PRESSURE_LIMIT = 3;
/** bar; default of `secondFillExitPressure` */
export const SECOND_FILL_EXIT_PRESSURE_OVER = 2.5;

// Pause: pressure, fast. Its exit is the plugin's and is not editable: which value the
// founder wants there is an open question (docs/a-flow-3.0.md).
/** s; the `pauseDuration` a 2nd fill starts with when it is switched on */
export const PAUSE_SECONDS = 15;
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

// Flow Extraction: flow, smooth, no exit
/** s; default of `pourTime` */
export const POURING_SECONDS = 60;
/** flow up: while `pourEndFlow` is null the target is `pour flow * 2` */
export const FLOW_UP_FACTOR = 2;
/** flow down: while `pourEndFlow` is null the target is 0 */
export const FLOW_DOWN_TARGET = 0;

// Profile
export const PROFILE_VERSION = '2';
export const BEVERAGE_TYPE = 'espresso';
export const TANK_TEMPERATURE = 0;
/** ml; `final_desired_shot_volume_advanced 100` */
export const TARGET_VOLUME = 100;
/** `final_desired_shot_volume_advanced_count_start 2` */
export const TARGET_VOLUME_COUNT_START = 2;
