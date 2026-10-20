// The steam page's state and actions (spec 3.4, 3.7): the running steam, the adjust buttons,
// the timer and the steam heater. A part of `Skin`, which hands its steam fields to it; the
// workflow, the machine's settings and the notice stay the skin's (`SteamHost`).
import type { DecaidClient, MachineSnapshot, ShotSettings, Workflow } from '../api';
import type { Settings } from '../settings';
import { applySteamTimer, timerMismatch } from '../steam/apply';
import { recordSteamFrame, type SteamRun } from '../steam/run';
import { heaterState, isOnTemperature, switchHeater } from './steam-heater';

/** What the steam part reads and writes of the skin. */
export interface SteamHost {
  readonly client: DecaidClient;
  workflow: Workflow | null;
  readonly shotSettings: ShotSettings | null;
  readonly settings: Settings;
  setSettings(change: Partial<Settings>): void;
  notice: string | null;
  info: string | null;
}

export class SteamControl {
  /** the running steam, or the finished one until the next */
  run: SteamRun | null = $state.raw(null);
  /**
   * The adjust button selected on the steam page (spec 3.7): its place in the settings'
   * list, null for none. One at a time; it is cleared when a steam ends.
   */
  adjust: number | null = $state(null);
  /** the steam timer this skin set last, in s */
  private asked: number | null = $state(null);
  private readonly host: SteamHost;

  /**
   * The steam timer in s: the machine's own, and the workflow's `steamSettings.duration` only
   * while the machine's settings are not known. The two can differ (research.md, section 16).
   */
  readonly timer = $derived.by(
    () => this.host.shotSettings?.targetSteamDuration ?? this.host.workflow?.steamSettings?.duration ?? null,
  );
  /** s, the amount of the selected adjust button, null without one */
  readonly adjustment = $derived.by(() => (this.adjust === null ? null : (this.host.settings.steam.adjustments[this.adjust] ?? null)));
  /** the steam heater, on or off (spec 3.7, home's menu); null while neither the machine nor the workflow is known */
  readonly heater = $derived.by(() => heaterState(this.host.shotSettings, this.host.workflow));
  /** The machine's timer is not the one set here any more: what the steam page says about it. */
  readonly mismatch = $derived.by(() => timerMismatch(this.asked, this.host.shotSettings?.targetSteamDuration ?? null));

  constructor(host: SteamHost) {
    this.host = host;
  }

  /** The machine's frame: the steam run follows it, and a steam that ends clears the adjust button. */
  frame(frame: MachineSnapshot): void {
    const steaming = this.run !== null && !this.run.ended;
    this.run = recordSteamFrame(this.run, frame);
    if (steaming && this.run?.ended) this.adjust = null;
  }

  /**
   * Writes the steam timer, whole seconds (spec 3.4): to the workflow's `steamSettings.duration`,
   * and to the machine's own settings where Decaid did not pass it on (`applySteamTimer`).
   */
  async setTimer(seconds: number): Promise<void> {
    const host = this.host;
    host.notice = null;
    this.asked = null;
    const asked = Math.max(0, Math.round(seconds));
    try {
      host.workflow = (await applySteamTimer(host.client, asked, () => host.shotSettings)).workflow;
      this.asked = asked;
    } catch (error) {
      host.notice = `The timer was not set: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * The menu's steam switch (spec 3.7): off writes 0 °C, after it remembered the temperature
   * the heater had in the settings; on writes that temperature again.
   */
  async toggleHeater(): Promise<void> {
    this.host.notice = this.host.info = null;
    await this.setHeater(this.heater === 'off');
  }

  /**
   * The steam heater on or off, as the menu's switch does; the descale switches it off for the
   * cycle (research.md 20.3). False when it was not switched: the notice says why.
   */
  async setHeater(on: boolean): Promise<boolean> {
    const host = this.host;
    const current = host.workflow?.steamSettings?.targetTemperature;
    if (!on && isOnTemperature(current) && current !== host.settings.steam.heaterTemperature) {
      host.setSettings({ steam: { ...host.settings.steam, heaterTemperature: current } });
    }
    try {
      host.workflow = await switchHeater(host.client, on, host.settings.steam.heaterTemperature, () => host.shotSettings);
      return true;
    } catch (error) {
      host.notice = `The steam heater was not switched ${on ? 'on' : 'off'}: ${error instanceof Error ? error.message : String(error)}`;
      return false;
    }
  }
}
