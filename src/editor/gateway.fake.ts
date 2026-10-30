// A stubbed fetch for the tests of storage.ts and save.ts: it keeps profiles the way Decaid
// 0.8.8 does on the rig. A record's id comes from its steps and its
// target weight alone, so a POST with steps that exist answers with the existing record.
import { DecaidClient, type Profile, type ProfileRecord, type ProfileVisibility } from '../api';
import { sameSteps } from './storage';

/** A request's body, with the fields the profile requests send; a GET has none. */
export interface Body {
  profile: Profile;
  parentId?: string | null;
  metadata?: Record<string, unknown> | null;
  visibility: ProfileVisibility;
}

export interface Call {
  method: string;
  path: string;
  body: Body;
}

export function fakeGateway(initial: ProfileRecord[] = []) {
  const records: ProfileRecord[] = initial.map((record) => ({ ...record }));
  const calls: Call[] = [];
  let made = 0;

  const sameContent = (a: Profile, b: Profile) => sameSteps(a.steps, b.steps) && (a.target_weight ?? 0) === (b.target_weight ?? 0);
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

  function make(profile: Profile, over: Partial<ProfileRecord> = {}): ProfileRecord {
    made += 1;
    return {
      id: `profile:new${made}`,
      profile,
      metadataHash: '',
      compoundHash: '',
      parentId: null,
      visibility: 'visible',
      isDefault: false,
      createdAt: '',
      updatedAt: '',
      metadata: null,
      ...over,
    };
  }

  function fetch(url: string, init?: RequestInit): Promise<Response> {
    return Promise.resolve(answer(url, init));
  }

  function answer(url: string, init?: RequestInit): Response {
    const { pathname, searchParams } = new URL(url);
    const path = decodeURIComponent(pathname);
    const method = init?.method ?? 'GET';
    const body = (init?.body ? JSON.parse(init.body as string) : undefined) as Body;
    calls.push({ method, path, body });

    if (path === '/api/v1/profiles' && method === 'GET') {
      const hidden = searchParams.get('includeHidden') === 'true';
      return json(records.filter((record) => record.visibility === 'visible' || hidden));
    }
    if (path === '/api/v1/profiles' && method === 'POST') {
      const existing = records.find((record) => sameContent(record.profile, body.profile));
      if (existing) return json(existing, 201);
      const record = make(body.profile, { parentId: body.parentId ?? null, metadata: body.metadata ?? null });
      records.push(record);
      return json(record, 201);
    }
    const [, id, action] = /^\/api\/v1\/profiles\/([^/]+)(\/visibility)?$/.exec(path) ?? [];
    const record = records.find((candidate) => candidate.id === id);
    if (method === 'PUT' && id) {
      if (!record) return json({ error: 'Invalid request' }, 400);
      if (action) {
        record.visibility = body.visibility;
      } else {
        if (record.isDefault && body.profile) {
          return json({ error: 'Invalid request', message: 'Cannot modify default profile content' }, 400);
        }
        if (body.profile) record.profile = body.profile;
        if ('metadata' in body) record.metadata = body.metadata;
      }
      return json(record);
    }
    if (path === '/api/v1/workflow' && method === 'PUT') return json(body);
    return json({ error: `the fake has no ${method} ${path}` }, 404);
  }

  return {
    client: new DecaidClient({ fetch }),
    calls,
    records,
    make,
    /** the calls as `METHOD path` */
    sent: () => calls.map((call) => `${call.method} ${call.path}`),
  };
}
