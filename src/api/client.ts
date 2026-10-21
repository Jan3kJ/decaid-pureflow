// REST client for Decaid's gateway. Plain TypeScript, no UI: the base URL and fetch are
// parameters, so it runs in the skin, in Node and in tests.
import type {
  AdvancedSettings,
  AppUpdateState,
  BatchInput,
  BatchPatch,
  BeanBatch,
  BeanInput,
  BeanPatch,
  CatalogueBean,
  CupWarmerPreheat,
  CupWarmerState,
  DecaidInfo,
  DeviceConnectResult,
  DeviceInfo,
  DecaidSettings,
  DisplayState,
  FeedbackRequest,
  FirmwareCatalog,
  FirmwareOperation,
  FirmwareProgress,
  Grinder,
  GrinderInput,
  GrinderPatch,
  LedStripState,
  ListProfilesQuery,
  ListShotsQuery,
  MachineInfo,
  MachineSettings,
  MachineSettingsPatch,
  MachineSnapshot,
  PaginatedShots,
  PluginManifest,
  PluginSettings,
  PresenceSettings,
  Profile,
  ProfileRecord,
  RequestedMachineState,
  ProfileUpdate,
  ProfileVisibility,
  SaveProfileOptions,
  ScaleCalibrationState,
  SensorCalibration,
  SensorTarget,
  ShotRecord,
  ShotRecordSummary,
  ShotSettings,
  WakeSchedule,
  WakeScheduleInput,
  WebUiServerStatus,
  WebUiSkin,
  WifiEndpoints,
  Workflow,
  WorkflowPatch,
} from './types';
import { errorMessage } from '../error-message';
import { readNdjson } from './ndjson';

/** Decaid's gateway. The skin only connects to this port; it never serves on it. */
export const DEFAULT_BASE_URL = 'http://localhost:8080';

/** The KV namespace of the skin: its manifest id. */
export const DEFAULT_KV_NAMESPACE = 'pureflow';

export const BLOCK_TARE_DURING_SHOT = 'block_tare_during_shot';

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface DecaidClientOptions {
  baseUrl?: string;
  fetch?: FetchLike;
}

/** The gateway answered with a status that is not 2xx. */
export class DecaidApiError extends Error {
  readonly method: string;
  readonly path: string;
  readonly status: number;
  /** The `type` of the answer's body, where it has one (`block_tare_during_shot`, `block_no_scale`). */
  readonly type: string | undefined;
  /** The parsed body: JSON where it parses, else the text. */
  readonly body: unknown;

  constructor(method: string, path: string, status: number, body: unknown) {
    super(`${method} ${path}: ${status}${describe(body)}`);
    this.name = 'DecaidApiError';
    this.method = method;
    this.path = path;
    this.status = status;
    this.body = body;
    this.type = stringField(body, 'type');
  }
}

/**
 * `PUT /api/v1/scale/tare` answered 400 `block_tare_during_shot`: the setting
 * `blockTareDuringShot` is on and a shot runs. The skin shows it as a notice (spec 3.1).
 */
export class TareBlockedError extends DecaidApiError {
  constructor(method: string, path: string, status: number, body: unknown) {
    super(method, path, status, body);
    this.name = 'TareBlockedError';
  }
}

/** No answer at all: the gateway is not running or not reachable. */
export class DecaidNetworkError extends Error {
  readonly method: string;
  readonly path: string;

  constructor(method: string, path: string, cause: unknown) {
    super(`${method} ${path}: no answer (${errorMessage(cause)})`, {
      cause,
    });
    this.name = 'DecaidNetworkError';
    this.method = method;
    this.path = path;
  }
}

export function isTareBlocked(error: unknown): error is TareBlockedError {
  return error instanceof TareBlockedError;
}

export class DecaidClient {
  readonly baseUrl: string;
  private readonly fetchFn: FetchLike;

  constructor(options: DecaidClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    // Looked up at call time, so a test can stub the global fetch after the client is made.
    this.fetchFn = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
  }

  // --- machine ---

  /** Answers 500 while no machine is connected. */
  getMachineState(): Promise<MachineSnapshot> {
    return this.request('GET', '/api/v1/machine/state');
  }

  /** Asks for a state change. The snapshot stream shows when the machine has followed. */
  async requestMachineState(state: RequestedMachineState): Promise<void> {
    await this.request('PUT', `/api/v1/machine/state/${segment(state)}`);
  }

