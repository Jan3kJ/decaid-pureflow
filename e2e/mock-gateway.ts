// A gateway for the browser tests: the REST calls and the WebSockets of
// http://localhost:8080 are answered here, so `npm run e2e` needs no Decaid.
import { readFileSync } from 'node:fs';
import type { Page, Route, WebSocketRoute } from '@playwright/test';
import { DEFAULT_PROFILES } from '../src/aflow';
import { paramsMetadata, workflowProfile } from '../src/editor/storage';
import { defaultProfile } from '../src/shell/profiles';

export const GATEWAY = 'http://localhost:8080';

type Json = Record<string, any>;

interface RecordedEvent {
  at: number;
  machine?: Json;
  scale?: Json;
}

/**
 * A simulated shot recorded on the rig: Decaid 0.8.8, A-Flow / default-medium, target 36 g.
 * The simulated machine hardly heats, so 3.9 s of `preparingForShot` frames without flow are
 * added before its first `preinfusion` frame: what a real DE1 does before water moves.
 */
export const RECORDING: RecordedEvent[] = JSON.parse(
  readFileSync(new URL('./fixtures/shot.json', import.meta.url), 'utf8'),
);

const isEspresso = (event: RecordedEvent) => event.machine?.state.state === 'espresso';
/** The recording from its first espresso frame on: what a replay sends. */
export const SHOT_EVENTS = RECORDING.slice(RECORDING.findIndex(isEspresso));
export const ESPRESSO_FRAMES = RECORDING.filter(isEspresso).length;
/** The espresso frames from the first one in which water moves: the points of the shot's graph. */
export const WATER_FRAMES = RECORDING.slice(
  RECORDING.findIndex((event) => isEspresso(event) && event.machine!.state.substate !== 'preparingForShot'),
).filter(isEspresso).length;
/** s, the heating at the start of the recording: espresso frames in which no water moves */
export const HEATING_SECONDS = 4.5;

/** Recorded events as a shot record's measurements: one per espresso frame, with the scale's latest weight. */
export function measurementsFrom(events: readonly RecordedEvent[]): Json[] {
  const measurements: Json[] = [];
  let scale: Json | null = null;
  for (const event of events) {
    if (event.scale && 'weight' in event.scale) scale = event.scale;
    if (isEspresso(event)) measurements.push({ machine: event.machine, scale, volume: null });
  }
  return measurements;
}

/** The recorded shot as a shot record's measurements. */
export const MEASUREMENTS: Json[] = measurementsFrom(RECORDING);
/** How a replay changes the recorded shot. */
export interface ReplayOptions {
  /** s of the real DE1's tail after the stop: espresso frames in `pouringDone` (spec 3.8) */
  tail?: number;
  /** pressure and its target times this factor: 1.15 takes the recording's 10 bar to 11.5 */
  pressure?: number;
}

const stamp = (at: number) => new Date(at).toISOString().replace('Z', '000');

/**
 * The recorded shot, changed: with `tail`, after its last espresso frame the machine stays in
 * espresso for `tail` s at 10 frames a second, in `pouringDone`, its pressure falling to
 * 0.5 bar and its flow rising to a target of 4 ml/s, as in the founder's screenshot of
 * 2026-10-17 (docs/product/review-10-17-espresso-tail.png). The frames after it follow later.
 */
export function shotEvents(options: ReplayOptions = {}): RecordedEvent[] {
  const factor = options.pressure ?? 1;
  let events = SHOT_EVENTS.map((event) =>
    event.machine && factor !== 1
      ? {
          ...event,
          machine: {
            ...event.machine,
            pressure: event.machine.pressure * factor,
            targetPressure: event.machine.targetPressure * factor,
          },
        }
      : event,
  );
  const tail = options.tail ?? 0;
  if (tail > 0) {
    const lastIndex = events.findLastIndex(isEspresso);
    const last = events[lastIndex];
    const lastAt = Date.parse(`${last.machine!.timestamp.slice(0, 23)}Z`);
    const frames: RecordedEvent[] = [];
    for (let i = 1; i <= tail * 10; i += 1) {
      const share = Math.min(1, i / 15);
      frames.push({
        at: last.at + i * 100,
        machine: {
          ...last.machine,
          timestamp: stamp(lastAt + i * 100),
          state: { state: 'espresso', substate: 'pouringDone' },
          pressure: last.machine!.pressure * (1 - share) + 0.5 * share,
          flow: last.machine!.flow * (1 - share) + 4 * share,
          targetFlow: 4,
          targetPressure: 0,
        },
      });
    }
    const shift = tail * 1000;
    const after = events.slice(lastIndex + 1).map((event) => ({
      ...event,
      at: event.at + shift,
      machine: event.machine && { ...event.machine, timestamp: stamp(Date.parse(`${event.machine.timestamp.slice(0, 23)}Z`) + shift) },
    }));
    events = [...events.slice(0, lastIndex + 1), ...frames, ...after];
  }
  return events;
}

/** The share of `shotEvents(options)` up to and with its last espresso frame: a replay to it ends in the shot or its tail. */
export function espressoShare(options: ReplayOptions = {}): number {
  const events = shotEvents(options);
  return (events.findLastIndex(isEspresso) + 1) / events.length;
}

/** The measurements of a shorter shot: the recorded one, ended `seconds` after its first espresso frame. */
export function measurementsOf(seconds: number): Json[] {
  const start = Date.parse(MEASUREMENTS[0].machine.timestamp);
  return MEASUREMENTS.filter((measurement) => Date.parse(measurement.machine.timestamp) - start <= seconds * 1000);
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'DELETE,GET,OPTIONS,PATCH,POST,PUT',
  'access-control-allow-headers': 'Content-Type',
};

