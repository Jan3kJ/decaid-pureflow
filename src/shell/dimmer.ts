// The screen follows the Asleep screen: dim while it is shown, the system's own brightness
// again when the machine is awake; a sleep by the menu's 'Machine sleep' is not dimmed
// (sleep.ts). Only where Decaid says the platform can (spec 3.1); elsewhere the brightness is
// not touched. A part of `Skin`, which hands it every machine frame's state.
import type { DecaidClient } from '../api';

/** The screen's brightness while the machine sleeps, 0-100; 100 is the system's own. */
export const SLEEP_BRIGHTNESS = 5;

export class Dimmer {
  /** the skin lowered the screen's brightness for the Asleep screen */
  private dimmed = false;
  private readonly client: Pick<DecaidClient, 'getDisplay' | 'setBrightness'>;

  constructor(client: Pick<DecaidClient, 'getDisplay' | 'setBrightness'>) {
    this.client = client;
  }

  /** Called with every machine frame, with whether the Asleep screen is shown; only a change asks Decaid. */
  async follow(asleep: boolean): Promise<void> {
    if (asleep === this.dimmed) return;
    this.dimmed = asleep;
    try {
      const display = await this.client.getDisplay();
      if (display.platformSupported?.brightness !== true) return;
      await this.client.setBrightness(asleep ? SLEEP_BRIGHTNESS : 100);
    } catch {
      // The brightness is a comfort; the machine's state is on screen either way.
    }
  }
}
