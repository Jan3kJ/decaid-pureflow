<script lang="ts">
  // The shot ended abnormally (`ShotWarnings`): Decaid's words for it, or the skin's own, and
  // one button to close it.
  import Dialog from '../ui/Dialog.svelte';

  interface Props {
    text: string;
    onclose: () => void;
  }

  let { text, onclose }: Props = $props();
</script>

<Dialog role="alertdialog" labelledby="abnormal-end-text" width="min(36rem, 90vw)" testid="abnormal-end-dialog" oncancel={onclose}>
  <div class="content">
    <h2 id="abnormal-end-text" data-testid="abnormal-end-text">{text}</h2>
    <div class="actions">
      <button class="action primary" data-testid="abnormal-end-close" onclick={onclose}>close</button>
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
    overflow-wrap: anywhere;
  }

  .actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
  }
</style>