function step(name: string, seconds: number): Json {
  return {
    name,
    pump: 'pressure',
    transition: 'fast',
    exit: null,
    volume: 100,
    seconds,
    weight: 0,
    temperature: 93,
    sensor: 'coffee',
    pressure: 9,
    limiter: null,
  };
}

export function profile(title: string, targetWeight: number, steps = 1): Json {
  return {
    version: '2',
    title,
    author: 'Decent',
    notes: `${title}: a profile of the mocked gateway`,
    beverage_type: 'espresso',
    // Steps no A-Flow 3.0 default has, so the mock starts without the defaults.
    steps: Array.from({ length: steps }, (_, i) => step(`Step ${i + 1}`, 11 + i)),
    tank_temperature: 0,
    target_weight: targetWeight,
    target_volume: 100,
    target_volume_count_start: 2,
  };
}

function record(id: string, body: Json, metadata: Json | null): Json {
  return {
    id,
    profile: body,
    metadataHash: 'm',
    compoundHash: 'c',
    parentId: null,
    visibility: 'visible',
    isDefault: metadata?.source === 'bundled',
    createdAt: '2026-10-13T04:00:00Z',
    updatedAt: '2026-10-13T04:00:00Z',
    metadata,
  };
}

/** What a record's id is made of. */
const content = (body: Json) => JSON.stringify([body.steps, body.target_weight ?? 0]);

export interface MockOptions {
  /** false: nothing answers on port 8080 */
  gateway?: boolean;
  /** false: the gateway answers, no machine is connected */
  machine?: boolean;
  /** false: Decaid cannot set this platform's brightness (`platformSupported.brightness`) */
  brightness?: boolean;
}

export class MockGateway {
  /** every REST call the page made, in order */
  readonly requests: { method: string; path: string; body: any; query: string }[] = [];
  machineConnected: boolean;
  /** the machine's state outside a replay */
  state = 'idle';
  /** Decaid's setting blockTareDuringShot is on and a shot runs: a tare answers 400 */
  tareBlocked = false;
  /** true: a stream is answered with an error frame and closed (research.md 9.4) */
  refuseStreams = false;
  /** sockets refused with an error frame, every stream counted */
  refused = 0;
  /** `GET /api/v1/display` */
  display: Json = {
    wakeLockEnabled: true,
    wakeLockOverride: false,
    brightness: 100,
    requestedBrightness: 100,
    lowBatteryBrightnessActive: false,
    platformSupported: { brightness: true, wakeLock: true },
  };
  workflow: Json = {
    id: 'workflow',
    name: 'Workflow',
    // The plugin's default as Decaid bundles it: the title of a 3.0 default, other steps.
    profile: profile('A-Flow / default-medium', 42, 9),
    context: { targetDoseWeight: 18, targetYield: 36, grinderSetting: '5.2' },
    steamSettings: { targetTemperature: 150, duration: 50, flow: 0.8, stopAtTemperature: 0 },
    // As on the rig (research.md 8.6).
    hotWaterData: { targetTemperature: 75, duration: 30, volume: 50, flow: 10 },
    rinseData: { targetTemperature: 90, duration: 10, flow: 6 },
  };
  profiles: Json[] = [
    record('profile:best', profile('Best practice', 40, 4), { source: 'bundled' }),
    record('profile:medium', this.workflow.profile, { source: 'bundled' }),
    record('profile:light', profile('A-Flow / default-light', 48, 9), { source: 'bundled' }),
    record('profile:adaptive', profile('Adaptive v2', 50, 5), { source: 'bundled' }),
    record('profile:dflow', profile('D-Flow / default', 36, 3), { source: 'bundled' }),
  ];

