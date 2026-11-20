<script lang="ts">
  // The question before a load while the workflow holds a water volume of its own: only another
  // app sets it, and it replaces the loaded profile's target volume when a shot runs without a
  // scale. Nothing is loaded before one of its three answers (`LoadWarning.ask`).
  import Dialog from '../ui/Dialog.svelte';
  import type { VolumeAnswer } from './load-warning.svelte';

  interface Props {
    /** ml; 0 is a volume stop that is off */
    volume: number;
    onanswer: (answer: VolumeAnswer) => void;
  }

  let { volume, onanswer }: Props = $props();
</script>

<Dialog
  role="alertdialog"
  labelledby="volume-text"
  width="min(36rem, 90vw)"
  testid="volume-dialog"
  oncancel={() => onanswer('cancel')}
>
  <div class="content">
    <p id="volume-text">
      The machine holds a water volume of its own: <strong data-testid="volume-value">{volume ? `${volume} ml` : 'off'}</strong>
    </p>
    <p class="hint">
      Another app set it. Without a scale it replaces the volume of the profile you load. Clear it to use the profile's own.
    </p>
    <div class="actions">
      <button data-testid="volume-clear" onclick={() => onanswer('clear')}>clear it</button>
      <button data-testid="volume-keep" onclick={() => onanswer('keep')}>keep it</button>
      <button data-testid="volume-cancel" onclick={() => onanswer('cancel')}>cancel</button>
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
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }
</style>
