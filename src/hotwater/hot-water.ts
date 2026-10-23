// The hot water page (spec 3.7, acceptance 20): its four values are the workflow's
// `hotWaterData`, and its stop at weight can be set from the last shot by a ratio.
//
// Decaid stops hot water at a weight by itself (research.md 21): with a scale connected and its
// setting `stopHotWaterAtWeight` on (the default) it tares the scale when hot water starts and
// stops at `hotWaterData.volume`, taken as grams. So stop at weight is that field, and the skin
// stops nothing itself; without a scale the machine's own volume and time stop remain, so the
// row reads stop at volume in ml then (spec 3.12).
import type { DecaidClient, HotWaterData, ShotRecordSummary, Workflow } from '../api';
import type { ScaleLink } from '../shell/machine';

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
 * Streamline's ranges (src/settings/settings.js, v0.2.14), with the flow up to 8 ml/s, the DE1's
 * maximum (spec 3.9, item 16). The hot water page and the settings page both read them.
 */
export const HOT_WATER_FIELDS: HotWaterField[] = [
  { id: 'temperature', label: 'temperature', key: 'targetTemperature', unit: '°C', min: 50, max: 95, decimals: false },
  { id: 'flow', label: 'flow', key: 'flow', unit: 'ml/s', min: 0.1, max: 8, decimals: true },
  { id: 'time', label: 'time', key: 'duration', unit: 's', min: 5, max: 120, decimals: false },
  { id: 'weight', label: 'stop at weight', key: 'volume', unit: 'g', min: 10, max: 500, decimals: false },
];

export const WEIGHT_FIELD = HOT_WATER_FIELDS.find((field) => field.key === 'volume')!;
export const FLOW_FIELD = HOT_WATER_FIELDS.find((field) => field.key === 'flow')!;

/** The stop of `hotWaterData.volume` without a connected scale: the machine's own, in ml. */
const VOLUME_FIELD: HotWaterField = { ...WEIGHT_FIELD, label: 'stop at volume', unit: 'ml' };

/**
 * The page's rows for a scale link: stop at weight in g with a connected scale, stop at volume
 * in ml without one (`unknown` or `disconnected`). The field, its number and its range are the
 * same; only the label and the unit change.
 */
export function hotWaterFields(scaleLink: ScaleLink): HotWaterField[] {
  return scaleLink === 'connected'
    ? HOT_WATER_FIELDS
    : HOT_WATER_FIELDS.map((field) => (field === WEIGHT_FIELD ? VOLUME_FIELD : field));
}

/** The step of a field's slider and number pad: 0.1 for flow, 1 for the others. */
export const fieldStep = (field: HotWaterField): number => (field.decimals ? 0.1 : 1);

/** A value as its row shows it, without the unit: '6.5', '75'; '–' when there is none. */
export function shownValue(field: HotWaterField, value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${+value.toFixed(field.decimals ? 1 : 0)}` : '–';
}

/** A value held inside its field's range and step. */
export function heldValue(field: HotWaterField, value: number): number {
  const stepped = field.decimals ? Math.round(value * 10) / 10 : Math.round(value);
  return Math.min(field.max, Math.max(field.min, stepped));
}

/**
 * `hotWaterData` as it is written: a flow above the DE1's 8 ml/s, stored by another app or by
 * an older pureflow (the rig's workflow has 10), is held to 8 by the next change of any value
 * (spec 3.9). It is shown as it is until then; the other values are sent as they are.
 */
export function heldHotWater<T extends Partial<HotWaterData>>(data: T): T {
  return typeof data.flow === 'number' && data.flow > FLOW_FIELD.max ? { ...data, flow: FLOW_FIELD.max } : data;
}

/** g (or ml without a scale), the stop at weight for a shot of this weight and a ratio: 40 g and 1:2 give 80 g. */
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
 * its range. Decaid's schema requires all four fields, so the others are sent as they are, but
for a flow above 8 ml/s (`heldHotWater`).
 * Returns the workflow Decaid answers with.
 */
export function writeHotWater(
  client: Pick<DecaidClient, 'updateWorkflow'>,
  current: HotWaterData,
  field: HotWaterField,
  value: number,
): Promise<Workflow> {
  return client.updateWorkflow({ hotWaterData: heldHotWater({ ...current, [field.key]: heldValue(field, value) }) });
}
