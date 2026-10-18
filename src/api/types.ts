// Types of Decaid's gateway API, v1, as far as version 1 of the skin uses it (spec 3.1, 3.4, 3.5).
// Field names are from the release's rest_v1.yml and websocket_v1.yml (Decaid 0.8.8) and from
// the responses of the running rig (research.md, section 8).

// --- machine ---

/** `MachineState` in rest_v1.yml. A newer Decaid may send a value that is not listed here. */
export type MachineState =
  | 'booting'
  | 'busy'
  | 'idle'
  | 'sleeping'
  | 'heating'
  | 'preheating'
  | 'espresso'
  | 'hotWater'
  | 'flush'
  | 'steam'
  | 'steamRinse'
  | 'skipStep'
  | 'cleaning'
  | 'descaling'
  | 'calibration'
  | 'selfTest'
  | 'airPurge'
  | 'needsWater'
  | 'error'
  | 'fwUpgrade';

/**
 * A frame of `/ws/v1/machine/shotSettings` and the body of `POST /api/v1/machine/shotSettings`:
 * the settings the machine itself holds. `targetSteamDuration` is the steam timer the machine
 * runs; it may differ from the workflow's `steamSettings.duration` (research.md, section 16).
 */
export interface ShotSettings {
  steamSetting: number;
  /** °C */
  targetSteamTemp: number;
  /** whole seconds */
  targetSteamDuration: number;
  targetHotWaterTemp: number;
  targetHotWaterVolume: number;
  targetHotWaterDuration: number;
  targetShotVolume: number;
  groupTemp: number;
}

/** A frame of `/ws/v1/machine/waterLevels`: the water in the tank, both heights in mm. */
export interface WaterLevels {
  /** mm, the water's height in the tank */
  currentLevel: number;
  /** mm, the height under which the machine warns to refill */
  refillLevel: number;
}

/**
 * The states the skin asks for (spec 3.1). Sleep is `sleeping`; the settings page's maintenance
 * asks for `cleaning`, `descaling` and `airPurge` (research.md 20.3).
 */
export type RequestedMachineState = 'idle' | 'espresso' | 'steam' | 'sleeping' | 'cleaning' | 'descaling' | 'airPurge';

/**
 * A frame of `/ws/v1/machine/snapshot` and the answer of `GET /api/v1/machine/state`.
 * There is no weight in it: the weight is on the scale stream.
 */
export interface MachineSnapshot {
  /** local time, no zone */
  timestamp: string;
  /** The substate is not monotonic during a shot; `profileFrame` says which step runs. */
  state: { state: MachineState; substate: string };
  /** ml/s */
  flow: number;
  /** bar */
  pressure: number;
  targetFlow: number;
  targetPressure: number;
  /** °C */
  mixTemperature: number;
  groupTemperature: number;
  targetMixTemperature: number;
  targetGroupTemperature: number;
  /** 0-based index of the profile step that runs */
  profileFrame: number;
  steamTemperature: number;
}

/** `GET /api/v1/machine/info`: the connected machine. */
export interface MachineInfo {
  /** the firmware version */
  version?: string;
  model?: string;
  serialNumber?: string;
  /** the group head controller is present and active */
  GHC?: boolean;
  /** read from the machine once at connect: `refillKit`, `voltage` and what a firmware adds */
  extra?: Record<string, unknown> | null;
  [key: string]: unknown;
}

// --- devices ---

export type DeviceState = 'discovered' | 'connecting' | 'connected' | 'disconnecting' | 'disconnected';
export type DeviceType = 'machine' | 'scale' | 'sensor' | 'grinder';

/** A device of `GET /api/v1/devices` and of `/ws/v1/devices` (`DeviceInfo`, `DeviceInventory`). */
export interface DeviceInfo {
  name: string;
  /** a BLE MAC, a UUID, a serial port's path or a Wi-Fi host */
  id: string;
  state: DeviceState;
  type: DeviceType;
  /** false: a remembered device that is not present, reported as `disconnected`; absent in older builds */
  available?: boolean;
  connectionRole?: 'primary' | 'auxiliary';
}

