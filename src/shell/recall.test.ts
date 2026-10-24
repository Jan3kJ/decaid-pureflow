import { describe, expect, it } from 'vitest';
import type { DecaidClient, Workflow } from '../api';
import type { HistoryEntry } from '../history/entries';
import type { ShotCache } from '../history/shots.svelte';
import type { LoadAnswer } from './load-warning.svelte';
import { Recall, type RecallHost, type Recalled } from './recall.svelte';
import type { Shot } from './shot';

// The history part of the skin: the last shot's length per profile sets where the next shot's
// time axis starts, and the restore of an entry asks the warning before a load first.

/** A client whose every call fails, as a gateway that is away. */
const away = new Proxy({}, { get: () => () => Promise.reject(new Error('away')) }) as DecaidClient;

const workflowWith = (title: string) => ({ profile: { title, steps: [], notes: '' } }) as unknown as Workflow;

const entry = {
  key: 'a',
  profileTitle: 'A',
  latest: { id: 'shot-1', workflow: workflowWith('A') },
} as unknown as HistoryEntry;

/** A shot that ended after `seconds`. */
const shotOf = (seconds: number) => ({ series: { t: [0, seconds] }, ended: true }) as unknown as Shot;

function host(answer: LoadAnswer = 'load') {
  const calls: string[] = [];
  const skin: { -readonly [K in keyof RecallHost]: RecallHost[K] } = {
    client: away,
    shots: {
      shotEnded: () => {
        calls.push('shotEnded');
        return Promise.resolve();
      },
    } as unknown as ShotCache,
    shot: null,
    workflow: workflowWith('A'),
    notice: null,
    info: 'an old info',
    mayLoad: () => {
      calls.push('mayLoad');
      return Promise.resolve(answer);
    },
    openSaveAs: () => calls.push('openSaveAs'),
  };
  return { skin, calls };
}

describe('the recall', () => {
  it("starts the next shot's axis at the length of the last shot with the profile", () => {
    const { skin, calls } = host();
    const recall = new Recall(skin);
    expect(recall.expectedSeconds).toBe(30);
    recall.shotEnded(shotOf(42));
    expect(recall.expectedSeconds).toBe(50);
    expect(calls).toEqual(['shotEnded']);
    // Another profile does not take that length.
    skin.workflow = workflowWith('B');
    expect(new Recall(skin).expectedSeconds).toBe(30);
  });

  it('closes the history and loads nothing when the warning is cancelled', async () => {
    const { skin, calls } = host('cancel');
    const recall = new Recall(skin);
    recall.historyOpen = true;
    await recall.restore(entry);
    expect(recall.historyOpen).toBe(false);
    expect(skin.info).toBeNull();
    expect(skin.notice).toBeNull();
    expect(recall.recalled).toBeNull();
    expect(calls).toEqual(['mayLoad']);
  });

  it("opens the editor's save as on the warning's 'Save as…'", async () => {
    const { skin, calls } = host('save-as');
    await new Recall(skin).restore(entry);
    expect(calls).toEqual(['mayLoad', 'openSaveAs']);
    expect(skin.notice).toBeNull();
  });

  it('says in the notice why the entry was not restored', async () => {
    const { skin } = host('load');
    const recall = new Recall(skin);
    await recall.restore(entry);
    expect(skin.notice).toBe('The entry was not restored: away');
    expect(recall.recalled).toBeNull();
  });

  describe("home's newest shot", () => {
    /** One measurement in which water moves, at `t` s after the first. */
    const measurement = (t: number) => ({
      machine: {
        timestamp: new Date(Date.UTC(2026, 9, 24, 8, 0, t)).toISOString().replace('Z', ''),
        flow: 2,
        pressure: 6,
        state: { state: 'espresso', substate: 'pouring' },
      },
      scale: { weight: t },
    });

    /** Shots whose newest is `id`, its record ending after `seconds`; `newest` answers when `gate` resolves. */
    function gatewayWith(id: string | null, seconds = 30, gate: Promise<void> = Promise.resolve()) {
      const reads: string[] = [];
      const shots = {
        newest: async () => {
          reads.push('newest');
          await gate;
          return id === null ? null : { id, timestamp: '2026-10-24T08:00:00' };
        },
        record: (shot: string) => {
          reads.push(shot);
          return Promise.resolve({ id: shot, measurements: [measurement(0), measurement(seconds)] });
        },
      } as unknown as ShotCache;
      return { shots, reads };
    }

    it('reads the newest shot record when home has no shot of its own', async () => {
      const { skin } = host();
      const gateway = gatewayWith('ee7495ea', 30);
      Object.assign(skin, { shots: gateway.shots });
      const recall = new Recall(skin);
      await recall.showNewest();
      expect(gateway.reads).toEqual(['newest', 'ee7495ea']);
      expect(recall.newest?.t.at(-1)).toBe(30);
    });

    it('reads it again at the next look, since a shot may have been made meanwhile', async () => {
      const { skin } = host();
      const first = gatewayWith('shot-1', 30);
      Object.assign(skin, { shots: first.shots });
      const recall = new Recall(skin);
      await recall.showNewest();
      const second = gatewayWith('shot-2', 40);
      Object.assign(skin, { shots: second.shots });
      await recall.showNewest();
      expect(recall.newest?.t.at(-1)).toBe(40);
    });

    it('never reads one over a kept or a recalled shot', async () => {
      const { skin } = host();
      const gateway = gatewayWith('shot-1');
      Object.assign(skin, { shots: gateway.shots, shot: shotOf(25) });
      const recall = new Recall(skin);
      await recall.showNewest();
      skin.shot = null;
      recall.recalled = { entry, series: { t: [0, 20] } as unknown as Recalled['series'] };
      await recall.showNewest();
      expect(gateway.reads).toEqual([]);
      expect(recall.newest).toBeNull();
    });

    it('drops the answer when a shot started while it was read', async () => {
      const { skin } = host();
      let answer = () => undefined as void;
      const gateway = gatewayWith('shot-1', 30, new Promise<void>((resolve) => (answer = resolve)));
      Object.assign(skin, { shots: gateway.shots });
      const recall = new Recall(skin);
      const reading = recall.showNewest();
      skin.shot = { ...shotOf(3), ended: false };
      answer();
      await reading;
      expect(recall.newest).toBeNull();
    });

    it('leaves what is shown without a shot at all or without the gateway', async () => {
      const { skin } = host();
      const recall = new Recall(skin);
      await recall.showNewest();
      expect(recall.newest).toBeNull();
      const none = gatewayWith(null);
      Object.assign(skin, { shots: none.shots });
      await recall.showNewest();
      expect(recall.newest).toBeNull();
    });
  });
});
