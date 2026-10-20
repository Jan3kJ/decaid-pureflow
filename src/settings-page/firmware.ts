// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/firmware-progress.js (summarizeFirmwareCatalog) and src/settings/settings.js
// (renderFirmwareUpdateSettings, renderAppUpdateBlock).
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// Updates > Firmware Update and Decaid's own update (research.md 20.3, 20.10 S2c), without UI:
// what the bundled firmware catalog says about the connected machine, and the progress of an
// update. "Could not check" never reads as "up to date": `updateAvailable` null is unknown.
import type { AppUpdateState, FirmwareArtifact, FirmwareCatalog, FirmwareProgress } from '../api';

export type FirmwareStatus = 'update-available' | 'up-to-date' | 'ahead' | 'unknown';

export interface FirmwareSummary {
  status: FirmwareStatus;
  model: string | null;
  installedBuild: number | null;
  /** the build an update would apply: the recommended one, else the highest bundled */
  latest: FirmwareArtifact | null;
  /** the first reason the latest build does not apply */
  reason: string | null;
  /** an update running (`erasing`, `uploading`, ...) */
  operation: string;
}

export function summarize(catalog: FirmwareCatalog | null): FirmwareSummary {
  if (!catalog)
    return { status: 'unknown', model: null, installedBuild: null, latest: null, reason: 'unreachable', operation: 'idle' };
  const artifacts = Array.isArray(catalog.artifacts) ? catalog.artifacts : [];
  const installedBuild = typeof catalog.machine?.build === 'number' ? catalog.machine.build : null;
  const recommended = artifacts.find((artifact) => artifact.id === catalog.recommendedArtifactId);
  const highest = artifacts.reduce<FirmwareArtifact | null>(
    (best, artifact) => (typeof artifact.build === 'number' && (!best || artifact.build > (best.build ?? -1)) ? artifact : best),
    null,
  );
  const latest = recommended ?? highest ?? null;
  const reason = latest?.eligibility?.reasons?.[0] ?? null;
  // A machine newer than every bundled build (a beta firmware) is not a failed check.
  const ahead = reason === 'not_newer' && installedBuild !== null && (latest?.build ?? Infinity) < installedBuild;
  const status: FirmwareStatus =
    catalog.updateAvailable === true
      ? 'update-available'
      : catalog.updateAvailable === false
        ? ahead
          ? 'ahead'
          : 'up-to-date'
        : 'unknown';
  return {
    status,
    model: catalog.machine?.model ?? null,
    installedBuild,
    latest,
    reason,
    operation: catalog.operation?.state ?? 'idle',
  };
}

export const STATUS_TEXT: Record<FirmwareStatus, string> = {
  'update-available': 'Firmware update available',
  'up-to-date': 'Up to date',
  ahead: 'Newer than the bundled firmware',
  unknown: 'Could not check',
};

export const REASON_TEXT: Record<string, string> = {
  machine_not_connected: 'No machine connected',
  machine_model_unknown: 'Machine model unknown',
  installed_build_unknown: 'Installed build unknown',
  model_incompatible: 'Not compatible with this machine',
  artifact_invalid: 'Bundled firmware failed validation',
  not_newer: 'Not newer than the installed build',
  unreachable: 'Could not reach the firmware service',
};

/** Said before an update starts (Streamline's note): a flash taken for a hang and switched off breaks the machine. */
export const DURATION_NOTE =
  'The whole update takes at least 50 minutes. Do not switch the machine off or leave this page until it finishes; restart the machine afterwards.';

/** The line under the bar while an update runs. */
export function progressText(progress: FirmwareProgress | null): string {
  if (!progress) return '';
  switch (progress.status) {
    case 'erasing':
      return 'Erasing…';
    case 'uploading':
      // The stream stays on uploading through the verification, which reports nothing.
      return progress.progress >= 0.99 ? 'Verifying…' : `Uploading ${Math.round(progress.progress * 100)} %`;
    case 'done':
      return 'Done. Restart the machine.';
    case 'error':
      return `Failed: ${progress.error ?? 'no reason given'}`;
  }
}

/** Decaid's own update as one line: the gateway's state only, no check of GitHub (spec 6). */
export function appUpdateText(state: AppUpdateState): string {
  switch (state.phase) {
    case 'available':
      return `Decaid ${state.latestVersion ?? 'update'} is available.`;
    case 'checking':
      return 'Checking for an update…';
    case 'downloading':
      return `Downloading ${Math.round((state.progress ?? 0) * 100)} %`;
    case 'installing':
      return 'Installing…';
    case 'error':
      return `The update check failed: ${state.error ?? 'no reason given'}`;
    case 'idle':
      return state.latestVersion ? `Decaid ${state.latestVersion} is the latest known.` : 'No update known.';
  }
}
