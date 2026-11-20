// The warnings before a load: while the machine holds unsaved edits from the editor, and while
// the workflow holds a water volume of its own, a load waits for the user's answer. A part of
// `Skin`, which hands `mayLoad`, `answerLoad` and `answerVolume` to it.
import type { DecaidClient } from '../api';
import { readUnsaved, type Unsaved } from '../editor/unsaved';

/** The answer to the warning before a load. */
export type LoadAnswer = 'load' | 'cancel' | 'save-as';

/** The answer to the question about the workflow's own water volume. */
export type VolumeAnswer = 'clear' | 'keep' | 'cancel';

export class LoadWarning {
  /** the unsaved edits the warning asks about, while it is open */
  unsaved: Unsaved | null = $state.raw(null);
  /** the workflow's own water volume in ml, while the question about it is open */
  volume: number | null = $state(null);
  private answerUnsaved: ((answer: LoadAnswer) => void) | null = null;
  private answerVolumeNow: ((answer: VolumeAnswer) => void) | null = null;
  /** the volume the user chose to keep: it is not asked about again while it is the same */
  private kept: number | null = null;
  private readonly client: DecaidClient;

  constructor(client: DecaidClient) {
    this.client = client;
  }

  /**
   * Asked before every load of the skin: while the machine holds unsaved edits from the editor
   * (`readUnsaved`), the warning is shown and nothing is loaded before its answer. 'load' when
   * there are none, or when they could not be read: the load then says what went wrong.
   * 'save-as' leaves the opening of the editor's save as to the caller. Then the water volume
   * is asked about (`askVolume`).
   */
  async ask(): Promise<LoadAnswer> {
    let unsaved: Unsaved | null;
    try {
      unsaved = await readUnsaved(this.client);
    } catch {
      return 'load';
    }
    if (unsaved) {
      this.unsaved = unsaved;
      const answer = await new Promise<LoadAnswer>((resolve) => (this.answerUnsaved = resolve));
      this.unsaved = null;
      this.answerUnsaved = null;
      if (answer !== 'load') return answer;
    }
    return (await this.askVolume()) ? 'load' : 'cancel';
  }

  /**
   * The workflow's `targetWaterVolume` is the water volume that stops a shot without a scale; any
   * value but null, 0 included, replaces the loaded profile's target volume. Only another app sets
   * it, so a value is asked about before a load: 'clear' sets it to null, so that the profile's
   * own volume counts; 'keep' leaves it, and the question is not asked again for that value.
   * False when the user cancels. A value that cannot be read or cleared does not stop the load.
   */
  private async askVolume(): Promise<boolean> {
    let volume: number | null | undefined;
    try {
      volume = (await this.client.getWorkflow()).context?.targetWaterVolume;
    } catch {
      return true;
    }
    if (volume === null || volume === undefined) {
      this.kept = null;
      return true;
    }
    if (volume === this.kept) return true;
    this.volume = volume;
    const answer = await new Promise<VolumeAnswer>((resolve) => (this.answerVolumeNow = resolve));
    this.volume = null;
    this.answerVolumeNow = null;
    if (answer === 'cancel') return false;
    if (answer === 'keep') {
      this.kept = volume;
      return true;
    }
    try {
      await this.client.updateWorkflow({ context: { targetWaterVolume: null } });
    } catch {
      // the load goes on; the question comes again with the next one
    }
    return true;
  }

  /** The warning's buttons. */
  answer(answer: LoadAnswer): void {
    this.answerUnsaved?.(answer);
  }

  /** The water volume question's buttons. */
  answerVolume(answer: VolumeAnswer): void {
    this.answerVolumeNow?.(answer);
  }
}
