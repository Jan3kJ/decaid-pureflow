// The shot history's logic (spec 3.5): the gateway's shot records in, the entries of the
// overlay out, and what one entry writes back to the workflow. Pure, except `restoreEntry`;
// the shots themselves are held by `ShotCache` (shots.svelte.ts). With Decaid's bean and grinder
// catalogue (research.md 29.6) a shot's bean is the catalogue's when its batch or its name and
// roaster are known there, and the history is filtered by a bean and a grinder.
import type {
  BeanBatch,
  CatalogueBean,
  DecaidClient,
  Grinder,
  Profile,
  ShotRecord,
  ShotRecordSummary,
  Workflow,
  WorkflowContext,
  WorkflowContextPatch,
} from '../api';
import { pickedBean } from '../beans/catalogue';
import { loadProfile } from '../shell/profiles';
import { TARE_SETTLE_S, emptySeries, frameTime, pushPoint, shotOver, waterMoves, type ShotSeries } from '../shell/shot';

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
  /** the catalogue's bean of the shots, null for a bean the catalogue does not know */
  beanId: string | null;
  /** of the latest shot; null when that shot had none */
  grinderSetting: string | null;
  /** the latest shot's grinder: the catalogue's model, else the one the shot names; null for none */
  grinder: string | null;
  /** the latest shot of the entry: its profile is restored and its graph is shown */
  latest: ShotRecordSummary;
  /** how many shots the entry has */
  shots: number;
}

const text = (value: string | null | undefined): string | null => value?.trim() || null;

/** What the history reads of Decaid's catalogue, archived ones included: their shots are in the history too. */
export interface CatalogueView {
  beans: readonly CatalogueBean[];
  batches: readonly BeanBatch[];
  grinders: readonly Grinder[];
}

/** No catalogue read (yet): every shot keeps the bean and grinder its record names. */
export const NO_CATALOGUE: CatalogueView = { beans: [], batches: [], grinders: [] };

/**
 * The catalogue's bean of a shot: the bean of its batch, else, for a shot from before the
 * catalogue or from an app that wrote no batch, the bean with its name and roaster; null for none.
 */
export function shotBean(shot: ShotRecordSummary, catalogue: CatalogueView): CatalogueBean | null {
  return pickedBean(catalogue.beans, catalogue.batches, shot.workflow?.context);
}

/** The catalogue's grinder of a shot: by its id, else, for a shot without one, by its model; null for none. */
export function shotGrinder(shot: ShotRecordSummary, catalogue: CatalogueView): Grinder | null {
  const context = shot.workflow?.context;
  const id = text(context?.grinderId);
  if (id) return catalogue.grinders.find((grinder) => grinder.id === id) ?? null;
  const model = text(context?.grinderModel);
  return model ? (catalogue.grinders.find((grinder) => grinder.model.trim() === model) ?? null) : null;
}

/** The history's filter: one bean and one grinder of the catalogue, null for any. */
export interface HistoryFilter {
  beanId: string | null;
  grinderId: string | null;
}

export const NO_FILTER: HistoryFilter = { beanId: null, grinderId: null };

/** The shots the filter keeps, in their order. */
export function filterShots(
  shots: readonly ShotRecordSummary[],
  filter: HistoryFilter,
  catalogue: CatalogueView,
): ShotRecordSummary[] {
  if (!filter.beanId && !filter.grinderId) return [...shots];
  return shots.filter(
    (shot) =>
      (!filter.beanId || shotBean(shot, catalogue)?.id === filter.beanId) &&
      (!filter.grinderId || shotGrinder(shot, catalogue)?.id === filter.grinderId),
  );
}

/** The bean of a shot, null when the workflow named none; a catalogue bean by its current name and roaster. */
export function beanOf(shot: ShotRecordSummary, catalogue: CatalogueView = NO_CATALOGUE): Bean | null {
  const bean = contextBean(shot.workflow?.context);
  const known = bean && shotBean(shot, catalogue);
  return known ? { name: text(known.name), roaster: text(known.roaster), batchId: bean.batchId } : bean;
}

