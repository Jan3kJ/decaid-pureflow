// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/settings-tree.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The settings page's navigation: Streamline's categories in its order
// and with its numbers, each subcategory with what renders it. What the port leaves out is
// absent.
import {
  BRIGHTNESS,
  DECAID_SETTINGS,
  FAN,
  FLOW_CALIBRATION,
  FLUSH,
  HOT_WATER,
  MACHINE_ADVANCED,
  PRESENCE,
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

export const ACTIONS: Record<Action, { label: string; hint: string; confirm?: string }> = {
  'fast-start': {
    label: 'fast start defaults',
    hint: 'idle temperature 99 °C, warmup flow 2 ml/s, test flow 4 ml/s, time-out 1 s.',
  },
  reset: {
    label: 'reset to defaults',
    hint: "the machine's settings above come back as the factory set them. The profile and the workflow are not touched.",
    confirm: "Fan, idle temperature, heater flows and time-out, refill kit, flow estimation and steam purge go back to the factory's.",
  },
  dashboard: { label: 'go to dashboard', hint: "leaves the skin for Decaid's own screens." },
};

/** The skin's own settings (20.6), drawn by `SkinCategory.svelte`. */
export type SkinPart = 'steam' | 'hot-water' | 'profile' | 'graph' | 'display' | 'skins' | 'versions' | 'backup' | 'developer';

/**
 * A part of a subcategory that is not a list of fields: the device lists (`Devices.svelte`), a
 * maintenance procedure (`Maintenance.svelte`), the clean with detergent
 * (`DetergentClean.svelte`), the machine's information and the charging
 * status (`MachineInfo.svelte`); the plugin cards (`Plugins.svelte`), the wake schedules
 * (`Presence.svelte`), the firmware and Decaid's update (`Firmware.svelte`), the sensors'
 * calibration (`SensorCalibration.svelte`); the skin's own tank unit beside the machine's
 * tank settings (`TankUnit.svelte`) and the guided fill of the user's tank table
 * (`TankCalibration.svelte`). Drawn above the subcategory's fields, or below them.
 */
export type View =
  | { kind: 'devices'; devices: DeviceKind }
  | { kind: 'maintenance'; procedure: ProcedureId }
  | { kind: 'detergent-clean' }
  | { kind: 'machine-info' }
  | { kind: 'charging' }
  | { kind: 'plugins' }
  | { kind: 'presence' }
  | { kind: 'firmware' }
  | { kind: 'app-update' }
  | { kind: 'sensors' }
  | { kind: 'tank-unit' }
  | { kind: 'tank-calibration' }
  | { kind: 'bengle'; part: 'cup-warmer' | 'lighting' | 'load-cells' }
  | { kind: 'help'; part: 'manual' | 'feedback' };

export type Content =
  { kind: 'fields'; fields: Field[]; actions?: Action[]; view?: View; below?: boolean } | { kind: 'skin'; part: SkinPart };

export interface Subcategory {
  id: string;
  name: string;
  /** a line under the name */
  hint?: string;
  /** shown only when the connected machine is a Bengle */
  bengle?: boolean;
  /** shown only with Skin > Backup and version > developer options on */
  developer?: boolean;
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
        hint: "the machine's steam. The steam page's timer, mugs and adjust buttons are under Skin > Steam.",
        content: fields(STEAM),
      },
      {
        id: 'hotwater',
        name: 'Hot Water',
        hint: "the machine's hot water. The hot water page's ratios are under Skin > Hot water.",
        content: fields(HOT_WATER),
      },
      { id: 'watertank', name: 'Water Tank', content: view({ kind: 'tank-unit' }, WATER_TANK, true) },
      {
        id: 'tankcalibration',
        name: 'Tank calibration',
        hint: "your own tank's ml: fill it 250 ml at a time and the skin keeps the level of each step.",
        content: view({ kind: 'tank-calibration' }),
      },
      { id: 'flush', name: 'Flush', content: fields(FLUSH) },
      {
        id: 'machineadvancedsettings',
        name: 'Machine Advanced Settings',
        hint: 'before espresso starts.',
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
        hint: "fan, idle temperature, heater flows and time-out, refill kit, flow estimation and steam purge back to the factory's.",
        content: fields([], ['reset']),
      },
      { id: 'refillkit', name: 'Refill Kit', content: fields(REFILL_KIT) },
      { id: 'voltage', name: 'Voltage', content: fields(VOLTAGE) },
      { id: 'fan', name: 'Fan', content: fields(FAN) },
      {
        id: 'sensors',
        name: 'Sensor Calibration',
        hint: "corrections of the machine's temperature, pressure and flow sensors against your own instrument.",
        content: view({ kind: 'sensors' }),
      },
      {
        id: 'loadcell',
        name: 'Load Cells',
        hint: "the Bengle's integrated scale: find the zero, then latch a known mass on each load cell.",
        bengle: true,
        content: view({ kind: 'bengle', part: 'load-cells' }),
      },
    ],
  },
  {
    id: 'machine',
    number: 4,
    name: 'Machine',
    subcategories: [
      { id: 'usbchargermode', name: 'USB', content: view({ kind: 'charging' }, USB, true) },
      { id: 'cupwarmer', name: 'Cup Warmer', bengle: true, content: view({ kind: 'bengle', part: 'cup-warmer' }) },
      {
        id: 'ledstrip',
        name: 'Lighting',
        hint: 'the colours of the strips while the machine is awake and while it sleeps.',
        bengle: true,
        content: view({ kind: 'bengle', part: 'lighting' }),
      },
      { id: 'machineinfo', name: 'Machine Information', content: view({ kind: 'machine-info' }) },
    ],
  },
  {
    id: 'maintenance',
    number: 5,
    name: 'Maintenance',
    subcategories: [
      { id: 'detergentclean', name: 'Clean with detergent', content: view({ kind: 'detergent-clean' }) },
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
        hint: "what the steam page calculates with. The machine's steam temperature and flow: Quick Adjustments > Steam.",
        content: { kind: 'skin', part: 'steam' },
      },
      {
        id: 'skin-hot-water',
        name: 'Hot water',
        hint: "the hot water page's ratios. The machine's hot water values: Quick Adjustments > Hot Water.",
        content: { kind: 'skin', part: 'hot-water' },
      },
      { id: 'skin-profile', name: 'Profile', content: { kind: 'skin', part: 'profile' } },
      { id: 'skin-graph', name: 'Shot graph', content: { kind: 'skin', part: 'graph' } },
      {
        id: 'skin-display',
        name: 'Display Size',
        hint: 'the size of everything on the screen, and the width of the curves of every graph.',
        content: { kind: 'skin', part: 'display' },
      },
      {
        id: 'skin-active',
        name: 'Active Skin',
        hint: "Decaid's installed skins. The default one is what Decaid opens; a tap on another makes it the default and opens it.",
        content: { kind: 'skin', part: 'skins' },
      },
      {
        id: 'skin-version',
        name: 'Skin version',
        hint: 'the flavour and the release of this skin to install. The list comes from GitHub when you ask for it; Decaid downloads and installs the ZIP.',
        content: { kind: 'skin', part: 'versions' },
      },
      { id: 'skin-backup', name: 'Backup and version', content: { kind: 'skin', part: 'backup' } },
      {
        id: 'skin-developer',
        name: 'Developer',
        hint: 'for testing a build before it is published.',
        developer: true,
        content: { kind: 'skin', part: 'developer' },
      },
    ],
  },
  {
    id: 'extensions',
    number: 8,
    name: 'Extensions',
    subcategories: [
      {
        id: 'extention2',
        name: 'Plugins',
        hint: "Decaid's plugins, Visualizer and Shot Uploader among them, with the settings each declares.",
        content: view({ kind: 'plugins' }),
      },
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
      {
        id: 'presence',
        name: 'Presence Detection',
        hint: 'sleep and wake the machine by use and by schedule.',
        content: view({ kind: 'presence' }, PRESENCE, true),
      },
    ],
  },
  {
    id: 'updates',
    number: 10,
    name: 'Updates',
    subcategories: [
      { id: 'firmwareupdate', name: 'Firmware Update', content: view({ kind: 'firmware' }) },
      { id: 'appupdate', name: 'Decaid', hint: "Decaid's own update, as Decaid reports it.", content: view({ kind: 'app-update' }) },
    ],
  },
  {
    id: 'usermanual',
    number: 11,
    name: 'User Manual',
    subcategories: [
      { id: 'quickstart', name: 'Quick Start Guide', content: view({ kind: 'help', part: 'manual' }) },
      { id: 'feedback', name: 'Send Feedback', hint: 'to Decent, through Decaid.', content: view({ kind: 'help', part: 'feedback' }) },
    ],
  },
];

/** Every field of the page, in the tree's order. */
export const TREE_FIELDS: Field[] = SETTINGS_TREE.flatMap((category) =>
  category.subcategories.flatMap((sub) => (sub.content.kind === 'fields' ? sub.content.fields : [])),
);

/** The subcategories shown: the Bengle's only on a Bengle, the developer's only with its switch on. */
export function visibleSubcategories(category: Category, bengle: boolean, developer = false): Subcategory[] {
  return category.subcategories.filter((sub) => (bengle || !sub.bengle) && (developer || !sub.developer));
}

export const DEFAULT_CATEGORY = SETTINGS_TREE[0].id;

/** Where the page opens: the category opened last (Streamline's `streamline.settings.location`). Not a setting, not backed up. */
export const LOCATION_KEY = 'pureflow.settings-location';

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
