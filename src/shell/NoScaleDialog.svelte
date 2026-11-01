<script lang="ts">
  // Decaid stopped a shot for want of a scale (`NoScale`): what happened, why, and what to do.
  // 'look for the scale' starts a round of scans, as the state line's scale warning does, and
  // closes it.
  import Dialog from '../ui/Dialog.svelte';

  interface Props {
    onfind: () => void;
    onclose: () => void;
  }

  let { onfind, onclose }: Props = $props();
</script>

<Dialog role="alertdialog" labelledby="no-scale-title" width="min(36rem, 90vw)" testid="no-scale-dialog" oncancel={onclose}>
  <div class="content">
    <h2 id="no-scale-title">The shot was stopped: no scale is connected.</h2>
    <p data-testid="no-scale-text">
      'scale required' is on in Settings &gt; Connections, so the machine stops every shot without a scale. Check that the scale is on
      and in range, then start again.
    </p>
    <div class="actions">
      <button class="action" data-testid="no-scale-close" onclick={onclose}>close</button>
      <button
        class="action primary"
        data-testid="no-scale-find"
        onclick={() => {
          onfind();
          onclose();
        }}>look for the scale</button
      >
    </div>
  </div>
</Dialog>

<style>
  .content {
    padding: var(--space-1) var(--space-3) var(--space-3);
  }

  h2 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--text-title);
    font-weight: 600;
  }

  p {
    margin: 0;
    color: var(--dim);
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
