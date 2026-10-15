// The skin's live state: the two snapshot streams, the workflow, the settings and the screen.
// One object, made once by App.svelte; the screens read it and call its actions.
import {
  DecaidClient,
  isScaleSnapshot,
  isScaleStatus,
  isTareBlocked,
  machineShotSettingsStream,
  machineSnapshotStream,
  machineWaterLevelsStream,
  scaleSnapshotStream,
  type MachineSnapshot,
  type MachineState,
  type RequestedMachineState,
  type ScaleFrame,
  type ShotSettings,
  type SnapshotStream,
  type StreamErrorFrame,
  type StreamState,
  type WaterLevels,
  type Workflow,
} from '../api';
import { readUnsaved, type Unsaved } from '../editor/unsaved';
import { restoreEntry, seriesOf, type HistoryEntry } from '../history/entries';
import { PRODUCT_VERSION } from '../product';
import { hasSettings, loadSettings, saveSettings, type Settings } from '../settings';
import { SettingsBackup, atStart, type ReadBackup, type Written } from '../settings-backup';
import { gatewayBaseUrl } from './gateway';
import { canSleep, canStop, gatewayAfter, isAsleep, linkOf, stateLine, statusOf, type Gateway, type ScaleLink } from './machine';
import { followMachine, loadScreen, saveScreen, type Screen } from './nav';
import { recordFrame, type Shot, type ShotSeries } from './shot';
import { applySteamTimer, timerMismatch } from '../steam/apply';
import { recordSteamFrame, type SteamRun } from '../steam/run';

const CLOCK_MS = 500;
/** The screen's brightness while the machine sleeps, 0-100; 100 is the system's own. */
export const SLEEP_BRIGHTNESS = 5;

