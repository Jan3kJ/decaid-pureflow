// Where a profile's A-Flow parameters are stored: in the profile's `notes`, as the codec's
// string (spec 3.2). This module is the one place that knows it. `readParams` and
// `writeParams` are all the rest of the skin uses, so the KV store can replace the notes here
// (spec section 8); `readParams` would then need the client and become asynchronous.
import {
  generateSteps,
  parseParams,
  serializeParams,
  validateParams,
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

/** The notes of a profile that carries these parameters. */
export function paramsNotes(params: AFlowParams): string {
  return serializeParams(params);
}

/**
 * The A-Flow 3.0 parameters of a profile, or null when it is not an A-Flow 3.0 profile: its
 * notes are not the codec's string, a value is out of range, or its steps are not what the
 * generator writes for these parameters (with or without the first-step workaround). The last
 * check keeps a profile whose steps were changed elsewhere from opening with old parameters.
 */
export function readParams(profile: Pick<Profile, 'notes' | 'steps' | 'target_weight'>): AFlowParams | null {
  const parsed = parseParams(profile.notes ?? '');
  if (!parsed.ok) return null;
  const { params } = parsed;
  if (validateParams(params).length > 0) return null;
  if ((profile.target_weight ?? 0) !== params.stopWeight) return null;
  const generated = [false, true].some((workaround) => sameSteps(generateSteps(params, workaround), profile.steps));
  return generated ? params : null;
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
  if (renamed || !sameSteps(record.profile, wanted)) {
    record = await client.updateProfile(record.id, {
      profile: wanted,
      ...(options.metadata ? { metadata: options.metadata } : {}),
    });
  }
  if (record.visibility !== 'visible') record = await client.setProfileVisibility(record.id, 'visible');
  return record;
}

/** Stores a profile with its parameters in its notes (`writeProfile`). */
export function writeParams(
  client: DecaidClient,
  profile: Profile,
  params: AFlowParams,
  options: SaveProfileOptions = {},
): Promise<ProfileRecord> {
  return writeProfile(client, { ...profile, notes: paramsNotes(params) }, options);
}
