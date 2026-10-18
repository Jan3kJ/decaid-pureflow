// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/settings-tree.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The settings page's navigation (research.md 20.3, 20.7): Streamline's categories in its order
// and with its numbers, each subcategory with what renders it. What the port leaves out is
// absent; S2c adds Extensions, Updates, presence and sensor calibration (20.10).
import {
  BRIGHTNESS,
  DECAID_SETTINGS,
  FAN,
  FLOW_CALIBRATION,
  FLUSH,
  HOT_WATER,
  MACHINE_ADVANCED,
  REFILL_KIT,
  SCALE,
  STEAM,
  USB,
  VOLTAGE,
  WAKE_LOCK,
  WATER_TANK,
  type Field,
} from './fields';
import type { DeviceKind } from './devices';
import type { ProcedureId } from './maintenance';

/** A button of a subcategory that is not a setting. */
export type Action = 'fast-start' | 'reset' | 'dashboard';

/** The skin's own settings (20.6), drawn by `SkinCategory.svelte`. */
export type SkinPart = 'steam' | 'hot-water' | 'profile' | 'graph' | 'backup';

/**
 * A part of a subcategory that is not a list of fields (S2b): the device lists
 * (`Devices.svelte`), a maintenance procedure (`Maintenance.svelte`), the machine's information
 * and the charging status (`MachineInfo.svelte`). Drawn above the subcategory's fields.
 */
export type View =
  | { kind: 'devices'; devices: DeviceKind }
  | { kind: 'maintenance'; procedure: ProcedureId }
  | { kind: 'machine-info' }
  | { kind: 'charging' };

export type Content =
  | { kind: 'fields'; fields: Field[]; actions?: Action[]; view?: View; below?: boolean }
  | { kind: 'skin'; part: SkinPart };

export interface Subcategory {
  id: string;
  name: string;
  /** a line under the name */
  hint?: string;
  content: Content;
}

export interface Category {
  id: string;
  /** Streamline's number */
  number: number;
  name: string;
  subcategories: Subcategory[];
}

const fields = (list: Field[], actions?: Action[]): Content => ({ kind: 'fields', fields: list, actions });
const view = (shown: View, list: Field[] = [], below = false): Content => ({ kind: 'fields', fields: list, view: shown, below });

export const SETTINGS_TREE: Category[] = [
  {
    id: 'quickadjustments',
    number: 1,
    name: 'Quick Adjustments',
    subcategories: [
      { id: 'flowmultiplier', name: 'Flow calibration', content: fields(FLOW_CALIBRATION) },
      {
        id: 'steam',
        name: 'Steam',
        hint: "The machine's steam. The steam page's timer, mugs and adjust buttons are under Skin > Steam.",
        content: fields(STEAM),
      },
      {
        id: 'hotwater',
        name: 'Hot Water',
        hint: "The machine's hot water. The hot water page's ratios are under Skin > Hot water.",
        content: fields(HOT_WATER),
      },
      { id: 'watertank', name: 'Water Tank', content: fields(WATER_TANK) },
      { id: 'flush', name: 'Flush', content: fields(FLUSH) },
      {
        id: 'machineadvancedsettings',
        name: 'Machine Advanced Settings',
        hint: 'Before espresso starts.',
        content: fields(MACHINE_ADVANCED, ['fast-start']),
      },
    ],
  },
  {
    id: 'bluetooth',
    number: 2,
    name: 'Connections',
    subcategories: [
      {
        id: 'ble_machine',
        name: '1. Machine',
        hint: 'Decaid connects the preferred machine by itself when it finds it.',
        content: view({ kind: 'devices', devices: 'machine' }),
      },
      { id: 'ble_scale', name: '2. Scale', content: view({ kind: 'devices', devices: 'scale' }, SCALE) },
    ],
  },
  {
    id: 'calibration',
    number: 3,
    name: 'Calibration',
    subcategories: [
      {
        id: 'defaultloadsettings',
        name: 'Default load settings',
        hint: "Fan, idle temperature, heater flows and time-out, refill kit, flow estimation and steam purge back to the factory's.",
        content: fields([], ['reset']),
      },
      { id: 'refillkit', name: 'Refill Kit', content: fields(REFILL_KIT) },
      { id: 'voltage', name: 'Voltage', content: fields(VOLTAGE) },
      { id: 'fan', name: 'Fan', content: fields(FAN) },
    ],
  },
  {
    id: 'machine',
    number: 4,
    name: 'Machine',
    subcategories: [
      { id: 'usbchargermode', name: 'USB', content: view({ kind: 'charging' }, USB, true) },
      { id: 'machineinfo', name: 'Machine Information', content: view({ kind: 'machine-info' }) },
    ],
  },
  {
    id: 'maintenance',
    number: 5,
    name: 'Maintenance',
    subcategories: [
      { id: 'machinecleaning', name: 'Clean', content: view({ kind: 'maintenance', procedure: 'clean' }) },
      { id: 'machinedescaling', name: 'Machine Descaling', content: view({ kind: 'maintenance', procedure: 'descale' }) },
      { id: 'transportmode', name: 'Transport Mode', content: view({ kind: 'maintenance', procedure: 'transport' }) },
    ],
  },
  {
    id: 'skin',
    number: 6,
    name: 'Skin',
    subcategories: [
      {
        id: 'skin-steam',
        name: 'Steam',
        hint: "What the steam page calculates with. The machine's steam temperature and flow: Quick Adjustments > Steam.",
        content: { kind: 'skin', part: 'steam' },
      },
      {
        id: 'skin-hot-water',
        name: 'Hot water',
        hint: "The hot water page's ratios. The machine's hot water values: Quick Adjustments > Hot Water.",
        content: { kind: 'skin', part: 'hot-water' },
      },
      { id: 'skin-profile', name: 'Profile', content: { kind: 'skin', part: 'profile' } },
      { id: 'skin-graph', name: 'Shot graph', content: { kind: 'skin', part: 'graph' } },
      { id: 'skin-backup', name: 'Backup and version', content: { kind: 'skin', part: 'backup' } },
    ],
  },
  {
    id: 'miscellaneous',
    number: 9,
    name: 'Miscellaneous',
    subcategories: [
      { id: 'reasettings', name: 'Decaid Settings', content: fields(DECAID_SETTINGS, ['dashboard']) },
      { id: 'brightness', name: 'Brightness', content: fields(BRIGHTNESS) },
      { id: 'wakelock', name: 'Wake Lock', content: fields(WAKE_LOCK) },
    ],
  },
];

/** Every field of the page, in the tree's order. */
export const TREE_FIELDS: Field[] = SETTINGS_TREE.flatMap((category) =>
  category.subcategories.flatMap((sub) => (sub.content.kind === 'fields' ? sub.content.fields : [])),
);

export const DEFAULT_CATEGORY = SETTINGS_TREE[0].id;

/** Where the page opens: the category opened last (Streamline's `streamline.settings.location`). Not a setting, not backed up. */
export const LOCATION_KEY = 'decaid-skin.settings-location';

export function loadLocation(store: Pick<Storage, 'getItem'> = localStorage): string {
  try {
    const stored = store.getItem(LOCATION_KEY);
    return SETTINGS_TREE.some((category) => category.id === stored) ? stored! : DEFAULT_CATEGORY;
  } catch {
    return DEFAULT_CATEGORY;
  }
}

export function saveLocation(id: string, store: Pick<Storage, 'setItem'> = localStorage): void {
  try {
    store.setItem(LOCATION_KEY, id);
  } catch {
    // no storage: the page opens on the first category next time
  }
}
