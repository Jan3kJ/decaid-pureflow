import { describe, expect, it } from 'vitest';
import { DecaidClient } from '../api';
import { STREAMLINE_NAMESPACE } from '../steam/apply';
import { FAST_START } from './fields';
import { NO_VALUES, applyFastStart, rawValue, readAll, resetMachine, writeField, type Values } from './gateway';
import { TREE_FIELDS } from './tree';

const field = (id: string) => TREE_FIELDS.find((entry) => entry.id === id)!;

interface Call {
  method: string;
  path: string;
  body: any;
}

/**
 * A gateway as the rig's Decaid 0.8.8 answers (research.md 20.4): writes are merged, the
 * simulated machine does not keep `tankTemp`, a changed `rinseData` reaches the machine's flush.
 */
function fakeGateway() {
  const calls: Call[] = [];
  const state = {
    decaid: { weightFlowMultiplier: 1, stopHotWaterAtWeight: true, gatewayMode: 'tracking' } as Record<string, any>,
    machine: { fan: 55, usb: false, tankTemp: 20, steamPurgeMode: 0, flushFlow: 6, flushTimeout: 10 } as Record<string, any>,
    advanced: { heaterIdleTemp: 98, heaterPh1Flow: 2.5, heaterPh2Flow: 5, heaterPh2Timeout: 5, heaterVoltage: 120 } as Record<string, any>,
    workflow: {
      steamSettings: { targetTemperature: 150, duration: 50, flow: 0.8 },
      hotWaterData: { targetTemperature: 75, duration: 30, volume: 50, flow: 10 },
      rinseData: { targetTemperature: 90, duration: 10, flow: 6 },
    } as Record<string, any>,
    display: { brightness: 100, requestedBrightness: 100, wakeLockOverride: false } as Record<string, any>,
    presence: { userPresenceEnabled: true, sleepTimeoutMinutes: 30, schedules: [] } as Record<string, any>,
    kv: {} as Record<string, unknown>,
  };
  /** a path that answers 500 */
  const failing = new Set<string>();
  const json = (value: unknown, status = 200) => new Response(value === undefined ? '' : JSON.stringify(value), { status });

  async function fetch(url: string, init?: RequestInit): Promise<Response> {
    const path = decodeURIComponent(new URL(url).pathname);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, body });
    if (failing.has(`${method} ${path}`)) return json({ error: 'DeviceNotConnectedException' }, 500);
    const kv = /^\/api\/v1\/store\/(.+)$/.exec(path)?.[1];
    if (kv) {
      if (method === 'GET') return json(state.kv[kv] ?? null);
      state.kv[kv] = body;
      return json(undefined);
    }
    switch (`${method} ${path}`) {
      case 'GET /api/v1/settings':
        return json(state.decaid);
      case 'POST /api/v1/settings':
        Object.assign(state.decaid, body);
        return json(undefined);
      case 'GET /api/v1/machine/settings':
        return json(state.machine);
      case 'POST /api/v1/machine/settings':
        for (const [key, value] of Object.entries(body)) {
          if (key === 'tankTemp') continue;
          state.machine[key] = key === 'usb' ? value === 'enable' : value;
        }
        return json(undefined, 202);
      case 'GET /api/v1/machine/settings/advanced':
        return json(state.advanced);
      case 'POST /api/v1/machine/settings/advanced':
        Object.assign(state.advanced, body);
        return json(undefined, 202);
      case 'DELETE /api/v1/machine/settings/reset':
        Object.assign(state.machine, { fan: 55, steamPurgeMode: 0 });
        Object.assign(state.advanced, { heaterIdleTemp: 98 });
        return json(undefined, 202);
      case 'GET /api/v1/workflow':
        return json(state.workflow);
      case 'PUT /api/v1/workflow':
        for (const [group, values] of Object.entries(body)) state.workflow[group] = { ...state.workflow[group], ...(values as object) };
        if (body.rinseData) Object.assign(state.machine, { flushFlow: body.rinseData.flow, flushTimeout: body.rinseData.duration });
        return json(state.workflow);
      case 'GET /api/v1/display':
        return json(state.display);
      case 'PUT /api/v1/display/brightness':
        state.display.requestedBrightness = body.brightness;
        return json(state.display);
      case 'POST /api/v1/display/wakelock':
      case 'DELETE /api/v1/display/wakelock':
        state.display.wakeLockOverride = method === 'POST';
        return json(state.display);
      case 'GET /api/v1/info':
        return json({ version: '0.8.8', buildNumber: '2900' });
      case 'POST /api/v1/machine/waterLevels':
        return json(undefined, 202);
      case 'GET /api/v1/presence/settings':
        return json(state.presence);
      case 'POST /api/v1/presence/settings':
        // Decaid holds the timeout in 0..240 (rest_v1.yml).
        Object.assign(state.presence, body);
        state.presence.sleepTimeoutMinutes = Math.min(240, state.presence.sleepTimeoutMinutes);
        return json(state.presence);
    }
    return json({ error: 'no such path' }, 404);
  }

  const client = new DecaidClient({ baseUrl: 'http://gateway', fetch });
  /** the calls after the page's first read */
  const writes = () => calls.filter((call) => call.method !== 'GET');
  return { client, calls, state, failing, writes };
}

