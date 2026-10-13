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

function profile(title: string, targetWeight: number, steps = 1): Json {
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
}

export class MockGateway {
  /** every REST call the page made, in order */
  readonly requests: { method: string; path: string; body: any }[] = [];
  machineConnected: boolean;
  /** the machine's state outside a replay */
  state = 'idle';
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

  private readonly up: boolean;
  private readonly machineSockets = new Set<WebSocketRoute>();
  private readonly scaleSockets = new Set<WebSocketRoute>();
  private weight = 0;
  private replaying = false;
  /** the frame a machine in the middle of a shot repeats */
  private held: Json | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;

  constructor(options: MockOptions = {}) {
    this.up = options.gateway ?? true;
    this.machineConnected = options.machine ?? true;
  }

  async install(page: Page): Promise<this> {
    await page.route(`${GATEWAY}/**`, (route) => this.answer(route));
    await page.routeWebSocket(/:8080\/ws\/v1\/machine\/snapshot/, (ws) => this.open(ws, this.machineSockets));
    await page.routeWebSocket(/:8080\/ws\/v1\/scale\/snapshot/, (ws) => {
      this.open(ws, this.scaleSockets);
      if (this.up) ws.send(JSON.stringify({ status: 'connected' }));
    });
    // A connected machine sends frames all the time, a scale too.
    this.heartbeat = setInterval(() => {
      if (this.replaying) return;
      if (this.machineConnected) this.sendMachine(this.held ?? this.frame());
      this.sendScale({ timestamp: new Date().toISOString(), weight: this.weight, weightFlow: 0, battery: 100, timerValue: null });
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

  /** What stands on the scale, in g: the next weight frames say so. */
  putOnScale(grams: number): void {
    this.weight = grams;
    this.sendScale({ timestamp: new Date().toISOString(), weight: grams, weightFlow: 0, battery: 100, timerValue: null });
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

  private open(ws: WebSocketRoute, sockets: Set<WebSocketRoute>): void {
    if (!this.up) {
      void ws.close();
      return;
    }
    sockets.add(ws);
    ws.onClose(() => sockets.delete(ws));
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
      // The state itself changes when the test replays the shot or lets it end.
      return json(null);
    }
    if (path === '/api/v1/workflow' && method === 'GET') return json(this.workflow);
    if (path === '/api/v1/workflow' && method === 'PUT') {
      this.workflow = {
        ...this.workflow,
        ...body,
        context: { ...this.workflow.context, ...body.context },
        // What a patch leaves out keeps its value (research.md 8.3).
        steamSettings: { ...this.workflow.steamSettings, ...body.steamSettings },
      };
      return json(this.workflow);
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
