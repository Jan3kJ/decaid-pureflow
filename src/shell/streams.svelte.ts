// The skin's streams from the gateway: the machine's snapshot, its settings and water levels,
// the scale and the devices, the link they make, and the scale's retry rounds (spec 3.9). A
// part of `Skin`, which hands its stream fields to it and gets the frames that change the
// workflow, the shot and the screen (`StreamHandlers`).
import {
  devicesStream,
  isScaleSnapshot,
  isScaleStatus,
  machineShotSettingsStream,
  machineSnapshotStream,
  machineWaterLevelsStream,
  scaleSnapshotStream,
  type DecaidClient,
  type DevicesState,
  type MachineSnapshot,
  type MachineState,
  type ScaleFrame,
  type ShotSettings,
  type SnapshotStream,
  type StreamErrorFrame,
  type StreamState,
  type WaterLevels,
} from '../api';
import { gatewayAfter, linkOf, type Gateway, type ScaleLink } from './machine';
import { ScaleRetry } from './scale-retry';
import { frameTime } from './shot';
import { smooth, type Smoothed } from './smooth';

const CLOCK_MS = 500;

/** What the skin does with the streams' news. */
export interface StreamHandlers {
  /** the machine stream opened: at the start, and again after a lost connection */
  onOpen(): void;
  /** a frame of the machine stream; the skin records it with `machineFrame` */
  onMachineFrame(frame: MachineSnapshot): void;
  /** a weight of the scale, in g, read at `at` (ms, the frame's timestamp; NaN without one) */
  onWeight(weight: number, at: number): void;
}

export class Streams {
  /** the machine's latest frame; old while `link` is not 'machine' */
  snapshot: MachineSnapshot | null = $state.raw(null);
  /**
   * `snapshot` with its group and steam temperatures filtered (`smooth`, spec 3.12): the values
   * the state line shows. Graphs, shots, the heating decision and writes read `snapshot`.
   */
  shown: MachineSnapshot | null = $state.raw(null);
  /** the scale's latest weight in g, null without a connected scale */
  weight: number | null = $state(null);
  /** g/s, the scale's latest weight flow; only the shot graph draws it, next to `weight` */
  weightFlow: number | null = null;
  /** the settings the machine itself holds, null until its stream has sent them */
  shotSettings: ShotSettings | null = $state.raw(null);
  /** the tank's water level, null while its stream is not open or has sent nothing */
  water: WaterLevels | null = $state.raw(null);
  /** what the scale stream said about the scale */
  scaleLink: ScaleLink = $state('unknown');
  /** a round of scans for the scale runs (spec 3.9, `ScaleRetry`) */
  scaleLooking = $state(false);
  /** the error frame of a stream the gateway closed */
  streamError: string | null = $state(null);

  private gateway: Gateway = $state('connecting');
  private openedAt: number | null = $state(null);
  private lastFrameAt: number | null = $state(null);
  private now = $state(Date.now());
  private machineStream: StreamState = $state('idle');
  private scaleStream: StreamState = $state('idle');

  readonly link = $derived(linkOf(this.gateway, this.openedAt, this.lastFrameAt, this.now));
  /**
   * A stream stopped in the state `failed`: the gateway sent an error frame and closed the
   * socket, and did so again while the stream tried for 30 s. It does not try again by itself
   * after that; `reconnect` does.
   */
  readonly refused = $derived(this.machineStream === 'failed' || this.scaleStream === 'failed');

  private machine: SnapshotStream<MachineSnapshot> | undefined;
  private machineSettings: SnapshotStream<ShotSettings> | undefined;
  private waterLevels: SnapshotStream<WaterLevels> | undefined;
  private scale: SnapshotStream<ScaleFrame> | undefined;
  /** `/ws/v1/devices`, read only for whether Decaid scans: no round scans while it does */
  private devices: SnapshotStream<DevicesState> | undefined;
  private decaidScanning = false;
  /** ms, when the machine last left `sleeping` */
  private wokeAt: number | null = null;
  /** the machine's state in its last frame; undefined while the stream is not open */
  private state: MachineState | undefined;
  /** the filters of the group and the steam temperature */
  private group: Smoothed | null = null;
  private steam: Smoothed | null = null;
  private readonly scaleRetry: ScaleRetry;
  private clock: ReturnType<typeof setInterval> | undefined;
  private readonly baseUrl: string;
  private readonly handlers: StreamHandlers;

