// The skin's live state: the screen, the workflow, the shot and the actions the screens call.
// One object, made once by App.svelte; the screens read it and call its actions. It hands the
// work to its parts: the streams (streams.svelte.ts), the settings and their backup
// (settings-store.svelte.ts), steam (steam-control.svelte.ts), the history and its restore
// (recall.svelte.ts), the warning before a load (load-warning.svelte.ts), the screen's
// brightness in sleep (dimmer.ts), who asked for a sleep (sleep.ts) and the bean and grinder
// catalogue (src/beans/catalogue.svelte.ts).
import { Catalogue } from '../beans/catalogue.svelte';
import { DecaidClient, isTareBlocked, type MachineSnapshot, type RequestedMachineState, type Workflow } from '../api';
import type { HistoryEntry, HistoryFilter } from '../history/entries';
import { ShotCache } from '../history/shots.svelte';
import type { Settings } from '../settings';
import type { ReadBackup } from '../settings-backup';
import { Dimmer } from './dimmer';
import { Heartbeat } from './heartbeat';
import { gatewayBaseUrl } from './gateway';
import { LoadWarning, type LoadAnswer } from './load-warning.svelte';
import {
  canSleep,
  canStop,
  heaterWord,
  heatingStatus,
  isAsleep,
  stateLine,
  statusOf,
  type HeaterWord,
  type HeatTarget,
  type Status,
} from './machine';
import { followMachine, loadScreen, saveScreen, type Screen } from './nav';
import { doseToSet } from './profiles';
import { Recall, type Recalled } from './recall.svelte';
import { SettingsStore } from './settings-store.svelte';
import { AWAKE, askSleep, followSleep, type SleepMark } from './sleep';
import { recordFrame, settleWeight, type Shot } from './shot';
import { SteamControl } from './steam-control.svelte';
import { Streams } from './streams.svelte';
import { recordWaterFrame, type WaterRun } from './water';
import { writeHotWater, type HotWaterField } from '../hotwater/hot-water';
import { errorMessage } from '../error-message';

export class Skin {
  readonly baseUrl: string;
  readonly client: DecaidClient;
  /** the shots read from Decaid for the session: the history, the restore and the expected length (spec 3.8) */
  readonly shots: ShotCache;
  /** Decaid's beans and grinders, and the pick for the next shot (spec 3.9 item 19) */
  readonly catalogue: Catalogue;

  screen: Screen = $state(loadScreen());
  workflow: Workflow | null = $state.raw(null);
  /** the running shot, or the finished one until the next starts: home shows it (spec 3.11) */
  shot: Shot | null = $state.raw(null);
  /** a shot runs: home shows it live, and the pages do not swipe */
  get shotRunning(): boolean {
    return this.shot !== null && !this.shot.ended;
  }
  /** the running hot water or flush, or the finished one until the next (spec 3.6) */
  waterRun: WaterRun | null = $state.raw(null);
  /** what went wrong with the last action, for the user */
  notice: string | null = $state(null);
  /** what the last action answered that is not an error: a tare Decaid blocks during a shot */
  info: string | null = $state(null);
  /** where the profile picker goes after a load: back to the editor when it was opened there */
  pickerReturn: 'home' | 'editor' = $state('home');
  /**
   * What the open screen does before it is left with `leave`; false keeps it open. The editor
   * loads changed values here.
   */
  leaving: (() => Promise<boolean>) | null = null;
  /** the editor opens its 'save as' on the machine's values: the warning's 'Save as…' */
  saveAsNext = false;

  private readonly streams: Streams;
  private readonly store: SettingsStore;
  private readonly steamer: SteamControl;
  private readonly recall: Recall;
  private readonly warning: LoadWarning;
  private readonly dimmer: Dimmer;
  private readonly heartbeat: Heartbeat;
  /** who asked for the machine's sleep (`followSleep`) */
  private sleepMark: SleepMark = $state.raw(AWAKE);

  /** the last `heaterWord` of each heater; plain, since only `statusFor` reads and writes it */
  private readonly heaters: Record<HeatTarget, HeaterWord | null> = { group: null, steam: null };

  readonly status = $derived.by(() => statusOf(this.link, this.shown, this.baseUrl));
  /**
   * The status of a page that waits for a heater (spec 3.8, 3.12): home and hot water the group,
   * steam the steam heater. It reads the filtered temperatures (`shown`), as the state line does.
   */
  statusFor(target: HeatTarget | null): Status {
    if (!target) return this.status;
    const word = heaterWord(this.shown, target, this.shotSettings, this.heaters[target]);
    // The last word of each heater, for the hysteresis; a machine that runs or a lost link keeps it.
    if (word && this.link === 'machine') this.heaters[target] = word;
    return heatingStatus(this.status, this.link, word);
  }
  readonly canStop = $derived(canStop(this.link, this.snapshot));
  readonly canSleep = $derived(canSleep(this.link, this.snapshot));
  /** the machine sleeps, whoever put it to sleep */
  readonly machineAsleep = $derived(isAsleep(this.link, this.snapshot));
  /** the Asleep screen is shown: the machine sleeps, and not by 'Machine sleep' (spec 3.10) */
  readonly asleep = $derived(this.machineAsleep && !this.sleepMark.machineOnly);
  /** the values of the state line, on home and on the steam page */
  readonly stateValues = $derived(stateLine(this.link, this.shown, this.water, this.scaleLink, this.weight, this.scaleLooking));

