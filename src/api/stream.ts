// The gateway's snapshot streams. One class for both: it parses the frames, keeps the latest
// one and the connection state, and reconnects with a growing delay after the socket closed.
// The WebSocket constructor and the timer are parameters, so tests need no network.
import type { DevicesState, MachineSnapshot, ScaleFrame, ShotSettings, WaterLevels } from './types';

export const MACHINE_SNAPSHOT_PATH = '/ws/v1/machine/snapshot';
export const SCALE_SNAPSHOT_PATH = '/ws/v1/scale/snapshot';
export const MACHINE_SHOT_SETTINGS_PATH = '/ws/v1/machine/shotSettings';
export const MACHINE_WATER_LEVELS_PATH = '/ws/v1/machine/waterLevels';
export const DEVICES_PATH = '/ws/v1/devices';

/**
 * - `idle`: not started, or closed by `close()`
 * - `connecting`: a socket is being opened
 * - `open`: the socket is open; frames may arrive
 * - `waiting`: the socket closed; a reconnect is scheduled
 * - `failed`: the gateway sent an error frame and closed the socket, and did so again for
 *   `refusedRetryMs`; no reconnect
 */
export type StreamState = 'idle' | 'connecting' | 'open' | 'waiting' | 'failed';

/** An error frame of the gateway: `{"error": ...}`, or `{"e": ..., "st": ...}`. */
export interface StreamErrorFrame {
  error?: string;
  e?: string;
  st?: string;
  [key: string]: unknown;
}

/** The part of a WebSocket the stream uses. The browser's and Node's WebSocket both fit. */
export interface SocketLike {
  addEventListener(type: string, listener: (event: never) => void): void;
  close(): void;
}

export type SocketConstructor = new (url: string) => SocketLike;

export interface Backoff {
  /** The delay before the first reconnect, in ms. */
  initialMs: number;
  /** The delay grows by this factor with every failed attempt. */
  factor: number;
  maxMs: number;
}

/** The values of the example in Decaid's doc/Skins.md. */
export const DEFAULT_BACKOFF: Backoff = { initialMs: 1000, factor: 2, maxMs: 30000 };

/**
 * ms: how long a stream the gateway closed with an error is tried again, with the backoff,
 * before it stops in `failed` (founder, 2026-10-15).
 */
export const REFUSED_RETRY_MS = 30000;

export interface SnapshotStreamOptions<Frame> {
  /** The whole URL, `ws://...`. */
  url: string;
  /** Every frame, as it arrives. */
  onFrame?: (frame: Frame) => void;
  /** Every change of the connection state. */
  onState?: (state: StreamState) => void;
  /** An error frame, or a frame that is not JSON. */
  onError?: (error: StreamErrorFrame) => void;
  backoff?: Partial<Backoff>;
  /** ms; default `REFUSED_RETRY_MS` */
  refusedRetryMs?: number;
  WebSocket?: SocketConstructor;
  setTimeout?: (callback: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  /** The clock, in ms; default `Date.now`. */
  now?: () => number;
}

/**
 * One snapshot stream.
 *
 * Reconnect rules (Decaid's doc/Skins.md): the stream reconnects only after the socket
 * closed, with a delay that grows up to a maximum and starts again after a successful open.
 * A frame never makes it reconnect: the gateway keeps the socket open while a scale or a
 * machine is away and reports that in the stream, for the scale as `{"status":"disconnected"}`.
 * When the gateway sends an error frame and then closes the socket, it refused the stream:
 * the stream tries again with the same growing delay for `refusedRetryMs` from the first
 * refusal (founder, 2026-10-15), and stops in the state `failed` when the gateway still
 * refuses it then. A frame that is not an error ends the refusal. `connect()` starts a
 * failed stream again, with another `refusedRetryMs`.
 */
export class SnapshotStream<Frame> {
  readonly url: string;
  private readonly options: SnapshotStreamOptions<Frame>;
  private readonly backoff: Backoff;
  private socket: SocketLike | undefined;
  private timer: unknown;
  private delayMs: number;
  private errorFrameSeen = false;
  /** when the gateway first refused the stream, by `now()`; null while it does not */
  private refusedAt: number | null = null;
  private currentState: StreamState = 'idle';
  private latestFrame: Frame | undefined;

  constructor(options: SnapshotStreamOptions<Frame>) {
    this.url = options.url;
    this.options = options;
    this.backoff = { ...DEFAULT_BACKOFF, ...options.backoff };
    this.delayMs = this.backoff.initialMs;
  }

  get state(): StreamState {
    return this.currentState;
  }

  /** The latest frame. It is kept over a reconnect, so it may be old: check `state`. */
  get latest(): Frame | undefined {
    return this.latestFrame;
  }

  /** Opens the stream. Does nothing while it is connecting, open or waiting. */
  connect(): this {
    if (this.currentState === 'idle' || this.currentState === 'failed') {
      this.delayMs = this.backoff.initialMs;
      this.refusedAt = null;
      this.open();
    }
    return this;
  }

  /** Closes the socket and cancels a scheduled reconnect. No callback fires afterwards except this state change. */
  close(): void {
    this.cancelTimer();
    const socket = this.socket;
    this.socket = undefined;
    socket?.close();
    this.setState('idle');
  }