  constructor(baseUrl: string, client: DecaidClient, handlers: StreamHandlers) {
    this.baseUrl = baseUrl;
    this.handlers = handlers;
    this.scaleRetry = new ScaleRetry({
      scaleConnected: () => this.scaleLink === 'connected',
      machineAsleep: () => this.state === 'sleeping',
      wokeAt: () => this.wokeAt,
      decaidScanning: () => this.decaidScanning,
      preferredScale: async () => {
        try {
          return (await client.getSettings()).preferredScaleId ?? null;
        } catch {
          return null;
        }
      },
      scan: async () => {
        await client.scanDevices({ connect: true, quick: true });
      },
      onLooking: (looking) => (this.scaleLooking = looking),
    });
  }

  /** the machine's state in its last frame; undefined while the stream is not open */
  get machineState(): MachineState | undefined {
    return this.state;
  }

  /** Opens the streams. Returns what closes them again. */
  connect(): () => void {
    this.machine = machineSnapshotStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        this.machineStream = state;
        this.gateway = gatewayAfter(this.gateway, state);
        if (state === 'open') {
          this.openedAt = Date.now();
          this.handlers.onOpen();
          // The settings' stream ends with an error frame while no machine is connected.
          this.machineSettings?.connect();
          this.waterLevels?.connect();
        } else {
          // What the machine did while the stream was closed is not known.
          this.state = undefined;
        }
      },
      onFrame: (frame) => this.handlers.onMachineFrame(frame),
      onError: (frame) => this.onStreamError(frame),
    }).connect();
    // Without this stream the steam page shows the workflow's timer, so its failure is silent.
    this.machineSettings = machineShotSettingsStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        if (state !== 'open') this.shotSettings = null;
      },
      onFrame: (frame) => (this.shotSettings = frame),
    }).connect();
    // The tank is only a value of the state line, so a failure of its stream is silent too.
    this.waterLevels = machineWaterLevelsStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        if (state !== 'open') this.water = null;
      },
      onFrame: (frame) => (this.water = frame),
    }).connect();
    this.scale = scaleSnapshotStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        this.scaleStream = state;
        if (state !== 'open') {
          this.weight = null;
          this.scaleLink = 'unknown';
        }
      },
      onFrame: (frame) => this.onScaleFrame(frame),
      onError: (frame) => this.onStreamError(frame),
    }).connect();
    this.devices = devicesStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        if (state !== 'open') this.decaidScanning = false;
      },
      onFrame: (frame) => (this.decaidScanning = frame.scanning === true),
    }).connect();
    this.clock = setInterval(() => (this.now = Date.now()), CLOCK_MS);
    return () => {
      this.machine?.close();
      this.machineSettings?.close();
      this.waterLevels?.close();
      this.scale?.close();
      this.devices?.close();
      this.scaleRetry.stop();
      clearInterval(this.clock);
    };
  }

  /** Records a frame of the machine stream. Returns the machine's state before it. */
  machineFrame(frame: MachineSnapshot): MachineState | undefined {
    const before = this.state;
    this.lastFrameAt = this.now = Date.now();
    this.snapshot = frame;
    this.group = smooth(this.group, this.now, frame.groupTemperature);
    this.steam = smooth(this.steam, this.now, frame.steamTemperature);
    this.shown = { ...frame, groupTemperature: this.group.value, steamTemperature: this.steam.value };
    const state = frame.state.state;
    if (before === 'sleeping' && state !== 'sleeping') this.wokeAt = Date.now();
    this.state = state;
    return before;
  }

  /** The first frame is a status frame without a weight; a weight only comes from a scale. */
  private onScaleFrame(frame: ScaleFrame): void {
    const before = this.scaleLink;
    if (isScaleSnapshot(frame)) {
      this.weight = frame.weight;
      this.weightFlow = typeof frame.weightFlow === 'number' ? frame.weightFlow : null;
      this.handlers.onWeight(frame.weight, frameTime(frame.timestamp));
      this.scaleLink = 'connected';
    } else if (isScaleStatus(frame)) {
      this.scaleLink = frame.status === 'connected' ? 'connected' : 'disconnected';
      if (this.scaleLink === 'disconnected') this.weight = null;
    }
    // A drop, or no scale in the stream's first frame: a round looks for it (spec 3.9).
    if (this.scaleLink === 'connected') this.scaleRetry.stop();
    else if (before !== 'disconnected' && !this.scaleRetry.looking) this.scaleRetry.start(false);
  }

  private onStreamError(frame: StreamErrorFrame): void {
    this.streamError = frame.error ?? frame.e ?? null;
  }

  /** Opens a stream that stopped in `failed` again; the others are left as they are. */
  reconnect(): void {
    this.streamError = null;
    this.machine?.connect();
    this.machineSettings?.connect();
    this.waterLevels?.connect();
    this.scale?.connect();
    this.devices?.connect();
  }

  /** A round of scans for the scale by hand, scanning at once. */
  findScale(): void {
    this.scaleRetry.start(true);
  }
}
