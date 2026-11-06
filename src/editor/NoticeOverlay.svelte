<script lang="ts">
  import type { Notice } from './status';

  // A message over the top of the frame it stands in (the nearest positioned ancestor): it takes no
  // room, so nothing under it moves, and only its own box takes a tap, which closes it.
  interface Props {
    notice: Notice | null;
    onclose: () => void;
  }

  let { notice, onclose }: Props = $props();
</script>

<div class="overlay" role="status" data-testid="editor-status">
  {#if notice}
    <button
      class="box notice {notice.tone}"
      class:warning={notice.tone === 'warn'}
      data-testid="editor-notice"
      title={notice.text}
      onclick={onclose}
    >
      {notice.text}
    </button>
  {/if}
</div>

<style>
  .overlay {
    position: absolute;
    top: var(--space-1);
    left: var(--space-1);
    right: var(--space-1);
    display: flex;
    justify-content: center;
    pointer-events: none;
  }

  .box {
    max-width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--raised);
    box-shadow: var(--shadow-lifted);
    text-align: left;
    pointer-events: auto;
  }
</style>
