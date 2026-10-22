import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEARTBEAT_MS, Heartbeat } from './heartbeat';

// A touch sends a heartbeat, at most one every 30 s, none while the machine sleeps.

function counting(answer: () => Promise<number> = () => Promise.resolve(60)) {
  const client = { heartbeat: vi.fn(answer) };
  return { client, heartbeat: new Heartbeat(client) };
}

describe('the heartbeat', () => {
  beforeEach(() => vi.useFakeTimers({ now: 0 }));
  afterEach(() => vi.useRealTimers());

  it('sends on the first touch and then at most once every 30 s', () => {
    const { client, heartbeat } = counting();
    heartbeat.touch(false);
    expect(client.heartbeat).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    heartbeat.touch(false);
    vi.advanceTimersByTime(HEARTBEAT_MS - 10_001);
    heartbeat.touch(false);
    expect(client.heartbeat).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    heartbeat.touch(false);
    heartbeat.touch(false);
    expect(client.heartbeat).toHaveBeenCalledTimes(2);
  });

  it('sends nothing without a touch', () => {
    const { client, heartbeat } = counting();
    heartbeat.touch(false);
    vi.advanceTimersByTime(5 * HEARTBEAT_MS);
    expect(client.heartbeat).toHaveBeenCalledTimes(1);
  });

  it('sends none while the machine sleeps, and the first touch after the wake sends', () => {
    const { client, heartbeat } = counting();
    heartbeat.touch(true);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    heartbeat.touch(true);
    expect(client.heartbeat).not.toHaveBeenCalled();
    heartbeat.touch(false);
    expect(client.heartbeat).toHaveBeenCalledTimes(1);
  });

  it('a touch while asleep does not hold back the next heartbeat', () => {
    const { client, heartbeat } = counting();
    heartbeat.touch(false);
    vi.advanceTimersByTime(HEARTBEAT_MS);
    heartbeat.touch(true);
    heartbeat.touch(false);
    expect(client.heartbeat).toHaveBeenCalledTimes(2);
  });

  it('ignores a failed heartbeat and keeps the 30 s', async () => {
    const { client, heartbeat } = counting(() => Promise.reject(new Error('away')));
    heartbeat.touch(false);
    await vi.advanceTimersByTimeAsync(1000);
    heartbeat.touch(false);
    expect(client.heartbeat).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(HEARTBEAT_MS);
    heartbeat.touch(false);
    expect(client.heartbeat).toHaveBeenCalledTimes(2);
  });
});
