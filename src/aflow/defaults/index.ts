// The five default profiles as A-Flow 3.0 parameters (founder, 2026-10-12). light, medium and
// dark are the plugin's .tcl files; floral is new and 46mm is the plugin's very-dark with
// other values: see docs/a-flow-3.0.md.
import * as C from '../constants';
import type { AFlowParams } from '../types';
import mm46 from './default-46mm.json' with { type: 'json' };
import dark from './default-dark.json' with { type: 'json' };
import floral from './default-floral.json' with { type: 'json' };
import light from './default-light.json' with { type: 'json' };
import medium from './default-medium.json' with { type: 'json' };

export interface DefaultProfile {
  id: string;
  title: string;
  params: AFlowParams;
}

export const DEFAULT_AUTHOR = 'Janek';
export const DEFAULT_NOTES = 'A-Flow: an alternative profile for D-Flow';

/**
 * The values only detail mode edits, as every default profile has them: the plugin's fixed
 * numbers, and null where a value follows another one. A profile with these generates the
 * steps the plugin's logic does.
 */
export const DETAIL_DEFAULTS = {
  fillExitPressure: C.FILL_EXIT_PRESSURE_OVER,
  fillTime: C.FILL_SECONDS,
  infuseTemperature: null,
  infuseFlowLimit: C.INFUSE_FLOW_LIMIT,
  secondFillExitPressure: C.SECOND_FILL_EXIT_PRESSURE_OVER,
  secondFillTemperature: null,
  secondFillTime: C.SECOND_FILL_SECONDS,
  pauseExitFlow: C.PAUSE_EXIT_FLOW_UNDER,
  rampTemperature: null,
  pourEndFlow: null,
  pourTime: C.POURING_SECONDS,
  pourPressureLimit: null,
} as const satisfies Partial<AFlowParams>;

export const DEFAULT_PROFILES: readonly DefaultProfile[] = [
  { id: 'default-floral', title: 'A-Flow / default-floral', params: floral },
  { id: 'default-light', title: 'A-Flow / default-light', params: light },
  { id: 'default-medium', title: 'A-Flow / default-medium', params: medium },
  { id: 'default-dark', title: 'A-Flow / default-dark', params: dark },
  { id: 'default-46mm', title: 'A-Flow / default-46mm', params: mm46 },
];