  constructor(baseUrl: string = gatewayBaseUrl(location)) {
    this.baseUrl = baseUrl;
    this.client = new DecaidClient({ baseUrl });
    this.shots = new ShotCache(this.client);
    this.catalogue = new Catalogue(this);
    this.store = new SettingsStore(this.client);
    this.steamer = new SteamControl(this);
    this.recall = new Recall(this);
    this.warning = new LoadWarning(this.client);
    this.dimmer = new Dimmer(this.client);
    this.heartbeat = new Heartbeat(this.client);
    this.streams = new Streams(baseUrl, this.client, {
      onOpen: () => {
        // The workflow may have changed while the gateway was away.
        void this.refreshWorkflow();
        void this.store.readAtStart();
        // Once in the background after the start; after a lost connection, what is new.
        this.shots.sync().catch(() => undefined);
      },
      onMachineFrame: (frame) => this.onMachineFrame(frame),
      onWeight: (weight) => (this.shot = settleWeight(this.shot, weight)),
    });
  }

  // --- the streams (streams.svelte.ts) ---

  /** the machine's latest frame; old while `link` is not 'machine' */
  get snapshot(): MachineSnapshot | null {
    return this.streams.snapshot;
  }
  /** `snapshot` with the group and steam temperatures filtered, for the state line only */
  get shown(): MachineSnapshot | null {
    return this.streams.shown;
  }
  /** the scale's latest weight in g, null without a connected scale */
  get weight(): number | null {
    return this.streams.weight;
  }
  /** the settings the machine itself holds, null until its stream has sent them */
  get shotSettings(): Streams['shotSettings'] {
    return this.streams.shotSettings;
  }
  /** the tank's water level, null while its stream is not open or has sent nothing */
  get water(): Streams['water'] {
    return this.streams.water;
  }
  /** what the scale stream said about the scale */
  get scaleLink(): Streams['scaleLink'] {
    return this.streams.scaleLink;
  }
  set scaleLink(link: Streams['scaleLink']) {
    this.streams.scaleLink = link;
  }
  /** a round of scans for the scale runs (spec 3.9, `ScaleRetry`) */
  get scaleLooking(): boolean {
    return this.streams.scaleLooking;
  }
  /** the error frame of a stream the gateway closed */
  get streamError(): string | null {
    return this.streams.streamError;
  }
  get link(): Streams['link'] {
    return this.streams.link;
  }
  /** A stream stopped in the state `failed`; `reconnect` opens it again. */
  get refused(): boolean {
    return this.streams.refused;
  }

  // --- the settings and their backup (settings-store.svelte.ts) ---

  /** the skin's settings; changed with `setSettings` only, so they are stored */
  get settings(): Settings {
    return this.store.settings;
  }
  /** the time of the last backup of the settings in Decaid's KV store, ISO 8601; null while none is known */
  get backupAt(): string | null {
    return this.store.backupAt;
  }
  /** why the last backup was not written, for the settings page; null after one that was */
  get backupError(): string | null {
    return this.store.backupError;
  }
  /** The skin started without settings and took them from the backup: its time, said once until it is dismissed. */
  get restoredFrom(): string | null {
    return this.store.restoredFrom;
  }
  set restoredFrom(from: string | null) {
    this.store.restoredFrom = from;
  }

  // --- steam (steam-control.svelte.ts) ---

  /** the running steam, or the finished one until the next */
  get steam(): SteamControl['run'] {
    return this.steamer.run;
  }
  /** the adjust button selected on the steam page (spec 3.7): its place in the settings' list, null for none */
  get steamAdjust(): number | null {
    return this.steamer.adjust;
  }
  set steamAdjust(index: number | null) {
    this.steamer.adjust = index;
  }
  /** The steam timer in s: the machine's own, the workflow's only while the machine's settings are not known. */
  get steamTimer(): number | null {
    return this.steamer.timer;
  }
  /** s, the amount of the selected adjust button, null without one */
  get steamAdjustment(): number | null {
    return this.steamer.adjustment;
  }
  /** the steam heater, on or off (spec 3.7, home's menu); null while neither the machine nor the workflow is known */
  get steamHeater(): SteamControl['heater'] {
    return this.steamer.heater;
  }
  /** The machine's timer is not the one set here any more: what the steam page says about it. */
  get steamMismatch(): SteamControl['mismatch'] {
    return this.steamer.mismatch;
  }

