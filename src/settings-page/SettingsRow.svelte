<script lang="ts">
  // One row of the settings page: its name and hint on the left, its control on the right. Every
  // row of the page is this one; the control comes as children and takes the looks below: a value
  // read from the machine (a `b` straight in the row), the value field that opens the number pad
  // (`.value`, its number `b` and the unit `i` after a number).
  import type { Snippet } from 'svelte';

  interface Props {
    /** the setting's name, bold */
    label?: string | Snippet;
    /** the small grey line under the name */
    hint?: string | Snippet;
    /** the name and the hint are not the skin's words (a plugin's, a schedule's): they keep their case */
    named?: boolean;
    /** more small lines under the hint: a state, a warning */
    about?: Snippet;
    /** the control, at the right */
    children?: Snippet;
    /**
     * the spacing: a setting's (by default); `tight`, read values and their actions, as tall as a
     * tall control; `skin`, the skin's own rows, spaced as its switch rows; `lead`, a row that
     * heads the fields under it
     */
    spacing?: 'tight' | 'skin' | 'lead';
    /** the controls at the right end: a row of buttons only */
    end?: boolean;
    /** a write of the row's setting is in flight */
    busy?: boolean;
    testid?: string;
    /** the test id of the name */
    labelTestid?: string;
  }

  let { label, hint, named = false, about, children, spacing, end = false, busy = false, testid, labelTestid }: Props = $props();
</script>

{#snippet text(part: string | Snippet)}{#if typeof part === 'string'}{part}{:else}{@render part()}{/if}{/snippet}

{#snippet name()}
  {#if label !== undefined}<strong class:name={named} data-testid={labelTestid}>{@render text(label)}</strong>{/if}
{/snippet}

<div
  class="row"
  class:tight={spacing === 'tight'}
  class:skin={spacing === 'skin'}
  class:lead={spacing === 'lead'}
  class:end
  class:busy
  data-testid={testid}
>
  {#if hint || about}
    <div class="about">
      {@render name()}
      {#if hint}<small class:name={named}>{@render text(hint)}</small>{/if}
      {@render about?.()}
    </div>
  {:else}
    {@render name()}
  {/if}
  {@render children?.()}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-top: 1px solid var(--edge);
  }

  .tight {
    min-height: var(--control-tall);
    padding: var(--space-1) 0;
  }

  .skin {
    padding: 0.8rem 0;
  }

  .lead {
    padding: 0.8rem 0 var(--space-1);
  }

  .end {
    justify-content: flex-end;
  }

  .busy {
    opacity: 0.6;
  }

  .about {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  /* `:where` keeps these below a component's own rule, which may add to them. */
  :where(.row, .about) > :global(strong) {
    font-size: var(--text-body);
    font-weight: 600;
  }

  :where(.about) > :global(small) {
    color: var(--dim);
    font-size: var(--text-label);
  }

  :where(.row) > :global(b) {
    font-weight: 400;
    color: var(--dim);
    overflow-wrap: anywhere;
    text-align: right;
  }

  :where(.row) :global(.value) {
    flex: none;
    min-width: 8rem;
    min-height: var(--control-big);
    padding: 0 0.8rem;
    background: none;
    border: 1px solid var(--edge);
    border-radius: var(--radius);
  }

  :where(.row) :global(.value b) {
    font-size: var(--text-value);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  :where(.row) :global(b > i) {
    margin-left: 0.25em;
    font-style: normal;
    font-size: var(--text-label);
    font-weight: 400;
    color: var(--dim);
  }
</style>
