import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile } from '../aflow';
import {
  DecaidApiError,
  DecaidClient,
  DecaidNetworkError,
  DEFAULT_BASE_URL,
  TareBlockedError,
  isTareBlocked,
  type FetchLike,
} from './client';
import type { MachineSnapshot, Profile } from './types';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  /** the parsed JSON body, or undefined without a body */
  body: unknown;
}

interface Answer {
  status?: number;
  /** sent as JSON; a string is sent as it is */
  body?: unknown;
}

/** A fetch that records every call and answers from a list, then with `200 null`. */
function stubFetch(...answers: Answer[]) {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init = {}) => {
    calls.push({
      url,
      method: init.method ?? 'GET',
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const { status = 200, body = null } = answers.shift() ?? {};
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    // A 204 must not have a body.
    return new Response(status === 204 ? null : text, { status });
  };
  return { fetch, calls };
}

function clientWith(...answers: Answer[]) {
  const { fetch, calls } = stubFetch(...answers);
  return { client: new DecaidClient({ fetch }), calls };
}

// Verbatim from the rig (research.md 8.2).
const SNAPSHOT: MachineSnapshot = {
  timestamp: '2026-10-11T12:23:39.408036',
  state: { state: 'idle', substate: 'idle' },
  flow: 0.0,
  pressure: 0.0,
  targetFlow: 0.0,
  targetPressure: 0.0,
  mixTemperature: 44.0,
  groupTemperature: 44.0,
  targetMixTemperature: 93.0,
  targetGroupTemperature: 93.0,
  profileFrame: 0,
  steamTemperature: 88,
};

const PROFILE: Profile = {
  version: '2',
  title: 'A-Flow / test',
  author: 'Janek',
  notes: 'notes',
  beverage_type: 'espresso',
  steps: [
    {
      name: 'Fill',
      pump: 'flow',
      transition: 'fast',
      exit: { type: 'pressure', condition: 'over', value: 3 },
      volume: 100,
      seconds: 15,
      weight: 0,
      temperature: 93,
      sensor: 'coffee',
      flow: 8,
      limiter: { value: 8, range: 0.6 },
    },
  ],
  tank_temperature: 0,
  target_weight: 36,
  target_volume: 100,
  target_volume_count_start: 2,
};

describe('base URL', () => {
  it('is http://localhost:8080 by default', async () => {
    const { client, calls } = clientWith({ body: SNAPSHOT });
    await client.getMachineState();
    expect(DEFAULT_BASE_URL).toBe('http://localhost:8080');
    expect(calls[0].url).toBe('http://localhost:8080/api/v1/machine/state');
  });

  it('is a parameter; a trailing slash is dropped', async () => {
    const { fetch, calls } = stubFetch({ body: SNAPSHOT });
    await new DecaidClient({ baseUrl: 'http://192.168.1.20:8080/', fetch }).getMachineState();
    expect(calls[0].url).toBe('http://192.168.1.20:8080/api/v1/machine/state');
  });
});

describe('machine', () => {
  it('reads the machine state', async () => {
    const { client, calls } = clientWith({ body: SNAPSHOT });
    const snapshot = await client.getMachineState();
    expect(snapshot.state.state).toBe('idle');
    expect(snapshot.profileFrame).toBe(0);
    expect(calls[0]).toMatchObject({ method: 'GET', body: undefined });
  });

  it.each(['idle', 'espresso', 'steam', 'sleeping'] as const)('requests the state %s', async (state) => {
    const { client, calls } = clientWith();
    await expect(client.requestMachineState(state)).resolves.toBeUndefined();
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].url).toBe(`http://localhost:8080/api/v1/machine/state/${state}`);
    expect(calls[0].body).toBeUndefined();
  });

  it('loads a profile to the machine: the profile itself is the body', async () => {
    const { client, calls } = clientWith();
    await client.loadProfileToMachine(PROFILE);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toBe('http://localhost:8080/api/v1/machine/profile');
    expect(calls[0].headers['Content-Type']).toBe('application/json');
    expect(calls[0].body).toEqual(PROFILE);
  });

  it("takes the generator's output as a profile", async () => {
    const { client, calls } = clientWith();
    const profile = generateProfile(DEFAULT_PROFILES[0].params, { title: 'A-Flow / generated' });
    await client.loadProfileToMachine(profile);
    expect(calls[0].body).toEqual(profile);
  });
});