  /**
   * The settings the machine itself holds: `/ws/v1/machine/shotSettings`. Its steam timer is
   * not the workflow's (research.md, section 16).
   */
  shotSettings: Json = {
    steamSetting: 0,
    targetSteamTemp: 150,
    targetSteamDuration: 50,
    targetHotWaterTemp: 75,
    targetHotWaterVolume: 50,
    targetHotWaterDuration: 30,
    targetShotVolume: 36,
    groupTemp: 94,
  };
  /** `GET /api/v1/settings`: Decaid's own settings, as on the rig (research.md 20.4) */
  decaidSettings: Json = {
    gatewayMode: 'tracking',
    webUiPath: '/web-ui/streamline.js',
    logLevel: 'INFO',
    weightFlowMultiplier: 1.0,
    volumeFlowMultiplier: 0.3,
    hotWaterFlowMultiplier: 0.3,
    scalePowerMode: 'disconnect',
    blockOnNoScale: false,
    preferredMachineId: 'MockDe1',
    preferredScaleId: 'MockScale',
    blockTareDuringShot: false,
    stopHotWaterAtWeight: true,
    automaticUpdateCheck: true,
    chargingMode: 'disabled',
    nightModeEnabled: false,
    nightModeSleepTime: 1320,
    nightModeMorningTime: 420,
    lowBatteryBrightnessLimit: true,
    keepAwake: true,
    themeMode: 'system',
  };
  /** `GET /api/v1/machine/settings`, as on the rig */
  machineSettings: Json = {
    fan: 55,
    usb: false,
    flushTemp: 90,
    flushTimeout: 10,
    flushFlow: 6,
    hotWaterFlow: 10,
    steamFlow: 0.8,
    tankTemp: 20,
    steamPurgeMode: 0,
  };
  /** the machine settings the simulated DE1 accepts and does not keep (research.md 20.4) */
  machineIgnores = new Set(['tankTemp']);
  /** `GET /api/v1/machine/settings/advanced`, as on the rig */
  advancedSettings: Json = {
    heaterPh1Flow: 2.5,
    heaterPh2Flow: 5,
    heaterIdleTemp: 98,
    heaterPh2Timeout: 5,
    heaterVoltage: 120,
    refillKitSetting: 2,
  };
  /** `/ws/v1/machine/waterLevels`: the tank, in mm */
  water: Json = { currentLevel: 38, refillLevel: 5 };
  /** `/ws/v1/devices` and `GET /api/v1/devices`: the devices Decaid knows, as on the rig (2026-10-18) */
  devices: Json[] = [
    { name: 'Mock Scale', id: 'MockScale', state: 'connected', type: 'scale', available: true, connectionRole: 'primary' },
    { name: 'MockDe1', id: 'MockDe1', state: 'connected', type: 'machine', available: true },
  ];
  scanning = false;
  /** what the next scan finds */
  scanFinds: Json[] = [];
  /** a scan connects the scale again, as Decaid's scan connects a missing preferred scale (spec 3.9) */
  scanConnectsScale = false;
  /** device ids whose connect times out */
  connectTimesOut = new Set<string>();
  /** `GET /api/v1/devices/wifi` */
  wifi: string[] = [];
  /** `GET /api/v1/machine/info`, as on the rig */
  machineInfo: Json = { version: '1337', model: 'DE1Pro', serialNumber: 'mock-de1', GHC: false, extra: { refillKit: true, voltage: 120 } };
  /** the KV store, as `namespace/key` */
  store: Record<string, unknown> = {};
  /** `GET /api/v1/plugins`: three of the rig's plugins, as Decaid 0.8.8 lists them, and one with an enum */
  plugins: Json[] = [
    {
      id: 'visualizer.reaplugin',
      name: 'Visualizer',
      version: '1.5.10',
      description: 'Uploads shots to visualizer.coffee',
      loaded: true,
      autoLoad: true,
      source: null,
      pendingUpdate: null,
      settings: {
        Username: { type: 'string', label: 'User name' },
        Password: { type: 'string', secure: true, label: 'Password' },
        AutoUpload: { type: 'boolean', label: 'Upload shots automatically', default: true },
        LengthThreshold: { type: 'number', label: 'Minimum shot length', description: 'Seconds', default: 5 },
      },
    },
    {
      id: 'time-to-ready.reaplugin',
      name: 'Time to Ready',
      version: '1.0.4',
      loaded: true,
      autoLoad: true,
      source: null,
      pendingUpdate: null,
      settings: { Stabilisation: { type: 'number', description: 'Seconds the group needs to settle' } },
    },
    {
      id: 'dye2.reaplugin',
      name: 'DYE2',
      version: '0.1.4',
      loaded: true,
      autoLoad: true,
      source: { kind: 'github_release', repo: 'decentespresso/dye2', lastChecked: '2026-10-18T06:00:00Z', lastError: null },
      pendingUpdate: { version: '0.2.0', addedPermissions: ['network.tcp'], detectedAt: '2026-10-18T06:00:00Z' },
      settings: { Theme: { type: 'enum', values: ['light', 'dark'], default: 'dark' } },
    },
  ];
  /** the plugins' stored values, by id; a secure one is kept as typed and answered as `{ isSet }` */
  pluginSettings: Record<string, Json> = { 'visualizer.reaplugin': { Username: 'janek' } };
  /** `GET /api/v1/presence/settings`, as on the rig */
  presence: Json = { userPresenceEnabled: true, sleepTimeoutMinutes: 30, keepAwakeUntil: null, schedules: [] };
  private scheduleCount = 0;
  /** `GET /api/v1/machine/calibration/{target}`: the stored value of each sensor */
  calibration: Json = { flow: 1.0, pressure: 1.0, temperature: 0.0 };
  /** `GET /api/v1/machine/firmware`, as on the rig (2026-10-18) */
  firmware: Json = {
    artifacts: [
      { id: 'de1-1352', source: 'bundled', build: 1352, versionLabel: '1352', channel: 'stable', releaseNotes: 'Fixed an edge case where profile upload would clear NoAC lights.', eligibility: { status: 'applicable', reasons: [] } },
      { id: 'de1-1358', source: 'bundled', build: 1358, versionLabel: '1358', channel: 'stable', releaseNotes: 'Cold maintenance forwards requests through preheat.', eligibility: { status: 'applicable', reasons: [] } },
    ],
    machine: { model: 'DE1Pro', build: 1337 },
    recommendedArtifactId: 'de1-1358',
    updateAvailable: true,
    operation: { state: 'idle' },
  };
  /** the NDJSON lines `POST /api/v1/machine/firmware/apply` answers */
  firmwareStream = ['{"status":"erasing","progress":0.0}', '{"status":"uploading","progress":0.5}', '{"status":"done","progress":1.0}'];
  /** `GET /api/v1/update`, as on the rig */
  appUpdate: Json = {
    phase: 'idle',
    currentVersion: '0.8.8',
    latestVersion: null,
    releaseNotes: null,
    releaseUrl: 'https://github.com/decentespresso/decaid/releases',
    installable: false,
    progress: null,
    error: null,
  };
  /**
   * A Streamline page is open somewhere: it writes the steam time it remembers back over
   * every other one the machine shows, as its version 0.2.13 does.
   */
  streamlineOpen = false;

