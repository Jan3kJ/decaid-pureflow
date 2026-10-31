<script lang="ts">
  // The warning before a load while the machine holds unsaved edits from the editor.
  // Nothing is loaded before one of its three answers (`Skin.mayLoad`).
  import { startName } from '../editor/start';
  import type { Unsaved } from '../editor/unsaved';
  import Dialog from '../ui/Dialog.svelte';
  import type { LoadAnswer } from './load-warning.svelte';

  interface Props {
    unsaved: Unsaved;
    onanswer: (answer: LoadAnswer) => void;
  }

  let { unsaved, onanswer }: Props = $props();
</script>

<Dialog
  role="alertdialog"
  labelledby="unsaved-text"
  width="min(36rem, 90vw)"
  testid="unsaved-dialog"
  oncancel={() => onanswer('cancel')}
>
  <div class="content">
    <p id="unsaved-text">
      <strong data-testid="unsaved-name">{startName(unsaved.title)}</strong>
      has unsaved changes on the machine
    </p>
    <p class="hint">Loading another profile replaces them.</p>
    <div class="actions">
      <button data-testid="unsaved-save-as" onclick={() => onanswer('save-as')}>save as…</button>
      <button class="danger" data-testid="unsaved-discard" onclick={() => onanswer('load')}>discard and load</button>
      <button data-testid="unsaved-cancel" onclick={() => onanswer('cancel')}>cancel</button>
    </div>
  </div>
</Dialog>

<style>
  .content {
    padding: 1.4rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  p {
    margin: 0;
    font-size: var(--text-title);
    color: var(--fg);
  }

  strong {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .actions {
    margin-top: var(--space-2);
    display: flex;
    gap: var(--space-2);
  }

  button {
    flex: 1;
    min-height: var(--control-big);
    font-size: var(--text-body);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
</style>