  /** The connected machine's model, firmware and serial number; answers an error without one. */
  getMachineInfo(): Promise<MachineInfo> {
    return this.request('GET', '/api/v1/machine/info');
  }

  /** Loads a profile to the machine without changing the rest of the workflow. */
  async loadProfileToMachine(profile: Profile): Promise<void> {
    await this.request('POST', '/api/v1/machine/profile', profile);
  }

  /**
   * Writes the machine's own settings, past the workflow: Decaid sends the body to the machine
   * as it is, so it must be a whole frame of `/ws/v1/machine/shotSettings` with the changed
   * value.
   */
  async setShotSettings(settings: ShotSettings): Promise<void> {
    await this.request('POST', '/api/v1/machine/shotSettings', settings);
  }

  /** The machine's own settings: fan, USB, flush, tank, steam purge (research.md 20.3). */
  getMachineSettings(): Promise<MachineSettings> {
    return this.request('GET', '/api/v1/machine/settings');
  }

  /** Changes the given machine settings (202); a read afterwards says what the machine took. */
  async updateMachineSettings(patch: MachineSettingsPatch): Promise<void> {
    await this.request('POST', '/api/v1/machine/settings', patch);
  }

  getAdvancedSettings(): Promise<AdvancedSettings> {
    return this.request('GET', '/api/v1/machine/settings/advanced');
  }

  async updateAdvancedSettings(patch: Partial<AdvancedSettings>): Promise<void> {
    await this.request('POST', '/api/v1/machine/settings/advanced', patch);
  }

  /** The factory's fan, heater, refill kit, flow estimation and steam purge values; the workflow is not touched. */
  async resetMachineSettings(): Promise<void> {
    await this.request('DELETE', '/api/v1/machine/settings/reset');
  }

  /** mm, the water level of the refill warning; read on `/ws/v1/machine/waterLevels`. */
  async setRefillLevel(refillLevel: number): Promise<void> {
    await this.request('POST', '/api/v1/machine/waterLevels', { refillLevel });
  }

  /**
   * One sensor's calibration: for flow and pressure the stored ratio, for temperature the
   * offset, both in `measuredValue`. Answers 500 or 504 without a machine.
   */
  getSensorCalibration(target: SensorTarget): Promise<SensorCalibration> {
    return this.request('GET', `/api/v1/machine/calibration/${segment(target)}`);
  }

  /**
   * A correction, not a value: the machine multiplies its flow or pressure ratio by
   * `measured / reported` and adds `measured - reported` to the temperature offset. 202 once the
   * machine acknowledged it.
   */
  async correctSensorCalibration(target: SensorTarget, de1ReportedValue: number, measuredValue: number): Promise<void> {
    await this.request('PUT', `/api/v1/machine/calibration/${segment(target)}`, { de1ReportedValue, measuredValue });
  }

  /** The bundled firmware, what applies to the connected machine, and an update running. No machine needed. */
  getFirmwareCatalog(): Promise<FirmwareCatalog> {
    return this.request('GET', '/api/v1/machine/firmware');
  }

