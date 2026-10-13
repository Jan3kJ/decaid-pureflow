// The skin's live state: the two snapshot streams, the workflow, the settings and the screen.
// One object, made once by App.svelte; the screens read it and call its actions.
import {
  DecaidClient,
  isScaleSnapshot,
  isScaleStatus,
  isTareBlocked,
  machineSnapshotStream,
  scaleSnapshotStream,
  type MachineSnapshot,
  type MachineState,
  type RequestedMachineState,
  type ScaleFrame,
  type SnapshotStream,
  type StreamErrorFrame,
  type StreamState,
  type Workflow,
} from '../api';
import { restoreEntry, seriesOf, type HistoryEntry } from '../history/entries';
import { loadSettings, saveSettings, type Settings } from '../settings';
import { gatewayBaseUrl } from './gateway';
import { canSleep, gatewayAfter, homeAction, isAsleep, linkOf, statusOf, type Gateway, type ScaleLink } from './machine';
import { followMachine, loadScreen, saveScreen, type Screen } from './nav';
import { recordFrame, type Shot, type ShotSeries } from './shot';
import { recordSteamFrame, type SteamRun } from '../steam/run';

const CLOCK_MS = 500;
/** The screen's brightness while the machine sleeps, 0-100; 100 is the system's own. */
export const SLEEP_BRIGHTNESS = 5;

/** An entry of the shot history that was made the current one, with its latest shot's graph. */
export interface Recalled {
  entry: HistoryEntry;
  series: ShotSeries;
}

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
  /** the shot history's overlay is open (spec 3.1); only home shows it */
  historyOpen = $state(false);
  /** the history entry that was restored, until it is dismissed or a shot starts */
  recalled: Recalled | null = $state.raw(null);
  /** the running steam, or the finished one until the next */
  steam: SteamRun | null = $state.raw(null);
  /** what the scale stream said about the scale */
  scaleLink: ScaleLink = $state('unknown');
  /** the skin's settings; changed with `setSettings` only, so they are stored */
  settings: Settings = $state.raw(loadSettings());
  /** what went wrong with the last action, for the user */
  notice: string | null = $state(null);
  /** what the last action answered that is not an error: a tare Decaid blocks during a shot */
  info: string | null = $state(null);
  /** the error frame of a stream the gateway closed */
  streamError: string | null = $state(null);

  private gateway: Gateway = $state('connecting');
  private openedAt: number | null = $state(null);
  private lastFrameAt: number | null = $state(null);
  private now = $state(Date.now());
  private machineStream: StreamState = $state('idle');
  private scaleStream: StreamState = $state('idle');

  readonly link = $derived(linkOf(this.gateway, this.openedAt, this.lastFrameAt, this.now));
  readonly status = $derived.by(() => statusOf(this.link, this.snapshot, this.baseUrl));
  readonly action = $derived(homeAction(this.link, this.snapshot));
  readonly canSleep = $derived(canSleep(this.link, this.snapshot));
  readonly asleep = $derived(isAsleep(this.link, this.snapshot));
  /**
   * A stream stopped in the state `failed`: the gateway sent an error frame and closed the
   * socket, and the stream does not open again by itself (research.md 9.4). `reconnect` does.
   */
  readonly refused = $derived(this.machineStream === 'failed' || this.scaleStream === 'failed');

  private machine: SnapshotStream<MachineSnapshot> | undefined;
  private scale: SnapshotStream<ScaleFrame> | undefined;
  private clock: ReturnType<typeof setInterval> | undefined;
  private machineState: MachineState | undefined;
  /** the skin lowered the screen's brightness for a sleeping machine */
  private dimmed = false;

  constructor(baseUrl: string = gatewayBaseUrl(location)) {
    this.baseUrl = baseUrl;
    this.client = new DecaidClient({ baseUrl });
  }

  /** Opens both streams. Returns what closes them again. */
  connect(): () => void {
    this.machine = machineSnapshotStream({
      baseUrl: this.baseUrl,
      onState: (state) => {
        this.machineStream = state;
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
      onError: (frame) => this.onStreamError(frame),
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
      // The first frame is a status frame without a weight; a weight only comes from a scale.
      onFrame: (frame) => {
        if (isScaleSnapshot(frame)) {
          this.weight = frame.weight;
          this.scaleLink = 'connected';
        } else if (isScaleStatus(frame)) {
          this.scaleLink = frame.status === 'connected' ? 'connected' : 'disconnected';
          if (this.scaleLink === 'disconnected') this.weight = null;
        }
      },
      onError: (frame) => this.onStreamError(frame),
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
    if (this.shot && !this.shot.ended) this.recalled = null;
    this.steam = recordSteamFrame(this.steam, frame);
    if (next !== this.screen) this.go(next);
    void this.dim(state === 'sleeping');
  }

  private onStreamError(frame: StreamErrorFrame): void {
    this.streamError = frame.error ?? frame.e ?? null;
  }

  /** Opens a stream that stopped in `failed` again; the others are left as they are. */
  reconnect(): void {
    this.streamError = null;
    this.machine?.connect();
    this.scale?.connect();
  }

  /**
   * The screen follows the machine's sleep: dim while it sleeps, the system's own brightness
   * again when it is awake. Only where Decaid says the platform can (spec 3.1); elsewhere the
   * brightness is not touched.
   */
  private async dim(asleep: boolean): Promise<void> {
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

  go(screen: Screen): void {
    this.screen = screen;
    this.historyOpen = false;
    this.notice = this.info = null;
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

  /** The state for sleep is `sleeping` (research.md, section 9). */
  sleep(): Promise<void> {
    return this.request('sleeping', 'The machine did not go to sleep');
  }

  wake(): Promise<void> {
    return this.request('idle', 'The machine did not wake');
  }

  /**
   * Tares the scale. Decaid refuses it during a shot when its setting `blockTareDuringShot`
   * is on: that is what the user asked Decaid for, so it is a notice and not an error.
   */
  async tare(): Promise<void> {
    this.notice = this.info = null;
    try {
      await this.client.tareScale();
    } catch (error) {
      if (isTareBlocked(error)) this.info = 'No tare while a shot runs: Decaid blocks it (its setting "block tare during shot").';
      else this.notice = `The scale was not tared: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /** Changes settings and stores them (localStorage: they survive a reload and the WebView). */
  setSettings(change: Partial<Settings>): void {
    this.settings = { ...this.settings, ...change };
    saveSettings(this.settings);
  }

  dismissShot(): void {
    if (this.shot?.ended) this.shot = null;
  }

  /**
   * An entry of the shot history was tapped (spec 3.5): the overlay closes, the entry's
   * profile, bean and grinder setting become the current ones, and home shows the graph of
   * the last shot made with it. Only `GET /api/v1/shots/{id}` has the measurements.
   */
  async restore(entry: HistoryEntry): Promise<void> {
    this.historyOpen = false;
    this.notice = this.info = null;
    try {
      this.workflow = await restoreEntry(this.client, entry);
      this.recalled = { entry, series: seriesOf(await this.client.getShot(entry.latest.id)) };
    } catch (error) {
      this.notice = `The entry was not restored: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  dismissRecalled(): void {
    this.recalled = null;
  }

  private async request(state: RequestedMachineState, failure: string): Promise<void> {
    this.notice = this.info = null;
    try {
      await this.client.requestMachineState(state);
    } catch (error) {
      this.notice = `${failure}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
}
