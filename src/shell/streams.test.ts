import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DecaidClient, MachineSnapshot, MachineState, ScaleFrame } from '../api';
import { Streams } from './streams.svelte';

// The streams part of the skin: what a machine frame and a scale frame change, and when the
// scale's retry rounds look for a scale (spec 3.9).

function frame(state: MachineState): MachineSnapshot {
  return {
    timestamp: '2026-10-13T09:00:00.000000',
    state: { state, substate: 'idle' },
    flow: 0,
    pressure: 0,
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

const weightOf = (weight: number): ScaleFrame => ({ timestamp: '', weight, weightFlow: 1.5, battery: null, timerValue: null });

/** The streams' handler of the scale stream, as the stream calls it. */
const feedScale = (streams: Streams, scale: ScaleFrame) =>
  (streams as unknown as { onScaleFrame(frame: ScaleFrame): void }).onScaleFrame(scale);

function streams() {
  const weights: number[] = [];
  const client = {
    getSettings: () => Promise.resolve({}),
    scanDevices: () => Promise.resolve(),
  } as unknown as DecaidClient;
  const made = new Streams('http://rig:8080', client, {
    onOpen: () => undefined,
    onMachineFrame: () => undefined,
    onWeight: (weight) => weights.push(weight),
  });
  return { streams: made, weights };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('the streams', () => {
  it("records a machine frame and answers the machine's state before it", () => {
    const { streams: s } = streams();
    expect(s.machineFrame(frame('sleeping'))).toBeUndefined();
    expect(s.machineFrame(frame('idle'))).toBe('sleeping');
    expect(s.machineState).toBe('idle');
    expect(s.snapshot?.state.state).toBe('idle');
  });

  it('keeps the raw frame and a copy with the group and steam temperatures filtered (spec 3.12)', () => {
    const { streams: s } = streams();
    s.machineFrame({ ...frame('idle'), groupTemperature: 90, steamTemperature: 140 });
    vi.advanceTimersByTime(250);
    const raw = { ...frame('idle'), groupTemperature: 91, steamTemperature: 141, pressure: 1.5 };
    s.machineFrame(raw);
    expect(s.snapshot).toBe(raw);
    expect(s.shown?.groupTemperature).toBeGreaterThan(90);
    expect(s.shown?.groupTemperature).toBeLessThan(90.5);
    expect(s.shown?.steamTemperature).toBeGreaterThan(140);
    expect(s.shown?.steamTemperature).toBeLessThan(140.5);
    expect(s.shown?.pressure).toBe(1.5);
  });

  it('takes the weight and its flow from a weight frame and hands the weight on', () => {
    const { streams: s, weights } = streams();
    feedScale(s, weightOf(12.5));
    expect(s.weight).toBe(12.5);
    expect(s.weightFlow).toBe(1.5);
    expect(s.scaleLink).toBe('connected');
    expect(weights).toEqual([12.5]);
  });

  it('drops the weight when the scale disconnects, and a round looks for it', () => {
    const { streams: s } = streams();
    feedScale(s, weightOf(3));
    feedScale(s, { status: 'disconnected' });
    expect(s.weight).toBeNull();
    expect(s.scaleLink).toBe('disconnected');
    expect(s.scaleLooking).toBe(true);
    feedScale(s, { status: 'connected' });
    expect(s.scaleLink).toBe('connected');
    expect(s.scaleLooking).toBe(false);
  });
});
