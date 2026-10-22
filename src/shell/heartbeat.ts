// A touch of the skin tells Decaid that someone uses it, so the machine sleeps after the
// presence setting's minutes from the last touch and not from the last thing Decaid saw
// (spec 3.12). Decaid passes a heartbeat to the machine at most every 30 s, so the skin sends
// no more often; none while the machine sleeps, which a heartbeat does not wake (research.md 32).
// A part of `Skin`, which hands it every touch.
import type { DecaidClient } from '../api';

/** The least time between two heartbeats, in milliseconds. */
export const HEARTBEAT_MS = 30_000;

export class Heartbeat {
  private readonly client: Pick<DecaidClient, 'heartbeat'>;
  /** when the last heartbeat was sent, in `Date.now()` milliseconds; none yet */
  private sent: number | null = null;

  constructor(client: Pick<DecaidClient, 'heartbeat'>) {
    this.client = client;
  }

  /** A touch of the skin, with whether the machine sleeps; sends a heartbeat when one is due. */
  touch(machineAsleep: boolean): void {
    if (machineAsleep) return;
    const now = Date.now();
    if (this.sent !== null && now - this.sent < HEARTBEAT_MS) return;
    this.sent = now;
    // A comfort: a failed heartbeat costs at most an early sleep, so there is no notice.
    this.client.heartbeat().catch(() => undefined);
  }
}
