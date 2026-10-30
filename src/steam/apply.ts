// Setting the steam timer so that the machine has it. The workflow's
// `steamSettings.duration` is not the machine's timer: Decaid writes it to the machine only
// when it differs from the workflow's old value, and another client can change either of
// them. So the timer is written, and then the machine's own value is read. No UI: the
// gateway, the machine's latest settings and the clock are parameters.
import type { ShotSettings, Workflow } from '../api';

/**
 * Where Streamline, Decaid's default skin, remembers the steam time its user set (KV store).
 * While a Streamline page is open anywhere, version 0.2.13 writes this value back over every
 * other timer it sees on the machine. The skin moves the remembered value with its own, so
 * both agree; it never creates the key.
 */
export const STREAMLINE_NAMESPACE = 'streamline-app';
export const STREAMLINE_STEAM_KEY = 'last-steam-duration';

/** How long the machine's settings may take to show a write, in ms. */
export const MACHINE_WAIT_MS = 2000;
const STEP_MS = 100;

/** What `applySteamTimer` needs of the client. */
export interface SteamTimerGateway {
  setSteamDuration(seconds: number): Promise<Workflow>;
  setShotSettings(settings: ShotSettings): Promise<void>;
  kvGet<T = unknown>(key: string, namespace?: string): Promise<T | null>;
  kvSet(key: string, value: unknown, namespace?: string): Promise<void>;
}

export interface AppliedSteamTimer {
  workflow: Workflow;
  /** the machine's timer afterwards, in s; null when its settings are not known */
  machine: number | null;
}

/**
 * Writes the timer and waits until the machine has it.
 * 1. Streamline's remembered steam time, if it has one, becomes this one.
 * 2. The workflow gets the duration; Decaid passes a changed one on to the machine.
 * 3. If the machine's settings do not show it, they are written directly: that is the case
 *    of a workflow that already had the duration while the machine had another.
 * `machine` returns the latest frame of `/ws/v1/machine/shotSettings`.
 */
export async function applySteamTimer(
  gateway: SteamTimerGateway,
  seconds: number,
  machine: () => ShotSettings | null,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<AppliedSteamTimer> {
  try {
    const remembered = await gateway.kvGet(STREAMLINE_STEAM_KEY, STREAMLINE_NAMESPACE);
    if (typeof remembered === 'number' && remembered !== seconds) {
      await gateway.kvSet(STREAMLINE_STEAM_KEY, seconds, STREAMLINE_NAMESPACE);
    }
  } catch {
    // Without the store the timer is still written; the page shows what the machine has.
  }
  const workflow = await gateway.setSteamDuration(seconds);

  const arrived = async () => {
    for (let waited = 0; waited < MACHINE_WAIT_MS && !hasTimer(machine(), seconds); waited += STEP_MS) {
      await sleep(STEP_MS);
    }
    return hasTimer(machine(), seconds);
  };
  if (!(await arrived())) {
    const settings = machine();
    if (settings) {
      await gateway.setShotSettings({ ...settings, targetSteamDuration: seconds });
      await arrived();
    }
  }
  return { workflow, machine: machine()?.targetSteamDuration ?? null };
}

function hasTimer(settings: ShotSettings | null, seconds: number): boolean {
  // A machine whose settings are not known cannot be waited for.
  return settings === null || settings.targetSteamDuration === seconds;
}

/**
 * What the page says when the machine's timer is not the one set here, or null. Another
 * client changed it afterwards, or the machine did not take it.
 */
export function timerMismatch(asked: number | null, machine: number | null): string | null {
  if (asked === null || machine === null || asked === machine) return null;
  return `The machine's timer is ${machine} s, not the ${asked} s set here: another app changed it. Set it again.`;
}