  // --- the history and its restore (recall.svelte.ts) ---

  /** the shot history's overlay is open (spec 3.1); only home shows it */
  get historyOpen(): boolean {
    return this.recall.historyOpen;
  }
  set historyOpen(open: boolean) {
    this.recall.historyOpen = open;
  }
  /** the history's filter by bean and grinder, for the session */
  get historyFilter(): HistoryFilter {
    return this.recall.historyFilter;
  }
  set historyFilter(filter: HistoryFilter) {
    this.recall.historyFilter = filter;
  }
  /** the history entry that was restored, until it is dismissed or a shot starts */
  get recalled(): Recalled | null {
    return this.recall.recalled;
  }
  /** s, where the running shot graph's time axis starts (spec 3.8) */
  get expectedSeconds(): number {
    return this.recall.expectedSeconds;
  }

  // --- the warning before a load (load-warning.svelte.ts) ---

  /** the unsaved edits the warning before a load asks about, while it is open */
  get unsaved(): LoadWarning['unsaved'] {
    return this.warning.unsaved;
  }

  /** Opens the streams. Returns what closes them again. */
  connect(): () => void {
    const closeStreams = this.streams.connect();
    const stopFollowing = this.recall.follow();
    return () => {
      stopFollowing();
      closeStreams();
    };
  }

  private onMachineFrame(frame: MachineSnapshot): void {
    const before = this.streams.machineFrame(frame);
    const state = frame.state.state;
    const next = followMachine(this.screen, before, state);
    // A shot starts: home shows it, over the history too.
    if (state === 'espresso' && before !== 'espresso') this.historyOpen = false;
    const running = this.shot !== null && !this.shot.ended;
    this.shot = recordFrame(this.shot, frame, this.weight, this.streams.weightFlow);
    if (this.shot && !this.shot.ended) this.recall.recalled = null;
    if (running && this.shot?.ended) this.recall.shotEnded(this.shot);
    this.steamer.frame(frame);
    this.waterRun = recordWaterFrame(this.waterRun, frame);
    if (next !== this.screen) this.go(next);
    this.sleepMark = followSleep(this.sleepMark, before, state);
    void this.dimmer.follow(state === 'sleeping' && !this.sleepMark.machineOnly);
  }

  /** Opens a stream that stopped in `failed` again; the others are left as they are. */
  reconnect(): void {
    this.streams.reconnect();
  }

  go(screen: Screen): void {
    if (screen === 'profiles') this.pickerReturn = this.screen === 'editor' ? 'editor' : 'home';
    this.screen = screen;
    this.historyOpen = false;
    this.notice = this.info = null;
    saveScreen(screen);
    // Another client, Decaid's own screen for one, may have changed the workflow meanwhile.
    if (screen === 'home' || screen === 'steam' || screen === 'hot-water') void this.refreshWorkflow();
  }

  /** `go`, after the open screen's `leaving` agreed: the back arrow and the editor's shortcut. */
  async leave(screen: Screen): Promise<void> {
    if (await this.mayLeave()) this.go(screen);
  }

  /** Whether the open screen agrees to be left, after doing what it does then (`leaving`). */
  async mayLeave(): Promise<boolean> {
    return !this.leaving || (await this.leaving());
  }

  /**
   * Reads the workflow; one without a dose takes the default dose of the settings (`doseToSet`),
   * so a shot pulled next has one. Read at every open of the stream and on home.
   */
  async refreshWorkflow(): Promise<void> {
    const writes = this.hotWaterWritten;
    try {
      const workflow = await this.client.getWorkflow();
      const dose = doseToSet(workflow, this.settings.defaultDose);
      const answer = dose === null ? workflow : await this.client.updateWorkflow({ context: { targetDoseWeight: dose } });
      // A hot water value written meanwhile is newer than this read.
      if (writes === this.hotWaterWritten) this.workflow = answer;
    } catch {
      // The gateway is away; the stream's state says so.
    }
  }

  /** Writes the steam timer, whole seconds (spec 3.4); see `SteamControl.setTimer`. */
  setSteamTimer(seconds: number): Promise<void> {
    return this.steamer.setTimer(seconds);
  }

  /** the hot water writes in flight, one after another (`setHotWater`) */
  private hotWaterWrites: Promise<void> = Promise.resolve();
  /** how many hot water writes were started, so a workflow read answered after one is dropped */
  private hotWaterWritten = 0;

