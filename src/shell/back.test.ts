import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Skin } from './skin.svelte';

// The way back: a swipe to the right leaves a screen outside the row of pages for
// where it was opened from (`Skin.back`).

beforeEach(() => {
  const items = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  });
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('{}', { status: 200 })));
});

afterEach(() => vi.unstubAllGlobals());

describe('the way back', () => {
  it('is home for a screen opened from home, and for one the skin opened with', () => {
    const skin = new Skin('http://rig:8080');
    skin.screen = 'settings';
    expect(skin.back()).toBe('home');
    skin.go('home');
    skin.go('beans');
    expect(skin.back()).toBe('home');
  });

  it("is the editor for the editor's picker, and home again for the editor after its load", () => {
    const skin = new Skin('http://rig:8080');
    skin.go('editor');
    skin.go('profiles');
    expect(skin.back()).toBe('editor');
    skin.go('editor');
    expect(skin.back()).toBe('home');
  });

  it("is home for home's picker", () => {
    const skin = new Skin('http://rig:8080');
    skin.go('editor');
    skin.go('home');
    skin.go('profiles');
    expect(skin.back()).toBe('home');
  });
});
