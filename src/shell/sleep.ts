// Who asked for the machine's sleep (spec 3.10 'Home menu: two sleeps'). The menu's 'Machine
// sleep' puts only the machine to sleep: the app stays awake, without the Asleep screen and
// without dimming. 'Machine and app sleep', and every sleep the skin did not ask for (Decaid's
// timeout, presence, the machine's button), shows the Asleep screen. Neither touches Decaid's
// wake lock or `keepAwake`. Not stored: a reload while the machine sleeps shows the Asleep screen.
import type { MachineState } from '../api';

export interface SleepMark {
  /** 'Machine sleep' was asked for; the next sleeping frame takes it */
  asked: boolean;
  /** the machine sleeps by 'Machine sleep': the app stays awake */
  machineOnly: boolean;
}

export const AWAKE: SleepMark = { asked: false, machineOnly: false };

/** 'Machine sleep' is about to ask for `sleeping`; 'Machine and app sleep' clears the ask. */
export function askSleep(machineOnly: boolean): SleepMark {
  return { asked: machineOnly, machineOnly: false };
}

/** The mark after a machine frame: a sleep takes the ask, a wake clears everything. */
export function followSleep(mark: SleepMark, before: MachineState | undefined, state: MachineState): SleepMark {
  if (state === 'sleeping' && before !== 'sleeping') return { asked: false, machineOnly: mark.asked };
  if (state !== 'sleeping' && before === 'sleeping') return AWAKE;
  return mark;
}
