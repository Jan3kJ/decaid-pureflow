// Ported in part from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.17,
// src/modules/bean-selection.js (`selectableBeans`, `selectableBatches`, `currentBeanContext`).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The bean and grinder catalogue: Decaid's beans, their
// batches (one bag each) and grinders, the forms that add and edit them, and the pick for the
// next shot as a patch of the workflow's context. Pure, except the writes, which take the client.
import type {
  BatchPatch,
  BeanBatch,
  BeanInput,
  BeanPatch,
  CatalogueBean,
  DecaidClient,
  Grinder,
  GrinderInput,
  GrinderPatch,
  WorkflowContext,
  WorkflowContextPatch,
} from '../api';

/** The beans a pick offers: those not archived. */
export function selectableBeans(beans: readonly CatalogueBean[]): CatalogueBean[] {
  return beans.filter((bean) => bean?.id && bean.archived !== true);
}

/** The batches a pick can name: those not archived. */
export function selectableBatches(batches: readonly BeanBatch[]): BeanBatch[] {
  return batches.filter((batch) => typeof batch?.id === 'string' && batch.id.length > 0 && batch.archived !== true);
}

/** The three context fields of a bean and one of its batches; null when the batch is not the bean's. */
export function currentBeanContext(
  bean: CatalogueBean | null,
  batch: BeanBatch | null,
): Pick<WorkflowContextPatch, 'beanBatchId' | 'coffeeName' | 'coffeeRoaster'> | null {
  if (!bean?.id || !batch?.id || (batch.beanId != null && batch.beanId !== bean.id)) return null;
  return {
    beanBatchId: batch.id,
    coffeeName: bean.name ? bean.name : null,
    coffeeRoaster: bean.roaster ? bean.roaster : null,
  };
}

