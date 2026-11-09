<script lang="ts">
  // A modal over the page: the scrim behind it, the dialog's frame (corner, shadow, panel) and
  // Escape, a tap on the scrim beside the frame alike, to cancel. The frame is the `role="dialog"`
  // that src/viewport.ts lifts above the keyboard with the field in it, and that src/shell/swipe.ts
  // leaves unswiped, as the scrim. The content brings its own padding and layout; a pad's own keys
  // (digits, arrows) stay in the pad. Escape reaches only the dialog on top: a number pad opened
  // from a dialog takes it first.
  import type { Snippet } from 'svelte';

  interface Props {
    /** the dialog's name for a screen reader, unless `labelledby` names an element in it */
    label?: string;
    labelledby?: string;
    /** 'alertdialog' for a question before something that cannot be undone */
    role?: 'dialog' | 'alertdialog';
    /** the frame's width, a CSS length; else the content's */
    width?: string;
    /** the frame's highest, a CSS length; it scrolls past it */
    maxHeight?: string;
    /** near the top of the screen, not in its middle: a field in it, the tablet's keyboard covers the lower half */
    top?: boolean;
    /** the frame fills the viewport, with no corner, border or gap: the content lays itself out in it */
    fill?: boolean;
    testid?: string;
    /** the scrim's test id */
    backdrop?: string;
    oncancel: () => void;
    children: Snippet;
  }

  let {
    label,
    labelledby,
    role = 'dialog',
    width = 'auto',
    maxHeight = '96%',
    top = false,
    fill = false,
    testid,
    backdrop,
    oncancel,
    children,
  }: Props = $props();

  let frame: HTMLDivElement | undefined = $state();

  function keydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !frame) return;
    const open = document.querySelectorAll('[aria-modal="true"]');
    if (open[open.length - 1] !== frame) return;
    event.preventDefault();
    oncancel();
  }
</script>

<svelte:window onkeydown={keydown} />

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" class:top data-no-swipe data-testid={backdrop} onclick={(e) => e.target === e.currentTarget && oncancel()}>
  <div
    class="dialog"
    bind:this={frame}
    {role}
    aria-modal="true"
    aria-label={label}
    aria-labelledby={labelledby}
    class:fill
    data-testid={testid}
    style:width={fill ? '100vw' : width}
    style:max-height={fill ? 'none' : maxHeight}
  >
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--layer-dialog);
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--scrim);
    /* an overlay is the one place a page lies behind the glass */
    backdrop-filter: blur(0.4rem);
  }

  .backdrop.top {
    align-items: flex-start;
    padding-top: 4rem;
  }

  .dialog {
    box-sizing: border-box;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    background: var(--overlay);
    border: 1px solid var(--edge);
    border-radius: var(--radius-dialog);
    box-shadow: var(--shadow-glass);
  }

  .dialog.fill {
    position: relative;
    height: 100vh;
    overflow: hidden;
    border: 0;
    --radius-dialog: 0;
  }
</style>
