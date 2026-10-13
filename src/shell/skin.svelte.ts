// The skin's live state: the two snapshot streams, the workflow and the screen. One object,
// made once by App.svelte; the screens read it and call its actions.
import {
  DecaidClient,
  isScaleSnapshot,
  isScaleStatus,
  machineSnapshotStream,
  scaleSnapshotStream,
  type MachineSnapshot,
  type MachineState,
  type ScaleFrame,
  type SnapshotStream,
  type Workflow,
} from '../api';
import { gatewayBaseUrl } from './gateway';
import { gatewayAfter, homeAction, linkOf, statusOf, type Gateway } from './machine';
import { followMachine, loadScreen, saveScreen, type Screen } from './nav';
import { recordFrame, type Shot } from './shot';
import { recordSteamFrame, type SteamRun } from '../steam/run';

const CLOCK_MS = 500;

export class Skin {
  readonly baseUrl: string;
  readonly client: DecaidClient;

  screen: Screen = $state(loadScreen());
  /** the machine's latest frame; old while `link` is not 'machine' */
  snapshot: MachineSnapshot | null = $state.raw(null);
  /** the scale's latest weight in g, null without a connected scale */
  weight: number | null = $state(null);
  workflow: Workflow | null = $state.raw(null);
  /** the running shot, or the finished one until it is dismissed */
  shot: Shot | null = $state.raw(null);
  /** the running steam, or the finished one until the next */
  steam: SteamRun | null = $state.raw(null);
  /** what went wrong with the last action, for the user */
  notice: string | null = $state(null);

  private gateway: Gateway = $state('connecting');
  private openedAt: number | null = $state(null);
  private lastFrameAt: number | null = $state(null);
  private now = $state(Date.now());

  readonly link = $derived(linkOf(this.gateway, this.openedAt, this.lastFrameAt, this.now));
  readonly status = $derived.by(() => statusOf(this.link, this.snapshot, this.baseUrl));
  readonly action = $derived(homeAction(this.link, this.snapshot));

  private machine: SnapshotStream<MachineSnapshot> | undefined;
  private scale: SnapshotStream<ScaleFrame> | undefined;
  private clock: ReturnType<typeof setInterval> | undefined;
  private machineState: MachineState | undefined;

  constructor(baseUrl: string = gatewayBaseUrl(location)) {
    this.baseUrl = baseUrl;
    this.client = new DecaidClient({ baseUrl });
  }

  /** Opens both streams. Returns what closes them again. */
  connect(): () => void {
    this.machine = machineSnapshotStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        this.gateway = gatewayAfter(this.gateway, state);
        if (state === 'open') {
          this.openedAt = Date.now();
          // The workflow may have changed while the gateway was away.
          void this.refreshWorkflow();
        } else {
          // What the machine did while the stream was closed is not known.
          this.machineState = undefined;
        }
      },
      onFrame: (frame) => this.onMachineFrame(frame),
    }).connect();
    this.scale = scaleSnapshotStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        if (state !== 'open') this.weight = null;
      },
      onFrame: (frame) => {
        if (isScaleSnapshot(frame)) this.weight = frame.weight;
        else if (isScaleStatus(frame) && frame.status === 'disconnected') this.weight = null;
      },
    }).connect();
    this.clock = setInterval(() => (this.now = Date.now()), CLOCK_MS);
    return () => {
      this.machine?.close();
      this.scale?.close();
      clearInterval(this.clock);
    };
  }

  private onMachineFrame(frame: MachineSnapshot): void {
    this.lastFrameAt = this.now = Date.now();
    this.snapshot = frame;
    const state = frame.state.state;
    const next = followMachine(this.screen, this.machineState, state);
    this.machineState = state;
    this.shot = recordFrame(this.shot, frame, this.weight);
    this.steam = recordSteamFrame(this.steam, frame);
    if (next !== this.screen) this.go(next);
  }

  go(screen: Screen): void {
    this.screen = screen;
    this.notice = null;
    saveScreen(screen);
    // Another client, Decaid's own screen for one, may have changed the workflow meanwhile.
    if (screen === 'home' || screen === 'steam') void this.refreshWorkflow();
  }

  async refreshWorkflow(): Promise<void> {
    try {
      this.workflow = await this.client.getWorkflow();
    } catch {
      // The gateway is away; the stream's state says so.
    }
  }

  /**
   * Asks the machine for a shot. Decaid tares the scale and stops at the workflow's target
   * yield by itself (research.md, section 10); the skin does neither.
   */
  start(): Promise<void> {
    return this.request('espresso', 'The shot did not start');
  }

  startSteam(): Promise<void> {
    return this.request('steam', 'Steam did not start');
  }

  /** Writes the steam timer to the machine: `steamSettings.duration`, whole seconds (spec 3.4). */
  async setSteamTimer(seconds: number): Promise<void> {
    this.notice = null;
    try {
      this.workflow = await this.client.setSteamDuration(Math.max(0, Math.round(seconds)));
    } catch (error) {
      this.notice = `The timer was not set: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  stop(): Promise<void> {
    return this.request('idle', 'The machine did not stop');
  }

  dismissShot(): void {
    if (this.shot?.ended) this.shot = null;
  }

  private async request(state: 'espresso' | 'steam' | 'idle', failure: string): Promise<void> {
    this.notice = null;
    try {
      await this.client.requestMachineState(state);
    } catch (error) {
      this.notice = `${failure}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
