// The profile picker's logic: the gateway's list, the A-Flow 3.0 defaults it may still lack,
// and the one call that loads a profile.
import {
  AFLOW_VERSION,
  DEFAULT_AUTHOR,
  DEFAULT_PROFILES,
  generateProfile,
  type DefaultProfile,
} from '../aflow';
import type { DecaidClient, Profile, ProfileRecord, Workflow, WorkflowContextPatch } from '../api';
import { paramsNotes, readParams, sameSteps } from '../editor/storage';

/** `metadata.source` of a profile this skin stored. */
export const SKIN_SOURCE = 'decaid-skin';

/** A default as the v2 profile the generator writes for it, with its parameters (editor/storage.ts). */
export function defaultProfile(entry: DefaultProfile): Profile {
  return generateProfile(entry.params, {
    title: entry.title,
    author: DEFAULT_AUTHOR,
    notes: paramsNotes(entry.params),
  }) as Profile;
}

/** The same title and the same steps. A title alone is not enough: Decaid bundles the plugin's defaults under three of the 3.0 titles. */
export function sameProfile(a: Profile, b: Profile): boolean {
  return a.title === b.title && sameSteps(a.steps, b.steps);
}

/** The A-Flow 3.0 defaults the gateway does not have yet, in their order. */
export function missingDefaults(records: readonly ProfileRecord[]): DefaultProfile[] {
  return DEFAULT_PROFILES.filter((entry) => {
    const profile = defaultProfile(entry);
    return !records.some((record) => sameProfile(record.profile, profile));
  });
}

/** Stores the given defaults with `POST /api/v1/profiles` and returns their records. */
export async function saveDefaults(
  client: DecaidClient,
  entries: readonly DefaultProfile[],
): Promise<ProfileRecord[]> {
  const records: ProfileRecord[] = [];
  for (const entry of entries) {
    records.push(
      await client.saveProfile(defaultProfile(entry), {
        metadata: { source: SKIN_SOURCE, aflow: AFLOW_VERSION },
      }),
    );
  }
  return records;
}

/** Whether this skin stored the profile as A-Flow 3.0. */
export function isAFlow3(record: ProfileRecord): boolean {
  return record.metadata?.source === SKIN_SOURCE && record.metadata?.aflow === AFLOW_VERSION;
}

/** The list as the picker shows it: the skin's A-Flow 3.0 profiles, then the other A-Flow ones, then the rest by title. */
export function sortProfiles(records: readonly ProfileRecord[]): ProfileRecord[] {
  const rank = (record: ProfileRecord) =>
    isAFlow3(record) ? 0 : record.profile.title.startsWith('A-Flow') ? 1 : 2;
  const order = (record: ProfileRecord) => {
    const index = DEFAULT_PROFILES.findIndex((entry) => entry.title === record.profile.title);
    return index < 0 ? DEFAULT_PROFILES.length : index;
  };
  return [...records].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 ? order(a) - order(b) : 0) ||
      a.profile.title.localeCompare(b.profile.title),
  );
}

/** The dose a profile brings, in g: an A-Flow 3.0 profile has one in its parameters. */
export function doseOf(profile: Profile): number | undefined {
  return readParams(profile)?.dose;
}

/**
 * Loads a profile: the one place that decides how (spec section 8).
 *
 * `PUT /api/v1/workflow` sets the workflow's profile and sends it to the machine. A shot
 * record copies the workflow's profile, so the history (spec 3.5) names the profile that was
 * pulled; `POST /api/v1/machine/profile` would leave the workflow as it was (research 9.3).
 * Decaid stops a shot at the workflow's `targetYield`, not at the profile's `target_weight`,
 * and loading a profile does not change it (research.md, section 10): so the profile's stop
 * weight is written as the target yield here, and its dose where it has one. The picker, the
 * editor's 'load to machine' and the shot history all load with this function; the history
 * sends an entry's bean and grinder along as `more`, in the same call.
 */
export function loadProfile(
  client: DecaidClient,
  profile: Profile,
  more: WorkflowContextPatch = {},
): Promise<Workflow> {
  const context: WorkflowContextPatch = { ...more };
  if (profile.target_weight) context.targetYield = profile.target_weight;
  const dose = doseOf(profile);
  if (dose !== undefined) context.targetDoseWeight = dose;
  return client.updateWorkflow({ profile, context });
}
