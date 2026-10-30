// The editor's row of profiles to start from: the profiles chosen in the
// settings (`startProfiles`), found among those the editor can open. One place for both
// screens: the settings page offers what this finds, the editor shows what it keeps.
import { DEFAULT_PROFILES } from '../aflow';
import type { ProfileRecord } from '../api';
import { nameOf } from './save';
import { readRecord } from './storage';

/** A profile the row can hold, by its title. */
export interface StartChoice {
  title: string;
  /** as the editor names it: 'floral' for a default, the saved name otherwise */
  name: string;
}

/** The name the editor gives a profile of this title. */
export function startName(title: string): string {
  const entry = DEFAULT_PROFILES.find((candidate) => candidate.title === title);
  return entry ? entry.id.replace('default-', '') : nameOf(title);
}

/**
 * What a slot can hold: the five A-Flow 3.0 defaults, which the editor always has, then every
 * A-Flow 3.0 profile of the gateway's list (only those are editable), each title once.
 */
export function startChoices(records: readonly ProfileRecord[]): StartChoice[] {
  const titles: string[] = DEFAULT_PROFILES.map((entry) => entry.title);
  const saved = records
    .filter((record) => readRecord(record))
    .map((record) => record.profile.title)
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  for (const title of saved) if (!titles.includes(title)) titles.push(title);
  return titles.map((title) => ({ title, name: startName(title) }));
}

/** The row: the chosen profiles in their order; one that no longer exists is left out. */
export function startRow<T extends { title: string }>(slots: readonly (string | null)[], entries: readonly T[]): T[] {
  return slots.flatMap((title) => entries.find((entry) => entry.title === title) ?? []);
}
