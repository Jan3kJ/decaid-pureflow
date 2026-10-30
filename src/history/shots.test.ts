import { afterEach, describe, expect, it, vi } from 'vitest';
import { DecaidClient, type ShotRecordSummary } from '../api';
import { merge } from './shot-list';
import { FIRST_SHOTS, ShotCache } from './shots.svelte';

// The shots the skin holds for the session: the newest 20 first, the rest
// after them, what is new on a later read, and a record with measurements read once.

/** Shot n is n minutes after the first; ids are `shot-n`. */
function shot(n: number, title = 'p'): ShotRecordSummary {
  const at = new Date(Date.UTC(2026, 9, 1, 8, 0, 0) + n * 60_000).toISOString().replace('Z', '');
  return { id: `shot-${n}`, timestamp: at, workflow: { profile: { title, steps: [], target_weight: 36 } as never } };
}

/** A gateway holding `stored` (oldest first, as they were made): the list, the latest and one record. */
function gateway(stored: ShotRecordSummary[]) {
  const paths: string[] = [];
  let held: ((value: void) => void) | null = null;
  const gates: Promise<void>[] = [];
  const fetch = vi.fn(async (address: string) => {
    const url = new URL(address);
    paths.push(url.pathname + url.search);
    const newestFirst = [...stored].reverse();
    const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
    if (url.pathname === '/api/v1/shots') {
      const limit = Number(url.searchParams.get('limit'));
      const offset = Number(url.searchParams.get('offset'));
      if (offset > 0 && gates.length) await gates.shift();
      return respond({ items: newestFirst.slice(offset, offset + limit), total: stored.length, limit, offset });
    }
    if (url.pathname === '/api/v1/shots/latest') {
      return newestFirst[0] ? respond(newestFirst[0]) : respond({ error: 'Shot not found' }, 404);
    }
    const id = decodeURIComponent(url.pathname.split('/').pop()!);
    const found = stored.find((candidate) => candidate.id === id);
    return found ? respond({ ...found, measurements: [] }) : respond({ error: 'Shot not found' }, 404);
  });
  return {
    client: new DecaidClient({ fetch }),
    paths,
    /** The next page after the first waits until `release` is called. */
    hold() {
      gates.push(new Promise((resolve) => (held = resolve)));
    },
    release: () => held?.(),
  };
}

const many = (count: number) => Array.from({ length: count }, (_, i) => shot(i));

afterEach(() => vi.useRealTimers());

describe('ShotCache.sync', () => {
  it('reads the newest 20 first and holds them before the rest arrive', async () => {
    const rig = gateway(many(230));
    rig.hold();
    const cache = new ShotCache(rig.client);
    const done = cache.sync();
    await vi.waitFor(() => expect(cache.read).toBe('first'));
    expect(cache.shots.map((s) => s.id)).toEqual(
      many(230)
        .reverse()
        .slice(0, FIRST_SHOTS)
        .map((s) => s.id),
    );
    rig.release();
    await done;
    expect(cache.read).toBe('all');
    expect(cache.shots).toHaveLength(230);
    expect(cache.shots[0].id).toBe('shot-229');
    expect(cache.shots.at(-1)!.id).toBe('shot-0');
    expect(rig.paths).toEqual([
      '/api/v1/shots?limit=20&offset=0&order=desc',
      '/api/v1/shots?limit=100&offset=20&order=desc',
      '/api/v1/shots?limit=100&offset=120&order=desc',
      '/api/v1/shots?limit=100&offset=220&order=desc',
    ]);
  });

  it('stops at the most it may hold, and after one page when there are no more', async () => {
    const big = gateway(many(230));
    const capped = new ShotCache(big.client, 150);
    await capped.sync();
    expect(capped.shots).toHaveLength(150);
    expect(big.paths).toEqual([
      '/api/v1/shots?limit=20&offset=0&order=desc',
      '/api/v1/shots?limit=100&offset=20&order=desc',
      '/api/v1/shots?limit=30&offset=120&order=desc',
    ]);

    const small = gateway(many(7));
    const cache = new ShotCache(small.client);
    await cache.sync();
    expect(cache.shots).toHaveLength(7);
    expect(small.paths).toHaveLength(1);

    const none = gateway([]);
    const empty = new ShotCache(none.client);
    await empty.sync();
    expect(empty.read).toBe('all');
    expect(empty.shots).toEqual([]);
    expect(none.paths).toHaveLength(1);
  });

  it('a second read asks only for the latest shot when nothing is new', async () => {
    const rig = gateway(many(130));
    const cache = new ShotCache(rig.client);
    await cache.sync();
    rig.paths.length = 0;
    await cache.sync();
    expect(rig.paths).toEqual(['/api/v1/shots/latest']);
    expect(cache.shots).toHaveLength(130);
  });

  it('an empty history asks for the newest page again, not for a latest shot it lacks', async () => {
    const stored: ShotRecordSummary[] = [];
    const rig = gateway(stored);
    const cache = new ShotCache(rig.client);
    await cache.sync();
    stored.push(shot(0));
    await cache.sync();
    expect(rig.paths).toEqual(['/api/v1/shots?limit=20&offset=0&order=desc', '/api/v1/shots?limit=20&offset=0&order=desc']);
    expect(cache.shots.map((s) => s.id)).toEqual(['shot-0']);
  });

  it('reads the new shots from the newest until one it holds, and puts them first', async () => {
    const stored = many(130);
    const rig = gateway(stored);
    const cache = new ShotCache(rig.client);
    await cache.sync();
    rig.paths.length = 0;
    stored.push(...Array.from({ length: 25 }, (_, i) => shot(130 + i)));
    await cache.sync();
    expect(rig.paths).toEqual([
      '/api/v1/shots/latest',
      '/api/v1/shots?limit=20&offset=0&order=desc',
      '/api/v1/shots?limit=20&offset=20&order=desc',
    ]);
    expect(cache.shots).toHaveLength(155);
    expect(cache.shots[0].id).toBe('shot-154');
    expect(new Set(cache.shots.map((s) => s.id)).size).toBe(155);
  });

  it('shares one read between callers, and says why the first read failed', async () => {
    const rig = gateway(many(5));
    const cache = new ShotCache(rig.client);
    await Promise.all([cache.sync(), cache.sync()]);
    expect(rig.paths).toHaveLength(1);

    const down = new ShotCache(new DecaidClient({ fetch: () => Promise.resolve(new Response('{}', { status: 500 })) }));
    await expect(down.sync()).rejects.toThrow();
    expect(down.read).toBe('none');
    expect(down.error).toContain('500');
  });
});

