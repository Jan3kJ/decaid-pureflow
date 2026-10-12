// The plugin's five default profiles, converted to A-Flow 3.0 parameters. They start from
// the plugin's .tcl files, not from Decaid's copies: see docs/a-flow-3.0.md.
import type { AFlowParams } from '../types';
import dark from './default-dark.json';
import light from './default-light.json';
import likeDflow from './default-like-dflow.json';
import medium from './default-medium.json';
import veryDark from './default-very-dark.json';

export interface DefaultProfile {
  id: string;
  title: string;
  params: AFlowParams;
}

export const DEFAULT_AUTHOR = 'Janek';
export const DEFAULT_NOTES = 'A-Flow: an alternative profile for D-Flow';

export const DEFAULT_PROFILES: readonly DefaultProfile[] = [
  { id: 'default-light', title: 'A-Flow / default-light', params: light },
  { id: 'default-medium', title: 'A-Flow / default-medium', params: medium },
  { id: 'default-dark', title: 'A-Flow / default-dark', params: dark },
  { id: 'default-very-dark', title: 'A-Flow / default-very-dark', params: veryDark },
  { id: 'default-like-dflow', title: 'A-Flow / default-like-dflow', params: likeDflow },
];