/** A frame of `/ws/v1/devices`: the whole device list, at connect and at every change. */
export interface DevicesState {
  timestamp: string;
  devices: DeviceInfo[];
  /** a scan runs */
  scanning: boolean;
  connectionStatus?: {
    phase?: 'idle' | 'scanning' | 'connectingMachine' | 'connectingScale' | 'ready';
    error?: { kind: string; message: string; suggestion?: string | null } | null;
    [key: string]: unknown;
  };
}

/** The answer of `PUT /api/v1/devices/connect`. */
export interface DeviceConnectResult {
  deviceId: string;
  outcome: 'connected' | 'alreadyConnected' | 'conflict' | 'failed' | 'timedOut';
  state: DeviceState;
  connectionError?: { kind: string; message: string } | null;
  error?: string | null;
}

/** `GET`, `POST` and `DELETE /api/v1/devices/wifi`: the Wi-Fi scales added by hand. */
export interface WifiEndpoints {
  endpoints: string[];
}

// --- scale ---

/**
 * The status frame of `/ws/v1/scale/snapshot`: the first frame after connecting and one at
 * every change of the scale's connection. It has no weight.
 */
export interface ScaleStatusFrame {
  status: 'connected' | 'disconnected';
}

/** A weight frame of `/ws/v1/scale/snapshot`; only sent while a scale is connected. */
export interface ScaleSnapshot {
  timestamp: string;
  /** g, unrounded */
  weight: number;
  /** g/s */
  weightFlow: number;
  /** 0-100 */
  battery: number | null;
  /** ms */
  timerValue: number | null;
}

/** Every frame of `/ws/v1/scale/snapshot`. Narrow it before reading a weight. */
export type ScaleFrame = ScaleStatusFrame | ScaleSnapshot;

export function isScaleStatus(frame: ScaleFrame): frame is ScaleStatusFrame {
  return 'status' in frame;
}

export function isScaleSnapshot(frame: ScaleFrame): frame is ScaleSnapshot {
  return 'weight' in frame && typeof frame.weight === 'number';
}

// --- profiles ---

export interface StepExit {
  type: 'pressure' | 'flow';
  condition: 'over' | 'under';
  value: number;
}

export interface ProfileStep {
  name: string;
  pump: 'pressure' | 'flow';
  transition: 'fast' | 'smooth';
  /** The gateway returns `null` for a step without an exit condition. */
  exit?: StepExit | null;
  /** ml */
  volume: number;
  seconds: number;
  /** g */
  weight?: number | null;
  /** °C */
  temperature: number;
  sensor: 'coffee' | 'water';
  /** bar, with `pump: "pressure"` */
  pressure?: number;
  /** ml/s, with `pump: "flow"` */
  flow?: number;
  limiter?: { value: number; range: number } | null;
}

/** A v2 profile as the API takes and returns it: numbers, not strings (research 8.6). */
export interface Profile {
  version?: string;
  title: string;
  notes?: string;
  author?: string;
  beverage_type?: 'espresso' | 'calibrate' | 'cleaning' | 'manual' | 'pourover';
  steps: ProfileStep[];
  target_volume?: number | null;
  target_weight?: number | null;
  target_volume_count_start: number;
  tank_temperature: number;
}

export type ProfileVisibility = 'visible' | 'hidden' | 'deleted';

/** A stored profile. The id is a hash of the steps and the target weight: `profile:<20 hex>`. */
export interface ProfileRecord {
  id: string;
  profile: Profile;
  metadataHash: string;
  compoundHash: string;
  parentId?: string | null;
  visibility: ProfileVisibility;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown> | null;
}

export interface ListProfilesQuery {
  visibility?: ProfileVisibility;
  includeHidden?: boolean;
  parentId?: string;
}

