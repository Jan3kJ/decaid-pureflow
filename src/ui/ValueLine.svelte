<script lang="ts">
  import type { Snippet } from 'svelte';

  // A line of a page's column: the caption at the left, the number and its unit at the right. The
  // unit column has one width, so the numbers of the lines end on one edge.
  interface Props {
    label: string;
    /** the number without its unit; null shows a dash */
    value: string | null;
    unit?: string;
    /** the number's colour: a weight's, or grey for a setting rather than a reading */
    tone?: 'weight' | 'setting';
    /** on the number and its unit */
    testid: string;
    /** a tap: the whole line is the button, a finger's target */
    onclick?: () => void;
    disabled?: boolean;
    buttonTestid?: string;
    /** after the caption, centred with it */
    children?: Snippet;
    /** the caption on the number's baseline and the number in the font's own line height (hot water) */
    baseline?: boolean;
  }

  let {
    label,
    value,
    unit = 'g',
    tone,
    testid,
    onclick,
    disabled = false,
    buttonTestid,
    children,
    baseline = false,
  }: Props = $props();
</script>

{#snippet line()}
  <span class="key">{label}{@render children?.()}</span>
  <span class="reading {tone}" data-testid={testid}>
    {#if value === null}<b>–</b> <i></i>{:else}<b>{value}</b> <i>{unit}</i>{/if}
  </span>
{/snippet}

{#if onclick}
  <button class="line" class:baseline data-testid={buttonTestid} {disabled} {onclick}>{@render line()}</button>
{:else}
  <div class="line" class:baseline>{@render line()}</div>
{/if}

<style>
  .line {
    /* the number's line height, which a badge beside the caption is as high as */
    --number-line: 1.2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto 1.6rem;
    align-items: baseline;
    column-gap: var(--space-1);
    padding: 0 0.6rem 0 1rem;
    border: 1px solid transparent;
    text-align: left;
  }

  button.line {
    min-height: var(--control-big);
    align-content: center;
    background: none;
    border-color: var(--edge);
    border-radius: var(--radius);
  }

  /* the numbers and units share a baseline; the caption is centred against the number */
  .key {
    align-self: center;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--dim);
    font-size: var(--text-label);
  }

  .baseline .key {
    align-self: auto;
  }

  .baseline b {
    line-height: normal;
  }

  .reading {
    display: contents;
  }

  b {
    justify-self: end;
    font-size: var(--text-title);
    font-weight: 300;
    line-height: var(--number-line);
    font-variant-numeric: tabular-nums;
  }

  i {
    margin-left: 0.2em;
    font-style: normal;
    font-size: var(--text-label);
    font-weight: 400;
    color: var(--dim);
  }

  .weight b {
    color: var(--weight);
    text-shadow: var(--shadow-glow-weight);
  }

  /* off while something runs */
  button.line:disabled b,
  .setting b {
    color: var(--dim);
  }
</style>
