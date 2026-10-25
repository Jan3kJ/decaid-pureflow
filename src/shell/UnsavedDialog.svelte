<script lang="ts">
  // The warning before a load while the machine holds unsaved edits from the editor (founder,
  // 2026-10-14). Nothing is loaded before one of its three answers (`Skin.mayLoad`).
  import { startName } from '../editor/start';
  import type { Unsaved } from '../editor/unsaved';
  import type { LoadAnswer } from './load-warning.svelte';

  interface Props {
    unsaved: Unsaved;
    onanswer: (answer: LoadAnswer) => void;
  }

  let { unsaved, onanswer }: Props = $props();
</script>

<svelte:window onkeydown={(e: KeyboardEvent) => e.key === 'Escape' && onanswer('cancel')} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={(e) => e.target === e.currentTarget && onanswer('cancel')}>
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="unsaved-text" data-testid="unsaved-dialog">
    <p id="unsaved-text">
      <strong data-testid="unsaved-name">{startName(unsaved.title)}</strong>
      has unsaved changes on the machine
    </p>
    <p class="hint">Loading another profile replaces them.</p>
    <div class="actions">
      <button data-testid="unsaved-save-as" onclick={() => onanswer('save-as')}>Save as…</button>
      <button class="discard" data-testid="unsaved-discard" onclick={() => onanswer('load')}>Discard and load</button>
      <button data-testid="unsaved-cancel" onclick={() => onanswer('cancel')}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(0 0 0 / 55%);
  }

  .dialog {
    width: min(36rem, 90vw);
    box-sizing: border-box;
    padding: 1.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 1.2rem;
    box-shadow: 0 0.6rem 2.4rem rgb(0 0 0 / 70%);
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

  .hint {
    font-size: var(--text-label);
    color: var(--dim);
  }

  .actions {
    margin-top: 0.6rem;
    display: flex;
    gap: 0.6rem;
  }

  button {
    flex: 1;
    min-height: 3.5rem;
    font: inherit;
    font-size: var(--text-body);
    color: var(--fg);
    background: var(--raised);
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    touch-action: manipulation;
  }

  .discard {
    color: var(--warn);
    border-color: var(--warn);
  }
</style>