export interface SaveProfileOptions {
  /** The id of the profile this one was edited from; Decaid's lineage follows it. */
  parentId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** The body of `PUT /api/v1/profiles/{id}`: what is left out keeps its value. */
export interface ProfileUpdate {
  profile?: Profile;
  /** `null` clears the metadata */
  metadata?: Record<string, unknown> | null;
}

// --- workflow ---

/** Dose, yield, bean and grinder of the current workflow; every field may be `null`. */
export interface WorkflowContext {
  /** g */
  targetDoseWeight?: number | null;
  /** g; the stop-at-weight target. `null` and 0 both mean off. */
  targetYield?: number | null;
  targetWaterVolume?: number | null;
  grinderId?: string | null;
  grinderModel?: string | null;
  grinderSetting?: string | null;
  beanBatchId?: string | null;
  coffeeName?: string | null;
  coffeeRoaster?: string | null;
  finalBeverageType?: string | null;
  baristaName?: string | null;
  drinkerName?: string | null;
  extras?: Record<string, unknown> | null;
}

/** `context` of a `PUT /api/v1/workflow`: as `WorkflowContext`, but `targetYield` takes no `null`. */
export interface WorkflowContextPatch extends Omit<WorkflowContext, 'targetYield'> {
  /** g; send 0 to turn stop-at-weight off */
  targetYield?: number;
}

export interface SteamSettings {
  /** °C; 0 turns the steam heater off */
  targetTemperature: number;
  /** whole seconds: the steam timer (research 8.3) */
  duration: number;
  flow: number;
  /** For a milk probe; it does not reach the machine. */
  stopAtTemperature?: number;
}

export interface HotWaterData {
  targetTemperature: number;
  duration: number;
  volume: number;
  flow: number;
}

export interface RinseData {
  targetTemperature: number;
  duration: number;
  flow: number;
}

/** The machine as it was when a shot was pulled; recorded with the shot, ignored on a write. */
export interface WorkflowMachine {
  provenanceStatus?: 'captured' | 'unavailable';
  flowCalibration?: number | null;
  serialNumber?: string;
  model?: string;
  firmwareVersion?: string;
}

export interface Workflow {
  id?: string;
  name?: string;
  description?: string;
  profile?: Profile;
  context?: WorkflowContext | null;
  steamSettings?: SteamSettings;
  hotWaterData?: HotWaterData;
  rinseData?: RinseData;
  machine?: WorkflowMachine;
}

/**
 * The body of `PUT /api/v1/workflow`. It is merged into the current workflow, so it may hold
 * only what changes. `steamSettings` and its fields take no `null` (400).
 */
export interface WorkflowPatch {
  name?: string;
  description?: string;
  profile?: Profile;
  context?: WorkflowContextPatch;
  steamSettings?: Partial<SteamSettings>;
  hotWaterData?: HotWaterData;
  rinseData?: RinseData;
}

// --- shots ---

export interface ShotAnnotations {
  actualDoseWeight?: number | null;
  actualYield?: number | null;
  drinkTds?: number | null;
  drinkEy?: number | null;
  /** 0-10 */
  enjoyment?: number | null;
  espressoNotes?: string | null;
  extras?: Record<string, unknown> | null;
}

/** A shot without its measurements: an item of the list, and the latest shot. */
export interface ShotRecordSummary {
  id: string;
  /** shot start, local time, no zone */
  timestamp: string;
  /** UTC */
  createdAt?: string;
  updatedAt?: string;
  /** The whole workflow as it was at the shot; the profile is a copy, not an id. */
  workflow?: Workflow;
  annotations?: ShotAnnotations | null;
  /** An open set: targetWeight, targetVolume, apiStop, appStop, machineEnded, error, ... */
  stopReason?: string | null;
}

/** One entry per machine frame of the shot. */
export interface ShotMeasurement {
  machine: MachineSnapshot;
  scale?: ScaleSnapshot | null;
  /** ml since shot start */
  volume?: number | null;
}

/** A shot with its measurements; only `GET /api/v1/shots/{id}` returns them. */
export interface ShotRecord extends ShotRecordSummary {
  measurements: ShotMeasurement[];
}

export interface ListShotsQuery {
  /** 1-100, default 20 */
  limit?: number;
  offset?: number;
  grinderId?: string;
  grinderModel?: string;
  beanBatchId?: string;
  beanId?: string;
  coffeeName?: string;
  coffeeRoaster?: string;
  profileTitle?: string;
  search?: string;
  order?: 'asc' | 'desc';
}

export interface PaginatedShots {
  items: ShotRecordSummary[];
  total: number;
  limit: number;
  offset: number;
}

// --- settings, skin server ---

/** Decaid's own settings (`ReaSettings`); the fields the skin reads or its settings page sets are named (research.md 20.3). */
export interface DecaidSettings {
  gatewayMode?: 'disabled' | 'full' | 'tracking';
  blockOnNoScale?: boolean;
  /** With `true`, a tare during a shot answers 400 `block_tare_during_shot`. */
  blockTareDuringShot?: boolean;
  defaultSkinId?: string | null;
  keepAwake?: boolean;
  simulatedDevices?: Array<'machine' | 'scale' | 'sensor' | 'bengle'>;
  themeMode?: 'system' | 'light' | 'dark';
  webUiPath?: string | null;
  logLevel?: string;
  weightFlowMultiplier?: number;
  /** s */
  volumeFlowMultiplier?: number;
  /** s, the look-ahead of the stop at weight of hot water */
  hotWaterFlowMultiplier?: number;
  stopHotWaterAtWeight?: boolean;
  automaticUpdateCheck?: boolean;
  chargingMode?: 'disabled' | 'highAvailability' | 'balanced' | 'longevity';
  nightModeEnabled?: boolean;
  /** minutes since midnight */
  nightModeSleepTime?: number;
  nightModeMorningTime?: number;
  lowBatteryBrightnessLimit?: boolean;
  /** the device id Decaid connects by itself when it finds it; null for none */
  preferredMachineId?: string | null;
  preferredScaleId?: string | null;
  /** what the scale does while the machine sleeps */
  scalePowerMode?: 'disabled' | 'displayOff' | 'disconnect';
  /** absent on the rig */
  chargingState?: { batteryPercent?: number; isEmergency?: boolean; currentPhase?: string; usbChargerOn?: boolean } | null;
  [key: string]: unknown;
}

/** `GET /api/v1/machine/settings` (`De1SettingsResponse`): the machine's own settings. */
export interface MachineSettings {
  /** read as a boolean, written as 'enable' or 'disable' (research.md 20.4) */
  usb?: boolean;
  /** °C */
  fan?: number;
  flushTemp?: number;
  flushTimeout?: number;
  flushFlow?: number;
  hotWaterFlow?: number;
  steamFlow?: number;
  tankTemp?: number;
  /** 0 normal, 1 two tap stop */
  steamPurgeMode?: number;
  [key: string]: unknown;
}

/** `POST /api/v1/machine/settings` (`De1SettingsRequest`): what a request may change. */
export type MachineSettingsPatch = Omit<Partial<MachineSettings>, 'usb'> & { usb?: 'enable' | 'disable' };

/** `GET`/`POST /api/v1/machine/settings/advanced` (`De1AdvancedSettingsRequest`). */
export interface AdvancedSettings {
  heaterPh1Flow?: number;
  heaterPh2Flow?: number;
  heaterIdleTemp?: number;
  heaterPh2Timeout?: number;
  /** 120 or 230; above 1000 a committed marker, read minus 1000 */
  heaterVoltage?: number;
  /** 2 auto, 1 force on, 0 force off */
  refillKitSetting?: number;
  [key: string]: unknown;
}

/** `GET /api/v1/info`: Decaid's build. */
export interface DecaidInfo {
  version?: string;
  buildNumber?: string;
  fullVersion?: string;
  commitShort?: string;
  buildTime?: string;
  [key: string]: unknown;
}

/** `DisplayState` in rest_v1.yml: the tablet's screen, as Decaid controls it. */
export interface DisplayState {
  wakeLockEnabled?: boolean;
  wakeLockOverride?: boolean;
  /** 0-100, what is applied */
  brightness?: number;
  /** 0-100, what was asked for; 100 is the brightness the system manages */
  requestedBrightness?: number;
  lowBatteryBrightnessActive?: boolean;
  /** What this platform can do. Brightness is only set where `brightness` is true (spec 3.1). */
  platformSupported?: { brightness?: boolean; wakeLock?: boolean };
}

/** `GET /api/v1/webui/server/status`: where Decaid serves the skin. */
export interface WebUiServerStatus {
  serving: boolean;
  /** the served skin's folder */
  path?: string | null;
  /** the port of the skin's origin */
  port?: number | null;
  ip?: string | null;
}

// --- plugins, presence, calibration, firmware, Decaid's update (research.md 20.3, S2c) ---

/** `PluginSettingSchema`: one setting a plugin's manifest declares. */
export interface PluginSettingSchema {
  type: 'string' | 'number' | 'boolean' | 'enum';
  label?: string;
  description?: string;
  default?: unknown;
  /** held in the platform's credential store; read back only as `{ isSet }` */
  secure?: boolean;
  /** the values of an `enum` */
  values?: string[];
  /** managed by the plugin's own screen (Streamline shows it nowhere) */
  hidden?: boolean;
}

/** `PluginManifest` with its load state, as `GET /api/v1/plugins` lists it. */
export interface PluginManifest {
  id: string;
  name?: string;
  author?: string;
  description?: string;
  version?: string;
  permissions?: string[];
  settings?: Record<string, PluginSettingSchema>;
  loaded?: boolean;
  autoLoad?: boolean;
  /** where the installed copy came from; null for a bundled one */
  source?: {
    kind?: 'github_release' | 'github_branch' | 'local_zip' | 'local_folder';
    repo?: string | null;
    lastChecked?: string | null;
    lastError?: string | null;
  } | null;
  /** an update held back because it asks for more permissions */
  pendingUpdate?: { version?: string; addedPermissions?: string[]; detectedAt?: string } | null;
  [key: string]: unknown;
}

/** A secure setting's value as the gateway reports it: never the value itself. */
export interface SecureState {
  isSet: boolean;
}

/** `PluginSettings`: the stored values; a key without a stored value is absent. A `null` in a write clears it. */
export type PluginSettings = Record<string, unknown>;

/** `WakeSchedule`. */
export interface WakeSchedule {
  id: string;
  /** "HH:MM", 24 hours */
  time: string;
  /** 1 Monday to 7 Sunday; empty for every day */
  daysOfWeek: number[];
  enabled: boolean;
  /** minutes awake after it fires, 1-720; null or absent: only wake */
  keepAwakeFor?: number | null;
}

export type WakeScheduleInput = Omit<WakeSchedule, 'id'>;

/** `GET /api/v1/presence/settings`. */
export interface PresenceSettings {
  userPresenceEnabled?: boolean;
  /** minutes without use before the machine sleeps; 0 turns it off */
  sleepTimeoutMinutes?: number;
  schedules?: WakeSchedule[];
  keepAwakeUntil?: string | null;
  [key: string]: unknown;
}

export type SensorTarget = 'flow' | 'pressure' | 'temperature';

/** `De1SensorCalibration`: for flow and pressure the stored ratio is `measuredValue`; for temperature the offset. */
export interface SensorCalibration {
  target: SensorTarget;
  source: 'current' | 'factory';
  de1ReportedValue: number;
  measuredValue: number;
}

/** `FirmwareCatalogEntry`. */
export interface FirmwareArtifact {
  id: string;
  source?: string;
  supportedModels?: string[];
  build?: number;
  versionLabel?: string;
  channel?: string;
  releaseNotes?: string;
  eligibility?: { status?: 'applicable' | 'notApplicable' | 'unknown'; reasons?: string[] };
}

/** `FirmwareOperationState`. */
export type FirmwareOperation = 'idle' | 'erasing' | 'uploading' | 'verifying' | 'cancelling';

/** `GET /api/v1/machine/firmware`: the bundled firmware and what applies to the machine. */
export interface FirmwareCatalog {
  artifacts?: FirmwareArtifact[];
  machine?: { model?: string; build?: number | null } | null;
  recommendedArtifactId?: string | null;
  /** null: not known (no machine, an unknown build) */
  updateAvailable?: boolean | null;
  operation?: { state?: FirmwareOperation };
}

/** One line of the firmware's NDJSON progress stream. */
export interface FirmwareProgress {
  status: 'erasing' | 'uploading' | 'done' | 'error';
  /** 0..1; -1 with an error */
  progress: number;
  error?: string;
}

/** `AppUpdateState`: Decaid's own update. */
export interface AppUpdateState {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error';
  currentVersion: string;
  latestVersion?: string | null;
  releaseNotes?: string | null;
  releaseUrl: string;
  /** only on Android with an update */
  installable: boolean;
  progress?: number | null;
  error?: string | null;
}
