import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SnapshotStream,
  machineSnapshotStream,
  scaleSnapshotStream,
  streamUrl,
  type SocketLike,
  type StreamErrorFrame,
  type StreamState,
} from './stream';
import { isScaleSnapshot, isScaleStatus, type MachineSnapshot, type ScaleFrame } from './types';

/** A WebSocket without a network: the test opens it, sends frames and drops it. */
class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  static get last(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }

  readonly url: string;
  closedByClient = false;
  private listeners: Record<string, Array<(event: any) => void>> = {};

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: any) => void): void {
    (this.listeners[type] ??= []).push(listener);
  }

  /** As a real socket: close() is followed by a close event. */
  close(): void {
    this.closedByClient = true;
    this.emit('close', { code: 1000 });
  }

  serverOpens(): void {
    this.emit('open', {});
  }

  serverSends(frame: unknown): void {
    this.emit('message', { data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
  }

  /** The connection drops: an error event, then a close event. */
  serverDrops(): void {
    this.emit('error', {});
    this.emit('close', { code: 1006 });
  }

  private emit(type: string, event: unknown): void {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
}

// Verbatim from the rig (research.md 8.2 and 8.5).
const MACHINE_FRAME =
  '{"timestamp":"2026-10-11T12:23:39.408036","state":{"state":"idle","substate":"idle"},"flow":0.0,"pressure":0.0,"targetFlow":0.0,"targetPressure":0.0,"mixTemperature":44.0,"groupTemperature":44.0,"targetMixTemperature":93.0,"targetGroupTemperature":93.0,"profileFrame":0,"steamTemperature":88}';
const SCALE_STATUS = '{"status":"connected"}';
const SCALE_FRAME =
  '{"timestamp":"2026-10-11T12:24:26.313996","weight":34.31715970191449,"weightFlow":0.0,"battery":100,"timerValue":27499}';

function machineStream(backoff = { initialMs: 1000, factor: 2, maxMs: 8000 }) {
  const frames: MachineSnapshot[] = [];
  const states: StreamState[] = [];
  const errors: StreamErrorFrame[] = [];
  const stream = machineSnapshotStream({
    WebSocket: FakeSocket,
    backoff,
    onFrame: (frame) => frames.push(frame),
    onState: (state) => states.push(state),
    onError: (error) => errors.push(error),
  });
  return { stream, frames, states, errors };
}

beforeEach(() => {
  FakeSocket.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('URLs', () => {
  it('connects to the two snapshot paths of the gateway', () => {
    expect(machineSnapshotStream({ WebSocket: FakeSocket }).url).toBe('ws://localhost:8080/ws/v1/machine/snapshot');
    expect(scaleSnapshotStream({ WebSocket: FakeSocket }).url).toBe('ws://localhost:8080/ws/v1/scale/snapshot');
  });

  it('derives the stream URL from the base URL', () => {
    expect(streamUrl('http://192.168.1.20:8080/', '/ws/v1/scale/snapshot')).toBe(
      'ws://192.168.1.20:8080/ws/v1/scale/snapshot',
    );
    expect(streamUrl('https://decaid.example', '/ws/v1/machine/snapshot')).toBe(
      'wss://decaid.example/ws/v1/machine/snapshot',
    );
    const stream = scaleSnapshotStream({ baseUrl: 'http://tablet:8080', WebSocket: FakeSocket }).connect();
    expect(FakeSocket.last.url).toBe('ws://tablet:8080/ws/v1/scale/snapshot');
    stream.close();
  });

  it('opens no socket before connect()', () => {
    const { stream } = machineStream();
    expect(FakeSocket.instances).toHaveLength(0);
    expect(stream.state).toBe('idle');
  });
});

describe('frames', () => {
  it('delivers machine frames and keeps the latest', () => {
    const { stream, frames, states } = machineStream();
    stream.connect();
    expect(stream.state).toBe('connecting');
    expect(stream.latest).toBeUndefined();

    FakeSocket.last.serverOpens();
    expect(stream.state).toBe('open');

    FakeSocket.last.serverSends(MACHINE_FRAME);
    FakeSocket.last.serverSends({ ...JSON.parse(MACHINE_FRAME), pressure: 9.1, profileFrame: 6 });
    expect(frames).toHaveLength(2);
    expect(frames[0].state).toEqual({ state: 'idle', substate: 'idle' });
    expect(frames[0].groupTemperature).toBe(44);
    expect(stream.latest?.pressure).toBe(9.1);
    expect(stream.latest?.profileFrame).toBe(6);
    expect(states).toEqual(['connecting', 'open']);
  });

  it('the first scale frame is a status frame without a weight', () => {
    const frames: ScaleFrame[] = [];
    const stream = scaleSnapshotStream({ WebSocket: FakeSocket, onFrame: (frame) => frames.push(frame) }).connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends(SCALE_STATUS);
    FakeSocket.last.serverSends(SCALE_FRAME);

    const [first, second] = frames;
    expect(isScaleStatus(first)).toBe(true);
    expect(isScaleSnapshot(first)).toBe(false);
    expect(first).toEqual({ status: 'connected' });
    expect('weight' in first).toBe(false);

    expect(isScaleSnapshot(second)).toBe(true);
    // The type has no weight before it is narrowed.
    const weights = frames.filter(isScaleSnapshot).map((frame) => frame.weight);
    expect(weights).toEqual([34.31715970191449]);
    expect(stream.latest).toEqual(second);
  });

  it('reports a frame that is not JSON and goes on', () => {
    const { stream, frames, errors } = machineStream();
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends('not json');
    FakeSocket.last.serverSends(MACHINE_FRAME);
    expect(errors).toHaveLength(1);
    expect(frames).toHaveLength(1);
    expect(stream.state).toBe('open');
  });
});

describe('reconnect', () => {
  it('reconnects after a drop, with a growing delay up to the maximum', () => {
    const { stream, states } = machineStream({ initialMs: 1000, factor: 2, maxMs: 8000 });
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends(MACHINE_FRAME);
    FakeSocket.last.serverDrops();
    expect(stream.state).toBe('waiting');
    expect(FakeSocket.instances).toHaveLength(1);

    // The gateway stays away: 1 s, 2 s, 4 s, 8 s, and then 8 s again.
    let sockets = 1;
    for (const delay of [1000, 2000, 4000, 8000, 8000]) {
      vi.advanceTimersByTime(delay - 1);
      expect(FakeSocket.instances).toHaveLength(sockets);
      vi.advanceTimersByTime(1);
      sockets += 1;
      expect(FakeSocket.instances).toHaveLength(sockets);
      expect(stream.state).toBe('connecting');
      FakeSocket.last.serverDrops();
      expect(stream.state).toBe('waiting');
    }
    expect(states.slice(0, 5)).toEqual(['connecting', 'open', 'waiting', 'connecting', 'waiting']);
    stream.close();
  });

  it('delivers frames again after a reconnect and keeps the last frame while waiting', () => {
    const { stream, frames } = machineStream();
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends(MACHINE_FRAME);
    FakeSocket.last.serverDrops();
    expect(stream.latest).toBeDefined();

    vi.advanceTimersByTime(1000);
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends(MACHINE_FRAME);
    expect(stream.state).toBe('open');
    expect(frames).toHaveLength(2);
    stream.close();
  });

  it('starts the delay again after a successful open', () => {
    const { stream } = machineStream({ initialMs: 1000, factor: 2, maxMs: 8000 });
    stream.connect();
    FakeSocket.last.serverDrops();
    vi.advanceTimersByTime(1000);
    FakeSocket.last.serverDrops();
    vi.advanceTimersByTime(2000);
    expect(FakeSocket.instances).toHaveLength(3);

    FakeSocket.last.serverOpens();
    FakeSocket.last.serverDrops();
    vi.advanceTimersByTime(999);
    expect(FakeSocket.instances).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.instances).toHaveLength(4);
    stream.close();
  });

  it('retries when the WebSocket constructor throws', () => {
    let attempts = 0;
    class Refusing {
      constructor() {
        attempts += 1;
        throw new Error('refused');
      }
      addEventListener(): void {}
      close(): void {}
    }
    const stream = new SnapshotStream({ url: 'ws://x', WebSocket: Refusing }).connect();
    expect(stream.state).toBe('waiting');
    vi.advanceTimersByTime(1000);
    expect(attempts).toBe(2);
    stream.close();
  });

  it('uses the injected timer', () => {
    const scheduled: Array<{ callback: () => void; ms: number }> = [];
    const cleared: unknown[] = [];
    const stream = new SnapshotStream<MachineSnapshot>({
      url: 'ws://x',
      WebSocket: FakeSocket,
      backoff: { initialMs: 500, factor: 3, maxMs: 2000 },
      setTimeout: (callback, ms) => scheduled.push({ callback, ms }),
      clearTimeout: (handle) => cleared.push(handle),
    }).connect();

    FakeSocket.last.serverDrops();
    scheduled[0].callback();
    FakeSocket.last.serverDrops();
    scheduled[1].callback();
    FakeSocket.last.serverDrops();
    expect(scheduled.map((entry) => entry.ms)).toEqual([500, 1500, 2000]);
    expect(FakeSocket.instances).toHaveLength(3);
    expect(vi.getTimerCount()).toBe(0);

    stream.close();
    expect(cleared).toEqual([3]);
  });
});

describe('connection-error frames', () => {
  it('does not reconnect on a status frame that reports a lost scale: the socket stays open', () => {
    const frames: ScaleFrame[] = [];
    const stream = scaleSnapshotStream({ WebSocket: FakeSocket, onFrame: (frame) => frames.push(frame) }).connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends(SCALE_STATUS);
    FakeSocket.last.serverSends(SCALE_FRAME);
    FakeSocket.last.serverSends({ status: 'disconnected' });

    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.last.closedByClient).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(stream.state).toBe('open');
    expect(stream.latest).toEqual({ status: 'disconnected' });

    // The scale comes back on the same socket.
    FakeSocket.last.serverSends(SCALE_STATUS);
    FakeSocket.last.serverSends(SCALE_FRAME);
    expect(frames).toHaveLength(5);
    stream.close();
  });

  it('does not reconnect on an error frame while the socket stays open', () => {
    const { stream, frames, errors } = machineStream();
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends({ error: 'No machine connected' });

    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(FakeSocket.last.closedByClient).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
    expect(stream.state).toBe('open');
    expect(errors).toEqual([{ error: 'No machine connected' }]);
    // An error frame is not a snapshot.
    expect(frames).toHaveLength(0);
    expect(stream.latest).toBeUndefined();
    stream.close();
  });

  it('does not reconnect when the gateway closes the socket after an error frame', () => {
    const { stream, states, errors } = machineStream();
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends({ e: 'Sensor not found', st: '#0 ...' });
    FakeSocket.last.serverDrops();

    expect(stream.state).toBe('failed');
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(states).toEqual(['connecting', 'open', 'failed']);
  });

  it('reconnects after a drop when frames followed the error frame', () => {
    const { stream } = machineStream();
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends({ error: 'No machine connected' });
    FakeSocket.last.serverSends(MACHINE_FRAME);
    FakeSocket.last.serverDrops();
    expect(stream.state).toBe('waiting');
    vi.advanceTimersByTime(1000);
    expect(FakeSocket.instances).toHaveLength(2);
    stream.close();
  });

  it('connect() starts a failed stream again', () => {
    const { stream } = machineStream();
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverSends({ error: 'refused' });
    FakeSocket.last.serverDrops();
    expect(stream.state).toBe('failed');

    stream.connect();
    expect(FakeSocket.instances).toHaveLength(2);
    FakeSocket.last.serverOpens();
    expect(stream.state).toBe('open');
    stream.close();
  });
});

describe('close', () => {
  it('closes the socket and delivers nothing afterwards', () => {
    const { stream, frames, states } = machineStream();
    stream.connect();
    const socket = FakeSocket.last;
    socket.serverOpens();
    socket.serverSends(MACHINE_FRAME);

    stream.close();
    expect(socket.closedByClient).toBe(true);
    expect(stream.state).toBe('idle');

    // Late events of the closed socket are ignored.
    socket.serverSends(MACHINE_FRAME);
    socket.serverOpens();
    socket.serverDrops();
    vi.advanceTimersByTime(120_000);
    expect(frames).toHaveLength(1);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(states).toEqual(['connecting', 'open', 'idle']);
  });

  it('cancels a scheduled reconnect', () => {
    const { stream } = machineStream();
    stream.connect();
    FakeSocket.last.serverOpens();
    FakeSocket.last.serverDrops();
    expect(vi.getTimerCount()).toBe(1);

    stream.close();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(stream.state).toBe('idle');
  });

  it('can be connected again after close()', () => {
    const { stream } = machineStream();
    stream.connect();
    stream.close();
    stream.connect();
    expect(FakeSocket.instances).toHaveLength(2);
    expect(FakeSocket.instances[0].closedByClient).toBe(true);
    expect(stream.state).toBe('connecting');
    stream.close();
  });

  it('connect() twice opens one socket', () => {
    const { stream } = machineStream();
    stream.connect();
    stream.connect();
    FakeSocket.last.serverOpens();
    stream.connect();
    expect(FakeSocket.instances).toHaveLength(1);
    stream.close();
  });
});
