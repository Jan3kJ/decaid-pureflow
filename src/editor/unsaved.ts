// Whether the machine holds unsaved edits from the editor (spec section 8, 'Loading from the
// editor'): the one place that decides it. It is read from Decaid alone, the workflow's profile
// against the stored profiles, so it is the same after a page reload, and a profile that another
// app loaded or saved meanwhile is judged as it is now; a marker in the skin would not know.
import { DEFAULT_PROFILES, serializeParams, type AFlowParams } from '../aflow';
import type { DecaidClient, Profile, ProfileRecord } from '../api';
import { readParams } from './storage';

/** The workflow's profile, when it holds values from the editor that no profile has stored. */
export interface Unsaved {
  title: string;
  params: AFlowParams;
}

/**
 * The unsaved edits on the machine, or null. They are there when the workflow's profile is an
 * A-Flow 3.0 profile and no stored profile of the same title has its values: not the default of
 * that title, and no record, visible or hidden, so an older version restored from the history
 * counts as saved. `records` must be listed with `includeHidden`.
 */
export function unsavedOnMachine(profile: Profile | null | undefined, records: readonly ProfileRecord[]): Unsaved | null {
  if (!profile) return null;
  const params = readParams(profile);
  if (!params) return null;
  const values = serializeParams(params);
  const stored = [
    ...DEFAULT_PROFILES.filter((entry) => entry.title === profile.title).map((entry) => entry.params),
    ...records.filter((record) => record.profile.title === profile.title).map((record) => readParams(record.profile)),
  ];
  if (stored.some((candidate) => candidate && serializeParams(candidate) === values)) return null;
  return { title: profile.title, params };
}

/** Reads the workflow and every profile from the gateway and decides with `unsavedOnMachine`. */
export async function readUnsaved(client: DecaidClient): Promise<Unsaved | null> {
  const [workflow, records] = await Promise.all([client.getWorkflow(), client.listProfiles({ includeHidden: true })]);
  return unsavedOnMachine(workflow.profile, records);
}
