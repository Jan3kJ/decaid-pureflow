// The warning before a load: while the machine holds unsaved edits from the editor, a load
// waits for the user's answer. A part of `Skin`, which hands `mayLoad` and `answerLoad` to it.
import type { DecaidClient } from '../api';
import { readUnsaved, type Unsaved } from '../editor/unsaved';

/** The answer to the warning before a load. */
export type LoadAnswer = 'load' | 'cancel' | 'save-as';

export class LoadWarning {
  /** the unsaved edits the warning asks about, while it is open */
  unsaved: Unsaved | null = $state.raw(null);
  private answerUnsaved: ((answer: LoadAnswer) => void) | null = null;
  private readonly client: DecaidClient;

  constructor(client: DecaidClient) {
    this.client = client;
  }

  /**
   * Asked before every load of the skin: while the machine holds unsaved edits from the editor
   * (`readUnsaved`), the warning is shown and nothing is loaded before its answer. 'load' when
   * there are none, or when they could not be read: the load then says what went wrong.
   * 'save-as' leaves the opening of the editor's save as to the caller.
   */
  async ask(): Promise<LoadAnswer> {
    let unsaved: Unsaved | null;
    try {
      unsaved = await readUnsaved(this.client);
    } catch {
      return 'load';
    }
    if (!unsaved) return 'load';
    this.unsaved = unsaved;
    const answer = await new Promise<LoadAnswer>((resolve) => (this.answerUnsaved = resolve));
    this.unsaved = null;
    this.answerUnsaved = null;
    return answer;
  }

  /** The warning's buttons. */
  answer(answer: LoadAnswer): void {
    this.answerUnsaved?.(answer);
  }
}
