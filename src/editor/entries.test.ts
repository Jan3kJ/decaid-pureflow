import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile, type AFlowParams } from '../aflow';
import type { Profile, ProfileRecord } from '../api';
import { defaultProfile } from '../shell/profiles';
import { LOADED, canSave, editorEntries, takenNames } from './entries';
import { workflowNotes } from './storage';

const light = DEFAULT_PROFILES[1].params;
const mine: AFlowParams = { ...light, stopWeight: 41 };
const aflow = (title: string, params = mine) =>
  generateProfile(params, { title, author: 'me', notes: workflowNotes('', params) }) as Profile;
const record = (id: string, profile: Profile) => ({ id, profile }) as ProfileRecord;

describe("the editor's entries", () => {
  it('lists the five defaults by their short names, then the saved A-Flow profiles', () => {
    const entries = editorEntries([record('a', aflow('A-Flow / morning'))], null);
    expect(entries.map((entry) => entry.name)).toEqual(['floral', 'light', 'medium', 'dark', '46mm', 'morning']);
    expect(entries.slice(0, 5).every((entry) => entry.isDefault && entry.record === null)).toBe(true);
    expect(entries[5]).toMatchObject({
      key: 'a',
      title: 'A-Flow / morning',
      author: 'me',
      params: mine,
      isDefault: false,
      converted: false,
    });
  });

  it("finds a default's record, and a profile under a default's title counts as that default", () => {
    const stored = record('d', defaultProfile(DEFAULT_PROFILES[1]));
    const same = record('e', aflow(DEFAULT_PROFILES[1].title));
    const entries = editorEntries([stored, same], null);
    expect(entries).toHaveLength(5);
    expect(entries[1].record).toBe(stored);
  });

  it('adds the loaded profile only when no entry has its title', () => {
    const loaded = { title: 'A-Flow / loose', author: 'x', params: mine, converted: true };
    const entries = editorEntries([], loaded);
    expect(entries.at(-1)).toMatchObject({ key: LOADED, name: 'loose', record: null, isDefault: false, converted: true });
    expect(editorEntries([record('a', aflow('A-Flow / loose'))], loaded).map((entry) => entry.key)).not.toContain(LOADED);
  });

  it("'save' is always there on a default, on a saved profile once it changed or was converted", () => {
    const saved = { isDefault: false, record: record('a', aflow('A-Flow / a')), converted: false };
    expect(canSave({ isDefault: true, record: null, converted: false }, false)).toBe(true);
    expect(canSave(saved, false)).toBe(false);
    expect(canSave(saved, true)).toBe(true);
    expect(canSave({ ...saved, converted: true }, false)).toBe(true);
    expect(canSave({ isDefault: false, record: null, converted: true }, true)).toBe(false);
  });

  it("'save as' may not take an entry's name or a stored A-Flow profile's", () => {
    const records = [record('a', aflow('A-Flow / old')), record('b', { ...aflow('Best practice'), notes: '' })];
    expect(takenNames([{ name: 'light' }], records)).toEqual(['light', 'old']);
  });
});
