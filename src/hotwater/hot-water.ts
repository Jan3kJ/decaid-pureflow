// The hot water page (spec 3.7, acceptance 20): its four values are the workflow's
// `hotWaterData`, and its stop at weight can be set from the last shot by a ratio.
//
// Decaid stops hot water at a weight by itself (research.md 21): with a scale connected and its
// setting `stopHotWaterAtWeight` on (the default) it tares the scale when hot water starts and
// stops at `hotWaterData.volume`, taken as grams. So stop at weight is that field, and the skin
// stops nothing itself; without a scale the machine's own volume and time stop remain.
import type { DecaidClient, HotWaterData, ShotRecordSummary, Workflow } from '../api';

/** One value of the page: where it is in `hotWaterData`, and what the number pad allows. */
export interface HotWaterField {
  /** the name in the tests */
  id: string;
  label: string;
  key: keyof HotWaterData;
  unit: string;
  min: number;
  max: number;
  /** flow takes one decimal; the other three are whole numbers in Decaid's schema (rest_v1.yml) */
  decimals: boolean;
}

/**
 * Streamline's ranges (src/settings/settings.js, v0.2.14), with the flow up to 10 ml/s: the
 * rig's workflow has 10, and the founder's newer machine drives more than 8 (spec 3.6).
 */
export const HOT_WATER_FIELDS: HotWaterField[] = [
  { id: 'temperature', label: 'temperature', key: 'targetTemperature', unit: '°C', min: 50, max: 95, decimals: false },
  { id: 'flow', label: 'flow', key: 'flow', unit: 'ml/s', min: 0.1, max: 10, decimals: true },
  { id: 'time', label: 'time', key: 'duration', unit: 's', min: 5, max: 120, decimals: false },
  { id: 'weight', label: 'stop at weight', key: 'volume', unit: 'g', min: 10, max: 500, decimals: false },
];

export const WEIGHT_FIELD = HOT_WATER_FIELDS.find((field) => field.key === 'volume')!;

/** A value held inside its field's range and step. */
export function heldValue(field: HotWaterField, value: number): number {
  const stepped = field.decimals ? Math.round(value * 10) / 10 : Math.round(value);
  return Math.min(field.max, Math.max(field.min, stepped));
}

/** g, the stop at weight for a shot of this weight and a ratio: 40 g and 1:2 give 80 g. */
export function ratioWeight(shotGrams: number, ratio: number): number {
  return heldValue(WEIGHT_FIELD, shotGrams * ratio);
}

/** '1:2', '1:2.5' */
export const ratioLabel = (ratio: number): string => `1:${+ratio.toFixed(1)}`;

/**
 * g, the final weight of the last measured espresso shot: the newest shot record's
 * `annotations.actualYield`, which Decaid writes from the scale (research.md 8.4). Null when
 * there is no shot, or the newest has no weight (pulled without a scale).
 */
export function shotGrams(shot: ShotRecordSummary | undefined): number | null {
  const grams = shot?.annotations?.actualYield;
  return typeof grams === 'number' && Number.isFinite(grams) && grams > 0 ? grams : null;
}

/** Reads the newest shot record's weight from the gateway (`shotGrams`). */
export async function lastShotGrams(client: Pick<DecaidClient, 'listShots'>): Promise<number | null> {
  const page = await client.listShots({ limit: 1, order: 'desc' });
  return shotGrams(page.items[0]);
}

/**
 * Writes one value to the workflow's `hotWaterData` with `PUT /api/v1/workflow`, held inside
 * its range. Decaid's schema requires all four fields, so the others are sent as they are.
 * Returns the workflow Decaid answers with.
 */
export function writeHotWater(
  client: Pick<DecaidClient, 'updateWorkflow'>,
  current: HotWaterData,
  field: HotWaterField,
  value: number,
): Promise<Workflow> {
  return client.updateWorkflow({ hotWaterData: { ...current, [field.key]: heldValue(field, value) } });
}
