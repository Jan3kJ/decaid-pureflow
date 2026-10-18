// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/settings.js (`flushPendingChanges`) and the setters of src/modules/api.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The settings page and the gateway (research.md 20.11): every source is read once when the
// page opens; a change is one request with that key alone, written at once, and then its source
// is read again, so the page shows what the gateway holds, not what was typed. Streamline
// stages its changes until SAVE; this port does not. No UI: the client is a parameter.
import type {
  AdvancedSettings,
  DecaidClient,
  DecaidInfo,
  DecaidSettings,
  DisplayState,
  MachineSettings,
  WaterLevels,
  Workflow,
} from '../api';
import { STREAMLINE_NAMESPACE } from '../steam/apply';
import { FAST_START, type Field, type Source } from './fields';

/** What the page reads: one request each. */
export type Part = 'decaid' | 'machine' | 'advanced' | 'workflow' | 'display' | 'info';
export const PARTS: Part[] = ['decaid', 'machine', 'advanced', 'workflow', 'display', 'info'];

export interface Values {
  decaid: DecaidSettings | null;
  machine: MachineSettings | null;
  advanced: AdvancedSettings | null;
  workflow: Workflow | null;
  display: DisplayState | null;
  info: DecaidInfo | null;
  /** the latest frame of `/ws/v1/machine/waterLevels`, from the skin's stream */
  waterLevels: WaterLevels | null;
}

export const NO_VALUES: Values = {
  decaid: null,
  machine: null,
  advanced: null,
  workflow: null,
  display: null,
  info: null,
  waterLevels: null,
};

export type SettingsGateway = Pick<
  DecaidClient,
  | 'getSettings'
  | 'updateSettings'
  | 'getMachineSettings'
  | 'updateMachineSettings'
  | 'getAdvancedSettings'
  | 'updateAdvancedSettings'
  | 'resetMachineSettings'
  | 'setRefillLevel'
  | 'getWorkflow'
  | 'updateWorkflow'
  | 'getDisplay'
  | 'setBrightness'
  | 'setWakeLock'
  | 'getInfo'
  | 'kvGet'
  | 'kvSet'
>;

/** The part a source is read with; the water levels come from the stream. */
export function partOf(source: Source): Part | null {
  if (source === 'waterLevels') return null;
  return source.startsWith('workflow.') ? 'workflow' : (source as Part);
}

/** The object a field's key is in. */
export function sourceObject(values: Values, source: Source): Record<string, unknown> | null {
  if (source.startsWith('workflow.')) {
    const group = source.slice('workflow.'.length) as 'steamSettings' | 'hotWaterData' | 'rinseData';
    return (values.workflow?.[group] as unknown as Record<string, unknown>) ?? null;
  }
  return (values[source as keyof Values] as Record<string, unknown> | null) ?? null;
}

/** The raw value of a field; undefined while its source is not read or does not have it. */
export function rawValue(values: Values, field: Field): unknown {
  return sourceObject(values, field.source)?.[field.key];
}

export function readPart(gateway: SettingsGateway, part: Part): Promise<unknown> {
  switch (part) {
    case 'decaid':
      return gateway.getSettings();
    case 'machine':
      return gateway.getMachineSettings();
    case 'advanced':
      return gateway.getAdvancedSettings();
    case 'workflow':
      return gateway.getWorkflow();
    case 'display':
      return gateway.getDisplay();
    case 'info':
      return gateway.getInfo();
  }
}

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Every part, each read once; a part that fails stays null and has its message. */
export async function readAll(
  gateway: SettingsGateway,
  values: Values = NO_VALUES,
): Promise<{ values: Values; errors: Partial<Record<Part, string>> }> {
  const errors: Partial<Record<Part, string>> = {};
  const read = await Promise.all(
    PARTS.map(async (part) => {
      try {
        return await readPart(gateway, part);
      } catch (cause) {
        errors[part] = message(cause);
        return null;
      }
    }),
  );
  const next = { ...values };
  PARTS.forEach((part, i) => ((next as Record<Part, unknown>)[part] = read[i]));
  return { values: next, errors };
}

/**
 * Streamline's remembered values in its KV namespace (research.md 20.2, section 16): its 0.2.13
 * writes them back over other values while a page of it is open. The page moves a remembered
 * value with its own, so both skins agree, and never creates a key.
 */
