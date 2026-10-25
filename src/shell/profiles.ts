// The profile picker's logic: the gateway's list with the A-Flow 3.0 defaults the skin keeps
// itself, and the one call that loads a profile.
import { AFLOW_VERSION, DEFAULT_AUTHOR, DEFAULT_NOTES, DEFAULT_PROFILES, generateProfile, type DefaultProfile } from '../aflow';
import { describeAFlow } from '../aflow/describe';
import type { DecaidClient, Profile, ProfileRecord, Workflow, WorkflowContextPatch } from '../api';
import { POUR_SHOWN_SECONDS } from '../editor/curve';
import { notesText, openParams, paramsMetadata, readParams, sameSteps, workflowProfile } from '../editor/storage';
import { FORMER_NAME } from '../former-name';

/** `metadata.source` of a profile this skin stores. */
export const SKIN_SOURCE = 'pureflow';

/** `metadata.source` of the profiles this skin stored: the profiles of its former name count as its own (founder, 2026-10-18). */
export const SKIN_SOURCES: readonly string[] = [SKIN_SOURCE, FORMER_NAME];

/** A default as the v2 profile the generator writes for it; its parameters go with it as metadata (`pickerEntries`). */
export function defaultProfile(entry: DefaultProfile): Profile {
  return generateProfile(entry.params, { title: entry.title, author: DEFAULT_AUTHOR });
}

/** The same title and the same steps. A title alone is not enough: Decaid bundles the plugin's defaults under three of the 3.0 titles. */
export function sameProfile(a: Profile, b: Profile): boolean {
  return a.title === b.title && sameSteps(a.steps, b.steps);
}

/**
 * A line of the picker: one of the skin's defaults or a profile Decaid stores. A default has no
 * record; its parameters stand in `metadata` as a record's would, so it loads and shows its dose
 * as a stored A-Flow 3.0 profile does.
 */
export interface PickerEntry {
  /** the default's id (`default-light`) or the record's */
  id: string;
  profile: Profile;
  metadata: Record<string, unknown> | null;
  /** one of the skin's defaults (spec 3.8, T5) */
  isDefault: boolean;
}

/** The title of one of the skin's defaults. */
export function isDefaultTitle(title: string): boolean {
  return DEFAULT_PROFILES.some((entry) => entry.title === title);
}

/**
 * The picker's list (spec 3.8, T5): the skin's five defaults first, in their order, then the
 * stored profiles as `sortProfiles` orders them. The defaults live in the skin, not in Decaid:
 * a stored profile under a default's title (a copy the picker's former 'add' stored, or the
 * plugin's default Decaid bundles under three of the titles) stays in Decaid and is not listed,
 * since the skin's default of that title stands for it. A stored profile with a default's steps
 * under another title is listed under its own title.
 */
export function pickerEntries(records: readonly ProfileRecord[]): PickerEntry[] {
  const defaults = DEFAULT_PROFILES.map((entry) => ({
    id: entry.id,
    profile: defaultProfile(entry),
    metadata: paramsMetadata(entry.params),
    isDefault: true,
  }));
  const stored = sortProfiles(records.filter((record) => !isDefaultTitle(record.profile.title))).map((record) => ({
    id: record.id,
    profile: record.profile,
    metadata: record.metadata ?? null,
    isDefault: false,
  }));
  return [...defaults, ...stored];
}

/**
 * s, how far the picker's preview draws a profile's last step (`stepCurve`): an A-Flow
 * profile's pour (one whose values `openParams` reads) as far as the A-Flow editor draws it,
 * so both lines end alike; any other profile whole.
 */
export function previewLastStepSeconds(entry: Pick<PickerEntry, 'profile' | 'metadata'>): number | undefined {
  return openParams(entry.profile, entry.metadata) ? POUR_SHOWN_SECONDS : undefined;
}

/** Whether this skin stored the profile as A-Flow 3.0. */
export function isAFlow3(record: Pick<ProfileRecord, 'metadata'>): boolean {
  return SKIN_SOURCES.includes(record.metadata?.source as string) && record.metadata?.aflow === AFLOW_VERSION;
}

/** The stored profiles as the picker lists them after the defaults: the skin's A-Flow 3.0 profiles, then the other A-Flow ones, then the rest, each by title. */
export function sortProfiles(records: readonly ProfileRecord[]): ProfileRecord[] {
  const rank = (record: ProfileRecord) => (isAFlow3(record) ? 0 : record.profile.title.startsWith('A-Flow') ? 1 : 2);
  return [...records].sort((a, b) => rank(a) - rank(b) || a.profile.title.localeCompare(b.profile.title));
}

/** The profiles whose title holds the filter, in any case (founder, 2026-10-17); an empty filter keeps them all. */
export function filterProfiles<T extends { profile: Pick<Profile, 'title'> }>(records: readonly T[], filter: string): T[] {
  const needle = filter.trim().toLocaleLowerCase();
  return records.filter((record) => record.profile.title.toLocaleLowerCase().includes(needle));
}