/** The bean a workflow's context names, null for none: the shot's, or the one for the next shot. */
export function contextBean(context: WorkflowContext | null | undefined): Bean | null {
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

/** A shot's grinder model: the catalogue's current one, else the one the record names. */
export function grinderOf(shot: ShotRecordSummary, catalogue: CatalogueView = NO_CATALOGUE): string | null {
  return text(shotGrinder(shot, catalogue)?.model) ?? text(shot.workflow?.context?.grinderModel);
}

/**
 * What makes two shots one entry: the profile's title and the bean.
 *
 * The profile is its title, not its id. A shot record holds a copy of the profile and no id
 * (research.md 8.4), and the id is a hash of the steps and the target weight (research.md
 * 11.1): every edit of a profile in the editor would start a new entry, although it is the
 * same profile to the user. The title is what the user chose and what the list shows.
 *
 * The bean is the catalogue's bean (`shotBean`) where there is one, so its shots stay one entry
 * across a rename and its bags. Else it is its name and roaster; the batch id counts only for a
 * bean without both, so a new bag of the same coffee stays in its entry. The grinder is not
 * part of the key.
 */
export function entryKey(shot: ShotRecordSummary, catalogue: CatalogueView = NO_CATALOGUE): string | null {
  const title = text(shot.workflow?.profile?.title);
  if (title === null) return null;
  const known = shotBean(shot, catalogue);
  if (known) return JSON.stringify([title, null, known.id]);
  const bean = beanOf(shot);
  const named = bean?.name || bean?.roaster ? [bean.roaster ?? '', bean.name ?? ''] : [];
  return JSON.stringify([title, ...(bean ? (named.length ? named : [bean.batchId]) : [])]);
}

/**
 * The entries of the history, the one with the newest shot first. A shot without a profile
 * has nothing to restore and is left out. The order of `shots` does not matter.
 */
export function groupShots(shots: readonly ShotRecordSummary[], catalogue: CatalogueView = NO_CATALOGUE): HistoryEntry[] {
  const newestFirst = [...shots].sort((a, b) => frameTime(b.timestamp) - frameTime(a.timestamp));
  const entries = new Map<string, HistoryEntry>();
  for (const shot of newestFirst) {
    const key = entryKey(shot, catalogue);
    if (key === null) continue;
    const entry = entries.get(key);
    if (entry) entry.shots += 1;
    else {
      entries.set(key, {
        key,
        profileTitle: shot.workflow!.profile!.title.trim(),
        bean: beanOf(shot, catalogue),
        beanId: shotBean(shot, catalogue)?.id ?? null,
        grinderSetting: grinderSettingOf(shot),
        grinder: grinderOf(shot, catalogue),
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
 * A bean in two lines, as home's bean button shows it (spec 3.18 item 5): its name, and its roaster
 * as the caption. A bean without a name is `beanLabel` alone, without a caption (null).
 */
export function beanLines(bean: Bean | null): { name: string; caption: string | null } {
  if (!bean?.name) return { name: beanLabel(bean), caption: null };
  return { name: bean.name, caption: bean.roaster };
}

/** How an entry names its grinder: 'Model 4.8', 'grinder 4.8' without a model; empty for neither. */
export function grinderLabel(entry: Pick<HistoryEntry, 'grinder' | 'grinderSetting'>): string {
  if (!entry.grinderSetting) return entry.grinder ?? '';
  return `${entry.grinder ?? 'grinder'} ${entry.grinderSetting}`;
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

/**
 * The graph's series of a recorded shot, as the live graph draws it: one point per
 * measurement from the first one in which water moved. A measurement's `machine` is a
 * snapshot frame with its substate, so the heating before the water is cut as in the live
 * shot (`waterMoves`). A record in which no measurement says that water moved is shown whole.
 * It ends where the live shot ends (`shotOver`, spec 3.8): Decaid's record of the simulated
 * shot already stops before that (research.md 23), and the cut keeps a record with a tail
 * equal to the live graph.
 */
export function seriesOf(record: Pick<ShotRecord, 'measurements'>): ShotSeries {
  const series = emptySeries();
  const all = record.measurements;
  if (all.length === 0) return series;
  const first = all.findIndex(({ machine }) => waterMoves(machine));
  const from = first < 0 ? all : all.slice(first);
  const over = from.findIndex(({ machine }, i) => i > 0 && shotOver(machine));
  const shown = over < 0 ? from : from.slice(0, over);
  const entered = frameTime(all[0].machine.timestamp);
  const start = frameTime(shown[0].machine.timestamp);
  for (const { machine, scale } of shown) {
    const at = frameTime(machine.timestamp);
    const t = Math.max((at - start) / 1000, series.t.at(-1) ?? 0);
    // The first second in espresso still holds what stood on the scale before Decaid's tare.
    const settled = (at - entered) / 1000 >= TARE_SETTLE_S;
    const weight = settled && typeof scale?.weight === 'number' ? scale.weight : null;
    pushPoint(series, t, machine, weight, typeof scale?.weightFlow === 'number' ? scale.weightFlow : null);
  }
  return series;
}

/**
 * Makes an entry the current one: its profile, bean and grinder setting, in one
 * `PUT /api/v1/workflow`. The profile is loaded as the picker loads one (`loadProfile`), so
 * the stop weight and the dose are the profile's.
 */
export function restoreEntry(client: DecaidClient, entry: HistoryEntry): Promise<Workflow> {
  return loadProfile(client, entry.latest.workflow!.profile as Profile, beanAndGrinder(entry.latest));
}
