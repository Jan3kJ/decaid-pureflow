import type { Request } from '@playwright/test';
import type { HotWaterData, Profile, RinseData, SteamSettings, Workflow, WorkflowContext } from '../src/api';

/** The workflow as the rig's Decaid answers it: every part is there. */
export type RigWorkflow = Workflow & {
  profile: Profile;
  context: WorkflowContext;
  steamSettings: SteamSettings;
  hotWaterData: HotWaterData;
  rinseData: RinseData;
};

/**
 * A request of the page to the gateway that changes something: not a read, a preflight, or the
 * heartbeat a touch sends.
 */
export function isWrite(request: Request, gateway: string): boolean {
  const method = request.method();
  if (!request.url().startsWith(gateway) || method === 'GET' || method === 'OPTIONS') return false;
  return new URL(request.url()).pathname !== '/api/v1/machine/heartbeat';
}