/** The old plugin's stock sentence, whatever its spaces and a full stop: it says nothing of the profile. */
function isStockNotes(text: string): boolean {
  const plain = (value: string) => value.replace(/\s+/g, ' ').replace(/\.$/, '').trim().toLowerCase();
  return plain(text) === plain(DEFAULT_NOTES);
}

/**
 * What the picker shows of a profile (spec 3.16 item 3): its notes without the A-Flow line the
 * skin writes there, and for a profile whose A-Flow values are known (`openParams`) the text
 * made from them after a blank line; the plugin's stock sentence counts as no notes. The text
 * is made here, when it is shown, and never written to the profile. '' for none.
 */
export function profileDescription(entry: {
  profile: Pick<Profile, 'notes' | 'steps' | 'target_weight'>;
  metadata?: Record<string, unknown> | null;
}): string {
  const text = notesText(entry.profile.notes).trim();
  const opened = openParams(entry.profile, entry.metadata);
  if (!opened) return text;
  // Read from an older profile's steps, the dose is the editor's default, not the profile's.
  const generated = describeAFlow(opened.params, { dose: opened.dropped === null });
  return text === '' || isStockNotes(text) ? generated : `${text}\n\n${generated}`;
}

/** The dose a profile brings, in g: an A-Flow 3.0 profile has one in its parameters. */
export function doseOf(profile: Profile, metadata?: Record<string, unknown> | null): number | undefined {
  return readParams(profile, metadata)?.dose;
}

/**
 * The dose to write to the workflow, or null for none (founder, 2026-10-15): a workflow that
 * holds a dose keeps it, whether a profile brought it (`loadProfile`) or the user set it in
 * Decaid; one without takes the default of the settings. A shot record copies the workflow,
 * so the next shot has a dose either way.
 */
export function doseToSet(workflow: Workflow, defaultDose: number): number | null {
  const dose = workflow.context?.targetDoseWeight;
  return typeof dose === 'number' && dose > 0 ? null : defaultDose;
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
 *
 * The workflow holds a profile without its record, so an A-Flow 3.0 profile's parameters,
 * read from `metadata` or the notes, go with it in its notes (`workflowProfile`); the stored
 * record keeps them in its metadata alone.
 */
export function loadProfile(
  client: DecaidClient,
  profile: Profile,
  more: WorkflowContextPatch = {},
  metadata?: Record<string, unknown> | null,
): Promise<Workflow> {
  const context: WorkflowContextPatch = { ...more };
  if (profile.target_weight) context.targetYield = profile.target_weight;
  const params = readParams(profile, metadata);
  if (params) context.targetDoseWeight = params.dose;
  return client.updateWorkflow({ profile: params ? workflowProfile(profile, params) : profile, context });
}

/**
 * Loads a picker entry (`loadProfile`): a stored profile with its metadata, a default as the
 * generator writes it, with no record (spec 3.8, T5).
 */
export function loadEntry(client: DecaidClient, entry: PickerEntry): Promise<Workflow> {
  return loadProfile(client, entry.profile, {}, entry.metadata);
}

/** Loads a stored profile (`loadProfile`), its parameters read from its metadata. */
export function loadRecord(client: DecaidClient, record: ProfileRecord, more: WorkflowContextPatch = {}): Promise<Workflow> {
  return loadProfile(client, record.profile, more, record.metadata);
}

/** The text a row shows when it cannot be deleted because its profile is the one on the machine. */
export const LOADED_REFUSAL = 'loaded on the machine: load another first';

/**
 * Whether the picker may delete an entry (spec 3.10): a stored profile, Decaid's bundled ones
 * among them, may; the skin's defaults are no records ('default'); the profile on the machine
 * may not ('loaded'), since the workflow still holds its copy and the editor would take that
 * copy, without its record, for unsaved edits.
 */
export function deleteRefusal(
  entry: Pick<PickerEntry, 'profile' | 'isDefault'>,
  loaded: Profile | undefined,
): 'default' | 'loaded' | null {
  if (entry.isDefault) return 'default';
  return loaded && sameProfile(entry.profile, loaded) ? 'loaded' : null;
}

/**
 * Deletes a stored profile (`DELETE /api/v1/profiles/{id}`) and answers the list as the gateway
 * then has it. Nothing is purged: Decaid keeps the record, marked deleted (a bundled one hidden),
 * with its lineage; saving its steps again makes it visible (`writeProfile`).
 */
export async function deleteEntry(client: DecaidClient, entry: Pick<PickerEntry, 'id' | 'isDefault'>): Promise<ProfileRecord[]> {
  if (entry.isDefault) throw new Error('A default of the skin is not stored, so it cannot be deleted.');
  await client.deleteProfile(entry.id);
  return client.listProfiles();
}