  /**
   * Flashes a bundled firmware build. The answer is an NDJSON stream (`erasing`, `uploading`,
   * then `done` or `error`), each line given to `onProgress`; resolves with `done` only, and a
   * stream that ends without it throws.
   */
  applyFirmware(artifactId: string, onProgress: (progress: FirmwareProgress) => void): Promise<void> {
    return this.firmwareStream(
      '/api/v1/machine/firmware/apply',
      { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ artifactId }) },
      onProgress,
    );
  }

  /** Flashes a firmware file the user chose (the raw image is the body); the progress is `applyFirmware`'s. */
  uploadFirmware(file: Blob, onProgress: (progress: FirmwareProgress) => void): Promise<void> {
    return this.firmwareStream('/api/v1/machine/firmware', { body: file }, onProgress);
  }

  private async firmwareStream(
    path: string,
    init: { headers?: Record<string, string>; body: string | Blob },
    onProgress: (progress: FirmwareProgress) => void,
  ): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchFn(this.baseUrl + path, { method: 'POST', ...init });
    } catch (cause) {
      throw new DecaidNetworkError('POST', path, cause);
    }
    if (!response.ok) throw new DecaidApiError('POST', path, response.status, parse(await response.text()));
    let last: FirmwareProgress | null = null;
    await readNdjson<FirmwareProgress>(response, (event) => {
      last = event;
      onProgress(event);
    });
    const end = last as FirmwareProgress | null;
    if (end?.status === 'error') throw new Error(`The firmware update failed: ${end.error ?? 'no reason given'}`);
    if (end?.status !== 'done') throw new Error('The firmware stream ended before the update was confirmed');
  }

  /** Cancels a firmware update; safe with none running. */
  async cancelFirmware(): Promise<FirmwareOperation | undefined> {
    const answer = await this.request<{ operation?: { state?: FirmwareOperation } } | undefined>('DELETE', '/api/v1/machine/firmware');
    return answer?.operation?.state;
  }

  // --- Bengle: cup warmer, lighting, load cells (404 on any other machine) ---

  getCupWarmer(): Promise<CupWarmerState> {
    return this.request('GET', '/api/v1/machine/cupWarmer');
  }

  /** A temperature alone also switches the mat on; `enabled` alone leaves the setpoint. */
  async setCupWarmer(update: { temperature?: number; enabled?: boolean }): Promise<void> {
    await this.request('PUT', '/api/v1/machine/cupWarmer', update);
  }

  getCupWarmerPreheat(): Promise<CupWarmerPreheat> {
    return this.request('GET', '/api/v1/machine/cupWarmer/preheat');
  }

  async setCupWarmerPreheat(update: { enabled?: boolean; leadMinutes?: number }): Promise<void> {
    await this.request('PUT', '/api/v1/machine/cupWarmer/preheat', update);
  }

  /** Answers 503 until Decaid has read the palette from the machine. */
  getLedStrip(): Promise<LedStripState> {
    return this.request('GET', '/api/v1/machine/ledStrip');
  }

  /** Writes the whole palette; the machine stores it at once (`frontSwitch` is derived and ignored). */
  async setLedStrip(state: Pick<LedStripState, 'frontStrip' | 'backStrip'>): Promise<void> {
    await this.request('PUT', '/api/v1/machine/ledStrip', state);
  }

  getScaleCalibration(): Promise<ScaleCalibrationState> {
    return this.request('GET', '/api/v1/machine/scaleCalibration');
  }

  /** One step of the integrated scale's calibration; `latch` takes the known mass in grams. A busy machine answers 409. */
  async commandScaleCalibration(command: 'zero' | 'abort' | { latch: number }): Promise<void> {
    const body = typeof command === 'string' ? { command } : { command: 'latch', weightGrams: command.latch };
    await this.request('PUT', '/api/v1/machine/scaleCalibration', body);
  }

  // --- feedback ---

  /** Sends feedback to Decent through Decaid; it becomes a public GitHub issue. */
  sendFeedback(feedback: FeedbackRequest): Promise<{ issueUrl?: string } | undefined> {
    return this.request('POST', '/api/v1/feedback', feedback);
  }

  // --- workflow ---

  getWorkflow(): Promise<Workflow> {
    return this.request('GET', '/api/v1/workflow');
  }

  /** Merges the patch into the current workflow and returns the whole workflow. */
  updateWorkflow(patch: WorkflowPatch): Promise<Workflow> {
    return this.request('PUT', '/api/v1/workflow', patch);
  }

  /** The steam timer in whole seconds (spec 3.4). */
  setSteamDuration(seconds: number): Promise<Workflow> {
    return this.updateWorkflow({ steamSettings: { duration: seconds } });
  }

  /** The stop-at-weight target in grams; 0 turns it off. */
  setTargetYield(grams: number): Promise<Workflow> {
    return this.updateWorkflow({ context: { targetYield: grams } });
  }

  // --- profiles ---

  listProfiles(query: ListProfilesQuery = {}): Promise<ProfileRecord[]> {
    return this.request('GET', `/api/v1/profiles${queryString(query)}`);
  }

  getProfile(id: string): Promise<ProfileRecord> {
    return this.request('GET', `/api/v1/profiles/${segment(id)}`);
  }

  /**
   * Stores a profile. The record's id is a hash of the steps and the target weight, not of the
   * title or the notes: for steps that exist the answer is the existing record, unchanged.
   */
  saveProfile(profile: Profile, options: SaveProfileOptions = {}): Promise<ProfileRecord> {
    return this.request('POST', '/api/v1/profiles', { profile, ...options });
  }

  /**
   * Changes a stored profile. Notes and title leave the id as it is; other steps or another
   * target weight give the record a new id. A bundled default's content cannot be changed (400).
   */
  updateProfile(id: string, update: ProfileUpdate): Promise<ProfileRecord> {
    return this.request('PUT', `/api/v1/profiles/${segment(id)}`, update);
  }

  /** A hidden profile stays in the store and in the lineage, and leaves the list. */
  setProfileVisibility(id: string, visibility: ProfileVisibility): Promise<ProfileRecord> {
    return this.request('PUT', `/api/v1/profiles/${segment(id)}/visibility`, { visibility });
  }

  /**
   * Removes a profile from the list: Decaid marks a user's profile `deleted` and hides one of its
   * bundled profiles. The record stays, in the lineage and under `includeHidden`; a `POST` of its
   * steps answers with it, still deleted. An unknown id is 404.
   */
  async deleteProfile(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/profiles/${segment(id)}`);
  }

  /** The versions of a profile, parents and children, hidden ones too. */
  getProfileLineage(id: string): Promise<ProfileRecord[]> {
    return this.request('GET', `/api/v1/profiles/${segment(id)}/lineage`);
  }

  // --- shots ---

  /** A page of shots without measurements, newest first. */
  listShots(query: ListShotsQuery = {}): Promise<PaginatedShots> {
    return this.request('GET', `/api/v1/shots${queryString(query)}`);
  }

  /** One shot with its measurements. */
  getShot(id: string): Promise<ShotRecord> {
    return this.request('GET', `/api/v1/shots/${segment(id)}`);
  }

  /** The latest shot, without measurements. */
  getLatestShot(): Promise<ShotRecordSummary> {
    return this.request('GET', '/api/v1/shots/latest');
  }

  // --- beans and grinders (research.md 29.3) ---

  /** Archived beans only with `includeArchived`. */
  listBeans(includeArchived = false): Promise<CatalogueBean[]> {
    return this.request('GET', `/api/v1/beans${queryString({ includeArchived: includeArchived || undefined })}`);
  }

  createBean(bean: BeanInput): Promise<CatalogueBean> {
    return this.request('POST', '/api/v1/beans', bean);
  }

  /** Changes the fields the patch holds; the others keep their values. `archived` archives or restores. */
  updateBean(id: string, patch: BeanPatch): Promise<CatalogueBean> {
    return this.request('PUT', `/api/v1/beans/${segment(id)}`, patch);
  }

  /** The batches of one bean; an unknown bean has none (200 `[]`). */
  listBatches(beanId: string, includeArchived = false): Promise<BeanBatch[]> {
    return this.request(
      'GET',
      `/api/v1/beans/${segment(beanId)}/batches${queryString({ includeArchived: includeArchived || undefined })}`,
    );
  }

  /** The batches of every bean, in one request. */
  listAllBatches(includeArchived = false): Promise<BeanBatch[]> {
    return this.request('GET', `/api/v1/bean-batches${queryString({ includeArchived: includeArchived || undefined })}`);
  }

  createBatch(beanId: string, batch: BatchInput = {}): Promise<BeanBatch> {
    return this.request('POST', `/api/v1/beans/${segment(beanId)}/batches`, batch);
  }

  updateBatch(id: string, patch: BatchPatch): Promise<BeanBatch> {
    return this.request('PUT', `/api/v1/bean-batches/${segment(id)}`, patch);
  }

  /** Archived grinders only with `includeArchived`. */
  listGrinders(includeArchived = false): Promise<Grinder[]> {
    return this.request('GET', `/api/v1/grinders${queryString({ includeArchived: includeArchived || undefined })}`);
  }

  createGrinder(grinder: GrinderInput): Promise<Grinder> {
    return this.request('POST', '/api/v1/grinders', grinder);
  }

  updateGrinder(id: string, patch: GrinderPatch): Promise<Grinder> {
    return this.request('PUT', `/api/v1/grinders/${segment(id)}`, patch);
  }

  // --- devices ---

  /** The machines, scales and sensors Decaid knows, with their states; `/ws/v1/devices` streams the same. */
  listDevices(): Promise<DeviceInfo[]> {
    return this.request('GET', '/api/v1/devices');
  }

  /**
   * A scan. With `connect` (Decaid's default) the missing machine and scale are connected
   * without replacing connected ones; with `quick` the answer comes at once and the scan goes on.
   */
  scanDevices(options: { connect?: boolean; quick?: boolean } = {}): Promise<DeviceInfo[]> {
    return this.request('GET', `/api/v1/devices/scan${queryString(options)}`);
  }

  /** The id goes in the body: a MAC has colons, a serial port slashes. */
  connectDevice(deviceId: string): Promise<DeviceConnectResult> {
    return this.request('PUT', '/api/v1/devices/connect', { deviceId });
  }

  async disconnectDevice(deviceId: string): Promise<void> {
    await this.request('PUT', '/api/v1/devices/disconnect', { deviceId });
  }

  /** Removes a device from Decaid's remembered devices; one that is present stays listed. */
  async forgetDevice(deviceId: string): Promise<void> {
    await this.request('PUT', '/api/v1/devices/forget', { deviceId });
  }

  /** The Wi-Fi scales added by host; the ones Decaid finds by itself are in the device list only. */
  async listWifiScales(): Promise<string[]> {
    return (await this.request<WifiEndpoints>('GET', '/api/v1/devices/wifi')).endpoints ?? [];
  }

  async addWifiScale(host: string): Promise<string[]> {
    return (await this.request<WifiEndpoints>('POST', '/api/v1/devices/wifi', { host })).endpoints ?? [];
  }

  async removeWifiScale(host: string): Promise<string[]> {
    return (await this.request<WifiEndpoints>('DELETE', '/api/v1/devices/wifi', { host })).endpoints ?? [];
  }

  // --- scale ---

  /** Throws `TareBlockedError` when Decaid refuses the tare during a shot. */
  async tareScale(): Promise<void> {
    await this.request('PUT', '/api/v1/scale/tare');
  }

  // --- display ---

  getDisplay(): Promise<DisplayState> {
    return this.request('GET', '/api/v1/display');
  }

  /** 0 to 99 sets the screen's brightness; 100 hands it back to the system. */
  setBrightness(brightness: number): Promise<DisplayState> {
    return this.request('PUT', '/api/v1/display/brightness', { brightness });
  }

  /** Keeps the screen on (`wakeLockOverride`), or releases it. */
  setWakeLock(on: boolean): Promise<DisplayState> {
    return this.request(on ? 'POST' : 'DELETE', '/api/v1/display/wakelock');
  }

  // --- settings ---

  /** Decaid's version and build. */
  getInfo(): Promise<DecaidInfo> {
    return this.request('GET', '/api/v1/info');
  }

  getSettings(): Promise<DecaidSettings> {
    return this.request('GET', '/api/v1/settings');
  }

  /** Changes the given settings; the others keep their values. */
  async updateSettings(patch: Partial<DecaidSettings>): Promise<void> {
    await this.request('POST', '/api/v1/settings', patch);
  }

  /** Decaid's own update: the phase and the version offered. Reads only; it starts no check. */
  getAppUpdate(): Promise<AppUpdateState> {
    return this.request('GET', '/api/v1/update');
  }

  // --- presence ---

  /** Presence, the sleep after so many minutes, and the wake schedules. */
  getPresenceSettings(): Promise<PresenceSettings> {
    return this.request('GET', '/api/v1/presence/settings');
  }

  /** Changes the given presence settings; the others keep their values. */
  async updatePresenceSettings(patch: Pick<PresenceSettings, 'userPresenceEnabled' | 'sleepTimeoutMinutes'>): Promise<void> {
    await this.request('POST', '/api/v1/presence/settings', patch);
  }

  createWakeSchedule(schedule: WakeScheduleInput): Promise<WakeSchedule> {
    return this.request('POST', '/api/v1/presence/schedules', schedule);
  }

  /** Changes the given fields of a schedule. */
  async updateWakeSchedule(id: string, patch: Partial<WakeScheduleInput>): Promise<void> {
    await this.request('PUT', `/api/v1/presence/schedules/${segment(id)}`, patch);
  }

  async deleteWakeSchedule(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/presence/schedules/${segment(id)}`);
  }

  // --- plugins ---

  /** Every installed plugin: its manifest (with the settings' schema), loaded, its source and a held update. */
  listPlugins(): Promise<PluginManifest[]> {
    return this.request('GET', '/api/v1/plugins');
  }

  /** The stored values; a secure one is `{ isSet }`, never the value. */
  async getPluginSettings(id: string): Promise<PluginSettings> {
    return (await this.request<PluginSettings | undefined>('GET', `/api/v1/plugins/${segment(id)}/settings`)) ?? {};
  }

  /** Changes the given values (`null` clears one); the answer is the stored values, secure ones redacted. */
  async updatePluginSettings(id: string, patch: PluginSettings): Promise<PluginSettings> {
    return (await this.request<PluginSettings | undefined>('POST', `/api/v1/plugins/${segment(id)}/settings`, patch)) ?? {};
  }

  /** Enables and loads a plugin, or disables and unloads it. */
  async setPluginEnabled(id: string, enabled: boolean): Promise<void> {
    await this.request('POST', `/api/v1/plugins/${segment(id)}/${enabled ? 'enable' : 'disable'}`);
  }

  /** Checks every plugin from GitHub for an update; one that asks for more permissions is held back. */
  async checkPluginUpdates(): Promise<void> {
    await this.request('POST', '/api/v1/plugins/update');
  }

  /** Installs the held update of a plugin, with the permissions it adds. */
  async approvePluginUpdate(id: string): Promise<void> {
    await this.request('POST', `/api/v1/plugins/${segment(id)}/update/approve`);
  }

  // --- KV store ---

  kvKeys(namespace: string = DEFAULT_KV_NAMESPACE): Promise<string[]> {
    return this.request('GET', `/api/v1/store/${segment(namespace)}`);
  }

  /**
   * The JSON value under a key, or `null` for a key that does not exist: Decaid 0.8.8
   * answers `200 null` for it, and its documentation says 404.
   */
  async kvGet<T = unknown>(key: string, namespace: string = DEFAULT_KV_NAMESPACE): Promise<T | null> {
    try {
      const value = await this.request<T | undefined>('GET', kvPath(namespace, key));
      return value ?? null;
    } catch (error) {
      if (error instanceof DecaidApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** Stores any JSON value under a key. */
  async kvSet(key: string, value: unknown, namespace: string = DEFAULT_KV_NAMESPACE): Promise<void> {
    await this.request('POST', kvPath(namespace, key), value);
  }

  async kvDelete(key: string, namespace: string = DEFAULT_KV_NAMESPACE): Promise<void> {
    try {
      await this.request('DELETE', kvPath(namespace, key));
    } catch (error) {
      if (error instanceof DecaidApiError && error.status === 404) return;
      throw error;
    }
  }

  // --- skin server ---

  /** Where Decaid serves the skin. The port is not fixed: read it here. */
  getWebUiServerStatus(): Promise<WebUiServerStatus> {
    return this.request('GET', '/api/v1/webui/server/status');
  }

  /** Decaid's installed skins. */
  async listSkins(): Promise<WebUiSkin[]> {
    return (await this.request<WebUiSkin[] | undefined>('GET', '/api/v1/webui/skins')) ?? [];
  }

  /** The skin Decaid serves: the default one. */
  getDefaultSkin(): Promise<WebUiSkin> {
    return this.request('GET', '/api/v1/webui/skins/default');
  }

  /** Makes a skin the default; Decaid serves it after its skin server is started again. */
  async setDefaultSkin(skinId: string): Promise<void> {
    await this.request('PUT', '/api/v1/webui/skins/default', { skinId });
  }

  /** Decaid looks for newer versions of every skin at its source and installs them. */
  async updateSkins(): Promise<void> {
    await this.request('POST', '/api/v1/webui/skins/update');
  }

  async stopWebUiServer(): Promise<void> {
    await this.request('POST', '/api/v1/webui/server/stop');
  }

  /** Serves the default skin. */
  async startWebUiServer(): Promise<void> {
    await this.request('POST', '/api/v1/webui/server/start');
  }

  // --- transport ---

  /** One request. A body is sent as JSON; an empty answer gives `undefined`. */
  async request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.headers = { 'Content-Type': 'application/json' };
      init.body = JSON.stringify(body);
    }

    let response: Response;
    let text: string;
    try {
      response = await this.fetchFn(this.baseUrl + path, init);
      text = await response.text();
    } catch (cause) {
      throw new DecaidNetworkError(method, path, cause);
    }

    const parsed = parse(text);
    if (!response.ok) {
      if (response.status === 400 && stringField(parsed, 'type') === BLOCK_TARE_DURING_SHOT) {
        throw new TareBlockedError(method, path, response.status, parsed);
      }
      throw new DecaidApiError(method, path, response.status, parsed);
    }
    return parsed as T;
  }
}

function kvPath(namespace: string, key: string): string {
  return `/api/v1/store/${segment(namespace)}/${segment(key)}`;
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function queryString(query: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : '';
}

function parse(text: string): unknown {
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : undefined;
}

function describe(body: unknown): string {
  if (typeof body === 'string') return body ? ` ${body}` : '';
  const text = stringField(body, 'type') ?? stringField(body, 'message') ?? stringField(body, 'error') ?? stringField(body, 'e');
  return text ? ` ${text}` : '';
}
