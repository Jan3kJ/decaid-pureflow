// The import of old A-Flow profiles: the settings' button converts every
// visible profile that is A-Flow by its steps and has no 3.0 parameters, as the editor's 'save'
// converts one it opened: `saveEdit`, so each is stored as 3.0 with the old one as its
// parent, hidden. Decaid's bundled A-Flow profiles are skipped: the skin's defaults stand for
// them.
import { readSteps, type AFlowParams } from '../aflow';
import type { DecaidClient, ProfileRecord } from '../api';
import { errorMessage } from '../error-message';
import { isDefaultTitle } from '../shell/profiles';
import { saveEdit } from './save';
import { hasParams } from './storage';

export interface ImportPlan {
  /** the old A-Flow profiles, with the values read from their steps */
  convert: { record: ProfileRecord; params: AFlowParams }[];
  /** Decaid's bundled A-Flow profiles, and any under the title of one of the skin's defaults */
  skipped: ProfileRecord[];
  /** A-Flow steps that cannot be read as 3.0 */
  unread: ProfileRecord[];
}

/** Whether a profile is one of Decaid's bundled ones, or counts as one of the skin's defaults by its title. */
function isBundled(record: ProfileRecord): boolean {
  return record.isDefault || isDefaultTitle(record.profile.title);
}

/** What the import does with these records: the visible old A-Flow profiles, sorted into the three lists. */
export function planImport(records: readonly ProfileRecord[]): ImportPlan {
  const plan: ImportPlan = { convert: [], skipped: [], unread: [] };
  for (const record of records) {
    if (record.visibility !== 'visible' || hasParams(record.profile, record.metadata)) continue;
    const read = readSteps(record.profile);
    if (!read.ok && !read.aflow) continue;
    if (isBundled(record)) plan.skipped.push(record);
    else if (read.ok) plan.convert.push({ record, params: read.params });
    else plan.unread.push(record);
  }
  return plan;
}

export interface ImportResult {
  converted: ProfileRecord[];
  /** a conversion Decaid refused, with why */
  failed: { title: string; reason: string }[];
}

/**
 * Converts the plan's profiles one after another; one that fails does not stop the rest.
 * `firstStepWorkaround` is the setting of that name (settings.ts), as for the editor's save.
 */
export async function runImport(client: DecaidClient, plan: ImportPlan, firstStepWorkaround: boolean): Promise<ImportResult> {
  const result: ImportResult = { converted: [], failed: [] };
  for (const { record, params } of plan.convert) {
    try {
      result.converted.push(await saveEdit(client, params, record, firstStepWorkaround));
    } catch (cause) {
      result.failed.push({ title: record.profile.title, reason: errorMessage(cause) });
    }
  }
  return result;
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** The unreadable profiles with why, so that a title alone does not leave the user guessing. */
const withReasons = (records: readonly ProfileRecord[]) =>
  records
    .map((record) => {
      const read = readSteps(record.profile);
      return `“${record.profile.title}”${read.ok ? '' : ` (${read.reason})`}`;
    })
    .join('; ');

/** What the import would leave alone: the skipped and the unreadable profiles. */
function leftAlone(plan: ImportPlan): string[] {
  return [
    ...(plan.skipped.length
      ? [`Skipped: ${count(plan.skipped.length, 'profile', 'profiles')} bundled with Decaid, for which the skin's defaults stand.`]
      : []),
    ...(plan.unread.length ? [`Cannot be read: ${withReasons(plan.unread)}.`] : []),
  ];
}

/** The question before the import, or, when there is nothing to convert, what was found. */
export function importQuestion(plan: ImportPlan): string {
  const found = plan.convert.length
    ? `${count(plan.convert.length, 'old A-Flow profile is', 'old A-Flow profiles are')} stored as A-Flow 3.0; each old version stays in Decaid, hidden.`
    : 'There is no old A-Flow profile to convert.';
  return [found, ...leftAlone(plan)].join(' ');
}

/** The counts after the import. */
export function importReport(plan: ImportPlan, result: ImportResult): string {
  return [
    `Converted ${result.converted.length}, skipped ${plan.skipped.length}, could not read ${plan.unread.length}` +
      `${result.failed.length ? `, refused by Decaid ${result.failed.length}` : ''}.`,
    ...(plan.unread.length ? [`Not read: ${withReasons(plan.unread)}.`] : []),
    ...result.failed.map((failure) => `“${failure.title}” was not converted: ${failure.reason}`),
  ].join(' ');
}