async function opened() {
  const gateway = fakeGateway();
  const { values, errors } = await readAll(gateway.client);
  expect(errors).toEqual({});
  gateway.calls.length = 0;
  return { ...gateway, values };
}

describe('readAll', () => {
  it('reads each source once', async () => {
    const gateway = fakeGateway();
    const { values } = await readAll(gateway.client);
    expect(gateway.calls.map((call) => `${call.method} ${call.path}`).sort()).toEqual([
      'GET /api/v1/display',
      'GET /api/v1/info',
      'GET /api/v1/machine/settings',
      'GET /api/v1/machine/settings/advanced',
      'GET /api/v1/presence/settings',
      'GET /api/v1/settings',
      'GET /api/v1/workflow',
    ]);
    expect(rawValue(values, field('heater-idle-temperature'))).toBe(98);
    expect(rawValue(values, field('sleep-timeout'))).toBe(30);
    expect(rawValue(values, field('flush-duration'))).toBe(10);
  });

  it('keeps a source that fails empty and gives its message', async () => {
    const gateway = fakeGateway();
    gateway.failing.add('GET /api/v1/machine/settings');
    const { values, errors } = await readAll(gateway.client);
    expect(values.machine).toBeNull();
    expect(values.advanced).not.toBeNull();
    expect(errors.machine).toContain('500');
  });
});

