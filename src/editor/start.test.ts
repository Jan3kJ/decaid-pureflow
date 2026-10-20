import { describe, expect, it } from 'vitest';
import { DEFAULT_PROFILES, generateProfile } from '../aflow';
import type { Profile, ProfileRecord } from '../api';
import { DEFAULT_START_PROFILES } from '../settings';
import { startChoices, startName, startRow } from './start';
import { workflowNotes } from './storage';

const params = DEFAULT_PROFILES[1].params;
const aflow = (title: string) => generateProfile(params, { title, author: 'me', notes: workflowNotes('', params) }) as Profile;
const record = (id: string, profile: Profile) => ({ id, profile }) as ProfileRecord;
const other = { ...aflow('Best practice'), notes: '' };

describe("the editor's start row", () => {
  it('names a default as the editor does, and a saved profile by its name', () => {
    expect(startName('A-Flow / default-46mm')).toBe('46mm');
    expect(startName('A-Flow / mine')).toBe('mine');
    expect(startName('Best practice')).toBe('Best practice');
  });

  it('offers the five defaults and every stored A-Flow 3.0 profile once, nothing else', () => {
    const records = [
      record('a', aflow('A-Flow / zeta')),
      record('b', other),
      record('c', aflow('A-Flow / alpha')),
      record('d', aflow('A-Flow / default-light')),
      record('e', aflow('A-Flow / alpha')),
    ];
    expect(startChoices(records).map((choice) => choice.name)).toEqual(['floral', 'light', 'medium', 'dark', '46mm', 'alpha', 'zeta']);
    expect(startChoices([]).map((choice) => choice.title)).toEqual(DEFAULT_START_PROFILES);
  });

  it('shows exactly the chosen profiles in their order, without one that is gone', () => {
    const entries = [{ title: 'A-Flow / default-floral' }, { title: 'A-Flow / mine' }, { title: 'A-Flow / default-dark' }];
    expect(startRow(['A-Flow / default-dark', null, 'A-Flow / gone', 'A-Flow / mine', null], entries)).toEqual([
      entries[2],
      entries[1],
    ]);
    expect(startRow([null, null, null, null, null], entries)).toEqual([]);
  });
});
