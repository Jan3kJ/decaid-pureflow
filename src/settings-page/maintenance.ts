// Ported from Streamline.js (https://github.com/decentespresso/streamline-js), v0.2.14,
// src/modules/maintenance-progress.js and src/settings/categories/maintenance.js.
// Streamline.js - A browser-native skin for Decent Espresso machines
// Copyright (C) 2025-2026 Decent Espresso
// Licensed under the GNU General Public License v3.0 or later; used here under GPL-3.0.
//
// The maintenance procedures of the settings page (research.md 20.3, 20.10 S2b): clean, descale
// and transport mode. `PUT /api/v1/machine/state/{cleaning,descaling,airPurge}` hands the cycle
// to the firmware; the skin only watches the machine's state and substate. As Streamline says:
// the machine enters the state some frames after the request, it leaves it without an event
// when the cycle ends, and no frame is not "not running". No UI.
import type { MachineState, RequestedMachineState } from '../api';

export type ProcedureId = 'clean' | 'descale' | 'transport';

export interface Procedure {
  id: ProcedureId;
  /** the state requested and watched */
  state: Extract<RequestedMachineState, 'cleaning' | 'descaling' | 'airPurge'>;
  title: string;
  description: string;
  /** what the confirm before Start says */
  confirm: string;
  /** a page of Decent's with the instructions */
  link?: { label: string; href: string };
  /** the steps shown while it runs */
  milestones: string[];
  /** the milestone of a substate, from the one before */
  milestoneFor: (substate: string | null, previous: number) => number;
  /** what is said when it has ended */
  ready: string;
}

/**
 * Cleaning: start, fill, soak, flush. Decaid reports the fill and the flush both as
 * `cleaningGroup`, so one before the soak is the fill and one after it the flush.
 */
export const CLEAN: Procedure = {
  id: 'clean',
  state: 'cleaning',
  title: 'Clean',
  description: 'Runs a cleaning cycle that backflushes the group head.',
  confirm: 'Put a blind basket in the portafilter and lock it into the group head.',
  milestones: ['Starting', 'Filling', 'Soak', 'Flush'],
  milestoneFor: (substate, previous) => {
    if (substate === 'cleaningStart') return 0;
    if (substate === 'cleanSoaking') return 2;
    if (substate === 'cleaningGroup') return previous >= 2 ? 3 : 1;
    return previous;
  },
  ready: 'Ready',
};

export const DESCALE: Procedure = {
  id: 'descale',
  state: 'descaling',
  title: 'Machine Descaling',
  description:
    'Runs a descaling cycle that removes mineral buildup. The steam heater is switched off first and the cycle starts once the steam boiler is down to 60 °C; the heater comes on again afterwards.',
  confirm: "Prepare to descale as Decent's descaling instructions say: the descaling solution in the tank.",
  link: { label: 'Descaling instructions', href: 'https://decentespresso.com/docs/de1_descaling_instructions' },
  milestones: ['Starting', 'Descaling', 'Steam'],
  milestoneFor: (substate, previous) => {
    if (substate === 'cleaningStart') return 0;
    if (substate === 'cleaningGroup') return 1;
    if (substate === 'cleaningSteam') return 2;
    return previous;
  },
  ready: 'Ready',
};

export const TRANSPORT: Procedure = {
  id: 'transport',
  state: 'airPurge',
  title: 'Transport Mode',
  description:
    'Purges the remaining water from inside the machine. Run it before packing the machine, so that it does not leak during transport.',
  confirm: 'Prepare your espresso machine for transport: the water inside it is removed.',
  milestones: ['Removing water'],
  milestoneFor: () => 0,
  ready: 'You can turn your machine off once it is out of water. It is then ready for transport.',
};

export const PROCEDURES: Record<ProcedureId, Procedure> = { clean: CLEAN, descale: DESCALE, transport: TRANSPORT };

/** ms: how long the machine may take to enter the state after the request */
export const START_TIMEOUT_MS = 20000;
/** ms: how long a sleeping machine may take to wake before the request goes out anyway */
export const WAKE_TIMEOUT_MS = 15000;
/** °C: the steam boiler's highest temperature for a descale */
export const DESCALE_STEAM_MAX = 60;
/** ms: how long the steam boiler may take to cool down */
export const STEAM_COOLDOWN_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * - `idle`: nothing asked
 * - `waiting`: asked, the machine has not entered the state yet (since `since`, ms)
 * - `running`: in the state, at `milestone`
 * - `done`: was in the state and has left it
 * - `timeout`: never entered it
 * `stale`: no frame came, so the page cannot tell; neither the timeout nor the end advance.
 */
export interface Progress {
  phase: 'idle' | 'waiting' | 'running' | 'done' | 'timeout';
  milestone: number;
  since: number;
  stale: boolean;
}

export const IDLE: Progress = { phase: 'idle', milestone: -1, since: 0, stale: false };

export const started = (now: number): Progress => ({ phase: 'waiting', milestone: -1, since: now, stale: false });

/** The progress after a frame of the machine; `state` null while no frame is known. */
export function advance(
  previous: Progress,
  frame: { state: MachineState | null; substate: string | null; now: number },
  procedure: Procedure,
): Progress {
  const { state, substate, now } = frame;
  if (state === null) {
    if (previous.phase !== 'waiting' && previous.phase !== 'running') return previous;
    return previous.stale ? previous : { ...previous, stale: true };
  }
  if (state === procedure.state) {
    const from = Math.max(previous.milestone, 0);
    const milestone = Math.max(from, procedure.milestoneFor(substate, from));
    if (previous.phase === 'running' && milestone === previous.milestone && !previous.stale) return previous;
    return { phase: 'running', milestone, since: previous.since, stale: false };
  }
  if (previous.phase === 'running') return { phase: 'done', milestone: procedure.milestones.length, since: previous.since, stale: false };
  if (previous.phase !== 'waiting') return previous.stale ? { ...previous, stale: false } : previous;
  if (now - previous.since >= START_TIMEOUT_MS) return { phase: 'timeout', milestone: -1, since: previous.since, stale: false };
  return previous.stale ? { ...previous, stale: false } : previous;
}

export const isActive = (progress: Progress) => progress.phase === 'waiting' || progress.phase === 'running';

/** A procedure the machine runs that this page did not start (on the machine itself, or before a reload) is joined. */
export const joined = (state: MachineState | null, procedure: Procedure, now: number): Progress =>
  state === procedure.state ? advance(started(now), { state, substate: null, now }, procedure) : IDLE;

export type Tone = 'info' | 'progress' | 'success' | 'error';

/** The line under the steps; null while nothing runs. */
export function caption(progress: Progress, procedure: Procedure): { text: string; tone: Tone } | null {
  if (progress.phase === 'idle') return null;
  if (progress.stale && isActive(progress)) return { text: 'Lost contact with the machine. Reconnecting…', tone: 'error' };
  switch (progress.phase) {
    case 'waiting':
      return { text: 'Starting', tone: 'info' };
    case 'running':
      return { text: procedure.milestones[progress.milestone] ?? '', tone: 'progress' };
    case 'done':
      return { text: procedure.ready, tone: 'success' };
    default:
      return { text: 'The machine did not start. Check that it is awake and connected.', tone: 'error' };
  }
}

/** Streamline refuses Start while the machine needs water. */
export const NEEDS_WATER =
  'Out of water: refill the tank, or press the stop button on the group head to override, then tap Start again.';

export const steamCoolEnough = (temperature: number | null | undefined) =>
  typeof temperature !== 'number' || !Number.isFinite(temperature) || temperature <= DESCALE_STEAM_MAX;
