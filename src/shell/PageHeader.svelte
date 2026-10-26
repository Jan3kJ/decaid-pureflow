<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HeatTarget } from './machine';
  import Menu from './Menu.svelte';
  import type { Skin } from './skin.svelte';
  import StateLine from './StateLine.svelte';

  interface Props {
    skin: Skin;
    /** passed on to the state line */
    heat?: HeatTarget;
    /** the page's title at the right end; home has none */
    title?: string;
    /** what the page adds beside the state line, left of the right end */
    beside?: Snippet;
  }

  let { skin, heat, title, beside }: Props = $props();
</script>

<!-- One header for home, steam and hot water (spec 3.11, 3.14): the menu in the top left corner, the
     state line right of it, in the same place on each, and the page's title at the right end. -->
<header class="page-header">
  <Menu {skin} />
  <StateLine {skin} {heat} />
  {@render beside?.()}
  {#if title}
    <strong class="title" data-testid="page-title">{title}</strong>
  {/if}
</header>

<style>
  .page-header {
    display: flex;
    align-items: center;
    gap: 1.2rem;
    /* as tall as the menu button, so the state line sits at the same height on every page */
    min-height: 3.5rem;
  }

  .page-header > :global(.state) {
    flex: 1;
  }

  /* a name, like the state word: the profile name's size and weight (spec 3.14's roles) */
  .title {
    flex: none;
    font-size: var(--text-body);
    font-weight: 600;
    white-space: nowrap;
  }
</style>
