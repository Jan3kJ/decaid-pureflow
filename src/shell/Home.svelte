<script lang="ts">
  import PageHeader from './PageHeader.svelte';
  import type { Skin } from './skin.svelte';
  import ShotView from './ShotView.svelte';

  interface Props {
    skin: Skin;
  }

  let { skin }: Props = $props();
</script>

<!-- The menu and the state line only: the profile and bean are in the right column. -->
{#snippet header()}
  <PageHeader {skin} heat="group" />
{/snippet}

<div class="home">
  <!-- Home is the shot screen: the graph and the right column, live while a shot runs;
       the column starts at the page's top, beside the header. Hot water and flush
       cover the graph's frame (App.svelte). -->
  <ShotView {skin} top={header} />
</div>

<style>
  .home {
    height: 100%;
    box-sizing: border-box;
    padding: 0.8rem var(--space-3) 1rem;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
