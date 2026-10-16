// Where a profile's A-Flow parameters are stored (spec 3.6): in the record's `metadata`, as
// `{ aflow: '3.0', params }` beside its `source`, and none in its `notes`. This module is the
// one place that knows it. Profiles of version 1 hold them in their `notes`, as the codec's
// string; they still read, and their next save moves the values and keeps the rest of the
// notes. The workflow's profile has no record and so no metadata: the copy the skin loads
// carries the values in its notes (`workflowNotes`), so the editor, the unsaved-edits warning
// and the history can read the profile on the machine from Decaid alone.
import {
  decodeParams,
  encodeParams,
  generateSteps,
  parseParams,
  serializeParams,
  validateParams,
  WIDEST_MACHINE_LIMITS,
  type AFlowParams,
} from '../aflow';
import type { DecaidClient, Profile, ProfileRecord, SaveProfileOptions } from '../api';

/** A value with its keys in order and without null or missing fields: the gateway returns `null` where the generator leaves a field out. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const field = (value as Record<string, unknown>)[key];
    if (field !== null && field !== undefined) sorted[key] = canonical(field);
  }
  return sorted;
}

/** The same steps, whatever the order of their keys. */
export function sameSteps(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** The keys of a record's `metadata` that hold these parameters: `aflow` and `params`. */
export function paramsMetadata(params: AFlowParams): { aflow: string; params: Record<string, number | boolean | null> } {
  return encodeParams(params);
}

/**
 * A profile's notes split into the codec's string, on a line of its own, and the rest: the
 * text a user wrote there. Notes of version 1 are the codec's string alone.
 */
export function splitNotes(notes: string | null | undefined): { params: AFlowParams | null; text: string } {
  const lines = (notes ?? '').split('\n');
  for (const [index, line] of lines.entries()) {
    const parsed = parseParams(line.trim());
    if (!parsed.ok) continue;
    return { params: parsed.params, text: lines.filter((_, at) => at !== index).join('\n').trim() };
  }
  return { params: null, text: notes ?? '' };
}

/** The notes without the parameters: what a stored profile keeps. */
export function notesText(notes: string | null | undefined): string {
  return splitNotes(notes).text;
}

/** The notes of the workflow's copy of a profile: the parameters on the first line, then the text. */
export function workflowNotes(notes: string | null | undefined, params: AFlowParams): string {
  return [serializeParams(params), notesText(notes)].filter((part) => part !== '').join('\n');
}

/** The workflow's copy of a profile with these parameters (`loadProfile`): they go in its notes. */
export function workflowProfile<T extends Pick<Profile, 'notes'>>(profile: T, params: AFlowParams): T {
  return { ...profile, notes: workflowNotes(profile.notes, params) };
}

/**
 * The A-Flow 3.0 parameters of a profile, or null when it is not an A-Flow 3.0 profile. They are
 * read from the record's `metadata` first, then from the notes (version 1, and the workflow's
 * copy). Null when neither holds them, a value is out of range (`WIDEST_MACHINE_LIMITS`), or
 * the steps are not what the generator writes for these parameters (with or without the
 * first-step workaround). The last check keeps a profile whose steps were changed elsewhere
 * from opening with old parameters.
 */
export function readParams(
  profile: Pick<Profile, 'notes' | 'steps' | 'target_weight'>,
  metadata?: Record<string, unknown> | null,
): AFlowParams | null {
  const stored = decodeParams(metadata);
  const params = stored.ok ? stored.params : splitNotes(profile.notes).params;
  if (!params) return null;
  // Within the widest maximum flow, not the setting's: lowering it hides no profile.
  if (validateParams(params, WIDEST_MACHINE_LIMITS).length > 0) return null;
  if ((profile.target_weight ?? 0) !== params.stopWeight) return null;
  const generated = [false, true].some((workaround) => sameSteps(generateSteps(params, workaround), profile.steps));
  return generated ? params : null;
}

/** The A-Flow 3.0 parameters of a stored profile (`readParams` with its metadata). */
export function readRecord(record: Pick<ProfileRecord, 'profile' | 'metadata'>): AFlowParams | null {
  return readParams(record.profile, record.metadata);
}

/** Decaid holds these steps already, as a visible profile with another title. */
export class StepsTakenError extends Error {
  readonly record: ProfileRecord;

  constructor(record: ProfileRecord) {
    super(
      `Decaid keeps one profile for each set of steps, and these are “${record.profile.title}”. Change a value of the curve first.`,
    );
    this.name = 'StepsTakenError';
    this.record = record;
  }
}

/**
 * Stores a profile and returns its record: the one writer of both editors (research.md 17.7).
 *
 * A profile's id is a hash of its steps and its target weight (research.md 9.2 and 11). For
 * new steps `POST /api/v1/profiles` makes a record and that is all. For steps that exist it
 * answers with the existing record as it is, and then:
 * - the same title, other content outside the hash (notes, author, …): the profile is
 *   changed with `PUT /api/v1/profiles/{id}`;
 * - a hidden record, an older version of some profile: it is taken over, with the title and
 *   the rest, and made visible;
 * - a visible profile with another title: nothing is changed and a `StepsTakenError` is thrown.
 */
export async function writeProfile(
  client: DecaidClient,
  wanted: Profile,
  options: SaveProfileOptions = {},
): Promise<ProfileRecord> {
  let record = await client.saveProfile(wanted, options);
  const renamed = record.profile.title !== wanted.title;
  if (renamed && record.visibility === 'visible') throw new StepsTakenError(record);
  // The metadata is outside the id: a POST of stored steps answers with the old one (research.md 18.3).
  const metadataDiffers = !!options.metadata && !sameSteps(record.metadata ?? {}, options.metadata);
  if (renamed || !sameSteps(record.profile, wanted) || metadataDiffers) {
    record = await client.updateProfile(record.id, {
      profile: wanted,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    });
  }
  if (record.visibility !== 'visible') record = await client.setProfileVisibility(record.id, 'visible');
  return record;
}

/**
 * Stores a profile with its parameters in its metadata, beside the given `options.metadata`,
 * and none in its notes (`writeProfile`). A `PUT` replaces a record's metadata whole, so the
 * whole object is sent every time.
 */
export function writeParams(
  client: DecaidClient,
  profile: Profile,
  params: AFlowParams,
  options: SaveProfileOptions = {},
): Promise<ProfileRecord> {
  return writeProfile(
    client,
    { ...profile, notes: notesText(profile.notes) },
    { ...options, metadata: { ...options.metadata, ...paramsMetadata(params) } },
  );
}