describe('ShotCache.shotEnded', () => {
  it('looks for the shot until Decaid has written its record, then holds it', async () => {
    vi.useFakeTimers();
    const stored = many(3);
    const rig = gateway(stored);
    const cache = new ShotCache(rig.client);
    await cache.sync();
    const ended = cache.shotEnded();
    await vi.advanceTimersByTimeAsync(2000);
    expect(cache.shots[0].id).toBe('shot-2');
    stored.push(shot(3));
    await vi.advanceTimersByTimeAsync(2000);
    await ended;
    expect(cache.shots.map((s) => s.id)).toEqual(['shot-3', 'shot-2', 'shot-1', 'shot-0']);
    rig.paths.length = 0;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(rig.paths).toEqual([]);
  });

  it('gives up after half a minute without a record', async () => {
    vi.useFakeTimers();
    const rig = gateway(many(3));
    const cache = new ShotCache(rig.client);
    await cache.sync();
    rig.paths.length = 0;
    const ended = cache.shotEnded();
    await vi.advanceTimersByTimeAsync(31_000);
    await ended;
    expect(rig.paths.length).toBe(15);
    expect(rig.paths.every((path) => path === '/api/v1/shots/latest')).toBe(true);
  });
});

describe('ShotCache.record and latestWithTitle', () => {
  it('reads a record once and keeps it', async () => {
    const rig = gateway(many(3));
    const cache = new ShotCache(rig.client);
    await cache.record('shot-1');
    await cache.record('shot-1');
    expect(rig.paths).toEqual(['/api/v1/shots/shot-1']);
    // A failed read is not kept.
    await expect(cache.record('gone')).rejects.toThrow();
    await expect(cache.record('gone')).rejects.toThrow();
    expect(rig.paths.filter((path) => path.endsWith('/gone'))).toHaveLength(2);
  });

  it('finds the newest shot with a title, among the newest first and in the rest when they lack it', async () => {
    const stored = [shot(0, 'old'), ...Array.from({ length: 40 }, (_, i) => shot(1 + i, i % 2 ? 'a' : 'b'))];
    const rig = gateway(stored);
    rig.hold();
    const cache = new ShotCache(rig.client);
    void cache.sync();
    await vi.waitFor(() => expect(cache.read).toBe('first'));
    expect((await cache.latestWithTitle('a'))!.id).toBe('shot-40');
    const old = cache.latestWithTitle('old');
    rig.release();
    expect((await old)!.id).toBe('shot-0');
    expect(await cache.latestWithTitle('none')).toBeNull();
    // Held whole, a title it lacks asks nothing.
    rig.paths.length = 0;
    expect(await cache.latestWithTitle('none')).toBeNull();
    expect(rig.paths).toEqual([]);
  });
});

describe('merge', () => {
  it('is newest first, each shot once, at most `most`', () => {
    expect(merge([shot(2), shot(1)], [shot(1), shot(3), shot(0)], 3).map((s) => s.id)).toEqual(['shot-3', 'shot-2', 'shot-1']);
  });
});

describe('ShotCache.newest', () => {
  it('is the newest shot once the first page is in, while the older ones still arrive', async () => {
    const rig = gateway(many(230));
    rig.hold();
    const cache = new ShotCache(rig.client);
    expect((await cache.newest())?.id).toBe('shot-229');
    expect(cache.read).toBe('first');
    rig.release();
  });

  it('looks for newer shots after the first read, and is null without any shot or gateway', async () => {
    const stored = many(3);
    const rig = gateway(stored);
    const cache = new ShotCache(rig.client);
    await cache.sync();
    stored.push(shot(3));
    expect((await cache.newest())?.id).toBe('shot-3');
    expect(await new ShotCache(gateway([]).client).newest()).toBeNull();
    const away = new DecaidClient({ fetch: () => Promise.reject(new Error('away')) });
    expect(await new ShotCache(away).newest()).toBeNull();
  });
});