describe('workflow', () => {
  it('reads the workflow', async () => {
    const workflow = { id: 'w1', profile: PROFILE, context: { targetYield: 36 } };
    const { client, calls } = clientWith({ body: workflow });
    expect(await client.getWorkflow()).toEqual(workflow);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://localhost:8080/api/v1/workflow' });
  });

  it('writes a patch with PUT and returns the whole workflow', async () => {
    const answer = { context: { targetDoseWeight: 18, targetYield: 36, grinderSetting: '5.2' } };
    const { client, calls } = clientWith({ body: answer });
    const patch = { profile: PROFILE, context: { targetDoseWeight: 18, targetYield: 36, grinderSetting: '5.2' } };
    expect(await client.updateWorkflow(patch)).toEqual(answer);
    expect(calls[0]).toMatchObject({ method: 'PUT', url: 'http://localhost:8080/api/v1/workflow' });
    expect(calls[0].body).toEqual(patch);
  });

  it('sets the steam timer as steamSettings.duration, and nothing else', async () => {
    const { client, calls } = clientWith({ body: {} });
    await client.setSteamDuration(42);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].body).toEqual({ steamSettings: { duration: 42 } });
  });

  it('sets the target weight as context.targetYield, and nothing else', async () => {
    const { client, calls } = clientWith({ body: {} });
    await client.setTargetYield(36);
    expect(calls[0].method).toBe('PUT');
    expect(calls[0].body).toEqual({ context: { targetYield: 36 } });
  });
});

describe('profiles', () => {
  it('lists the profiles', async () => {
    const { client, calls } = clientWith({ body: [] }, { body: [] });
    await client.listProfiles();
    await client.listProfiles({ includeHidden: true, parentId: 'profile:abc' });
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://localhost:8080/api/v1/profiles' });
    expect(calls[1].url).toBe('http://localhost:8080/api/v1/profiles?includeHidden=true&parentId=profile%3Aabc');
  });

  it('reads one profile; the id is encoded as one path component', async () => {
    const { client, calls } = clientWith({ body: { id: 'profile:6c8161b8fe267a5be64e', profile: PROFILE } });
    const record = await client.getProfile('profile:6c8161b8fe267a5be64e');
    expect(record.profile.title).toBe('A-Flow / test');
    expect(calls[0].url).toBe('http://localhost:8080/api/v1/profiles/profile%3A6c8161b8fe267a5be64e');
  });

  it('saves a profile with POST /api/v1/profiles, wrapped in {profile}', async () => {
    const { client, calls } = clientWith({ status: 201, body: { id: 'profile:1', profile: PROFILE } });
    const record = await client.saveProfile(PROFILE);
    expect(record.id).toBe('profile:1');
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'http://localhost:8080/api/v1/profiles' });
    expect(calls[0].body).toEqual({ profile: PROFILE });
  });

  it('sends the parent id and the metadata with a saved profile', async () => {
    const { client, calls } = clientWith({ status: 201, body: {} });
    await client.saveProfile(PROFILE, { parentId: 'profile:0', metadata: { source: 'decaid-skin' } });
    expect(calls[0].body).toEqual({
      profile: PROFILE,
      parentId: 'profile:0',
      metadata: { source: 'decaid-skin' },
    });
  });
});

describe('shots', () => {
  it('lists shots with limit and filters as a query', async () => {
    const page = { items: [], total: 0, limit: 5, offset: 0 };
    const { client, calls } = clientWith({ body: page }, { body: page });
    expect(await client.listShots()).toEqual(page);
    await client.listShots({ limit: 5, offset: 10, profileTitle: 'A-Flow / default-medium' });
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://localhost:8080/api/v1/shots' });
    expect(calls[1].url).toBe(
      'http://localhost:8080/api/v1/shots?limit=5&offset=10&profileTitle=A-Flow+%2F+default-medium',
    );
  });

  it('reads one shot with its measurements', async () => {
    const shot = {
      id: 'ee7495ea-e744-4db8-93e2-a91f706c7e52',
      timestamp: '2026-10-11T12:23:42.408198',
      stopReason: 'targetWeight',
      measurements: [
        {
          machine: SNAPSHOT,
          scale: { timestamp: 't', weight: 6.205, weightFlow: 0.93, battery: 100, timerValue: 13305 },
          volume: 10.06,
        },
      ],
    };
    const { client, calls } = clientWith({ body: shot });
    const record = await client.getShot(shot.id);
    expect(record.measurements[0].scale?.weight).toBe(6.205);
    expect(calls[0]).toMatchObject({ method: 'GET', url: `http://localhost:8080/api/v1/shots/${shot.id}` });
  });

  it('reads the latest shot', async () => {
    const { client, calls } = clientWith({ body: { id: 's1', timestamp: 't' } });
    expect((await client.getLatestShot()).id).toBe('s1');
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://localhost:8080/api/v1/shots/latest' });
  });
});