  /** the shot records, without measurements: `GET /api/v1/shots` */
  shots: Json[] = [];
  /** the measurements of a shot that has not the whole recording, by the shot's id */
  measurements: Record<string, Json[]> = {};

  private readonly up: boolean;
  private readonly machineSockets = new Set<WebSocketRoute>();
  private readonly scaleSockets = new Set<WebSocketRoute>();
  private readonly settingsSockets = new Set<WebSocketRoute>();
  private readonly waterSockets = new Set<WebSocketRoute>();
  private readonly deviceSockets = new Set<WebSocketRoute>();
  /**
   * The machine's substate, where a test sets one: a real DE1 stays in state steam after the
   * steam, in `pouringDone`, `puffing` or `pausedSteam` (spec 3.7). Else the rig's.
   */
  substate: string | null = null;
  private weight = 0;
  private scaleConnected = true;
  private replaying = false;
  /** the frame a machine in the middle of a shot repeats */
  private held: Json | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  constructor(options: MockOptions = {}) {
    this.up = options.gateway ?? true;
    this.machineConnected = options.machine ?? true;
    this.display.platformSupported.brightness = options.brightness ?? true;
  }

  async install(page: Page): Promise<this> {
    await page.route(`${GATEWAY}/**`, (route) => this.answer(route));
    await page.routeWebSocket(/:8080\/ws\/v1\/machine\/snapshot/, (ws) => this.open(ws, this.machineSockets));
    await page.routeWebSocket(/:8080\/ws\/v1\/machine\/shotSettings/, (ws) => {
      // The settings as they are, then one frame after every change.
      if (this.open(ws, this.settingsSockets)) ws.send(JSON.stringify(this.shotSettings));
    });
    await page.routeWebSocket(/:8080\/ws\/v1\/machine\/waterLevels/, (ws) => {
      if (this.open(ws, this.waterSockets)) ws.send(JSON.stringify(this.water));
    });
    await page.routeWebSocket(/:8080\/ws\/v1\/devices/, (ws) => {
      // The whole list when the socket opens, then at every change.
      if (this.open(ws, this.deviceSockets)) ws.send(JSON.stringify(this.devicesFrame()));
    });
    await page.routeWebSocket(/:8080\/ws\/v1\/scale\/snapshot/, (ws) => {
      // The first frame is a status frame without a weight.
      if (this.open(ws, this.scaleSockets)) {
        ws.send(JSON.stringify({ status: this.scaleConnected ? 'connected' : 'disconnected' }));
      }
    });
    // A connected machine sends frames all the time, a scale too.
    this.heartbeat = setInterval(() => {
      if (this.replaying) return;
      if (this.machineConnected) this.sendMachine(this.held ?? this.frame());
      if (this.scaleConnected) this.putOnScale(this.weight);
    }, 300);
    page.on('close', () => clearInterval(this.heartbeat));
    return this;
  }

  /**
   * The five A-Flow 3.0 defaults stored, as the picker's 'add' stores them (the values in the
   * metadata), and `loaded` (a default's id without 'default-') as the workflow's profile, the
   * copy `loadProfile` sends (the values in its notes).
   */
  withDefaults(loaded?: string): this {
    for (const entry of DEFAULT_PROFILES) {
      this.profiles.push(
        record(`profile:${entry.id}`, defaultProfile(entry), { source: 'pureflow', ...paramsMetadata(entry.params) }),
      );
    }
    const entry = DEFAULT_PROFILES.find((candidate) => candidate.id === `default-${loaded}`);
    if (entry) this.workflow.profile = workflowProfile(defaultProfile(entry), entry.params);
    return this;
  }

  /**
   * The history's reads of the shot list: not the skin's look-up of the last shot with the
   * loaded profile (`profileTitle`, spec 3.8), which reads its record too.
   */
  historyListCalls() {
    return this.calls('GET', '/api/v1/shots').filter((request) => !request.query.includes('profileTitle'));
  }

  /** The calls of one kind, as `METHOD path`. */
  calls(method: string, path: string | RegExp) {
    return this.requests.filter(
      (request) =>
        request.method === method && (typeof path === 'string' ? request.path === path : path.test(request.path)),
    );
  }

  /** A shot in Decaid's history: the workflow as it was, as a shot record copies it (research.md 8.4). */
  addShot(id: string, timestamp: string, shotProfile: Json, context: Json | null): void {
    this.shots.push({
      id,
      timestamp,
      createdAt: `${timestamp}Z`,
      updatedAt: `${timestamp}Z`,
      workflow: { id: 'workflow', name: 'Workflow', profile: shotProfile, context },
      annotations: { actualDoseWeight: 18, actualYield: 34.1 },
      stopReason: 'targetWeight',
    });
  }

  /** Another client writes the machine's settings past the workflow, as `POST /api/v1/machine/shotSettings` does. */
  setMachineSteamTimer(seconds: number): void {
    this.shotSettings = { ...this.shotSettings, targetSteamDuration: seconds };
    for (const ws of this.settingsSockets) ws.send(JSON.stringify(this.shotSettings));
    this.streamlineResync();
  }

  /** Decaid's workflow write: the machine gets the steam timer only when the workflow's changes. */
  private putWorkflowSteam(patch: Json | undefined): void {
    const before = this.workflow.steamSettings.duration;
    const temperatureBefore = this.workflow.steamSettings.targetTemperature;
    // What a patch leaves out keeps its value (research.md 8.3).
    this.workflow = { ...this.workflow, steamSettings: { ...this.workflow.steamSettings, ...patch } };
    const duration = this.workflow.steamSettings.duration;
    if (duration !== before) this.setMachineSteamTimer(duration);
    // The steam heater: a changed temperature reaches the machine, below 135 °C as 0 (research.md 22).
    const temperature = this.workflow.steamSettings.targetTemperature;
    if (temperature !== temperatureBefore) {
      this.shotSettings = { ...this.shotSettings, targetSteamTemp: temperature < 135 ? 0 : temperature };
      for (const ws of this.settingsSockets) ws.send(JSON.stringify(this.shotSettings));
    }
  }

