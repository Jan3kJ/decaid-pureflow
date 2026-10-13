// What the editor's 'save', 'save as' and 'load to machine' send: the generator's profile for
// the edited values, stored with its parameters (storage.ts).
import { AFLOW_VERSION, generateProfile, type AFlowParams } from '../aflow';
import type { DecaidClient, Profile, ProfileRecord } from '../api';
import { SKIN_SOURCE } from '../shell/profiles';
import { paramsNotes, writeParams } from './storage';

/** Every profile the editor saves has this in front of its name, as the defaults have. */
export const TITLE_PREFIX = 'A-Flow / ';

/** `metadata` of a profile the skin stored; the picker's tag 'A-Flow 3.0' reads it. */
export const SKIN_METADATA = { source: SKIN_SOURCE, aflow: AFLOW_VERSION };

export function titleOf(name: string): string {
  return TITLE_PREFIX + name;
}

export function nameOf(title: string): string {
  return title.startsWith(TITLE_PREFIX) ? title.slice(TITLE_PREFIX.length) : title;
}

export interface About {
  title: string;
  author?: string;
}

/**
 * The profile for these values: the generator's output, with the parameters in its notes.
 * `firstStepWorkaround` is the setting of that name (settings.ts).
 */
export function buildProfile(params: AFlowParams, about: About, firstStepWorkaround: boolean): Profile {
  return generateProfile(params, {
    title: about.title,
    author: about.author ?? '',
    notes: paramsNotes(params),
    firstStepWorkaround,
  }) as Profile;
}

/** 'save as': a new profile under a new name, with `POST /api/v1/profiles` and no parent. */
export function saveAs(
  client: DecaidClient,
  params: AFlowParams,
  about: About,
  firstStepWorkaround: boolean,
): Promise<ProfileRecord> {
  return writeParams(client, buildProfile(params, about, firstStepWorkaround), params, {
    metadata: SKIN_METADATA,
  });
}

/**
 * 'save': the edited profile under its name. Decaid's lineage records the edit: the new
 * record names the one it was edited from as its `parentId`, and that one is hidden, so the
 * list shows the profile once and `GET /api/v1/profiles/{id}/lineage` still has every version.
 * An edit that leaves the steps and the stop weight as they were (the dose) has the same id:
 * its notes are changed and nothing is hidden.
 */
export async function saveEdit(
  client: DecaidClient,
  params: AFlowParams,
  parent: ProfileRecord,
  firstStepWorkaround: boolean,
): Promise<ProfileRecord> {
  const about = { title: parent.profile.title, author: parent.profile.author };
  const record = await writeParams(client, buildProfile(params, about, firstStepWorkaround), params, {
    parentId: parent.id,
    metadata: SKIN_METADATA,
  });
  if (record.id !== parent.id) await client.setProfileVisibility(parent.id, 'hidden');
  return record;
}
