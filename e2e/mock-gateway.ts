// A gateway for the browser tests: the REST calls and the two snapshot WebSockets of
// http://localhost:8080 are answered here, so `npm run e2e` needs no Decaid.
import { readFileSync } from 'node:fs';
import type { Page, Route, WebSocketRoute } from '@playwright/test';

export const GATEWAY = 'http://localhost:8080';

type Json = Record<string, any>;

interface RecordedEvent {
  at: number;
  machine?: Json;
  scale?: Json;
}

/** A simulated shot recorded on the rig: Decaid 0.8.8, A-Flow / default-medium, target 36 g. */
export const RECORDING: RecordedEvent[] = JSON.parse(
  readFileSync(new URL('./fixtures/shot.json', import.meta.url), 'utf8'),
);

const isEspresso = (event: RecordedEvent) => event.machine?.state.state === 'espresso';
/** The recording from its first espresso frame on: what a replay sends. */
export const SHOT_EVENTS = RECORDING.slice(RECORDING.findIndex(isEspresso));
export const ESPRESSO_FRAMES = RECORDING.filter(isEspresso).length;

/** The recorded shot as a shot record's measurements: one per espresso frame, with the scale's latest weight. */
export const MEASUREMENTS: Json[] = [];
{
  let scale: Json | null = null;
  for (const event of RECORDING) {
    if (event.scale && 'weight' in event.scale) scale = event.scale;
    if (isEspresso(event)) MEASUREMENTS.push({ machine: event.machine, scale, volume: null });
  }
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
  readonly requests: { method: string; path: string; body: any }[] = [];
  machineConnected: boolean;
  /** the machine's state outside a replay */
  state = 'idle';
  /** Decaid's setting blockTareDuringShot is on and a shot runs: a tare answers 400 */
  tareBlocked = false;
  /** true: a stream is answered with an error frame and closed (research.md 9.4) */
  refuseStreams = false;
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
  };
  profiles: Json[] = [
    record('profile:best', profile('Best practice', 40, 4), { source: 'bundled' }),
    record('profile:medium', this.workflow.profile, { source: 'bundled' }),
    record('profile:light', profile('A-Flow / default-light', 48, 9), { source: 'bundled' }),
    record('profile:adaptive', profile('Adaptive v2', 50, 5), { source: 'bundled' }),
    record('profile:dflow', profile('D-Flow / default', 36, 3), { source: 'bundled' }),
  ];

  /** the shot records, without measurements: `GET /api/v1/shots` */
  shots: Json[] = [];

  private readonly up: boolean;
  private readonly machineSockets = new Set<WebSocketRoute>();
  private readonly scaleSockets = new Set<WebSocketRoute>();
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

  frame(at = Date.now()): Json {
    return {
      timestamp: new Date(at).toISOString().replace('Z', '000'),
      state: { state: this.state, substate: 'idle' },
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
   * from the frames, not from its clock. `from` and `to` are shares of the shot, 0 to 1.
   */
  async replay(page: Page, from = 0, to = 1): Promise<void> {
    this.replaying = true;
    const events = SHOT_EVENTS.slice(Math.round(from * SHOT_EVENTS.length), Math.round(to * SHOT_EVENTS.length));
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
    if (this.up && this.refuseStreams) ws.send(JSON.stringify({ error: 'the mock refuses this stream' }));
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
    this.requests.push({ method, path, body });

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
      const asked = path.split('/').pop();
      if (asked === 'sleeping' || this.state === 'sleeping') this.state = asked!;
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
    if (path === '/api/v1/workflow' && method === 'GET') return json(this.workflow);
    if (path === '/api/v1/workflow' && method === 'PUT') {
      this.workflow = {
        ...this.workflow,
        ...body,
        // A null clears a field of the context: Decaid returns the context without it (research.md 14).
        context: Object.fromEntries(
          Object.entries({ ...this.workflow.context, ...body.context }).filter(([, value]) => value !== null),
        ),
        // What a patch leaves out keeps its value (research.md 8.3).
        steamSettings: { ...this.workflow.steamSettings, ...body.steamSettings },
      };
      return json(this.workflow);
    }
    if (path === '/api/v1/shots' && method === 'GET') {
      const limit = Number(url.searchParams.get('limit') ?? 20);
      const offset = Number(url.searchParams.get('offset') ?? 0);
      const newestFirst = [...this.shots].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      return json({ items: newestFirst.slice(offset, offset + limit), total: this.shots.length, limit, offset });
    }
    if (path.startsWith('/api/v1/shots/') && method === 'GET') {
      const shot = this.shots.find((candidate) => candidate.id === decodeURIComponent(path.split('/').pop()!));
      // Only this call has the measurements (research.md 8.4).
      return shot ? json({ ...shot, measurements: MEASUREMENTS }) : json({ error: 'Shot not found' }, 404);
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
