import { describe, expect, it } from 'vitest';
import type { DecaidClient, Workflow } from '../api';
import type { HistoryEntry } from '../history/entries';
import type { ShotCache } from '../history/shots.svelte';
import type { LoadAnswer } from './load-warning.svelte';
import { Recall, type RecallHost } from './recall.svelte';
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
  const skin: RecallHost = {
    client: away,
    shots: {
      shotEnded: () => {
        calls.push('shotEnded');
        return Promise.resolve();
      },
    } as unknown as ShotCache,
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
});
