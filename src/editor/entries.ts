// The profiles the A-Flow editor can open, and what its header may do with the open one.
// Pure: the gateway's records and the loaded profile in, the entries out.
import { DEFAULT_AUTHOR, DEFAULT_PROFILES, type AFlowParams } from '../aflow';
import type { ProfileRecord } from '../api';
import { defaultProfile, sameProfile } from '../shell/profiles';
import { TITLE_PREFIX, nameOf } from './save';
import { openRecord } from './storage';

/** A profile the editor can open: a default, a saved A-Flow profile, or the loaded one. */
export interface Entry {
  key: string;
  name: string;
  title: string;
  author: string;
  params: AFlowParams;
  /** the gateway's record of it, where it has one */
  record: ProfileRecord | null;
  isDefault: boolean;
  /** read from an older A-Flow profile's steps: 'save' stores it as 3.0 without an edit too */
  converted: boolean;
}

/** The workflow's profile, when the editor can open it. */
export interface Loaded {
  title: string;
  author: string;
  params: AFlowParams;
  converted: boolean;
}

/** the key of the loaded profile when the gateway has no record under its title */
export const LOADED = 'loaded';

/**
 * The defaults first, then every saved A-Flow profile, then the loaded profile when none of
 * them has its title. A profile under a default's title counts as that default.
 */
export function editorEntries(records: readonly ProfileRecord[], loaded: Loaded | null): Entry[] {
  const defaults: Entry[] = DEFAULT_PROFILES.map((entry) => {
    const profile = defaultProfile(entry);
    return {
      key: entry.id,
      name: entry.id.replace('default-', ''),
      title: entry.title,
      author: DEFAULT_AUTHOR,
      params: entry.params,
      record: records.find((record) => sameProfile(record.profile, profile)) ?? null,
      isDefault: true,
      converted: false,
    };
  });
  const saved: Entry[] = [];
  for (const record of records) {
    const read = openRecord(record);
    if (!read || defaults.some((entry) => entry.title === record.profile.title)) continue;
    saved.push({
      key: record.id,
      name: nameOf(record.profile.title),
      title: record.profile.title,
      author: record.profile.author ?? '',
      params: read.params,
      record,
      isDefault: false,
      converted: read.dropped !== null,
    });
  }
  const all = [...defaults, ...saved];
  if (loaded && !all.some((entry) => entry.title === loaded.title)) {
    all.push({ key: LOADED, name: nameOf(loaded.title), ...loaded, record: null, isDefault: false });
  }
  return all;
}

/**
 * 'save' writes a new version of a saved profile; a default is saved under a new name, so
 * there 'save' only says so.
 */
export function canSave(origin: Pick<Entry, 'isDefault' | 'record' | 'converted'>, dirty: boolean): boolean {
  return origin.isDefault || (!!origin.record && (dirty || origin.converted));
}

/** The names 'save as' may not take: every entry's, and every stored A-Flow profile's. */
export function takenNames(entries: readonly Pick<Entry, 'name'>[], records: readonly ProfileRecord[]): string[] {
  return [
    ...entries.map((entry) => entry.name),
    ...records
      .map((record) => record.profile.title)
      .filter((title) => title.startsWith(TITLE_PREFIX))
      .map(nameOf),
  ];
}
