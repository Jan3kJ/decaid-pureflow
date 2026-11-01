// The shot's feed `/ws/v1/machine/shotState`: Decaid's shot sequencer says on it what phase the
// shot is in and why it advanced, stopped or was refused. One reader of its frames, so every part
// of the skin reads a frame the same way. Decaid's own frame on the rig, a shot refused for want
// of a scale:
// {"event":"decision","shotId":"…","state":"idle","machineState":"espresso",
//  "machineSubstate":"preparingForShot","profileFrame":0,"scaleConnected":false,"scaleLost":false,
//  "machineHasAutonomousSAW":false,
//  "decision":{"kind":"abort","reason":"noScale","details":"No scale connected, blocking shot","data":null}}

/** 'state' for a change of phase, 'decision' for a step or a stop, 'terminal' for an abnormal end */
export type ShotStateEvent = 'state' | 'decision' | 'terminal';

/** the shot's phase as the sequencer tracks it */
export type ShotPhase = 'idle' | 'preheating' | 'pouring' | 'stopping' | 'finished';

/**
 * Why the sequencer acted. `kind` is one of advance, stop, abort (refused before it ran),
 * terminal and finalize; `reason` one of targetWeight, targetVolume, apiStop, appStop,
 * machineEnded, profileAdvance, profileSkip, noScale, error, disconnected, stoppingBackstop.
 * Both are open sets: a newer Decaid may send others, so they stay strings.
 */
export interface ShotDecision {
  kind: string;
  reason: string;
  /** Decaid's own words for it, in English; null without */
  details: string | null;
  /** numbers for the reason, as `projectedWeight` for a stop at weight; null without */
  data: Record<string, unknown> | null;
}

/** A frame of the feed, as far as the skin reads it. */
export interface ShotStateFrame {
  event: ShotStateEvent;
  /** the shot's id, the shot record's when it is saved; null between shots */
  shotId: string | null;
  state: ShotPhase;
  scaleConnected: boolean;
  /** the scale dropped during this shot; it stays true to the shot's end */
  scaleLost: boolean;
  /** the machine stops at the weight by itself (a Bengle) */
  machineHasAutonomousSAW: boolean;
  /** on a decision or a terminal frame only */
  decision: ShotDecision | null;
}

export const MACHINE_SHOT_STATE_PATH = '/ws/v1/machine/shotState';

const EVENTS: readonly string[] = ['state', 'decision', 'terminal'];
const PHASES: readonly string[] = ['idle', 'preheating', 'pouring', 'stopping', 'finished'];

/**
 * Reads a frame of the feed; null for what is not one (an error frame, a frame without an
 * event or a phase the skin knows). A missing flag reads as false, a missing id as null.
 */
export function readShotState(raw: unknown): ShotStateFrame | null {
  if (!isRecord(raw)) return null;
  const { event, state } = raw;
  if (typeof event !== 'string' || !EVENTS.includes(event)) return null;
  if (typeof state !== 'string' || !PHASES.includes(state)) return null;
  return {
    event: event as ShotStateEvent,
    shotId: typeof raw.shotId === 'string' ? raw.shotId : null,
    state: state as ShotPhase,
    scaleConnected: raw.scaleConnected === true,
    scaleLost: raw.scaleLost === true,
    machineHasAutonomousSAW: raw.machineHasAutonomousSAW === true,
    decision: readDecision(raw.decision),
  };
}

function readDecision(raw: unknown): ShotDecision | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string' || typeof raw.reason !== 'string') return null;
  return {
    kind: raw.kind,
    reason: raw.reason,
    details: typeof raw.details === 'string' && raw.details !== '' ? raw.details : null,
    data: isRecord(raw.data) ? raw.data : null,
  };
}

/** Decaid refused the shot for want of a scale: its setting 'scale required' is on and no scale is connected. */
export function isNoScaleAbort(frame: ShotStateFrame | null): boolean {
  return frame?.decision?.kind === 'abort' && frame.decision.reason === 'noScale';
}

/** The reasons a shot stopped that home names (`stopReason`). */
export type StopReason = 'targetWeight' | 'targetVolume' | 'apiStop' | 'appStop' | 'machineEnded';

const STOP_REASONS: readonly string[] = ['targetWeight', 'targetVolume', 'apiStop', 'appStop', 'machineEnded'];

/**
 * Why the sequencer stopped the frame's shot: the reason of a decision of kind stop or abort,
 * when it is one home names; null for any other frame. A shot refused for want of a scale has
 * its popup instead. The rig's frame for a stop at the target weight:
 * {"event":"decision","shotId":"…","state":"stopping",…,
 *  "decision":{"kind":"stop","reason":"targetWeight","details":"Target weight 10.0g reached …","data":{…}}}
 */
export function stopReason(frame: ShotStateFrame | null): StopReason | null {
  const decision = frame?.decision;
  if (!decision || (decision.kind !== 'stop' && decision.kind !== 'abort')) return null;
  return STOP_REASONS.includes(decision.reason) ? (decision.reason as StopReason) : null;
}

/**
 * The scale dropped while the frame's shot pours, on a machine that stops at the weight only
 * by the scale (not a Bengle): Decaid's stop at the weight is off for the rest of the shot,
 * even when the scale comes back. The feed sends no frame of its own for it: on the rig the
 * next frame of the shot, a step's advance, was the first to say `scaleLost`. Whether the shot
 * has a target weight is the workflow's, not the frame's.
 */
export function scaleLostWhilePouring(frame: ShotStateFrame | null): boolean {
  return frame !== null && frame.scaleLost && frame.state === 'pouring' && !frame.machineHasAutonomousSAW;
}

/** How a shot ended abnormally: Decaid lost the machine (`disconnected`), or something else went wrong (`error`). */
export interface AbnormalEnd {
  reason: 'disconnected' | 'error';
  /** Decaid's own words for it; null without */
  details: string | null;
}

/**
 * The frame ends its shot abnormally: an event 'terminal', or a decision of kind 'terminal'.
 * Its reason is `disconnected` or `error`; any other reason a newer Decaid sends reads as an
 * error. Null for any other frame. The rig's frame for the machine's connection cut mid-shot:
 * {"event":"terminal","shotId":"…","state":"pouring",…,
 *  "decision":{"kind":"terminal","reason":"disconnected","details":"Shot tracking torn down mid-shot","data":null}}
 */
export function abnormalEnd(frame: ShotStateFrame | null): AbnormalEnd | null {
  if (frame === null || (frame.event !== 'terminal' && frame.decision?.kind !== 'terminal')) return null;
  const reason = frame.decision?.reason === 'disconnected' ? 'disconnected' : 'error';
  return { reason, details: frame.decision?.details ?? null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