  /** Streamline 0.2.13 on a frame with a steam time that is not the one it remembers. */
  private streamlineResync(): void {
    const remembered = this.store['streamline-app/last-steam-duration'];
    if (!this.streamlineOpen || typeof remembered !== 'number') return;
    if (remembered !== this.shotSettings.targetSteamDuration) this.putWorkflowSteam({ duration: remembered });
  }

  /** A frame of `/ws/v1/devices`. */
  devicesFrame(): Json {
    return { timestamp: new Date().toISOString(), devices: this.devices, scanning: this.scanning, connectionStatus: { phase: 'ready', error: null } };
  }

  /** Another client or the device itself changed the list: the frame goes out. */
  sendDevices(): void {
    for (const ws of this.deviceSockets) ws.send(JSON.stringify(this.devicesFrame()));
  }

  private setDevice(id: string, change: Json): void {
    this.devices = this.devices.map((entry) => (entry.id === id ? { ...entry, ...change } : entry));
    this.sendDevices();
  }

  /** The tank's level changes, in mm. */
  setWater(currentLevel: number): void {
    this.water = { ...this.water, currentLevel };
    for (const ws of this.waterSockets) ws.send(JSON.stringify(this.water));
  }

  /** What stands on the scale, in g: the next weight frames say so. */
  putOnScale(grams: number): void {
    this.weight = grams;
    this.sendScale({ timestamp: new Date().toISOString(), weight: grams, weightFlow: 0, battery: 100, timerValue: null });
  }

  /** The scale connects or goes away: a status frame on the open socket, and no weights without it. */
  connectScale(connected: boolean): void {
    this.scaleConnected = connected;
    this.sendScale({ status: connected ? 'connected' : 'disconnected' });
  }

  /**
   * The machine has steamed for `seconds`: its frames of that time, sent at once, with the
   * curve of a real machine (the simulated one has none, research.md 8.7). It goes on steaming.
   */
  steamFor(seconds: number): void {
    this.state = 'steam';
    const now = Date.now();
    for (let t = 0; t < seconds; t += 0.25) {
      this.sendMachine({
        ...this.frame(now - (seconds - t) * 1000),
        pressure: 1.6 * (1 - Math.exp(-t / 1.5)) + 0.08 * Math.sin(t * 2),
        steamTemperature: 152 - 9 * (1 - Math.exp(-t / 6)) + 0.6 * Math.sin(t),
      });
    }
  }

  /**
   * Hot water or flush has run for `seconds` at `flow` ml/s: a frame every 0.5 s, sent at once.
   * The machine then repeats its latest frame, so the time on screen stands still; `waterFlow`
   * sends the next one. As on the rig, hot water's substate is `pouring`, flush's `idle`.
   */
  waterFor(kind: 'hotWater' | 'flush', seconds: number, flow: number, mixTemperature = 75): void {
    this.state = kind;
    const now = Date.now();
    for (let t = 0; t <= seconds; t += 0.5) {
      this.held = { ...this.frame(now - (seconds - t) * 1000), flow, mixTemperature };
      this.sendMachine(this.held);
    }
  }

  /** The running hot water or flush, `after` s later, at another flow. */
  waterFlow(flow: number, after = 1): void {
    const at = Date.parse(`${this.held!.timestamp.slice(0, 23)}Z`) + after * 1000;
    this.held = { ...this.held!, timestamp: new Date(at).toISOString().replace('Z', '000'), flow };
    this.sendMachine(this.held);
  }

  /** The machine has left hot water or flush. */
  waterEnded(): void {
    this.held = undefined;
    this.state = 'idle';
    this.sendMachine(this.frame());
  }

  frame(at = Date.now()): Json {
    return {
      timestamp: new Date(at).toISOString().replace('Z', '000'),
      state: { state: this.state, substate: this.substate ?? (this.state === 'hotWater' ? 'pouring' : 'idle') },
      flow: 0,
      pressure: this.state === 'steam' ? 1.6 : 0,
      targetFlow: 0,
      targetPressure: 0,
      mixTemperature: 91.4,
      groupTemperature: 92.6,
      targetMixTemperature: 93,
      targetGroupTemperature: 93,
      profileFrame: 0,
      steamTemperature: this.state === 'steam' ? 143 : 148,
    };
  }

  /**
   * Sends a part of the recorded shot, as fast as the page takes it: the skin reads the time
   * from the frames, not from its clock. `from` and `to` are shares of the shot, 0 to 1, of
   * the recording or, with `options`, of the shot changed by them (`shotEvents`).
   */
  async replay(page: Page, from = 0, to = 1, options: ReplayOptions = {}): Promise<void> {
    this.replaying = true;
    const all = shotEvents(options);
    const events = all.slice(Math.round(from * all.length), Math.round(to * all.length));
    for (const [i, event] of events.entries()) {
      if (event.machine) this.sendMachine(event.machine);
      if (event.scale && 'weight' in event.scale) {
        this.weight = event.scale.weight;
        this.sendScale(event.scale);
      }
      if (i % 25 === 24) await page.waitForTimeout(20);
    }
    const last = events.findLast((event) => event.machine)?.machine;
    // In the middle of the shot the machine goes on sending its latest frame.
    this.held = to < 1 && last?.state.state === 'espresso' ? last : undefined;
    if (!this.held) this.state = 'idle';
    this.replaying = false;
  }

