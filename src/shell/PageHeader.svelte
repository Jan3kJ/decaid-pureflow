<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HeatTarget } from './machine';
  import type { Skin } from './skin.svelte';
  import StateLine from './StateLine.svelte';

  interface Props {
    skin: Skin;
    /** passed on to the state line */
    heat?: HeatTarget;
    /** the page's title at the right end; home has none and puts its menu there */
    title?: string;
    /** what the page adds beside the state line, left of the right end */
    beside?: Snippet;
    /** the right end in place of a title */
    end?: Snippet;
  }

  let { skin, heat, title, beside, end }: Props = $props();
</script>

<!-- One header for home, steam and hot water (spec 3.11): the state line first, in the same place on each,
     and the page's own mark at the right end. -->
<header class="page-header">
  <StateLine {skin} {heat} />
  {@render beside?.()}
  {#if title}
    <strong class="title" data-testid="page-title">{title}</strong>
  {/if}
  {@render end?.()}
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    /* as tall as home's menu button, so the state line sits at the same height on every page */
    min-height: 3.5rem;
  }

  .page-header > :global(.state) {
    flex: 1;
  }

  .title {
    flex: none;
    font-size: var(--text-title);
    font-weight: 600;
    white-space: nowrap;
  }
</style>
