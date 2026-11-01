import type { Request } from '@playwright/test';
import type { HotWaterData, Profile, RinseData, SteamSettings, WaterLevels, Workflow, WorkflowContext } from '../src/api';

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

/** The tank, from the first frame of `/ws/v1/machine/waterLevels` (Decaid has no REST request for it). */
export function waterLevels(gateway: string): Promise<WaterLevels> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`${gateway.replace('http', 'ws')}/ws/v1/machine/waterLevels`);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('no frame from /ws/v1/machine/waterLevels in 10 s'));
    }, 10_000);
    socket.onmessage = (event) => {
      clearTimeout(timer);
      socket.close();
      resolve(JSON.parse(String(event.data)) as WaterLevels);
    };
  });
}
