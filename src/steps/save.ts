// What the step editor's 'save' and 'save as' send, and what leaving it loads (research.md
// 17.7): the profile as edited, through the skin's one writer (`writeProfile`) and its one
// loader (`loadProfile`), as the A-Flow editor saves its values.
import type { DecaidClient, Profile, ProfileRecord, Workflow } from '../api';
import { sameSteps, writeProfile } from '../editor/storage';
import { SKIN_SOURCE, loadProfile } from '../shell/profiles';

/**
 * The keys of `metadata` that hold A-Flow values (`aflow` and `params`, editor/storage.ts): a
 * profile saved from the step editor holds none, so the picker's tag goes.
 */
const AFLOW_KEY = /^(aflow|params$)/i;

/** `metadata` of a profile the step editor stores: its parent's, marked as the skin's, without the A-Flow keys. */
export function stepMetadata(parent: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const metadata: Record<string, unknown> = { ...parent, source: SKIN_SOURCE };
  for (const key of Object.keys(metadata)) if (AFLOW_KEY.test(key)) delete metadata[key];
  return metadata;
}

/** Whether the profile on screen differs from another, in anything at all (nulls and key order aside). */
export function profileChanged(profile: Profile, other: Profile): boolean {
  return !sameSteps(profile, other);
}

/** 'save' is offered for a stored profile that is not one of Decaid's bundled defaults (Decaid refuses to change those). */
export function canSaveOver(record: ProfileRecord | null | undefined): record is ProfileRecord {
  return !!record && !record.isDefault;
}

/**
 * 'save': the edited profile under its title. Decaid's lineage records the edit: the new
 * record names the one it was edited from as its `parentId`, and that one is hidden, so the
 * list shows the profile once and `GET /api/v1/profiles/{id}/lineage` has both. An edit that
 * leaves the hashed content as it was keeps the id: the record is changed and nothing hidden.
 */
export async function saveStepEdit(client: DecaidClient, profile: Profile, parent: ProfileRecord): Promise<ProfileRecord> {
  const record = await writeProfile(
    client,
    { ...profile, title: parent.profile.title },
    { parentId: parent.id, metadata: stepMetadata(parent.metadata) },
  );
  if (record.id !== parent.id) await client.setProfileVisibility(parent.id, 'hidden');
  return record;
}

/**
 * 'save as': the profile under a new title, with the profile it came from as its parent, so
 * the copy of a bundled default is in the lineage too; the source stays visible.
 */
export function saveStepAs(
  client: DecaidClient,
  profile: Profile,
  title: string,
  source: ProfileRecord | null | undefined,
): Promise<ProfileRecord> {
  return writeProfile(
    client,
    { ...profile, title },
    { ...(source ? { parentId: source.id } : {}), metadata: stepMetadata(source?.metadata) },
  );
}

/**
 * Leaving the step editor: a profile that differs from the one it opened with is loaded,
 * saved or not; an unchanged one loads nothing and answers null (founder, 2026-10-13, for the
 * A-Flow editor).
 */
export function loadStepsOnLeave(client: DecaidClient, profile: Profile, openedWith: Profile): Promise<Workflow | null> {
  if (!profileChanged(profile, openedWith)) return Promise.resolve(null);
  return loadProfile(client, profile);
}
