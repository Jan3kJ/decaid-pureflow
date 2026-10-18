import { describe, expect, it } from 'vitest';
import type { ShotSettings, Workflow } from '../api';
import { DEFAULT_STEAM_SETTINGS, readSettings } from '../settings';
import { heaterState, isOnTemperature, switchHeater, type HeaterGateway } from './steam-heater';

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

const workflowWith = (targetTemperature: number) =>
  ({ steamSettings: { targetTemperature, duration: 50, flow: 0.8 } }) as Workflow;

/**
 * Decaid as the rig showed it (research.md 22): a workflow write reaches the machine when the
 * temperature changes, a value below 135 °C as 0; a shot-settings write reaches only the machine.
 */
function decaid(options: { workflow?: number; machine?: number | null; writable?: boolean } = {}) {
  const calls: string[] = [];
  const writable = options.writable ?? true;
  let workflow = options.workflow ?? 150;
  let machine: ShotSettings | null =
    options.machine === null ? null : { ...SETTINGS, targetSteamTemp: options.machine ?? workflow };
  let waited = 0;
  const gateway: HeaterGateway = {
    async updateWorkflow(patch) {
      const target = patch.steamSettings.targetTemperature;
      calls.push(`workflow ${target}`);
      if (writable && target !== workflow && machine) machine = { ...machine, targetSteamTemp: target < 135 ? 0 : target };
      workflow = target;
      return workflowWith(target);
    },
    async setShotSettings(settings) {
      calls.push(`machine ${settings.targetSteamTemp}`);
      if (writable) machine = settings;
    },
  };
  const run = (on: boolean, temperature = 150) =>
    switchHeater(gateway, on, temperature, () => machine, async (ms) => {
      waited += ms;
    });
  return { calls, run, machine: () => machine, waited: () => waited };
}

describe('heaterState', () => {
  it('reads the machine’s own target: 0 is off', () => {
    expect(heaterState({ ...SETTINGS, targetSteamTemp: 0 }, workflowWith(150))).toBe('off');
    expect(heaterState(SETTINGS, workflowWith(0))).toBe('on');
  });

  it('reads the workflow while the machine’s settings are not known; below 135 °C is off', () => {
    expect(heaterState(null, workflowWith(150))).toBe('on');
    expect(heaterState(null, workflowWith(100))).toBe('off');
    expect(heaterState(null, workflowWith(0))).toBe('off');
  });

  it('is not known without either', () => {
    expect(heaterState(null, null)).toBeNull();
    expect(heaterState(null, {} as Workflow)).toBeNull();
  });
});

describe('switchHeater', () => {
  it('off writes 0 to the workflow, and the machine follows', async () => {
    const rig = decaid();
    const workflow = await rig.run(false);
    expect(rig.calls).toEqual(['workflow 0']);
    expect(workflow.steamSettings?.targetTemperature).toBe(0);
    expect(rig.machine()?.targetSteamTemp).toBe(0);
    expect(rig.waited()).toBe(0);
  });

  it('on writes the temperature again', async () => {
    const rig = decaid({ workflow: 0 });
    await rig.run(true, 155);
    expect(rig.calls).toEqual(['workflow 155']);
    expect(rig.machine()?.targetSteamTemp).toBe(155);
  });

  it('writes the machine directly when the workflow already had the value', async () => {
    // another client switched the machine off without the workflow
    const rig = decaid({ workflow: 150, machine: 0 });
    await rig.run(true, 150);
    expect(rig.calls).toEqual(['workflow 150', 'machine 150']);
    expect(rig.machine()?.targetSteamTemp).toBe(150);
    expect(rig.waited()).toBeGreaterThan(0);
  });

  it('does not wait for a machine whose settings are not known', async () => {
    const rig = decaid({ machine: null });
    await rig.run(false);
    expect(rig.calls).toEqual(['workflow 0']);
    expect(rig.waited()).toBe(0);
  });

  it('passes on a refused write', async () => {
    const gateway: HeaterGateway = {
      updateWorkflow: async () => {
        throw new Error('503');
      },
      setShotSettings: async () => {},
    };
    await expect(switchHeater(gateway, false, 150, () => SETTINGS)).rejects.toThrow('503');
  });
});

describe('the temperature the heater is switched on with', () => {
  it('is 135-165 °C, whole degrees', () => {
    expect([135, 150, 165].every(isOnTemperature)).toBe(true);
    expect([0, 100, 134, 166, 150.5, '150', null].some(isOnTemperature)).toBe(false);
  });

  it('is a setting, 150 °C by default, and a stored value outside the range is ignored', () => {
    expect(DEFAULT_STEAM_SETTINGS.heaterTemperature).toBe(150);
    expect(readSettings({ steam: { heaterTemperature: 158 } }).steam.heaterTemperature).toBe(158);
    expect(readSettings({ steam: { heaterTemperature: 0 } }).steam.heaterTemperature).toBe(150);
    expect(readSettings({ steam: { heaterTemperature: 300 } }).steam.heaterTemperature).toBe(150);
  });
});