/** Newest first, by the time Decaid created them. */
export function newestFirst<T extends { createdAt: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** A bean's current bag: its newest batch that is not archived, null for a bean without one. */
export function currentBatch(batches: readonly BeanBatch[], beanId: string): BeanBatch | null {
  return newestFirst(selectableBatches(batches).filter((batch) => batch.beanId === beanId))[0] ?? null;
}

/** What a list row and the search read of a bean: 'Roaster · Name'. */
export function beanTitle(bean: Pick<CatalogueBean, 'roaster' | 'name'>): string {
  return [bean.roaster, bean.name].filter(Boolean).join(' · ');
}

/** The items whose text holds every word of the query, without case; an empty query keeps all. */
export function search<T>(items: readonly T[], query: string, textOf: (item: T) => string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const text = textOf(item).toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

/** The roasters of the catalogue, for the roaster field's suggestions. */
export function roasters(beans: readonly CatalogueBean[]): string[] {
  return [...new Set(beans.map((bean) => bean.roaster.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

// --- the forms ---

/** A bean's form: the bean's name, roaster and notes, and its current bag's roast date. */
export interface BeanForm {
  name: string;
  roaster: string;
  /** `YYYY-MM-DD`, as `<input type="date">` holds it; '' for none */
  roastDate: string;
  notes: string;
}

/** The date of Decaid's `2026-10-01T00:00:00.000`, '' for none. */
export function dateOf(value: string | null | undefined): string {
  return /^\d{4}-\d{2}-\d{2}/.exec(value ?? '')?.[0] ?? '';
}

export function beanForm(bean: CatalogueBean | null, batch: BeanBatch | null): BeanForm {
  return { name: bean?.name ?? '', roaster: bean?.roaster ?? '', roastDate: dateOf(batch?.roastDate), notes: bean?.notes ?? '' };
}

/** Name and roaster are required, as Decaid requires them. */
export function validBean(form: BeanForm): boolean {
  return form.name.trim() !== '' && form.roaster.trim() !== '';
}

const optional = (text: string): string | null => text.trim() || null;

/** The bean's fields the form changed: a `PUT` sends only these, so fields another app wrote stay. */
export function beanPatch(bean: CatalogueBean, form: BeanForm): BeanPatch {
  const patch: BeanPatch = {};
  if (form.name.trim() !== bean.name) patch.name = form.name.trim();
  if (form.roaster.trim() !== bean.roaster) patch.roaster = form.roaster.trim();
  if (optional(form.notes) !== (bean.notes || null)) patch.notes = optional(form.notes);
  return patch;
}

/** The bag's change: its roast date; null when it is the same. */
export function batchPatch(batch: BeanBatch | null, form: BeanForm): BatchPatch | null {
  return form.roastDate === dateOf(batch?.roastDate) ? null : { roastDate: optional(form.roastDate) };
}

/** A grinder's form. */
export interface GrinderForm {
  model: string;
  burrs: string;
  settingType: Grinder['settingType'];
  /** the step of the pick's − and +, for a numeric setting */
  smallStep: number;
  /** the named positions of a preset setting, separated by commas */
  positions: string;
  notes: string;
}

export const DEFAULT_STEP = 1;

export function grinderForm(grinder: Grinder | null): GrinderForm {
  return {
    model: grinder?.model ?? '',
    burrs: grinder?.burrs ?? '',
    settingType: grinder?.settingType ?? 'numeric',
    smallStep: grinder?.settingSmallStep || DEFAULT_STEP,
    positions: (grinder?.settingValues ?? []).join(', '),
    notes: grinder?.notes ?? '',
  };
}

/** The positions of the form's text, in their order, without empty ones. */
export function positionsOf(text: string): string[] {
  return text
    .split(',')
    .map((position) => position.trim())
    .filter(Boolean);
}

/** The model is required; a preset setting needs a position. */
export function validGrinder(form: GrinderForm): boolean {
  return form.model.trim() !== '' && (form.settingType === 'numeric' || positionsOf(form.positions).length > 0);
}

function grinderFields(form: GrinderForm): Required<Pick<GrinderPatch, 'model' | 'burrs' | 'settingType' | 'notes'>> & GrinderPatch {
  return {
    model: form.model.trim(),
    burrs: optional(form.burrs),
    settingType: form.settingType,
    ...(form.settingType === 'numeric' ? { settingSmallStep: form.smallStep } : { settingValues: positionsOf(form.positions) }),
    notes: optional(form.notes),
  };
}

export function grinderInput(form: GrinderForm): GrinderInput {
  return Object.fromEntries(Object.entries(grinderFields(form)).filter(([, value]) => value !== null)) as GrinderInput;
}

/** The grinder's fields the form changed. */
export function grinderPatch(grinder: Grinder, form: GrinderForm): GrinderPatch {
  const before = grinderFields(grinderForm(grinder));
  const after = grinderFields(form);
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) {
    const old: unknown = before[key as keyof typeof before];
    if (JSON.stringify(value) !== JSON.stringify(old)) patch[key] = value;
  }
  return patch;
}

// --- the writes ---

/**
 * Adds a bean: the bean, then its first bag with the roast date (or none), so that every bean
 * of the skin has a batch for the shots to name.
 */
export async function addBean(client: DecaidClient, form: BeanForm): Promise<{ bean: CatalogueBean; batch: BeanBatch }> {
  const input: BeanInput = { name: form.name.trim(), roaster: form.roaster.trim() };
  if (optional(form.notes)) input.notes = optional(form.notes);
  const bean = await client.createBean(input);
  const roastDate = optional(form.roastDate);
  const batch = await client.createBatch(bean.id, roastDate ? { roastDate } : {});
  return { bean, batch };
}

/** Saves an edit: the bean's changed fields, and the bag's roast date; a bean without a bag gets one for a date. */
export async function saveBean(client: DecaidClient, bean: CatalogueBean, batch: BeanBatch | null, form: BeanForm): Promise<void> {
  const patch = beanPatch(bean, form);
  if (Object.keys(patch).length) await client.updateBean(bean.id, patch);
  const bag = batchPatch(batch, form);
  if (bag && batch) await client.updateBatch(batch.id, bag);
  else if (bag?.roastDate) await client.createBatch(bean.id, { roastDate: bag.roastDate });
}

/** A new bag of the same bean: the current one is archived, the next one starts without a roast date. */
export async function newBag(client: DecaidClient, beanId: string, batch: BeanBatch | null): Promise<BeanBatch> {
  if (batch) await client.updateBatch(batch.id, { archived: true });
  return client.createBatch(beanId, {});
}

// --- the pick for the next shot ---

export interface NextShotPick {
  bean: CatalogueBean | null;
  /** the bean's current bag; null for no bean, or a bean without one */
  batch: BeanBatch | null;
  grinder: Grinder | null;
  /** the grinder setting as the context holds it, a string */
  setting: string | null;
}

/**
 * The pick as a patch of the workflow's context, for one `PUT /api/v1/workflow`. What it does
 * not have is `null`, which clears it: no bean clears the three bean fields.
 */
export function pickContext(pick: NextShotPick): WorkflowContextPatch {
  const named = currentBeanContext(pick.bean, pick.batch);
  return {
    coffeeName: named?.coffeeName ?? pick.bean?.name ?? null,
    coffeeRoaster: named?.coffeeRoaster ?? pick.bean?.roaster ?? null,
    beanBatchId: named?.beanBatchId ?? null,
    grinderId: pick.grinder?.id ?? null,
    grinderModel: pick.grinder?.model ?? null,
    grinderSetting: pick.setting?.trim() || null,
  };
}

/**
 * The catalogue's bean the context names: by its batch, else by name and roaster (a bean picked
 * before the catalogue knew it, or by an app that wrote no batch).
 */
export function pickedBean(
  beans: readonly CatalogueBean[],
  batches: readonly BeanBatch[],
  context: WorkflowContext | null | undefined,
): CatalogueBean | null {
  const batchId = context?.beanBatchId;
  const beanId = batchId ? batches.find((batch) => batch.id === batchId)?.beanId : undefined;
  if (beanId) return beans.find((bean) => bean.id === beanId) ?? null;
  const name = context?.coffeeName?.trim();
  const roaster = context?.coffeeRoaster?.trim();
  if (!name && !roaster) return null;
  return beans.find((bean) => bean.name === (name ?? '') && bean.roaster === (roaster ?? '')) ?? null;
}

/** The catalogue's grinder the context names, by id, else by model; with no grinder named and one in the catalogue, that one. */
export function pickedGrinder(grinders: readonly Grinder[], context: WorkflowContext | null | undefined): Grinder | null {
  const offered = grinders.filter((grinder) => !grinder.archived);
  if (context?.grinderId) return grinders.find((grinder) => grinder.id === context.grinderId) ?? null;
  if (context?.grinderModel) return grinders.find((grinder) => grinder.model === context.grinderModel) ?? null;
  return offered.length === 1 ? offered[0] : null;
}

const places = (value: number) => (String(value).split('.')[1] ?? '').length;

/**
 * The grinder setting one step up (+1) or down (-1): by the grinder's small step for a numeric
 * setting, kept at 0 or more, or to the next named position of a preset one. A setting that is
 * no number starts at 0.
 */
export function stepSetting(grinder: Grinder | null, setting: string | null, direction: 1 | -1): string {
  if (grinder?.settingType === 'preset' && grinder.settingValues?.length) {
    const values = grinder.settingValues;
    const at = values.indexOf(setting ?? '');
    if (at < 0) return values[0];
    return values[Math.min(values.length - 1, Math.max(0, at + direction))];
  }
  const step = grinder?.settingSmallStep || DEFAULT_STEP;
  const current = Number(setting);
  const from = setting !== null && setting.trim() !== '' && Number.isFinite(current) ? current : 0;
  const decimals = Math.max(places(step), places(from));
  return Math.max(0, from + direction * step).toFixed(decimals);
}