  private sendMachine(frame: Json): void {
    for (const ws of this.machineSockets) ws.send(JSON.stringify(frame));
  }

  private sendScale(frame: Json): void {
    for (const ws of this.scaleSockets) ws.send(JSON.stringify(frame));
  }

  /** Whether the socket stays open. */
  private open(ws: WebSocketRoute, sockets: Set<WebSocketRoute>): boolean {
    if (this.up && this.refuseStreams) {
      this.refused++;
      ws.send(JSON.stringify({ error: 'the mock refuses this stream' }));
    }
    if (!this.up || this.refuseStreams) {
      void ws.close();
      return false;
    }
    sockets.add(ws);
    ws.onClose(() => sockets.delete(ws));
    return true;
  }

  private async answer(route: Route): Promise<void> {
    if (!this.up) return route.abort('connectionrefused');
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const body = request.postData() ? JSON.parse(request.postData()!) : undefined;
    this.requests.push({ method, path, body, query: url.search });

    const json = (value: unknown, status = 200) =>
      route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(value) });
    const noMachine = () => json({ error: 'DeviceNotConnectedException: machine not connected' }, 500);

    if (method === 'GET' && path === '/api/v1/machine/state') {
      return this.machineConnected ? json(this.frame()) : noMachine();
    }
    if (method === 'PUT' && path.startsWith('/api/v1/machine/state/')) {
      if (!this.machineConnected) return noMachine();
      // The state itself changes when the test replays the shot or lets it end; only sleep
      // and the wake from it are the mock's own.
      const asked = path.split('/').pop()!;
      // The maintenance states are entered and left at once, as the simulated DE1 does (research.md 20.14).
      const own = ['sleeping', 'cleaning', 'descaling', 'airPurge'];
      if (own.includes(asked) || own.includes(this.state)) this.state = asked;
      return json(null);
    }
    if (method === 'PUT' && path === '/api/v1/scale/tare') {
      if (this.tareBlocked) {
        // As Decaid 0.8.8 answered on the rig (research.md 9.1).
        return json({ details: 'Tare blocked: a shot is in progress', type: 'block_tare_during_shot' }, 400);
      }
      if (!this.scaleConnected) return json({ error: 'DeviceNotConnectedException: scale not connected' }, 500);
      this.putOnScale(0);
      return json(null);
    }
    if (method === 'GET' && path === '/api/v1/display') return json(this.display);
    if (method === 'PUT' && path === '/api/v1/display/brightness') {
      this.display = { ...this.display, brightness: body.brightness, requestedBrightness: body.brightness };
      return json(this.display);
    }
    if (path === '/api/v1/settings' && method === 'GET') return json(this.decaidSettings);
    if (path === '/api/v1/settings' && method === 'POST') {
      this.decaidSettings = { ...this.decaidSettings, ...body };
      return json(null);
    }
    if (path === '/api/v1/info' && method === 'GET') {
      return json({ version: '0.8.8', buildNumber: '2900', fullVersion: '0.8.8+2900', commitShort: 'aab5f938' });
    }
    if (path === '/api/v1/devices' && method === 'GET') return json(this.devices);
    if (path === '/api/v1/devices/scan' && method === 'GET') {
      // The scan runs on: its start and its end are frames of the stream.
      this.scanning = true;
      this.sendDevices();
      setTimeout(() => {
        const known = new Set(this.devices.map((entry) => entry.id));
        this.devices = [...this.devices, ...this.scanFinds.filter((entry) => !known.has(entry.id))];
        this.scanning = false;
        this.sendDevices();
        if (this.scanConnectsScale && !this.scaleConnected) this.connectScale(true);
      }, 300);
      return json(url.searchParams.get('quick') === 'true' ? [] : this.devices);
    }
    if (path === '/api/v1/devices/connect' && method === 'PUT') {
      const found = this.devices.find((entry) => entry.id === body?.deviceId);
      if (!found) return json({ error: 'Device not found' }, 404);
      const result = (outcome: string, state: string) => ({ deviceId: found.id, operation: 'connect', outcome, state, connectionError: null });
      this.setDevice(found.id, { state: 'connecting' });
      if (this.connectTimesOut.has(found.id)) {
        this.setDevice(found.id, { state: 'disconnected' });
        return json({ ...result('timedOut', 'disconnected'), error: 'connect timed out' }, 504);
      }
      this.setDevice(found.id, { state: 'connected', available: true });
      return json(result('connected', 'connected'));
    }
    if (path === '/api/v1/devices/disconnect' && method === 'PUT') {
      if (!this.devices.some((entry) => entry.id === body?.deviceId)) return json({ error: 'Device not found' }, 404);
      this.setDevice(body.deviceId, { state: 'disconnected' });
      return json(null);
    }
    if (path === '/api/v1/devices/forget' && method === 'PUT') {
      // An absent device leaves the list; a present one stays, no longer remembered.
      this.devices = this.devices.filter((entry) => entry.id !== body?.deviceId || entry.available !== false);
      this.sendDevices();
      return json(null);
    }
    if (path === '/api/v1/devices/wifi') {
      if (method === 'POST' && !this.wifi.includes(body.host)) this.wifi = [...this.wifi, body.host];
      if (method === 'DELETE') this.wifi = this.wifi.filter((host) => host !== body.host);
      return json({ endpoints: this.wifi });
    }
    if (path === '/api/v1/machine/info' && method === 'GET') return this.machineConnected ? json(this.machineInfo) : noMachine();
    if (path === '/api/v1/plugins' && method === 'GET') return json(this.plugins);
    if (path === '/api/v1/plugins/update' && method === 'POST') return json({ message: 'checked' });
    const [, pluginId, pluginAction] = /^\/api\/v1\/plugins\/([^/]+)\/(settings|enable|disable|update\/approve)$/.exec(path) ?? [];
    const plugin = this.plugins.find((entry) => entry.id === pluginId);
    if (pluginId && !plugin) return json({ error: 'Plugin not found' }, 404);
    if (plugin && pluginAction === 'settings') {
      const stored = (this.pluginSettings[plugin.id] ??= {});
      if (method === 'POST') {
        // A null clears a value; the others are kept (rest_v1.yml).
        for (const [key, value] of Object.entries(body)) {
          if (value === null) delete stored[key];
          else stored[key] = value;
        }
      }
      const redacted = Object.fromEntries(
        Object.entries(plugin.settings ?? {})
          .filter(([key, schema]: [string, any]) => schema.secure || key in stored)
          .map(([key, schema]: [string, any]) => [key, schema.secure ? { isSet: key in stored } : stored[key]]),
      );
      return json(redacted);
    }
    if (plugin && (pluginAction === 'enable' || pluginAction === 'disable') && method === 'POST') {
      plugin.loaded = pluginAction === 'enable';
      return json({ message: `${pluginAction}d`, id: plugin.id });
    }
    if (plugin && pluginAction === 'update/approve' && method === 'POST') {
      plugin.version = plugin.pendingUpdate?.version ?? plugin.version;
      plugin.pendingUpdate = null;
      return json({ message: 'updated', id: plugin.id, version: plugin.version, loaded: plugin.loaded });
    }
    if (path === '/api/v1/presence/settings' && method === 'GET') return json(this.presence);
    if (path === '/api/v1/presence/settings' && method === 'POST') {
      const { userPresenceEnabled, sleepTimeoutMinutes } = body;
      if (userPresenceEnabled !== undefined) this.presence.userPresenceEnabled = userPresenceEnabled;
      if (sleepTimeoutMinutes !== undefined) this.presence.sleepTimeoutMinutes = Math.max(0, Math.min(240, sleepTimeoutMinutes));
      return json({ userPresenceEnabled: this.presence.userPresenceEnabled, sleepTimeoutMinutes: this.presence.sleepTimeoutMinutes });
    }
    // As the rig answers (log\s2c-schedule-probe.txt): a null keepAwakeFor is left out.
    const scheduleOf = (entry: Json) => Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== null && value !== undefined));
    if (path === '/api/v1/presence/schedules' && method === 'POST') {
      const created = scheduleOf({ id: `schedule-${++this.scheduleCount}`, daysOfWeek: [], enabled: true, ...body });
      this.presence.schedules = [...this.presence.schedules, created];
      return json(created, 201);
    }
    const [, scheduleId] = /^\/api\/v1\/presence\/schedules\/([^/]+)$/.exec(path) ?? [];
    if (scheduleId) {
      const existing = this.presence.schedules.find((entry: Json) => entry.id === scheduleId);
      if (!existing) return json({ error: 'Schedule not found' }, 404);
      if (method === 'PUT') {
        const changed = scheduleOf({ ...existing, ...body });
        this.presence.schedules = this.presence.schedules.map((entry: Json) => (entry.id === scheduleId ? changed : entry));
        return json(changed);
      }
      if (method === 'DELETE') {
        this.presence.schedules = this.presence.schedules.filter((entry: Json) => entry.id !== scheduleId);
        return json({ deleted: scheduleId });
      }
    }
    const [, target] = /^\/api\/v1\/machine\/calibration\/(flow|pressure|temperature)$/.exec(path) ?? [];
    if (target) {
      if (!this.machineConnected) return noMachine();
      const ratio = target !== 'temperature';
      if (method === 'PUT') {
        // A correction: a ratio multiplies, the temperature's offset adds (rest_v1.yml).
        const { de1ReportedValue: reported, measuredValue: measured } = body;
        this.calibration[target] = ratio ? this.calibration[target] * (measured / reported) : this.calibration[target] + (measured - reported);
        return json(null, 202);
      }
      return json({ target, source: 'current', de1ReportedValue: ratio ? 1.0 : 0.0, measuredValue: this.calibration[target] });
    }
    if (path === '/api/v1/machine/firmware' && method === 'GET') return json(this.firmware);
    if (path === '/api/v1/machine/firmware' && method === 'DELETE') return json({ operation: { state: 'idle' } }, 202);
    if (path === '/api/v1/machine/firmware/apply' && method === 'POST') {
      return route.fulfill({ status: 200, headers: CORS, contentType: 'application/x-ndjson', body: this.firmwareStream.join('\n') + '\n' });
    }
    if (path === '/api/v1/update' && method === 'GET') return json(this.appUpdate);
    if (path.startsWith('/api/v1/machine/settings') && !this.machineConnected) return noMachine();
    if (path === '/api/v1/machine/settings' && method === 'GET') return json(this.machineSettings);
    if (path === '/api/v1/machine/settings' && method === 'POST') {
      const kept = Object.fromEntries(Object.entries(body).filter(([key]) => !this.machineIgnores.has(key)));
      // The USB charger is written as 'enable' or 'disable' and read as a boolean; a boolean is ignored (research.md 20.4).
      if ('usb' in kept) {
        if (kept.usb === 'enable' || kept.usb === 'disable') kept.usb = kept.usb === 'enable';
        else delete kept.usb;
      }
      this.machineSettings = { ...this.machineSettings, ...kept };
      return json(null, 202);
    }
    if (path === '/api/v1/machine/settings/advanced' && method === 'GET') return json(this.advancedSettings);
    if (path === '/api/v1/machine/settings/advanced' && method === 'POST') {
      this.advancedSettings = { ...this.advancedSettings, ...body };
      return json(null, 202);
    }
    if (path === '/api/v1/machine/settings/reset' && method === 'DELETE') {
      this.machineSettings = { ...this.machineSettings, fan: 55, steamPurgeMode: 0 };
      this.advancedSettings = { ...this.advancedSettings, heaterIdleTemp: 98, heaterPh1Flow: 2.5, heaterPh2Flow: 5, heaterPh2Timeout: 5, refillKitSetting: 2 };
      return json(null, 202);
    }
    if (path === '/api/v1/machine/waterLevels' && method === 'POST') {
      if (!this.machineConnected) return noMachine();
      this.water = { ...this.water, refillLevel: body.refillLevel };
      for (const ws of this.waterSockets) ws.send(JSON.stringify(this.water));
      return json(null, 202);
    }
    if (path === '/api/v1/display/wakelock' && (method === 'POST' || method === 'DELETE')) {
      this.display = { ...this.display, wakeLockOverride: method === 'POST' };
      return json(this.display);
    }
    if (path === '/api/v1/workflow' && method === 'GET') return json(this.workflow);
    if (path === '/api/v1/workflow' && method === 'PUT') {
      this.workflow = {
        ...this.workflow,
        ...body,
        // A null clears a field of the context: Decaid returns the context without it (research.md 14).
        context: Object.fromEntries(
          Object.entries({ ...this.workflow.context, ...body.context }).filter(([, value]) => value !== null),
        ),
        steamSettings: this.workflow.steamSettings,
      };
      this.putWorkflowSteam(body.steamSettings);
      // Decaid writes a changed rinseData to the machine's flush settings (research.md 20.12).
      if (body.rinseData) {
        const { targetTemperature, duration, flow } = this.workflow.rinseData;
        this.machineSettings = { ...this.machineSettings, flushTemp: targetTemperature, flushTimeout: duration, flushFlow: flow };
      }
      // Each response describes the workflow resulting from that request (rest_v1.yml).
      const answer = { ...this.workflow, steamSettings: { ...this.workflow.steamSettings, ...body.steamSettings } };
      return json(answer);
    }
    if (method === 'POST' && path === '/api/v1/machine/shotSettings') {
      if (!this.machineConnected) return noMachine();
      this.shotSettings = body;
      for (const ws of this.settingsSockets) ws.send(JSON.stringify(body));
      this.streamlineResync();
      return json(null);
    }
    const [, kvKey] = /^\/api\/v1\/store\/(.+\/.+)$/.exec(decodeURIComponent(path)) ?? [];
    if (kvKey && method === 'GET') return json(this.store[kvKey] ?? null);
    if (kvKey && method === 'POST') {
      this.store[kvKey] = body;
      return json(null);
    }
    if (kvKey && method === 'DELETE') {
      delete this.store[kvKey];
      return json(null);
    }
    if (path === '/api/v1/shots' && method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      // `profileTitle` matches the whole title, as on the rig (research.md 23).
      const title = url.searchParams.get('profileTitle');
      const matching = this.shots.filter((shot) => title === null || shot.workflow?.profile?.title === title);
      const newestFirst = matching.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return json({ items: newestFirst.slice(offset, offset + limit), total: matching.length, limit, offset });
    }
    if (path.startsWith('/api/v1/shots/') && method === 'GET') {
      const shot = this.shots.find((candidate) => candidate.id === decodeURIComponent(path.split('/').pop()!));
      // Only this call has the measurements (research.md 8.4).
      return shot ? json({ ...shot, measurements: this.measurements[shot.id] ?? MEASUREMENTS }) : json({ error: 'Shot not found' }, 404);
    }
    if (path === '/api/v1/profiles' && method === 'GET') {
      const hidden = url.searchParams.get('includeHidden') === 'true';
      return json(this.profiles.filter((stored) => stored.visibility === 'visible' || hidden));
    }
    if (path === '/api/v1/profiles' && method === 'POST') {
      // The id is a hash of the steps and the target weight: steps that exist give the
      // existing record back, with its old title and notes (research.md 9.2 and 11).
      const existing = this.profiles.find((stored) => content(stored.profile) === content(body.profile));
      if (existing) return json(existing, 201);
      const saved = record(`profile:saved${this.profiles.length}`, body.profile, body.metadata ?? null);
      saved.parentId = body.parentId ?? null;
      this.profiles.push(saved);
      return json(saved, 201);
    }
    const [, id, action] = /^\/api\/v1\/profiles\/([^/]+)(\/visibility)?$/.exec(decodeURIComponent(path)) ?? [];
    if (method === 'PUT' && id) {
      const stored = this.profiles.find((candidate) => candidate.id === id);
      if (!stored) return json({ error: 'Invalid request' }, 400);
      if (action) stored.visibility = body.visibility;
      else {
        if (body.profile) stored.profile = body.profile;
        if ('metadata' in body) stored.metadata = body.metadata;
      }
      return json(stored);
    }
    return json({ error: `the mock has no ${method} ${path}` }, 404);
  }
}

export function mockGateway(page: Page, options: MockOptions = {}): Promise<MockGateway> {
  return new MockGateway(options).install(page);
}