  private open(): void {
    this.errorFrameSeen = false;
    this.setState('connecting');
    const Socket = this.options.WebSocket ?? (globalThis.WebSocket as SocketConstructor);
    let socket: SocketLike;
    try {
      socket = new Socket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    // A socket that was replaced or closed by close() is ignored.
    const current = () => this.socket === socket;

    socket.addEventListener('open', () => {
      if (!current()) return;
      // A refusing gateway opens the socket too: the delay keeps growing until a frame came.
      if (this.refusedAt === null) this.delayMs = this.backoff.initialMs;
      this.setState('open');
    });
    socket.addEventListener('message', (event: { data: unknown }) => {
      if (current()) this.receive(event.data);
    });
    // An 'error' event is followed by 'close', so only 'close' is handled.
    socket.addEventListener('close', () => {
      if (!current()) return;
      this.socket = undefined;
      if (this.errorFrameSeen) this.refused();
      else this.scheduleReconnect();
    });
  }

  private receive(data: unknown): void {
    let frame: unknown;
    try {
      frame = JSON.parse(String(data));
    } catch {
      this.options.onError?.({ error: `not JSON: ${String(data).slice(0, 80)}` });
      return;
    }
    if (isErrorFrame(frame)) {
      this.errorFrameSeen = true;
      this.options.onError?.(frame);
      return;
    }
    // A frame after an error frame shows that the stream goes on.
    this.errorFrameSeen = false;
    if (this.refusedAt !== null) {
      this.refusedAt = null;
      this.delayMs = this.backoff.initialMs;
    }
    this.latestFrame = frame as Frame;
    this.options.onFrame?.(this.latestFrame);
  }

  /** The gateway closed the socket after an error frame: again while the time lasts, else `failed`. */
  private refused(): void {
    const now = (this.options.now ?? Date.now)();
    this.refusedAt ??= now;
    const left = this.refusedAt + (this.options.refusedRetryMs ?? REFUSED_RETRY_MS) - now;
    if (left > 0) {
      this.scheduleReconnect(left);
    } else {
      this.refusedAt = null;
      this.setState('failed');
    }
  }

  /** The next attempt after the backoff's delay, and not after `latest` ms. */
  private scheduleReconnect(latest: number = Infinity): void {
    const delay = Math.min(this.delayMs, latest);
    this.delayMs = Math.min(delay * this.backoff.factor, this.backoff.maxMs);
    this.setState('waiting');
    const schedule = this.options.setTimeout ?? ((callback, ms) => globalThis.setTimeout(callback, ms));
    this.timer = schedule(() => {
      this.timer = undefined;
      this.open();
    }, delay);
  }

  private cancelTimer(): void {
    if (this.timer === undefined) return;
    const cancel =
      this.options.clearTimeout ?? ((handle) => globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>));
    cancel(this.timer);
    this.timer = undefined;
  }

  private setState(state: StreamState): void {
    if (state === this.currentState) return;
    this.currentState = state;
    this.options.onState?.(state);
  }
}

function isErrorFrame(frame: unknown): frame is StreamErrorFrame {
  if (typeof frame !== 'object' || frame === null) return false;
  const { error, e } = frame as StreamErrorFrame;
  return typeof error === 'string' || typeof e === 'string';
}

/** `http://localhost:8080` and a path give `ws://localhost:8080/ws/...`. */
export function streamUrl(baseUrl: string, path: string): string {
  return baseUrl.replace(/^http/i, 'ws').replace(/\/+$/, '') + path;
}

export type StreamFactoryOptions<Frame> = Omit<SnapshotStreamOptions<Frame>, 'url'> & {
  /** The gateway, as for the REST client. Default: http://localhost:8080. */
  baseUrl?: string;
};

/** `/ws/v1/machine/snapshot`: about 10 frames per second in a shot, 2 while idle. */
export function machineSnapshotStream(options: StreamFactoryOptions<MachineSnapshot> = {}): SnapshotStream<MachineSnapshot> {
  return create(MACHINE_SNAPSHOT_PATH, options);
}

/**
 * `/ws/v1/scale/snapshot`: about 5 frames per second. The first frame is a status frame
 * without a weight; narrow a frame with `isScaleSnapshot` before reading `weight`.
 */
export function scaleSnapshotStream(options: StreamFactoryOptions<ScaleFrame> = {}): SnapshotStream<ScaleFrame> {
  return create(SCALE_SNAPSHOT_PATH, options);
}

/**
 * `/ws/v1/machine/shotSettings`: the settings the machine holds, one frame when the socket
 * opens and one after every change, whoever made it.
 */
export function machineShotSettingsStream(options: StreamFactoryOptions<ShotSettings> = {}): SnapshotStream<ShotSettings> {
  return create(MACHINE_SHOT_SETTINGS_PATH, options);
}

/** `/ws/v1/machine/waterLevels`: the tank's water level, sent as it changes. */
export function machineWaterLevelsStream(options: StreamFactoryOptions<WaterLevels> = {}): SnapshotStream<WaterLevels> {
  return create(MACHINE_WATER_LEVELS_PATH, options);
}

/**
 * `/ws/v1/devices`: the whole device list when the socket opens and at every change of a
 * device, of the list or of a scan. The channel also takes commands; the skin sends them as
 * REST requests instead.
 */
export function devicesStream(options: StreamFactoryOptions<DevicesState> = {}): SnapshotStream<DevicesState> {
  return create(DEVICES_PATH, options);
}

function create<Frame>(path: string, options: StreamFactoryOptions<Frame>): SnapshotStream<Frame> {
  const { baseUrl = 'http://localhost:8080', ...rest } = options;
  return new SnapshotStream<Frame>({ ...rest, url: streamUrl(baseUrl, path) });
}