describe('scale tare', () => {
  it('tares with PUT and no body', async () => {
    const { client, calls } = clientWith();
    await expect(client.tareScale()).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'PUT', url: 'http://localhost:8080/api/v1/scale/tare' });
    expect(calls[0].body).toBeUndefined();
  });

  it('tells a 400 block_tare_during_shot apart from other errors', async () => {
    const body = { type: 'block_tare_during_shot', details: 'A shot is brewing' };
    const { client } = clientWith({ status: 400, body });
    const error = await client.tareScale().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TareBlockedError);
    expect(error).toBeInstanceOf(DecaidApiError);
    expect(isTareBlocked(error)).toBe(true);
    expect(error).toMatchObject({ status: 400, type: 'block_tare_during_shot', body });
  });

  it('gives a plain DecaidApiError for another 400 and for a 500', async () => {
    const { client } = clientWith(
      { status: 400, body: { type: 'something_else' } },
      { status: 500, body: { error: 'Scale command failed', code: 'unsupported_operation' } },
      { status: 404, body: 'Scale not found' },
    );
    for (const status of [400, 500, 404]) {
      const error = await client.tareScale().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(DecaidApiError);
      expect(error).not.toBeInstanceOf(TareBlockedError);
      expect(isTareBlocked(error)).toBe(false);
      expect((error as DecaidApiError).status).toBe(status);
    }
  });
});

describe('settings', () => {
  it('reads the settings', async () => {
    const { client, calls } = clientWith({ body: { gatewayMode: 'tracking', blockTareDuringShot: false } });
    expect((await client.getSettings()).blockTareDuringShot).toBe(false);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://localhost:8080/api/v1/settings' });
  });

  it('writes settings with POST', async () => {
    const { client, calls } = clientWith();
    await client.updateSettings({ blockTareDuringShot: true });
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'http://localhost:8080/api/v1/settings' });
    expect(calls[0].body).toEqual({ blockTareDuringShot: true });
  });
});

describe('KV store', () => {
  it('lists the keys of the namespace decaid-skin', async () => {
    const { client, calls } = clientWith({ body: ['settings'] });
    expect(await client.kvKeys()).toEqual(['settings']);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://localhost:8080/api/v1/store/decaid-skin' });
  });

  it('writes a value with POST; the 204 has no body', async () => {
    const { client, calls } = clientWith({ status: 204 });
    await expect(client.kvSet('steam', { mugs: [200, 300, 400] })).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'POST', url: 'http://localhost:8080/api/v1/store/decaid-skin/steam' });
    expect(calls[0].body).toEqual({ mugs: [200, 300, 400] });
  });

  it('writes a string as a JSON string', async () => {
    const { client, calls } = clientWith({ status: 204 });
    await client.kvSet('aflow', 'A-Flow 3.0;18;8');
    expect(calls[0].body).toBe('A-Flow 3.0;18;8');
  });

  it('reads a value; namespace and key are encoded', async () => {
    const { client, calls } = clientWith({ body: { a: 1 } });
    expect(await client.kvGet('a key', 'other/ns')).toEqual({ a: 1 });
    expect(calls[0].url).toBe('http://localhost:8080/api/v1/store/other%2Fns/a%20key');
  });

  it('gives null for a missing key, answered as 200 null or as 404', async () => {
    const { client } = clientWith({ body: null }, { status: 404, body: 'Not found' });
    expect(await client.kvGet('nope')).toBeNull();
    expect(await client.kvGet('nope')).toBeNull();
  });

  it('deletes a key; a missing one is not an error', async () => {
    const { client, calls } = clientWith({ body: { deleted: true } }, { status: 404, body: 'Not found' });
    await client.kvDelete('steam');
    await expect(client.kvDelete('steam')).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({ method: 'DELETE', url: 'http://localhost:8080/api/v1/store/decaid-skin/steam' });
  });
});

describe('skin server', () => {
  it('reads the status with the port of the skin', async () => {
    const status = { serving: true, path: '/web-ui/streamline.js', port: 27906, ip: 'localhost' };
    const { client, calls } = clientWith({ body: status });
    expect((await client.getWebUiServerStatus()).port).toBe(27906);
    expect(calls[0]).toMatchObject({ method: 'GET', url: 'http://localhost:8080/api/v1/webui/server/status' });
  });
});

describe('errors', () => {
  it('carries status, path and the parsed body', async () => {
    const body = { error: 'DeviceNotConnectedException: machine not connected' };
    const { client } = clientWith({ status: 500, body });
    const error = await client.getMachineState().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DecaidApiError);
    expect(error).toMatchObject({ method: 'GET', path: '/api/v1/machine/state', status: 500, body });
    expect((error as Error).message).toContain('machine not connected');
  });

  it('keeps the type of a refused state change', async () => {
    const { client } = clientWith({ status: 400, body: { type: 'block_no_scale', details: 'No scale' } });
    const error = await client.requestMachineState('espresso').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 400, type: 'block_no_scale' });
    expect(isTareBlocked(error)).toBe(false);
  });

  it('keeps a body that is not JSON as text', async () => {
    const { client } = clientWith({ status: 404, body: 'Route not found' });
    const error = await client.getLatestShot().catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 404, body: 'Route not found', type: undefined });
  });

  it('gives a DecaidNetworkError when the gateway does not answer', async () => {
    const client = new DecaidClient({
      fetch: async () => {
        throw new TypeError('fetch failed');
      },
    });
    const error = await client.getMachineState().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DecaidNetworkError);
    expect(error).not.toBeInstanceOf(DecaidApiError);
    expect((error as Error).message).toContain('fetch failed');
  });
});
