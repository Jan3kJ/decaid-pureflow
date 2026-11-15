import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecaidApiError, DecaidClient } from '../api';
import { TOKEN_KEY, refusal, tokenDialog, withManageToken } from './manage-token.svelte';

const unauthorized = () => new DecaidApiError('POST', '/x', 401, { error: 'Missing or malformed bearer token' });

function stubStorage(): Map<string, string> {
  const data = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  });
  return data;
}

afterEach(() => vi.unstubAllGlobals());

describe('the extensions:manage token', () => {
  it('goes to Decaid as a bearer on a gated route only', async () => {
    const seen: Record<string, string | undefined> = {};
    const client = new DecaidClient({
      baseUrl: 'http://decaid',
      fetch: (url, init) => {
        seen[String(url)] = (init?.headers as Record<string, string> | undefined)?.Authorization;
        return Promise.resolve(new Response('', { status: 200 }));
      },
    });
    client.manageToken = 'secret';
    await client.installSkinFromUrl('http://pc/a.zip');
    await client.listSkins();
    expect(seen['http://decaid/api/v1/webui/skins/install/url']).toBe('Bearer secret');
    expect(seen['http://decaid/api/v1/webui/skins']).toBeUndefined();
  });

  it('asks only when Decaid answers 401, then keeps the token', async () => {
    const client = { manageToken: null as string | null };
    expect(await withManageToken(client, () => Promise.resolve('open'))).toBe('open');
    expect(tokenDialog.ask).toBeNull();
    const run = withManageToken(client, () =>
      client.manageToken ? Promise.resolve(client.manageToken) : Promise.reject(unauthorized()),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tokenDialog.ask?.refused).toBeNull();
    tokenDialog.ask!.done('abc');
    expect(await run).toBe('abc');
    expect(await withManageToken(client, () => Promise.resolve(client.manageToken))).toBe('abc');
  });

  it('drops a refused token and asks again, saying why', async () => {
    const client = { manageToken: 'old' as string | null };
    let calls = 0;
    const run = withManageToken(client, () => {
      calls += 1;
      return client.manageToken === 'old' ? Promise.reject(unauthorized()) : Promise.resolve(client.manageToken);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tokenDialog.ask?.refused).toBe(refusal(unauthorized()));
    tokenDialog.ask!.done('new');
    expect(await run).toBe('new');
    expect(calls).toBe(2);
  });

  it('throws when the question is cancelled, and passes other failures on', async () => {
    const run = withManageToken({ manageToken: null }, () => Promise.reject(unauthorized()));
    await new Promise((resolve) => setTimeout(resolve, 0));
    tokenDialog.ask!.done(null);
    await expect(run).rejects.toThrow('API token');
    await expect(withManageToken({ manageToken: 'x' }, () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  it('keeps the token for the local install only, and drops it when refused', async () => {
    stubStorage();
    const client = { manageToken: null as string | null };
    const needs = () => (client.manageToken === 'good' ? Promise.resolve('ok') : Promise.reject(unauthorized()));
    const first = withManageToken(client, needs, true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    tokenDialog.ask!.done('good');
    expect(await first).toBe('ok');
    expect(localStorage.getItem(TOKEN_KEY)).toBe('good');
    // a later page starts without a token and reads the kept one: no question
    const later = { manageToken: null as string | null };
    expect(await withManageToken(later, () => Promise.resolve(later.manageToken), true)).toBe('good');
    // without 'remember' nothing is read or written
    const plain = { manageToken: null as string | null };
    expect(await withManageToken(plain, () => Promise.resolve(plain.manageToken))).toBeNull();
    // a refused kept token is forgotten
    localStorage.setItem(TOKEN_KEY, 'bad');
    const refused = withManageToken({ manageToken: null }, () => Promise.reject(unauthorized()), true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    tokenDialog.ask!.done(null);
    await expect(refused).rejects.toThrow();
  });
});
