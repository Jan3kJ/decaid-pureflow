// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/app.js (`scaleAutoRetryDecision`, `attemptScaleAutoRetry`, `onScaleDisconnect`).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The scale is looked for again (spec 3.9, item 3): Decaid connects a missing scale with a scan
// (`GET /api/v1/devices/scan?connect=true&quick=true`), and nothing else asks it to. A round
// scans every 5 s, at most 3 times. It starts by itself when the scale drops, and when the
// first status frame after the start says no scale is connected; then it scans only with a
// known scale (`preferredScaleId`). A tap on the warning or on a tare button starts a round by
// hand: at once, and with no known scale too. No round scans while the machine sleeps, nor
// within 4 s after a wake (Decaid takes a preferred scale back by itself then, and a second
// scan makes that fail), nor while Decaid already scans; those ticks wait, up to 6 times.
// Unlike Streamline, Decaid's scale power mode `disconnect` stops no round: it drops the scale
// only while the machine sleeps, which stops a round anyway, and it is Decaid's default (the
// rig has it), so the drop of item 3 would never be retried.

export const SCALE_RETRY_MS = 5000;
export const SCALE_RETRY_MAX = 3;
/** ticks that wait without a scan, about 30 s: past Decaid's scan of about 15 s */
export const SCALE_RETRY_MAX_WAITS = 6;
/** ms after a wake in which Decaid takes the scale back by itself */
export const WAKE_GRACE_MS = 4000;

export type RetryDecision = 'retry' | 'wait' | 'stop';

export interface RetryFacts {
  scaleConnected: boolean;
  retryCount: number;
  waitCount: number;
  /** Decaid knows a scale to connect (`preferredScaleId`), or the round was started by hand */
  hasScale: boolean;
  machineAsleep: boolean;
  inWakeGrace: boolean;
  decaidScanning: boolean;
}

/** What a tick of a round does: scan, wait a tick without a scan, or end the round. */
export function scaleRetryDecision(facts: RetryFacts): RetryDecision {
  if (
    facts.scaleConnected ||
    facts.retryCount >= SCALE_RETRY_MAX ||
    facts.waitCount >= SCALE_RETRY_MAX_WAITS ||
    !facts.hasScale ||
    facts.machineAsleep
  ) {
    return 'stop';
  }
  if (facts.inWakeGrace || facts.decaidScanning) return 'wait';
  return 'retry';
}

/** What a round needs from the skin; the skin's state is read at every tick. */
export interface ScaleRetryHost {
  scaleConnected(): boolean;
  machineAsleep(): boolean;
  /** ms, the time of the machine's last wake; null while none was seen */
  wokeAt(): number | null;
  decaidScanning(): boolean;
  /** Decaid's `preferredScaleId`; null when there is none or it cannot be read */
  preferredScale(): Promise<string | null>;
  /** the scan that connects a missing scale; its failure ends nothing, the next tick tries again */
  scan(): Promise<void>;
  /** a round started or ended */
  onLooking(looking: boolean): void;
  now?: () => number;
}

export class ScaleRetry {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private retries = 0;
  private waits = 0;
  private byHand = false;
  /** counts the rounds, so a tick of an ended round does nothing */
  private round = 0;
  looking = false;

  constructor(private readonly host: ScaleRetryHost) {}

  /** Starts a new round, ending the one that runs: by hand it scans at once, else after 5 s. */
  start(byHand: boolean): void {
    this.end();
    this.byHand = byHand;
    this.setLooking(true);
    const round = this.round;
    if (byHand) void this.tick(round);
    else this.timer = setTimeout(() => void this.tick(round), SCALE_RETRY_MS);
  }

  /** Ends the round, as when the scale is connected. */
  stop(): void {
    this.end();
    this.setLooking(false);
  }

  private end(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.round += 1;
    this.retries = this.waits = 0;
  }

  private async tick(round: number): Promise<void> {
    const host = this.host;
    const now = host.now?.() ?? Date.now();
    const wokeAt = host.wokeAt();
    const hasScale = this.byHand || (await host.preferredScale()) !== null;
    if (round !== this.round) return;
    const decision = scaleRetryDecision({
      scaleConnected: host.scaleConnected(),
      retryCount: this.retries,
      waitCount: this.waits,
      hasScale,
      machineAsleep: host.machineAsleep(),
      inWakeGrace: wokeAt !== null && now - wokeAt < WAKE_GRACE_MS,
      decaidScanning: host.decaidScanning(),
    });
    if (decision === 'stop') {
      this.stop();
      return;
    }
    if (decision === 'wait') this.waits += 1;
    else {
      this.retries += 1;
      void host.scan().catch(() => undefined);
    }
    // After the last scan one more tick: the scale has 5 s to connect before the round ends.
    this.timer = setTimeout(() => void this.tick(round), SCALE_RETRY_MS);
  }

  private setLooking(looking: boolean): void {
    if (looking === this.looking) return;
    this.looking = looking;
    this.host.onLooking(looking);
  }
}