describe('writeField', () => {
  it.each([
    ['weight-flow-multiplier', 1.1, 'POST', '/api/v1/settings', { weightFlowMultiplier: 1.1 }],
    ['steam-purge-mode', 1, 'POST', '/api/v1/machine/settings', { steamPurgeMode: 1 }],
    ['heater-idle-temperature', 97, 'POST', '/api/v1/machine/settings/advanced', { heaterIdleTemp: 97 }],
    ['stop-hot-water-at-weight', false, 'POST', '/api/v1/settings', { stopHotWaterAtWeight: false }],
    ['steam-flow', 1.2, 'PUT', '/api/v1/workflow', { steamSettings: { flow: 1.2 } }],
    ['brightness', 60, 'PUT', '/api/v1/display/brightness', { brightness: 60 }],
    ['water-alert', 10, 'POST', '/api/v1/machine/waterLevels', { refillLevel: 10 }],
    ['sleep-timeout', 31, 'POST', '/api/v1/presence/settings', { sleepTimeoutMinutes: 31 }],
    ['presence-enabled', false, 'POST', '/api/v1/presence/settings', { userPresenceEnabled: false }],
  ])('%s: one request with that key alone', async (id, value, method, path, body) => {
    const gateway = await opened();
    await writeField(gateway.client, gateway.values, field(id), value);
    expect(gateway.writes()).toEqual([{ method, path, body }]);
  });

  it('shows the value the read-back has, not the one typed', async () => {
    const gateway = await opened();
    const fan = await writeField(gateway.client, gateway.values, field('fan-threshold'), 50);
    expect(rawValue(fan, field('fan-threshold'))).toBe(50);
    // The simulated machine does not keep the tank temperature (research.md 20.4).
    const tank = await writeField(gateway.client, fan, field('tank-temperature'), 30);
    expect(rawValue(tank, field('tank-temperature'))).toBe(20);
    expect(gateway.calls.filter((call) => call.method === 'GET').map((call) => call.path)).toEqual([
      '/api/v1/machine/settings',
      '/api/v1/machine/settings',
    ]);
  });

  it("writes the USB charger as 'enable' and reads it back as true", async () => {
    const gateway = await opened();
    const values = await writeField(gateway.client, gateway.values, field('usb-charger'), true);
    expect(gateway.writes()[0].body).toEqual({ usb: 'enable' });
    expect(rawValue(values, field('usb-charger'))).toBe(true);
    await writeField(gateway.client, values, field('usb-charger'), false);
    expect(gateway.writes()[1].body).toEqual({ usb: 'disable' });
  });

  it('sends the whole rinseData with the one value changed, and the flush reaches the machine', async () => {
    const gateway = await opened();
    const values = await writeField(gateway.client, gateway.values, field('flush-duration'), 14);
    expect(gateway.writes()).toEqual([
      { method: 'PUT', path: '/api/v1/workflow', body: { rinseData: { targetTemperature: 90, duration: 14, flow: 6 } } },
    ]);
    expect(rawValue(values, field('flush-duration'))).toBe(14);
    const flow = await writeField(gateway.client, values, field('flush-flow'), 4.5);
    expect(gateway.writes()[1].body).toEqual({ rinseData: { targetTemperature: 90, duration: 14, flow: 4.5 } });
    expect(rawValue(flow, field('flush-flow'))).toBe(4.5);
    expect(gateway.state.machine).toMatchObject({ flushFlow: 4.5, flushTimeout: 14 });
  });

  it('turns the wake lock on with POST and off with DELETE', async () => {
    const gateway = await opened();
    const on = await writeField(gateway.client, gateway.values, field('wake-lock'), true);
    expect(rawValue(on, field('wake-lock'))).toBe(true);
    await writeField(gateway.client, on, field('wake-lock'), false);
    expect(gateway.writes().map((call) => call.method)).toEqual(['POST', 'DELETE']);
  });

  it('keeps the read values and gives the message when the write fails', async () => {
    const gateway = await opened();
    gateway.failing.add('POST /api/v1/machine/settings/advanced');
    await expect(writeField(gateway.client, gateway.values, field('heater-idle-temperature'), 90)).rejects.toThrow(
      /idle temperature was not set: POST \/api\/v1\/machine\/settings\/advanced: 500/,
    );
    expect(rawValue(gateway.values, field('heater-idle-temperature'))).toBe(98);
  });

  it('says so when the value was written but not read back', async () => {
    const gateway = await opened();
    gateway.failing.add('GET /api/v1/settings');
    await expect(writeField(gateway.client, gateway.values, field('weight-flow-multiplier'), 1.2)).rejects.toThrow(
      /written but not read back/,
    );
  });

  it("moves Streamline's remembered value only when Streamline has one (research.md 16)", async () => {
    const gateway = await opened();
    await writeField(gateway.client, gateway.values, field('flush-duration'), 12);
    expect(gateway.state.kv[`${STREAMLINE_NAMESPACE}/last-flush-duration`]).toBeUndefined();
    expect(gateway.writes().filter((call) => call.path.startsWith('/api/v1/store'))).toEqual([]);

    gateway.state.kv[`${STREAMLINE_NAMESPACE}/last-steam-flow`] = 0.8;
    await writeField(gateway.client, gateway.values, field('steam-flow'), 1.5);
    expect(gateway.state.kv[`${STREAMLINE_NAMESPACE}/last-steam-flow`]).toBe(1.5);
    // Before the workflow, so a Streamline 0.2.13 does not push its old value back.
    const order = gateway.writes().map((call) => `${call.method} ${call.path}`);
    expect(order.slice(-2)).toEqual([`POST /api/v1/store/${STREAMLINE_NAMESPACE}/last-steam-flow`, 'PUT /api/v1/workflow']);
  });

  it("does not remember a steam temperature of 0 for Streamline, which keeps only one that is on", async () => {
    const gateway = await opened();
    gateway.state.kv[`${STREAMLINE_NAMESPACE}/last-steam-temp`] = 150;
    const values = await writeField(gateway.client, gateway.values, field('steam-temperature'), 0);
    expect(gateway.state.kv[`${STREAMLINE_NAMESPACE}/last-steam-temp`]).toBe(150);
    expect(rawValue(values, field('steam-temperature'))).toBe(0);
  });

  it('refuses a hot water write before the workflow is read', async () => {
    const gateway = fakeGateway();
    await expect(writeField(gateway.client, NO_VALUES, field('hot-water-flow'), 5)).rejects.toThrow(/not read yet/);
    expect(gateway.calls).toEqual([]);
  });
});

describe('the actions', () => {
  it('Fast Start Defaults: one write of the four, read back', async () => {
    const gateway = await opened();
    const values: Values = await applyFastStart(gateway.client, gateway.values);
    expect(gateway.writes()).toEqual([{ method: 'POST', path: '/api/v1/machine/settings/advanced', body: FAST_START }]);
    expect(values.advanced).toMatchObject(FAST_START);
  });

  it('the reset reads both machine sources again', async () => {
    const gateway = await opened();
    const changed = await writeField(gateway.client, gateway.values, field('fan-threshold'), 40);
    gateway.calls.length = 0;
    const values = await resetMachine(gateway.client, changed);
    expect(gateway.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'DELETE /api/v1/machine/settings/reset',
      'GET /api/v1/machine/settings',
      'GET /api/v1/machine/settings/advanced',
    ]);
    expect(rawValue(values, field('fan-threshold'))).toBe(55);
  });
});
