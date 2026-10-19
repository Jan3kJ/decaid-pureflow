import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SCALE_RETRY_MAX,
  SCALE_RETRY_MAX_WAITS,
  SCALE_RETRY_MS,
  ScaleRetry,
  WAKE_GRACE_MS,
  scaleRetryDecision,
  type RetryFacts,
} from './scale-retry';

const facts = (change: Partial<RetryFacts> = {}): RetryFacts => ({
  scaleConnected: false,
  retryCount: 0,
  waitCount: 0,
  hasScale: true,
  machineAsleep: false,
  inWakeGrace: false,
  decaidScanning: false,
  ...change,
});

describe('scaleRetryDecision (Streamline v0.2.14)', () => {
  it('scans while the scale is missing and the round has tries left', () => {
    expect(scaleRetryDecision(facts())).toBe('retry');
    expect(scaleRetryDecision(facts({ retryCount: SCALE_RETRY_MAX - 1 }))).toBe('retry');
  });

  it('ends with a connected scale, after 3 scans or 6 waits, without a known scale and while the machine sleeps', () => {
    expect(scaleRetryDecision(facts({ scaleConnected: true }))).toBe('stop');
    expect(scaleRetryDecision(facts({ retryCount: SCALE_RETRY_MAX }))).toBe('stop');
    expect(scaleRetryDecision(facts({ waitCount: SCALE_RETRY_MAX_WAITS }))).toBe('stop');
    expect(scaleRetryDecision(facts({ hasScale: false }))).toBe('stop');
    expect(scaleRetryDecision(facts({ machineAsleep: true, inWakeGrace: true }))).toBe('stop');
  });

  it('waits without a scan within the grace after a wake and while Decaid scans', () => {
    expect(scaleRetryDecision(facts({ inWakeGrace: true }))).toBe('wait');
    expect(scaleRetryDecision(facts({ decaidScanning: true }))).toBe('wait');
  });
});

describe('ScaleRetry', () => {
  let state: {
    connected: boolean;
    asleep: boolean;
    wokeAt: number | null;
    scanning: boolean;
    preferred: string | null;
    scans: number;
    looking: boolean[];
  };
  let retry: ScaleRetry;

  beforeEach(() => {
    vi.useFakeTimers();
    state = { connected: false, asleep: false, wokeAt: null, scanning: false, preferred: 'MockScale', scans: 0, looking: [] };
    retry = new ScaleRetry({
      scaleConnected: () => state.connected,
      machineAsleep: () => state.asleep,
      wokeAt: () => state.wokeAt,
      decaidScanning: () => state.scanning,
      preferredScale: async () => state.preferred,
      scan: async () => {
        state.scans += 1;
      },
      onLooking: (looking) => state.looking.push(looking),
      now: () => Date.now(),
    });
  });

  afterEach(() => {
    retry.stop();
    vi.useRealTimers();
  });

  const tick = () => vi.advanceTimersByTimeAsync(SCALE_RETRY_MS);

  it('after a drop scans every 5 s, 3 times, and ends 5 s after the last scan', async () => {
    retry.start(false);
    expect(retry.looking).toBe(true);
    await vi.advanceTimersByTimeAsync(SCALE_RETRY_MS - 1);
    expect(state.scans).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.scans).toBe(1);
    await tick();
    await tick();
    expect(state.scans).toBe(3);
    expect(retry.looking).toBe(true);
    await tick();
    expect(retry.looking).toBe(false);
    await tick();
    expect(state.scans).toBe(3);
    expect(state.looking).toEqual([true, false]);
  });

  it('ends as soon as the scale is connected', async () => {
    retry.start(false);
    await tick();
    state.connected = true;
    await tick();
    expect(state.scans).toBe(1);
    expect(retry.looking).toBe(false);
  });

  it('by itself only with a known scale; by hand at once, without one too', async () => {
    state.preferred = null;
    retry.start(false);
    await tick();
    expect(state.scans).toBe(0);
    expect(retry.looking).toBe(false);
    retry.start(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.scans).toBe(1);
    expect(retry.looking).toBe(true);
  });

  it('a tap starts a new round with 3 scans again', async () => {
    retry.start(false);
    await tick();
    await tick();
    expect(state.scans).toBe(2);
    retry.start(true);
    await vi.advanceTimersByTimeAsync(0);
    await tick();
    await tick();
    await tick();
    expect(state.scans).toBe(5);
    expect(retry.looking).toBe(false);
  });

  it('does not scan while the machine sleeps', async () => {
    state.asleep = true;
    retry.start(false);
    await tick();
    retry.start(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(state.scans).toBe(0);
    expect(retry.looking).toBe(false);
  });

  it('waits within 4 s after a wake and while Decaid scans, without using a try', async () => {
    retry.start(false);
    state.wokeAt = Date.now() + SCALE_RETRY_MS - WAKE_GRACE_MS / 2;
    await tick();
    expect(state.scans).toBe(0);
    state.scanning = true;
    await tick();
    expect(state.scans).toBe(0);
    state.scanning = false;
    await tick();
    await tick();
    await tick();
    expect(state.scans).toBe(3);
  });

  it('ends after 6 waits while Decaid seems to scan forever', async () => {
    state.scanning = true;
    retry.start(true);
    for (let index = 0; index < SCALE_RETRY_MAX_WAITS; index += 1) await tick();
    expect(retry.looking).toBe(false);
    expect(state.scans).toBe(0);
  });

  it('a failed scan ends nothing: the next tick scans again', async () => {
    const failing = new ScaleRetry({
      scaleConnected: () => false,
      machineAsleep: () => false,
      wokeAt: () => null,
      decaidScanning: () => false,
      preferredScale: async () => 'MockScale',
      scan: async () => {
        state.scans += 1;
        throw new Error('500');
      },
      onLooking: () => undefined,
    });
    failing.start(true);
    await vi.advanceTimersByTimeAsync(0);
    await tick();
    expect(state.scans).toBe(2);
    failing.stop();
  });
});