export const STREAMLINE_KEYS: Record<string, string> = {
  'workflow.steamSettings/targetTemperature': 'last-steam-temp',
  'workflow.steamSettings/flow': 'last-steam-flow',
  'workflow.hotWaterData/volume': 'last-hot-water-volume',
  'workflow.hotWaterData/targetTemperature': 'last-hot-water-temp',
  'workflow.rinseData/duration': 'last-flush-duration',
};

async function moveStreamlineValue(gateway: SettingsGateway, field: Field, value: unknown): Promise<void> {
  const key = STREAMLINE_KEYS[`${field.source}/${field.key}`];
  // Streamline remembers a steam temperature only while the heater is on.
  if (!key || (key === 'last-steam-temp' && value === 0)) return;
  try {
    const remembered = await gateway.kvGet(key, STREAMLINE_NAMESPACE);
    if (remembered !== null && remembered !== value) await gateway.kvSet(key, value, STREAMLINE_NAMESPACE);
  } catch {
    // Without the store the setting is still written.
  }
}

/** A write that failed, or a value written that could not be read back. */
export class WriteError extends Error {
  constructor(text: string) {
    super(text);
    this.name = 'WriteError';
  }
}

/** The one request that writes a field. */
async function send(gateway: SettingsGateway, values: Values, field: Field, value: unknown): Promise<void> {
  const patch = { [field.key]: value };
  switch (field.source) {
    case 'decaid':
      return gateway.updateSettings(patch);
    case 'machine':
      return gateway.updateMachineSettings(patch);
    case 'advanced':
      return gateway.updateAdvancedSettings(patch);
    case 'workflow.steamSettings':
      // A part of `steamSettings` changes only that part (research.md 16).
      await gateway.updateWorkflow({ steamSettings: patch });
      return;
    case 'workflow.hotWaterData':
    case 'workflow.rinseData': {
      // Decaid's schema needs the whole group: the other values as they were read.
      const current = sourceObject(values, field.source);
      if (!current) throw new WriteError(`${field.label}: the workflow is not read yet`);
      const group = field.source === 'workflow.hotWaterData' ? 'hotWaterData' : 'rinseData';
      await gateway.updateWorkflow({ [group]: { ...current, ...patch } });
      return;
    }
    case 'waterLevels':
      return gateway.setRefillLevel(value as number);
    case 'display':
      if (field.key === 'wakeLockOverride') await gateway.setWakeLock(value === true);
      else await gateway.setBrightness(value as number);
      return;
    case 'info':
      throw new WriteError(`${field.label} is read only`);
  }
}

/**
 * Writes one field and reads its source again. The value is what the source takes: a switch
 * with `written` sends its text. Returns the values with the source as the gateway holds it;
 * throws a `WriteError` with the message when the write or the read fails, and the page keeps
 * the values it had.
 */
export async function writeField(gateway: SettingsGateway, values: Values, field: Field, value: unknown): Promise<Values> {
  const sent = field.kind === 'switch' && field.written ? (value ? field.written.on : field.written.off) : value;
  if (field.source.startsWith('workflow.')) await moveStreamlineValue(gateway, field, sent);
  try {
    await send(gateway, values, field, sent);
  } catch (cause) {
    if (cause instanceof WriteError) throw cause;
    throw new WriteError(`${field.label} was not set: ${message(cause)}`);
  }
  const part = partOf(field.source);
  return part ? reread(gateway, values, [part], field.label) : values;
}

async function reread(gateway: SettingsGateway, values: Values, parts: Part[], what: string): Promise<Values> {
  const next = { ...values };
  for (const part of parts) {
    try {
      (next as Record<Part, unknown>)[part] = await readPart(gateway, part);
    } catch (cause) {
      throw new WriteError(`${what} was written but not read back: ${message(cause)}`);
    }
  }
  return next;
}

/** Streamline's Fast Start Defaults: the four heater values in one write. */
export async function applyFastStart(gateway: SettingsGateway, values: Values): Promise<Values> {
  try {
    await gateway.updateAdvancedSettings(FAST_START);
  } catch (cause) {
    throw new WriteError(`Fast Start Defaults were not set: ${message(cause)}`);
  }
  return reread(gateway, values, ['advanced'], 'Fast Start Defaults');
}

/** The factory's machine settings (`DELETE /api/v1/machine/settings/reset`), then both machine parts read again. */
export async function resetMachine(gateway: SettingsGateway, values: Values): Promise<Values> {
  try {
    await gateway.resetMachineSettings();
  } catch (cause) {
    throw new WriteError(`The machine settings were not reset: ${message(cause)}`);
  }
  return reread(gateway, values, ['machine', 'advanced'], 'The reset');
}
