// The steam heater's switch of home's menu. Decaid has no request of
// its own for it: the workflow's `steamSettings.targetTemperature` is the heater, 0 is off, and
// Decaid writes anything below 135 °C to the machine as 0. The machine's own `targetSteamTemp`
// says which state the heater is in. No UI: the gateway and the machine's settings are parameters.
import type { ShotSettings, Workflow } from '../api';
import { MACHINE_WAIT_MS } from '../steam/apply';

/** °C, the lowest steam temperature Decaid treats as on (`SteamSettings`, rest_v1.yml) */
export const STEAM_ON_MIN = 135;
/** °C, the highest, a Bengle's; a DE1 goes to 160 */
export const STEAM_ON_MAX = 165;
const STEP_MS = 100;

export type HeaterState = 'on' | 'off';

/**
 * The heater's state: the machine's own target, else the workflow's while the machine's
 * settings are not known; null when neither is.
 */
export function heaterState(machine: ShotSettings | null, workflow: Workflow | null): HeaterState | null {
  if (machine) return machine.targetSteamTemp > 0 ? 'on' : 'off';
  const target = workflow?.steamSettings?.targetTemperature;
  if (typeof target !== 'number') return null;
  return target >= STEAM_ON_MIN ? 'on' : 'off';
}

/** A temperature the heater can be switched on with. */
export function isOnTemperature(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= STEAM_ON_MIN && (value as number) <= STEAM_ON_MAX;
}

/** What `switchHeater` needs of the client. */
export interface HeaterGateway {
  updateWorkflow(patch: { steamSettings: { targetTemperature: number } }): Promise<Workflow>;
  setShotSettings(settings: ShotSettings): Promise<void>;
}

/**
 * Switches the heater: off writes 0, on writes `temperature`. Decaid passes a value on to the
 * machine only when it differs from the workflow's old one, so when the
 * machine's settings do not show the change after a moment they are written directly.
 * `machine` returns the latest frame of `/ws/v1/machine/shotSettings`.
 */
export async function switchHeater(
  gateway: HeaterGateway,
  on: boolean,
  temperature: number,
  machine: () => ShotSettings | null,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<Workflow> {
  const target = on ? temperature : 0;
  const workflow = await gateway.updateWorkflow({ steamSettings: { targetTemperature: target } });
  const arrived = () => {
    const settings = machine();
    return settings === null || settings.targetSteamTemp === target;
  };
  for (let waited = 0; waited < MACHINE_WAIT_MS && !arrived(); waited += STEP_MS) await sleep(STEP_MS);
  const settings = machine();
  if (!arrived() && settings) await gateway.setShotSettings({ ...settings, targetSteamTemp: target });
  return workflow;
}
