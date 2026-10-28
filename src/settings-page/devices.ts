// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/settings/settings.js (`renderDeviceListFromCache`, `renderSingleDeviceList`).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The device lists of Connections (research.md 20.3, 20.10 S2b): which devices a list shows,
// in which order, and what a row says and offers. No UI.
import type { DeviceInfo, DevicesState, DeviceType } from '../api';

/** The two lists of Connections and the setting that names each one's preferred device. */
export type DeviceKind = 'machine' | 'scale';

export const PREFERRED_KEY: Record<DeviceKind, 'preferredMachineId' | 'preferredScaleId'> = {
  machine: 'preferredMachineId',
  scale: 'preferredScaleId',
};

/**
 * What a row shows. `connected`; `busy` while it connects or disconnects; `available`: present,
 * not connected; `unavailable`: remembered by Decaid, not present (`available: false`).
 */
export type RowState = 'connected' | 'busy' | 'available' | 'unavailable';

/** What a row offers. Streamline: Disconnect, Connect, or for an absent one Reconnect (a scan) and Forget. */
export type RowAction = 'disconnect' | 'connect' | 'rescan' | 'forget';

export interface DeviceRow {
  device: DeviceInfo;
  state: RowState;
  /** the label of the state */
  label: string;
  preferred: boolean;
  actions: RowAction[];
}

export function rowState(device: DeviceInfo): RowState {
  // Older builds have no `available`: present (Streamline).
  if (device.available === false) return 'unavailable';
  if (device.state === 'connected') return 'connected';
  if (device.state === 'connecting' || device.state === 'disconnecting') return 'busy';
  return 'available';
}

const LABELS: Record<RowState, string> = {
  connected: 'Connected',
  busy: '',
  available: 'Available',
  unavailable: 'Unavailable',
};

const ACTIONS: Record<RowState, RowAction[]> = {
  connected: ['disconnect'],
  busy: [],
  available: ['connect'],
  // A direct connect fails without a transport: the device connects again when a scan finds it.
  unavailable: ['rescan', 'forget'],
};

const ORDER: RowState[] = ['connected', 'busy', 'available', 'unavailable'];

/**
 * The rows of one list: the devices of that type, the connected one first, then those that
 * connect or disconnect, then those present, then the remembered ones that are absent; in
 * Decaid's order within each.
 */
export function deviceRows(devices: readonly DeviceInfo[], kind: DeviceKind, preferredId: string | null | undefined): DeviceRow[] {
  const type: DeviceType = kind;
  return devices
    .filter((device) => device.type === type && device.name)
    .map((device) => {
      const state = rowState(device);
      const label = state === 'busy' ? (device.state === 'connecting' ? 'Connecting' : 'Disconnecting') : LABELS[state];
      return { device, state, label, preferred: !!preferredId && device.id === preferredId, actions: ACTIONS[state] };
    })
    .sort((a, b) => ORDER.indexOf(a.state) - ORDER.indexOf(b.state));
}

/** What a connect answered, as a line for the row; null when it connected. */
export function connectMessage(result: {
  outcome: string;
  error?: string | null;
  connectionError?: { message: string } | null;
}): string | null {
  switch (result.outcome) {
    case 'connected':
    case 'alreadyConnected':
      return null;
    case 'conflict':
      return 'Already connecting: try again in a moment.';
    case 'timedOut':
      return 'The connection timed out.';
    default:
      return `Not connected: ${result.error ?? result.connectionError?.message ?? result.outcome}`;
  }
}

/**
 * The list after a forget was answered: Decaid sends the list again, and until then the device is
 * gone here (Streamline). `sent` is the list as it was when the forget went out, `now` the list
 * now: one that came while the forget was out is Decaid's newer word, and is kept as it is.
 */
export function afterForget(sent: DevicesState | null, now: DevicesState | null, id: string): DevicesState | null {
  if (!now || now !== sent) return now;
  return { ...now, devices: now.devices.filter((entry) => entry.id !== id) };
}
