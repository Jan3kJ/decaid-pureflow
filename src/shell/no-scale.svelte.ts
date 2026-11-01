// The popup for a shot Decaid stopped for want of a scale. With its setting 'scale required'
// (`blockOnNoScale`) on and no scale connected, Decaid stops every shot at once, and says so in
// three ways, each of which opens the popup:
// - its shot sequencer sends an abort for 'noScale' on `/ws/v1/machine/shotState`;
// - a start by REST (`PUT /api/v1/machine/state/espresso`) is answered 400 `block_no_scale`;
// - in gateway mode 'full' it runs no sequencer and says neither: an espresso that lasted
//   under `SHORT_ESPRESSO_MS` without a scale, with the setting on, is taken as one, as
//   Streamline does.
// One blocked start can say it twice (the frame and the short espresso): what comes within
// `ONE_START_MS` of a popup, for the same shot, is the same start.
import { isNoScaleAbort, isNoScaleBlock, type MachineSnapshot, type MachineState, type ShotStateFrame } from '../api';
import { frameTime } from './shot';

/** ms: an espresso shorter than this, without a scale and with the setting on, was a blocked start */
export const SHORT_ESPRESSO_MS = 3000;
/** ms: a second word of a blocked start within this time of the popup is the same start */
export const ONE_START_MS = 5000;

export interface NoScaleDeps {
  /** the scale stream says a scale is connected */
  scaleConnected(): boolean;
  /** Decaid's setting 'scale required'; false when it cannot be read */
  blockOnNoScale(): Promise<boolean>;
  /** ms, the clock of the popup's window; default `Date.now` */
  now?(): number;
}

export class NoScale {
  /** the popup is open */
  open = $state(false);

  private readonly deps: NoScaleDeps;
  /** when the last popup was opened, by `now()`; null before the first */
  private shownAt: number | null = null;
  /** the shot id of the frame that opened it; null for the REST answer and the short espresso */
  private shownFor: string | null = null;
  /** ms, the frame time the machine entered espresso; null outside an espresso */
  private espressoFrom: number | null = null;

  constructor(deps: NoScaleDeps) {
    this.deps = deps;
  }

  /** A frame of the shot's feed. */
  frame(frame: ShotStateFrame): void {
    if (isNoScaleAbort(frame)) this.show(frame.shotId);
  }

  /** A state request failed: true when Decaid refused it for want of a scale, and the popup says so. */
  refused(error: unknown): boolean {
    if (!isNoScaleBlock(error)) return false;
    this.show(null);
    return true;
  }

  /** A frame of the machine stream, after one in the state `before`: the short espresso. */
  machine(frame: MachineSnapshot, before: MachineState | undefined): void {
    const state = frame.state.state;
    const at = frameTime(frame.timestamp);
    if (state === 'espresso') {
      if (before !== 'espresso' || this.espressoFrom === null) this.espressoFrom = at;
      return;
    }
    const from = this.espressoFrom;
    this.espressoFrom = null;
    if (before !== 'espresso' || from === null || !(at - from < SHORT_ESPRESSO_MS)) return;
    if (this.deps.scaleConnected()) return;
    void this.deps.blockOnNoScale().then(
      (on) => {
        if (on) this.show(null);
      },
      () => undefined,
    );
  }

  close(): void {
    this.open = false;
  }

  private show(shotId: string | null): void {
    if (this.open) return;
    const now = (this.deps.now ?? Date.now)();
    const another = shotId !== null && this.shownFor !== null && shotId !== this.shownFor;
    if (this.shownAt !== null && now - this.shownAt < ONE_START_MS && !another) return;
    this.shownAt = now;
    this.shownFor = shotId;
    this.open = true;
  }
}
