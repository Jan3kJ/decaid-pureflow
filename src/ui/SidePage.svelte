<script lang="ts">
  import type { Snippet } from 'svelte';

  // A page with a header over its main frame and a column at the right: steam and hot water.
  interface Props {
    header: Snippet;
    /** one element: the page's main frame, left under the header */
    main: Snippet;
    /** the column's values, buttons and notices */
    children: Snippet;
    /** shown: the big stop at the column's foot */
    onstop?: () => void;
    stopTestid?: string;
  }

  let { header, main, children, onstop, stopTestid }: Props = $props();
</script>

<div class="side-page">
  <div class="header">
    {@render header()}
  </div>

  {@render main()}

  <aside>
    {@render children()}

    {#if onstop}
      <button class="stop big-stop" data-testid={stopTestid} onclick={onstop}>stop</button>
    {/if}
  </aside>
</div>

<style>
  .side-page {
    height: 100%;
    box-sizing: border-box;
    /* home's padding, so the header is in the same place */
    padding: 0.8rem var(--space-3) 1rem;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 21rem;
    grid-template-rows: auto minmax(0, 1fr);
    gap: var(--space-2) var(--space-3);
  }

  /* the header over both columns; the main frame and the column take the second row in order */
  .header {
    grid-column: 1 / -1;
    min-width: 0;
  }

  aside {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .stop {
    margin-top: auto;
    min-height: 6rem;
    font-size: var(--text-large);
  }
</style>
