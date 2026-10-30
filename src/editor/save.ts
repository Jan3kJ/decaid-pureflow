// What the editor's 'save' and 'save as' send, and what leaving it loads: the generator's
// profile for the edited values, stored with its parameters (storage.ts).
import { AFLOW_VERSION, generateProfile, serializeParams, type AFlowParams } from '../aflow';
import type { DecaidClient, Profile, ProfileRecord, Workflow } from '../api';
import { SKIN_SOURCE, loadProfile, loadRecord } from '../shell/profiles';
import { notesText, paramsMetadata, writeParams } from './storage';

/** Every profile the editor saves has this in front of its name, as the defaults have. */
export const TITLE_PREFIX = 'A-Flow / ';

/**
 * `metadata` of a profile the skin stored, beside the parameters `writeParams` adds; the
 * picker's tag 'A-Flow 3.0' reads it.
 */
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
  /** a text of the user's in the notes, kept by 'save' */
  notes?: string;
}

/**
 * The profile for these values: the generator's output, with the user's text as its notes;
 * the parameters go into the record's metadata (`writeParams`).
 * `firstStepWorkaround` is the setting of that name (settings.ts).
 */
export function buildProfile(params: AFlowParams, about: About, firstStepWorkaround: boolean): Profile {
  return generateProfile(params, {
    title: about.title,
    author: about.author ?? '',
    notes: notesText(about.notes),
    firstStepWorkaround,
  });
}

/** 'save as': a new profile under a new name, with `POST /api/v1/profiles` and no parent. */
export function saveAs(client: DecaidClient, params: AFlowParams, about: About, firstStepWorkaround: boolean): Promise<ProfileRecord> {
  return writeParams(client, buildProfile(params, about, firstStepWorkaround), params, {
    metadata: SKIN_METADATA,
  });
}

/**
 * 'save': the edited profile under its name. Decaid's lineage records the edit: the new
 * record names the one it was edited from as its `parentId`, and that one is hidden, so the
 * list shows the profile once and `GET /api/v1/profiles/{id}/lineage` still has every version.
 * An edit that leaves the steps and the stop weight as they were (the dose) has the same id:
 * its metadata is changed and nothing is hidden. A parent of version 1, with the parameters
 * in its notes, is moved: the new version has them in its metadata, and of its notes only the
 * user's text.
 */
export async function saveEdit(
  client: DecaidClient,
  params: AFlowParams,
  parent: ProfileRecord,
  firstStepWorkaround: boolean,
): Promise<ProfileRecord> {
  const about = { title: parent.profile.title, author: parent.profile.author, notes: parent.profile.notes };
  const record = await writeParams(client, buildProfile(params, about, firstStepWorkaround), params, {
    parentId: parent.id,
    metadata: SKIN_METADATA,
  });
  if (record.id !== parent.id) await client.setProfileVisibility(parent.id, 'hidden');
  return record;
}

/**
 * What a save answered: the stored record, and the workflow it was loaded into, or why it was
 * not loaded. A record that was stored stays stored when its load fails.
 */
export type Stored = { record: ProfileRecord; workflow: Workflow } | { record: ProfileRecord; error: unknown };

/**
 * 'save' and 'save as' load what they stored: first the save, then the
 * stored profile with the picker's loading function.
 */
export async function storeAndLoad(client: DecaidClient, store: () => Promise<ProfileRecord>): Promise<Stored> {
  const record = await store();
  try {
    return { record, workflow: await loadRecord(client, record) };
  } catch (error) {
    return { record, error };
  }
}

/** Whether the values on screen differ from those the editor opened with. */
export function changed(params: AFlowParams, openedWith: AFlowParams): boolean {
  return serializeParams(params) !== serializeParams(openedWith);
}

/**
 * Leaving the editor: changed values are loaded, saved or not, under the
 * name of the profile they started from; unchanged ones load nothing and answer null.
 */
export function loadOnLeave(
  client: DecaidClient,
  params: AFlowParams,
  openedWith: AFlowParams,
  about: About,
  firstStepWorkaround: boolean,
): Promise<Workflow | null> {
  if (!changed(params, openedWith)) return Promise.resolve(null);
  return loadProfile(client, buildProfile(params, about, firstStepWorkaround), {}, paramsMetadata(params));
}