/** The answer to the warning before a load (founder, 2026-10-14). */
export type LoadAnswer = 'load' | 'cancel' | 'save-as';

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
  /** g/s, the scale's latest weight flow; only the shot graph draws it, next to `weight` */
  private weightFlow: number | null = null;
  workflow: Workflow | null = $state.raw(null);
  /** the settings the machine itself holds, null until its stream has sent them */
  shotSettings: ShotSettings | null = $state.raw(null);
  /** the running shot, or the finished one until it is dismissed */
  shot: Shot | null = $state.raw(null);
  /** the shot history's overlay is open (spec 3.1); only home shows it */
  historyOpen = $state(false);
  /** the history entry that was restored, until it is dismissed or a shot starts */
  recalled: Recalled | null = $state.raw(null);
  /** the running steam, or the finished one until the next */
  steam: SteamRun | null = $state.raw(null);
  /** the tank's water level, null while its stream is not open or has sent nothing */
  water: WaterLevels | null = $state.raw(null);
  /** what the scale stream said about the scale */
  scaleLink: ScaleLink = $state('unknown');
  /** the skin's settings; changed with `setSettings` only, so they are stored */
  settings: Settings = $state.raw(loadSettings());
  /** the time of the last backup of the settings in Decaid's KV store, ISO 8601; null while none is known */
  backupAt: string | null = $state(null);
  /** why the last backup was not written, for the settings page; null after one that was */
  backupError: string | null = $state(null);
  /**
   * The skin started without settings and took them from the backup: its time ('' when the
   * backup has none), said once until it is dismissed (founder, 2026-10-14).
   */
  restoredFrom: string | null = $state(null);
  /** what went wrong with the last action, for the user */
  notice: string | null = $state(null);
  /** what the last action answered that is not an error: a tare Decaid blocks during a shot */
  info: string | null = $state(null);
  /** the error frame of a stream the gateway closed */
  streamError: string | null = $state(null);
  /** where the profile picker goes after a load: back to the editor when it was opened there */
  pickerReturn: 'home' | 'editor' = $state('home');
  /**
   * What the open screen does before it is left with `leave`; false keeps it open. The editor
   * loads changed values here (founder, 2026-10-13).
   */
  leaving: (() => Promise<boolean>) | null = null;
  /** the unsaved edits the warning before a load asks about, while it is open */
  unsaved: Unsaved | null = $state.raw(null);
  /** the editor opens its 'save as' on the machine's values: the warning's 'Save as…' */
  saveAsNext = false;
  private answerUnsaved: ((answer: LoadAnswer) => void) | null = null;

  private gateway: Gateway = $state('connecting');
  private openedAt: number | null = $state(null);
  private lastFrameAt: number | null = $state(null);
  private now = $state(Date.now());
  /** the steam timer this skin set last, in s */
  private steamAsked: number | null = $state(null);
  private machineStream: StreamState = $state('idle');
  private scaleStream: StreamState = $state('idle');

  readonly link = $derived(linkOf(this.gateway, this.openedAt, this.lastFrameAt, this.now));
  readonly status = $derived.by(() => statusOf(this.link, this.snapshot, this.baseUrl));
  readonly canStop = $derived(canStop(this.link, this.snapshot));
  readonly canSleep = $derived(canSleep(this.link, this.snapshot));
  readonly asleep = $derived(isAsleep(this.link, this.snapshot));
  /** the values of the state line, on home and on the steam page */
  readonly stateValues = $derived(stateLine(this.link, this.snapshot, this.water, this.scaleLink, this.weight));
  /**
   * A stream stopped in the state `failed`: the gateway sent an error frame and closed the
   * socket, and the stream does not open again by itself (research.md 9.4). `reconnect` does.
   */
  readonly refused = $derived(this.machineStream === 'failed' || this.scaleStream === 'failed');

  /**
   * The steam timer in s: the machine's own, and the workflow's `steamSettings.duration` only
   * while the machine's settings are not known. The two can differ (research.md, section 16).
   */
  readonly steamTimer = $derived(
    this.shotSettings?.targetSteamDuration ?? this.workflow?.steamSettings?.duration ?? null,
  );
  /** The machine's timer is not the one set here any more: what the steam page says about it. */
  readonly steamMismatch = $derived(timerMismatch(this.steamAsked, this.shotSettings?.targetSteamDuration ?? null));

  private machine: SnapshotStream<MachineSnapshot> | undefined;
  private machineSettings: SnapshotStream<ShotSettings> | undefined;
  private waterLevels: SnapshotStream<WaterLevels> | undefined;
  private scale: SnapshotStream<ScaleFrame> | undefined;
  private clock: ReturnType<typeof setInterval> | undefined;
  private machineState: MachineState | undefined;
  /** the skin lowered the screen's brightness for a sleeping machine */
  private dimmed = false;
  private readonly backup: SettingsBackup;
  /** localStorage held settings when the skin started; without them a backup is restored */
  private readonly hadSettings = hasSettings();
  /** the settings were changed since the start: a backup read later must not replace them */
  private settingsChanged = false;
  /** the backup was read once at the start, or is being read */
  private backupRead: Promise<void> | null = null;

  constructor(baseUrl: string = gatewayBaseUrl(location)) {
    this.baseUrl = baseUrl;
    this.client = new DecaidClient({ baseUrl });
    this.backup = new SettingsBackup(this.client, PRODUCT_VERSION, (written) => this.onBackupWritten(written));
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
          // The workflow may have changed while the gateway was away.
          void this.refreshWorkflow();
          void this.readBackup();
          // The settings' stream ends with an error frame while no machine is connected.
          this.machineSettings?.connect();
          this.waterLevels?.connect();
        } else {
          // What the machine did while the stream was closed is not known.
          this.machineState = undefined;
        }
      },
      onFrame: (frame) => this.onMachineFrame(frame),
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
      // The first frame is a status frame without a weight; a weight only comes from a scale.
      onFrame: (frame) => {
        if (isScaleSnapshot(frame)) {
          this.weight = frame.weight;
          this.weightFlow = typeof frame.weightFlow === 'number' ? frame.weightFlow : null;
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
      this.machineSettings?.close();
      this.waterLevels?.close();
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
    this.shot = recordFrame(this.shot, frame, this.weight, this.weightFlow);
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
    this.machineSettings?.connect();
    this.waterLevels?.connect();
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
    if (screen === 'profiles') this.pickerReturn = this.screen === 'editor' ? 'editor' : 'home';
    this.screen = screen;
    this.historyOpen = false;
    this.notice = this.info = null;
    saveScreen(screen);
    // Another client, Decaid's own screen for one, may have changed the workflow meanwhile.
    if (screen === 'home' || screen === 'steam') void this.refreshWorkflow();
  }

  /** `go`, after the open screen's `leaving` agreed: the back arrow and the editor's shortcut. */
  async leave(screen: Screen): Promise<void> {
    if (this.leaving && !(await this.leaving())) return;
    this.go(screen);
  }

  async refreshWorkflow(): Promise<void> {
    try {
      this.workflow = await this.client.getWorkflow();
    } catch {
      // The gateway is away; the stream's state says so.
    }
  }

  /**
   * Writes the steam timer, whole seconds (spec 3.4): to the workflow's `steamSettings.duration`,
   * and to the machine's own settings where Decaid did not pass it on (`applySteamTimer`).
   */
  async setSteamTimer(seconds: number): Promise<void> {
    this.notice = null;
    this.steamAsked = null;
    const asked = Math.max(0, Math.round(seconds));
    try {
      this.workflow = (await applySteamTimer(this.client, asked, () => this.shotSettings)).workflow;
      this.steamAsked = asked;
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

  /**
   * Changes settings and stores them (localStorage: they survive a reload and the WebView),
   * and writes their backup to Decaid's KV store a moment later (founder, 2026-10-14).
   */
  setSettings(change: Partial<Settings>): void {
    this.settings = { ...this.settings, ...change };
    this.settingsChanged = true;
    saveSettings(this.settings);
    this.backup.schedule(this.settings);
  }

  /**
   * Reads the backup once the gateway answers, until it was read once. A start without
   * settings in localStorage takes the backup's; settings that differ from the backup, or
   * have none yet, are backed up.
   */
  private readBackup(): Promise<void> {
    this.backupRead ??= (async () => {
      let backup: ReadBackup | null;
      try {
        backup = await this.backup.read();
      } catch {
        this.backupRead = null;
        return;
      }
      if (!this.backupAt) this.backupAt = backup?.savedAt ?? null;
      const action = atStart(this.hadSettings, this.settingsChanged, backup, this.settings);
      if (action === 'restore' && backup) {
        this.settings = backup.settings;
        saveSettings(this.settings);
        this.restoredFrom = backup.savedAt ?? '';
      } else if (action === 'write') {
        this.backup.schedule(this.settings);
      }
    })();
    return this.backupRead;
  }

  /** The settings page's 'Restore from backup': the backup's settings, or null when there is none. Throws when it cannot be read. */
  async restoreBackup(): Promise<ReadBackup | null> {
    const backup = await this.backup.read();
    if (!backup) return null;
    this.backup.cancel();
    this.settings = backup.settings;
    this.settingsChanged = true;
    saveSettings(this.settings);
    this.backupAt = backup.savedAt;
    return backup;
  }

  private onBackupWritten(written: Written): void {
    if ('savedAt' in written) {
      this.backupAt = written.savedAt;
      this.backupError = null;
    } else {
      this.backupError = `The backup in Decaid was not written: ${written.error}`;
    }
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
    const answer = await this.mayLoad();
    if (answer === 'save-as') this.openSaveAs();
    if (answer !== 'load') return;
    try {
      this.workflow = await restoreEntry(this.client, entry);
      this.recalled = { entry, series: seriesOf(await this.client.getShot(entry.latest.id)) };
    } catch (error) {
      this.notice = `The entry was not restored: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * Asked before every load of the skin (founder, 2026-10-14): while the machine holds unsaved
   * edits from the editor (`readUnsaved`), the warning is shown and nothing is loaded before its
   * answer. 'load' when there are none, or when they could not be read: the load then says
   * what went wrong. 'save-as' leaves the opening of the editor's save as to the caller
   * (`openSaveAs`, or the editor itself).
   */
  async mayLoad(): Promise<LoadAnswer> {
    let unsaved: Unsaved | null;
    try {
      unsaved = await readUnsaved(this.client);
    } catch {
      return 'load';
    }
    if (!unsaved) return 'load';
    this.unsaved = unsaved;
    const answer = await new Promise<LoadAnswer>((resolve) => (this.answerUnsaved = resolve));
    this.unsaved = null;
    this.answerUnsaved = null;
    return answer;
  }

  /** The warning's buttons. */
  answerLoad(answer: LoadAnswer): void {
    this.answerUnsaved?.(answer);
  }

  /** The warning's 'Save as…' outside the editor: the editor opens on the machine's values and asks for a name. */
  openSaveAs(): void {
    this.saveAsNext = true;
    this.go('editor');
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
