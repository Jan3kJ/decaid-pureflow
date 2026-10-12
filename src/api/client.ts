// REST client for Decaid's gateway. Plain TypeScript, no UI: the base URL and fetch are
// parameters, so it runs in the skin, in Node and in tests.
import type {
  DecaidSettings,
  ListProfilesQuery,
  ListShotsQuery,
  MachineSnapshot,
  PaginatedShots,
  Profile,
  ProfileRecord,
  RequestedMachineState,
  SaveProfileOptions,
  ShotRecord,
  ShotRecordSummary,
  WebUiServerStatus,
  Workflow,
  WorkflowPatch,
} from './types';

/** Decaid's gateway. The skin only connects to this port; it never serves on it. */
export const DEFAULT_BASE_URL = 'http://localhost:8080';

/** The KV namespace of the skin: its manifest id. */
export const DEFAULT_KV_NAMESPACE = 'decaid-skin';

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
    super(`${method} ${path}: no answer (${cause instanceof Error ? cause.message : String(cause)})`, {
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

  /** Loads a profile to the machine without changing the rest of the workflow. */
  async loadProfileToMachine(profile: Profile): Promise<void> {
    await this.request('POST', '/api/v1/machine/profile', profile);
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

  /** Stores a profile. The record's id is a hash of the content, so the same profile gets the same id. */
  saveProfile(profile: Profile, options: SaveProfileOptions = {}): Promise<ProfileRecord> {
    return this.request('POST', '/api/v1/profiles', { profile, ...options });
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

  // --- scale ---

  /** Throws `TareBlockedError` when Decaid refuses the tare during a shot. */
  async tareScale(): Promise<void> {
    await this.request('PUT', '/api/v1/scale/tare');
  }

  // --- settings ---

  getSettings(): Promise<DecaidSettings> {
    return this.request('GET', '/api/v1/settings');
  }

  /** Changes the given settings; the others keep their values. */
  async updateSettings(patch: Partial<DecaidSettings>): Promise<void> {
    await this.request('POST', '/api/v1/settings', patch);
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
  const text =
    stringField(body, 'type') ?? stringField(body, 'message') ?? stringField(body, 'error') ?? stringField(body, 'e');
  return text ? ` ${text}` : '';
}
