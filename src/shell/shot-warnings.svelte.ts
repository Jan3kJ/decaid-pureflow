// Two warnings from Decaid's shot feed during a shot, each shown once per shot:
// - the scale lost while a shot with a target weight pours (`scaleLostWhilePouring`): Decaid's
//   stop at the weight is off for the rest of the shot, even when the scale comes back, so the
//   notice stays on every screen until the shot ends;
// - the shot ended abnormally (`abnormalEnd`): a popup with Decaid's words for it, or the
//   skin's own when it has none. What the skin keeps of the shot does not change.
import { abnormalEnd, scaleLostWhilePouring, type AbnormalEnd, type ShotStateFrame } from '../api';

/** the notice while the scale is lost: the wording is the default, the founder changes it here */
export const SCALE_LOST_NOTICE = 'The scale was lost: stop at weight is off for the rest of this shot. Stop it by hand.';

/** The popup's sentence for an abnormal end: Decaid's words when it has them, else the reason's. */
export function abnormalText(end: AbnormalEnd): string {
  if (end.details === null) {
    return end.reason === 'disconnected'
      ? "The shot ended abnormally: the machine's connection was lost."
      : 'The shot ended abnormally.';
  }
  const details = end.details.trim();
  return `The shot ended abnormally: ${details}${/[.!?]$/.test(details) ? '' : '.'}`;
}

/** the shot a frame names, so that a frame without an id still counts as one shot */
type ShotKey = string | null;
const NONE = Symbol('none');

export class ShotWarnings {
  /** the notice that the scale was lost is shown */
  scaleLost = $state(false);
  /** the popup's sentence for an abnormal end while it is open; null when closed */
  abnormal: string | null = $state(null);

  /** the shot the notice was shown for; `NONE` before the first */
  private lostFor: ShotKey | typeof NONE = NONE;
  /** the shot the popup was shown for; `NONE` before the first */
  private endedFor: ShotKey | typeof NONE = NONE;

  /** A frame of the shot's feed; `targetYield` is the workflow's, in g (0 or null: no target weight). */
  frame(frame: ShotStateFrame, targetYield: number | null | undefined): void {
    const end = abnormalEnd(frame);
    if (end !== null) {
      this.scaleLost = false;
      if (this.endedFor !== frame.shotId) {
        this.endedFor = frame.shotId;
        this.abnormal = abnormalText(end);
      }
      return;
    }
    if (scaleLostWhilePouring(frame) && (targetYield ?? 0) > 0) {
      if (this.lostFor !== frame.shotId) {
        this.lostFor = frame.shotId;
        this.scaleLost = true;
      }
      return;
    }
    // The shot's end, or a frame of another shot: the notice goes.
    const ended = frame.state === 'finished' || frame.state === 'idle';
    if (ended || (frame.shotId !== null && frame.shotId !== this.lostFor)) this.scaleLost = false;
  }

  /** The skin's own shot ended, as the machine says: the notice goes, if the feed has not said so yet. */
  shotEnded(): void {
    this.scaleLost = false;
  }

  /** The popup's 'close', Escape and a tap beside it. */
  closeAbnormal(): void {
    this.abnormal = null;
  }
}
