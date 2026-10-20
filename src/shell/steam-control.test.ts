import { describe, expect, it } from 'vitest';
import type { DecaidClient, MachineSnapshot, MachineState, ShotSettings, Workflow } from '../api';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { SteamControl, type SteamHost } from './steam-control.svelte';

// The steam part of the skin: the run follows the machine's frames, a steam that ends clears
// the adjust button, and a write that fails says so in the skin's notice.

function frame(state: MachineState, second: number): MachineSnapshot {
  return {
    timestamp: `2026-10-13T09:00:${second.toFixed(3).padStart(6, '0')}000`,
    state: { state, substate: 'idle' },
    flow: 0,
    pressure: 1.5,
    targetFlow: 0,
    targetPressure: 0,
    mixTemperature: 90,
    groupTemperature: 92,
    targetMixTemperature: 93,
    targetGroupTemperature: 93,
    profileFrame: 0,
    steamTemperature: 150,
  };
}

const SHOT_SETTINGS: ShotSettings = {
  steamSetting: 0,
  targetSteamTemp: 150,
  targetSteamDuration: 40,
  targetHotWaterTemp: 75,
  targetHotWaterVolume: 50,
  targetHotWaterDuration: 30,
  targetShotVolume: 36,
  groupTemp: 94,
};

function host(client: Partial<DecaidClient> = {}): SteamHost {
  let settings: Settings = DEFAULT_SETTINGS;
  return {
    client: client as DecaidClient,
    workflow: { steamSettings: { duration: 30, targetTemperature: 150 } } as Workflow,
    shotSettings: null,
    get settings() {
      return settings;
    },
    setSettings: (change) => (settings = { ...settings, ...change }),
    notice: null,
    info: null,
  };
}

describe('the steam control', () => {
  it('records the steam and clears the adjust button when it ends', () => {
    const steam = new SteamControl(host());
    steam.frame(frame('steam', 0));
    steam.adjust = 1;
    steam.frame(frame('steam', 1));
    expect(steam.run?.ended).toBe(false);
    expect(steam.adjust).toBe(1);
    steam.frame(frame('idle', 2));
    expect(steam.run?.ended).toBe(true);
    expect(steam.adjust).toBeNull();
  });

  it("keeps an adjust button chosen after the steam's end", () => {
    const steam = new SteamControl(host());
    steam.frame(frame('steam', 0));
    steam.frame(frame('idle', 1));
    steam.adjust = 0;
    steam.frame(frame('idle', 2));
    expect(steam.adjust).toBe(0);
  });

  it("gives the selected button's amount", () => {
    const steam = new SteamControl(host());
    expect(steam.adjustment).toBeNull();
    steam.adjust = 0;
    expect(steam.adjustment).toBe(DEFAULT_SETTINGS.steam.adjustments[0]);
  });

  it("takes the machine's timer over the workflow's", () => {
    const skin = host();
    const steam = new SteamControl(skin);
    expect(steam.timer).toBe(30);
    expect(new SteamControl({ ...skin, shotSettings: SHOT_SETTINGS }).timer).toBe(40);
  });

  it('says in the notice why the timer was not set', async () => {
    const away = () => Promise.reject(new Error('away'));
    const skin = host({ kvGet: away, setSteamDuration: away });
    await new SteamControl(skin).setTimer(25);
    expect(skin.notice).toBe('The timer was not set: away');
  });

  it('says in the notice why the heater was not switched, and answers false', async () => {
    const skin = host({ updateWorkflow: () => Promise.reject(new Error('away')) });
    expect(await new SteamControl(skin).setHeater(false)).toBe(false);
    expect(skin.notice).toBe('The steam heater was not switched off: away');
  });
});
