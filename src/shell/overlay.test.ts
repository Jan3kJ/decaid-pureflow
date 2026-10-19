import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MachineSnapshot } from '../api';
// Both streams of a simulated shot recorded on the rig (Decaid 0.8.8, A-Flow / default-medium).
import recording from '../../e2e/fixtures/shot.json';
import { Skin } from './skin.svelte';

// When the shot's overlay opens and closes (spec 3.8, T2): `Skin.shotOpen` after the machine
// frames of a recorded shot, and `closeShot`, the tap anywhere.

const frames = (recording as { machine?: MachineSnapshot }[]).flatMap((event) => (event.machine ? [event.machine] : []));
const firstEspresso = frames.findIndex((frame) => frame.state.state === 'espresso');
const lastEspresso = frames.map((frame) => frame.state.state).lastIndexOf('espresso');

function memoryStorage(): Storage {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: (key) => items.get(key) ?? null,
    key: (index) => [...items.keys()][index] ?? null,
    removeItem: (key) => void items.delete(key),
    setItem: (key, value) => void items.set(key, value),
  };
}

/** The skin's handler of the machine stream, as the stream calls it. */
const feed = (skin: Skin, list: MachineSnapshot[]) => {
  const onFrame = (skin as unknown as { onMachineFrame(frame: MachineSnapshot): void }).onMachineFrame.bind(skin);
  for (const frame of list) onFrame(frame);
};

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('fetch', async () => new Response('{}', { status: 200 }));
});

afterEach(() => vi.unstubAllGlobals());

describe('the shot overlay', () => {
  it('is closed before a shot', () => {
    const skin = new Skin('http://rig:8080');
    feed(skin, frames.slice(0, firstEspresso));
    expect(skin.shotOpen).toBe(false);
  });

  it('opens with the shot on home, from another screen, and closes the history', () => {
    const skin = new Skin('http://rig:8080');
    skin.go('profiles');
    feed(skin, frames.slice(0, firstEspresso));
    skin.historyOpen = true;
    feed(skin, frames.slice(firstEspresso, firstEspresso + 1));
    expect(skin.shotOpen).toBe(true);
    expect(skin.screen).toBe('home');
    expect(skin.historyOpen).toBe(false);
  });

  it('cannot be closed while the shot runs', () => {
    const skin = new Skin('http://rig:8080');
    feed(skin, frames.slice(0, firstEspresso + 80));
    skin.closeShot();
    expect(skin.shotOpen).toBe(true);
  });

  it('stays after the shot until the tap, and home then has the shot as its last shot', () => {
    const skin = new Skin('http://rig:8080');
    feed(skin, frames);
    expect(frames.length).toBeGreaterThan(lastEspresso + 1);
    expect(skin.shot?.ended).toBe(true);
    expect(skin.shotOpen).toBe(true);
    skin.closeShot();
    expect(skin.shotOpen).toBe(false);
    expect(skin.shot?.ended).toBe(true);
    expect(skin.screen).toBe('home');
  });

  it('is replaced by the next shot, closed or not', () => {
    const skin = new Skin('http://rig:8080');
    feed(skin, frames);
    const first = skin.shot;
    feed(skin, frames);
    expect(skin.shotOpen).toBe(true);
    expect(skin.shot).not.toBe(first);
    skin.closeShot();
    feed(skin, frames.slice(0, firstEspresso + 1));
    expect(skin.shotOpen).toBe(true);
    expect(skin.shot?.ended).toBe(false);
  });
});
