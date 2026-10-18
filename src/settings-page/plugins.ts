// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/plugin-view.js and src/settings/settings.js (renderPluginSettingControl,
// bindPluginSettingControls).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The plugin cards of Extensions > Plugins (research.md 20.3, 20.10 S2c), without UI: a
// plugin's state from what `GET /api/v1/plugins` lists, and one control per setting its
// manifest declares (string, number, boolean, enum, secure). A secure value never reaches the
// page: the gateway reports `{ isSet }`, and the control shows only that.
import type { PluginManifest, PluginSettingSchema, PluginSettings } from '../api';

/**
 * What a card says about a plugin (Streamline's `pluginStatus`): not loaded, an update held
 * back for permissions, bundled with Decaid, installed from a file (nothing can check it), the
 * last check failed, never checked, or checked.
 */
export type PluginStatus =
  | 'disabled'
  | 'update-pending'
  | 'bundled'
  | 'untracked'
  | 'check-failed'
  | 'never-checked'
  | 'checked';

const MANAGED = ['github_release', 'github_branch'];

export function pluginStatus(plugin: PluginManifest): PluginStatus {
  if (!plugin.loaded) return 'disabled';
  if (plugin.pendingUpdate) return 'update-pending';
  if (!plugin.source) return 'bundled';
  if (!MANAGED.includes(plugin.source.kind ?? '')) return 'untracked';
  if (plugin.source.lastError) return 'check-failed';
  if (!Number.isFinite(Date.parse(plugin.source.lastChecked ?? ''))) return 'never-checked';
  return 'checked';
}

/**
 * Streamline says "Up to date" for 'checked'; a held update only means one that asks for more
 * permissions, so this says what is known: checked, with no update held back.
 */
export const STATUS_LABEL: Record<PluginStatus, string> = {
  disabled: 'Not loaded',
  'update-pending': 'Update needs approval',
  bundled: 'Ships with Decaid',
  untracked: 'Cannot check for updates',
  'check-failed': 'Update check failed',
  'never-checked': 'Not checked yet',
  checked: 'Checked, no update held back',
};

/** Sorted by name: Decaid lists them in load order, which changes as plugins come and go. */
export function sortedPlugins(plugins: PluginManifest[]): PluginManifest[] {
  return [...plugins].filter((plugin) => plugin?.id).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

export type ControlKind = 'string' | 'number' | 'boolean' | 'enum' | 'secure';

/** One setting of a plugin as its card draws it. */
export interface PluginControl {
  key: string;
  /** the manifest's label, else the key */
  label: string;
  description: string | null;
  kind: ControlKind;
  /** an enum's values */
  values: string[];
}

/** A string marked secure is a secure control; a type the card does not know gets none. */
export function controlKind(schema: PluginSettingSchema): ControlKind | null {
  if (schema.type === 'string') return schema.secure ? 'secure' : 'string';
  if (schema.type === 'number' || schema.type === 'boolean') return schema.type;
  if (schema.type === 'enum' && Array.isArray(schema.values)) return 'enum';
  return null;
}

/** The controls of a plugin, in the manifest's order; hidden ones (the plugin's own screen manages them) are left out. */
export function pluginControls(plugin: PluginManifest): PluginControl[] {
  const schema = plugin.settings && typeof plugin.settings === 'object' ? plugin.settings : {};
  return Object.entries(schema).flatMap(([key, entry]) => {
    const kind = entry && entry.hidden !== true ? controlKind(entry) : null;
    if (!kind) return [];
    const label = entry.label?.trim() ? entry.label.trim() : key;
    return [{ key, label, description: entry.description?.trim() || null, kind, values: entry.values ?? [] }];
  });
}

/** Whether a secure setting holds a value: the gateway reports `{ isSet: true }`. */
export function secureIsSet(stored: unknown): boolean {
  return typeof stored === 'object' && stored !== null && (stored as { isSet?: unknown }).isSet === true;
}

/**
 * The value a control shows: the stored one, else the manifest's default (what the plugin runs
 * with when nothing was saved). A secure control gets only 'Saved' or 'Not set', never a value.
 */
export function shownValue(control: PluginControl, schema: PluginSettingSchema, settings: PluginSettings): unknown {
  const stored = settings[control.key];
  if (control.kind === 'secure') return secureIsSet(stored) ? 'Saved' : 'Not set';
  return stored !== undefined && stored !== null ? stored : (schema.default ?? null);
}

/** Whether the value shown is the stored one, not the default. */
export const isStored = (control: PluginControl, settings: PluginSettings) =>
  settings[control.key] !== undefined && settings[control.key] !== null;

/**
 * What a typed or chosen value writes, or null when it writes nothing (Streamline's rules): a
 * number must be finite and not negative, as the manifest gives no range; a string is trimmed;
 * a secure value is written as typed (spaces may be part of it) and an empty one keeps the
 * stored value; an enum takes only its values.
 */
export function written(control: PluginControl, input: unknown): string | number | boolean | null {
  switch (control.kind) {
    case 'boolean':
      return typeof input === 'boolean' ? input : null;
    case 'number': {
      const value = typeof input === 'number' ? input : Number.parseFloat(String(input));
      return Number.isFinite(value) && value >= 0 ? value : null;
    }
    case 'secure':
      return typeof input === 'string' && input !== '' ? input : null;
    case 'string':
      return typeof input === 'string' ? input.trim() : null;
    case 'enum':
      return typeof input === 'string' && control.values.includes(input) ? input : null;
  }
}
