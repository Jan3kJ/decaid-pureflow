import { describe, expect, it } from 'vitest';
import type { ShotSettings, Workflow } from '../api';
import { applySteamTimer, MACHINE_WAIT_MS, timerMismatch, type SteamTimerGateway } from './apply';

const SETTINGS: ShotSettings = {
  steamSetting: 0,
  targetSteamTemp: 150,
  targetSteamDuration: 50,
  targetHotWaterTemp: 75,
  targetHotWaterVolume: 50,
  targetHotWaterDuration: 30,
  targetShotVolume: 36,
  groupTemp: 94,
};

interface RigOptions {
  workflow?: number;
  /** null: the machine has not sent its settings */
  machine?: number | null;
  remembered?: unknown;
  store?: boolean;
  /** false: the machine takes no write */
  writable?: boolean;
}

/**
 * Decaid as the rig showed it (research.md, section 16): a workflow write reaches the machine
 * only when the workflow's duration changes; a shot-settings write reaches only the machine.
 */
function decaid(options: RigOptions = {}) {
  const calls: string[] = [];
  const writable = options.writable ?? true;
  let workflow = options.workflow ?? 50;
  let machine: ShotSettings | null =
    options.machine === null ? null : { ...SETTINGS, targetSteamDuration: options.machine ?? workflow };
  let remembered: unknown = options.remembered ?? null;
  let waited = 0;
  const gateway: SteamTimerGateway = {
    async setSteamDuration(seconds) {
      calls.push(`workflow ${seconds}`);
      if (writable && seconds !== workflow && machine) machine = { ...machine, targetSteamDuration: seconds };
      workflow = seconds;
      return { steamSettings: { targetTemperature: 150, duration: seconds, flow: 0.8 } } as Workflow;
    },
    async setShotSettings(settings) {
      calls.push(`machine ${JSON.stringify(settings)}`);
      if (writable) machine = settings;
    },
    async kvGet<T>() {
      if (options.store === false) throw new Error('no store');
      return remembered as T | null;
    },
    async kvSet(key, value, namespace) {
      calls.push(`kv ${namespace}/${key} ${JSON.stringify(value)}`);
      remembered = value;
    },
  };
  const apply = (seconds: number) =>
    applySteamTimer(
      gateway,
      seconds,
      () => machine,
      async (ms) => void (waited += ms),
    );
  return { apply, calls, waited: () => waited, remembered: () => remembered };
}

describe('setting the steam timer', () => {
  it('writes the workflow and finds the timer on the machine: one call', async () => {
    const rig = decaid({ workflow: 50 });
    const applied = await rig.apply(25);
    expect(rig.calls).toEqual(['workflow 25']);
    expect(applied.machine).toBe(25);
    expect(applied.workflow.steamSettings?.duration).toBe(25);
    expect(rig.waited()).toBe(0);
  });

  it('writes the machine directly when the workflow already had the duration and the machine another', async () => {
    // The founder's 25 s and 30 s: the workflow says 25, the machine runs 30.
    const rig = decaid({ workflow: 25, machine: 30 });
    const applied = await rig.apply(25);
    expect(rig.calls).toEqual(['workflow 25', `machine ${JSON.stringify({ ...SETTINGS, targetSteamDuration: 25 })}`]);
    expect(applied.machine).toBe(25);
    // It waited for the machine first, and not again once the direct write had arrived.
    expect(rig.waited()).toBe(MACHINE_WAIT_MS);
  });

  it("moves Streamline's remembered steam time first, so Streamline does not write its own back", async () => {
    const rig = decaid({ workflow: 30, remembered: 30 });
    await rig.apply(25);
    expect(rig.calls).toEqual(['kv streamline-app/last-steam-duration 25', 'workflow 25']);
  });

  it('never creates the remembered value, and leaves an equal one alone', async () => {
    for (const remembered of [null, 25, '30']) {
      const rig = decaid({ remembered });
      await rig.apply(25);
      expect(rig.calls).toEqual(['workflow 25']);
      expect(rig.remembered()).toBe(remembered);
    }
  });

  it('sets the timer without the store', async () => {
    const rig = decaid({ store: false });
    expect((await rig.apply(25)).machine).toBe(25);
  });

  it('writes only the workflow when the machine has not sent its settings', async () => {
    const rig = decaid({ machine: null });
    const applied = await rig.apply(25);
    expect(rig.calls).toEqual(['workflow 25']);
    expect(applied.machine).toBeNull();
    expect(rig.waited()).toBe(0);
  });

  it('reports the timer a machine kept that took neither write', async () => {
    const rig = decaid({ workflow: 50, machine: 30, writable: false });
    const applied = await rig.apply(25);
    expect(rig.calls).toHaveLength(2);
    expect(applied.machine).toBe(30);
    expect(rig.waited()).toBe(2 * MACHINE_WAIT_MS);
  });

  it('fails when the workflow write fails', async () => {
    const failing: SteamTimerGateway = {
      setSteamDuration: async () => {
        throw new Error('503');
      },
      setShotSettings: async () => {},
      kvGet: async () => null,
      kvSet: async () => {},
    };
    await expect(
      applySteamTimer(
        failing,
        25,
        () => SETTINGS,
        async () => {},
      ),
    ).rejects.toThrow('503');
  });
});

describe('the notice of a timer that is not the one set', () => {
  it('is nothing while they agree or one is not known', () => {
    expect(timerMismatch(25, 25)).toBeNull();
    expect(timerMismatch(null, 30)).toBeNull();
    expect(timerMismatch(25, null)).toBeNull();
  });

  it('names both values', () => {
    expect(timerMismatch(25, 30)).toContain("The machine's timer is 30 s, not the 25 s set here");
  });
});
