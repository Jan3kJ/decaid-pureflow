// Why the finished shot on home stopped: one line under its time and weight, from the stop
// frame of Decaid's shot sequencer (`stopReason`). The line belongs to the shot the skin
// followed when the frame came, kept by the time it entered espresso; the skin drops it when the
// next shot starts. A shot read from the history, or the newest record after a reload, has none: the
// record does not hold the reason, and it is not guessed from the numbers. Pure.
import { stopReason, type ShotStateFrame, type StopReason } from '../api';
import type { Shot } from './shot';

/** the line for each reason: the wording is the default, the founder changes it here */
export const STOP_LINES: Record<StopReason, string> = {
  targetWeight: 'stopped at the target weight',
  targetVolume: 'stopped at the target volume',
  apiStop: 'stopped by hand',
  appStop: 'stopped by hand',
  machineEnded: 'ended by the machine',
};

/** why a shot stopped, and which shot */
export interface StopMark {
  /** ms, the shot's `enteredAt`: the skin's own shot the frame came in */
  enteredAt: number;
  /** the sequencer's id of the shot, the shot record's */
  shotId: string | null;
  reason: StopReason;
}

/**
 * The mark after a frame of the feed, while the skin follows `shot`. The first stop of a shot
 * is its reason: a later stop frame of the same shot changes nothing. A frame of another shot
 * that preheats or pours drops the mark, as a new shot of the skin's own does in `stopLine`.
 */
export function markStop(mark: StopMark | null, frame: ShotStateFrame, shot: Shot | null): StopMark | null {
  const another = frame.shotId !== null && mark !== null && mark.shotId !== null && frame.shotId !== mark.shotId;
  if (another && (frame.state === 'preheating' || frame.state === 'pouring')) mark = null;
  const reason = stopReason(frame);
  if (reason === null || shot === null || mark?.enteredAt === shot.enteredAt) return mark;
  return { enteredAt: shot.enteredAt, shotId: frame.shotId, reason };
}

/** The line under the finished shot `shot`; null while it runs, without a mark or for another shot. */
export function stopLine(mark: StopMark | null, shot: Shot | null): string | null {
  if (mark === null || shot === null || !shot.ended || shot.enteredAt !== mark.enteredAt) return null;
  return STOP_LINES[mark.reason];
}