  /**
   * Writes one value of the hot water page to the workflow's `hotWaterData` (spec 3.7). Hot
   * water itself is started at the machine. Each write sends all four values, so the writes
   * queue: a value set before the previous write is answered is built on that answer, and does
   * not send the previous field's old value again.
   */
  setHotWater(field: HotWaterField, value: number): Promise<void> {
    this.hotWaterWritten += 1;
    this.hotWaterWrites = this.hotWaterWrites.then(() => this.sendHotWater(field, value));
    return this.hotWaterWrites;
  }

  private async sendHotWater(field: HotWaterField, value: number): Promise<void> {
    this.notice = this.info = null;
    const current = this.workflow?.hotWaterData;
    if (!current) {
      this.notice = 'The hot water values were not set: the workflow has none yet.';
      return;
    }
    try {
      this.workflow = await writeHotWater(this.client, current, field, value);
    } catch (error) {
      this.notice = `The hot water values were not set: ${errorMessage(error)}`;
    }
  }

  stop(): Promise<void> {
    return this.request('idle', 'The machine did not stop');
  }

  /**
   * The menu's 'Machine sleep' (spec 3.10): only the machine sleeps, the app stays awake, without
   * the Asleep screen and without dimming, until the machine wakes. The state for sleep is
   * `sleeping` (research.md, section 9).
   */
  sleep(): Promise<void> {
    return this.askSleep(true);
  }

  /** The menu's 'Machine and app sleep' (spec 3.10): the machine sleeps and the app shows the Asleep screen. */
  sleepApp(): Promise<void> {
    return this.askSleep(false);
  }

  private async askSleep(machineOnly: boolean): Promise<void> {
    this.sleepMark = askSleep(machineOnly);
    await this.request('sleeping', 'The machine did not go to sleep');
    if (this.notice) this.sleepMark = { ...this.sleepMark, asked: false };
  }

  /** The menu's steam switch (spec 3.7); see `SteamControl.toggleHeater`. */
  toggleSteamHeater(): Promise<void> {
    return this.steamer.toggleHeater();
  }

  /** The steam heater on or off; false when it was not switched, and the notice says why (`SteamControl.setHeater`). */
  setSteamHeater(on: boolean): Promise<boolean> {
    return this.steamer.setHeater(on);
  }

  /** A touch anywhere on the skin: Decaid's sleep timer starts again (`Heartbeat`, spec 3.12). */
  touched(): void {
    this.heartbeat.touch(this.machineAsleep);
  }

  wake(): Promise<void> {
    return this.request('idle', 'The machine did not wake');
  }

  /**
   * Tares the scale: a tap on the weight in the state line, and the tare buttons of the steam
   * and hot water pages (spec 3.7). Without a connected scale it tares nothing and looks for the
   * scale at once (`findScale`, spec 3.9). Decaid refuses
   * it during a shot when its setting `blockTareDuringShot` is on: that is what the user asked
   * Decaid for, so it is a notice and not an error.
   */
  async tare(): Promise<void> {
    if (this.scaleLink !== 'connected') {
      this.findScale();
      return;
    }
    this.notice = this.info = null;
    try {
      await this.client.tareScale();
    } catch (error) {
      if (isTareBlocked(error)) this.info = 'No tare while a shot runs: Decaid blocks it (its setting "block tare during shot").';
      else this.notice = `The scale was not tared: ${errorMessage(error)}`;
    }
  }

  /** A tap on the scale's warning or on a tare button without a scale: a round by hand, scanning at once. */
  findScale(): void {
    this.notice = this.info = null;
    this.streams.findScale();
  }

  /** Changes settings and stores them, with their backup in Decaid's KV store a moment later (`SettingsStore.set`). */
  setSettings(change: Partial<Settings>): void {
    this.store.set(change);
  }

  /** The settings page's 'Restore from backup': the backup's settings, or null when there is none. Throws when it cannot be read. */
  restoreBackup(): Promise<ReadBackup | null> {
    return this.store.restore();
  }

  /** An entry of the shot history was tapped (spec 3.5); see `Recall.restore`. */
  restore(entry: HistoryEntry): Promise<void> {
    return this.recall.restore(entry);
  }

  /** Asked before every load of the skin; see `LoadWarning.ask`. */
  mayLoad(): Promise<LoadAnswer> {
    return this.warning.ask();
  }

  /** The warning's buttons. */
  answerLoad(answer: LoadAnswer): void {
    this.warning.answer(answer);
  }

  /** The warning's 'Save as…' outside the editor: the editor opens on the machine's values and asks for a name. */
  openSaveAs(): void {
    this.saveAsNext = true;
    this.go('editor');
  }

  dismissRecalled(): void {
    this.recall.recalled = null;
  }

  private async request(state: RequestedMachineState, failure: string): Promise<void> {
    this.notice = this.info = null;
    try {
      await this.client.requestMachineState(state);
    } catch (error) {
      this.notice = `${failure}: ${errorMessage(error)}`;
    }
  }
}
