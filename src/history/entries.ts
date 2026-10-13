// The shot history's logic (spec 3.5): the gateway's shot records in, the entries of the
// overlay out, and what one entry writes back to the workflow. Pure, except the two calls
// at the end.
import type {
  DecaidClient,
  Profile,
  ShotRecord,
  ShotRecordSummary,
  Workflow,
  WorkflowContextPatch,
} from '../api';
import { loadProfile } from '../shell/profiles';
import { TARE_SETTLE_S, emptySeries, frameTime, type ShotSeries } from '../shell/shot';

/** A bean as the workflow holds it: two display strings and, from Decaid's catalogue, a batch id. */
export interface Bean {
  name: string | null;
  roaster: string | null;
  batchId: string | null;
}

/** One combination of profile and bean, with the latest shot made with it. */
export interface HistoryEntry {
  /** the same for every shot of the entry */
  key: string;
  /** the profile's title: what identifies a profile here, see `entryKey` */
  profileTitle: string;
  /** null: the shots were pulled without a bean in the workflow */
  bean: Bean | null;
  /** of the latest shot; null when that shot had none */
  grinderSetting: string | null;
  /** the latest shot of the entry: its profile is restored and its graph is shown */
  latest: ShotRecordSummary;
  /** how many shots the entry has */
  shots: number;
}

/** How many shots the history reads at most, newest first: five pages of the gateway's list. */
export const HISTORY_SHOTS = 500;
const PAGE = 100;

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/** The bean of a shot, null when the workflow named none. */
export function beanOf(shot: ShotRecordSummary): Bean | null {
  const context = shot.workflow?.context;
  const bean = {
    name: text(context?.coffeeName),
    roaster: text(context?.coffeeRoaster),
    batchId: text(context?.beanBatchId),
  };
  return bean.name || bean.roaster || bean.batchId ? bean : null;
}

export function grinderSettingOf(shot: ShotRecordSummary): string | null {
  return text(shot.workflow?.context?.grinderSetting);
}

/**
 * What makes two shots one entry: the profile's title and the bean.
 *
 * The profile is its title, not its id. A shot record holds a copy of the profile and no id
 * (research.md 8.4), and the id is a hash of the steps and the target weight (research.md
 * 11.1): every edit of a profile in the editor would start a new entry, although it is the
 * same profile to the user. The title is what the user chose and what the list shows.
 *
 * The bean is its name and roaster. The batch id counts only for a bean without both, so a
 * new bag of the same coffee stays in its entry. The grinder is not part of the key.
 */
export function entryKey(shot: ShotRecordSummary): string | null {
  const title = text(shot.workflow?.profile?.title);
  if (title === null) return null;
  const bean = beanOf(shot);
  const named = bean?.name || bean?.roaster ? [bean.roaster ?? '', bean.name ?? ''] : [];
  return JSON.stringify([title, ...(bean ? (named.length ? named : [bean.batchId]) : [])]);
}

/**
 * The entries of the history, the one with the newest shot first. A shot without a profile
 * has nothing to restore and is left out. The order of `shots` does not matter.
 */
export function groupShots(shots: readonly ShotRecordSummary[]): HistoryEntry[] {
  const newestFirst = [...shots].sort((a, b) => frameTime(b.timestamp) - frameTime(a.timestamp));
  const entries = new Map<string, HistoryEntry>();
  for (const shot of newestFirst) {
    const key = entryKey(shot);
    if (key === null) continue;
    const entry = entries.get(key);
    if (entry) entry.shots += 1;
    else {
      entries.set(key, {
        key,
        profileTitle: shot.workflow!.profile!.title.trim(),
        bean: beanOf(shot),
        grinderSetting: grinderSettingOf(shot),
        latest: shot,
        shots: 1,
      });
    }
  }
  return [...entries.values()];
}

/** How an entry names its bean: 'Roaster · Name'. */
export function beanLabel(bean: Bean | null): string {
  if (!bean) return 'no bean';
  return [bean.roaster, bean.name].filter(Boolean).join(' · ') || 'bean from Decaid';
}

/**
 * The bean and the grinder of a shot as a patch of the workflow's context. What the shot did
 * not have is sent as `null`, which clears it in the workflow (research.md, section 14):
 * the current bean must not stay under a profile it was never pulled with.
 */
export function beanAndGrinder(shot: ShotRecordSummary): WorkflowContextPatch {
  const context = shot.workflow?.context;
  return {
    coffeeName: context?.coffeeName ?? null,
    coffeeRoaster: context?.coffeeRoaster ?? null,
    beanBatchId: context?.beanBatchId ?? null,
    grinderSetting: context?.grinderSetting ?? null,
    grinderModel: context?.grinderModel ?? null,
    grinderId: context?.grinderId ?? null,
  };
}

/** The graph's series of a recorded shot: one point per measurement, as the live graph draws it. */
export function seriesOf(record: Pick<ShotRecord, 'measurements'>): ShotSeries {
  const series = emptySeries();
  const start = record.measurements[0] ? frameTime(record.measurements[0].machine.timestamp) : 0;
  for (const { machine, scale } of record.measurements) {
    const t = Math.max((frameTime(machine.timestamp) - start) / 1000, series.t.at(-1) ?? 0);
    series.t.push(t);
    series.pressure.push(machine.pressure);
    series.flow.push(machine.flow);
    // The first second still holds what stood on the scale before Decaid's tare.
    series.weight.push(t < TARE_SETTLE_S || typeof scale?.weight !== 'number' ? null : scale.weight);
    series.temperature.push(machine.groupTemperature);
  }
  return series;
}

/** The newest shots of the gateway, without measurements, at most `HISTORY_SHOTS`. */
export async function readShots(client: DecaidClient, most = HISTORY_SHOTS): Promise<ShotRecordSummary[]> {
  const shots: ShotRecordSummary[] = [];
  while (shots.length < most) {
    const page = await client.listShots({ limit: Math.min(PAGE, most - shots.length), offset: shots.length, order: 'desc' });
    shots.push(...page.items);
    if (page.items.length === 0 || shots.length >= page.total) break;
  }
  return shots;
}

/**
 * Makes an entry the current one: its profile, bean and grinder setting, in one
 * `PUT /api/v1/workflow`. The profile is loaded as the picker loads one (`loadProfile`), so
 * the stop weight and the dose are the profile's.
 */
export function restoreEntry(client: DecaidClient, entry: HistoryEntry): Promise<Workflow> {
  return loadProfile(client, entry.latest.workflow!.profile as Profile, beanAndGrinder(entry.latest));
}
