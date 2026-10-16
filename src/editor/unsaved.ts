// Whether the machine holds unsaved edits from an editor (spec section 8, 'Loading from the
// editor'): the one place that decides it, for both editors (research.md 17.7). It is read
// from Decaid alone, the workflow's profile against the stored profiles, so it is the same
// after a page reload, and a profile that another app loaded or saved meanwhile is judged as
// it is now; a marker in the skin would not know.
import { DEFAULT_PROFILES, serializeParams, type AFlowParams } from '../aflow';
import type { DecaidClient, Profile, ProfileRecord } from '../api';
import { readParams, sameSteps } from './storage';

/** The workflow's profile, when it holds edits that no profile has stored. */
export interface Unsaved {
  title: string;
  /** the A-Flow values; null for a profile of the step editor */
  params: AFlowParams | null;
  profile: Profile;
}

/** What a record's id is made of: its steps and its target weight (research.md 9.2). */
const sameContent = (a: Profile, b: Profile) =>
  sameSteps(a.steps, b.steps) && (a.target_weight ?? 0) === (b.target_weight ?? 0);

/**
 * The unsaved edits on the machine, or null. `records` must be listed with `includeHidden`.
 * - An A-Flow 3.0 profile has them when no stored profile of the same title has its values:
 *   not the default of that title, and no record, visible or hidden, so an older version
 *   restored from the history counts as saved.
 * - Any other profile (the step editor's) has them when no record of its title, hidden ones
 *   too, has its steps and target weight. A profile whose record was deleted after it was
 *   loaded is unsaved too: those steps are in no stored profile.
 */
export function unsavedOnMachine(profile: Profile | null | undefined, records: readonly ProfileRecord[]): Unsaved | null {
  if (!profile) return null;
  const params = readParams(profile);
  const mine = records.filter((record) => record.profile.title === profile.title);
  if (!params) {
    if (mine.some((record) => sameContent(record.profile, profile))) return null;
    return { title: profile.title, params: null, profile };
  }
  const values = serializeParams(params);
  const stored = [
    ...DEFAULT_PROFILES.filter((entry) => entry.title === profile.title).map((entry) => entry.params),
    ...mine.map((record) => readParams(record.profile)),
  ];
  if (stored.some((candidate) => candidate && serializeParams(candidate) === values)) return null;
  return { title: profile.title, params, profile };
}

/** Reads the workflow and every profile from the gateway and decides with `unsavedOnMachine`. */
export async function readUnsaved(client: DecaidClient): Promise<Unsaved | null> {
  const [workflow, records] = await Promise.all([client.getWorkflow(), client.listProfiles({ includeHidden: true })]);
  return unsavedOnMachine(workflow.profile, records);
}
